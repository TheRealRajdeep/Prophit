import { base, baseSepolia, sepolia } from "viem/chains";
import type { Chain } from "viem";

export const BASE_CHAIN = base;
export const BASE_CHAIN_ID = base.id;

export const USDC_TOKEN_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const;
export const USDC_DECIMALS = 6;

/** USDC contract addresses per chain for balance display (mainnet + testnets). */
export const USDC_BY_CHAIN: { chainId: number; address: `0x${string}` }[] = [
  { chainId: base.id, address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}` },
  { chainId: baseSepolia.id, address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}` },
  { chainId: sepolia.id, address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}` },
];

/** Chains supported in the Transfer Crypto flow (mainnet + testnets). */
export const TRANSFER_CHAINS: { id: string; name: string; chain: Chain }[] = [
  { id: "base", name: "Base", chain: base },
  { id: "base-sepolia", name: "Base Sepolia", chain: baseSepolia },
  { id: "sepolia", name: "Sepolia", chain: sepolia },
];

/** Token metadata for transfer UI. */
export type TransferTokenId = "eth" | "usdc" | "usdt" | "weth";

export const TRANSFER_TOKENS: {
  id: TransferTokenId;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
}[] = [
  { id: "eth", symbol: "ETH", name: "Ethereum", decimals: 18, isNative: true },
  { id: "weth", symbol: "WETH", name: "Wrapped Ether", decimals: 18, isNative: false },
  { id: "usdc", symbol: "USDC", name: "USD Coin", decimals: 6, isNative: false },
  { id: "usdt", symbol: "USDT", name: "Tether USD", decimals: 6, isNative: false },
];

/**
 * ERC20 contract address for a token on a given chain.
 * Null means native (ETH) – send to wallet address on that chain.
 * Only entries for chains/tokens we support are set.
 */
export const TOKEN_ADDRESS_BY_CHAIN: Record<
  number,
  Partial<Record<TransferTokenId, `0x${string}` | null>>
> = {
  [base.id]: {
    eth: null,
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`,
    usdt: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2" as `0x${string}`,
    weth: "0x4200000000000000000000000000000000000006" as `0x${string}`,
  },
  [baseSepolia.id]: {
    eth: null,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`,
    weth: "0x4200000000000000000000000000000000000006" as `0x${string}`,
  },
  [sepolia.id]: {
    eth: null,
    usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`,
  },
};

/** Tokens that are available on a given chain (for dropdown filtering). */
export function getTransferTokensForChain(chainId: number): typeof TRANSFER_TOKENS[number][] {
  const byChain = TOKEN_ADDRESS_BY_CHAIN[chainId];
  if (!byChain) return [];
  return TRANSFER_TOKENS.filter((t) => t.id in byChain);
}
