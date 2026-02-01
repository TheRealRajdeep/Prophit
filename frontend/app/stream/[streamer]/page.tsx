import Header from "../../components/Header";
import Sidebar from "../../components/Sidebar";
import TwitchEmbed from "../../components/TwitchEmbed";
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

export default async function StreamPage({ params }: Props) {
  const { streamer } = await params;
  const channel = decodeURIComponent(streamer);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-100">
      <Header />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-4">
            <div className="mb-2 flex items-center gap-2">
              <a
                href="/"
                className="rounded p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
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
              <h1 className="text-lg font-bold text-white">
                {channel}
                <span className="ml-2 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold uppercase text-white">
                  Live
                </span>
              </h1>
            </div>
            <div
              className="w-full"
              style={{
                minHeight: 480,
                height: "calc(100vh - 12rem)",
              }}
            >
              <TwitchEmbed channel={channel} />
            </div>
            <p className="mt-3 text-sm text-zinc-500">
              Twitch requires HTTPS. For local dev run <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">npm run dev:https</code> and open{" "}
              <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300">https://localhost:3000</code>. If the player fails,{" "}
              <a
                href={`https://www.twitch.tv/${encodeURIComponent(channel)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#9146FF] hover:underline"
              >
                watch on Twitch
              </a>
              .
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
