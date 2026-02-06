import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

/**
 * GET /api/ens/check-username?username=alice
 * Returns { taken: true } if any user already has this ensDomain, else { taken: false }.
 */
export async function checkUsername(req, res) {
  const username = req.query.username;
  if (!username || typeof username !== "string") {
    return res
      .status(400)
      .json({ error: "Valid username query parameter is required" });
  }

  const normalized = username.trim().toLowerCase();
  if (!normalized) {
    return res.status(400).json({ error: "Username is required" });
  }

  try {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.ensDomain, normalized))
      .limit(1);

    return res.json({ taken: !!existing });
  } catch (e) {
    console.error("GET /api/ens/check-username error:", e);
    return res.status(500).json({ error: "Failed to check username" });
  }
}
