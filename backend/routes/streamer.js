import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

/**
 * GET /api/streamer?channel=ChannelName
 * Returns the streamer (channel owner) for the given Twitch channel name.
 * A streamer is a user with isStreamer true and this channel in moderatorsFor.
 */
export async function getStreamerByChannel(req, res) {
  const channel = req.query.channel;
  if (!channel || typeof channel !== "string") {
    return res
      .status(400)
      .json({ error: "Query parameter 'channel' is required" });
  }

  const normalized = channel.trim().toLowerCase();
  if (!normalized) {
    return res.status(400).json({ error: "Channel cannot be empty" });
  }

  try {
    const rows = await db
      .select({
        metamaskAddress: users.metamaskAddress,
        ensDomain: users.ensDomain,
        moderatorsFor: users.moderatorsFor,
      })
      .from(users)
      .where(eq(users.isStreamer, true));

    const streamerRow = rows.find(
      (r) =>
        Array.isArray(r.moderatorsFor) &&
        r.moderatorsFor.some(
          (c) => typeof c === "string" && c.trim().toLowerCase() === normalized,
        ),
    );

    if (!streamerRow) {
      return res.status(404).json(null);
    }

    return res.json({
      address: streamerRow.metamaskAddress,
      ensDomain: streamerRow.ensDomain ?? undefined,
    });
  } catch (e) {
    console.error("GET /api/streamer error:", e);
    return res.status(500).json({ error: "Failed to fetch streamer" });
  }
}
