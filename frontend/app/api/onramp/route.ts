import { NextRequest, NextResponse } from "next/server";

/**
 * Fiat on-ramp API (e.g. Moonpay).
 * See: https://docs.privy.io/recipes/react/custom-fiat-onramp
 *
 * POST body: { address: string, email?: string, redirectUrl: string }
 * Returns: { url: string } with the on-ramp URL, or 501 if provider not configured.
 *
 * Set MOONPAY_PUBLIC_KEY and MOONPAY_SECRET_KEY in env to enable.
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
  }

  let body: { address?: string; email?: string; redirectUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { address, email, redirectUrl } = body;
  if (!address || typeof address !== "string") {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  const publicKey = process.env.MOONPAY_PUBLIC_KEY;
  const secretKey = process.env.MOONPAY_SECRET_KEY;

  if (!publicKey || !secretKey) {
    return NextResponse.json(
      {
        error: "Fiat on-ramp not configured",
        hint: "Set MOONPAY_PUBLIC_KEY and MOONPAY_SECRET_KEY in .env to enable Deposit with Card.",
      },
      { status: 501 }
    );
  }

  const baseUrl = process.env.MOONPAY_SANDBOX === "true"
    ? "https://buy-sandbox.moonpay.com"
    : "https://buy.moonpay.com";

  const onrampUrl = new URL(baseUrl);
  onrampUrl.searchParams.set("apiKey", publicKey);
  onrampUrl.searchParams.set("walletAddress", address);
  onrampUrl.searchParams.set("redirectURL", redirectUrl ?? request.nextUrl.origin);
  if (email) onrampUrl.searchParams.set("email", email);
  onrampUrl.searchParams.set("currencyCode", "usdc");

  const crypto = await import("crypto");
  const urlSignature = crypto
    .createHmac("sha256", secretKey)
    .update(onrampUrl.search)
    .digest("base64");
  onrampUrl.searchParams.set("signature", urlSignature);

  return NextResponse.json({ url: onrampUrl.toString() });
}
