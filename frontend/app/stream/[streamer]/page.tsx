import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import StreamerDetails from "../../components/StreamerDetails";
import TwitchChat from "../../components/TwitchChat";
import TwitchEmbed from "../../components/TwitchEmbed";
import { getStreamInfo, type StreamInfo } from "@/lib/twitch";
import type { Metadata } from "next";

type Props = {
  params: Promise<{ streamer: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { streamer } = await params;
  const name = decodeURIComponent(streamer);
  return {
    title: `${name} - Live on Twitch | Prophit`,
    description: `Watch ${name} live on Twitch`,
  };
}

async function fetchStreamInfo(channel: string): Promise<StreamInfo | null> {
  try {
    return await getStreamInfo(channel);
  } catch (error) {
    console.error("Error fetching stream info:", error);
    return null;
  }
}

export default async function StreamPage({ params }: Props) {
  const { streamer } = await params;
  const channel = decodeURIComponent(streamer);

  // Fetch real Twitch data
  const streamInfo = await fetchStreamInfo(channel);

  return (
    <div className="bg-app flex h-screen flex-col overflow-hidden font-sans text-zinc-100">
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-4">
            <div className="mb-2 flex items-center gap-2">
              <a
                href="/"
                className="rounded p-2 text-zinc-400 hover:bg-bg-elevated hover:text-accent-cyan transition-colors"
                aria-label="Back to home"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </a>
            </div>
            <div className="flex gap-4 overflow-hidden">
              {/* Player + streamer details */}
              <div className="min-w-0 flex-1 overflow-hidden rounded-lg border border-border-default ring-1 ring-border-subtle">
                <div
                  className="w-full overflow-hidden rounded-t-lg"
                  style={{
                    minHeight: 480,
                    height: "calc(100vh - 14rem)",
                  }}
                >
                  <TwitchEmbed channel={channel} />
                </div>
                <StreamerDetails
                  channel={streamInfo?.displayName || channel}
                  profileImageUrl={streamInfo?.profileImageUrl}
                  streamTitle={streamInfo?.streamTitle || `${channel} live stream`}
                  category={streamInfo?.category || "Just Chatting"}
                  language={streamInfo?.language || "EN"}
                  viewerCount={streamInfo?.viewerCount ?? "—"}
                  streamDuration="0:00"
                  verified={false}
                />
              </div>
              {/* Chat - custom styled, Twitch content only */}
              <aside className="hidden w-[380px] shrink-0 lg:block" aria-label="Chat">
                <TwitchChat channel={channel} className="h-full" />
              </aside>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

