"use client";

import {
  createPublicClient,
  type WalletClient,
  http,
  type Address,
  type Hash,
  encodeFunctionData,
  parseUnits,
  formatUnits,
  BaseError,
  ContractFunctionRevertedError,
} from "viem";
import { baseSepolia } from "viem/chains";
import { useCallback, useEffect, useState } from "react";
import {
  PREDICTION_FACTORY_ADDRESS,
  USDC_BASE_SEPOLIA,
  BASE_SEPOLIA_CHAIN_ID,
  PREDICTION_FACTORY_DEPLOY_BLOCK,
} from "@/lib/constants";
import { ERC20_APPROVE_ABI } from "@/lib/erc20Abi";
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

/** Maps contract revert error names to user-friendly messages. */
function revertErrorToMessage(errorName: string | undefined): string {
  if (!errorName) return "Transaction failed. You may not have permission, or the prediction may not exist.";
  switch (errorName) {
    case "PredictionNotFound":
      return "Prediction not found. It may have been created on a different contract or the ID is invalid.";
    case "Unauthorized":
      return "You don't have permission to manage this prediction. Only the streamer or an on-chain moderator can lock, resolve, or cancel.";
    case "InvalidStatus":
      return "Invalid state: this prediction is already locked, resolved, or cancelled.";
    case "InvalidOption":
      return "Invalid option selected.";
    case "InvalidAmount":
      return "Invalid amount.";
    case "NoBetToClaim":
      return "No bet to claim.";
    case "TransferFailed":
      return "Token transfer failed.";
    default:
      return `Transaction failed: ${errorName}`;
  }
}

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
  /** For betting: use Privy embedded wallet so ETH is deducted from the user's Privy balance. Falls back to getWalletClient if not provided. */
  getWalletClientForBetting?: () => Promise<WalletClient | null>;
};

export function usePredictions(
  streamerAddress: Address | null,
  options: UsePredictionsOptions = {}
) {
  const { getWalletClient, getWalletClientForBetting } = options;
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPredictions = useCallback(async (silent = false) => {
    if (!streamerAddress) {
      setPredictions([]);
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }
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
      if (!silent) setError(e instanceof Error ? e.message : "Failed to load predictions");
      setPredictions([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [streamerAddress]);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  // Poll for updates when others bet (every 5s, silent to avoid loading flash)
  useEffect(() => {
    if (!streamerAddress) return;
    const interval = setInterval(() => fetchPredictions(true), 5_000);
    return () => clearInterval(interval);
  }, [streamerAddress, fetchPredictions]);

  const write = useCallback(
    async (
      fn: "createPrediction" | "lockPrediction" | "resolvePrediction" | "cancelPrediction",
      args: unknown[]
    ): Promise<Hash | null> => {
      const walletClient = getWalletClient ? await getWalletClient() : null;
      if (!walletClient?.account) {
        throw new Error("Connect your Privy wallet to perform this action");
      }
      type WriteArgs =
        | readonly [bigint]
        | readonly [Address, string, string, string]
        | readonly [bigint, number];
      const account = walletClient.account;
      const writeArgs = args as unknown as WriteArgs;
      try {
        // Simulate first to get a clear revert reason if it fails
        await publicClient.simulateContract({
          account,
          address: PREDICTION_FACTORY_ADDRESS,
          abi: PREDICTION_FACTORY_ABI,
          functionName: fn,
          args: writeArgs,
        });
      } catch (err) {
        if (err instanceof BaseError) {
          const revertError = err.walk(
            (e): e is ContractFunctionRevertedError => e instanceof ContractFunctionRevertedError
          );
          if (revertError) {
            const errorName = revertError.data?.errorName;
            const msg = revertErrorToMessage(typeof errorName === "string" ? errorName : undefined);
            throw new Error(msg);
          }
        }
        throw err;
      }
      const data = encodeFunctionData({
        abi: PREDICTION_FACTORY_ABI,
        functionName: fn,
        args: writeArgs,
      });
      const gas = await publicClient.estimateGas({
        account,
        to: PREDICTION_FACTORY_ADDRESS,
        data,
      });
      const hash = await walletClient.writeContract({
        address: PREDICTION_FACTORY_ADDRESS,
        abi: PREDICTION_FACTORY_ABI,
        functionName: fn,
        args: writeArgs,
        chain: baseSepolia,
        account,
        gas: gas + BigInt(5000), // add buffer for safety
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

  const placeBet = useCallback(
    async (
      predictionId: number,
      option: 1 | 2,
      amountUsdc: string
    ): Promise<Hash | null> => {
      const getClient = getWalletClientForBetting ?? getWalletClient;
      const walletClient = getClient ? await getClient() : null;
      if (!walletClient?.account) {
        throw new Error("Connect your Privy wallet to place a bet");
      }
      const amount = parseUnits(amountUsdc, 6);
      if (amount === 0n) {
        throw new Error("Bet amount must be greater than 0");
      }
      // 0. Check USDC balance on Base Sepolia (predictions use Base Sepolia only)
      const balance = (await publicClient.readContract({
        address: USDC_BASE_SEPOLIA as Address,
        abi: ERC20_APPROVE_ABI,
        functionName: "balanceOf",
        args: [walletClient.account.address],
      })) as bigint;
      if (balance < amount) {
        const have = formatUnits(balance, 6);
        const need = formatUnits(amount, 6);
        throw new Error(
          `Insufficient USDC on Base Sepolia. You need ${need} USDC but have ${have}. ` +
            `Deposit USDC to your wallet on Base Sepolia (use the Transfer Crypto / Deposit button). ` +
            `Note: Balance from other chains (e.g. Sepolia) cannot be used for predictions.`
        );
      }
      try {
        // 1. Approve USDC spend to the prediction factory
        const approveHash = await walletClient.writeContract({
          address: USDC_BASE_SEPOLIA as Address,
          abi: ERC20_APPROVE_ABI,
          functionName: "approve",
          args: [PREDICTION_FACTORY_ADDRESS, amount],
          chain: baseSepolia,
          account: walletClient.account,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        // 2. Place bet (contract transfers USDC from user)
        const data = encodeFunctionData({
          abi: PREDICTION_FACTORY_ABI,
          functionName: "placeBet",
          args: [BigInt(predictionId), option, amount],
        });
        const gas = await publicClient.estimateGas({
          account: walletClient.account,
          to: PREDICTION_FACTORY_ADDRESS,
          data,
        });
        const hash = await walletClient.writeContract({
          address: PREDICTION_FACTORY_ADDRESS,
          abi: PREDICTION_FACTORY_ABI,
          functionName: "placeBet",
          args: [BigInt(predictionId), option, amount],
          chain: baseSepolia,
          account: walletClient.account,
          gas: gas + BigInt(5000),
        });
        if (hash) {
          await publicClient.waitForTransactionReceipt({ hash });
          await fetchPredictions();
        }
        return hash;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("transfer amount exceeds balance") ||
          msg.includes("exceeds balance") ||
          msg.includes("ERC20: transfer amount exceeds balance")
        ) {
          const have = formatUnits(balance, 6);
          const need = formatUnits(amount, 6);
          throw new Error(
            `Insufficient USDC on Base Sepolia. You need ${need} USDC but have ${have}. ` +
              `Deposit USDC to your wallet on Base Sepolia (use Transfer Crypto). ` +
              `Your total balance may include funds on other chains—predictions use Base Sepolia only.`
          );
        }
        throw err;
      }
    },
    [getWalletClient, getWalletClientForBetting, fetchPredictions]
  );

  const claimWinnings = useCallback(
    async (predictionId: number): Promise<Hash | null> => {
      const getClient = getWalletClientForBetting ?? getWalletClient;
      const walletClient = getClient ? await getClient() : null;
      if (!walletClient?.account) {
        throw new Error("Connect your Privy wallet to claim winnings");
      }
      const data = encodeFunctionData({
        abi: PREDICTION_FACTORY_ABI,
        functionName: "claimWinnings",
        args: [BigInt(predictionId)],
      });
      try {
        await publicClient.simulateContract({
          account: walletClient.account,
          address: PREDICTION_FACTORY_ADDRESS,
          abi: PREDICTION_FACTORY_ABI,
          functionName: "claimWinnings",
          args: [BigInt(predictionId)],
        });
      } catch (err) {
        if (err instanceof BaseError) {
          const revertError = err.walk(
            (e): e is ContractFunctionRevertedError => e instanceof ContractFunctionRevertedError
          );
          if (revertError) {
            const errorName = revertError.data?.errorName;
            const msg = revertErrorToMessage(typeof errorName === "string" ? errorName : undefined);
            throw new Error(msg);
          }
        }
        throw err;
      }
      const gas = await publicClient.estimateGas({
        account: walletClient.account,
        to: PREDICTION_FACTORY_ADDRESS,
        data,
      });
      const hash = await walletClient.writeContract({
        address: PREDICTION_FACTORY_ADDRESS,
        abi: PREDICTION_FACTORY_ABI,
        functionName: "claimWinnings",
        args: [BigInt(predictionId)],
        chain: baseSepolia,
        account: walletClient.account,
        gas: gas + BigInt(5000),
      });
      if (hash) {
        await publicClient.waitForTransactionReceipt({ hash });
        await fetchPredictions();
      }
      return hash;
    },
    [getWalletClientForBetting, getWalletClient, fetchPredictions]
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
    placeBet,
    claimWinnings,
    chainId: BASE_SEPOLIA_CHAIN_ID,
  };
}

export async function getPayout(predictionId: number, userAddress: Address): Promise<bigint> {
  return publicClient.readContract({
    address: PREDICTION_FACTORY_ADDRESS,
    abi: PREDICTION_FACTORY_ABI,
    functionName: "getPayout",
    args: [BigInt(predictionId), userAddress],
  }) as Promise<bigint>;
}

export type UserBetOutcome = "won" | "lost" | "no_bet";

export async function getUserBetOutcome(
  predictionId: number,
  userAddress: Address,
  winningOption: 1 | 2
): Promise<{ outcome: UserBetOutcome; betOnOption: 1 | 2 | null; amount: bigint }> {
  const [bet1, bet2] = await Promise.all([
    publicClient.readContract({
      address: PREDICTION_FACTORY_ADDRESS,
      abi: PREDICTION_FACTORY_ABI,
      functionName: "userBets",
      args: [BigInt(predictionId), userAddress, 1],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: PREDICTION_FACTORY_ADDRESS,
      abi: PREDICTION_FACTORY_ABI,
      functionName: "userBets",
      args: [BigInt(predictionId), userAddress, 2],
    }) as Promise<bigint>,
  ]);
  const winningBet = winningOption === 1 ? bet1 : bet2;
  const losingBet = winningOption === 1 ? bet2 : bet1;
  if (winningBet > 0n) {
    return { outcome: "won", betOnOption: winningOption, amount: winningBet };
  }
  if (losingBet > 0n) {
    return { outcome: "lost", betOnOption: (winningOption === 1 ? 2 : 1) as 1 | 2, amount: losingBet };
  }
  return { outcome: "no_bet", betOnOption: null, amount: 0n };
}

export type TopScorer = { address: Address; amount: bigint } | null;

export async function getTopScorer(
  predictionId: number,
  winningOption: 1 | 2
): Promise<TopScorer> {
  const logs = await getBetPlacedLogs(predictionId);
  const byUser = new Map<string, bigint>();
  for (const log of logs) {
    if (log.args.option !== winningOption || !log.args.user) continue;
    const addr = log.args.user.toLowerCase();
    const amt = log.args.amount ?? 0n;
    byUser.set(addr, (byUser.get(addr) ?? 0n) + amt);
  }
  let top: TopScorer = null;
  for (const [addr, amt] of byUser) {
    if (!top || amt > top.amount) {
      top = { address: addr as Address, amount: amt };
    }
  }
  return top;
}

const EVENT_CHUNK_SIZE = 2000n; // RPCs often limit getLogs to ~2000 blocks

async function getBetPlacedLogs(predictionId: number) {
  const logs: Awaited<ReturnType<typeof publicClient.getContractEvents>> = [];
  let fromBlock = PREDICTION_FACTORY_DEPLOY_BLOCK;
  const toBlock = await publicClient.getBlockNumber();
  while (fromBlock <= toBlock) {
    const chunkTo = fromBlock + EVENT_CHUNK_SIZE > toBlock ? toBlock : fromBlock + EVENT_CHUNK_SIZE;
    const chunk = await publicClient.getContractEvents({
      address: PREDICTION_FACTORY_ADDRESS,
      abi: PREDICTION_FACTORY_ABI,
      eventName: "BetPlaced",
      args: { predictionId: BigInt(predictionId) },
      fromBlock,
      toBlock: chunkTo,
    });
    logs.push(...chunk);
    fromBlock = chunkTo + 1n;
  }
  return logs;
}

async function getPredictionCreatedLogs(predictionId: number) {
  const logs: Awaited<ReturnType<typeof publicClient.getContractEvents>> = [];
  let fromBlock = PREDICTION_FACTORY_DEPLOY_BLOCK;
  const toBlock = await publicClient.getBlockNumber();
  while (fromBlock <= toBlock) {
    const chunkTo = fromBlock + EVENT_CHUNK_SIZE > toBlock ? toBlock : fromBlock + EVENT_CHUNK_SIZE;
    const chunk = await publicClient.getContractEvents({
      address: PREDICTION_FACTORY_ADDRESS,
      abi: PREDICTION_FACTORY_ABI,
      eventName: "PredictionCreated",
      args: { predictionId: BigInt(predictionId) },
      fromBlock,
      toBlock: chunkTo,
    });
    logs.push(...chunk);
    fromBlock = chunkTo + 1n;
  }
  return logs;
}

export async function getBiddersCount(predictionId: number): Promise<number> {
  const logs = await getBetPlacedLogs(predictionId);
  const unique = new Set<string>();
  for (const log of logs) {
    if (log.args.user) unique.add(log.args.user.toLowerCase());
  }
  return unique.size;
}

export async function getPredictionStartTime(predictionId: number): Promise<Date | null> {
  const logs = await getPredictionCreatedLogs(predictionId);
  const created = logs[0];
  if (!created?.blockNumber) return null;
  const block = await publicClient.getBlock({ blockNumber: created.blockNumber });
  return block?.timestamp ? new Date(Number(block.timestamp) * 1000) : null;
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
