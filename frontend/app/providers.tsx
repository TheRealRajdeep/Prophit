"use client";

import { baseSepolia } from "viem/chains";
import { EnsUsernameGate } from "@/app/components/EnsUsernameGate";
import { PrivyProvider, useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useEffect, useRef } from "react";

type PrivyWalletLite = {
  address: string;
  walletClientType?: string;
};

function isPrivyWalletLite(w: unknown): w is PrivyWalletLite {
  return (
    typeof w === "object" &&
    w !== null &&
    "address" in w &&
    typeof (w as { address?: unknown }).address === "string"
  );
}

function EmbeddedWalletBootstrapper() {
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated) return;
    if (ranRef.current) return;

    const hasEmbedded = (wallets ?? []).some(
      (w) =>
        isPrivyWalletLite(w) &&
        (w.walletClientType === "privy" || w.walletClientType === "privy-v2")
    );
    if (hasEmbedded) {
      ranRef.current = true;
      return;
    }

    ranRef.current = true;
    // Some apps/login flows don't trigger automatic wallet creation (e.g. custom flows,
    // whitelabel UIs, or inconsistent dashboard config). Make it deterministic here.
    createWallet().catch((e) => console.warn("Privy: could not auto-create embedded wallet", e));
  }, [ready, authenticated, wallets, createWallet]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const clientId = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID;

  if (!appId || !clientId) {
    console.warn(
      "Privy: Set NEXT_PUBLIC_PRIVY_APP_ID and NEXT_PUBLIC_PRIVY_CLIENT_ID in .env.local"
    );
  }

  return (
    <PrivyProvider
      appId={appId ?? ""}
      clientId={clientId ?? ""}
      config={{
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
        loginMethods: ["email", "wallet", "google"],
        appearance: {
          theme: "dark",
          accentColor: "#3D3B8E",
        },
      }}
    >
      <EmbeddedWalletBootstrapper />
      <EnsUsernameGate />
      {children}
    </PrivyProvider>
  );
}
