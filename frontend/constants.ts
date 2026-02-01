import { base } from "viem/chains";

export const BASE_CHAIN = base;
export const BASE_CHAIN_ID = base.id;

export const USDC_TOKEN_BASE = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913" as const;
export const USDC_DECIMALS = 6;

// Matches the tutorial defaults.
export const YELLOW_WS_URL = "wss://clearnet.yellow.com/ws" as const;
export const YELLOW_AUTH_SCOPE = "test.app" as const;
export const YELLOW_APP_NAME = "FutureMarkets" as const;

