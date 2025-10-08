const socket = io();

let currentUsername = '';
let currentFilter = 'all';
let allIssues = [];

// DOM Elements
const loginSection = document.getElementById('loginSection');
const appSection = document.getElementById('appSection');
const usernameInput = document.getElementById('usernameInput');
const joinBtn = document.getElementById('joinBtn');
const currentUserSpan = document.getElementById('currentUser');
const issueTitle = document.getElementById('issueTitle');
const issueDescription = document.getElementById('issueDescription');
const createIssueBtn = document.getElementById('createIssueBtn');
const issuesList = document.getElementById('issuesList');
const filterBtns = document.querySelectorAll('.filter-btn');

// Join handler
joinBtn.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username) {
        currentUsername = username;
        socket.emit('user:join', username);
        loginSection.classList.add('hidden');
        appSection.classList.remove('hidden');
        currentUserSpan.textContent = username;
    }
});

usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        joinBtn.click();
    }
});

// Create issue handler
createIssueBtn.addEventListener('click', () => {
    const title = issueTitle.value.trim();
    const description = issueDescription.value.trim();

    if (title && description) {
        socket.emit('issue:create', { title, description });
        issueTitle.value = '';
        issueDescription.value = '';
        showNotification('Issue created successfully', 'success');
    }
});

// Filter handlers
filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderIssues();
    });
});

// Socket event listeners
socket.on('issues:all', (issues) => {
    allIssues = issues;
    renderIssues();
});

socket.on('issue:created', (issue) => {
    allIssues.unshift(issue);
    renderIssues();
    showNotification(`New issue created: ${issue.title}`, 'info');
});

socket.on('issue:statusUpdated', (data) => {
    const issue = allIssues.find(i => i.id === data.issueId);
    if (issue) {
        issue.status = data.status;
        renderIssues();
        showNotification(`Issue status updated to ${data.status}`, 'success');
    }
});

socket.on('issue:commentAdded', (data) => {
    const issue = allIssues.find(i => i.id === data.issueId);
    if (issue) {
        issue.comments.push(data.comment);
        renderIssues();
        showNotification('New comment added', 'info');
    }
});

socket.on('issue:deleted', (issueId) => {
    allIssues = allIssues.filter(i => i.id !== issueId);
    renderIssues();
    showNotification('Issue deleted', 'info');
});

socket.on('user:joined', (data) => {
    showNotification(`${data.username} joined`, 'info');
});

socket.on('user:left', (data) => {
    showNotification(`${data.username} left`, 'info');
});

socket.on('error', (data) => {
    showNotification(data.message, 'error');
});

// Render issues
function renderIssues() {
    const filteredIssues = currentFilter === 'all' 
        ? allIssues 
        : allIssues.filter(issue => issue.status === currentFilter);

    if (filteredIssues.length === 0) {
        issuesList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); padding: 40px;">No issues found</p>';
        return;
    }

    issuesList.innerHTML = filteredIssues.map(issue => `
        <div class="issue-card">
            <div class="issue-header">
                <div>
                    <div class="issue-title">${escapeHtml(issue.title)}</div>
                    <div class="issue-meta">Created by ${escapeHtml(issue.creator)} • ${formatDate(issue.createdAt)}</div>
                </div>
                <div class="status-container">
                    ${issue.creator === currentUsername ? `
                        <select class="status-select" onchange="updateStatus('${issue.id}', this.value)">
                            <option value="open" ${issue.status === 'open' ? 'selected' : ''}>Open</option>
                            <option value="on-going" ${issue.status === 'on-going' ? 'selected' : ''}>On-going</option>
                            <option value="closed" ${issue.status === 'closed' ? 'selected' : ''}>Closed</option>
                        </select>
                    ` : `
                        <span class="status-badge ${issue.status}">${issue.status}</span>
                    `}
                </div>
            </div>
            
            <div class="issue-description">${escapeHtml(issue.description)}</div>
            
            <div class="comments-section">
                <strong>Comments (${issue.comments.length})</strong>
                ${issue.comments.map(comment => `
                    <div class="comment">
                        <div class="comment-author">${escapeHtml(comment.author)}</div>
                        <div class="comment-text">${escapeHtml(comment.text)}</div>
                    </div>
                `).join('')}
                
                <div class="comment-form">
                    <input type="text" class="comment-input" id="comment-${issue.id}" placeholder="Add a comment..." />
                    <button class="comment-btn" onclick="addComment('${issue.id}')">Comment</button>
                </div>
            </div>
            
            ${issue.creator === currentUsername ? `
                <div class="issue-actions">
                    <button class="delete-btn" onclick="deleteIssue('${issue.id}')">Delete Issue</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

// Helper functions
function updateStatus(issueId, status) {
    socket.emit('issue:updateStatus', { issueId, status });
}

function addComment(issueId) {
    const input = document.getElementById(`comment-${issueId}`);
    const text = input.value.trim();
    
    if (text) {
        socket.emit('issue:addComment', { issueId, text });
        input.value = '';
    }
}

function deleteIssue(issueId) {
    if (confirm('Are you sure you want to delete this issue?')) {
        socket.emit('issue:delete', issueId);
    }
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.getElementById('notifications').appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
