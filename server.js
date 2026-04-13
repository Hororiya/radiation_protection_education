/**
 * NAF Signaling Server
 * WebSocket server for Networked-Aframe multiplayer connections
 */

const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: {
        origin: (origin, callback) => {
            // Allow all origins for dev simplicity
            callback(null, true);
        },
        methods: ["GET", "POST"],
        credentials: true
    }
});

const PORT = process.env.NAF_PORT || 8080;

// Track rooms and their occupants
const rooms = new Map();
const voiceRooms = new Map();

function getRoomName(data) {
    const raw = data && typeof data === 'object' ? data.room : data;
    return String(raw || "default");
}

function getVoiceRoom(roomName) {
    if (!voiceRooms.has(roomName)) {
        voiceRooms.set(roomName, new Set());
    }
    return voiceRooms.get(roomName);
}

function removeVoiceUser(socket, roomName) {
    const occupants = voiceRooms.get(roomName);
    if (!occupants || !occupants.has(socket.id)) return;

    occupants.delete(socket.id);
    socket.to(roomName).emit('voice-user-left', { id: socket.id });

    if (occupants.size === 0) {
        voiceRooms.delete(roomName);
    }
}

function removeVoiceUserFromAllRooms(socket) {
    voiceRooms.forEach((_occupants, roomName) => {
        removeVoiceUser(socket, roomName);
    });
}

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Handle room join
    socket.on('joinRoom', (data) => {
        console.log('DEBUG: joinRoom received payload type:', typeof data);
        console.log('DEBUG: joinRoom received payload:', JSON.stringify(data));

        // NAF adapter versions vary
        const roomName = getRoomName(data);

        socket.join(roomName);
        
        // Track occupants
        if (!rooms.has(roomName)) {
            rooms.set(roomName, new Set());
        }
        rooms.get(roomName).add(socket.id);
        
        console.log(`User ${socket.id} joined room: ${roomName}`);
        console.log(`Room ${roomName} occupants:`, Array.from(rooms.get(roomName)));
        
        // Notify others in the room
        socket.to(roomName).emit('userJoined', socket.id);
        
        // Send list of current occupants to the new user
        socket.emit('roomOccupants', Array.from(rooms.get(roomName)));
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        removeVoiceUserFromAllRooms(socket);
        
        // Remove from all rooms
        rooms.forEach((occupants, roomName) => {
            if (occupants.has(socket.id)) {
                occupants.delete(socket.id);
                socket.to(roomName).emit('userLeft', socket.id);
                console.log(`Room ${roomName} occupants:`, Array.from(occupants));
                
                // Clean up empty rooms
                if (occupants.size === 0) {
                    rooms.delete(roomName);
                }
            }
        });
    });

    // Forward NAF messages
    socket.on('send', (data) => {
        // NAF "send" is point-to-point (to a specific client).
        // If we broadcast to the whole room, every client will process messages
        // that are not intended for it and NAF state will break.
        try {
            const targetId = data && data.to;
            if (targetId) {
                io.to(targetId).emit('receive', data);
            } else if (data && data.room) {
                // Fallback (should be rare): broadcast to room
                socket.to(data.room).emit('receive', data);
            } else {
                console.warn('WARN: send payload missing "to" and "room":', data);
            }
        } catch (e) {
            console.error('ERROR: failed to forward send packet', e);
        }
    });

    // Broadcast to room
    socket.on('broadcast', (data) => {
        socket.to(data.room).emit('broadcast', data);
    });

    // Lightweight WebRTC audio signaling. The media still flows peer-to-peer;
    // this server only helps clients discover voice participants and exchange SDP/ICE.
    socket.on('voice-ready', (data) => {
        const roomName = getRoomName(data);
        const enabled = !!(data && data.enabled);

        if (!enabled) {
            removeVoiceUser(socket, roomName);
            return;
        }

        const occupants = getVoiceRoom(roomName);
        occupants.add(socket.id);

        const peers = Array.from(occupants).filter((id) => id !== socket.id);
        socket.emit('voice-users', { room: roomName, users: peers });
        socket.to(roomName).emit('voice-user-joined', { id: socket.id });
    });

    socket.on('voice-offer', (data) => {
        if (!data || !data.to) return;
        io.to(data.to).emit('voice-offer', {
            from: socket.id,
            room: getRoomName(data),
            sdp: data.sdp,
        });
    });

    socket.on('voice-answer', (data) => {
        if (!data || !data.to) return;
        io.to(data.to).emit('voice-answer', {
            from: socket.id,
            room: getRoomName(data),
            sdp: data.sdp,
        });
    });

    socket.on('voice-ice', (data) => {
        if (!data || !data.to || !data.candidate) return;
        io.to(data.to).emit('voice-ice', {
            from: socket.id,
            room: getRoomName(data),
            candidate: data.candidate,
        });
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        rooms: Array.from(rooms.keys()),
        totalConnections: io.engine.clientsCount
    });
});

// Listen on all interfaces
http.listen(PORT, "0.0.0.0", () => {
    console.log(`NAF Signaling Server (Socket.io) running on http://localhost:${PORT}`);
    console.log(`Health check available at http://localhost:${PORT}/health`);
});
