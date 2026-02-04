"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// tmi.js types for message handler
interface ChatTags {
  "display-name"?: string;
  username?: string;
  color?: string;
  "user-id"?: string;
  "message-id"?: string;
  mod?: boolean;
  subscriber?: boolean;
  badges?: Record<string, string>;
  emotes?: Record<string, string[]>;
}

interface ChatMessage {
  id: string;
  username: string;
  displayName: string;
  color: string;
  message: string;
  timestamp: number;
  isMod?: boolean;
  isSubscriber?: boolean;
}

const MAX_MESSAGES = 200;
const DEFAULT_USER_COLOR = "#b9bbbe";

// Deterministic color from username for consistent styling when Twitch doesn't send color
function hashColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  return `hsl(${h}, 70%, 65%)`;
}

type TwitchChatProps = {
  channel: string;
  className?: string;
};

// Outcome option for expanded prediction (left/right)
interface PredictionOutcome {
  title: string;
  usdcAmount: string;   // 1st stat - e.g. "5.9M"
  odds: string;          // 2nd - e.g. "1:4.93"
  participants: number;  // 3rd - e.g. 356
  volume: string;       // 4th - e.g. "250K"
  percentage: number;
}

// Mock prediction data for Predictions tab
interface PredictionCardData {
  id: string;
  title: string;
  createdBy: string;
  yesAmount: number;
  noAmount: number;
  leftOption: PredictionOutcome;
  rightOption: PredictionOutcome;
  defaultBetAmount: number;
}

const MOCK_PREDICTIONS: PredictionCardData[] = [
  {
    id: "1",
    title: "Will we hit 50k viewers?",
    createdBy: "StreamerName",
    yesAmount: 12500,
    noAmount: 8200,
    leftOption: { title: "No", usdcAmount: "5.9M", odds: "1:4.93", participants: 356, volume: "250K", percentage: 20 },
    rightOption: { title: "Yes", usdcAmount: "23.1M", odds: "1:1.25", participants: 628, volume: "250K", percentage: 80 },
    defaultBetAmount: 10,
  },
  {
    id: "2",
    title: "Next game: FPS or RPG?",
    createdBy: "ModAlice",
    yesAmount: 3400,
    noAmount: 5100,
    leftOption: { title: "FPS", usdcAmount: "2.1M", odds: "1:2.10", participants: 120, volume: "100K", percentage: 40 },
    rightOption: { title: "RPG", usdcAmount: "4.8M", odds: "1:1.45", participants: 280, volume: "100K", percentage: 60 },
    defaultBetAmount: 10,
  },
  {
    id: "3",
    title: "Boss dies in under 5 min?",
    createdBy: "StreamerName",
    yesAmount: 21000,
    noAmount: 4300,
    leftOption: { title: "No", usdcAmount: "1.2M", odds: "1:5.20", participants: 89, volume: "80K", percentage: 17 },
    rightOption: { title: "Yes", usdcAmount: "18.5M", odds: "1:1.12", participants: 520, volume: "80K", percentage: 83 },
    defaultBetAmount: 10,
  },
  {
    id: "4",
    title: "Donation goal by end of stream?",
    createdBy: "ModBob",
    yesAmount: 8900,
    noAmount: 11200,
    leftOption: { title: "No", usdcAmount: "7.2M", odds: "1:1.65", participants: 310, volume: "200K", percentage: 44 },
    rightOption: { title: "Yes", usdcAmount: "9.1M", odds: "1:1.35", participants: 398, volume: "200K", percentage: 56 },
    defaultBetAmount: 10,
  },
];

function UsdcIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="#2775CA" />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold" fontFamily="sans-serif">$</text>
    </svg>
  );
}

function TrophyIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M8 15v4M16 15v4M12 15V9" />
      <path d="M12 9a3 3 0 0 0 3-3V4H9v2a3 3 0 0 0 3 3Z" />
    </svg>
  );
}

function PeopleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function VolumeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5L6 9H2v6h4l5 4V5Z" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function PredictionCard({ prediction }: { prediction: PredictionCardData }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const total = prediction.yesAmount + prediction.noAmount;
  const yesPct = total > 0 ? (prediction.yesAmount / total) * 100 : 50;
  const noPct = total > 0 ? (prediction.noAmount / total) * 100 : 50;
  const { leftOption, rightOption, defaultBetAmount } = prediction;

  const formatVolume = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const OutcomeColumn = ({
    outcome,
    theme,
  }: {
    outcome: PredictionOutcome;
    theme: "blue" | "red";
  }) => {
    const isBlue = theme === "blue";
    const barColor = isBlue ? "bg-blue-500" : "bg-red-500";
    const textColor = isBlue ? "text-blue-400" : "text-red-400";
    const buttonBg = isBlue ? "bg-blue-600 hover:bg-blue-500" : "bg-red-600 hover:bg-red-500";
    const iconColor = isBlue ? "text-blue-400" : "text-red-400";
    return (
      <div className={`flex flex-1 flex-col rounded-lg border border-zinc-600 bg-zinc-800/90 p-3 ${isBlue ? "items-start" : "items-end"}`}>
        <p className={`text-sm font-semibold ${textColor}`}>{outcome.title}</p>
        <ul className={`mt-2 flex flex-col gap-1.5 ${isBlue ? "items-start" : "items-end"} text-xs text-zinc-300`}>
          <li className="flex items-center gap-2">
            {isBlue && <UsdcIcon className="h-3.5 w-3.5 shrink-0" />}
            <span>{outcome.usdcAmount}</span>
            {!isBlue && <UsdcIcon className="h-3.5 w-3.5 shrink-0" />}
          </li>
          <li className="flex items-center gap-2">
            {isBlue && <TrophyIcon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />}
            <span>{outcome.odds}</span>
            {!isBlue && <TrophyIcon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />}
          </li>
          <li className="flex items-center gap-2">
            {isBlue && <PeopleIcon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />}
            <span>{outcome.participants}</span>
            {!isBlue && <PeopleIcon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />}
          </li>
          <li className="flex items-center gap-2">
            {isBlue && <VolumeIcon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />}
            <span>{outcome.volume}</span>
            {!isBlue && <VolumeIcon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />}
          </li>
        </ul>
        <p className={`mt-2 text-lg font-bold ${textColor}`}>{outcome.percentage}%</p>
        <button
          type="button"
          className={`mt-2 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white ${buttonBg} transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-900 ${isBlue ? "focus:ring-blue-500" : "focus:ring-red-500"}`}
        >
          <UsdcIcon className="h-4 w-4" />
          <span>{defaultBetAmount} USDC</span>
        </button>
      </div>
    );
  };

  if (isExpanded) {
    return (
      <div className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/80 overflow-visible">
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="w-full px-3 py-2 text-left text-xs font-medium text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-300"
        >
          ← Back to summary
        </button>
        <div className="px-3 pb-3">
          <p className="text-sm font-semibold tracking-tight text-white">{prediction.title}</p>
          <p className="mt-0.5 text-xs font-medium tracking-wide text-zinc-400">by {prediction.createdBy}</p>
          {/* Single bar: blue (left) | red (right), comicy style */}
          <div className="mt-3 flex w-full items-stretch gap-0 overflow-hidden rounded-md border-4 border-black bg-zinc-800 shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
            <div
              className="h-8 min-w-[4px] rounded-l-md border-r-2 border-black bg-blue-500 transition-[flex-grow]"
              style={{ flex: leftOption.percentage || 0.001 }}
              title={`${leftOption.title}: ${leftOption.percentage}%`}
            />
            <div
              className="h-8 min-w-[4px] rounded-r-md border-l-2 border-black bg-red-500 transition-[flex-grow]"
              style={{ flex: rightOption.percentage || 0.001 }}
              title={`${rightOption.title}: ${rightOption.percentage}%`}
            />
          </div>
          <div className="mt-3 flex gap-2">
            <OutcomeColumn outcome={leftOption} theme="blue" />
            <OutcomeColumn outcome={rightOption} theme="red" />
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-brand py-2 text-center text-sm font-medium text-white transition hover:bg-brand/20 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            Predict with Custom Amount
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setIsExpanded(true)}
      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 p-3 text-left transition hover:border-zinc-600 hover:bg-zinc-800"
    >
      <p className="text-sm font-semibold tracking-tight text-white">{prediction.title}</p>
      <p className="mt-0.5 text-xs font-medium tracking-wide text-zinc-400">by {prediction.createdBy}</p>
      {/* Yes/No bars: blue = No (left), red = Yes (right) - thick black border for comicy look */}
      <div className="mt-3 flex w-full items-stretch gap-0 overflow-hidden rounded-md border-4 border-black bg-zinc-800 shadow-[2px_2px_0_0_rgba(0,0,0,1)]">
        <div
          className="h-8 min-w-[4px] border-r-2 border-black bg-blue-500 transition-[flex-grow]"
          style={{ flex: noPct || 0.001 }}
          title={`No: ${formatVolume(prediction.noAmount)}`}
        />
        <div
          className="h-8 min-w-[4px] border-l-2 border-black bg-red-500 transition-[flex-grow]"
          style={{ flex: yesPct || 0.001 }}
          title={`Yes: ${formatVolume(prediction.yesAmount)}`}
        />
      </div>
      {/* Volume in the middle below the bars */}
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] font-medium tracking-wide text-zinc-500">
        <span>No {formatVolume(prediction.noAmount)}</span>
        <span className="shrink-0 text-zinc-400">{formatVolume(total)} total</span>
        <span>Yes {formatVolume(prediction.yesAmount)}</span>
      </div>
    </button>
  );
}

export default function TwitchChat({ channel, className = "" }: TwitchChatProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "predictions">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<unknown>(null);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    if (!channel?.trim()) {
      setStatus("error");
      setErrorMessage("No channel provided");
      return;
    }

    let mounted = true;

    const init = async () => {
      const tmi = await import("tmi.js");
      const Client = (tmi as { Client: new (opts: Record<string, unknown>) => { connect: () => Promise<void>; disconnect: () => void; on: (event: string, cb: (...args: unknown[]) => void) => void } }).Client;

      const client = new Client({
        channels: [channel.trim().toLowerCase()],
        options: { skipMembership: true },
      });

      clientRef.current = client;

      client.on("message", (...args: unknown[]) => {
        const [ch, tags, msg] = args as [string, ChatTags, string];
        if (!mounted) return;

        const displayName = tags["display-name"] ?? tags.username ?? "?";
        const username = (tags.username ?? displayName).toLowerCase();
        const color = tags.color && /^#[\da-fA-F]{6}$/.test(tags.color) ? tags.color : hashColor(username);

        setMessages((prev) => {
          const next = [
            ...prev,
            {
              id: `${tags["message-id"] ?? Date.now()}-${username}-${prev.length}`,
              username,
              displayName,
              color,
              message: msg,
              timestamp: Date.now(),
              isMod: tags.mod,
              isSubscriber: tags.subscriber,
            },
          ];
          if (next.length > MAX_MESSAGES) return next.slice(-MAX_MESSAGES);
          return next;
        });
      });

      client.on("connected", () => {
        if (mounted) {
          setStatus("connected");
          setErrorMessage(null);
        }
      });

      client.on("disconnected", (...args: unknown[]) => {
        if (mounted && status !== "error") setStatus("error");
      });

      try {
        await client.connect();
      } catch (err) {
        if (mounted) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Failed to connect to chat");
        }
      }
    };

    init();

    return () => {
      mounted = false;
      const client = clientRef.current as { disconnect: () => void } | null;
      if (client?.disconnect) client.disconnect();
      clientRef.current = null;
    };
  }, [channel]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  if (!channel?.trim()) return null;

  return (
    <div
      className={`font-display flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/95 overflow-hidden ${className}`}
      aria-label="Twitch chat"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5 bg-zinc-800/60">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">Live Chat</span>
          <span className="text-xs text-zinc-500">#{channel}</span>
        </div>
        {status === "connecting" && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
            Connecting…
          </span>
        )}
        {status === "connected" && (
          <span className="flex items-center gap-1.5 text-xs text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        )}
        {status === "error" && (
          <span className="text-xs text-red-400" title={errorMessage ?? undefined}>
            Offline
          </span>
        )}
      </div>

      {/* Floating buttons above chat - small, rounded, blurred background */}
      <div className="flex gap-1.5 px-3 py-2 border-b border-zinc-800/60 bg-zinc-900/30 backdrop-blur-md">
        <button
          type="button"
          onClick={() => setActiveTab("chat")}
          className={`rounded-full backdrop-blur-md px-3 py-1.5 text-xs font-medium shadow transition focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-1 focus:ring-offset-zinc-900 ${activeTab === "chat"
            ? "bg-zinc-600/80 text-white"
            : "bg-zinc-700/50 text-white hover:bg-zinc-600/70"
            }`}
        >
          Chat
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("predictions")}
          className={`rounded-full backdrop-blur-md px-3 py-1.5 text-xs font-medium shadow transition focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-1 focus:ring-offset-zinc-900 ${activeTab === "predictions"
            ? "bg-zinc-600/80 text-white"
            : "bg-zinc-700/50 text-white hover:bg-zinc-600/70"
            }`}
        >
          Predictions
        </button>
      </div>

      {/* Content: Chat or Predictions */}
      {activeTab === "chat" ? (
        <div
          ref={listRef}
          className="flex-1 min-h-0 overflow-y-auto px-3 py-2 flex flex-col gap-1"
          style={{ minHeight: 280, maxHeight: "calc(100vh - 14rem)" }}
        >
          {messages.length === 0 && status === "connected" && (
            <p className="text-sm text-zinc-500 py-4">Waiting for messages…</p>
          )}
          {messages.length === 0 && status === "connecting" && (
            <p className="text-sm text-zinc-500 py-4">Connecting to chat…</p>
          )}
          {status === "error" && messages.length === 0 && (
            <p className="text-sm text-zinc-500 py-4">
              {errorMessage ?? "Could not connect to chat."}
            </p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className="group flex flex-wrap items-baseline gap-1.5 py-0.5 text-sm leading-snug wrap-break-word"
            >
              <span
                className="shrink-0 font-semibold"
                style={{ color: m.color || DEFAULT_USER_COLOR }}
              >
                {m.displayName}
              </span>
              {m.isMod && (
                <span className="rounded bg-emerald-600/80 px-1 text-[10px] font-medium text-white">
                  MOD
                </span>
              )}
              {m.isSubscriber && !m.isMod && (
                <span className="rounded bg-purple-600/80 px-1 text-[10px] font-medium text-white">
                  SUB
                </span>
              )}
              <span className="text-zinc-300">{m.message}</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="font-display flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3"
          style={{ minHeight: 280, maxHeight: "calc(100vh - 14rem)" }}
        >
          {MOCK_PREDICTIONS.map((p) => (
            <PredictionCard key={p.id} prediction={p} />
          ))}
        </div>
      )}
    </div>
  );
}
