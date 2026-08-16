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

    ws.on("message", (data) => {
        try {
            const message = JSON.parse(data.toString());

            // JOIN ROOM
            if (message.type === "join") {
                const roomId = message.room;

                if (!roomId) {
                    ws.send(JSON.stringify({ type: "error", message: "Room ID haipo" }));
                    return;
                }

                ws.room = roomId;

                if (!rooms.has(roomId)) {
                    rooms.set(roomId, new Set());
                }

                const room = rooms.get(roomId);

                if (room.size >= 2) {
                    ws.send(JSON.stringify({
                        type: "room-full",
                        message: "Room imejaa. Kwa sasa ni ya watu wawili tu."
                    }));
                    return;
                }

                room.add(ws);

                ws.send(JSON.stringify({
                    type: "joined",
                    room: roomId,
                    users: room.size
                }));

                // Mjulishe mtu wa kwanza kuwa mshiriki mpya ameingia
                if (room.size > 1) {
                    room.forEach((client) => {
                        if (client !== ws && client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: "user-joined" }));
                        }
                    });
                }
                return;
            }

            // SIGNALING (Offer, Answer, ICE Candidates)
            if (message.type === "signal") {
                if (!ws.room) return;
                const room = rooms.get(ws.room);
                if (!room) return;

                room.forEach((client) => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: "signal",
                            data: message.data
                        }));
                    }
                });
                return;
            }
        } catch (error) {
            console.error("WebSocket Error:", error);
        }
    });

    ws.on("close", () => {
        if (!ws.room) return;
        const room = rooms.get(ws.room);
        if (!room) return;

        room.delete(ws);

        room.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: "user-left" }));
            }
        });

        if (room.size === 0) {
            rooms.delete(ws.room);
        }
    });
});

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
