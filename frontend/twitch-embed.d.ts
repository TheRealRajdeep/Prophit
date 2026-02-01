/* Twitch Embed APIs - https://dev.twitch.tv/docs/embed/ */

/** Embedding Everything - https://embed.twitch.tv/embed/v1.js */
interface TwitchEmbedOptions {
  width?: number | string;
  height?: number | string;
  channel?: string;
  video?: string;
  collection?: string;
  layout?: "video" | "video-with-chat";
  parent?: string[];
  autoplay?: boolean;
  muted?: boolean;
  theme?: "light" | "dark";
  time?: string;
}

interface TwitchEmbedInstance {
  addEventListener(event: string, callback: () => void): void;
  getPlayer(): TwitchPlayer;
}

interface TwitchEmbedConstructor {
  new (elementId: string, options: TwitchEmbedOptions): TwitchEmbedInstance;
  VIDEO_READY: string;
  VIDEO_PLAY: string;
}

/** Video & Clips - player.twitch.tv (optional, for reference) */
interface TwitchPlayer {
  play(): void;
  pause(): void;
  getPlayer(): TwitchPlayer;
}

declare global {
  interface Window {
    Twitch?: {
      Embed: TwitchEmbedConstructor;
      Player?: unknown;
    };
  }
}

declare namespace Twitch {
  type Embed = TwitchEmbedInstance;
}
