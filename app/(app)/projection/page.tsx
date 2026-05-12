"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePortfolioStore } from "@/stores/portfolio.store";
import { getProjectionSettings, saveProjectionSettings } from "@/lib/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Legend } from "recharts";
import { Save, Info, Loader2 } from "lucide-react";
import type { PlaybookAsset } from "@/types";

interface Settings { monthlyDCA: number; annualBonus: number; targetMonthly: number; dividendYield: number; currentAge: number; retirementAge: number; }
const DEFAULT: Settings = { monthlyDCA: 10000, annualBonus: 50000, targetMonthly: 100000, dividendYield: 10, currentAge: 38, retirementAge: 55 };

// Fallback เมื่อดึง CAGR จริงไม่ได้ (เช่น K- fund หรือ ticker ที่ Yahoo ไม่มีข้อมูล)
function getFallbackReturn(asset: PlaybookAsset): number {
  const ticker = asset.ticker.toUpperCase();
  const role = asset.role.toLowerCase();
  if (ticker.startsWith("K-")) return 0.12;
  if (role.includes("growth")) return 0.14;
  if (role.includes("cashflow") || role.includes("income")) return 0.09;
  if (role.includes("insurance") || role.includes("safe") || role.includes("haven") || role.includes("gold")) return 0.05;
  if (role.includes("diversif") || role.includes("hedge")) return 0.09;
  if (role.includes("bond") || role.includes("fixed")) return 0.04;
  if (role.includes("cash") || ticker === "SGOV" || ticker === "VMFXX") return 0.05;
  return 0.10;
}

function calcPlaybookBaseRate(assets: PlaybookAsset[], cagrMap: Record<string, number>): number {
  const total = assets.reduce((s, a) => s + a.targetPct, 0);
  if (total <= 0) return 0.10;
  return assets.reduce((s, a) => {
    const rate = cagrMap[a.ticker] ?? getFallbackReturn(a);
    return s + (a.targetPct / total) * rate;
  }, 0);
}

function buildScenarios(baseRate: number) {
  const pct = (r: number) => `${(r * 100).toFixed(1)}%`;
  return [
    { key: "conservative", label: `Conservative (${pct(baseRate - 0.03)})`, rate: baseRate - 0.03, color: "#94a3b8" },
    { key: "base",         label: `Base (${pct(baseRate)})`,                 rate: baseRate,         color: "#6366f1" },
    { key: "optimistic",   label: `Optimistic (${pct(baseRate + 0.03)})`,    rate: baseRate + 0.03,  color: "#10b981" },
  ];
}

function project(initialTHB: number, s: Settings, scenarios: ReturnType<typeof buildScenarios>) {
  const annual = s.monthlyDCA * 12 + s.annualBonus;
  const vals: Record<string, number> = Object.fromEntries(scenarios.map(({ key }) => [key, initialTHB]));
  const pts: Record<string, unknown>[] = [
    { age: s.currentAge, ...Object.fromEntries(scenarios.map(({ key }) => [key, initialTHB / 1e6])) },
  ];
  for (let i = 1; i <= 65 - s.currentAge; i++) {
    scenarios.forEach(({ key, rate }) => { vals[key] = vals[key] * (1 + rate) + annual; });
    const entry: Record<string, unknown> = { age: s.currentAge + i };
    scenarios.forEach(({ key }) => { entry[key] = parseFloat((vals[key] / 1e6).toFixed(3)); });
    pts.push(entry);
  }
  return pts;
}

export default function ProjectionPage() {
  const { user } = useAuth();
  const { holdings, usdThb, activePlaybook } = usePortfolioStore();
  const [settings, setSettings] = useState<Settings>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [cagrMap, setCagrMap] = useState<Record<string, number>>({});
  const [cagrLoading, setCagrLoading] = useState(true);

  // Fetch actual CAGR for all non-K- tickers
  useEffect(() => {
    if (!activePlaybook) { setCagrLoading(false); return; }
    const fetchableTickers = activePlaybook.assets
      .map((a) => a.ticker)
      .filter((t) => !t.startsWith("K-"));
    if (fetchableTickers.length === 0) { setCagrLoading(false); return; }
    setCagrLoading(true);
    fetch(`/api/prices?cagrTickers=${[...new Set(fetchableTickers)].join(",")}`)
      .then((r) => r.json())
      .then((data) => { setCagrMap(data.cagr ?? {}); })
      .catch(() => {})
      .finally(() => setCagrLoading(false));
  }, [activePlaybook]);

  useEffect(() => {
    if (!user) return;
    getProjectionSettings(user.uid).then((s) => {
      if (s) setSettings({
        monthlyDCA: s.monthlyDCA ?? DEFAULT.monthlyDCA,
        annualBonus: s.annualBonus ?? DEFAULT.annualBonus,
        targetMonthly: s.targetMonthlyIncome ?? DEFAULT.targetMonthly,
        dividendYield: s.dividendYieldPct ?? DEFAULT.dividendYield,
        currentAge: s.currentAge ?? DEFAULT.currentAge,
        retirementAge: s.retirementAge ?? DEFAULT.retirementAge,
      });
    });
  }, [user]);

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    await saveProjectionSettings(user.uid, {
      monthlyDCA: settings.monthlyDCA,
      annualBonus: settings.annualBonus,
      targetMonthlyIncome: settings.targetMonthly,
      dividendYieldPct: settings.dividendYield,
      currentAge: settings.currentAge,
      retirementAge: settings.retirementAge,
    });
    setSaving(false);
  }

  function upd(k: keyof Settings, v: number) { setSettings((p) => ({ ...p, [k]: v })); }

  const baseRate = calcPlaybookBaseRate(activePlaybook?.assets ?? [], cagrMap);
  const scenarios = buildScenarios(baseRate);
  const totalTHB = holdings.reduce((s, h) => s + h.currentValueTHB, 0) || 882000;
  const targetM = (settings.targetMonthly * 12) / (settings.dividendYield / 100) / 1e6;
  const data = project(totalTHB, settings, scenarios);
  const retirePt = data.find((p) => p.age === settings.retirementAge);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Projection</h1><p className="text-sm text-muted-foreground">คาดการณ์มูลค่าพอร์ตและ Passive Income</p></div>
        <Button onClick={handleSave} disabled={saving} className="gap-2"><Save className="w-4 h-4" />{saving ? "Saving..." : "Save"}</Button>
      </div>

      {/* CAGR info banner */}
      {activePlaybook && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <Info className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex flex-col gap-1.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">{activePlaybook.name}</span>
              {cagrLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            </div>
            <span className="text-muted-foreground text-xs">
              Base rate: <strong className="text-foreground">{(baseRate * 100).toFixed(1)}%</strong>
              {" "}(weighted จาก Total Return จริง 10 ปี — ราคา + ปันผล reinvested)
              {" — "}Conservative {((baseRate - 0.03) * 100).toFixed(1)}% / Base {(baseRate * 100).toFixed(1)}% / Optimistic {((baseRate + 0.03) * 100).toFixed(1)}%
            </span>
            {/* Per-ticker CAGR breakdown */}
            {!cagrLoading && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-0.5">
                {activePlaybook.assets.map((a) => {
                  const real = cagrMap[a.ticker];
                  const fallback = getFallbackReturn(a);
                  const rate = real ?? fallback;
                  const isReal = real != null;
                  return (
                    <span key={a.ticker} className="text-xs">
                      <span className="font-medium">{a.ticker}</span>{" "}
                      <span className={isReal ? "text-green-600 font-semibold" : "text-orange-500"}>
                        {(rate * 100).toFixed(1)}%
                      </span>
                      <span className="text-muted-foreground ml-0.5">
                        {isReal ? "(10y total return)" : "(est.)"}
                      </span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">ตั้งค่า</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 xl:grid-cols-3 gap-6">
          {[
            { label: "DCA รายเดือน", key: "monthlyDCA", min: 1000, max: 100000, step: 1000, fmt: (v: number) => `฿${v.toLocaleString()}` },
            { label: "Dividend Yield หลังเกษียณ", key: "dividendYield", min: 5, max: 20, step: 0.5, fmt: (v: number) => `${v}%` },
            { label: "อายุเกษียณ", key: "retirementAge", min: 45, max: 65, step: 1, fmt: (v: number) => `${v} ปี` },
          ].map(({ label, key, min, max, step, fmt }) => (
            <div key={key} className="flex flex-col gap-3">
              <div className="flex justify-between"><Label>{label}</Label><span className="text-sm font-semibold">{fmt(settings[key as keyof Settings])}</span></div>
              <Slider min={min} max={max} step={step} value={[settings[key as keyof Settings]]}
                onValueChange={(v) => upd(key as keyof Settings, Array.isArray(v) ? v[0] : v)} />
              <div className="flex justify-between text-xs text-muted-foreground"><span>{fmt(min)}</span><span>{fmt(max)}</span></div>
            </div>
          ))}
          <div className="flex flex-col gap-2"><Label>โบนัสรายปี (THB)</Label><Input type="number" value={settings.annualBonus} onChange={(e) => upd("annualBonus", +e.target.value)} /></div>
          <div className="flex flex-col gap-2"><Label>Passive Income เป้าหมาย/เดือน</Label><Input type="number" value={settings.targetMonthly} onChange={(e) => upd("targetMonthly", +e.target.value)} /></div>
          <div className="flex flex-col gap-2"><Label>อายุปัจจุบัน</Label><Input type="number" value={settings.currentAge} onChange={(e) => upd("currentAge", +e.target.value)} /></div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={360}>
            <LineChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="age" label={{ value: "อายุ", position: "insideBottomRight", offset: -8, fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `฿${v}M`} width={72} />
              <Tooltip formatter={(v) => `฿${Number(v).toFixed(2)}M`} labelFormatter={(l) => `อายุ ${l} ปี`} />
              <Legend verticalAlign="top" height={36} />
              <ReferenceLine y={targetM} stroke="#f59e0b" strokeDasharray="6 3" strokeWidth={2}
                label={{ value: `เป้า ฿${targetM.toFixed(1)}M`, fill: "#f59e0b", fontSize: 11, position: "insideTopRight" }} />
              <ReferenceLine x={settings.retirementAge} stroke="#6366f1" strokeDasharray="6 3" strokeWidth={2}
                label={{ value: `เกษียณ`, fill: "#6366f1", fontSize: 11, position: "insideTopLeft" }} />
              {scenarios.map(({ key, label, color }) => (
                <Line key={key} type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Retirement snapshot */}
      <div className="grid grid-cols-3 gap-4">
        {scenarios.map(({ key, label, color }) => {
          const val = (retirePt?.[key] as number) ?? 0;
          const monthly = (val * 1e6 * settings.dividendYield / 100) / 12;
          const hit = monthly >= settings.targetMonthly;
          return (
            <Card key={key} style={hit ? { borderColor: color, borderWidth: 2 } : {}}>
              <CardContent className="pt-4 flex flex-col gap-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-bold" style={{ color }}>฿{val.toFixed(2)}M</p>
                <p className="text-sm font-medium">~฿{monthly.toLocaleString("th-TH", { maximumFractionDigits: 0 })}/เดือน</p>
                {hit
                  ? <p className="text-xs text-green-600 font-medium">✅ ถึงเป้า {settings.targetMonthly.toLocaleString()}</p>
                  : <p className="text-xs text-red-500">ขาด ฿{(settings.targetMonthly - monthly).toLocaleString("th-TH", { maximumFractionDigits: 0 })}/เดือน</p>}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
