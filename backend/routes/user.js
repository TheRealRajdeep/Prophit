import { and, eq, ne, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
function isAddress(value) {
  return typeof value === "string" && ETH_ADDRESS_REGEX.test(value);
}

/**
 * GET /api/user?address=0x...
 * Returns the user for the given wallet address, or 404.
 */
export async function getUser(req, res) {
  const address = req.query.address;
  if (!address || !isAddress(address)) {
    return res
      .status(400)
      .json({ error: "Valid address query parameter is required" });
  }

  try {
    const normalized = address.toLowerCase();
    const [user] = await db
      .select()
      .from(users)
      .where(
        or(
          eq(users.metamaskAddress, normalized),
          eq(users.privyAddress, normalized),
        ),
      );

    if (!user) {
      return res.status(404).json(null);
    }

    return res.json({
      id: user.id,
      metamaskAddress: user.metamaskAddress,
      privyAddress: user.privyAddress,
      ensDomain: user.ensDomain,
      isStreamer: user.isStreamer,
      moderatorsFor: user.moderatorsFor ?? [],
    });
  } catch (e) {
    console.error("GET /api/user error:", e);
    return res.status(500).json({ error: "Failed to fetch user" });
  }
}

/**
 * POST /api/user
 * Create or update user. Requires Authorization: Bearer <token>.
 * Body: { metamaskAddress, privyAddress, ensDomain?, isStreamer?, moderatorsFor? }
 */
export async function postUser(req, res) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
  }

  const body = req.body;
  const {
    metamaskAddress,
    privyAddress,
    ensDomain,
    isStreamer,
    moderatorsFor,
  } = body ?? {};
  if (!metamaskAddress || typeof metamaskAddress !== "string") {
    return res.status(400).json({ error: "metamaskAddress is required" });
  }
  if (!privyAddress || typeof privyAddress !== "string") {
    return res.status(400).json({ error: "privyAddress is required" });
  }
  if (!isAddress(metamaskAddress)) {
    return res
      .status(400)
      .json({ error: "metamaskAddress is not a valid Ethereum address" });
  }
  if (!isAddress(privyAddress)) {
    return res
      .status(400)
      .json({ error: "privyAddress is not a valid Ethereum address" });
  }

  const normalizedAddress = metamaskAddress.toLowerCase();
  const normalizedPrivyAddress = privyAddress.toLowerCase();

  try {
    // If setting ensDomain, ensure no other user already has it
    if (ensDomain != null && String(ensDomain).trim() !== "") {
      const normalizedEns = String(ensDomain).trim().toLowerCase();
      const [otherUser] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.ensDomain, normalizedEns),
            ne(users.metamaskAddress, normalizedAddress),
          ),
        )
        .limit(1);
      if (otherUser) {
        return res
          .status(409)
          .json({ error: "Username already taken", code: "ENS_TAKEN" });
      }
    }

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.metamaskAddress, normalizedAddress));

    const payload = {
      metamaskAddress: normalizedAddress,
      privyAddress: normalizedPrivyAddress,
      ensDomain: ensDomain ?? null,
      isStreamer: isStreamer ?? false,
      moderatorsFor: Array.isArray(moderatorsFor) ? moderatorsFor : [],
    };

    if (existing) {
      await db
        .update(users)
        .set({
          privyAddress: normalizedPrivyAddress,
          ensDomain: payload.ensDomain,
          isStreamer: payload.isStreamer,
          moderatorsFor: payload.moderatorsFor,
        })
        .where(eq(users.metamaskAddress, normalizedAddress));
    } else {
      await db.insert(users).values(payload);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/user error:", e);
    return res.status(500).json({ error: "Failed to save user" });
  }
}
