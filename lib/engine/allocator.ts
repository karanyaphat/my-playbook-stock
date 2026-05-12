import type { Holding, Playbook, HoldingWithValue } from "@/types";

export function computeHoldings(
  holdings: Holding[],
  playbook: Playbook,
  prices: Record<string, number>,
  usdThb: number
): HoldingWithValue[] {
  const coreAssets = playbook.assets.filter((a) => !a.isCashReserve);

  // Calculate USD values
  const withValues = holdings.map((h) => {
    const price = h.currency === "THB"
      ? (prices[h.ticker] ?? h.avgCost)
      : (prices[h.ticker] ?? 0);

    const currentValueUSD = h.currency === "THB"
      ? (h.shares * price) / usdThb
      : h.shares * price;

    const currentValueTHB = currentValueUSD * usdThb;
    const currentPrice = price;

    const costBasisUSD = h.currency === "THB"
      ? (h.shares * h.avgCost) / usdThb
      : h.shares * h.avgCost;
    const pnlUSD = currentValueUSD - costBasisUSD;
    const pnlPct = costBasisUSD > 0 ? (pnlUSD / costBasisUSD) * 100 : 0;

    const playbookAsset = playbook.assets.find((a) => a.ticker === h.ticker);
    const targetPct = playbookAsset?.targetPct ?? 0;
    const trimThreshold = playbookAsset?.trimThreshold;

    return { ...h, currentPrice, currentValueUSD, currentValueTHB, costBasisUSD, pnlUSD, pnlPct, targetPct, trimThreshold, allocationPct: 0, diffPct: 0, needsTrim: false };
  });

  // Core total (exclude cash reserve)
  const cashTicker = playbook.cashReserve.ticker;
  const coreTotal = withValues
    .filter((h) => h.ticker !== cashTicker)
    .reduce((s, h) => s + h.currentValueUSD, 0);

  // Assign allocation %
  return withValues.map((h) => {
    const allocationPct = coreTotal > 0 && h.ticker !== cashTicker
      ? (h.currentValueUSD / coreTotal) * 100
      : 0;
    const diffPct = allocationPct - h.targetPct;

    const trimRule = playbook.trimRules.find((r) => r.ticker === h.ticker);
    const needsTrim = trimRule ? allocationPct >= trimRule.triggerPct : false;

    return { ...h, allocationPct, diffPct, needsTrim };
  });
}

export function getCashReserveHolding(
  holdings: HoldingWithValue[],
  playbook: Playbook
): HoldingWithValue | undefined {
  if (playbook.cashReserve.type === "TICKER") {
    return holdings.find((h) => h.ticker === playbook.cashReserve.ticker);
  }
  return undefined;
}

export function getCashReservePct(
  holdings: HoldingWithValue[],
  playbook: Playbook
): number {
  const cashH = getCashReserveHolding(holdings, playbook);
  if (!cashH) return 0;
  const coreTotal = holdings
    .filter((h) => h.ticker !== playbook.cashReserve.ticker)
    .reduce((s, h) => s + h.currentValueUSD, 0);
  return coreTotal > 0 ? (cashH.currentValueUSD / coreTotal) * 100 : 0;
}

export function getCrisisLevel(drawdownPct: number, playbook: Playbook): number {
  const sorted = [...playbook.crisisRules].sort((a, b) => b.drawdownPct - a.drawdownPct);
  for (const rule of sorted) {
    if (drawdownPct >= rule.drawdownPct) return rule.level;
  }
  return 0;
}
