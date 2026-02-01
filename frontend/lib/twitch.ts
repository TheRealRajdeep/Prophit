/**
 * Twitch API utility functions
 * Uses OAuth Client Credentials flow to fetch public stream data
 */

const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID!;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET!;

interface TwitchAccessToken {
    access_token: string;
    expires_in: number;
    token_type: string;
}

interface TwitchUser {
    id: string;
    login: string;
    display_name: string;
    profile_image_url: string;
    broadcaster_type: string;
    description: string;
}

interface TwitchStream {
    id: string;
    user_id: string;
    user_login: string;
    user_name: string;
    game_id: string;
    game_name: string;
    type: string;
    title: string;
    viewer_count: number;
    started_at: string;
    language: string;
    thumbnail_url: string;
    tags: string[];
}

export interface StreamInfo {
    isLive: boolean;
    channelName: string;
    displayName: string;
    profileImageUrl: string | null;
    streamTitle: string | null;
    category: string | null;
    viewerCount: number | null;
    language: string | null;
    startedAt: string | null;
}

// Cache the access token in memory
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get an app access token using client credentials flow
 */
async function getAppAccessToken(): Promise<string> {
    // Return cached token if still valid (with 5min buffer)
    if (cachedToken && Date.now() < cachedToken.expiresAt - 300000) {
        return cachedToken.token;
    }

    const response = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            client_id: TWITCH_CLIENT_ID,
            client_secret: TWITCH_CLIENT_SECRET,
            grant_type: "client_credentials",
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to get Twitch access token: ${response.status}`);
    }

    const data: TwitchAccessToken = await response.json();

    cachedToken = {
        token: data.access_token,
        expiresAt: Date.now() + data.expires_in * 1000,
    };

    return data.access_token;
}

/**
 * Make an authenticated request to Twitch Helix API
 */
async function twitchFetch<T>(endpoint: string): Promise<T> {
    const token = await getAppAccessToken();

    const response = await fetch(`https://api.twitch.tv/helix${endpoint}`, {
        headers: {
            Authorization: `Bearer ${token}`,
            "Client-Id": TWITCH_CLIENT_ID,
        },
    });

    if (!response.ok) {
        throw new Error(`Twitch API error: ${response.status}`);
    }

    return response.json();
}

/**
 * Get user/channel info by login name
 */
async function getUser(login: string): Promise<TwitchUser | null> {
    const data = await twitchFetch<{ data: TwitchUser[] }>(
        `/users?login=${encodeURIComponent(login)}`
    );
    return data.data[0] || null;
}

/**
 * Get live stream info for a channel
 */
async function getStream(login: string): Promise<TwitchStream | null> {
    const data = await twitchFetch<{ data: TwitchStream[] }>(
        `/streams?user_login=${encodeURIComponent(login)}`
    );
    return data.data[0] || null;
}

/**
 * Get complete stream info for a channel (combines user + stream data)
 */
export async function getStreamInfo(channel: string): Promise<StreamInfo> {
    // Fetch user and stream data in parallel
    const [user, stream] = await Promise.all([
        getUser(channel),
        getStream(channel),
    ]);

    if (!user) {
        return {
            isLive: false,
            channelName: channel,
            displayName: channel,
            profileImageUrl: null,
            streamTitle: null,
            category: null,
            viewerCount: null,
            language: null,
            startedAt: null,
        };
    }

    const isLive = stream?.type === "live";

    return {
        isLive,
        channelName: user.login,
        displayName: user.display_name,
        profileImageUrl: user.profile_image_url,
        streamTitle: stream?.title || null,
        category: stream?.game_name || null,
        viewerCount: stream?.viewer_count ?? null,
        language: stream?.language?.toUpperCase() || null,
        startedAt: stream?.started_at || null,
    };
}
