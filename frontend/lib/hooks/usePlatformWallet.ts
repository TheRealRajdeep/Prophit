"use client";

import { useCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { useCallback, useMemo, useState } from "react";

type LinkedWallet = {
  type: string;
  address: string;
  walletClientType?: string;
  walletIndex?: number | null;
};

type PrivyWalletLite = {
  address: string;
  walletClientType?: string;
  walletIndex?: number | null;
  hdWalletIndex?: number | null;
};

function isPrivyWalletLite(w: unknown): w is PrivyWalletLite {
  return (
    typeof w === "object" &&
    w !== null &&
    "address" in w &&
    typeof (w as { address?: unknown }).address === "string"
  );
}

function getEmbeddedWalletsFromWallets(wallets: unknown[]): LinkedWallet[] {
  const w = (wallets || []).filter(isPrivyWalletLite);
  // Privy wallet objects are not identical to linkedAccounts; normalize to what we need.
  const normalized: LinkedWallet[] = w.map((x) => ({
    type: "wallet",
    address: x.address,
    walletClientType: x.walletClientType,
    walletIndex: x.walletIndex ?? x.hdWalletIndex ?? null,
  }));

  return normalized
    .filter(
      (a) =>
        a.type === "wallet" &&
        (a.walletClientType === "privy" || a.walletClientType === "privy-v2")
    )
    .sort((a, b) => (a.walletIndex ?? 0) - (b.walletIndex ?? 0));
}

function getEmbeddedWalletsFromLinkedAccounts(linkedAccounts: unknown[]): LinkedWallet[] {
  const wallets = (linkedAccounts || []) as LinkedWallet[];
  return wallets
    .filter(
      (a) =>
        a.type === "wallet" &&
        (a.walletClientType === "privy" || a.walletClientType === "privy-v2")
    )
    .sort((a, b) => (a.walletIndex ?? 0) - (b.walletIndex ?? 0));
}

/**
 * Resolves the user's embedded wallet address.
 *
 * This app should only use ONE embedded wallet per user. We therefore always
 * select the first embedded wallet and never create additional wallets.
 */
export function usePlatformWallet() {
  const { user } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [creating, setCreating] = useState(false);

  const embeddedWallets = useMemo(
    () => {
      const fromWallets = getEmbeddedWalletsFromWallets(wallets ?? []);
      if (fromWallets.length > 0) return fromWallets;
      return getEmbeddedWalletsFromLinkedAccounts(user?.linkedAccounts ?? []);
    },
    [wallets, user?.linkedAccounts]
  );

  const embeddedWallet = useMemo(() => embeddedWallets[0] ?? null, [embeddedWallets]);

  const mainAddress = user?.wallet?.address ?? null;
  const platformAddress =
    embeddedWallet?.address ?? (mainAddress as `0x${string}` | null);
  const hasDedicatedPlatformWallet = true;

  const ensurePlatformWallet = useCallback(async () => {
    if (!user || creating) return;
    // Ensure the user's *single* embedded wallet exists.
    if (embeddedWallets.length > 0) return;
    setCreating(true);
    try {
      await createWallet();
    } catch (e) {
      console.warn("Could not create embedded wallet:", e);
    } finally {
      setCreating(false);
    }
  }, [user, creating, embeddedWallets, createWallet]);

  return {
    platformAddress: platformAddress as `0x${string}` | null,
    mainAddress,
    hasDedicatedPlatformWallet,
    ensurePlatformWallet,
    creating,
    embeddedCount: embeddedWallets.length,
  };
}
