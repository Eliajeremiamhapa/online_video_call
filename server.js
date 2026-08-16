const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (req, res) => {
    res.json({ success: true, message: "Video Streaming Server iko online" });
});

app.get("/ping", (req, res) => {
    res.status(200).send("Server is active!");
});

const wss = new WebSocket.Server({ server });
const rooms = new Map();

wss.on("connection", (ws) => {
    ws.room = null;
    ws.id = null;

    ws.on("message", (rawMessage) => {
        try {
            const message = JSON.parse(rawMessage.toString());

            // JOIN ROOM
            if (message.type === "join") {
                const { room: roomId, userId, userName } = message;

                if (!roomId || !userId) {
                    ws.send(JSON.stringify({ type: "error", message: "Taarifa za room au mtumiaji hazijakamilika" }));
                    return;
                }

                ws.room = roomId;
                ws.id = userId;
                ws.userName = userName || "Participant";

                if (!rooms.has(roomId)) {
                    rooms.set(roomId, new Map());
                }

                const room = rooms.get(roomId);
                
                // Mfahamishe mtumiaji mpya kuhusu washiriki waliopo kabla yake
                const existingUsers = [];
                room.forEach((client, id) => {
                    existingUsers.push({ id, name: client.userName });
                });

                room.set(userId, ws);

                ws.send(JSON.stringify({
                    type: "joined",
                    room: roomId,
                    users: existingUsers
                }));

                // Wajulishe wengine kuwa mtumiaji mpya ameingia
                broadcastToRoom(roomId, ws, {
                    type: "user-joined",
                    userId: ws.id,
                    userName: ws.userName
                });
                return;
            }

            // SIGNALING (Offer, Answer, ICE Candidates Target-Specific)
            if (message.type === "signal") {
                const { target, data } = message;
                if (!ws.room) return;
                const room = rooms.get(ws.room);
                if (room && room.has(target)) {
                    const targetClient = room.get(target);
                    if (targetClient.readyState === WebSocket.OPEN) {
                        targetClient.send(JSON.stringify({
                            type: "signal",
                            sender: ws.id,
                            data: data
                        }));
                    }
                }
                return;
            }

            // CHAT MESSAGES & RAISE HAND BROADCAST
            if (message.type === "chat" || message.type === "raise-hand") {
                if (!ws.room) return;
                broadcastToRoom(ws.room, null, {
                    ...message,
                    senderId: ws.id,
                    senderName: ws.userName
                });
                return;
            }

        } catch (error) {
            console.error("WebSocket Error:", error);
        }
    });

    ws.on("close", () => {
        if (!ws.room || !ws.id) return;
        const room = rooms.get(ws.room);
        if (room) {
            room.delete(ws.id);
            broadcastToRoom(ws.room, ws, {
                type: "user-left",
                userId: ws.id
            });

            if (room.size === 0) {
                rooms.delete(ws.room);
            }
        }
    });
});

function broadcastToRoom(roomId, senderWs, payload) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.forEach((client) => {
        if (client !== senderWs && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(payload));
        }
    });
}

// KEEP-ALIVE SERVER ON RENDER
server.listen(PORT, () => {
    console.log(`Server running on port: ${PORT}`);
    const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
    if (RENDER_EXTERNAL_URL) {
        setInterval(() => {
            http.get(`${RENDER_EXTERNAL_URL}/ping`, (res) => {
                console.log(`Self-ping status: ${res.statusCode}`);
            }).on("error", (err) => {
                console.error("Self-ping failed:", err.message);
            });
        }, 14 * 60 * 1000);
    }
});
