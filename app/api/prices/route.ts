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

// Total Return CAGR โดยใช้ adjclose + timestamp จริงจาก Yahoo
// รองรับ ticker ที่มีประวัติน้อยกว่า 10 ปี — ใช้เท่าที่มี
async function fetchYahooCagr(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=10y`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const adjcloses: (number | null)[] = result.indicators?.adjclose?.[0]?.adjclose ?? [];

    // หา index แรก และ index สุดท้ายที่มีข้อมูล (ไม่ null)
    // ใช้ timestamp จริงคำนวณ actualYears — ไม่นับ element เพราะอาจมี null กลางชุด
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < adjcloses.length; i++) {
      if (adjcloses[i] != null && adjcloses[i]! > 0 && timestamps[i] != null) {
        if (startIdx === -1) startIdx = i;
        endIdx = i;
      }
    }

    if (startIdx === -1 || endIdx === startIdx) return null;

    const startPrice = adjcloses[startIdx]!;
    const endPrice = adjcloses[endIdx]!;
    // timestamp เป็น Unix seconds
    const actualYears = (timestamps[endIdx] - timestamps[startIdx]) / (365.25 * 24 * 3600);

    if (actualYears < 0.5) return null; // ต้องมีอย่างน้อย 6 เดือน
    const cagr = Math.pow(endPrice / startPrice, 1 / actualYears) - 1;
    return Math.round(cagr * 10000) / 10000;
  } catch {
    return null;
  }
}

async function fetchYahooATH(ticker: string): Promise<number | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1wk&range=10y`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 3600 }, // cache ATH 1 hour
    });
    if (!res.ok) return null;
    const data = await res.json();
    const closes: (number | null)[] = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const ath = closes.reduce<number>((max, c) => (c != null && c > max ? c : max), 0);
    return ath > 0 ? ath : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const tickers = req.nextUrl.searchParams.get("tickers")?.split(",").filter(Boolean) ?? [];
  const athTicker = req.nextUrl.searchParams.get("athTicker");
  const refTicker = req.nextUrl.searchParams.get("refTicker");
  const cagrTickers = req.nextUrl.searchParams.get("cagrTickers")?.split(",").filter(Boolean) ?? [];

  const prices: Record<string, number> = {};

  // System tickers always fetched (FX + NDX fallback)
  const systemTickers = ["USDTHB=X", "^NDX"];
  // Add refTicker to fetch list if different from ^NDX
  const extraTickers = refTicker && refTicker !== "^NDX" ? [refTicker] : [];
  const allSymbols = [...new Set([...tickers, ...systemTickers, ...extraTickers])];

  const [priceResults, athValue, cagrResults] = await Promise.all([
    Promise.all(allSymbols.map(async (t) => ({ t, p: await fetchYahooPrice(t) }))),
    athTicker ? fetchYahooATH(athTicker) : Promise.resolve(null),
    cagrTickers.length > 0
      ? Promise.all(cagrTickers.map(async (t) => ({ t, c: await fetchYahooCagr(t) })))
      : Promise.resolve([]),
  ]);

  priceResults.forEach(({ t, p }) => { if (p !== null) prices[t] = p; });

  const usdThb = prices["USDTHB=X"] ?? 33;
  const ndx = prices["^NDX"] ?? 0;
  // refPrice: current price of the Playbook's reference index
  const refPrice = refTicker ? (prices[refTicker] ?? ndx) : ndx;

  delete prices["USDTHB=X"];
  delete prices["^NDX"];
  if (refTicker && refTicker !== "^NDX") delete prices[refTicker];

  const cagr: Record<string, number> = {};
  cagrResults.forEach(({ t, c }) => { if (c != null) cagr[t] = c; });

  return NextResponse.json({
    prices, usdThb, ndx, refPrice,
    ...(athValue != null ? { ath: athValue } : {}),
    ...(cagrTickers.length > 0 ? { cagr } : {}),
    updatedAt: new Date().toISOString(),
  });
}
