"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, formatUnits, http } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { USDC_DECIMALS, USDC_BY_CHAIN } from "@/lib/constants";
import { usePlatformWallet } from "./usePlatformWallet";

const balanceOfAbi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const clients = {
  [baseSepolia.id]: createPublicClient({ chain: baseSepolia, transport: http() }),
  [sepolia.id]: createPublicClient({ chain: sepolia, transport: http() }),
};

/** USDC balance of the user's platform wallet across Base, Base Sepolia, and Sepolia (summed). */
export function usePlatformBalance() {
  const { platformAddress } = usePlatformWallet();
  const address = platformAddress;
  const [usdcBalance, setUsdcBalance] = useState<string>("0");
  const [loading, setLoading] = useState(true);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const refetch = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!address) {
      setUsdcBalance("0");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all(
      USDC_BY_CHAIN.map(({ chainId, address: tokenAddress }) => {
        const client = clients[chainId as keyof typeof clients];
        if (!client) return Promise.resolve(0n);
        return client
          .readContract({
            address: tokenAddress,
            abi: balanceOfAbi,
            functionName: "balanceOf",
            args: [address],
          })
          .catch(() => 0n);
      })
    )
      .then((amounts) => {
        if (cancelled) return;
        const total = amounts.reduce((a, b) => a + b, 0n);
        const formatted = formatUnits(total, USDC_DECIMALS);
        setUsdcBalance(Number(formatted).toFixed(2));
      })
      .catch(() => {
        if (!cancelled) setUsdcBalance("0");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address, refreshCounter]);

  return { usdcBalance, loading, address, refetch };
}
