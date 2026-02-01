"use client";

import { usePrivy } from "@privy-io/react-auth";

function truncateAddress(address: string) {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function Header() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const walletAddress = user?.wallet?.address;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-200 bg-white/95 backdrop-blur supports-backdrop-filter:bg-white/80 dark:border-zinc-800 dark:bg-zinc-950/95 dark:supports-backdrop-filter:bg-zinc-950/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            App
          </span>
        </div>

        <div className="flex items-center gap-3">
          {ready && (
            <>
              {!authenticated ? (
                <button
                  type="button"
                  onClick={() => login()}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:focus:ring-zinc-500"
                >
                  Connect wallet
                </button>
              ) : (
                <>
                  {walletAddress && (
                    <span
                      className="rounded-full bg-zinc-100 px-3 py-1.5 font-mono text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                      title={walletAddress}
                    >
                      {truncateAddress(walletAddress)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => logout()}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:focus:ring-zinc-500"
                  >
                    Disconnect
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
