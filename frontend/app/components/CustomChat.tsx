"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { isAddress, type Address } from "viem";
import {
  usePredictions,
  getTopScorer,
  getPayout,
  getUserBetOutcome,
  getBiddersCount,
  getPredictionStartTime,
  predictionStatusLabel,
  isLive,
  canLock,
  canResolve,
  canCancel,
  usePlatformWallet,
  type Prediction,
} from "@/lib/hooks";
import { ensNameToUsername } from "@/lib/hooks/useEnsName";
import { fetchEnsUsernameForAddress } from "./SetUsernameModal";
import { getApiUrl, apiChatUrl, fetchApi } from "@/lib/api";

interface ChatMessage {
  id: string;
  username: string;
  displayName: string;
  address?: string | null;
  color: string;
  message: string;
  timestamp: number;
  isMod?: boolean;
  isStreamer?: boolean;
  isResolutionAnnouncement?: boolean;
  mentions?: string[];
}

interface Viewer {
  socketId: string;
  address?: string | null;
  username: string;
}

interface ViewersData {
  streamer: Viewer[];
  moderators: Viewer[];
  viewers: Viewer[];
}

const MAX_MESSAGES = 200;
const DEFAULT_USER_COLOR = "#b9bbbe";

function hashColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 70%, 65%)`;
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatUsdc(units: bigint): string {
  const usdc = Number(units) / 1e6;
  if (usdc >= 1e6) return `$${(usdc / 1e6).toFixed(1)}M`;
  if (usdc >= 1e3) return `$${(usdc / 1e3).toFixed(1)}k`;
  if (usdc >= 1) return `$${usdc.toFixed(2)}`;
  if (usdc >= 0.01) return `$${usdc.toFixed(2)}`;
  if (usdc > 0) return `$${usdc.toFixed(4)}`;
  return "$0.00";
}

function UsersIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function apiChatViewersUrl(channel: string, streamerAddress?: string | null, moderatorAddresses?: string[]): string {
  const base = getApiUrl().replace(/\/$/, "");
  const params = new URLSearchParams();
  if (streamerAddress) params.set("streamerAddress", streamerAddress);
  if (moderatorAddresses?.length) params.set("moderators", moderatorAddresses.join(","));
  const qs = params.toString();
  return `${base}/api/chat/${encodeURIComponent(channel)}/viewers${qs ? `?${qs}` : ""}`;
}

type CustomChatProps = {
  channel: string;
  className?: string;
  streamerAddress?: Address | null;
  streamerDisplayName?: string;
  moderatorAddresses?: Address[];
  canManagePredictions?: boolean;
  canAddModerators?: boolean;
  getWalletClient?: () => Promise<import("viem").WalletClient | null>;
  getWalletClientForBetting?: () => Promise<import("viem").WalletClient | null>;
};

export default function CustomChat({
  channel,
  className = "",
  streamerAddress = null,
  streamerDisplayName,
  moderatorAddresses = [],
  canManagePredictions = false,
  canAddModerators = false,
  getWalletClient,
  getWalletClientForBetting,
}: CustomChatProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "predictions">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [resolutionAnnouncements, setResolutionAnnouncements] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionCandidates, setMentionCandidates] = useState<{ username: string; role: string }[]>([]);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersData, setViewersData] = useState<ViewersData | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUserDisplayName, setCurrentUserDisplayName] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    address: string;
    displayName: string;
  } | null>(null);
  const [addingModerator, setAddingModerator] = useState(false);
  const [addModeratorError, setAddModeratorError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const { platformAddress } = usePlatformWallet();

  useEffect(() => {
    if (!platformAddress) {
      setCurrentUserDisplayName(null);
      return;
    }
    let cancelled = false;
    fetchEnsUsernameForAddress(platformAddress).then((raw) => {
      if (!cancelled) {
        setCurrentUserDisplayName(raw ? ensNameToUsername(raw) : truncateAddress(platformAddress));
      }
    });
    return () => { cancelled = true; };
  }, [platformAddress]);
  const {
    predictions: realPredictions,
    loading: predictionsLoading,
    error: predictionsError,
    createPrediction,
    lockPrediction,
    resolvePrediction,
    cancelPrediction,
    placeBet,
    claimWinnings,
    addStreamerModerator,
  } = usePredictions(streamerAddress ?? null, { getWalletClient, getWalletClientForBetting });

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, []);

  const handleResolveComplete = useCallback(
    async (prediction: Prediction, winningOption: 1 | 2) => {
      const winningLabel = winningOption === 1 ? prediction.option1 : prediction.option2;
      const top = await getTopScorer(prediction.id, winningOption);
      let topDisplay = "";
      if (top) {
        const raw = await fetchEnsUsernameForAddress(top.address);
        topDisplay = raw ? ensNameToUsername(raw) : truncateAddress(top.address);
      }
      const topMsg = top ? ` Top scorer: ${topDisplay} with ${formatUsdc(top.amount)}.` : "";
      const announcement: ChatMessage = {
        id: `resolution-${prediction.id}-${Date.now()}`,
        username: "system",
        displayName: "Prediction",
        color: "#F59E0B",
        message: `Prediction resolved! Winner: "${winningLabel}".${topMsg}`,
        timestamp: Date.now(),
        isResolutionAnnouncement: true,
      };
      setResolutionAnnouncements((prev) => [...prev.slice(-4), announcement]);
      setActiveTab("chat");
    },
    []
  );

  const fetchViewers = useCallback(async () => {
    try {
      const url = apiChatViewersUrl(
        channel,
        streamerAddress ?? undefined,
        moderatorAddresses?.map((a) => a as string) ?? []
      );
      const res = await fetchApi(url);
      if (res.ok) {
        const data = await res.json();
        setViewersData(data);
      }
    } catch {
      // ignore
    }
  }, [channel, streamerAddress, moderatorAddresses]);

  useEffect(() => {
    if (!channel?.trim()) return;
    fetchViewers();
    const interval = setInterval(fetchViewers, 5000);
    return () => clearInterval(interval);
  }, [channel, fetchViewers]);

  useEffect(() => {
    if (!channel?.trim()) {
      setStatus("error");
      setErrorMessage("No channel provided");
      return;
    }

    const apiUrl = getApiUrl().replace(/\/$/, "");
    const socket = io(apiUrl, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connected");
      setErrorMessage(null);
      const isStreamer = platformAddress && streamerAddress && platformAddress.toLowerCase() === streamerAddress.toLowerCase();
      const isMod = moderatorAddresses.some((m) => m?.toLowerCase() === platformAddress?.toLowerCase());
      socket.emit("chat:join", {
        channel: channel.trim().toLowerCase(),
        address: platformAddress,
        username: currentUserDisplayName || truncateAddress(platformAddress || "") || undefined,
        role: isStreamer ? "streamer" : isMod ? "moderator" : "viewer",
      });
    });

    socket.on("connect_error", () => {
      setStatus("error");
      setErrorMessage("Could not connect to chat");
    });

    socket.on("disconnect", () => {
      setStatus("connecting");
    });

    socket.on("chat:message", (msg: ChatMessage) => {
      setMessages((prev) => {
        const next = [...prev, msg];
        if (next.length > MAX_MESSAGES) return next.slice(-MAX_MESSAGES);
        return next;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [channel, platformAddress, streamerAddress, streamerDisplayName, moderatorAddresses, currentUserDisplayName]);

  useEffect(() => {
    const key = channel?.trim().toLowerCase();
    if (!key || !socketRef.current?.connected) return;
    const t = setInterval(() => {
      socketRef.current?.emit("chat:heartbeat", { channel: key });
    }, 30000);
    return () => clearInterval(t);
  }, [channel]);

  useEffect(() => {
    fetchApi(apiChatUrl(channel))
      .then((res) => res.ok ? res.json() : { messages: [] })
      .then((data) => {
        const msgs = data?.messages ?? [];
        setMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          const newOnes = msgs.filter((m: ChatMessage) => !ids.has(m.id));
          if (newOnes.length === 0) return prev;
          const next = [...prev, ...newOnes].sort((a, b) => a.timestamp - b.timestamp);
          if (next.length > MAX_MESSAGES) return next.slice(-MAX_MESSAGES);
          return next;
        });
      })
      .catch(() => { });
  }, [channel]);

  useEffect(() => scrollToBottom(), [messages, scrollToBottom]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener("click", close);
      window.addEventListener("scroll", close, true);
      return () => {
        window.removeEventListener("click", close);
        window.removeEventListener("scroll", close, true);
      };
    }
  }, [contextMenu]);

  const handleAddModerator = useCallback(
    async (address: string) => {
      if (!isAddress(address) || !addStreamerModerator || addingModerator) return;
      if (platformAddress && address.toLowerCase() === platformAddress.toLowerCase()) return;
      setAddingModerator(true);
      setAddModeratorError(null);
      setContextMenu(null);
      try {
        await addStreamerModerator(address as Address);
      } catch (err) {
        setAddModeratorError(err instanceof Error ? err.message : "Failed to add moderator");
      } finally {
        setAddingModerator(false);
      }
    },
    [addStreamerModerator, platformAddress, addingModerator]
  );

  const showAddModeratorContext = useCallback(
    (e: React.MouseEvent, address: string | null | undefined, displayName: string) => {
      if (!canAddModerators || !address || !isAddress(address)) return;
      if (platformAddress && address.toLowerCase() === platformAddress.toLowerCase()) return;
      e.preventDefault();
      e.stopPropagation();
      setAddModeratorError(null);
      setContextMenu({ x: e.clientX, y: e.clientY, address, displayName });
    },
    [canAddModerators, platformAddress]
  );

  const mentionableUsers = useCallback(() => {
    const seen = new Set<string>();
    const out: { username: string; role: string }[] = [];
    if (streamerDisplayName && !seen.has(streamerDisplayName.toLowerCase())) {
      seen.add(streamerDisplayName.toLowerCase());
      out.push({ username: streamerDisplayName, role: "Streamer" });
    }
    (viewersData?.moderators ?? []).forEach((v) => {
      const un = v.username || truncateAddress(v.address || "");
      if (un && !seen.has(un.toLowerCase())) {
        seen.add(un.toLowerCase());
        out.push({ username: un, role: "Moderator" });
      }
    });
    (viewersData?.viewers ?? []).forEach((v) => {
      const un = v.username || truncateAddress(v.address || "");
      if (un && !seen.has(un.toLowerCase())) {
        seen.add(un.toLowerCase());
        out.push({ username: un, role: "Viewer" });
      }
    });
    return out;
  }, [streamerDisplayName, viewersData]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInputValue(v);
    const atIdx = v.lastIndexOf("@");
    if (atIdx >= 0) {
      const after = v.slice(atIdx + 1);
      if (!/\s/.test(after)) {
        setMentionQuery(after.toLowerCase());
        return;
      }
    }
    setMentionQuery(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  };

  const insertMention = (username: string) => {
    const v = inputValue;
    const atIdx = v.lastIndexOf("@");
    if (atIdx >= 0) {
      const before = v.slice(0, atIdx);
      const after = v.slice(v.length);
      setInputValue(`${before}@${username} ${after}`);
    }
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const sendMessage = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || !socketRef.current?.connected || !platformAddress) return;

    const mentionRegex = /@(\w+)/g;
    const mentions: string[] = [];
    let m;
    while ((m = mentionRegex.exec(trimmed)) !== null) mentions.push(m[1]);

    const isStreamer = streamerAddress && platformAddress.toLowerCase() === streamerAddress.toLowerCase();
    const isMod = moderatorAddresses.some((a) => a?.toLowerCase() === platformAddress?.toLowerCase());

    socketRef.current.emit("chat:message", {
      channel: channel.trim().toLowerCase(),
      address: platformAddress,
      username: currentUserDisplayName || undefined,
      displayName: currentUserDisplayName || truncateAddress(platformAddress),
      message: trimmed,
      isStreamer,
      isMod,
      mentions,
    });
    setInputValue("");
    setMentionQuery(null);
  };

  const filteredCandidates = mentionQuery
    ? mentionableUsers().filter(
      (u) =>
        u.username.toLowerCase().includes(mentionQuery) &&
        u.username.toLowerCase() !== mentionQuery
    )
    : mentionableUsers();

  if (!channel?.trim()) return null;

  return (
    <div
      className={`font-display flex flex-col rounded-lg overflow-hidden ${className}`}
      style={{
        background: "#18181b",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
      aria-label="Live chat"
    >
      {/* Header - Twitch style */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "#1f1f23" }}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Live Chat</span>
          <span className="text-xs" style={{ color: "#adadb8" }}>#{channel}</span>
        </div>
        <div className="flex items-center gap-2">
          {status === "connecting" && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "#e19b3c" }}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Connecting…
            </span>
          )}
          {status === "connected" && (
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "#00d26a" }}>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Live
            </span>
          )}
          {status === "error" && (
            <span className="text-xs text-red-400" title={errorMessage ?? undefined}>
              Offline
            </span>
          )}
          <button
            type="button"
            onClick={() => setViewersOpen((o) => !o)}
            className="rounded p-2 transition hover:bg-white/10"
            aria-label="View viewers"
            title="Streamer, moderators, and viewers"
          >
            <UsersIcon className="h-5 w-5 text-zinc-400 hover:text-white" />
          </button>
        </div>
      </div>

      {/* Viewers panel */}
      {viewersOpen && (
        <div
          className="border-b px-4 py-3"
          style={{ borderColor: "rgba(255,255,255,0.08)", background: "#1f1f23" }}
        >
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Watching now
          </p>
          <div className="space-y-2 text-sm">
            {viewersData?.streamer?.length ? (
              <div>
                <p className="text-xs font-medium text-purple-400 mb-1">Streamer</p>
                {viewersData.streamer.map((v) => (
                  <p
                    key={v.socketId}
                    className="text-white cursor-context-menu"
                    onContextMenu={(e) => showAddModeratorContext(e, v.address, v.username || truncateAddress(v.address || ""))}
                  >
                    {v.username || truncateAddress(v.address || "")}
                  </p>
                ))}
              </div>
            ) : null}
            {viewersData?.moderators?.length ? (
              <div>
                <p className="text-xs font-medium text-emerald-400 mb-1">Moderators</p>
                {viewersData.moderators.map((v) => (
                  <p
                    key={v.socketId}
                    className="flex items-center gap-2 text-white cursor-context-menu"
                    onContextMenu={(e) => showAddModeratorContext(e, v.address, v.username || truncateAddress(v.address || ""))}
                  >
                    <span className="rounded bg-emerald-600/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      MOD
                    </span>
                    {v.username || truncateAddress(v.address || "")}
                  </p>
                ))}
              </div>
            ) : null}
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-1">Viewers</p>
              {viewersData?.viewers?.length ? (
                viewersData.viewers.map((v) => (
                  <p
                    key={v.socketId}
                    className="text-zinc-300 cursor-context-menu"
                    onContextMenu={(e) => showAddModeratorContext(e, v.address, v.username || truncateAddress(v.address || "") || "Anonymous")}
                  >
                    {v.username || truncateAddress(v.address || "") || "Anonymous"}
                  </p>
                ))
              ) : (
                <p className="text-zinc-500 italic">No viewers yet</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex gap-1.5 px-3 py-2 border-b"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "#18181b" }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activeTab === "chat"
              ? "bg-zinc-600 text-white"
              : "bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600/70"
            }`}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("predictions")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${activeTab === "predictions"
              ? "bg-zinc-600 text-white"
              : "bg-zinc-700/50 text-zinc-300 hover:bg-zinc-600/70"
            }`}
        >
          Predictions
        </button>
      </div>

      {addModeratorError && (
        <div className="px-3 py-2 bg-amber-900/30 border-b border-amber-600/40">
          <p className="text-xs text-amber-400">{addModeratorError}</p>
          <button
            type="button"
            onClick={() => setAddModeratorError(null)}
            className="mt-1 text-xs text-amber-300 hover:text-amber-200 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === "chat" ? (
        <>
          <div
            ref={listRef}
            className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-1 relative"
            style={{ minHeight: 200, maxHeight: "calc(100vh - 20rem)" }}
          >
            {messages.length === 0 && status === "connected" && (
              <p className="text-sm text-zinc-500 py-4">Send a message to start the conversation!</p>
            )}
            {messages.length === 0 && status === "connecting" && (
              <p className="text-sm text-zinc-500 py-4">Connecting…</p>
            )}
            {status === "error" && messages.length === 0 && (
              <p className="text-sm text-zinc-500 py-4">{errorMessage ?? "Could not connect to chat."}</p>
            )}
            {[...resolutionAnnouncements, ...messages]
              .sort((a, b) => a.timestamp - b.timestamp)
              .map((m) => (
                <div
                  key={m.id}
                  className={`group flex flex-wrap items-baseline gap-1.5 py-0.5 text-sm leading-snug wrap-break-word ${m.isResolutionAnnouncement ? "rounded-lg border border-amber-600/40 bg-amber-900/30 px-2 py-1.5" : ""
                    }`}
                >
                  <span
                    className={`shrink-0 font-semibold ${!m.isResolutionAnnouncement ? "cursor-context-menu" : ""}`}
                    style={{ color: m.color || DEFAULT_USER_COLOR }}
                    onContextMenu={!m.isResolutionAnnouncement ? (e) => showAddModeratorContext(e, m.address, m.displayName) : undefined}
                  >
                    {m.isResolutionAnnouncement ? "🏆" : m.displayName}
                  </span>
                  {!m.isResolutionAnnouncement && m.isMod && (
                    <span className="rounded bg-emerald-600/80 px-1 text-[10px] font-medium text-white">MOD</span>
                  )}
                  {!m.isResolutionAnnouncement && m.isStreamer && (
                    <span className="rounded bg-purple-600/80 px-1 text-[10px] font-medium text-white">STREAMER</span>
                  )}
                  <span className={m.isResolutionAnnouncement ? "text-amber-200 font-medium" : "text-zinc-300"}>
                    {renderMessageWithMentions(m.message, m.mentions)}
                  </span>
                </div>
              ))}
          </div>

          {/* Chat input */}
          <div
            className="border-t px-3 py-2"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "#1f1f23" }}
          >
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder={platformAddress ? "Send a message…" : "Sign in to chat"}
                disabled={!platformAddress || status !== "connected"}
                className="w-full rounded px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                style={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)" }}
              />
              {mentionQuery !== null && filteredCandidates.length > 0 && (
                <div
                  className="absolute bottom-full left-0 right-0 mb-1 max-h-40 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
                  style={{ zIndex: 50 }}
                >
                  {filteredCandidates.slice(0, 8).map((u) => (
                    <button
                      key={u.username}
                      type="button"
                      onClick={() => insertMention(u.username)}
                      className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 flex items-center justify-between"
                    >
                      <span>@{u.username}</span>
                      <span className="text-xs text-zinc-500">{u.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div
          className="font-display flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3"
          style={{ minHeight: 280, maxHeight: "calc(100vh - 14rem)" }}
        >
          {canManagePredictions && streamerAddress && (
            <CreatePredictionForm
              streamerAddress={streamerAddress}
              onSubmit={async (title, option1, option2) => {
                await createPrediction(streamerAddress, title, option1, option2);
              }}
              disabled={predictionsLoading}
            />
          )}
          {predictionsError && <p className="text-xs text-amber-400">{predictionsError}</p>}
          {streamerAddress ? (
            predictionsLoading ? (
              <p className="text-sm text-zinc-500">Loading predictions…</p>
            ) : realPredictions.length === 0 ? (
              <p className="text-sm text-zinc-500">No predictions yet.</p>
            ) : (
              realPredictions.map((p) => (
                <RealPredictionCard
                  key={p.id}
                  prediction={p}
                  canManage={canManagePredictions}
                  onLock={async (id) => await lockPrediction(id)}
                  onResolve={async (id, option) => await resolvePrediction(id, option)}
                  onReject={async (id) => await cancelPrediction(id)}
                  onPlaceBet={async (id, option, amount) => await placeBet(id, option, amount)}
                  onClaimWinnings={async (id) => await claimWinnings(id)}
                  userAddressForClaim={platformAddress}
                  onResolveComplete={handleResolveComplete}
                />
              ))
            )
          ) : (
            <p className="text-sm text-zinc-500">No predictions yet.</p>
          )}
        </div>
      )}

      {/* Right-click context menu: Add as moderator */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            disabled={addingModerator}
            onClick={() => handleAddModerator(contextMenu.address)}
            className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
          >
            {addingModerator ? "Adding…" : `Add "${contextMenu.displayName}" as moderator`}
          </button>
        </div>
      )}
    </div>
  );
}

function renderMessageWithMentions(message: string, mentions?: string[]): React.ReactNode {
  if (!mentions?.length) return message;
  const parts: React.ReactNode[] = [];
  let last = 0;
  const regex = /@(\w+)/g;
  let m;
  while ((m = regex.exec(message)) !== null) {
    parts.push(message.slice(last, m.index));
    parts.push(
      <span key={m.index} className="text-purple-400 font-medium">
        @{m[1]}
      </span>
    );
    last = regex.lastIndex;
  }
  parts.push(message.slice(last));
  return <>{parts}</>;
}

function CreatePredictionForm({
  streamerAddress,
  onSubmit,
  disabled,
}: {
  streamerAddress: Address;
  onSubmit: (title: string, option1: string, option2: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [option1, setOption1] = useState("");
  const [option2, setOption2] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim();
    const o1 = option1.trim();
    const o2 = option2.trim();
    if (!t || !o1 || !o2) {
      setError("Title and both options are required.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit(t, o1, o2);
      setTitle("");
      setOption1("");
      setOption2("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="w-full rounded-lg border border-dashed border-zinc-600 bg-zinc-800/50 py-2.5 text-sm font-medium text-zinc-300 transition hover:border-purple-500 hover:bg-zinc-800 hover:text-white disabled:opacity-50"
      >
        + Create prediction
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-zinc-700 bg-zinc-800/80 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">New prediction</span>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-300">
          Cancel
        </button>
      </div>
      <input
        type="text"
        placeholder="Prediction question"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded border border-zinc-600 bg-zinc-900 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
      />
      <input
        type="text"
        placeholder="Option 1"
        value={option1}
        onChange={(e) => setOption1(e.target.value)}
        className="w-full rounded border border-zinc-600 bg-zinc-900 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
      />
      <input
        type="text"
        placeholder="Option 2"
        value={option2}
        onChange={(e) => setOption2(e.target.value)}
        className="w-full rounded border border-zinc-600 bg-zinc-900 px-2.5 py-1.5 text-sm text-white placeholder-zinc-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-purple-600 py-2 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:opacity-50"
      >
        {submitting ? "Creating…" : "Create prediction"}
      </button>
    </form>
  );
}

function RealPredictionCard({
  prediction,
  canManage,
  onLock,
  onResolve,
  onReject,
  onPlaceBet,
  onClaimWinnings,
  userAddressForClaim,
  onResolveComplete,
}: {
  prediction: Prediction;
  canManage: boolean;
  onLock: (id: number) => Promise<void>;
  onResolve: (id: number, option: 1 | 2) => Promise<void>;
  onReject: (id: number) => Promise<void>;
  onPlaceBet?: (predictionId: number, option: 1 | 2, amountEth: string) => Promise<void>;
  onClaimWinnings?: (id: number) => Promise<void>;
  userAddressForClaim?: Address | null;
  onResolveComplete?: (prediction: Prediction, winningOption: 1 | 2) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [locking, setLocking] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [betting, setBetting] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<bigint | null>(null);
  const [amount1, setAmount1] = useState("1");
  const [amount2, setAmount2] = useState("1");
  const [betError, setBetError] = useState<string | null>(null);
  const [userOutcome, setUserOutcome] = useState<{ outcome: "won" | "lost" | "no_bet"; betOnOption: 1 | 2 | null; amount: bigint } | null>(null);
  const [topScorer, setTopScorer] = useState<{ address: Address; amount: bigint } | null>(null);
  const [topScorerUsername, setTopScorerUsername] = useState<string | null>(null);
  const [biddersCount, setBiddersCount] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);

  const total = Number(prediction.totalBetOption1 + prediction.totalBetOption2);
  const o1 = Number(prediction.totalBetOption1);
  const o2 = Number(prediction.totalBetOption2);
  const pct1 = total > 0 ? (o1 / total) * 100 : 50;
  const pct2 = total > 0 ? (o2 / total) * 100 : 50;
  const live = isLive(prediction.status);
  const showLock = canManage && canLock(prediction.status);
  const showResolve = canManage && canResolve(prediction.status);
  const showReject = canManage && canCancel(prediction.status);
  const isOpen = prediction.status === 0;

  const handlePlaceBet = async (option: 1 | 2) => {
    if (!onPlaceBet) return;
    const amount = (option === 1 ? amount1 : amount2).trim();
    if (!amount || parseFloat(amount) <= 0) {
      setBetError("Enter a valid amount (USDC)");
      return;
    }
    setBetError(null);
    setBetting(true);
    try {
      await onPlaceBet(prediction.id, option, amount);
    } catch (err) {
      setBetError(err instanceof Error ? err.message : "Bet failed");
    } finally {
      setBetting(false);
    }
  };

  const handleResolve = async (option: 1 | 2) => {
    setResolving(true);
    try {
      await onResolve(prediction.id, option);
      onResolveComplete?.(prediction, option);
    } finally {
      setResolving(false);
    }
  };

  const handleLock = async () => {
    setLocking(true);
    try {
      await onLock(prediction.id);
    } finally {
      setLocking(false);
    }
  };

  const handleReject = async () => {
    if (!confirm("Cancel this prediction and refund all bets?")) return;
    setRejecting(true);
    try {
      await onReject(prediction.id);
    } finally {
      setRejecting(false);
    }
  };

  useEffect(() => {
    if (prediction.status !== 2 || !userAddressForClaim) {
      setPayoutAmount(null);
      return;
    }
    let cancelled = false;
    getPayout(prediction.id, userAddressForClaim).then((amount) => {
      if (!cancelled) setPayoutAmount(amount);
    });
    return () => {
      cancelled = true;
    };
  }, [prediction.id, prediction.status, userAddressForClaim]);

  useEffect(() => {
    if (prediction.status !== 2 || !prediction.winningOption) {
      setUserOutcome(null);
      setTopScorer(null);
      setTopScorerUsername(null);
      return;
    }
    const winning = prediction.winningOption as 1 | 2;
    let cancelled = false;
    Promise.all([
      userAddressForClaim ? getUserBetOutcome(prediction.id, userAddressForClaim, winning) : null,
      getTopScorer(prediction.id, winning),
    ]).then(([outcome, top]) => {
      if (!cancelled) {
        setUserOutcome(outcome ?? null);
        setTopScorer(top);
        setTopScorerUsername(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [prediction.id, prediction.status, prediction.winningOption, userAddressForClaim]);

  useEffect(() => {
    if (!topScorer) {
      setTopScorerUsername(null);
      return;
    }
    let cancelled = false;
    fetchEnsUsernameForAddress(topScorer.address).then((raw) => {
      if (!cancelled && raw) setTopScorerUsername(ensNameToUsername(raw));
      else if (!cancelled) setTopScorerUsername(null);
    });
    return () => {
      cancelled = true;
    };
  }, [topScorer?.address]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getBiddersCount(prediction.id), getPredictionStartTime(prediction.id)]).then(
      ([count, time]) => {
        if (!cancelled) {
          setBiddersCount(count);
          setStartTime(time);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [prediction.id]);

  const handleClaim = async () => {
    if (!onClaimWinnings) return;
    setClaiming(true);
    try {
      await onClaimWinnings(prediction.id);
      setPayoutAmount(0n);
    } finally {
      setClaiming(false);
    }
  };

  const isResolved = prediction.status === 2;
  const canClaim =
    isResolved && onClaimWinnings && userAddressForClaim && payoutAmount !== null && payoutAmount > 0n;

  return (
    <>
      <button
        type="button"
        onClick={() => setDetailOpen(true)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 p-3 text-left transition hover:border-zinc-600 hover:bg-zinc-800"
      >
        <p className="text-sm font-semibold tracking-tight text-white">{prediction.title}</p>
        <p className="mt-0.5 text-xs font-medium text-zinc-400">
          {prediction.option1} vs {prediction.option2}
          <span className="ml-1.5 rounded bg-zinc-700 px-1 text-[10px] text-zinc-300">
            {predictionStatusLabel(prediction.status)}
          </span>
          {canClaim && (
            <span className="ml-1.5 rounded bg-emerald-600/80 px-1 text-[10px] font-medium text-white">
              Claim
            </span>
          )}
        </p>
        <div className="mt-3 flex w-full items-stretch gap-0 overflow-hidden rounded-md border-4 border-black bg-zinc-800 shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
          <div className="h-8 min-w-[4px] border-r-2 border-black bg-blue-500" style={{ flex: pct1 || 0.001 }} />
          <div className="h-8 min-w-[4px] border-l-2 border-black bg-red-500" style={{ flex: pct2 || 0.001 }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-medium text-zinc-500">
          <span>
            {prediction.option1} {formatUsdc(prediction.totalBetOption1)}
          </span>
          <span className="shrink-0 text-zinc-400">
            {formatUsdc(prediction.totalBetOption1 + prediction.totalBetOption2)} total
          </span>
          <span>
            {prediction.option2} {formatUsdc(prediction.totalBetOption2)}
          </span>
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-500">Tap to vote</p>
      </button>

      {detailOpen && (
        <div className="absolute inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="Prediction details">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetailOpen(false)} aria-hidden />
          <div
            className="relative w-full max-w-lg animate-slide-up rounded-t-2xl border border-zinc-700 border-b-0 bg-zinc-900 shadow-xl"
            style={{ maxHeight: "85vh" }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-700 bg-zinc-900 px-4 py-3">
              <h3 className="text-sm font-semibold text-white">{prediction.title}</h3>
              <button
                type="button"
                onClick={() => setDetailOpen(false)}
                className="rounded-full p-2 text-zinc-400 hover:bg-zinc-700 hover:text-white"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto px-4 pb-6 pt-4" style={{ maxHeight: "calc(85vh - 52px)" }}>
              <p className="text-xs font-medium text-zinc-400">
                {prediction.option1} vs {prediction.option2}
                <span className="ml-1.5 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300">
                  {predictionStatusLabel(prediction.status)}
                </span>
              </p>
              <div className={`mt-4 flex w-full items-stretch gap-0 overflow-hidden rounded-lg border-4 border-black bg-zinc-800 shadow-[3px_3px_0_0_rgba(0,0,0,1)] ${live ? "tug-bar-live" : ""}`}>
                <div
                  className="tug-segment-left h-10 min-w-[8px] border-r-2 border-black bg-blue-500 transition-[flex] duration-500 ease-out"
                  style={{ flex: pct1 || 0.001 }}
                  title={`${prediction.option1}: ${formatUsdc(prediction.totalBetOption1)}`}
                />
                <div
                  className="tug-segment-right h-10 min-w-[8px] border-l-2 border-black bg-red-500 transition-[flex] duration-500 ease-out"
                  style={{ flex: pct2 || 0.001 }}
                  title={`${prediction.option2}: ${formatUsdc(prediction.totalBetOption2)}`}
                />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs font-medium text-zinc-500">
                <span>
                  {prediction.option1} {formatUsdc(prediction.totalBetOption1)}
                </span>
                <span className="shrink-0 text-zinc-400">
                  {formatUsdc(prediction.totalBetOption1 + prediction.totalBetOption2)} total
                </span>
                <span>
                  {prediction.option2} {formatUsdc(prediction.totalBetOption2)}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 rounded-lg border border-zinc-700 bg-zinc-800/60 p-3">
                <div className="flex shrink-0 items-center gap-2">
                  <span className="whitespace-nowrap text-sm font-semibold text-amber-400">
                    {startTime
                      ? startTime.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
                      : "—"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="whitespace-nowrap text-sm font-semibold text-amber-400">
                    {biddersCount !== null ? String(biddersCount) : "—"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="whitespace-nowrap text-sm font-semibold text-amber-400">
                    {formatUsdc(prediction.totalBetOption1 + prediction.totalBetOption2)}
                  </span>
                </div>
              </div>
              {isOpen && onPlaceBet && !canManage && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs text-zinc-500">Uses USDC on Base Sepolia. Deposit via Transfer Crypto if needed.</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Amount (USDC)"
                      value={amount1}
                      onChange={(e) => {
                        setAmount1(e.target.value);
                        setBetError(null);
                      }}
                      className="flex-1 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      disabled={betting}
                      onClick={() => handlePlaceBet(1)}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {betting ? "…" : prediction.option1}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Amount (USDC)"
                      value={amount2}
                      onChange={(e) => {
                        setAmount2(e.target.value);
                        setBetError(null);
                      }}
                      className="flex-1 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                    <button
                      type="button"
                      disabled={betting}
                      onClick={() => handlePlaceBet(2)}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      {betting ? "…" : prediction.option2}
                    </button>
                  </div>
                  {betError && <p className="text-xs text-red-400">{betError}</p>}
                </div>
              )}
              {live && (showLock || showResolve || showReject) && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-700 pt-4">
                  {showLock && (
                    <button
                      type="button"
                      disabled={locking}
                      onClick={handleLock}
                      className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {locking ? "Locking…" : "Lock (stop bets)"}
                    </button>
                  )}
                  {showResolve && (
                    <>
                      <button
                        type="button"
                        disabled={resolving}
                        onClick={() => handleResolve(1)}
                        className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        Resolve: {prediction.option1}
                      </button>
                      <button
                        type="button"
                        disabled={resolving}
                        onClick={() => handleResolve(2)}
                        className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                      >
                        Resolve: {prediction.option2}
                      </button>
                    </>
                  )}
                  {showReject && (
                    <button
                      type="button"
                      disabled={rejecting}
                      onClick={handleReject}
                      className="rounded-lg border border-amber-600 bg-amber-900/30 px-2.5 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-900/50 disabled:opacity-50"
                    >
                      {rejecting ? "Rejecting…" : "Reject (refund all)"}
                    </button>
                  )}
                </div>
              )}
              {isResolved && (
                <div className="mt-4 space-y-3">
                  {userOutcome?.outcome === "won" && (
                    <p className="text-sm font-semibold text-emerald-400">
                      You won! Your bet on {prediction.winningOption === 1 ? prediction.option1 : prediction.option2} paid off.
                    </p>
                  )}
                  {userOutcome?.outcome === "lost" && (
                    <p className="text-sm font-semibold text-red-400">
                      You lost — your bet was on {userOutcome.betOnOption === 1 ? prediction.option1 : prediction.option2} ({formatUsdc(userOutcome.amount)}).
                    </p>
                  )}
                  {topScorer && (
                    <div className="rounded-lg border border-amber-600/50 bg-amber-900/20 p-3">
                      <p className="text-xs font-medium text-amber-400/90 uppercase tracking-wider">Top scorer</p>
                      <p className="mt-0.5 text-sm font-semibold text-amber-300">
                        {topScorerUsername ?? truncateAddress(topScorer.address)} with {formatUsdc(topScorer.amount)}
                      </p>
                    </div>
                  )}
                </div>
              )}
              {canClaim && (
                <div className="mt-4 rounded-lg border border-emerald-600/50 bg-emerald-900/20 p-4">
                  <p className="text-sm font-semibold text-emerald-400">You won {formatUsdc(payoutAmount ?? 0n)}!</p>
                  <button
                    type="button"
                    disabled={claiming}
                    onClick={handleClaim}
                    className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {claiming ? "Claiming…" : "Claim winnings"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
