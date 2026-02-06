"use client";

import {
  createPublicClient,
  type WalletClient,
  http,
  type Address,
  type Hash,
} from "viem";
import { baseSepolia } from "viem/chains";
import { useCallback, useEffect, useState } from "react";
import {
  PREDICTION_FACTORY_ADDRESS,
  BASE_SEPOLIA_CHAIN_ID,
} from "@/lib/constants";
import {
  PREDICTION_FACTORY_ABI,
  type PredictionStatus,
} from "@/lib/predictionFactoryAbi";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

export type Prediction = {
  id: number;
  streamer: Address;
  title: string;
  option1: string;
  option2: string;
  totalBetOption1: bigint;
  totalBetOption2: bigint;
  status: PredictionStatus;
  winningOption: number;
  lockTimestamp: bigint;
};

const STATUS_OPEN = 0;
const STATUS_LOCKED = 1;
const STATUS_RESOLVED = 2;
const STATUS_CANCELLED = 3;

export function predictionStatusLabel(status: PredictionStatus): string {
  switch (status) {
    case STATUS_OPEN:
      return "Open";
    case STATUS_LOCKED:
      return "Locked";
    case STATUS_RESOLVED:
      return "Resolved";
    case STATUS_CANCELLED:
      return "Cancelled";
    default:
      return "Unknown";
  }
}

export function isLive(status: PredictionStatus): boolean {
  return status === STATUS_OPEN || status === STATUS_LOCKED;
}

export function canLock(status: PredictionStatus): boolean {
  return status === STATUS_OPEN;
}

export function canResolve(status: PredictionStatus): boolean {
  return status === STATUS_LOCKED;
}

export function canCancel(status: PredictionStatus): boolean {
  return status === STATUS_OPEN || status === STATUS_LOCKED;
}

type UsePredictionsOptions = {
  /** Provide a function that returns the wallet client for sending tx (e.g. from Privy). */
  getWalletClient?: () => Promise<WalletClient | null>;
};

export function usePredictions(
  streamerAddress: Address | null,
  options: UsePredictionsOptions = {}
) {
  const { getWalletClient } = options;
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPredictions = useCallback(async () => {
    if (!streamerAddress) {
      setPredictions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const nextId = (await publicClient.readContract({
        address: PREDICTION_FACTORY_ADDRESS,
        abi: PREDICTION_FACTORY_ABI,
        functionName: "nextPredictionId",
      })) as bigint;
      const n = Number(nextId);
      const list: Prediction[] = [];
      for (let i = 0; i < n; i++) {
        const row = await publicClient.readContract({
          address: PREDICTION_FACTORY_ADDRESS,
          abi: PREDICTION_FACTORY_ABI,
          functionName: "predictions",
          args: [BigInt(i)],
        }) as readonly [bigint, string, string, string, string, bigint, bigint, number, number, bigint];
        const streamer = row[1].toLowerCase();
        const target = streamerAddress.toLowerCase();
        if (streamer !== target) continue;
        list.push({
          id: i,
          streamer: row[1] as Address,
          title: row[2],
          option1: row[3],
          option2: row[4],
          totalBetOption1: row[5],
          totalBetOption2: row[6],
          status: row[7] as PredictionStatus,
          winningOption: row[8],
          lockTimestamp: row[9],
        });
      }
      list.reverse();
      setPredictions(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load predictions");
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, [streamerAddress]);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  const write = useCallback(
    async (
      fn: "createPrediction" | "lockPrediction" | "resolvePrediction" | "cancelPrediction",
      args: unknown[]
    ): Promise<Hash | null> => {
      const walletClient = getWalletClient ? await getWalletClient() : null;
      if (!walletClient?.account) {
        throw new Error("Connect a wallet to perform this action");
      }
      const hash = await walletClient.writeContract({
        address: PREDICTION_FACTORY_ADDRESS,
        abi: PREDICTION_FACTORY_ABI,
        functionName: fn,
        args: args as never[],
        chain: baseSepolia,
        account: walletClient.account,
      });
      return hash;
    },
    [getWalletClient]
  );

  const createPrediction = useCallback(
    async (
      streamer: Address,
      title: string,
      option1: string,
      option2: string
    ): Promise<Hash | null> => {
      const hash = await write("createPrediction", [
        streamer,
        title,
        option1,
        option2,
      ]);
      if (hash) await fetchPredictions();
      return hash;
    },
    [write, fetchPredictions]
  );

  const lockPrediction = useCallback(
    async (predictionId: number): Promise<Hash | null> => {
      const hash = await write("lockPrediction", [BigInt(predictionId)]);
      if (hash) await fetchPredictions();
      return hash;
    },
    [write, fetchPredictions]
  );

  const resolvePrediction = useCallback(
    async (predictionId: number, winningOption: 1 | 2): Promise<Hash | null> => {
      const hash = await write("resolvePrediction", [
        BigInt(predictionId),
        winningOption,
      ]);
      if (hash) await fetchPredictions();
      return hash;
    },
    [write, fetchPredictions]
  );

  const cancelPrediction = useCallback(
    async (predictionId: number): Promise<Hash | null> => {
      const hash = await write("cancelPrediction", [BigInt(predictionId)]);
      if (hash) await fetchPredictions();
      return hash;
    },
    [write, fetchPredictions]
  );

  return {
    predictions,
    loading,
    error,
    refetch: fetchPredictions,
    createPrediction,
    lockPrediction,
    resolvePrediction,
    cancelPrediction,
    chainId: BASE_SEPOLIA_CHAIN_ID,
  };
}

export async function checkCanManagePrediction(
  predictionId: number,
  account: Address
): Promise<boolean> {
  return publicClient.readContract({
    address: PREDICTION_FACTORY_ADDRESS,
    abi: PREDICTION_FACTORY_ABI,
    functionName: "canManagePrediction",
    args: [BigInt(predictionId), account],
  }) as Promise<boolean>;
}
