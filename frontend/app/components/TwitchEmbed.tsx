"use client";

import Script from "next/script";
import { useEffect, useId, useRef } from "react";

// Twitch requires SSL (HTTPS). For local dev use: npm run dev:https
// https://dev.twitch.tv/docs/embed/ - "Domains that use Twitch embeds must use SSL certificates"
function getEmbedParent(): string {
  if (typeof window === "undefined") return "localhost";
  const host = window.location.hostname;
  if (host === "127.0.0.1" || host === "::1") return "localhost";
  return host || "localhost";
}

const EMBED_SCRIPT = "https://embed.twitch.tv/embed/v1.js";

export default function TwitchEmbed({ channel }: { channel: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const embedRef = useRef<Twitch.Embed | null>(null);
  const embedId = useId().replace(/:/g, "") || "twitch-embed";

  useEffect(() => {
    if (!channel?.trim() || !containerRef.current) return;

    const initEmbed = () => {
      if (typeof window === "undefined" || !window.Twitch?.Embed) return;
      if (embedRef.current) return;

      const parent = getEmbedParent();
      embedRef.current = new window.Twitch.Embed(embedId, {
        width: "100%",
        height: "100%",
        channel: channel.trim(),
        layout: "video",
        autoplay: false,
        muted: false,
        parent: [parent],
      });

      const embed = embedRef.current;
      embed.addEventListener(window.Twitch.Embed.VIDEO_READY, () => {
        const player = embed.getPlayer();
        if (player) player.play();
      });
    };

    if (window.Twitch?.Embed) {
      initEmbed();
    } else {
      const onScriptLoad = () => initEmbed();
      window.addEventListener("twitch-embed-script-load", onScriptLoad);
      return () => {
        window.removeEventListener("twitch-embed-script-load", onScriptLoad);
        embedRef.current = null;
      };
    }

    return () => {
      embedRef.current = null;
    };
  }, [channel, embedId]);

  if (!channel?.trim()) return null;

  return (
    <>
      <Script
        src={EMBED_SCRIPT}
        strategy="afterInteractive"
        onLoad={() => window.dispatchEvent(new CustomEvent("twitch-embed-script-load"))}
      />
      <div
        ref={containerRef}
        className="relative rounded-lg bg-black"
        style={{
          minHeight: 400,
          minWidth: 400,
          height: "100%",
          width: "100%",
        }}
      >
        <div
          id={embedId}
          style={{
            minHeight: 400,
            height: "100%",
            width: "100%",
          }}
        />
      </div>
    </>
  );
}
