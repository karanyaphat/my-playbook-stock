"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePortfolioStore } from "@/stores/portfolio.store";
import { getMonitorSettings, saveMonitorSettings } from "@/lib/firestore";
import { getCashReservePct, getCrisisLevel } from "@/lib/engine/allocator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Shield, TrendingDown, CheckCircle, RefreshCw, Loader2 } from "lucide-react";

export default function MonitorPage() {
  const { user } = useAuth();
  const { activePlaybook, holdings } = usePortfolioStore();

  const [ndxCurrent, setNdxCurrent] = useState(0);
  const [ndxATH, setNdxATH] = useState(0);
  const [lastUpdated, setLastUpdated] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [athLoading, setAthLoading] = useState(true);

  const refIndex = activePlaybook?.referenceIndex ?? "^NDX";

  const fetchAll = useCallback(async () => {
    const tickers = activePlaybook
      ? [...activePlaybook.assets.map((a) => a.ticker).filter((t) => !t.startsWith("K-")),
         activePlaybook.cashReserve.ticker ?? ""].filter(Boolean)
      : [];

    // Fetch prices + ATH + cached ATH from Firestore in parallel
    const [priceRes, settings] = await Promise.all([
      fetch(`/api/prices?tickers=${[...new Set(tickers)].join(",")}&athTicker=${encodeURIComponent(refIndex)}&refTicker=${encodeURIComponent(refIndex)}`).then((r) => r.json()),
      user ? getMonitorSettings(user.uid) : Promise.resolve(null),
    ]);

    if (priceRes.refPrice) setNdxCurrent(priceRes.refPrice);
    if (priceRes.updatedAt) setLastUpdated(new Date(priceRes.updatedAt).toLocaleTimeString("th-TH"));

    // Merge: use highest of fetched ATH vs cached ATH
    const cachedATH = settings?.referenceIndexATH?.[refIndex] ?? 0;
    const fetchedATH = priceRes.ath ?? 0;
    const bestATH = Math.max(fetchedATH, cachedATH);

    if (bestATH > 0) {
      setNdxATH(bestATH);
      // Auto-save to Firestore if fetched a new higher ATH
      if (user && fetchedATH > cachedATH) {
        await saveMonitorSettings(user.uid, {
          referenceIndexATH: { [refIndex]: fetchedATH },
        });
      }
    }
    setAthLoading(false);
  }, [user, activePlaybook, refIndex]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function handleRefresh() {
    setRefreshing(true);
    setAthLoading(true);
    await fetchAll();
    setRefreshing(false);
  }

  // ---- Derived ----
  const drawdown = ndxATH > 0 && ndxCurrent > 0
    ? Math.max(0, ((ndxATH - ndxCurrent) / ndxATH) * 100)
    : 0;
  const currentLevel = activePlaybook ? getCrisisLevel(drawdown, activePlaybook) : 0;
  const cashPct = activePlaybook ? getCashReservePct(holdings, activePlaybook) : 0;
  const trimAlerts = holdings.filter((h) => h.needsTrim);
  const cashFloor = activePlaybook?.cashReserve.floor ?? 5;
  const cashMax = activePlaybook?.cashReserve.max ?? 15;
  const cashLow = cashPct < cashFloor;
  const cashFull = cashPct > cashMax;

  const activeCrisisRule = activePlaybook?.crisisRules.find((r) => r.level === currentLevel);
  const coreValueUSD = holdings.filter((h) => h.ticker !== activePlaybook?.cashReserve.ticker).reduce((s, h) => s + h.currentValueUSD, 0);
  const cashHolding = holdings.find((h) => h.ticker === activePlaybook?.cashReserve.ticker);
  const cashValueUSD = cashHolding?.currentValueUSD ?? 0;
  const floorUSD = (cashFloor / 100) * coreValueUSD;
  const deployableUSD = Math.max(0, cashValueUSD - floorUSD);

  // Gauge config
  const sortedRules = [...(activePlaybook?.crisisRules ?? [])].sort((a, b) => a.drawdownPct - b.drawdownPct);
  const maxThreshold = sortedRules.length > 0 ? Math.max(...sortedRules.map((r) => r.drawdownPct)) + 10 : 50;
  const gaugeFillPct = Math.min((drawdown / maxThreshold) * 100, 100);
  const gaugeColor = currentLevel === 0 ? "#10b981" : currentLevel === 1 ? "#f59e0b" : currentLevel >= 2 ? "#ef4444" : "#f97316";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monitor</h1>
          <p className="text-sm text-muted-foreground">แจ้งเตือนและติดตามตาม Playbook</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className={trimAlerts.length > 0 ? "border-red-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trim Signals</CardTitle>
            <AlertTriangle className={`w-4 h-4 ${trimAlerts.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${trimAlerts.length > 0 ? "text-red-500" : "text-green-600"}`}>
              {trimAlerts.length > 0 ? trimAlerts.length : "✓"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {trimAlerts.length > 0 ? trimAlerts.map((h) => h.ticker).join(", ") : "ทุก Asset อยู่ในเกณฑ์"}
            </p>
          </CardContent>
        </Card>

        <Card className={cashLow ? "border-red-300" : cashFull ? "border-indigo-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash Reserve</CardTitle>
            <Shield className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${cashLow ? "text-red-500" : cashFull ? "text-indigo-600" : "text-green-600"}`}>
              {cashPct.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {cashLow ? "⚠️ ต่ำกว่า Floor" : cashFull ? "📤 เต็ม — Re-invest" : "✅ ปกติ"} (เป้า {cashFloor}–{cashMax}%)
            </p>
          </CardContent>
        </Card>

        <Card className={currentLevel > 0 ? "border-orange-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Crisis Level</CardTitle>
            <TrendingDown className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${currentLevel === 0 ? "text-green-600" : currentLevel >= 3 ? "text-red-500" : "text-orange-500"}`}>
              {currentLevel === 0 ? "Normal" : `Level ${currentLevel}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {drawdown > 0 ? `-${drawdown.toFixed(1)}% จาก ATH` : athLoading ? "กำลังโหลด ATH..." : "ยังไม่มีข้อมูล ATH"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Trim Alert Details */}
      {trimAlerts.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-red-700 dark:text-red-400">🔴 Trim Signal — ต้องดำเนินการ</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {trimAlerts.map((h) => {
              const rule = activePlaybook?.trimRules.find((r) => r.ticker === h.ticker);
              return (
                <div key={h.ticker} className="flex items-center justify-between text-sm">
                  <span><strong>{h.ticker}</strong> อยู่ที่ <strong className="text-red-600">{h.allocationPct.toFixed(1)}%</strong> (threshold: {rule?.triggerPct ?? h.trimThreshold}%)</span>
                  <Badge variant="destructive" className="text-xs">Trim {rule?.trimActionPct ?? 5}% ของพอร์ต</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Crisis Monitor */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Crisis Monitor — {refIndex}</CardTitle>
            {lastUpdated && <span className="text-xs text-muted-foreground">อัปเดต {lastUpdated}</span>}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">

          {/* Price stats row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-4 py-3">
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                ATH (Auto)
                {athLoading && <Loader2 className="w-3 h-3 animate-spin" />}
              </span>
              <span className="text-xl font-bold tabular-nums">
                {ndxATH > 0 ? ndxATH.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground">10y high • auto-updated</span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border bg-muted/30 px-4 py-3">
              <span className="text-xs text-muted-foreground">ราคาปัจจุบัน</span>
              <span className="text-xl font-bold tabular-nums">
                {ndxCurrent > 0 ? ndxCurrent.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground">real-time</span>
            </div>
            <div className="flex flex-col gap-1 rounded-lg border px-4 py-3"
              style={{ background: drawdown > 0 ? "rgb(254 242 242)" : undefined }}
            >
              <span className="text-xs text-muted-foreground">Drawdown จาก ATH</span>
              <span className="text-xl font-bold tabular-nums" style={{ color: drawdown > 0 ? gaugeColor : undefined }}>
                {ndxATH > 0 && ndxCurrent > 0 ? `-${drawdown.toFixed(2)}%` : "—"}
              </span>
              <span className="text-[10px]" style={{ color: drawdown > 0 ? gaugeColor : "var(--muted-foreground)" }}>
                {currentLevel === 0 ? "ตลาดปกติ" : `Crisis Level ${currentLevel}`}
              </span>
            </div>
          </div>

          {/* Drawdown Gauge */}
          {ndxATH > 0 && sortedRules.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0% — ปกติ</span>
                <span className="font-medium" style={{ color: gaugeColor }}>
                  {drawdown > 0 ? `ตอนนี้ -${drawdown.toFixed(1)}%` : "ตลาดปกติ"}
                </span>
                <span>-{maxThreshold}%</span>
              </div>

              {/* Bar */}
              <div className="relative h-5 bg-muted rounded-full overflow-hidden">
                {/* Crisis zone backgrounds */}
                {sortedRules.map((rule, i) => {
                  const nextRule = sortedRules[i + 1];
                  const left = (rule.drawdownPct / maxThreshold) * 100;
                  const width = nextRule
                    ? ((nextRule.drawdownPct - rule.drawdownPct) / maxThreshold) * 100
                    : ((maxThreshold - rule.drawdownPct) / maxThreshold) * 100;
                  const opacity = 0.08 + i * 0.05;
                  return (
                    <div key={rule.level} className="absolute top-0 h-full bg-red-500"
                      style={{ left: `${left}%`, width: `${width}%`, opacity }} />
                  );
                })}
                {/* Fill bar */}
                <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                  style={{ width: `${gaugeFillPct}%`, backgroundColor: gaugeColor, opacity: 0.85 }} />
                {/* Threshold tick marks */}
                {sortedRules.map((rule) => (
                  <div key={rule.level} className="absolute top-0 h-full w-px bg-white/70"
                    style={{ left: `${(rule.drawdownPct / maxThreshold) * 100}%` }} />
                ))}
              </div>

              {/* Labels under bar */}
              <div className="relative h-5">
                {sortedRules.map((rule) => (
                  <div key={rule.level}
                    className="absolute -translate-x-1/2 flex flex-col items-center"
                    style={{ left: `${(rule.drawdownPct / maxThreshold) * 100}%` }}
                  >
                    <span className="text-[10px] font-semibold text-muted-foreground">L{rule.level}</span>
                    <span className="text-[9px] text-muted-foreground">-{rule.drawdownPct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* No ATH state */}
          {!athLoading && ndxATH === 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 p-4 text-sm text-yellow-700 dark:text-yellow-300">
              ⚠️ ดึงข้อมูล ATH ไม่สำเร็จ — กด Refresh เพื่อลองใหม่
            </div>
          )}

          {/* Crisis action card */}
          {currentLevel > 0 && activeCrisisRule && (
            <div className="rounded-xl border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-orange-700 dark:text-orange-300">
                  Level {currentLevel} — {activeCrisisRule.description}
                </p>
                <Badge className="bg-orange-500 text-white">
                  Deploy ได้ ${deployableUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                {activeCrisisRule.allocations.map((alloc) => {
                  const deployTotal = deployableUSD * activeCrisisRule.deployCashPct / 100;
                  const amount = deployTotal * alloc.pct / 100;
                  return (
                    <div key={alloc.ticker} className="rounded-lg border bg-card p-3">
                      <p className="text-xs text-muted-foreground mb-1">{alloc.ticker}</p>
                      <p className="text-xl font-bold">${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                      <p className="text-xs text-muted-foreground">{alloc.pct}% ของ Deploy</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {currentLevel === 0 && ndxATH > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-300">ตลาดปกติ — DCA ตามแผน ไม่ต้อง Deploy Cash</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trim Rules Table */}
      {activePlaybook && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Trim Rules ของ Playbook</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b">
                  <th className="pb-2 text-left">Asset</th>
                  <th className="pb-2 text-right">สัดส่วนจริง</th>
                  <th className="pb-2 text-right">Trim เมื่อถึง</th>
                  <th className="pb-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {activePlaybook.trimRules.map((rule) => {
                  const h = holdings.find((x) => x.ticker === rule.ticker);
                  const pct = h?.allocationPct ?? 0;
                  const overLimit = pct >= rule.triggerPct;
                  return (
                    <tr key={rule.ticker} className="border-b last:border-0">
                      <td className="py-2 font-medium">{rule.ticker}</td>
                      <td className={`py-2 text-right font-semibold ${overLimit ? "text-red-500" : ""}`}>{pct.toFixed(1)}%</td>
                      <td className="py-2 text-right text-muted-foreground">{rule.triggerPct}%</td>
                      <td className="py-2 text-right">
                        {overLimit
                          ? <Badge variant="destructive" className="text-xs">TRIM</Badge>
                          : <Badge variant="outline" className="text-xs">OK</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
