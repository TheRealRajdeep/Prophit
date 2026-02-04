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

/** Stream list item with thumbnail for homepage/sidebar */
export interface LiveStreamItem {
    id: string;
    channelName: string;
    displayName: string;
    profileImageUrl: string | null;
    streamTitle: string | null;
    category: string | null;
    viewerCount: number;
    thumbnailUrl: string | null;
    language: string | null;
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
 * Get top live streams from Twitch (for homepage/sidebar)
 */
export async function getLiveStreams(limit = 20): Promise<LiveStreamItem[]> {
    const data = await twitchFetch<{ data: TwitchStream[] }>(
        `/streams?first=${Math.min(Math.max(limit, 1), 100)}`
    );

    if (!data.data?.length) return [];

    const userIds = data.data.map((s) => s.user_id).filter(Boolean);
    const usersData = await twitchFetch<{ data: TwitchUser[] }>(
        `/users?id=${userIds.map((id) => encodeURIComponent(id)).join("&id=")}`
    );
    const userMap = new Map(usersData.data.map((u) => [u.id, u]));

    return data.data.map((stream) => {
        const user = userMap.get(stream.user_id);
        const thumbnailUrl = stream.thumbnail_url
            ? stream.thumbnail_url.replace("{width}", "320").replace("{height}", "180")
            : null;
        return {
            id: stream.id,
            channelName: stream.user_login,
            displayName: stream.user_name,
            profileImageUrl: user?.profile_image_url ?? null,
            streamTitle: stream.title || null,
            category: stream.game_name || null,
            viewerCount: stream.viewer_count ?? 0,
            thumbnailUrl,
            language: stream.language?.toUpperCase() || null,
        };
    });
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
