import { NextResponse } from "next/server";
import { getStreamInfo } from "@/lib/twitch";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ channel: string }> }
) {
    try {
        const { channel } = await params;

        if (!channel) {
            return NextResponse.json(
                { error: "Channel parameter is required" },
                { status: 400 }
            );
        }

        const streamInfo = await getStreamInfo(channel);

        return NextResponse.json(streamInfo, {
            headers: {
                // Cache for 30 seconds to reduce API calls
                "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
            },
        });
    } catch (error) {
        console.error("Error fetching Twitch stream info:", error);
        return NextResponse.json(
            { error: "Failed to fetch stream info" },
            { status: 500 }
        );
    }
}
