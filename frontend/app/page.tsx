import Link from "next/link";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import { PlaceholderCover } from "./components/PlaceholderCover";
import { ChannelCard } from "./components/ChannelCard";
import type { ChannelCardData } from "./components/ChannelCard";
import { getLiveStreams } from "@/lib/twitch";

function formatViewers(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default async function Home() {
  let streams: Awaited<ReturnType<typeof getLiveStreams>> = [];
  try {
    streams = await getLiveStreams(20);
  } catch (e) {
    console.error("Failed to fetch streams:", e);
  }

  const featured = streams[0];
  const recommended = streams.slice(1).map((s) => ({
    id: s.id,
    title: s.streamTitle || s.displayName,
    channelName: s.channelName,
    game: s.category || "—",
    viewers: s.viewerCount,
    thumbnailUrl: s.thumbnailUrl,
    profileImageUrl: s.profileImageUrl,
  })) as ChannelCardData[];

  return (
    <div className="bg-app flex h-screen flex-col overflow-hidden font-sans text-zinc-100">
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-6xl px-4 py-6">
            <div className="mb-4 flex items-center gap-2">
              <button type="button" className="rounded p-2 text-zinc-400 hover:bg-bg-elevated hover:text-accent-cyan" aria-label="Back">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-white">
                For You <span className="text-accent-cyan">·</span>
              </h1>
            </div>

            {/* Featured stream */}
            {featured && (
              <section className="mb-8" aria-label="Featured stream">
                <Link href={`/stream/${encodeURIComponent(featured.channelName)}`} className="block">
                  <div className="relative mx-auto w-full max-w-[50%] overflow-hidden rounded-lg">
                    {featured.thumbnailUrl ? (
                      <img
                        src={featured.thumbnailUrl}
                        alt=""
                        className="aspect-video w-full rounded-lg object-cover"
                      />
                    ) : (
                      <PlaceholderCover aspect="video" className="rounded-lg" />
                    )}
                    <span className="absolute left-4 top-4 rounded bg-live px-2 py-1 text-xs font-semibold uppercase text-white shadow-[0_0_12px_var(--live-badge-glow)]">
                      Live
                    </span>
                    <div className="absolute right-4 top-4 flex items-center gap-2 rounded bg-bg-base/90 px-3 py-1.5 text-sm text-accent-cyan ring-1 ring-border-default">
                      <EyeIcon />
                      <span>{formatViewers(featured.viewerCount)} viewers</span>
                    </div>
                  </div>
                </Link>
                <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Link href={`/stream/${encodeURIComponent(featured.channelName)}`} className="shrink-0">
                      {featured.profileImageUrl ? (
                        <img src={featured.profileImageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <span className="flex h-10 w-10 items-center justify-center rounded bg-bg-elevated text-lg ring-1 ring-border-default" aria-hidden>🎮</span>
                      )}
                    </Link>
                    <div>
                      <Link href={`/stream/${encodeURIComponent(featured.channelName)}`}>
                        <h2 className="text-lg font-semibold text-white hover:text-accent-hover">
                          {featured.streamTitle || featured.displayName}
                        </h2>
                      </Link>
                      <p className="text-sm text-zinc-500">{featured.channelName}</p>
                      <p className="text-sm text-accent-cyan/90">{featured.category || "—"}</p>
                      {featured.language && (
                        <p className="mt-1 text-xs text-text-muted">{featured.language}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded p-2 text-zinc-400 hover:bg-bg-elevated hover:text-accent-cyan" aria-label="Volume">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                      </svg>
                    </button>
                    <button type="button" className="rounded p-2 text-zinc-400 hover:bg-bg-elevated hover:text-white" aria-label="Settings">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <circle cx="12" cy="12" r="3" />
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                      </svg>
                    </button>
                    <button type="button" className="rounded bg-bg-elevated px-3 py-1.5 text-xs font-medium text-white ring-1 ring-border-default hover:bg-bg-card hover:ring-accent/50">
                      Quality
                    </button>
                    <button type="button" className="rounded bg-bg-elevated px-3 py-1.5 text-xs font-medium text-white ring-1 ring-border-default hover:bg-bg-card hover:ring-accent/50">
                      Clip
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* Live channels we think you'll like */}
            <section aria-labelledby="recommended-heading">
              <h2 id="recommended-heading" className="mb-4 text-xl font-bold text-white">
                Live channels we think you&apos;ll like{" "}
                <span className="text-accent-cyan font-normal">→</span>
              </h2>
              {recommended.length > 0 ? (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {recommended.map((channel) => (
                    <ChannelCard key={channel.id} channel={channel} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-500">No live streams right now. Check back later.</p>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
