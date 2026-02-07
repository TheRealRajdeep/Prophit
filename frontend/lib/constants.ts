import { base, baseSepolia, sepolia } from "viem/chains";
import type { Chain } from "viem";

/** CDN for network and token icons (Fun.xyz SDK). */
export const CHAIN_TOKEN_ICON_CDN = "https://sdk-cdn.fun.xyz/images";

export const BASE_CHAIN = base;
export const BASE_CHAIN_ID = base.id;

/** Base Sepolia – prediction contract is deployed here. */
export const BASE_SEPOLIA_CHAIN_ID = 84532;

/** PredictionFactoryUSDC contract on Base Sepolia. Deploy with: npx hardhat ignition deploy ignition/modules/PredictionFactoryUSDC.ts --network baseSepolia */
export const PREDICTION_FACTORY_ADDRESS =
  "0x2714A0A6c4a35E625dcb0EAF27f04dDD7C67F27B" as const;

/** Block number when PredictionFactoryUSDC was deployed on Base Sepolia (for event queries). */
export const PREDICTION_FACTORY_DEPLOY_BLOCK = 37360076n;

/** USDC on Base Sepolia (for prediction betting). */
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;

export const USDC_TOKEN_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const;
export const USDC_DECIMALS = 6;

/** USDC contract addresses per chain for balance display (testnets only). */
export const USDC_BY_CHAIN: { chainId: number; address: `0x${string}` }[] = [
  { chainId: baseSepolia.id, address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}` },
  { chainId: sepolia.id, address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}` },
];

/** Tokens to fetch for total USD balance (deposits). eth = native, others = ERC20. */
export type DepositTokenId = "eth" | "usdc" | "weth";
export const DEPOSIT_TOKENS_BY_CHAIN: {
  chainId: number;
  tokens: { id: DepositTokenId; address: `0x${string}` | null; decimals: number }[];
}[] = [
  {
    chainId: baseSepolia.id,
    tokens: [
      { id: "eth", address: null, decimals: 18 },
      { id: "usdc", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`, decimals: 6 },
      { id: "weth", address: "0x4200000000000000000000000000000000000006" as `0x${string}`, decimals: 18 },
    ],
  },
  {
    chainId: sepolia.id,
    tokens: [
      { id: "eth", address: null, decimals: 18 },
      { id: "usdc", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as `0x${string}`, decimals: 6 },
    ],
  },
];

/** Chains supported in the Transfer Crypto flow (testnets only). */
export const TRANSFER_CHAINS: { id: string; name: string; chain: Chain; iconUrl: string }[] = [
  { id: "base-sepolia", name: "Base Sepolia", chain: baseSepolia, iconUrl: `${CHAIN_TOKEN_ICON_CDN}/base.svg` },
  { id: "sepolia", name: "Ethereum Sepolia", chain: sepolia, iconUrl: `${CHAIN_TOKEN_ICON_CDN}/ethereum.svg` },
];

/** Token metadata for transfer UI. */
export type TransferTokenId = "eth" | "usdc" | "usdt" | "weth";

export const TRANSFER_TOKENS: {
  id: TransferTokenId;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  iconUrl: string;
}[] = [
  { id: "eth", symbol: "ETH", name: "Ethereum", decimals: 18, isNative: true, iconUrl: `${CHAIN_TOKEN_ICON_CDN}/ethereum.svg` },
  { id: "weth", symbol: "WETH", name: "Wrapped Ether", decimals: 18, isNative: false, iconUrl: `${CHAIN_TOKEN_ICON_CDN}/ethereum.svg` },
  { id: "usdc", symbol: "USDC", name: "USD Coin", decimals: 6, isNative: false, iconUrl: `${CHAIN_TOKEN_ICON_CDN}/usdc.svg` },
  { id: "usdt", symbol: "USDT", name: "Tether USD", decimals: 6, isNative: false, iconUrl: `${CHAIN_TOKEN_ICON_CDN}/usdt.svg` },
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

// --- ENS (Ethereum Name Service) on Sepolia ---
/** Parent domain for Prophit usernames: subdomains are {username}.prophit.eth */
export const ENS_PARENT_DOMAIN = "prophit.eth";

/** ENS Name Wrapper contract on Sepolia (for creating subdomains). */
export const ENS_NAME_WRAPPER_SEPOLIA = "0x0635513f179D50A207757E05759CbD106d7dFcE8" as const;

/** ENS Public Resolver on Sepolia (used for new subdomain records). */
export const ENS_PUBLIC_RESOLVER_SEPOLIA = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5" as const;

/** ENS Reverse Registrar on Sepolia (for setting primary name / reverse record). */
export const ENS_REVERSE_REGISTRAR_SEPOLIA = "0xA0a1AbcDAe1a2a4A2EF8e9113Ff0e02DD81DC0C6" as const;

/** Subdomain label rules: 3–63 chars, lowercase letters, numbers, hyphens only. */
export const ENS_SUBDOMAIN_LABEL_REGEX = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;
