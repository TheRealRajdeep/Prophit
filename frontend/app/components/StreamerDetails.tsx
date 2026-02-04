"use client";

type StreamerDetailsProps = {
  channel: string;
  /** Optional; falls back to placeholder if not provided */
  profileImageUrl?: string | null;
  streamTitle?: string;
  category?: string;
  language?: string;
  viewerCount?: string | number;
  /** Stream duration as "H:MM:SS" or "MM:SS" */
  streamDuration?: string;
  verified?: boolean;
};

function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ViewersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function VerifiedBadge() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="text-accent" aria-hidden>
      <path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.818-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.437 2.25c-.415-.165-.866-.25-1.336-.25-2.11 0-3.818 1.79-3.818 4 0 .494.083.964.237 1.4-1.272.65-2.147 2.02-2.147 3.6 0 1.495.782 2.798 1.942 3.486-.02.17-.032.34-.032.514 0 2.21 1.708 4 3.818 4 .47 0 .92-.086 1.335-.25.62 1.334 1.926 2.25 3.437 2.25 1.512 0 2.818-.916 3.437-2.25.415.163.865.25 1.336.25 2.11 0 3.818-1.79 3.818-4 0-.174-.012-.344-.033-.513 1.158-.687 1.943-1.99 1.943-3.484z" />
    </svg>
  );
}

function EllipsisIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="6" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="18" r="1.5" />
    </svg>
  );
}

export default function StreamerDetails({
  channel,
  profileImageUrl,
  streamTitle = "Stream",
  category = "Just Chatting",
  language = "English",
  viewerCount = "—",
  streamDuration = "0:00",
  verified = false,
}: StreamerDetailsProps) {
  const displayName = channel;
  const viewers =
    typeof viewerCount === "number"
      ? viewerCount.toLocaleString()
      : String(viewerCount);

  return (
    <section
      className="flex w-full flex-wrap items-start justify-between gap-4 rounded-b-lg border-t border-border-default bg-bg-surface/90 px-4 py-3"
      aria-label="Streamer details"
    >
      {/* Left: profile, LIVE badge, name, title, category • language */}
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-bg-elevated ring-1 ring-border-default">
          {profileImageUrl ? (
            <img
              src={profileImageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-text-muted">
              {displayName.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-live px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-white shadow-[0_0_8px_var(--live-badge-glow)]">
              Live
            </span>
            <span className="flex items-center gap-1.5 text-base font-semibold text-white">
              {displayName}
              {verified && (
                <span className="text-accent" aria-label="Verified">
                  <VerifiedBadge />
                </span>
              )}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-zinc-300">
            {streamTitle}
          </p>
          <p className="text-xs text-accent-cyan/90">
            {category}
            <span className="mx-1.5 text-text-muted">•</span>
            {language}
          </p>
        </div>
      </div>

      {/* Right: icons, action buttons, stats */}
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center gap-1">


          <button
            type="button"
            className="rounded bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-hover transition-colors"
          >
            Follow
          </button>
        </div>
        <div className="flex items-center gap-3 text-sm text-accent-warm">
          <span className="flex items-center gap-1.5">
            <ViewersIcon />
            <span>{viewers}</span>
          </span>
          <button
            type="button"
            className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-accent-cyan transition-colors"
            aria-label="More"
          >
            <EllipsisIcon />
          </button>
        </div>
      </div>
    </section>
  );
}
