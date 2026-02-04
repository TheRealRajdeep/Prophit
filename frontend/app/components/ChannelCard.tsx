"use client";

import Link from "next/link";
import { PlaceholderCover } from "./PlaceholderCover";

export type ChannelCardData = {
  id: string;
  title: string;
  channelName: string;
  game: string;
  emoji?: string;
  viewers: string | number;
  thumbnailUrl?: string | null;
  profileImageUrl?: string | null;
};

type Props = {
  channel: ChannelCardData;
};

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function formatViewers(v: string | number): string {
  if (typeof v === "number") {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(v);
  }
  return v;
}

export function ChannelCard({ channel }: Props) {
  const href = `/stream/${encodeURIComponent(channel.channelName)}`;
  const viewerText = formatViewers(channel.viewers);

  return (
    <article className="group cursor-pointer rounded-xl ring-1 ring-border-subtle transition-all hover:ring-accent/40 hover:bg-bg-card/50">
      <Link href={href} className="block">
        <div className="relative overflow-hidden rounded-lg">
          {channel.thumbnailUrl ? (
            <img
              src={channel.thumbnailUrl}
              alt=""
              className="aspect-video w-full rounded-lg object-cover transition group-hover:scale-[1.02]"
            />
          ) : (
            <PlaceholderCover aspect="video" className="rounded-lg" />
          )}
          <span className="absolute left-2 top-2 rounded bg-live px-1.5 py-0.5 text-xs font-semibold uppercase text-white shadow-[0_0_8px_var(--live-badge-glow)]">
            Live
          </span>
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-bg-base/90 px-2 py-1 text-xs text-accent-cyan ring-1 ring-border-subtle">
            <EyeIcon />
            <span>{viewerText} viewers</span>
          </div>
        </div>
      </Link>
      <div className="mt-2 flex items-start gap-2">
        <Link href={href} className="shrink-0">
          {channel.profileImageUrl ? (
            <img
              src={channel.profileImageUrl}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-1 ring-border-subtle"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-elevated text-sm ring-1 ring-border-subtle" aria-hidden>
              {channel.emoji ?? "🎮"}
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={href}>
            <h3 className="truncate text-sm font-semibold text-white group-hover:text-accent-hover transition-colors">
              {channel.title || channel.channelName}
            </h3>
          </Link>
          <p className="truncate text-xs text-text-muted">{channel.channelName}</p>
          <p className="truncate text-xs text-accent-cyan/80">{channel.game || "—"}</p>
        </div>
        <button type="button" className="shrink-0 rounded p-1.5 text-text-muted hover:bg-bg-elevated hover:text-accent-cyan transition-colors" aria-label="More options">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="12" cy="6" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="18" r="1.5" />
          </svg>
        </button>
      </div>
    </article>
  );
}
