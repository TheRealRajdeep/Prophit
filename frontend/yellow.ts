"use client";

import { Client as YellowClient } from "yellow-ts";
import type { Address, Hash, Hex, PublicClient, WalletClient } from "viem";
import { parseUnits } from "viem";
import {
  Allocation,
  Channel,
  ContractAddresses,
  FinalState,
  NitroliteClient,
  RPCMethod,
  RPCResponse,
  State,
  StateIntent,
  createAuthRequestMessage,
  createAuthVerifyMessage,
  createAuthVerifyMessageFromChallenge,
  createCreateChannelMessage,
  createECDSAMessageSigner,
  createEIP712AuthMessageSigner,
  createGetConfigMessage,
  createResizeChannelMessage,
} from "@erc7824/nitrolite";
import { BASE_CHAIN_ID, USDC_DECIMALS, USDC_TOKEN_BASE, YELLOW_APP_NAME, YELLOW_AUTH_SCOPE, YELLOW_WS_URL } from "./constants";
import { generateSessionKey } from "./session";

function safeJsonParse(input: string): any | null {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function logFlow(message: string, meta?: Record<string, unknown>) {
  if (meta) console.info(`[YellowFlow] ${message}`, meta);
  else console.info(`[YellowFlow] ${message}`);
}

const SECP256K1_N =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_N = SECP256K1_N / 2n;

function normalizeSignatureHex(sig: Hex): Hex {
  if (typeof sig !== "string" || !sig.startsWith("0x")) return sig;
  // 65-byte sig: 0x + 130 hex chars
  if (sig.length !== 132) return sig;

  const r = sig.slice(2, 66);
  const sHex = sig.slice(66, 130);
  const vHex = sig.slice(130, 132);

  let v = Number.parseInt(vHex, 16);
  if (v === 0 || v === 1) v += 27;

  let s = BigInt(`0x${sHex}`);
  // Enforce low-s per EIP-2 (OpenZeppelin ECDSA does this).
  if (s > SECP256K1_HALF_N) {
    s = SECP256K1_N - s;
    // flip v when s is negated
    if (v === 27) v = 28;
    else if (v === 28) v = 27;
  }

  const sNorm = s.toString(16).padStart(64, "0");
  const vNorm = v.toString(16).padStart(2, "0");
  return (`0x${r}${sNorm}${vNorm}`) as Hex;
}

function wrapWalletClientForNitroliteSigning<T extends WalletClient>(walletClient: T): T {
  // Browser wallets sometimes return signatures that are not "canonical" for on-chain ECDSA libraries:
  // - v may be 0/1 instead of 27/28
  // - s may be "high-s" (rejected by OZ ECDSA)
  // The terminal script signs with a local viem account which normalizes these.
  // Here we normalize the signature output to match what the contract expects.
  return new Proxy(walletClient as any, {
    get(target, prop, receiver) {
      if (prop === "signMessage") {
        return async (args: any) => {
          const raw = args?.message?.raw as Hex | undefined;
          logFlow("🔑 wallet → signMessage called", {
            messageType: args?.message?.raw ? "raw" : "string",
            rawLen: typeof raw === "string" && raw.startsWith("0x") ? (raw.length - 2) / 2 : undefined,
          });
          const sig = (await target.signMessage(args)) as Hex;
          logFlow("✍️ wallet ← signature received (raw)", {
            sig,
            v: sig.slice(-2),
            sHex: sig.slice(66, 130),
          });
          const normalized = normalizeSignatureHex(sig);
          if (normalized !== sig) {
            logFlow("🔧 wallet ← signature NORMALIZED!", {
              beforeSig: sig,
              afterSig: normalized,
              beforeV: sig.slice(-2),
              afterV: normalized.slice(-2),
              beforeS: sig.slice(66, 130),
              afterS: normalized.slice(66, 130),
            });
          } else {
            logFlow("✅ wallet ← signature already canonical", { sig });
          }

          // Verify the signature by recovering the signer address
          try {
            const { recoverMessageAddress } = await import("viem");
            const recoveredAddress = await recoverMessageAddress({
              message: raw ? { raw } : (args?.message as any),
              signature: normalized,
            });
            const expectedAddress = target.account?.address;
            logFlow("🔍 signature verification", {
              recoveredAddress,
              expectedAddress,
              match: recoveredAddress.toLowerCase() === expectedAddress?.toLowerCase(),
            });
            if (recoveredAddress.toLowerCase() !== expectedAddress?.toLowerCase()) {
              logFlow("⚠️ WARNING: Recovered address doesn't match wallet address! Wallet may be adding message prefix.", {
                recoveredAddress,
                walletAddress: expectedAddress,
              });
            }
          } catch (err) {
            logFlow("⚠️ Could not verify signature", { error: String(err) });
          }

          return normalized;
        };
      }
      if (prop === "signTypedData") {
        return async (args: any) => {
          logFlow("🔑 wallet → signTypedData called (EIP-712)", {});
          const sig = (await target.signTypedData(args)) as Hex;
          logFlow("✍️ wallet ← typed data signature", { sig, v: sig.slice(-2) });
          const normalized = normalizeSignatureHex(sig);
          if (normalized !== sig) {
            logFlow("🔧 wallet ← EIP-712 signature NORMALIZED", {
              before: sig,
              after: normalized,
            });
          }
          return normalized;
        };
      }
      if (prop === "account") {
        // Also wrap the account object in case nitrolite accesses it directly
        const account = target.account;
        if (account && typeof account === "object") {
          return new Proxy(account, {
            get(accountTarget: any, accountProp, accountReceiver) {
              if (accountProp === "signMessage") {
                return async (args: any) => {
                  logFlow("🔑 wallet.account → signMessage called directly", {});
                  const sig = (await accountTarget.signMessage(args)) as Hex;
                  const normalized = normalizeSignatureHex(sig);
                  logFlow("✍️ wallet.account ← signature", {
                    before: sig,
                    after: normalized,
                    changed: sig !== normalized,
                  });
                  return normalized;
                };
              }
              return Reflect.get(accountTarget, accountProp, accountReceiver);
            },
          });
        }
        return account;
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as T;
}

function getContractAddresses(chainId: number): ContractAddresses {
  if (chainId === BASE_CHAIN_ID) {
    return {
      custody: "0x490fb189DdE3a01B00be9BA5F41e3447FbC838b6",
      adjudicator: "0x7de4A0736Cf5740fD3Ca2F2e9cc85c9AC223eF0C",
    };
  }
  throw new Error(`Unsupported chain ID: ${chainId}`);
}

/**
 * Custom StateSigner for browser wallets that don't properly support raw message signing.
 * Some wallets (like Rainbow) always add the Ethereum Signed Message prefix even when
 * asked to sign raw bytes, which causes signature verification to fail on-chain.
 * 
 * This signer uses the account's signMessage method directly with the raw bytes.
 */
class BrowserWalletStateSigner {
  constructor(private walletClient: WalletClient) {
    if (!walletClient.account) {
      throw new Error("WalletClient must have an account");
    }
  }

  getAddress(): Address {
    return this.walletClient.account!.address;
  }

  async signState(channelId: Hex, state: any): Promise<Hex> {
    // Import getPackedState dynamically to avoid circular dependencies
    const { getPackedState } = await import("@erc7824/nitrolite/dist/utils/state.js");
    const packedState = getPackedState(channelId, state);

    logFlow("📝 signing state", {
      channelId,
      packedStateLength: (packedState.length - 2) / 2,
    });

    // Use walletClient.signMessage with raw bytes
    logFlow("🔑 using walletClient.signMessage");
    const sig = await this.walletClient.signMessage({
      account: this.walletClient.account!,
      message: { raw: packedState },
    });
    return normalizeSignatureHex(sig);
  }

  async signRawMessage(message: Hex): Promise<Hex> {
    const sig = await this.walletClient.signMessage({
      account: this.walletClient.account!,
      message: { raw: message },
    });
    return normalizeSignatureHex(sig);
  }
}

function extractChallengeMessage(resp: any): string {
  const p = resp?.params ?? {};
  // We accept both camelCase and snake_case since different server/protocol versions exist.
  return (
    p.challengeMessage ??
    p.challenge_message ??
    p.challenge ??
    p?.challengeMessage?.toString?.() ??
    p?.challenge_message?.toString?.() ??
    ""
  );
}

function formatAnyError(err: unknown, depth = 0): string {
  if (depth > 4) return "[truncated]";
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e: any = err;
    const parts: string[] = [];

    if (typeof e.name === "string") parts.push(`name: ${e.name}`);
    if (typeof e.shortMessage === "string") parts.push(`shortMessage: ${e.shortMessage}`);
    if (typeof e.message === "string") parts.push(`message: ${e.message}`);
    if (typeof e.details === "string") parts.push(`details: ${e.details}`);
    if (Array.isArray(e.metaMessages) && e.metaMessages.length) {
      parts.push(`meta:\n${e.metaMessages.map((m: any) => `- ${String(m)}`).join("\n")}`);
    }
    if (e.cause) parts.push(`cause:\n${formatAnyError(e.cause, depth + 1)}`);

    // Fallback: include enumerable keys if we still don't have much.
    if (parts.length <= 1) {
      try {
        parts.push(`raw: ${JSON.stringify(e, null, 2)}`);
      } catch {
        // ignore
      }
    }

    return parts.filter(Boolean).join("\n");
  }
  return String(err);
}

export type DepositFlowInput = {
  amountUsdc: string; // e.g. "1.0"
  walletAddress: Address;
  walletClient: WalletClient;
  publicClient: PublicClient;
};

export type DepositFlowResult = {
  walletAddress: Address;
  channelId: Hex;
  createChannelTx: Hash;
  depositTx: Hash;
  resizeTx: Hash;
  allocateTx: Hash;
};

export type DepositFlowStep =
  | { step: "connect_wallet" }
  | { step: "authenticate_yellow" }
  | { step: "create_channel" }
  | { step: "deposit_to_custody" }
  | { step: "resize_and_allocate" };

export type ExistingChannel = {
  channelId: Hex;
  version: bigint;
  participants: Address[];
  allocations: Allocation[];
  intent: StateIntent;
  isFinal: boolean;
};

export type GetExistingChannelsInput = {
  walletAddress: Address;
  walletClient: WalletClient;
  publicClient: PublicClient;
};

/**
 * Yellow Network RPC channel response type
 */
export type YellowChannelInfo = {
  channel_id: string;
  participant: string;
  status: string; // "open" | "closed" | "challenged" | "resizing"
  token: string;
  wallet: string;
  amount: string;
  chain_id: number;
  adjudicator: string;
  challenge: number;
  nonce: number;
  version: number;
  created_at: string;
  updated_at: string;
};

/**
 * Fetch open channels directly from Yellow Network using get_channels RPC method.
 * This queries the clearnode for channels associated with the wallet address.
 * Uses session key authentication to query the Yellow Network RPC API.
 * 
 * @param input - Wallet credentials for authentication
 * @returns Array of open channel information from Yellow Network
 */
export async function getOpenChannelsFromYellow(
  input: GetExistingChannelsInput
): Promise<YellowChannelInfo[]> {
  const { walletAddress, walletClient } = input;

  logFlow("🔍 querying Yellow Network for open channels via RPC", { walletAddress });

  const yellow = new YellowClient({ url: YELLOW_WS_URL });
  await yellow.connect();
  logFlow("connected to Yellow for channel query", { url: YELLOW_WS_URL });

  try {
    // Step 1: Authenticate with Yellow Network using session key
    const sessionKey = generateSessionKey();
    const sessionSigner = createECDSAMessageSigner(sessionKey.privateKey);
    const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);

    logFlow("authenticating for channel query", {
      sessionKey: sessionKey.address,
      expiresAt: sessionExpireTimestamp.toString()
    });

    // Minimal allowances for read-only query operations
    const allowances: Array<{ asset: string; amount: string }> = [
      { asset: "usdc", amount: "0.01" }
    ];

    // Send auth request
    const authMessage = await createAuthRequestMessage({
      address: walletAddress,
      session_key: sessionKey.address,
      application: YELLOW_APP_NAME,
      allowances,
      expires_at: sessionExpireTimestamp,
      scope: YELLOW_AUTH_SCOPE,
    });

    logFlow("rpc → AuthRequest (for channel query)");
    const challengeResponse = (await yellow.sendMessage(authMessage)) as RPCResponse;

    if (!challengeResponse) {
      throw new Error("Failed to receive authentication challenge");
    }

    const challengeMessage = extractChallengeMessage(challengeResponse);
    if (!challengeMessage) {
      throw new Error("Authentication failed: missing challenge message");
    }

    // Sign the challenge with main wallet
    const authParams = {
      scope: YELLOW_AUTH_SCOPE,
      application: YELLOW_APP_NAME,
      participant: sessionKey.address,
      expire: sessionExpireTimestamp,
      allowances,
      session_key: sessionKey.address,
      expires_at: sessionExpireTimestamp,
    };

    const eip712Signer = createEIP712AuthMessageSigner(
      walletClient as any,
      authParams as any,
      { name: YELLOW_APP_NAME }
    );

    const authVerifyMessage = await createAuthVerifyMessageFromChallenge(
      eip712Signer,
      challengeMessage
    );

    logFlow("rpc → AuthVerify (for channel query)");
    const authVerifyResponse = (await yellow.sendMessage(authVerifyMessage)) as RPCResponse;

    if (!authVerifyResponse || authVerifyResponse.method !== RPCMethod.AuthVerify) {
      throw new Error("Authentication failed");
    }

    if (!(authVerifyResponse as any)?.params?.success) {
      throw new Error("Authentication verification failed");
    }

    logFlow("✅ authenticated for channel query");

    // Step 2: Make get_channels RPC call
    // Create a properly formatted RPC request following Yellow Network protocol
    const timestamp = Date.now();
    const params = {
      participant: walletAddress,
      status: "open",
      limit: 100,
      offset: 0,
      sort: "desc"
    };

    const reqPayload = [timestamp, "get_channels", params, timestamp];

    // Sign the request with session key using privateKeyToAccount
    const reqString = JSON.stringify(reqPayload);
    const { privateKeyToAccount } = await import("viem/accounts");
    const sessionAccount = privateKeyToAccount(sessionKey.privateKey);

    // Sign the message string
    const signature = await sessionAccount.signMessage({
      message: reqString,
    });

    const signedRequest = {
      req: reqPayload,
      sig: [signature],
    };

    logFlow("rpc → get_channels", { participant: walletAddress, status: "open", limit: 100 });

    // Try to send the request via yellow.sendMessage
    // If that doesn't work with custom methods, we'll get an error we can catch
    let channelsResponse: any;

    try {
      // Try using the yellow-ts client
      channelsResponse = await yellow.sendMessage(JSON.stringify(signedRequest));
    } catch (err) {
      // If yellow.sendMessage doesn't support custom methods, access WebSocket directly
      logFlow("⚠️ yellow.sendMessage doesn't support custom methods, using direct WebSocket");

      // Access the underlying WebSocket connection
      const ws = (yellow as any).ws || (yellow as any)._ws || (yellow as any).socket;

      if (!ws || ws.readyState !== 1) { // 1 = OPEN
        throw new Error("WebSocket not connected");
      }

      // Send directly and wait for response
      channelsResponse = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("get_channels request timeout"));
        }, 15000);

        const handleMessage = (event: any) => {
          try {
            const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

            // Check if this is the response to our get_channels request
            if (data.res && Array.isArray(data.res)) {
              const [, method] = data.res;
              if (method === "get_channels" || method === "error") {
                clearTimeout(timeout);
                ws.removeEventListener("message", handleMessage);
                resolve(data);
              }
            }
          } catch (parseErr) {
            // Ignore parse errors, wait for correct message
          }
        };

        ws.addEventListener("message", handleMessage);
        ws.send(JSON.stringify(signedRequest));
      });
    }

    logFlow("rpc ← get_channels response received");

    // Log the raw response for debugging (handle BigInt serialization)
    try {
      const responseStr = JSON.stringify(channelsResponse, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      );
      logFlow("📋 raw response", { response: responseStr.slice(0, 500) });
    } catch (err) {
      logFlow("📋 raw response (object)", { response: channelsResponse });
    }

    // Parse response - Yellow Network returns { res: [timestamp, method, result, timestamp] }
    if (channelsResponse && typeof channelsResponse === "object") {
      // Handle raw WebSocket response format
      if (channelsResponse.res && Array.isArray(channelsResponse.res)) {
        const [, method, result] = channelsResponse.res;

        logFlow("📋 parsed response", { method, resultKeys: result ? Object.keys(result) : [] });

        if (method === "error") {
          const errorMsg = result?.error || result?.message || "Unknown error";
          logFlow("❌ get_channels error", { error: errorMsg });
          return [];
        }

        if (result && result.channels && Array.isArray(result.channels)) {
          logFlow("📋 channels array", {
            count: result.channels.length,
            firstChannel: result.channels[0] || null
          });

          const openChannels = result.channels.map((channel: any) => ({
            channel_id: channel.channel_id || channel.channelId || channel.id,
            participant: channel.participant,
            status: channel.status,
            token: channel.token,
            wallet: channel.wallet,
            amount: channel.amount?.toString() || channel.amount || "0",
            chain_id: channel.chain_id || channel.chainId,
            adjudicator: channel.adjudicator,
            challenge: channel.challenge,
            nonce: channel.nonce,
            version: channel.version,
            created_at: channel.created_at || channel.createdAt || "",
            updated_at: channel.updated_at || channel.updatedAt || "",
          })) as YellowChannelInfo[];

          logFlow("✅ found open channels from Yellow RPC", { count: openChannels.length });

          if (openChannels.length > 0) {
            logFlow("channel details", {
              channels: openChannels.map(c => ({
                channel_id: c.channel_id,
                status: c.status,
                amount: c.amount,
                chain_id: c.chain_id,
              }))
            });
          }

          return openChannels;
        }
      }

      // Handle yellow-ts Client response format
      if (channelsResponse.method === RPCMethod.Error || channelsResponse.method === "error") {
        const errorMsg = (channelsResponse as any)?.params?.error || "Unknown error";
        logFlow("❌ get_channels error", { error: errorMsg });
        return [];
      }

      const result = (channelsResponse as any)?.params || channelsResponse;
      if (result && result.channels && Array.isArray(result.channels)) {
        logFlow("📋 channels array (client format)", {
          count: result.channels.length,
          firstChannel: result.channels[0] || null
        });

        const openChannels = result.channels.map((channel: any) => ({
          channel_id: channel.channel_id || channel.channelId || channel.id,
          participant: channel.participant,
          status: channel.status,
          token: channel.token,
          wallet: channel.wallet,
          amount: channel.amount?.toString() || channel.amount || "0",
          chain_id: channel.chain_id || channel.chainId,
          adjudicator: channel.adjudicator,
          challenge: channel.challenge,
          nonce: channel.nonce,
          version: channel.version,
          created_at: channel.created_at || channel.createdAt || "",
          updated_at: channel.updated_at || channel.updatedAt || "",
        })) as YellowChannelInfo[];

        logFlow("✅ found open channels from Yellow RPC", { count: openChannels.length });

        if (openChannels.length > 0) {
          logFlow("channel details", {
            channels: openChannels.map(c => ({
              channel_id: c.channel_id,
              status: c.status,
              amount: c.amount,
              chain_id: c.chain_id,
            }))
          });
        }

        return openChannels;
      }
    }

    logFlow("no open channels found in response or unexpected format");
    return [];

  } catch (err) {
    logFlow("⚠️ failed to query channels from Yellow RPC", {
      error: formatAnyError(err, 0).slice(0, 300)
    });
    // Return empty array instead of throwing - allows fallback to creating new channel
    return [];
  } finally {
    await yellow.disconnect();
    logFlow("disconnected from Yellow after channel query");
  }
}

/**
 * Fetch existing open channels for a wallet address from Yellow Network
 * Note: If channelIds is provided, it will fetch those specific channels.
 * If not provided, it returns an empty array as channels cannot be enumerated without IDs.
 */
export async function getExistingYellowChannels(
  input: GetExistingChannelsInput & { channelIds?: Hex[] },
): Promise<ExistingChannel[]> {
  const { walletAddress, walletClient, publicClient, channelIds } = input;

  logFlow("fetching existing channels", { walletAddress, channelCount: channelIds?.length || 0 });

  // If no channel IDs provided, return empty array
  if (!channelIds || channelIds.length === 0) {
    logFlow("no channels found", { walletAddress });
    return [];
  }

  const baseAddresses = getContractAddresses(BASE_CHAIN_ID);
  const nitroliteWalletClient = wrapWalletClientForNitroliteSigning(walletClient as any);
  const stateSigner = new BrowserWalletStateSigner(nitroliteWalletClient as any);

  const nitroliteClient = new NitroliteClient({
    walletClient: nitroliteWalletClient as any,
    publicClient: publicClient as any,
    stateSigner: stateSigner as any,
    addresses: baseAddresses,
    chainId: BASE_CHAIN_ID,
    challengeDuration: BigInt(3600),
  });

  const channels: ExistingChannel[] = [];

  for (const channelId of channelIds) {
    try {
      logFlow("fetching channel data", { channelId });
      const channelData = await nitroliteClient.getChannelData(channelId);

      if (channelData && channelData.lastValidState) {
        const state = channelData.lastValidState;
        channels.push({
          channelId,
          version: state.version,
          participants: channelData.channel.participants,
          allocations: state.allocations,
          intent: state.intent,
          isFinal: String(state.intent).toLowerCase().includes('final'),
        });
        logFlow("channel fetched", { channelId, version: state.version.toString() });
      }
    } catch (err) {
      logFlow("⚠️ failed to fetch channel", { channelId, error: formatAnyError(err, 0).slice(0, 200) });
      // Continue with other channels
    }
  }

  logFlow("channels fetched", { count: channels.length });
  return channels;
}

export async function runYellowDepositFlow(
  input: DepositFlowInput,
  onStep?: (s: DepositFlowStep) => void,
): Promise<DepositFlowResult> {
  onStep?.({ step: "connect_wallet" });
  const { walletAddress, walletClient, publicClient } = input;
  logFlow("start", {
    walletAddress,
    amountUsdc: input.amountUsdc,
    chainId: BASE_CHAIN_ID,
  });

  const yellow = new YellowClient({ url: YELLOW_WS_URL });
  await yellow.connect();
  logFlow("connected to Yellow", { url: YELLOW_WS_URL });

  try {
    onStep?.({ step: "authenticate_yellow" });
    logFlow("step: authenticate_yellow");

    const sessionKey = generateSessionKey();
    const sessionSigner = createECDSAMessageSigner(sessionKey.privateKey);
    const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    logFlow("generated session key", { sessionKey: sessionKey.address, expiresAt: sessionExpireTimestamp.toString() });

    // Keep allowances minimal—Yellow auth can be strict and some wallets are picky about large typed-data payloads.
    // We only need the session established; the deposit/resize are on-chain via the wallet.
    const allowances: Array<{ asset: string; amount: string }> = [{ asset: "usdc", amount: input.amountUsdc }];

    const authMessage = await createAuthRequestMessage({
      address: walletAddress,
      session_key: sessionKey.address,
      application: YELLOW_APP_NAME,
      allowances,
      expires_at: sessionExpireTimestamp,
      scope: YELLOW_AUTH_SCOPE,
    });
    {
      const parsed = safeJsonParse(authMessage);
      logFlow("rpc → AuthRequest", {
        method: parsed?.method ?? "AuthRequest",
        id: parsed?.id,
        scope: YELLOW_AUTH_SCOPE,
        application: YELLOW_APP_NAME,
        sessionKey: sessionKey.address,
      });
    }
    const challengeResponse = (await yellow.sendMessage(authMessage)) as RPCResponse;

    if (!challengeResponse) {
      throw new Error("Failed to receive authentication challenge from Yellow Network. Connection may have been lost.");
    }

    logFlow("rpc ← AuthChallenge", { method: challengeResponse.method, id: (challengeResponse as any)?.id });
    const challengeMessage = extractChallengeMessage(challengeResponse);
    if (!challengeMessage) {
      throw new Error(
        `Authentication failed: missing challenge message (got ${String((challengeResponse as any)?.method)})`,
      );
    }

    const authParams = {
      scope: YELLOW_AUTH_SCOPE,
      application: YELLOW_APP_NAME,
      participant: sessionKey.address,
      expire: sessionExpireTimestamp,
      allowances,
      session_key: sessionKey.address,
      expires_at: sessionExpireTimestamp,
    };
    const eip712Signer = createEIP712AuthMessageSigner(walletClient as any, authParams as any, { name: YELLOW_APP_NAME });
    logFlow("wallet → signTypedData (AuthVerify)", { walletAddress, sessionKey: sessionKey.address });

    // Some protocol variants return AuthChallenge with different shapes; verify using the raw challenge string.
    const authVerifyMessage = await createAuthVerifyMessageFromChallenge(eip712Signer, challengeMessage);
    {
      const parsed = safeJsonParse(authVerifyMessage);
      logFlow("rpc → AuthVerify", { method: parsed?.method ?? "AuthVerify", id: parsed?.id });
    }
    const authVerifyResponse = (await yellow.sendMessage(authVerifyMessage)) as RPCResponse;

    if (!authVerifyResponse) {
      throw new Error("Failed to receive authentication verification from Yellow Network. Connection may have been lost.");
    }

    logFlow("rpc ← AuthVerify", { method: authVerifyResponse.method, id: (authVerifyResponse as any)?.id, success: (authVerifyResponse as any)?.params?.success });
    if (authVerifyResponse.method !== RPCMethod.AuthVerify) {
      throw new Error(`Authentication failed: unexpected response (${String(authVerifyResponse.method)})`);
    }
    if (!(authVerifyResponse as any)?.params?.success) {
      const details = (authVerifyResponse as any)?.params ?? {};
      throw new Error(`Authentication failed: ${typeof details.error === "string" ? details.error : JSON.stringify(details)}`);
    }
    logFlow("authenticated", { walletAddress });

    // Get config to retrieve broker address (needed for funds_destination)
    logFlow("step: get_config");
    const configMessage = await createGetConfigMessage(sessionSigner);
    {
      const parsed = safeJsonParse(configMessage);
      logFlow("rpc → GetConfig", { method: parsed?.method ?? "GetConfig", id: parsed?.id });
    }
    const configResponse = (await yellow.sendMessage(configMessage)) as RPCResponse;

    if (!configResponse) {
      throw new Error("Failed to receive config from Yellow Network. Connection may have been lost.");
    }

    logFlow("rpc ← GetConfig", { method: configResponse.method, id: (configResponse as any)?.id });
    if (configResponse.method !== RPCMethod.GetConfig) {
      throw new Error(`Get config failed: unexpected response (${String(configResponse.method)})`);
    }

    const { brokerAddress } = (configResponse as any).params as { brokerAddress: string };
    if (!brokerAddress) {
      throw new Error("Failed to retrieve broker address from Yellow Network config");
    }
    logFlow("broker address retrieved", { brokerAddress });

    // Prepare on-chain client (deposit + create channel use static contract addresses)
    const baseAddresses = getContractAddresses(BASE_CHAIN_ID) as ContractAddresses;
    const nitroliteWalletClient = wrapWalletClientForNitroliteSigning(walletClient as any);

    // Verify wallet account is properly set
    if (!nitroliteWalletClient.account) {
      throw new Error("Wallet client has no account attached. Please reconnect your wallet.");
    }

    logFlow("🔍 wallet client account", {
      address: nitroliteWalletClient.account.address,
      expectedWalletAddress: walletAddress,
      match: nitroliteWalletClient.account.address.toLowerCase() === walletAddress.toLowerCase(),
    });

    // Use our custom signer instead of WalletStateSigner to handle browser wallets
    // that don't properly support raw message signing (like Rainbow wallet)
    const stateSigner = new BrowserWalletStateSigner(nitroliteWalletClient as any);

    const nitroliteClient = new NitroliteClient({
      walletClient: nitroliteWalletClient as any,
      publicClient: publicClient as any,
      stateSigner: stateSigner as any,
      addresses: baseAddresses,
      chainId: BASE_CHAIN_ID,
      challengeDuration: BigInt(3600),
    });
    logFlow("nitrolite client ready", {
      custody: baseAddresses.custody,
      adjudicator: baseAddresses.adjudicator,
      signerAddress: stateSigner.getAddress(),
    });

    // Check for existing open channels using Yellow Network RPC API
    logFlow("checking for existing open channels via Yellow RPC", { walletAddress });
    let channelId: Hex | undefined;
    let createChannelTx: Hash | undefined;
    let existingChannel: ExistingChannel | undefined;

    try {
      // Query Yellow Network for open channels via RPC
      const yellowChannels = await getOpenChannelsFromYellow({
        walletAddress,
        walletClient,
        publicClient,
      });

      if (yellowChannels && yellowChannels.length > 0) {
        logFlow("✅ found open channels from Yellow RPC", {
          count: yellowChannels.length,
          channels: yellowChannels.map(c => ({
            channel_id: c.channel_id,
            status: c.status,
            chain_id: c.chain_id,
            amount: c.amount,
          }))
        });

        // Filter for channels on the correct chain
        const baseChannels = yellowChannels.filter(c => c.chain_id === BASE_CHAIN_ID);

        if (baseChannels.length > 0) {
          // Use the first open channel found on Base
          const channel = baseChannels[0];
          channelId = channel.channel_id as Hex;

          logFlow("✅ using existing open channel from Yellow RPC", {
            channelId,
            status: channel.status,
            version: channel.version,
            amount: channel.amount,
            chain_id: channel.chain_id,
          });

          // Verify the channel is actually open on-chain
          try {
            const channelData = await nitroliteClient.getChannelData(channelId);

            if (channelData && channelData.lastValidState) {
              const isFinal = String(channelData.lastValidState.intent).toLowerCase().includes('final');

              if (isFinal) {
                // Channel is marked as final on-chain, need to create a new one
                logFlow("⚠️ channel from RPC is finalized on-chain, creating new channel", { channelId });
                channelId = undefined;
              } else {
                // Channel is valid and open!
                existingChannel = {
                  channelId,
                  version: channelData.lastValidState.version,
                  participants: channelData.channel.participants,
                  allocations: channelData.lastValidState.allocations,
                  intent: channelData.lastValidState.intent,
                  isFinal: false,
                };
                logFlow("✅ verified channel is open on-chain", {
                  channelId,
                  version: channelData.lastValidState.version.toString()
                });
              }
            }
          } catch (err) {
            logFlow("⚠️ failed to verify channel on-chain, will create new channel", {
              channelId,
              error: formatAnyError(err, 0).slice(0, 100)
            });
            channelId = undefined;
          }
        } else {
          logFlow("no channels found on Base chain (chain_id: " + BASE_CHAIN_ID + ")", {
            availableChains: yellowChannels.map(c => c.chain_id)
          });
        }
      } else {
        logFlow("no open channels found from Yellow RPC", { walletAddress });
      }
    } catch (err) {
      logFlow("⚠️ failed to query open channels from Yellow RPC, will create new channel", {
        error: formatAnyError(err, 0).slice(0, 100)
      });
    }

    // Only create a new channel if no open channel exists
    if (!channelId) {
      // Re-authenticate before creating channel (channel creation requires fresh auth)
      onStep?.({ step: "authenticate_yellow" });
      logFlow("step: re-authenticate before create channel");

      const createChannelSessionKey = generateSessionKey();
      const createChannelSessionSigner = createECDSAMessageSigner(createChannelSessionKey.privateKey);
      const createChannelSessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
      logFlow("generated new session key for create channel", { sessionKey: createChannelSessionKey.address, expiresAt: createChannelSessionExpireTimestamp.toString() });

      const createChannelAuthMessage = await createAuthRequestMessage({
        address: walletAddress,
        session_key: createChannelSessionKey.address,
        application: YELLOW_APP_NAME,
        allowances: [{ asset: "usdc", amount: input.amountUsdc }],
        expires_at: createChannelSessionExpireTimestamp,
        scope: YELLOW_AUTH_SCOPE,
      });
      {
        const parsed = safeJsonParse(createChannelAuthMessage);
        logFlow("rpc → AuthRequest (for create channel)", {
          method: parsed?.method ?? "AuthRequest",
          id: parsed?.id,
          scope: YELLOW_AUTH_SCOPE,
          sessionKey: createChannelSessionKey.address,
        });
      }
      const createChannelChallengeResponse = (await yellow.sendMessage(createChannelAuthMessage)) as RPCResponse;

      if (!createChannelChallengeResponse) {
        throw new Error("Failed to receive authentication challenge from Yellow Network for create channel operation.");
      }

      logFlow("rpc ← AuthChallenge (for create channel)", { method: createChannelChallengeResponse.method, id: (createChannelChallengeResponse as any)?.id });
      const createChannelChallengeMessage = extractChallengeMessage(createChannelChallengeResponse);
      if (!createChannelChallengeMessage) {
        throw new Error(
          `Create channel authentication failed: missing challenge message (got ${String((createChannelChallengeResponse as any)?.method)})`,
        );
      }

      const createChannelAuthParams = {
        scope: YELLOW_AUTH_SCOPE,
        application: YELLOW_APP_NAME,
        participant: createChannelSessionKey.address,
        expire: createChannelSessionExpireTimestamp,
        allowances: [{ asset: "usdc", amount: input.amountUsdc }],
        session_key: createChannelSessionKey.address,
        expires_at: createChannelSessionExpireTimestamp,
      };
      const createChannelEip712Signer = createEIP712AuthMessageSigner(walletClient as any, createChannelAuthParams as any, { name: YELLOW_APP_NAME });
      logFlow("wallet → signTypedData (AuthVerify for create channel)", { walletAddress, sessionKey: createChannelSessionKey.address });

      const createChannelAuthVerifyMessage = await createAuthVerifyMessageFromChallenge(createChannelEip712Signer, createChannelChallengeMessage);
      {
        const parsed = safeJsonParse(createChannelAuthVerifyMessage);
        logFlow("rpc → AuthVerify (for create channel)", { method: parsed?.method ?? "AuthVerify", id: parsed?.id });
      }
      const createChannelAuthVerifyResponse = (await yellow.sendMessage(createChannelAuthVerifyMessage)) as RPCResponse;

      if (!createChannelAuthVerifyResponse) {
        throw new Error("Failed to receive authentication verification from Yellow Network for create channel operation.");
      }

      logFlow("rpc ← AuthVerify (for create channel)", { method: createChannelAuthVerifyResponse.method, id: (createChannelAuthVerifyResponse as any)?.id, success: (createChannelAuthVerifyResponse as any)?.params?.success });
      if (createChannelAuthVerifyResponse.method !== RPCMethod.AuthVerify) {
        throw new Error(`Create channel authentication failed: unexpected response (${String(createChannelAuthVerifyResponse.method)})`);
      }
      if (!(createChannelAuthVerifyResponse as any)?.params?.success) {
        const details = (createChannelAuthVerifyResponse as any)?.params ?? {};
        throw new Error(`Create channel authentication failed: ${typeof details.error === "string" ? details.error : JSON.stringify(details)}`);
      }
      logFlow("✅ authenticated for create channel", { walletAddress, sessionKey: createChannelSessionKey.address });

      onStep?.({ step: "create_channel" });
      logFlow("step: create_channel - no existing channel found, creating new one");

      const createChannelMessage = await createCreateChannelMessage(createChannelSessionSigner, {
        chain_id: BASE_CHAIN_ID,
        token: USDC_TOKEN_BASE,
      });
      {
        const parsed = safeJsonParse(createChannelMessage);
        logFlow("rpc → CreateChannel", { method: parsed?.method ?? "CreateChannel", id: parsed?.id, chainId: BASE_CHAIN_ID, token: USDC_TOKEN_BASE });
      }
      const createChannelResponse = (await yellow.sendMessage(createChannelMessage)) as RPCResponse;

      if (!createChannelResponse) {
        throw new Error("Failed to receive create channel response from Yellow Network. Connection may have been lost.");
      }

      logFlow("rpc ← CreateChannel", { method: createChannelResponse.method, id: (createChannelResponse as any)?.id });

      if (createChannelResponse.method === RPCMethod.Error) {
        const msg = (createChannelResponse as any)?.params?.error;
        throw new Error(`Create channel failed (Yellow RPC): ${typeof msg === "string" ? msg : JSON.stringify((createChannelResponse as any)?.params ?? {})}`);
      }
      if (createChannelResponse.method !== RPCMethod.CreateChannel) {
        throw new Error(`Create channel failed (Yellow RPC): unexpected response ${String(createChannelResponse.method)}`);
      }

      try {
        const serverSignature = (createChannelResponse as any).params.serverSignature as Hex;
        const channel = (createChannelResponse as any).params.channel;
        const unsignedState = {
          intent: (createChannelResponse as any).params.state.intent as StateIntent,
          version: BigInt((createChannelResponse as any).params.state.version),
          data: (createChannelResponse as any).params.state.stateData as Hex,
          allocations: (createChannelResponse as any).params.state.allocations as Allocation[],
        };
        logFlow("📋 channel params received from Yellow", {
          participants: channel.participants,
          nonce: channel.nonce,
          adjudicator: channel.adjudicator,
          challenge: channel.challenge,
        });
        logFlow("📋 unsigned state from Yellow", {
          intent: unsignedState.intent,
          version: unsignedState.version.toString(),
          allocations: unsignedState.allocations.map((a: Allocation) => ({
            destination: a.destination,
            token: a.token,
            amount: a.amount.toString(),
          })),
        });
        logFlow("🔐 server signature from Yellow", {
          serverSignature,
          v: serverSignature.slice(-2),
          sHex: serverSignature.slice(66, 130),
        });

        // Log the channel for debugging
        logFlow("🆔 channel for signing", {
          participants: channel.participants,
          adjudicator: channel.adjudicator,
          challenge: channel.challenge,
          nonce: channel.nonce,
          chainId: BASE_CHAIN_ID,
        });

        logFlow("chain → nitroliteClient.createChannel() - will sign state locally now...");
        const res = await nitroliteClient.createChannel({
          channel: channel as unknown as Channel,
          unsignedInitialState: unsignedState,
          // Note: DO NOT normalize serverSignature - it's already properly formatted by Yellow server.
          // Only browser wallet signatures need normalization (handled by wrapWalletClientForNitroliteSigning).
          serverSignature,
        });
        channelId = res.channelId;
        createChannelTx = res.txHash;
        logFlow("chain ← createChannel tx submitted", { channelId, txHash: createChannelTx });

        // Wait for the transaction to be confirmed before proceeding
        await publicClient.waitForTransactionReceipt({ hash: createChannelTx });
        logFlow("chain ← createChannel confirmed", { channelId, txHash: createChannelTx });
      } catch (err) {
        throw new Error(
          [
            "Contract call simulation failed while creating channel.",
            `wallet: ${walletAddress}`,
            `chainId: ${BASE_CHAIN_ID}`,
            `token: ${USDC_TOKEN_BASE}`,
            `custody: ${baseAddresses.custody}`,
            `adjudicator: ${baseAddresses.adjudicator}`,
            "",
            formatAnyError(err),
          ].join("\n"),
        );
      }
    } else {
      // Using existing channel
      logFlow("✅ using existing open channel", { channelId });
      createChannelTx = "0x0" as Hash; // Placeholder for existing channel
    }

    // Ensure channelId is set at this point
    if (!channelId) {
      throw new Error("No channel ID available - channel creation or lookup failed");
    }

    onStep?.({ step: "deposit_to_custody" });
    logFlow("step: deposit_to_custody");
    const amountUnits = parseUnits(input.amountUsdc, USDC_DECIMALS);
    logFlow("chain → nitroliteClient.deposit()", { token: USDC_TOKEN_BASE, amountUnits: amountUnits.toString() });
    const depositTx = await nitroliteClient.deposit(USDC_TOKEN_BASE, amountUnits);
    logFlow("chain ← deposit tx submitted", { txHash: depositTx });
    await publicClient.waitForTransactionReceipt({ hash: depositTx });
    logFlow("chain ← deposit confirmed", { txHash: depositTx });

    // Re-authenticate before resize (Yellow Network requires fresh auth for resize operations)
    onStep?.({ step: "authenticate_yellow" });
    logFlow("step: re-authenticate before resize");

    const resizeSessionKey = generateSessionKey();
    const resizeSessionSigner = createECDSAMessageSigner(resizeSessionKey.privateKey);
    const resizeSessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);
    logFlow("generated new session key for resize", { sessionKey: resizeSessionKey.address, expiresAt: resizeSessionExpireTimestamp.toString() });

    const resizeAuthMessage = await createAuthRequestMessage({
      address: walletAddress,
      session_key: resizeSessionKey.address,
      application: YELLOW_APP_NAME,
      allowances: [{ asset: "usdc", amount: input.amountUsdc }],
      expires_at: resizeSessionExpireTimestamp,
      scope: YELLOW_AUTH_SCOPE,
    });
    {
      const parsed = safeJsonParse(resizeAuthMessage);
      logFlow("rpc → AuthRequest (for resize)", {
        method: parsed?.method ?? "AuthRequest",
        id: parsed?.id,
        scope: YELLOW_AUTH_SCOPE,
        sessionKey: resizeSessionKey.address,
      });
    }
    const resizeChallengeResponse = (await yellow.sendMessage(resizeAuthMessage)) as RPCResponse;

    if (!resizeChallengeResponse) {
      throw new Error("Failed to receive authentication challenge from Yellow Network for resize operation.");
    }

    logFlow("rpc ← AuthChallenge (for resize)", { method: resizeChallengeResponse.method, id: (resizeChallengeResponse as any)?.id });

    // Check if response is an error
    if (resizeChallengeResponse.method === RPCMethod.Error) {
      const errorMsg = (resizeChallengeResponse as any)?.params?.error || (resizeChallengeResponse as any)?.params?.message;
      throw new Error(`Resize authentication failed (challenge): ${typeof errorMsg === "string" ? errorMsg : JSON.stringify((resizeChallengeResponse as any)?.params ?? {})}`);
    }

    const resizeChallengeMessage = extractChallengeMessage(resizeChallengeResponse);
    if (!resizeChallengeMessage) {
      throw new Error(
        `Resize authentication failed: missing challenge message (got ${String((resizeChallengeResponse as any)?.method)})`,
      );
    }

    const resizeAuthParams = {
      scope: YELLOW_AUTH_SCOPE,
      application: YELLOW_APP_NAME,
      participant: resizeSessionKey.address,
      expire: resizeSessionExpireTimestamp,
      allowances: [{ asset: "usdc", amount: input.amountUsdc }],
      session_key: resizeSessionKey.address,
      expires_at: resizeSessionExpireTimestamp,
    };
    const resizeEip712Signer = createEIP712AuthMessageSigner(walletClient as any, resizeAuthParams as any, { name: YELLOW_APP_NAME });
    logFlow("wallet → signTypedData (AuthVerify for resize)", { walletAddress, sessionKey: resizeSessionKey.address });

    const resizeAuthVerifyMessage = await createAuthVerifyMessageFromChallenge(resizeEip712Signer, resizeChallengeMessage);
    {
      const parsed = safeJsonParse(resizeAuthVerifyMessage);
      logFlow("rpc → AuthVerify (for resize)", { method: parsed?.method ?? "AuthVerify", id: parsed?.id });
    }
    const resizeAuthVerifyResponse = (await yellow.sendMessage(resizeAuthVerifyMessage)) as RPCResponse;

    if (!resizeAuthVerifyResponse) {
      throw new Error("Failed to receive authentication verification from Yellow Network for resize operation.");
    }

    logFlow("rpc ← AuthVerify (for resize)", { method: resizeAuthVerifyResponse.method, id: (resizeAuthVerifyResponse as any)?.id, success: (resizeAuthVerifyResponse as any)?.params?.success });
    if (resizeAuthVerifyResponse.method !== RPCMethod.AuthVerify) {
      throw new Error(`Resize authentication failed: unexpected response (${String(resizeAuthVerifyResponse.method)})`);
    }
    if (!(resizeAuthVerifyResponse as any)?.params?.success) {
      const details = (resizeAuthVerifyResponse as any)?.params ?? {};
      throw new Error(`Resize authentication failed: ${typeof details.error === "string" ? details.error : JSON.stringify(details)}`);
    }
    logFlow("authenticated for resize", { walletAddress });

    // Resize and allocate in ONE operation (like resize_channel.ts)
    // This prevents "resize already ongoing" errors
    onStep?.({ step: "resize_and_allocate" });
    logFlow("step: resize_and_allocate - pulling funds from custody to channel and allocating to unified in one operation");

    // Determine funds destination: wallet address when using negative allocate (deallocation)
    const fundsDestination = walletAddress as `0x${string}`;
    logFlow("funds destination for allocation", { fundsDestination, brokerAddress, walletAddress });

    const resizeAndAllocateMessage = await createResizeChannelMessage(resizeSessionSigner, {
      channel_id: channelId,
      resize_amount: amountUnits, // Add funds from custody to channel
      allocate_amount: BigInt(-1) * amountUnits, // NEGATIVE to move from channel to unified balance
      funds_destination: fundsDestination, // Wallet address for deallocation
    });
    {
      const parsed = safeJsonParse(resizeAndAllocateMessage);
      logFlow("rpc → ResizeChannel (combined resize + allocate)", {
        method: parsed?.method ?? "ResizeChannel",
        id: parsed?.id,
        channelId,
        resizeAmount: amountUnits.toString(),
        allocateAmount: (BigInt(-1) * amountUnits).toString(),
        fundsDestination
      });
    }
    const resizeAndAllocateResponse = (await yellow.sendMessage(resizeAndAllocateMessage)) as RPCResponse;

    if (!resizeAndAllocateResponse) {
      throw new Error("Failed to receive resize+allocate response from Yellow Network. Connection may have been lost.");
    }

    logFlow("rpc ← ResizeChannel (combined)", { method: resizeAndAllocateResponse.method, id: (resizeAndAllocateResponse as any)?.id });

    // Check for error response
    if (resizeAndAllocateResponse.method === RPCMethod.Error) {
      const errorMsg = (resizeAndAllocateResponse as any)?.params?.error || (resizeAndAllocateResponse as any)?.params?.message;
      throw new Error(`Resize+allocate failed (Yellow RPC): ${typeof errorMsg === "string" ? errorMsg : JSON.stringify((resizeAndAllocateResponse as any)?.params ?? {})}`);
    }
    if (resizeAndAllocateResponse.method !== RPCMethod.ResizeChannel) {
      throw new Error(`Resize+allocate failed (Yellow RPC): unexpected response ${String(resizeAndAllocateResponse.method)}`);
    }

    // Read previous channel state
    let previousState;
    try {
      logFlow("chain → reading previous channel state", { channelId });
      previousState = await nitroliteClient.getChannelData(channelId);
      logFlow("chain ← previous state read", { version: previousState?.lastValidState?.version });
    } catch (err) {
      logFlow("⚠️ Failed to read channel data, will retry after delay", { error: formatAnyError(err, 0).slice(0, 200) });
      await new Promise(resolve => setTimeout(resolve, 2000));
      previousState = await nitroliteClient.getChannelData(channelId);
      logFlow("chain ← previous state read (after retry)", { version: previousState?.lastValidState?.version });
    }

    const resizeAndAllocateState: FinalState = {
      channelId: channelId,
      intent: (resizeAndAllocateResponse as any).params.state.intent as StateIntent,
      version: BigInt((resizeAndAllocateResponse as any).params.state.version),
      data: (resizeAndAllocateResponse as any).params.state.stateData as Hex,
      allocations: (resizeAndAllocateResponse as any).params.state.allocations as Allocation[],
      serverSignature: (resizeAndAllocateResponse as any).params.serverSignature as Hex,
    };

    logFlow("chain → nitroliteClient.resizeChannel() for combined operation", {
      channelId: resizeAndAllocateState.channelId,
      version: resizeAndAllocateState.version.toString()
    });

    const { txHash: resizeAndAllocateTx } = await nitroliteClient.resizeChannel({
      resizeState: resizeAndAllocateState,
      proofStates: [previousState.lastValidState as State],
    });

    logFlow("chain ← resize+allocate tx submitted", { txHash: resizeAndAllocateTx });
    await publicClient.waitForTransactionReceipt({ hash: resizeAndAllocateTx });
    logFlow("chain ← resize+allocate confirmed", { txHash: resizeAndAllocateTx });

    logFlow("done", { channelId, createChannelTx, depositTx, resizeAndAllocateTx });
    return {
      walletAddress,
      channelId,
      createChannelTx,
      depositTx,
      resizeTx: resizeAndAllocateTx,
      allocateTx: resizeAndAllocateTx, // Same tx for both operations now
    };
  } finally {
    await yellow.disconnect();
    logFlow("disconnected from Yellow");
  }
}

/**
 * Input parameters for allocating channel funds to unified balance
 */
export interface AllocateToUnifiedInput {
  walletAddress: Address;
  walletClient: WalletClient;
  publicClient: PublicClient;
  channelId?: Hex; // Optional - if not provided, will use first available channel with funds
  amount?: string; // Optional - if not provided, will allocate all available channel funds
}

/**
 * Result of allocating channel funds to unified balance
 */
export interface AllocateToUnifiedResult {
  channelId: Hex;
  allocatedAmount: string;
  txHash: Hash;
}

export type AllocateToUnifiedStep =
  | { step: "checking_channels" }
  | { step: "authenticating" }
  | { step: "allocating" }
  | { step: "confirming" };

/**
 * Allocates funds from a payment channel to unified balance on Yellow Network
 * This allows you to move funds from a channel into your unified trading balance
 */
export async function allocateChannelToUnified(
  input: AllocateToUnifiedInput,
  onStep?: (s: AllocateToUnifiedStep) => void,
): Promise<AllocateToUnifiedResult> {
  const { walletAddress, walletClient, publicClient, channelId: providedChannelId, amount } = input;

  onStep?.({ step: "checking_channels" });
  logFlow("allocate_to_unified: start", { walletAddress, providedChannelId, amount });

  // Fetch open channels from Yellow Network
  logFlow("fetching open channels from Yellow Network");
  const openChannels = await getOpenChannelsFromYellow({
    walletAddress,
    walletClient,
    publicClient,
  });

  if (!openChannels || openChannels.length === 0) {
    throw new Error("No open channels found on Yellow Network. Please deposit first to create a channel.");
  }

  logFlow("found open channels", { count: openChannels.length });

  // Prepare on-chain client
  const baseAddresses = getContractAddresses(BASE_CHAIN_ID) as ContractAddresses;
  const nitroliteWalletClient = wrapWalletClientForNitroliteSigning(walletClient as any);

  if (!nitroliteWalletClient.account) {
    throw new Error("Wallet client has no account attached. Please reconnect your wallet.");
  }

  const stateSigner = new BrowserWalletStateSigner(nitroliteWalletClient as any);

  const nitroliteClient = new NitroliteClient({
    walletClient: nitroliteWalletClient as any,
    publicClient: publicClient as any,
    stateSigner: stateSigner as any,
    addresses: baseAddresses,
    chainId: BASE_CHAIN_ID,
    challengeDuration: BigInt(3600),
  });

  // Find channel with funds or use provided channelId
  let targetChannelId: Hex | undefined;
  let channelBalance: bigint | undefined;

  if (providedChannelId) {
    // Use the provided channel ID
    const providedChannel = openChannels.find(c => c.channel_id.toLowerCase() === providedChannelId.toLowerCase());
    if (!providedChannel) {
      throw new Error(`Channel ${providedChannelId} not found in open channels or is not open.`);
    }

    channelBalance = BigInt(providedChannel.amount || 0);

    if (channelBalance === 0n) {
      throw new Error(`Channel ${providedChannelId} has no funds to allocate.`);
    }

    targetChannelId = providedChannelId;
    logFlow("using provided channel", {
      channelId: targetChannelId,
      balance: channelBalance.toString(),
      balanceUsdc: (Number(channelBalance) / 10 ** USDC_DECIMALS).toFixed(2)
    });
  } else {
    // Find first open channel with non-zero balance from Yellow Network data
    for (const channel of openChannels) {
      const amount = BigInt(channel.amount || 0);
      if (amount > 0n) {
        targetChannelId = channel.channel_id as Hex;
        channelBalance = amount;
        logFlow("found open channel with balance from Yellow Network", {
          channelId: targetChannelId,
          balance: channelBalance.toString(),
          balanceUsdc: (Number(channelBalance) / 10 ** USDC_DECIMALS).toFixed(2)
        });
        break;
      }
    }

    if (!targetChannelId || !channelBalance) {
      throw new Error("No open channels with available funds found. All channels may be empty.");
    }
  }

  // Determine amount to allocate
  let amountUnits: bigint;
  if (amount) {
    amountUnits = parseUnits(amount, USDC_DECIMALS);
    if (amountUnits > channelBalance) {
      throw new Error(`Insufficient channel balance. Available: ${(Number(channelBalance) / 10 ** USDC_DECIMALS).toFixed(2)} USDC`);
    }
  } else {
    // Allocate all available funds
    amountUnits = channelBalance;
  }

  logFlow("allocating from channel", {
    channelId: targetChannelId,
    amount: (Number(amountUnits) / 10 ** USDC_DECIMALS).toFixed(2)
  });

  // Connect to Yellow Network and authenticate
  onStep?.({ step: "authenticating" });
  const yellow = new YellowClient({ url: YELLOW_WS_URL });
  await yellow.connect();
  logFlow("connected to Yellow");

  try {
    // Generate session key
    const sessionKey = generateSessionKey();
    const sessionSigner = createECDSAMessageSigner(sessionKey.privateKey);
    const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Auth flow
    const allowances: Array<{ asset: string; amount: string }> = [{ asset: "usdc", amount: amount || "1000000" }];

    const authMessage = await createAuthRequestMessage({
      address: walletAddress,
      session_key: sessionKey.address,
      application: YELLOW_APP_NAME,
      allowances,
      expires_at: sessionExpireTimestamp,
      scope: YELLOW_AUTH_SCOPE,
    });

    logFlow("rpc → AuthRequest");
    const challengeResponse = (await yellow.sendMessage(authMessage)) as RPCResponse;

    if (!challengeResponse) {
      throw new Error("Failed to receive authentication challenge from Yellow Network");
    }

    logFlow("rpc ← AuthChallenge");
    const challengeMessage = extractChallengeMessage(challengeResponse);
    if (!challengeMessage) {
      throw new Error("Authentication failed: missing challenge message");
    }

    const authParams = {
      scope: YELLOW_AUTH_SCOPE,
      application: YELLOW_APP_NAME,
      participant: sessionKey.address,
      expire: sessionExpireTimestamp,
      allowances,
      session_key: sessionKey.address,
      expires_at: sessionExpireTimestamp,
    };
    const eip712Signer = createEIP712AuthMessageSigner(walletClient as any, authParams as any, { name: YELLOW_APP_NAME });

    const authVerifyMessage = await createAuthVerifyMessageFromChallenge(eip712Signer, challengeMessage);
    logFlow("rpc → AuthVerify");
    const authVerifyResponse = (await yellow.sendMessage(authVerifyMessage)) as RPCResponse;

    if (!authVerifyResponse) {
      throw new Error("Failed to receive authentication verification from Yellow Network");
    }

    if (authVerifyResponse.method !== RPCMethod.AuthVerify) {
      throw new Error(`Authentication failed: unexpected response (${String(authVerifyResponse.method)})`);
    }

    if (!(authVerifyResponse as any)?.params?.success) {
      const details = (authVerifyResponse as any)?.params ?? {};
      throw new Error(`Authentication failed: ${typeof details.error === "string" ? details.error : JSON.stringify(details)}`);
    }

    logFlow("authenticated with Yellow");

    // Create a new session key for the resize operation
    const resizeSessionKey = generateSessionKey();
    const resizeSessionSigner = createECDSAMessageSigner(resizeSessionKey.privateKey);
    const resizeSessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Auth the resize session
    const resizeAuthMessage = await createAuthRequestMessage({
      address: walletAddress,
      session_key: resizeSessionKey.address,
      application: YELLOW_APP_NAME,
      allowances: [{ asset: "usdc", amount: (Number(amountUnits) / 10 ** USDC_DECIMALS).toFixed(2) }],
      expires_at: resizeSessionExpireTimestamp,
      scope: YELLOW_AUTH_SCOPE,
    });

    const resizeChallengeResponse = (await yellow.sendMessage(resizeAuthMessage)) as RPCResponse;
    if (!resizeChallengeResponse) {
      throw new Error("Failed to receive resize auth challenge");
    }

    const resizeChallengeMessage = extractChallengeMessage(resizeChallengeResponse);
    if (!resizeChallengeMessage) {
      throw new Error("Resize authentication failed: missing challenge");
    }

    const resizeAuthParams = {
      scope: YELLOW_AUTH_SCOPE,
      application: YELLOW_APP_NAME,
      participant: resizeSessionKey.address,
      expire: resizeSessionExpireTimestamp,
      allowances: [{ asset: "usdc", amount: (Number(amountUnits) / 10 ** USDC_DECIMALS).toFixed(2) }],
      session_key: resizeSessionKey.address,
      expires_at: resizeSessionExpireTimestamp,
    };
    const resizeEip712Signer = createEIP712AuthMessageSigner(walletClient as any, resizeAuthParams as any, { name: YELLOW_APP_NAME });

    const resizeAuthVerifyMessage = await createAuthVerifyMessageFromChallenge(resizeEip712Signer, resizeChallengeMessage);
    const resizeAuthVerifyResponse = (await yellow.sendMessage(resizeAuthVerifyMessage)) as RPCResponse;

    if (!resizeAuthVerifyResponse || resizeAuthVerifyResponse.method !== RPCMethod.AuthVerify) {
      throw new Error("Resize authentication failed");
    }

    if (!(resizeAuthVerifyResponse as any)?.params?.success) {
      throw new Error("Resize authentication not successful");
    }

    // Create ResizeChannel message to allocate funds
    onStep?.({ step: "allocating" });
    logFlow("creating allocate message");

    const allocateMessage = await createResizeChannelMessage(resizeSessionSigner, {
      channel_id: targetChannelId,
      resize_amount: 0n, // Don't resize, just allocate
      allocate_amount: BigInt(-1) * amountUnits, // NEGATIVE to move from channel to unified balance
      funds_destination: walletAddress,
    });

    logFlow("rpc → ResizeChannel (allocate to unified)", {
      channelId: targetChannelId,
      allocateAmount: (-amountUnits).toString(),
    });

    const allocateResponse = (await yellow.sendMessage(allocateMessage)) as RPCResponse;

    if (!allocateResponse) {
      throw new Error("Failed to receive allocate response from Yellow Network");
    }

    if (allocateResponse.method === RPCMethod.Error) {
      const errorMsg = (allocateResponse as any)?.params?.error || (allocateResponse as any)?.params?.message;
      throw new Error(`Allocate to unified failed: ${typeof errorMsg === "string" ? errorMsg : JSON.stringify((allocateResponse as any)?.params ?? {})}`);
    }

    if (allocateResponse.method !== RPCMethod.ResizeChannel) {
      throw new Error(`Unexpected response: ${String(allocateResponse.method)}`);
    }

    logFlow("rpc ← ResizeChannel response received");

    // Read current channel state for allocation proof
    const currentState = await nitroliteClient.getChannelData(targetChannelId);

    const allocateState: FinalState = {
      channelId: targetChannelId,
      intent: (allocateResponse as any).params.state.intent as StateIntent,
      version: BigInt((allocateResponse as any).params.state.version),
      data: (allocateResponse as any).params.state.stateData as Hex,
      allocations: (allocateResponse as any).params.state.allocations as Allocation[],
      serverSignature: (allocateResponse as any).params.serverSignature as Hex,
    };

    // Submit allocation transaction
    onStep?.({ step: "confirming" });
    logFlow("chain → submitting allocation transaction");

    const { txHash } = await nitroliteClient.resizeChannel({
      resizeState: allocateState,
      proofStates: [currentState.lastValidState as State],
    });

    logFlow("chain ← allocation tx submitted", { txHash });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    logFlow("chain ← allocation confirmed", { txHash });

    const allocatedAmountUsdc = (Number(amountUnits) / 10 ** USDC_DECIMALS).toFixed(2);
    logFlow("allocate_to_unified: complete", {
      channelId: targetChannelId,
      allocatedAmount: allocatedAmountUsdc,
      txHash
    });

    return {
      channelId: targetChannelId,
      allocatedAmount: allocatedAmountUsdc,
      txHash,
    };
  } finally {
    await yellow.disconnect();
    logFlow("disconnected from Yellow");
  }
}

/**
 * Interface for balance information
 */
export interface LedgerBalance {
  asset: string;
  amount: string;
}

/**
 * Input parameters for getting ledger balances
 */
export interface GetLedgerBalancesInput {
  walletAddress: Address;
  walletClient: WalletClient;
  accountId?: string; // Optional - if not provided, returns authenticated user's unified balance
}

/**
 * Fetches the unified ledger balances from Yellow Network
 * Requires authentication to Yellow Network
 * @param input - Wallet address and client for authentication
 * @returns Array of balances for each asset
 */
export async function getLedgerBalances(
  input: GetLedgerBalancesInput,
): Promise<LedgerBalance[]> {
  const { walletAddress, walletClient, accountId } = input;

  logFlow("fetching ledger balances from Yellow", { walletAddress, accountId });

  const yellow = new YellowClient({ url: YELLOW_WS_URL });
  await yellow.connect();
  logFlow("connected to Yellow for balance query", { url: YELLOW_WS_URL });

  try {
    // Generate session key for authentication
    const sessionKey = generateSessionKey();
    const sessionSigner = createECDSAMessageSigner(sessionKey.privateKey);
    const sessionExpireTimestamp = BigInt(Math.floor(Date.now() / 1000) + 3600);

    logFlow("authenticating for balance query", {
      sessionKey: sessionKey.address,
      expiresAt: sessionExpireTimestamp.toString(),
    });

    // Minimal allowances for balance query
    const allowances: Array<{ asset: string; amount: string }> = [
      { asset: "usdc", amount: "0" }
    ];

    // Send AuthRequest
    const authMessage = await createAuthRequestMessage({
      address: walletAddress,
      session_key: sessionKey.address,
      application: YELLOW_APP_NAME,
      allowances,
      expires_at: sessionExpireTimestamp,
      scope: YELLOW_AUTH_SCOPE,
    });

    const challengeResponse = (await yellow.sendMessage(authMessage)) as RPCResponse;
    if (!challengeResponse) {
      throw new Error("Failed to receive authentication challenge from Yellow Network");
    }

    logFlow("rpc ← AuthChallenge (for balance query)", {
      method: challengeResponse.method
    });

    const challengeMessage = extractChallengeMessage(challengeResponse);
    if (!challengeMessage) {
      throw new Error("Authentication failed: missing challenge message");
    }

    // Sign with wallet
    const authParams = {
      scope: YELLOW_AUTH_SCOPE,
      application: YELLOW_APP_NAME,
      participant: sessionKey.address,
      expire: sessionExpireTimestamp,
      allowances,
      session_key: sessionKey.address,
      expires_at: sessionExpireTimestamp,
    };

    const eip712Signer = createEIP712AuthMessageSigner(
      walletClient as any,
      authParams as any,
      { name: YELLOW_APP_NAME }
    );

    const authVerifyMessage = await createAuthVerifyMessageFromChallenge(
      eip712Signer,
      challengeMessage
    );

    const authVerifyResponse = (await yellow.sendMessage(authVerifyMessage)) as RPCResponse;
    if (!authVerifyResponse) {
      throw new Error("Failed to receive authentication verification");
    }

    if (authVerifyResponse.method !== RPCMethod.AuthVerify) {
      throw new Error(`Authentication failed: unexpected response (${String(authVerifyResponse.method)})`);
    }

    if (!(authVerifyResponse as any)?.params?.success) {
      const details = (authVerifyResponse as any)?.params ?? {};
      throw new Error(`Authentication failed: ${typeof details.error === "string" ? details.error : JSON.stringify(details)}`);
    }

    logFlow("✅ authenticated for balance query");

    // Query ledger balances - create signed request
    const timestamp = Date.now();
    const params = accountId ? { account_id: accountId } : {};
    const reqPayload = [timestamp, "get_ledger_balances", params, timestamp];

    // Sign the request with session key
    const reqString = JSON.stringify(reqPayload);
    const { privateKeyToAccount } = await import("viem/accounts");
    const sessionAccount = privateKeyToAccount(sessionKey.privateKey);

    const signature = await sessionAccount.signMessage({
      message: reqString,
    });

    const signedRequest = {
      req: reqPayload,
      sig: [signature],
    };

    logFlow("rpc → get_ledger_balances", {
      params,
      accountId: accountId || "none (unified balance)",
      requestPayload: reqPayload,
      signedRequestStructure: {
        hasReq: !!signedRequest.req,
        hasSig: !!signedRequest.sig,
        sigLength: signedRequest.sig.length
      }
    });

    let balanceResponse: any;
    try {
      balanceResponse = await yellow.sendMessage(JSON.stringify(signedRequest));
    } catch (err) {
      // If yellow.sendMessage doesn't work, try WebSocket directly
      const ws = (yellow as any).ws;
      if (!ws) {
        throw new Error("WebSocket not available for get_ledger_balances request");
      }

      balanceResponse = await new Promise<any>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("get_ledger_balances request timeout"));
        }, 15000);

        const handleMessage = (event: any) => {
          try {
            const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;

            if (data.res && Array.isArray(data.res)) {
              const [, method] = data.res;
              if (method === "get_ledger_balances" || method === "error") {
                clearTimeout(timeout);
                ws.removeEventListener("message", handleMessage);
                resolve(data);
              }
            }
          } catch (parseErr) {
            // Ignore parse errors
          }
        };

        ws.addEventListener("message", handleMessage);
        ws.send(JSON.stringify(signedRequest));
      });
    }

    logFlow("rpc ← get_ledger_balances response received", {
      responseType: typeof balanceResponse,
      hasRes: !!balanceResponse.res,
      hasMethod: !!balanceResponse.method,
      fullResponse: JSON.stringify(balanceResponse).slice(0, 500)
    });

    // Parse response
    let balances: LedgerBalance[] = [];

    // Helper function to recursively search for balance arrays in the response
    const findBalanceArray = (obj: any): LedgerBalance[] | null => {
      if (!obj || typeof obj !== 'object') return null;

      // Check if this object has balance-like properties
      if (Array.isArray(obj)) {
        // Check if it's an array of balance objects
        if (obj.length > 0 && obj[0] && typeof obj[0] === 'object' && ('asset' in obj[0] || 'currency' in obj[0])) {
          // Normalize to LedgerBalance format
          return obj.map((item: any) => ({
            asset: item.asset || item.currency || item.symbol || 'unknown',
            amount: item.amount || item.balance || item.value || '0'
          }));
        }
      }

      // Check common property names
      if (obj.ledger_balances && Array.isArray(obj.ledger_balances)) {
        return obj.ledger_balances;
      }
      if (obj.balances && Array.isArray(obj.balances)) {
        return obj.balances;
      }
      if (obj.unified_balance && Array.isArray(obj.unified_balance)) {
        return obj.unified_balance;
      }
      if (obj.unified_balances && Array.isArray(obj.unified_balances)) {
        return obj.unified_balances;
      }

      // Recursively search in nested objects
      for (const key in obj) {
        if (obj.hasOwnProperty(key) && typeof obj[key] === 'object') {
          const found = findBalanceArray(obj[key]);
          if (found) return found;
        }
      }

      return null;
    };

    // Handle both direct WebSocket response and yellow-ts Client response
    if (balanceResponse.res && Array.isArray(balanceResponse.res)) {
      const [, method, result] = balanceResponse.res;

      logFlow("parsing WebSocket response format", {
        method,
        resultType: typeof result,
        resultKeys: result && typeof result === 'object' ? Object.keys(result) : [],
        resultSample: JSON.stringify(result).slice(0, 200)
      });

      if (method === "error") {
        const errorMsg = result?.error || result?.message || "Unknown error";
        throw new Error(`Get ledger balances failed: ${errorMsg}`);
      }

      // Try to find balance array
      const found = findBalanceArray(result);
      if (found) {
        balances = found;
        logFlow("✅ found balances in WebSocket response", { count: balances.length });
      } else {
        logFlow("⚠️ could not find balance array in result", {
          resultStructure: JSON.stringify(result, null, 2).slice(0, 500)
        });
      }
    } else if (balanceResponse.method) {
      // Handle yellow-ts Client response format
      logFlow("parsing yellow-ts Client response format", {
        method: balanceResponse.method,
        hasParams: !!(balanceResponse as any)?.params
      });

      if (balanceResponse.method === RPCMethod.Error || balanceResponse.method === "error") {
        const errorMsg = (balanceResponse as any)?.params?.error || "Unknown error";
        throw new Error(`Get ledger balances failed: ${errorMsg}`);
      }

      const result = (balanceResponse as any)?.params || balanceResponse;

      logFlow("checking result structure", {
        hasResult: !!result,
        resultType: typeof result,
        resultKeys: result && typeof result === 'object' ? Object.keys(result) : [],
        resultSample: JSON.stringify(result).slice(0, 200)
      });

      // Try to find balance array
      const found = findBalanceArray(result);
      if (found) {
        balances = found;
        logFlow("✅ found balances in Client response", { count: balances.length });
      } else {
        logFlow("⚠️ could not find balance array in result", {
          resultStructure: JSON.stringify(result, null, 2).slice(0, 500)
        });
      }
    } else {
      logFlow("⚠️ unexpected response format", {
        response: JSON.stringify(balanceResponse, null, 2).slice(0, 500)
      });

      // Try one last time to find balances in the whole response
      const found = findBalanceArray(balanceResponse);
      if (found) {
        balances = found;
        logFlow("✅ found balances in raw response", { count: balances.length });
      }
    }

    if (balances.length === 0) {
      logFlow("⚠️ no balances found - this could mean:", {
        reason1: "No funds in unified balance",
        reason2: "Response format not recognized",
        reason3: "Authentication scope insufficient",
        fullResponse: JSON.stringify(balanceResponse, null, 2).slice(0, 1000)
      });
    }

    logFlow("✅ fetched ledger balances", {
      count: balances.length,
      balances: balances.map((b: LedgerBalance) => ({ asset: b.asset, amount: b.amount }))
    });

    return balances;

  } catch (err) {
    logFlow("⚠️ failed to fetch ledger balances", {
      error: formatAnyError(err, 0).slice(0, 300)
    });
    throw err;
  } finally {
    await yellow.disconnect();
    logFlow("disconnected from Yellow after balance query");
  }
}


