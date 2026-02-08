"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, createWalletClient, custom, http, type WalletClient, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { useWallets } from "@privy-io/react-auth";
import { usePlatformWallet } from "@/lib/hooks";
import { apiStreamerUrl, apiUserUrl, fetchApi } from "@/lib/api";
import { PREDICTION_FACTORY_ADDRESS } from "@/lib/constants";
import { PREDICTION_FACTORY_ABI } from "@/lib/predictionFactoryAbi";
import TwitchChat from "./TwitchChat";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

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
  const { platformAddress, ensurePlatformWallet } = usePlatformWallet();
  // Use embedded wallet for all prediction operations (create, lock, resolve, cancel, bet, claim)
  const currentAddress = platformAddress ?? null;

  const [streamerAddress, setStreamerAddress] = useState<Address | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [streamerLoading, setStreamerLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setStreamerLoading(true);
      try {
        const res = await fetchApi(apiStreamerUrl(channel));
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
        const userRes = await fetchApi(apiUserUrl(currentAddress));
        if (cancelled) return;
        if (!userRes.ok) {
          const isStreamerDirect = addr.toLowerCase() === currentAddress.toLowerCase();
          let isOnChainMod = false;
          if (!isStreamerDirect) {
            try {
              isOnChainMod = await publicClient.readContract({
                address: PREDICTION_FACTORY_ADDRESS,
                abi: PREDICTION_FACTORY_ABI,
                functionName: "streamerModerators",
                args: [addr, currentAddress],
              });
            } catch {
              /* ignore */
            }
          }
          setCanManage(isStreamerDirect || isOnChainMod);
          return;
        }
        const user = await userRes.json();
        const isStreamer =
          user?.privyAddress?.toLowerCase() === addr?.toLowerCase();
        const modChannels: string[] = Array.isArray(user?.moderatorsFor)
          ? user.moderatorsFor
          : [];
        const isModFromBackend = modChannels.some(
          (c: string) => c?.trim().toLowerCase() === channel.trim().toLowerCase()
        );
        // Also check on-chain moderator status (streamer adds via addStreamerModerator)
        let isOnChainModerator = false;
        try {
          isOnChainModerator = await publicClient.readContract({
            address: PREDICTION_FACTORY_ADDRESS,
            abi: PREDICTION_FACTORY_ABI,
            functionName: "streamerModerators",
            args: [addr, currentAddress],
          });
        } catch {
          // Ignore RPC errors; fall back to backend-only check
        }
        setCanManage(isStreamer || isModFromBackend || isOnChainModerator);
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

  const createWalletClientFromTarget = useCallback(
    async (
      target: { getEthereumProvider?: () => Promise<unknown>; address?: string; switchChain?: (chainId: number) => Promise<void> } | undefined
    ): Promise<WalletClient | null> => {
      if (!target || typeof target.getEthereumProvider !== "function") return null;
      if (typeof target.switchChain === "function") {
        await target.switchChain(baseSepolia.id);
      }
      const provider = await target.getEthereumProvider();
      if (!provider) return null;
      const address = target.address as Address | undefined;
      if (!address) return null;
      const rawProvider = provider as { request(...args: unknown[]): Promise<unknown> };
      const wrappedProvider = {
        request: async (args: { method: string; params?: unknown[] }) => {
          if (args.method === "wallet_sendTransaction" && args.params?.[0]) {
            return rawProvider.request({
              method: "eth_sendTransaction",
              params: [args.params[0]],
            });
          }
          return rawProvider.request(args);
        },
      };
      return createWalletClient({
        transport: custom(wrappedProvider),
        chain: baseSepolia,
        account: address,
      });
    },
    []
  );

  /** For all prediction operations (create, lock, resolve, cancel, bet, claim): use embedded wallet. */
  const getWalletClientForOperations = useCallback(async (): Promise<WalletClient | null> => {
    if (!platformAddress) return null;
    await ensurePlatformWallet();
    const list = wallets ?? [];
    const embedded = (list as { address?: string; walletClientType?: string; getEthereumProvider?: () => Promise<unknown>; switchChain?: (chainId: number) => Promise<void> }[]).find(
      (x) =>
        x?.address?.toLowerCase() === platformAddress.toLowerCase() &&
        (x?.walletClientType === "privy" || x?.walletClientType === "privy-v2")
    );
    if (!embedded) {
      const fallback = (list as { address?: string; getEthereumProvider?: () => Promise<unknown>; switchChain?: (chainId: number) => Promise<void> }[]).find(
        (x) => x?.address?.toLowerCase() === platformAddress.toLowerCase()
      );
      if (!fallback || typeof fallback.getEthereumProvider !== "function") return null;
      return createWalletClientFromTarget(fallback);
    }
    return createWalletClientFromTarget(embedded);
  }, [wallets, platformAddress, ensurePlatformWallet, createWalletClientFromTarget]);

  return (
    <div className={`relative h-full w-full overflow-hidden ${className ?? ""}`}>
      <TwitchChat
        channel={channel}
        className="h-full"
        streamerAddress={streamerAddress}
        canManagePredictions={canManage && !!streamerAddress}
        getWalletClient={getWalletClientForOperations}
        getWalletClientForBetting={getWalletClientForOperations}
      />
    </div>
  );
}
