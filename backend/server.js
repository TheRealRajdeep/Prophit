import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import { checkUsername } from "./routes/ens.js";
import {
  getStreamerByChannel,
  getStreamerChannels,
} from "./routes/streamer.js";
import { getUser, postUser } from "./routes/user.js";
import {
  addMessage,
  getAllMessages,
  addPresence,
  removePresence,
  heartbeat,
  getViewers,
} from "./chat-store.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/user", getUser);
app.post("/api/user", postUser);
app.get("/api/streamer", getStreamerByChannel);
app.get("/api/streamer/channels", getStreamerChannels);
app.get("/api/ens/check-username", checkUsername);

/** GET /api/chat/:channel - Fetch chat messages */
app.get("/api/chat/:channel", (req, res) => {
  const channel = req.params.channel?.trim().toLowerCase();
  if (!channel) return res.status(400).json({ error: "Channel required" });
  const messages = getAllMessages(channel);
  return res.json({ messages });
});

/** GET /api/chat/:channel/viewers - Fetch presence (streamer, moderators, viewers) */
app.get("/api/chat/:channel/viewers", (req, res) => {
  const channel = req.params.channel?.trim().toLowerCase();
  if (!channel) return res.status(400).json({ error: "Channel required" });
  const streamerAddress = req.query.streamerAddress;
  const modsParam = req.query.moderators;
  const moderatorAddresses = Array.isArray(modsParam)
    ? modsParam
    : typeof modsParam === "string"
      ? modsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  const viewers = getViewers(
    channel,
    streamerAddress || null,
    moderatorAddresses,
  );
  return res.json(viewers);
});

app.get("/health", (_, res) => res.json({ ok: true }));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: true },
});

io.on("connection", (socket) => {
  socket.on("chat:join", ({ channel, address, username, role }) => {
    const key = (channel || "").trim().toLowerCase();
    if (!key) return;
    socket.join(`chat:${key}`);
    addPresence(key, socket.id, { address, username, role: role || "viewer" });
    socket.channelKey = key;
    socket.userInfo = { address, username, role };
  });

  socket.on(
    "chat:message",
    ({
      channel,
      address,
      username,
      displayName,
      message,
      isStreamer,
      isMod,
      mentions,
    }) => {
      const key = (channel || "").trim().toLowerCase();
      if (!key) return;
      const trimmed = (message || "").trim();
      if (!trimmed) return;

      const msg = addMessage(key, {
        address,
        username: username || displayName,
        displayName: displayName || username,
        message: trimmed,
        isStreamer,
        isMod,
        mentions: mentions || [],
      });
      io.to(`chat:${key}`).emit("chat:message", msg);
    },
  );

  socket.on("chat:heartbeat", ({ channel }) => {
    const key = (channel || socket.channelKey || "").trim().toLowerCase();
    if (key) heartbeat(key, socket.id);
  });

  socket.on("disconnect", () => {
    const key = socket.channelKey;
    if (key) removePresence(key, socket.id);
  });
});

app.set("io", io);
app.set("getViewers", (channelKey, streamerAddress, moderatorAddresses) =>
  getViewers(channelKey, streamerAddress, moderatorAddresses),
);

httpServer.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
