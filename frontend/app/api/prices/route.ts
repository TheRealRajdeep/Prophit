import { NextResponse } from "next/server";

/** Fetches ETH price in USD from CoinGecko (no API key required). */
export async function GET() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { next: { revalidate: 60 } }
    );
    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`);
    }
    const data = (await res.json()) as { ethereum?: { usd?: number } };
    const price = data?.ethereum?.usd ?? 0;
    return NextResponse.json({ ethereum: price });
  } catch (e) {
    console.error("Failed to fetch ETH price:", e);
    return NextResponse.json({ ethereum: 0 }, { status: 500 });
  }
}
