"use client";

import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { useCallback, useEffect, useState } from "react";
import { PREDICTION_FACTORY_ADDRESS } from "@/lib/constants";
import { PREDICTION_FACTORY_ABI, type PredictionStatus } from "@/lib/predictionFactoryAbi";
import { fetchApi, getApiUrl } from "@/lib/api";

const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

const STATUS_OPEN = 0;
const STATUS_LOCKED = 1;

type RawPrediction = {
  id: number;
  streamer: string;
  title: string;
  option1: string;
  option2: string;
  totalBetOption1: bigint;
  totalBetOption2: bigint;
  status: PredictionStatus;
};

export type OngoingPredictionItem = {
  id: number;
  title: string;
  channelName: string;
  channel: string; // for link href
  prices: string;
  volume: bigint;
  profileImageUrl: string | null;
};

function formatPrices(total1: bigint, total2: bigint): string {
  const total = total1 + total2;
  if (total === 0n) return "0.50/0.50";
  const p1 = Number(total1) / Number(total);
  const p2 = Number(total2) / Number(total);
  return `${p1.toFixed(2)}/${p2.toFixed(2)}`;
}

async function fetchAllPredictions(): Promise<RawPrediction[]> {
  const nextId = (await publicClient.readContract({
    address: PREDICTION_FACTORY_ADDRESS,
    abi: PREDICTION_FACTORY_ABI,
    functionName: "nextPredictionId",
  })) as bigint;
  const n = Number(nextId);
  const list: RawPrediction[] = [];
  for (let i = 0; i < n; i++) {
    const row = await publicClient.readContract({
      address: PREDICTION_FACTORY_ADDRESS,
      abi: PREDICTION_FACTORY_ABI,
      functionName: "predictions",
      args: [BigInt(i)],
    }) as readonly [bigint, string, string, string, string, bigint, bigint, number, number, bigint];
    list.push({
      id: i,
      streamer: (row[1] as string).toLowerCase(),
      title: row[2],
      option1: row[3],
      option2: row[4],
      totalBetOption1: row[5],
      totalBetOption2: row[6],
      status: row[7] as PredictionStatus,
    });
  }
  return list;
}

async function fetchStreamerChannels(): Promise<Map<string, string>> {
  const base = getApiUrl().replace(/\/$/, "");
  const res = await fetchApi(`${base}/api/streamer/channels`);
  if (!res.ok) return new Map();
  const data = (await res.json()) as { address: string; channel: string }[];
  return new Map(data.map(({ address, channel }) => [address.toLowerCase(), channel]));
}

export function useOngoingPredictions(limit = 10) {
  const [predictions, setPredictions] = useState<OngoingPredictionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const [rawList, channelMap] = await Promise.all([
        fetchAllPredictions(),
        fetchStreamerChannels(),
      ]);

      const filtered = rawList
        .filter((p) => p.status === STATUS_OPEN || p.status === STATUS_LOCKED)
        .filter((p) => {
          const channel = channelMap.get(p.streamer);
          return !!channel;
        })
        .map((p) => {
          const volume = p.totalBetOption1 + p.totalBetOption2;
          const channel = channelMap.get(p.streamer)!;
          return {
            id: p.id,
            title: p.title,
            channelName: channel,
            channel,
            prices: formatPrices(p.totalBetOption1, p.totalBetOption2),
            volume,
          };
        })
        .sort((a, b) => (b.volume > a.volume ? 1 : b.volume < a.volume ? -1 : 0))
        .slice(0, limit);

      const channelNames = [...new Set(filtered.map((p) => p.channel))];
      const profileRes = channelNames.length > 0
        ? await fetch(`/api/twitch/users?channels=${channelNames.map(encodeURIComponent).join(",")}`)
        : null;
      const profileImages: Record<string, string | null> =
        profileRes?.ok
          ? ((await profileRes.json()) as { profileImages?: Record<string, string | null> }).profileImages ?? {}
          : {};

      const ongoing = filtered.map((p) => ({
        ...p,
        profileImageUrl: profileImages[p.channel.toLowerCase()] ?? null,
      }));

      setPredictions(ongoing);
    } catch {
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Poll for updates (every 10s)
  useEffect(() => {
    const interval = setInterval(fetch, 10_000);
    return () => clearInterval(interval);
  }, [fetch]);

  return { predictions, loading, refetch: fetch };
}
