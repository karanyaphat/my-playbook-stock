import { NextRequest, NextResponse } from "next/server";

async function fetchYahooPrice(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1d`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const tickers = req.nextUrl.searchParams.get("tickers")?.split(",").filter(Boolean) ?? [];

  const prices: Record<string, number> = {};

  // Fetch all tickers + FX + NDX in parallel
  const allSymbols = [...new Set([...tickers, "USDTHB=X", "^NDX"])];
  const results = await Promise.all(allSymbols.map(async (t) => ({ t, p: await fetchYahooPrice(t) })));

  results.forEach(({ t, p }) => { if (p !== null) prices[t] = p; });

  const usdThb = prices["USDTHB=X"] ?? 33;
  const ndx = prices["^NDX"] ?? 0;

  // Remove FX/NDX from asset prices
  delete prices["USDTHB=X"];
  delete prices["^NDX"];

  return NextResponse.json({ prices, usdThb, ndx, updatedAt: new Date().toISOString() });
}
