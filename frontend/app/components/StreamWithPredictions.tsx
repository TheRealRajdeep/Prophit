"use client";

import { useCallback, useEffect, useState } from "react";
import { createWalletClient, custom, type WalletClient, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { useWallets } from "@privy-io/react-auth";
import { usePlatformWallet } from "@/lib/hooks";
import { apiStreamerUrl, apiUserUrl } from "@/lib/api";
import TwitchChat from "./TwitchChat";

type StreamWithPredictionsProps = {
  channel: string;
  className?: string;
  streamInfo: {
    displayName?: string;
    profileImageUrl?: string | null;
    streamTitle?: string | null;
    category?: string | null;
    language?: string | null;
    viewerCount?: string | number | null;
    streamDuration?: string;
    verified?: boolean;
  } | null;
};

export default function StreamWithPredictions({
  channel,
  className,
  streamInfo,
}: StreamWithPredictionsProps) {
  const { wallets } = useWallets();
  const { metamaskAddress, platformAddress } = usePlatformWallet();
  const currentAddress = (metamaskAddress ?? platformAddress) ?? null;

  const [streamerAddress, setStreamerAddress] = useState<Address | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [streamerLoading, setStreamerLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setStreamerLoading(true);
      try {
        const res = await fetch(apiStreamerUrl(channel));
        if (cancelled) return;
        if (!res.ok) {
          setStreamerAddress(null);
          setCanManage(false);
          return;
        }
        const data = await res.json();
        const addr = data?.address as Address | undefined;
        setStreamerAddress(addr ?? null);
        if (!addr || !currentAddress) {
          setCanManage(false);
          return;
        }
        const userRes = await fetch(apiUserUrl(currentAddress));
        if (cancelled) return;
        if (!userRes.ok) {
          setCanManage(addr.toLowerCase() === currentAddress.toLowerCase());
          return;
        }
        const user = await userRes.json();
        const isStreamer =
          user?.metamaskAddress?.toLowerCase() === addr?.toLowerCase();
        const modChannels: string[] = Array.isArray(user?.moderatorsFor)
          ? user.moderatorsFor
          : [];
        const isMod = modChannels.some(
          (c: string) => c?.trim().toLowerCase() === channel.trim().toLowerCase()
        );
        setCanManage(isStreamer || isMod);
      } catch {
        if (!cancelled) {
          setStreamerAddress(null);
          setCanManage(false);
        }
      } finally {
        if (!cancelled) setStreamerLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [channel, currentAddress]);

  const getWalletClient = useCallback(async (): Promise<WalletClient | null> => {
    const list = wallets ?? [];
    const w = list[0];
    if (!w || typeof (w as { getEthereumProvider?: () => Promise<unknown> }).getEthereumProvider !== "function")
      return null;
    // Force switch to Base Sepolia before any prediction tx
    if (typeof (w as { switchChain?: (chainId: number) => Promise<void> }).switchChain === "function") {
      await (w as { switchChain: (chainId: number) => Promise<void> }).switchChain(baseSepolia.id);
    }
    const provider = await (w as { getEthereumProvider: () => Promise<unknown> }).getEthereumProvider();
    if (!provider) return null;
    const address = (w as { address: string }).address as Address;
    return createWalletClient({
      transport: custom(provider as { request(...args: unknown[]): Promise<unknown> }),
      chain: baseSepolia,
      account: address,
    });
  }, [wallets]);

  return (
    <TwitchChat
      channel={channel}
      className={className}
      streamerAddress={streamerAddress}
      canManagePredictions={canManage && !!streamerAddress}
      getWalletClient={getWalletClient}
    />
  );
}
