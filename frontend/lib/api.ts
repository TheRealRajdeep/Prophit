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
