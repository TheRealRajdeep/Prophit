"use client";

import { useCallback, useEffect, useState } from "react";
import { createPublicClient, formatUnits, http } from "viem";
import { baseSepolia, sepolia } from "viem/chains";
import { DEPOSIT_TOKENS_BY_CHAIN, type DepositTokenId } from "@/lib/constants";
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

/** USD value per token (1 unit). Stablecoins = 1, ETH/WETH from price API. */
function getUsdPerToken(tokenId: DepositTokenId, ethPriceUsd: number): number {
  if (tokenId === "usdc") return 1;
  if (tokenId === "eth" || tokenId === "weth") return ethPriceUsd;
  return 0;
}

/** Total balance in USD across all supported tokens (ETH, USDC, WETH). */
export function usePlatformBalance() {
  const { platformAddress } = usePlatformWallet();
  const address = platformAddress;
  const [usdcBalance, setUsdcBalance] = useState<string>("0");
  const [totalUsdBalance, setTotalUsdBalance] = useState<string>("0");
  const [loading, setLoading] = useState(true);
  const [refreshCounter, setRefreshCounter] = useState(0);

  const refetch = useCallback(() => {
    setRefreshCounter((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!address) {
      setUsdcBalance("0");
      setTotalUsdBalance("0");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const run = async () => {
      // Fetch ETH price and all balances in parallel
      const [priceRes, ...balanceResults] = await Promise.all([
        fetch("/api/prices").then((r) => r.json()).catch(() => ({ ethereum: 0 })),
        ...DEPOSIT_TOKENS_BY_CHAIN.flatMap(({ chainId, tokens }) =>
          tokens.map(async ({ id, address: tokenAddress, decimals }) => {
            const client = clients[chainId as keyof typeof clients];
            if (!client) return { id, amount: 0n, decimals };
            if (tokenAddress === null) {
              const balance = await client.getBalance({ address: address as `0x${string}` }).catch(() => 0n);
              return { id, amount: balance, decimals };
            }
            const balance = await client
              .readContract({
                address: tokenAddress,
                abi: balanceOfAbi,
                functionName: "balanceOf",
                args: [address],
              })
              .catch(() => 0n);
            return { id, amount: balance, decimals };
          })
        ),
      ]);

      if (cancelled) return;

      const ethPriceUsd = Number(priceRes?.ethereum ?? 0) || 0;

      let totalUsd = 0;
      let usdcTotal = 0n;

      let idx = 0;
      for (const { chainId, tokens } of DEPOSIT_TOKENS_BY_CHAIN) {
        for (const { id, decimals } of tokens) {
          const { amount } = balanceResults[idx] as { id: DepositTokenId; amount: bigint; decimals: number };
          idx++;
          const human = Number(formatUnits(amount, decimals));
          const usdPerUnit = getUsdPerToken(id, ethPriceUsd);
          totalUsd += human * usdPerUnit;
          if (id === "usdc") usdcTotal += amount;
        }
      }

      setUsdcBalance(Number(formatUnits(usdcTotal, 6)).toFixed(2));
      setTotalUsdBalance(totalUsd.toFixed(2));
    };

    run()
      .catch(() => {
        if (!cancelled) {
          setUsdcBalance("0");
          setTotalUsdBalance("0");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [address, refreshCounter]);

  return { usdcBalance, totalUsdBalance, loading, address, refetch };
}
