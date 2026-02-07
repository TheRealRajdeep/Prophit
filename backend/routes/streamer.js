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
        privyAddress: users.privyAddress,
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
      address: streamerRow.privyAddress,
      ensDomain: streamerRow.ensDomain ?? undefined,
    });
  } catch (e) {
    console.error("GET /api/streamer error:", e);
    return res.status(500).json({ error: "Failed to fetch streamer" });
  }
}

/**
 * GET /api/streamer/channels
 * Returns all streamers with address -> channel mapping.
 * Used for mapping prediction streamer addresses to channel names (e.g. sidebar ongoing predictions).
 */
export async function getStreamerChannels(req, res) {
  try {
    const rows = await db
      .select({
        privyAddress: users.privyAddress,
        moderatorsFor: users.moderatorsFor,
      })
      .from(users)
      .where(eq(users.isStreamer, true));

    const mapping = rows
      .filter(
        (r) => Array.isArray(r.moderatorsFor) && r.moderatorsFor.length > 0,
      )
      .map((r) => ({
        address: r.privyAddress.toLowerCase(),
        channel: r.moderatorsFor[0],
      }));

    return res.json(mapping);
  } catch (e) {
    console.error("GET /api/streamer/channels error:", e);
    return res.status(500).json({ error: "Failed to fetch streamer channels" });
  }
}
