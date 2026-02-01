"use client";

import { useState, useCallback } from "react";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, createPublicClient, custom, http } from "viem";
import { base } from "viem/chains";
import type { Address } from "viem";
import { getOpenChannelsFromYellow, type YellowChannelInfo } from "./yellow";

/**
 * React hook for checking Yellow Network channels
 * 
 * Usage in components:
 * ```tsx
 * function MyComponent() {
 *   const { walletAddress } = usePrivy();
 *   const { checkChannels, channels, loading, error } = useYellowChannels();
 * 
 *   const handleCheckChannels = async () => {
 *     if (walletAddress) {
 *       await checkChannels(walletAddress as Address);
 *     }
 *   };
 * 
 *   return (
 *     <div>
 *       <button onClick={handleCheckChannels} disabled={loading}>
 *         Check Channels
 *       </button>
 *       {loading && <p>Loading...</p>}
 *       {error && <p>Error: {error}</p>}
 *       {channels.length > 0 && (
 *         <div>
 *           <h3>Open Channels: {channels.length}</h3>
 *           {channels.map(channel => (
 *             <div key={channel.channel_id}>
 *               <p>Channel ID: {channel.channel_id}</p>
 *               <p>Status: {channel.status}</p>
 *               <p>Amount: {channel.amount} USDC</p>
 *             </div>
 *           ))}
 *         </div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useYellowChannels() {
  const { wallets } = useWallets();
  const [channels, setChannels] = useState<YellowChannelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkChannels = useCallback(
    async (walletAddress: Address) => {
      if (wallets.length === 0) {
        setError("No wallet connected");
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Get the active wallet's provider
        const wallet = wallets[0];
        const provider = await wallet.getEthereumProvider();

        // Create wallet client from provider
        const walletClient = createWalletClient({
          account: walletAddress,
          chain: base,
          transport: custom(provider),
        });

        // Create public client
        const publicClient = createPublicClient({
          chain: base,
          transport: http(),
        });

        // Query channels from Yellow Network
        const openChannels = await getOpenChannelsFromYellow({
          walletAddress,
          walletClient: walletClient as any,
          publicClient: publicClient as any,
        });

        setChannels(openChannels);
        console.log(`Found ${openChannels.length} open channels`);
      } catch (err: any) {
        console.error("Error checking channels:", err);
        setError(err.message || "Failed to check channels");
        setChannels([]);
      } finally {
        setLoading(false);
      }
    },
    [wallets]
  );

  const hasOpenChannel = useCallback(
    (chainId?: number): boolean => {
      if (chainId) {
        return channels.some((c) => c.chain_id === chainId && c.status === "open");
      }
      return channels.length > 0;
    },
    [channels]
  );

  const getChannelByChainId = useCallback(
    (chainId: number): YellowChannelInfo | undefined => {
      return channels.find((c) => c.chain_id === chainId && c.status === "open");
    },
    [channels]
  );

  return {
    checkChannels,
    channels,
    loading,
    error,
    hasOpenChannel,
    getChannelByChainId,
  };
}
