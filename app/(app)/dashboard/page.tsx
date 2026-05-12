"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { usePortfolioStore } from "@/stores/portfolio.store";
import {
  getPlaybooks, getPortfolios, getHoldings, createPortfolio,
  updateUserProfile, getUserProfile, getManualPrices, saveManualPrices,
} from "@/lib/firestore";
import { computeHoldings, getCashReservePct } from "@/lib/engine/allocator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { RefreshCw, TrendingUp, DollarSign, Shield, AlertTriangle, BookOpen, ArrowRight, TrendingDown, Pencil, Check, X, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import Link from "next/link";
import type { Holding } from "@/types";

const COLORS = ["#6366f1","#3b82f6","#10b981","#14b8a6","#f59e0b","#f97316","#8b5cf6","#ec4899","#06b6d4","#84cc16"];

// API prices win over manual; manual fills gaps where API returns 0 or nothing
function mergeWithManual(
  apiPrices: Record<string, number>,
  manual: Record<string, number>
): Record<string, number> {
  const merged = { ...manual };
  Object.entries(apiPrices).forEach(([k, v]) => { if (v > 0) merged[k] = v; });
  return merged;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const pathname = usePathname();
  const {
    activePlaybook, activePortfolio, holdings, usdThb, prices,
    manualPrices,
    setActivePlaybook, setActivePortfolio, setHoldings, setPrices,
    setManualPrices, setLoading,
  } = usePortfolioStore();

  const [showComparison, setShowComparison] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Inline price edit state
  const [editingTicker, setEditingTicker] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Sort state
  const [sortKey, setSortKey] = useState<"currentValueUSD" | "pnlPct" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: "currentValueUSD" | "pnlPct") {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  // ---- Init ----
  const init = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [playbooks, portfolios, profile, manual] = await Promise.all([
      getPlaybooks(user.uid),
      getPortfolios(user.uid),
      getUserProfile(user.uid),
      getManualPrices(user.uid),
    ]);
    setManualPrices(manual);

    const activeId = (profile as { activePlaybookId?: string } | null)?.activePlaybookId;
    let playbook = playbooks.find((p) => p.id === activeId)
      ?? playbooks.find((p) => p.isActive)
      ?? playbooks[0]
      ?? null;
    let portfolio = portfolios[0] ?? null;

    if (!portfolio && playbook) {
      const pid = await createPortfolio(user.uid, {
        name: "My Portfolio",
        playbookId: playbook.id,
        baseCurrency: "USD",
      });
      await updateUserProfile(user.uid, { activePlaybookId: playbook.id, activePortfolioId: pid });
      portfolio = { id: pid, name: "My Portfolio", playbookId: playbook.id, baseCurrency: "USD", createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
    }

    setActivePlaybook(playbook);
    setActivePortfolio(portfolio);

    if (playbook && portfolio) {
      const rawHoldings = await getHoldings(user.uid, portfolio.id);
      const tickers = playbook.assets.map((a) => a.ticker).filter((t) => !t.startsWith("K-"));
      if (playbook.cashReserve.ticker) tickers.push(playbook.cashReserve.ticker);

      const priceRes = await fetch(`/api/prices?tickers=${[...new Set(tickers)].join(",")}`);
      const priceData = priceRes.ok ? await priceRes.json() : { prices: {}, usdThb: 33 };
      setPrices(priceData.prices ?? {}, priceData.usdThb ?? 33);

      const mergedPrices = mergeWithManual(priceData.prices ?? {}, manual);
      const computed = computeHoldings(rawHoldings as Holding[], playbook, mergedPrices, priceData.usdThb ?? 33);
      setHoldings(computed);
    }

    setInitialized(true);
    setLoading(false);
  }, [user, setActivePlaybook, setActivePortfolio, setHoldings, setLoading, setPrices, setManualPrices]);

  useEffect(() => { if (user) init(); }, [user, init]);

  // ---- Refresh ----
  async function doRefresh() {
    if (!user) return;
    const { activePlaybook: pb, activePortfolio: pf, manualPrices: manual } = usePortfolioStore.getState();
    if (!pb || !pf) return;
    const tickers = pb.assets.map((a: { ticker: string }) => a.ticker).filter((t: string) => !t.startsWith("K-"));
    if (pb.cashReserve.ticker) tickers.push(pb.cashReserve.ticker);
    const priceRes = await fetch(`/api/prices?tickers=${[...new Set(tickers)].join(",")}`);
    const priceData = priceRes.ok ? await priceRes.json() : { prices: {}, usdThb: 33 };
    setPrices(priceData.prices ?? {}, priceData.usdThb ?? 33);
    const mergedPrices = mergeWithManual(priceData.prices ?? {}, manual);
    const rawHoldings = await getHoldings(user.uid, pf.id);
    const computed = computeHoldings(rawHoldings as Holding[], pb, mergedPrices, priceData.usdThb ?? 33);
    setHoldings(computed);
  }

  useEffect(() => {
    doRefresh();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function handleRefresh() {
    setRefreshing(true);
    await doRefresh();
    setRefreshing(false);
  }

  // ---- Manual price inline edit ----
  function startEdit(ticker: string, currentPrice: number) {
    setEditingTicker(ticker);
    setEditPrice(currentPrice > 0 ? currentPrice.toString() : "");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function cancelEdit() {
    setEditingTicker(null);
    setEditPrice("");
  }

  async function commitEdit(ticker: string) {
    const price = parseFloat(editPrice);
    if (isNaN(price) || price <= 0) { cancelEdit(); return; }

    const { manualPrices: current, activePlaybook: pb, prices: apiPrices, usdThb: rate } = usePortfolioStore.getState();
    const updated = { ...current, [ticker]: price };
    setManualPrices(updated);
    if (user) await saveManualPrices(user.uid, updated);

    if (pb && user && activePortfolio) {
      const mergedPrices = mergeWithManual(apiPrices, updated);
      const rawHoldings = await getHoldings(user.uid, activePortfolio.id);
      const computed = computeHoldings(rawHoldings as Holding[], pb, mergedPrices, rate);
      setHoldings(computed);
    }
    cancelEdit();
  }

  // ---- Derived values ----
  const sortedHoldings = sortKey
    ? [...holdings].sort((a, b) => (a[sortKey] - b[sortKey]) * (sortDir === "asc" ? 1 : -1))
    : holdings;
  const coreHoldings = holdings.filter((h) => h.ticker !== activePlaybook?.cashReserve.ticker);
  const totalUSD = holdings.reduce((s, h) => s + h.currentValueUSD, 0);
  const totalTHB = totalUSD * usdThb;
  const totalCostUSD = holdings.reduce((s, h) => s + h.costBasisUSD, 0);
  const totalPnlUSD = holdings.reduce((s, h) => s + h.pnlUSD, 0);
  const totalPnlPct = totalCostUSD > 0 ? (totalPnlUSD / totalCostUSD) * 100 : 0;
  const cashReservePct = activePlaybook ? getCashReservePct(holdings, activePlaybook) : 0;
  const trimAlerts = holdings.filter((h) => h.needsTrim);

  const chartData = coreHoldings.map((h, i) => ({
    name: h.ticker, value: parseFloat(h.allocationPct.toFixed(2)), color: COLORS[i % COLORS.length],
  }));

  if (!initialized) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!activePlaybook) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <BookOpen className="w-12 h-12 text-muted-foreground" />
      <p className="text-muted-foreground">ยังไม่มี Playbook — สร้างก่อนเลยครับ</p>
      <Button render={<Link href="/playbook/new" />} nativeButton={false}>Create Playbook <ArrowRight className="ml-2 w-4 h-4" /></Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{activePlaybook.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setShowComparison((v) => !v)} className="gap-2">
            <BookOpen className="w-4 h-4" />
            {showComparison ? "ซ่อน" : "เปรียบเทียบ Playbook"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Trim Alerts */}
      {trimAlerts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300">
            <strong>Trim Signal:</strong> {trimAlerts.map((h) => h.ticker).join(", ")} เกิน threshold ตาม Playbook
          </p>
          <Link href="/monitor" className="ml-auto text-xs text-red-600 underline shrink-0">ดู Monitor →</Link>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">มูลค่ารวม (THB)</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">฿{totalTHB.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground mt-1">@{usdThb.toFixed(2)} THB/USD</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">มูลค่ารวม (USD)</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${totalUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
            <p className="text-xs text-muted-foreground mt-1">{holdings.length} assets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">กำไร/ขาดทุนรวม</CardTitle>
            {totalPnlUSD >= 0
              ? <TrendingUp className="w-4 h-4 text-green-500" />
              : <TrendingDown className="w-4 h-4 text-red-500" />}
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${totalPnlUSD >= 0 ? "text-green-600" : "text-red-500"}`}>
              {totalPnlUSD >= 0 ? "+" : ""}${totalPnlUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </p>
            <p className={`text-xs mt-1 font-medium ${totalPnlUSD >= 0 ? "text-green-600" : "text-red-500"}`}>
              {totalPnlPct >= 0 ? "+" : ""}{totalPnlPct.toFixed(2)}% จากต้นทุน
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash Reserve</CardTitle>
            <Shield className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{cashReservePct.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">
              เป้า {activePlaybook.cashReserve.floor}–{activePlaybook.cashReserve.max}%
              {" "}({activePlaybook.cashReserve.type === "TICKER" ? activePlaybook.cashReserve.ticker : activePlaybook.cashReserve.cashLabel})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trim Alerts</CardTitle>
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${trimAlerts.length > 0 ? "text-red-500" : "text-green-600"}`}>
              {trimAlerts.length > 0 ? trimAlerts.length : "✓"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {trimAlerts.length > 0 ? "assets ต้อง Trim" : "ทุก Asset อยู่ในเกณฑ์"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart + Table */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Pie chart */}
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle className="text-base">Allocation ปัจจุบัน</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                  {chartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
              {chartData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                  <span className="text-muted-foreground flex-1 truncate">{d.name}</span>
                  <span className="font-medium">{d.value.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Holdings table */}
        <Card className="xl:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Holdings</CardTitle>
            {showComparison && <Badge variant="outline" className="text-xs">vs Playbook Target</Badge>}
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="border-b">
                <tr className="text-muted-foreground text-xs">
                  <th className="px-4 py-2.5 text-left">Asset</th>
                  <th className="px-4 py-2.5 text-right">ราคา</th>
                  <th className="px-4 py-2.5 text-right">Shares</th>
                  <th className="px-4 py-2.5 text-right">ทุนเฉลี่ย</th>
                  <th
                    className="px-4 py-2.5 text-right cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("currentValueUSD")}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      มูลค่า
                      {sortKey === "currentValueUSD"
                        ? sortDir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
                        : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </span>
                  </th>
                  <th
                    className="px-4 py-2.5 text-right cursor-pointer hover:text-foreground select-none"
                    onClick={() => toggleSort("pnlPct")}
                  >
                    <span className="inline-flex items-center gap-1 justify-end">
                      กำไร/ขาดทุน
                      {sortKey === "pnlPct"
                        ? sortDir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />
                        : <ArrowUpDown className="w-3 h-3 opacity-40" />}
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-right">%พอร์ต</th>
                  {showComparison && <th className="px-4 py-2.5 text-right">เป้า%</th>}
                  {showComparison && <th className="px-4 py-2.5 text-right">Diff</th>}
                  <th className="px-4 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedHoldings.map((h, i) => {
                  const isCash = h.ticker === activePlaybook.cashReserve.ticker;
                  const diff = h.diffPct;
                  const sym = h.currency === "THB" ? "฿" : "$";
                  const isProfit = h.pnlUSD >= 0;
                  // Show "กรอกเอง" badge when manual price is active (API has no price)
                  const isManual = manualPrices[h.ticker] !== undefined && (prices[h.ticker] ?? 0) === 0;
                  const isEditing = editingTicker === h.ticker;

                  return (
                    <tr key={h.ticker} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                          <span className="font-medium">{h.ticker}</span>
                          {isCash && <Badge variant="outline" className="text-xs">Cash</Badge>}
                        </div>
                      </td>

                      {/* Price cell — inline editable */}
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {isEditing ? (
                          <form
                            className="flex items-center justify-end gap-1"
                            onSubmit={(e) => { e.preventDefault(); commitEdit(h.ticker); }}
                          >
                            <input
                              ref={inputRef}
                              type="number"
                              step="any"
                              min="0"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Escape") cancelEdit(); }}
                              className="w-24 text-right border rounded px-1.5 py-0.5 text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            />
                            <button type="submit" className="text-green-600 hover:text-green-700">
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button type="button" onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </form>
                        ) : (
                          <div
                            className="flex items-center justify-end gap-1.5 group cursor-pointer"
                            onClick={() => startEdit(h.ticker, h.currentPrice)}
                          >
                            {isManual && (
                              <span className="text-orange-500 text-[10px] font-medium bg-orange-50 dark:bg-orange-950/30 px-1 py-0.5 rounded">
                                กรอกเอง
                              </span>
                            )}
                            <span className={h.currentPrice === 0 ? "text-muted-foreground" : ""}>
                              {h.currentPrice === 0 ? "—" : `${sym}${h.currentPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                            </span>
                            <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {h.shares.toLocaleString("en-US", { maximumFractionDigits: 4 })}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                        {sym}{h.avgCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">
                        {h.currentPrice === 0 ? <span className="text-muted-foreground">—</span>
                          : `$${h.currentValueUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {h.currentPrice === 0 ? <span className="text-muted-foreground text-xs">กรอกราคาก่อน</span> : (
                          <div className={`flex flex-col items-end ${isProfit ? "text-green-600" : "text-red-500"}`}>
                            <span className="font-semibold text-xs">
                              {isProfit ? "+" : ""}${h.pnlUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                            </span>
                            <span className="text-xs opacity-80">
                              {isProfit ? "+" : ""}{h.pnlPct.toFixed(2)}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">{h.allocationPct.toFixed(1)}%</td>
                      {showComparison && <td className="px-4 py-2.5 text-right text-muted-foreground">{h.targetPct > 0 ? `${h.targetPct}%` : "—"}</td>}
                      {showComparison && (
                        <td className={`px-4 py-2.5 text-right font-medium ${diff > 5 ? "text-red-500" : diff < -5 ? "text-blue-500" : "text-muted-foreground"}`}>
                          {h.targetPct > 0 ? `${diff >= 0 ? "+" : ""}${diff.toFixed(1)}%` : "—"}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-center">
                        {h.needsTrim
                          ? <Badge variant="destructive" className="text-xs">TRIM</Badge>
                          : isCash ? <Badge variant="outline" className="text-xs">Reserve</Badge>
                          : <Badge variant="secondary" className="text-xs">OK</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
