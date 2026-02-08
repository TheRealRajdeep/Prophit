/**
 * In-memory chat store: messages and presence per channel.
 * For production, replace with Redis or DB.
 */

const MAX_MESSAGES = 500;
const PRESENCE_TTL_MS = 60_000; // 1 min without heartbeat = offline

const channels = new Map();
const presence = new Map(); // channel -> Map<socketId, { address, username, role, lastSeen }>

function getChannel(channelKey) {
  let ch = channels.get(channelKey);
  if (!ch) {
    ch = { messages: [] };
    channels.set(channelKey, ch);
  }
  return ch;
}

function getPresence(channelKey) {
  let p = presence.get(channelKey);
  if (!p) {
    p = new Map();
    presence.set(channelKey, p);
  }
  return p;
}

function hashColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 70%, 65%)`;
}

export function addMessage(
  channelKey,
  { address, username, displayName, message, isStreamer, isMod, mentions = [] },
) {
  const ch = getChannel(channelKey);
  const color = hashColor(username || address || "anon");
  const msg = {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    username: username || "anon",
    displayName:
      displayName || username || truncateAddress(address) || "Anonymous",
    address: address || null,
    color,
    message,
    timestamp: Date.now(),
    isStreamer: !!isStreamer,
    isMod: !!isMod,
    mentions: Array.isArray(mentions) ? mentions : [],
  };
  ch.messages.push(msg);
  if (ch.messages.length > MAX_MESSAGES)
    ch.messages = ch.messages.slice(-MAX_MESSAGES);
  return msg;
}

export function getMessages(channelKey, since = 0) {
  const ch = getChannel(channelKey);
  return ch.messages.filter((m) => m.timestamp > since);
}

export function getAllMessages(channelKey) {
  const ch = getChannel(channelKey);
  return [...ch.messages];
}

export function addPresence(channelKey, socketId, { address, username, role }) {
  const p = getPresence(channelKey);
  p.set(socketId, {
    address: address || null,
    username: username || null,
    role: role || "viewer",
    lastSeen: Date.now(),
  });
}

export function removePresence(channelKey, socketId) {
  const p = getPresence(channelKey);
  p.delete(socketId);
}

export function heartbeat(channelKey, socketId) {
  const p = getPresence(channelKey);
  const entry = p.get(socketId);
  if (entry) entry.lastSeen = Date.now();
}

export function getViewers(
  channelKey,
  streamerAddress,
  moderatorAddresses = [],
) {
  const p = getPresence(channelKey);
  const now = Date.now();
  const result = { streamer: [], moderators: [], viewers: [] };

  for (const [sid, entry] of p) {
    if (now - entry.lastSeen > PRESENCE_TTL_MS) {
      p.delete(sid);
      continue;
    }
    const addr = entry.address?.toLowerCase();
    const isStreamer =
      streamerAddress && addr === streamerAddress.toLowerCase();
    const isMod = moderatorAddresses.some((m) => m?.toLowerCase() === addr);

    const user = {
      socketId: sid,
      address: entry.address,
      username:
        entry.username ||
        (entry.address ? truncateAddress(entry.address) : "Anonymous"),
    };
    if (isStreamer) result.streamer.push(user);
    else if (isMod) result.moderators.push(user);
    else result.viewers.push(user);
  }

  return result;
}

function truncateAddress(addr) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
