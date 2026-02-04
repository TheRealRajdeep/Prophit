"use client";

/** Placeholder cover for thumbnails – no mock images. Replace with real data from backend. */
export function PlaceholderCover({ aspect = "video", className = "" }: { aspect?: "video" | "square"; className?: string }) {
  const aspectClass = aspect === "video" ? "aspect-video" : "aspect-square";
  return (
    <div
      className={`${aspectClass} w-full bg-bg-elevated ${className}`}
      aria-hidden
    >
      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-bg-card to-bg-elevated">
        <svg
          className="h-12 w-12 text-border-default sm:h-16 sm:w-16"
          fill="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path d="M8 5v14l11-7z" />
        </svg>
      </div>
    </div>
  );
}
