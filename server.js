const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const git = simpleGit();

const PORT = 3000;
const ISSUES_FILE = path.join(__dirname, 'data', 'issues.json');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Initialize data files
function initializeDataFiles() {
    if (!fs.existsSync('data')) {
        fs.mkdirSync('data');
    }
    if (!fs.existsSync(ISSUES_FILE)) {
        fs.writeFileSync(ISSUES_FILE, JSON.stringify({ issues: [] }, null, 2));
    }
    if (!fs.existsSync(USERS_FILE)) {
        fs.writeFileSync(USERS_FILE, JSON.stringify({ users: [] }, null, 2));
    }
}

// Git commit helper
async function commitToGit(message, filePath) {
    try {
        await git.add(filePath);
        await git.commit(message);
        console.log(`Git commit: ${message}`);
    } catch (error) {
        console.error('Git commit error:', error);
    }
}

// Read issues from JSON
function readIssues() {
    const data = fs.readFileSync(ISSUES_FILE, 'utf8');
    return JSON.parse(data);
}

// Write issues to JSON
function writeIssues(data) {
    fs.writeFileSync(ISSUES_FILE, JSON.stringify(data, null, 2));
}

// Read users from JSON
function readUsers() {
    const data = fs.readFileSync(USERS_FILE, 'utf8');
    return JSON.parse(data);
}

// Write users to JSON
function writeUsers(data) {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2));
}

// Initialize
initializeDataFiles();

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // User joins
    socket.on('user:join', (username) => {
        socket.username = username;
        
        const usersData = readUsers();
        const existingUser = usersData.users.find(u => u.username === username);
        
        if (!existingUser) {
            usersData.users.push({
                username: username,
                socketId: socket.id,
                joinedAt: new Date().toISOString()
            });
            writeUsers(usersData);
            commitToGit(`User joined: ${username}`, USERS_FILE);
        }

        // Send all issues to the new user
        const issuesData = readIssues();
        socket.emit('issues:all', issuesData.issues);
        
        // Broadcast user joined
        io.emit('user:joined', { username, timestamp: new Date().toISOString() });
    });

    // Create new issue
    socket.on('issue:create', async (issueData) => {
        const issuesData = readIssues();
        
        const newIssue = {
            id: Date.now().toString(),
            title: issueData.title,
            description: issueData.description,
            status: 'open',
            creator: socket.username,
            createdAt: new Date().toISOString(),
            comments: []
        };

        issuesData.issues.push(newIssue);
        writeIssues(issuesData);
        
        await commitToGit(
            `Issue created: ${newIssue.title} by ${socket.username}`,
            ISSUES_FILE
        );

        // Broadcast to all clients
        io.emit('issue:created', newIssue);
    });

    // Update issue status
    socket.on('issue:updateStatus', async (data) => {
        const issuesData = readIssues();
        const issue = issuesData.issues.find(i => i.id === data.issueId);

        if (issue && issue.creator === socket.username) {
            const oldStatus = issue.status;
            issue.status = data.status;
            issue.updatedAt = new Date().toISOString();
            
            writeIssues(issuesData);
            
            await commitToGit(
                `Issue status updated: ${issue.title} from ${oldStatus} to ${data.status} by ${socket.username}`,
                ISSUES_FILE
            );

            // Broadcast to all clients
            io.emit('issue:statusUpdated', {
                issueId: data.issueId,
                status: data.status,
                updatedBy: socket.username,
                timestamp: issue.updatedAt
            });
        } else {
            socket.emit('error', {
                message: 'Only the issue creator can update the status'
            });
        }
    });

    // Add comment
    socket.on('issue:addComment', async (data) => {
        const issuesData = readIssues();
        const issue = issuesData.issues.find(i => i.id === data.issueId);

        if (issue) {
            const newComment = {
                id: Date.now().toString(),
                author: socket.username,
                text: data.text,
                createdAt: new Date().toISOString()
            };

            issue.comments.push(newComment);
            writeIssues(issuesData);
            
            await commitToGit(
                `Comment added to issue: ${issue.title} by ${socket.username}`,
                ISSUES_FILE
            );

            // Broadcast to all clients
            io.emit('issue:commentAdded', {
                issueId: data.issueId,
                comment: newComment
            });
        }
    });

    // Delete issue
    socket.on('issue:delete', async (issueId) => {
        const issuesData = readIssues();
        const issueIndex = issuesData.issues.findIndex(i => i.id === issueId);
        
        if (issueIndex !== -1) {
            const issue = issuesData.issues[issueIndex];
            
            if (issue.creator === socket.username) {
                issuesData.issues.splice(issueIndex, 1);
                writeIssues(issuesData);
                
                await commitToGit(
                    `Issue deleted: ${issue.title} by ${socket.username}`,
                    ISSUES_FILE
                );

                io.emit('issue:deleted', issueId);
            } else {
                socket.emit('error', {
                    message: 'Only the issue creator can delete the issue'
                });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (socket.username) {
            io.emit('user:left', {
                username: socket.username,
                timestamp: new Date().toISOString()
            });
        }
    });
});

// Start server
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
