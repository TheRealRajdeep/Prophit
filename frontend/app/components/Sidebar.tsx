"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

type LiveStreamItem = {
  id: string;
  channelName: string;
  displayName: string;
  profileImageUrl: string | null;
  streamTitle: string | null;
  category: string | null;
  viewerCount: number;
  thumbnailUrl: string | null;
  language: string | null;
};

function formatViewers(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

// Placeholder ongoing predictions – replace with real data from backend
const ONGOING_PREDICTIONS = [
  { emoji: "🎪", name: "Prediction 1", channelName: "Channel A", prices: "0.42/0.58" },
  { emoji: "⚡", name: "Prediction 2", channelName: "Channel B", prices: "0.65/0.35" },
  { emoji: "🌟", name: "Prediction 3", channelName: "Channel A", prices: "0.28/0.72" },
  { emoji: "🔥", name: "Prediction 4", channelName: "Channel C", prices: "0.51/0.49" },
  { emoji: "💎", name: "Prediction 5", channelName: "Channel B", prices: "0.33/0.67" },
];

export default function Sidebar() {
  const [streams, setStreams] = useState<LiveStreamItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/twitch/streams?limit=15")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: LiveStreamItem[]) => {
        if (!cancelled) setStreams(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setStreams([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="hidden h-full min-h-0 w-60 shrink-0 flex-col border-r border-border-default bg-bg-surface lg:flex" aria-label="Sidebar">
      <div className="min-h-0 flex-1 overflow-y-auto py-4">
        <div className="flex flex-col gap-4">
          <div className="px-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">For You <span className="text-accent-cyan">·</span></h2>
              <button type="button" className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-accent-cyan transition-colors" aria-label="Collapse">
                <ChevronLeftIcon />
              </button>
            </div>
          </div>

          <div className="px-2">
            <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-accent-cyan">Live now</h3>
            {loading ? (
              <p className="px-2 text-xs text-text-muted">Loading…</p>
            ) : streams.length === 0 ? (
              <p className="px-2 text-xs text-text-muted">No live streams</p>
            ) : (
              <ul className="space-y-0.5" role="list">
                {streams.map((ch) => (
                  <li key={ch.id}>
                    <Link
                      href={`/stream/${encodeURIComponent(ch.channelName)}`}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-elevated hover:ring-1 hover:ring-border-subtle transition-colors"
                    >
                      {ch.profileImageUrl ? (
                        <img
                          src={ch.profileImageUrl}
                          alt=""
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-base" aria-hidden>
                          🎮
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{ch.displayName}</span>
                        <span className="block truncate text-xs text-zinc-500">{ch.category || "—"}</span>
                      </div>
                      <span className="shrink-0 text-xs text-accent-warm font-medium">{formatViewers(ch.viewerCount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-2">
            <h3 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-accent">Ongoing Predictions</h3>
            <ul className="space-y-0.5" role="list">
              {ONGOING_PREDICTIONS.map((pred, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-elevated hover:ring-1 hover:ring-border-subtle transition-colors"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-base ring-1 ring-border-subtle" aria-hidden>
                      {pred.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">{pred.name}</span>
                      <span className="block truncate text-xs text-text-muted">{pred.channelName}</span>
                    </div>
                    <span className="shrink-0 text-xs text-accent-warm font-medium">{pred.prices}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
}
