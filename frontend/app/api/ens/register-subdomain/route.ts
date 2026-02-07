import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, getContract, http, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { namehash, normalize } from "viem/ens";
import {
  ENS_NAME_WRAPPER_SEPOLIA,
  ENS_PARENT_DOMAIN,
  ENS_PUBLIC_RESOLVER_SEPOLIA,
  ENS_SUBDOMAIN_LABEL_REGEX,
} from "@/lib/constants";

const NAME_WRAPPER_ABI = [
  {
    inputs: [
      { name: "parentNode", type: "bytes32" },
      { name: "label", type: "string" },
      { name: "owner", type: "address" },
      { name: "resolver", type: "address" },
      { name: "ttl", type: "uint64" },
      { name: "fuses", type: "uint32" },
      { name: "expiry", type: "uint64" },
    ],
    name: "setSubnodeRecord",
    outputs: [{ name: "node", type: "bytes32" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "id", type: "uint256" }],
    name: "getData",
    outputs: [
      { name: "owner", type: "address" },
      { name: "fuses", type: "uint32" },
      { name: "expiry", type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

/**
 * Register an ENS subdomain under prophit.eth on Sepolia.
 * Only the owner of the wrapped prophit.eth name can call NameWrapper.setSubnodeRecord.
 *
 * POST body: { username: string, ownerAddress: string }
 * Returns: { txHash: string, ensName: string } or error.
 *
 * Requires PROPHIT_ENS_OWNER_PRIVATE_KEY in env (wallet that owns wrapped prophit.eth).
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json(
      { error: "Missing or invalid Authorization header" },
      { status: 401 }
    );
  }

  let body: { username?: string; ownerAddress?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { username: rawUsername, ownerAddress } = body;
  if (!rawUsername || typeof rawUsername !== "string") {
    return NextResponse.json(
      { error: "username is required" },
      { status: 400 }
    );
  }
  if (!ownerAddress || typeof ownerAddress !== "string") {
    return NextResponse.json(
      { error: "ownerAddress is required" },
      { status: 400 }
    );
  }
  if (!isAddress(ownerAddress)) {
    return NextResponse.json(
      { error: "ownerAddress is not a valid Ethereum address" },
      { status: 400 }
    );
  }

  const normalizedLabel = rawUsername.trim().toLowerCase();
  if (normalizedLabel.length < 3 || normalizedLabel.length > 63) {
    return NextResponse.json(
      { error: "Username must be 3–63 characters" },
      { status: 400 }
    );
  }
  if (!ENS_SUBDOMAIN_LABEL_REGEX.test(normalizedLabel)) {
    return NextResponse.json(
      {
        error:
          "Username can only contain lowercase letters, numbers, and hyphens (no hyphen at start or end)",
      },
      { status: 400 }
    );
  }

  // Ensure username is not already taken (another user in DB)
  const backendUrl =
    process.env.NEXT_PUBLIC_API_URL ??
    process.env.API_URL ??
    "http://localhost:3001";
  try {
    const checkUrl = `${backendUrl.replace(/\/$/, "")}/api/ens/check-username?username=${encodeURIComponent(normalizedLabel)}`;
    const checkRes = await fetch(checkUrl, {
      headers: /ngrok(-free)?\.(app|dev|io)/i.test(checkUrl) || checkUrl.includes("ngrok-free")
        ? { "ngrok-skip-browser-warning": "true" }
        : undefined,
    });
    if (checkRes.ok) {
      const { taken } = (await checkRes.json()) as { taken?: boolean };
      if (taken) {
        return NextResponse.json(
          { error: "Username already taken" },
          { status: 409 }
        );
      }
    }
  } catch (checkErr) {
    console.error("ENS check-username error:", checkErr);
    return NextResponse.json(
      { error: "Could not verify username availability" },
      { status: 503 }
    );
  }

  const privateKey = process.env.PROPHIT_ENS_OWNER_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    return NextResponse.json(
      {
        error: "ENS subdomain registration not configured",
        hint: "Set PROPHIT_ENS_OWNER_PRIVATE_KEY (wallet that owns wrapped prophit.eth on Sepolia) in .env.local",
      },
      { status: 501 }
    );
  }

  const parentDomain =
    process.env.ENS_PARENT_DOMAIN || process.env.PROPHIT_ENS_PARENT_DOMAIN || ENS_PARENT_DOMAIN;

  let parentNode: `0x${string}`;
  try {
    const parentName = parentDomain.includes(".") ? parentDomain : `${parentDomain}.eth`;
    parentNode = namehash(normalize(parentName)) as `0x${string}`;
  } catch (normErr) {
    console.error("ENS namehash/normalize error:", normErr);
    return NextResponse.json(
      {
        error: "Invalid parent domain",
        details: normErr instanceof Error ? normErr.message : String(normErr),
      },
      { status: 400 }
    );
  }

  try {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    const transport = http(sepolia.rpcUrls.default.http[0]);
    const client = createWalletClient({
      account,
      chain: sepolia,
      transport,
    });

    const nameWrapper = getContract({
      address: ENS_NAME_WRAPPER_SEPOLIA as Address,
      abi: NAME_WRAPPER_ABI,
      client,
    });

    let subExpiry: bigint;
    try {
      const [, , parentExpiry] = await nameWrapper.read.getData([BigInt(parentNode)]);
      subExpiry = parentExpiry > 0n ? parentExpiry : 4102444800n;
    } catch {
      subExpiry = 4102444800n;
    }

    // On-chain: do not overwrite if subdomain already exists and is owned by someone else
    const fullSubdomainName =
      parentDomain.includes(".") ? `${normalizedLabel}.${parentDomain}` : `${normalizedLabel}.${parentDomain}.eth`;
    const childNode = namehash(normalize(fullSubdomainName));
    try {
      const [existingOwner] = await nameWrapper.read.getData([BigInt(childNode)]);
      const zeroAddress = "0x0000000000000000000000000000000000000000";
      if (
        existingOwner &&
        existingOwner !== zeroAddress &&
        (existingOwner as string).toLowerCase() !== ownerAddress.toLowerCase()
      ) {
        return NextResponse.json(
          { error: "Username already taken" },
          { status: 409 }
        );
      }
    } catch {
      // getData may fail if subdomain doesn't exist; that's fine (available)
    }

    const txHash = await nameWrapper.write.setSubnodeRecord([
      parentNode,
      normalizedLabel,
      ownerAddress as Address,
      ENS_PUBLIC_RESOLVER_SEPOLIA as Address,
      0n,
      0,
      subExpiry,
    ]);

    const ensName = `${normalizedLabel}.${parentDomain}`;
    return NextResponse.json({ txHash, ensName });
  } catch (e) {
    const err = e as Error & { cause?: unknown; shortMessage?: string; details?: string };
    const message = err.shortMessage || err.message || String(e);
    const details = err.details ?? (err.cause instanceof Error ? err.cause.message : undefined);
    console.error("ENS register-subdomain error:", e);
    return NextResponse.json(
      {
        error: "Failed to register subdomain",
        details: details || message,
      },
      { status: 500 }
    );
  }
}
