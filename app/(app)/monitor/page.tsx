"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePortfolioStore } from "@/stores/portfolio.store";
import { getMonitorSettings, saveMonitorSettings } from "@/lib/firestore";
import { computeHoldings, getCashReservePct, getCrisisLevel } from "@/lib/engine/allocator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Shield, TrendingDown, CheckCircle, RefreshCw, Save } from "lucide-react";
import type { Holding } from "@/types";

export default function MonitorPage() {
  const { user } = useAuth();
  const { activePlaybook, activePortfolio, holdings, usdThb } = usePortfolioStore();
  const [ndxCurrent, setNdxCurrent] = useState(0);
  const [ndxATH, setNdxATH] = useState("");
  const [athInput, setAthInput] = useState("");
  const [lastUpdated, setLastUpdated] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchPricesAndSettings = useCallback(async () => {
    const tickers = activePlaybook
      ? [...activePlaybook.assets.map((a) => a.ticker).filter((t) => !t.startsWith("K-")),
        activePlaybook.cashReserve.ticker ?? ""].filter(Boolean)
      : [];

    const [priceRes, settings] = await Promise.all([
      tickers.length ? fetch(`/api/prices?tickers=${[...new Set(tickers)].join(",")}`).then((r) => r.json()) : Promise.resolve({ ndx: 0 }),
      user ? getMonitorSettings(user.uid) : Promise.resolve(null),
    ]);

    if (priceRes.ndx) setNdxCurrent(priceRes.ndx);
    if (priceRes.updatedAt) setLastUpdated(new Date(priceRes.updatedAt).toLocaleTimeString("th-TH"));
    if (settings?.referenceIndexATH) {
      const ath = settings.referenceIndexATH[activePlaybook?.referenceIndex ?? "^NDX"] ?? 0;
      if (ath) { setNdxATH(ath.toString()); setAthInput(ath.toString()); }
    }
  }, [user, activePlaybook]);

  useEffect(() => { fetchPricesAndSettings(); }, [fetchPricesAndSettings]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchPricesAndSettings();
    setRefreshing(false);
  }

  async function handleSaveATH() {
    if (!user || !athInput || !activePlaybook) return;
    setSaving(true);
    const key = activePlaybook.referenceIndex;
    await saveMonitorSettings(user.uid, {
      referenceIndexATH: { [key]: parseFloat(athInput) },
    });
    setNdxATH(athInput);
    setSaving(false);
  }

  const ath = parseFloat(ndxATH) || 0;
  const drawdown = ath > 0 && ndxCurrent > 0 ? Math.max(0, ((ath - ndxCurrent) / ath) * 100) : 0;
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Monitor</h1><p className="text-sm text-muted-foreground">แจ้งเตือนและติดตามตาม Playbook</p></div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />Refresh
        </Button>
      </div>

      {/* Alerts Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card className={trimAlerts.length > 0 ? "border-red-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Trim Signals</CardTitle>
            <AlertTriangle className={`w-4 h-4 ${trimAlerts.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${trimAlerts.length > 0 ? "text-red-500" : "text-green-600"}`}>{trimAlerts.length > 0 ? trimAlerts.length : "✓"}</p>
            <p className="text-xs text-muted-foreground mt-1">{trimAlerts.length > 0 ? trimAlerts.map((h) => h.ticker).join(", ") : "ทุก Asset อยู่ในเกณฑ์"}</p>
          </CardContent>
        </Card>

        <Card className={cashLow ? "border-red-300" : cashFull ? "border-indigo-300" : ""}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cash Reserve</CardTitle>
            <Shield className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${cashLow ? "text-red-500" : cashFull ? "text-indigo-600" : "text-green-600"}`}>{cashPct.toFixed(1)}%</p>
            <p className="text-xs text-muted-foreground mt-1">{cashLow ? "⚠️ ต่ำกว่า Floor" : cashFull ? "📤 เต็ม — Re-invest" : "✅ ปกติ"} (เป้า {cashFloor}–{cashMax}%)</p>
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
            <p className="text-xs text-muted-foreground mt-1">{drawdown > 0 ? `-${drawdown.toFixed(1)}% จาก ATH` : "กรุณาตั้ง ATH"}</p>
          </CardContent>
        </Card>
      </div>

      {/* Trim Alert Details */}
      {trimAlerts.length > 0 && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardHeader className="pb-3"><CardTitle className="text-sm text-red-700 dark:text-red-400">🔴 Trim Signal — ต้องดำเนินการ</CardTitle></CardHeader>
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
        <CardHeader className="pb-3"><CardTitle className="text-base">Crisis Monitor — {activePlaybook?.referenceIndex}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <Label>ATH</Label>
              <div className="flex gap-2">
                <Input type="number" step="any" placeholder="e.g. 22000" value={athInput} onChange={(e) => setAthInput(e.target.value)} />
                <Button size="icon" variant="outline" onClick={handleSaveATH} disabled={saving}><Save className="w-4 h-4" /></Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>ราคาปัจจุบัน (Auto)</Label>
              <div className="h-10 px-3 rounded-md border bg-muted flex items-center text-sm font-semibold">
                {ndxCurrent > 0 ? ndxCurrent.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}
              </div>
              {lastUpdated && <p className="text-xs text-muted-foreground">อัปเดต {lastUpdated}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Drawdown จาก ATH</Label>
              <div className={`h-10 px-3 rounded-md border flex items-center font-bold text-sm ${drawdown > 0 ? "text-red-500 bg-red-50" : "bg-muted"}`}>
                {ath > 0 && ndxCurrent > 0 ? `-${drawdown.toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>

          {currentLevel > 0 && activeCrisisRule && (
            <div className="rounded-xl border-2 border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-orange-700 dark:text-orange-300">Level {currentLevel} — {activeCrisisRule.description}</p>
                <Badge className="bg-orange-500 text-white">Deploy ได้ ${deployableUSD.toLocaleString("en-US", { maximumFractionDigits: 0 })}</Badge>
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

          {currentLevel === 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
              <p className="text-sm text-green-700 dark:text-green-300">ตลาดปกติ — DCA ตามแผน ไม่ต้อง Deploy Cash</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Playbook Rules Reminder */}
      {activePlaybook && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Trim Rules ของ Playbook</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground border-b">
                <th className="pb-2 text-left">Asset</th><th className="pb-2 text-right">สัดส่วนจริง</th>
                <th className="pb-2 text-right">Trim เมื่อถึง</th><th className="pb-2 text-right">Status</th>
              </tr></thead>
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
                        {overLimit ? <Badge variant="destructive" className="text-xs">TRIM</Badge> : <Badge variant="outline" className="text-xs">OK</Badge>}
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
