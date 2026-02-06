import "dotenv/config";
import express from "express";
import cors from "cors";
import { checkUsername } from "./routes/ens.js";
import { getStreamerByChannel } from "./routes/streamer.js";
import { getUser, postUser } from "./routes/user.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/api/user", getUser);
app.post("/api/user", postUser);
app.get("/api/streamer", getStreamerByChannel);
app.get("/api/ens/check-username", checkUsername);

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
