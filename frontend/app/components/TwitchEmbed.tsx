"use client";

import Script from "next/script";
import { useEffect, useId, useRef } from "react";

// Type definitions for Twitch Embed
interface TwitchEmbedOptions {
  width?: number | string;
  height?: number | string;
  channel?: string;
  layout?: "video" | "video-with-chat";
  parent?: string[];
  autoplay?: boolean;
  muted?: boolean;
}

interface TwitchEmbedInstance {
  addEventListener(event: string, callback: () => void): void;
  getPlayer(): { play(): void; pause(): void } | null;
}

interface TwitchEmbedConstructor {
  new(elementId: string, options: TwitchEmbedOptions): TwitchEmbedInstance;
  VIDEO_READY: string;
}

interface TwitchGlobal {
  Embed: TwitchEmbedConstructor;
}

// Twitch requires SSL (HTTPS). For local dev use: npm run dev:https
// https://dev.twitch.tv/docs/embed/ - "Domains that use Twitch embeds must use SSL certificates"
function getEmbedParent(): string {
  if (typeof window === "undefined") return "localhost";
  const host = window.location.hostname;
  if (host === "127.0.0.1" || host === "::1") return "localhost";
  return host || "localhost";
}

// Helper to get Twitch from window
function getTwitch(): TwitchGlobal | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { Twitch?: TwitchGlobal }).Twitch;
}

const EMBED_SCRIPT = "https://embed.twitch.tv/embed/v1.js";

export default function TwitchEmbed({ channel }: { channel: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const embedRef = useRef<TwitchEmbedInstance | null>(null);
  const embedId = useId().replace(/:/g, "") || "twitch-embed";

  useEffect(() => {
    if (!channel?.trim() || !containerRef.current) return;

    const initEmbed = () => {
      const twitch = getTwitch();
      if (!twitch?.Embed) return;
      if (embedRef.current) return;

      const parent = getEmbedParent();
      embedRef.current = new twitch.Embed(embedId, {
        width: "100%",
        height: "100%",
        channel: channel.trim(),
        layout: "video",
        autoplay: false,
        muted: false,
        parent: [parent],
      });

      const embed = embedRef.current;
      if (embed) {
        embed.addEventListener(twitch.Embed.VIDEO_READY, () => {
          const player = embed.getPlayer();
          if (player) player.play();
        });
      }
    };

    if (getTwitch()?.Embed) {
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
