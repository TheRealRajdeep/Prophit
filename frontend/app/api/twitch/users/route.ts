import { NextResponse } from "next/server";
import { getProfileImagesByLogin } from "@/lib/twitch";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const channelsParam = searchParams.get("channels");
    if (!channelsParam) {
      return NextResponse.json(
        { error: "channels query parameter is required (comma-separated)" },
        { status: 400 }
      );
    }
    const channels = channelsParam.split(",").map((c) => c.trim()).filter(Boolean);
    if (channels.length === 0) {
      return NextResponse.json({ profileImages: {} });
    }

    const profileImages = await getProfileImagesByLogin(channels);

    return NextResponse.json(
      { profileImages },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching Twitch users:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile images" },
      { status: 500 }
    );
  }
}
