const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

// Tumia Port inayotolewa na Render, au 5000 kwa local testing
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve public folder
app.use(express.static(path.join(__dirname, "public")));

// Simple API test
app.get("/api/status", (req, res) => {
    res.json({
        success: true,
        message: "Video Streaming Server iko online"
    });
});

// Endpoint maalum ya kuzuia server kulala (Ping route)
app.get("/ping", (req, res) => {
    res.status(200).send("Server is active!");
});

// ========================================
// WEBSOCKET SIGNALING SERVER
// ========================================

const wss = new WebSocket.Server({ server });

// Rooms
const rooms = new Map();

wss.on("connection", (ws) => {
    console.log("New WebSocket connection");

    ws.room = null;

    ws.on("message", (data) => {
        try {
            const message = JSON.parse(data.toString());

            // -------------------------
            // JOIN ROOM
            // -------------------------
            if (message.type === "join") {
                const roomId = message.room;

                if (!roomId) {
                    ws.send(JSON.stringify({
                        type: "error",
                        message: "Room ID haipo"
                    }));
                    return;
                }

                ws.room = roomId;

                // Create room if doesn't exist
                if (!rooms.has(roomId)) {
                    rooms.set(roomId, new Set());
                }

                const room = rooms.get(roomId);

                // Maximum 2 people for this simple version
                if (room.size >= 2) {
                    ws.send(JSON.stringify({
                        type: "room-full",
                        message: "Room imejaa. Kwa sasa watu wawili tu."
                    }));
                    return;
                }

                // Add user
                room.add(ws);

                console.log(
                    `User joined room: ${roomId}. Users: ${room.size}`
                );

                // Tell new user how many people are in room
                ws.send(JSON.stringify({
                    type: "joined",
                    room: roomId,
                    users: room.size
                }));

                // If another person is already there
                if (room.size > 1) {
                    room.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({
                                type: "user-joined"
                            }));
                        }
                    });
                }

                return;
            }

            // -------------------------
            // SIGNALING MESSAGE
            // -------------------------
            if (message.type === "signal") {

                if (!ws.room) {
                    return;
                }

                const room = rooms.get(ws.room);

                if (!room) {
                    return;
                }

                // Send signal to everyone else in same room
                room.forEach((client) => {
                    if (
                        client !== ws &&
                        client.readyState === WebSocket.OPEN
                    ) {
                        client.send(JSON.stringify({
                            type: "signal",
                            data: message.data
                        }));
                    }
                });

                return;
            }

        } catch (error) {
            console.error("WebSocket message error:", error);
        }
    });

    // -------------------------
    // USER DISCONNECT
    // -------------------------
    ws.on("close", () => {

        if (!ws.room) {
            return;
        }

        const room = rooms.get(ws.room);

        if (!room) {
            return;
        }

        room.delete(ws);

        console.log(
            `User left room: ${ws.room}. Users: ${room.size}`
        );

        // Tell remaining users
        room.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                    type: "user-left"
                }));
            }
        });

        // Delete empty room
        if (room.size === 0) {
            rooms.delete(ws.room);
        }
    });

    ws.on("error", (error) => {
        console.error("WebSocket error:", error);
    });
});

// ========================================
// START SERVER & KEEP-ALIVE MECHANISM
// ========================================

server.listen(PORT, () => {
    console.log("");
    console.log("====================================");
    console.log(" VIDEO STREAMING SERVER");
    console.log("====================================");
    console.log(`Server running on port: ${PORT}`);
    console.log("====================================");
    console.log("");

    // Self-ping system ya kuzuia Render kulaza server (dakika 14 interval)
    const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; // Render huweka hii kiotomatiki
    
    if (RENDER_EXTERNAL_URL) {
        const FOURTEEN_MINUTES = 14 * 60 * 1000;
        setInterval(() => {
            http.get(`${RENDER_EXTERNAL_URL}/ping`, (res) => {
                console.log(`Self-ping successful: Status ${res.statusCode}`);
            }).on("error", (err) => {
                console.error("Self-ping failed:", err.message);
            });
        }, FOURTEEN_MINUTES);
    }
});