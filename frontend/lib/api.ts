/**
 * Base URL for the backend API. Defaults to local backend when not set.
 */
export function getApiUrl(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  }
  return process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL ?? "http://localhost:3001";
}

export function apiUserUrl(address?: string): string {
  const base = getApiUrl().replace(/\/$/, "");
  if (address) return `${base}/api/user?address=${encodeURIComponent(address)}`;
  return `${base}/api/user`;
}

export function apiStreamerUrl(channel: string): string {
  const base = getApiUrl().replace(/\/$/, "");
  return `${base}/api/streamer?channel=${encodeURIComponent(channel)}`;
}

export function apiChatUrl(channel: string): string {
  const base = getApiUrl().replace(/\/$/, "");
  return `${base}/api/chat/${encodeURIComponent(channel)}`;
}

/** Fetch from backend API. Adds ngrok-skip-browser-warning when URL is ngrok (free tier). */
export async function fetchApi(url: string, init?: RequestInit): Promise<Response> {
  const isNgrok = /ngrok(-free)?\.(app|dev|io)/i.test(url) || url.includes("ngrok-free");
  const headers = new Headers(init?.headers);
  if (isNgrok) headers.set("ngrok-skip-browser-warning", "true");
  return fetch(url, { ...init, headers });
}
