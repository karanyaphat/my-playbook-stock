"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePortfolioStore } from "@/stores/portfolio.store";
import { getPlaybooks, updatePlaybook, deletePlaybook, updateUserProfile } from "@/lib/firestore";
import { generatePlaybookMarkdown } from "@/lib/playbook/generate-doc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlusCircle, Edit, Trash2, CheckCircle, BookMarked, FileText, Download } from "lucide-react";
import Link from "next/link";
import type { Playbook } from "@/types";

function redirectLabel(to: string): string {
  if (to === "CASH_RESERVE") return "Cash Reserve";
  if (to === "LOWEST_ASSET") return "Asset ที่มีสัดส่วนน้อยที่สุด";
  return to;
}

function formatDate(ts: { seconds: number }): string {
  return new Date(ts.seconds * 1000).toLocaleDateString("th-TH", {
    day: "numeric", month: "long", year: "numeric",
  });
}

// ---- Document renderer (in-app styled view) ----
function PlaybookDoc({ p }: { p: Playbook }) {
  const cash = p.cashReserve.type === "TICKER" ? p.cashReserve.ticker : p.cashReserve.cashLabel;
  const growthAssets = p.assets.filter((a) => a.role.toLowerCase().includes("growth"));
  const incomeAssets = p.assets.filter((a) => a.role.toLowerCase().includes("income") || a.role.toLowerCase().includes("cashflow"));
  const hedgeAssets = p.assets.filter((a) => ["gold", "insurance", "haven", "safe"].some((k) => a.role.toLowerCase().includes(k)));
  const otherAssets = p.assets.filter((a) => ![...growthAssets, ...incomeAssets, ...hedgeAssets].includes(a));
  const totalPct = p.assets.reduce((s, a) => s + a.targetPct, 0);

  return (
    <div className="flex flex-col gap-8 text-sm leading-relaxed">

      {/* Header */}
      <div className="flex flex-col gap-1">
        {p.description && <p className="text-muted-foreground">{p.description}</p>}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
          <span>📅 สร้างเมื่อ {formatDate(p.createdAt)}</span>
          <span>📊 Reference: <strong className="text-foreground">{p.referenceIndex}</strong></span>
          <span>💱 สกุลเงิน: <strong className="text-foreground">{p.currency}</strong></span>
        </div>
      </div>

      <hr />

      {/* Asset Allocation */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">🎯 Asset Allocation</h2>
        <p className="text-muted-foreground text-xs">
          สัดส่วนเป้าหมายของแต่ละ asset ใน Playbook นี้ ใช้เป็นแนวทางในการ DCA และ Rebalance
          หาก asset ใดมีสัดส่วนเกิน Trim Threshold ที่กำหนดไว้ ระบบจะแจ้งเตือนให้ทำการ Trim
        </p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr className="text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Ticker</th>
                <th className="px-3 py-2 text-left font-medium">Role</th>
                <th className="px-3 py-2 text-center font-medium">สัดส่วน</th>
                <th className="px-3 py-2 text-center font-medium">สกุลเงิน</th>
                <th className="px-3 py-2 text-center font-medium">Trim Threshold</th>
              </tr>
            </thead>
            <tbody>
              {p.assets.map((a, i) => (
                <tr key={a.ticker} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                  <td className="px-3 py-2 font-bold">{a.ticker}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.role}</td>
                  <td className="px-3 py-2 text-center font-semibold">{a.targetPct}%</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${a.currency === "THB" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                      {a.currency}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-muted-foreground">
                    {a.trimThreshold ? <span className="font-medium text-orange-600">{a.trimThreshold}%</span> : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg bg-muted/40 border px-4 py-3 text-xs flex flex-col gap-0.5">
          <span className="font-semibold">Cash Reserve: {cash}</span>
          <span className="text-muted-foreground">
            เป้าหมาย {p.cashReserve.floor}–{p.cashReserve.max}% ของพอร์ต —
            เงินสำรองสภาพคล่องสูง ไม่นับรวมใน allocation หลัก แต่ใช้ Deploy ในช่วง Crisis
          </span>
        </div>
      </section>

      <hr />

      {/* Crisis Rules */}
      {p.crisisRules.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold">🛡️ Crisis Deployment Rules</h2>
          <p className="text-muted-foreground text-xs">
            เมื่อ <strong>{p.referenceIndex}</strong> ปรับตัวลงจาก All-Time High (ATH) ถึงระดับที่กำหนด
            ให้นำ Cash Reserve ออกมา Deploy ซื้อ asset ตามสัดส่วนที่ระบุในแต่ละ Level
            กลยุทธ์นี้ช่วยลด average cost และเพิ่ม upside ในช่วงที่ตลาดอ่อนแอ
          </p>
          <div className="flex flex-col gap-3">
            {p.crisisRules.map((r) => (
              <div key={r.level} className="rounded-lg border p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center shrink-0">{r.level}</span>
                  <span className="font-semibold text-sm">Level {r.level} — ลดลง ≥ {r.drawdownPct}%</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-muted/40 rounded p-2">
                    <p className="text-muted-foreground mb-0.5">Deploy Cash</p>
                    <p className="font-bold text-base">{r.deployCashPct}%</p>
                    <p className="text-muted-foreground text-[10px]">ของ Cash Reserve ที่มีอยู่</p>
                  </div>
                  {r.allocations?.length > 0 && (
                    <div className="bg-muted/40 rounded p-2">
                      <p className="text-muted-foreground mb-1">จัดสรรไปที่</p>
                      {r.allocations.map((a) => (
                        <div key={a.ticker} className="flex justify-between">
                          <span className="font-medium">{a.ticker}</span>
                          <span className="font-bold">{a.pct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {r.description && (
                  <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">"{r.description}"</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {p.crisisRules.length > 0 && <hr />}

      {/* Trim Rules */}
      {p.trimRules.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-bold">✂️ Trim Rules</h2>
          <p className="text-muted-foreground text-xs">
            เมื่อ asset ใดมีสัดส่วนในพอร์ตสูงเกิน Trigger ที่กำหนด ให้ขายทำกำไรบางส่วน
            และโอนเงินไปยังปลายทางที่กำหนดไว้ เพื่อรักษา balance ของพอร์ตไม่ให้ over-concentrated ใน asset ใด asset หนึ่ง
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Asset</th>
                  <th className="px-3 py-2 text-center font-medium">Trigger เมื่อ ≥</th>
                  <th className="px-3 py-2 text-center font-medium">Trim ออก</th>
                  <th className="px-3 py-2 text-left font-medium">โอนไปที่</th>
                </tr>
              </thead>
              <tbody>
                {p.trimRules.map((r, i) => (
                  <tr key={r.ticker} className={i % 2 === 0 ? "" : "bg-muted/20"}>
                    <td className="px-3 py-2 font-bold">{r.ticker}</td>
                    <td className="px-3 py-2 text-center font-semibold text-orange-600">{r.triggerPct}%</td>
                    <td className="px-3 py-2 text-center">{r.trimActionPct}% ของ {r.ticker}</td>
                    <td className="px-3 py-2 text-muted-foreground">{redirectLabel(r.redirectTo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {p.trimRules.length > 0 && <hr />}

      {/* Failure Protocol */}
      {p.failureProtocol && (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="text-base font-bold">⚠️ Failure Protocol</h2>
            <p className="text-muted-foreground text-xs">
              กลไกตรวจสอบว่า Playbook นี้ยังทำงานได้ดีพอหรือไม่
              โดยเปรียบเทียบผลตอบแทนกับ benchmark หากแพ้ benchmark ต่อเนื่องยาวนาน
              แสดงว่า Playbook นี้อาจไม่เหมาะกับสภาวะตลาดปัจจุบัน ควรทบทวนกลยุทธ์
            </p>
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 px-4 py-3 text-xs flex flex-col gap-1">
              <p>
                ถ้า Playbook นี้ให้ผลตอบแทนต่ำกว่า{" "}
                <strong>{p.failureProtocol.benchmarkTicker}</strong> เกิน{" "}
                <strong>{p.failureProtocol.underperformPct}%</strong> ต่อเนื่อง{" "}
                <strong>{p.failureProtocol.durationYears} ปี</strong>
              </p>
              <p className="text-muted-foreground">
                → {p.failureProtocol.action === "SWITCH_PLAYBOOK"
                  ? "เปลี่ยนไปใช้ Playbook อื่น"
                  : "ลด weight ของ assets หลักและปรับ allocation ใหม่"}
              </p>
            </div>
          </section>
          <hr />
        </>
      )}

      {/* Summary */}
      <section className="flex flex-col gap-3">
        <h2 className="text-base font-bold">📋 สรุปกลยุทธ์</h2>
        <div className="rounded-lg bg-muted/40 border p-4 flex flex-col gap-2 text-xs">
          <p>Playbook นี้ประกอบด้วย asset <strong>{p.assets.length} ตัว</strong> รวม allocation <strong>{totalPct}%</strong></p>
          <div className="flex flex-col gap-1 mt-1">
            {growthAssets.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">Growth ({growthAssets.reduce((s, a) => s + a.targetPct, 0)}%)</span>
                <span className="font-medium">{growthAssets.map((a) => a.ticker).join(", ")}</span>
              </div>
            )}
            {incomeAssets.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">Income / Cashflow ({incomeAssets.reduce((s, a) => s + a.targetPct, 0)}%)</span>
                <span className="font-medium">{incomeAssets.map((a) => a.ticker).join(", ")}</span>
              </div>
            )}
            {hedgeAssets.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">Hedge / Insurance ({hedgeAssets.reduce((s, a) => s + a.targetPct, 0)}%)</span>
                <span className="font-medium">{hedgeAssets.map((a) => a.ticker).join(", ")}</span>
              </div>
            )}
            {otherAssets.length > 0 && (
              <div className="flex gap-2">
                <span className="text-muted-foreground w-36 shrink-0">Other ({otherAssets.reduce((s, a) => s + a.targetPct, 0)}%)</span>
                <span className="font-medium">{otherAssets.map((a) => a.ticker).join(", ")}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="text-muted-foreground w-36 shrink-0">Cash Reserve ({p.cashReserve.floor}–{p.cashReserve.max}%)</span>
              <span className="font-medium">{cash}</span>
            </div>
          </div>
          {p.crisisRules.length > 0 && (
            <p className="mt-1 text-muted-foreground">
              มีแผน Crisis Deployment <strong className="text-foreground">{p.crisisRules.length} ระดับ</strong>
              {" "}เริ่ม deploy เมื่อตลาดร่วงเกิน <strong className="text-foreground">{Math.min(...p.crisisRules.map((r) => r.drawdownPct))}%</strong>
            </p>
          )}
          {p.trimRules.length > 0 && (
            <p className="text-muted-foreground">
              มี Trim Rules <strong className="text-foreground">{p.trimRules.length} รายการ</strong> คุม over-concentration
            </p>
          )}
        </div>
      </section>

      <p className="text-[10px] text-muted-foreground text-center">
        เอกสารนี้สร้างจาก My Playbook Stock เมื่อ {new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}
      </p>
    </div>
  );
}

// ---- Main Page ----
export default function PlaybookPage() {
  const { user } = useAuth();
  const { activePlaybook, setActivePlaybook } = usePortfolioStore();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingPlaybook, setViewingPlaybook] = useState<Playbook | null>(null);

  useEffect(() => {
    if (!user) return;
    getPlaybooks(user.uid).then((data) => { setPlaybooks(data); setLoading(false); });
  }, [user]);

  async function handleSetActive(p: Playbook) {
    if (!user) return;
    await Promise.all([
      updatePlaybook(user.uid, p.id, { isActive: true }),
      ...playbooks.filter((x) => x.id !== p.id).map((x) => updatePlaybook(user.uid, x.id, { isActive: false })),
      updateUserProfile(user.uid, { activePlaybookId: p.id }),
    ]);
    setPlaybooks((prev) => prev.map((x) => ({ ...x, isActive: x.id === p.id })));
    setActivePlaybook({ ...p, isActive: true });
  }

  async function handleDelete(id: string) {
    if (!user) return;
    await deletePlaybook(user.uid, id);
    setPlaybooks((prev) => prev.filter((p) => p.id !== id));
    if (activePlaybook?.id === id) setActivePlaybook(null);
  }

  function handleDownload(p: Playbook) {
    const md = generatePlaybookMarkdown(p);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${p.name.replace(/\s+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return (
    <div className="flex justify-center h-64 items-center">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Playbooks</h1>
          <p className="text-sm text-muted-foreground">กฎการลงทุนของคุณ</p>
        </div>
        <Button render={<Link href="/playbook/new" />} nativeButton={false} className="gap-2">
          <PlusCircle className="w-4 h-4" />New Playbook
        </Button>
      </div>

      {playbooks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <BookMarked className="w-12 h-12 text-muted-foreground" />
          <p className="text-muted-foreground">ยังไม่มี Playbook</p>
          <Button render={<Link href="/playbook/new" />} nativeButton={false}>สร้าง Playbook แรก</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {playbooks.map((p) => (
            <Card key={p.id} className={p.isActive ? "border-primary border-2" : ""}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{p.name}</CardTitle>
                    {p.isActive && <Badge className="text-xs bg-primary text-primary-foreground">Active</Badge>}
                  </div>
                  {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setViewingPlaybook(p)}
                    title="ดูเอกสาร Playbook"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8" nativeButton={false} render={<Link href={`/playbook/${p.id}`} />}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {p.assets.map((a) => (
                    <Badge key={a.ticker} variant="outline" className="text-xs">{a.ticker} {a.targetPct}%</Badge>
                  ))}
                  <Badge variant="secondary" className="text-xs">
                    {p.cashReserve.type === "TICKER" ? p.cashReserve.ticker : p.cashReserve.cashLabel} (Reserve)
                  </Badge>
                </div>

                <div className="flex items-center justify-between pt-1 border-t">
                  <p className="text-xs text-muted-foreground">
                    {p.crisisRules.length} Crisis Levels · {p.trimRules.length} Trim Rules · Ref: {p.referenceIndex}
                  </p>
                  {p.isActive ? (
                    <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 gap-1">
                      <CheckCircle className="w-3 h-3" />ใช้งานอยู่
                    </Badge>
                  ) : (
                    <Button size="sm" variant="default" onClick={() => handleSetActive(p)} className="gap-1.5 h-7 text-xs">
                      <CheckCircle className="w-3 h-3" />เลือกใช้ Playbook นี้
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Document Dialog */}
      <Dialog open={!!viewingPlaybook} onOpenChange={(open) => { if (!open) setViewingPlaybook(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex flex-row items-start justify-between gap-4 pr-8">
            <DialogTitle className="text-lg">{viewingPlaybook?.name}</DialogTitle>
            {viewingPlaybook && (
              <Button
                variant="outline" size="sm"
                className="gap-2 shrink-0"
                onClick={() => handleDownload(viewingPlaybook)}
              >
                <Download className="w-3.5 h-3.5" />
                Download .md
              </Button>
            )}
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            {viewingPlaybook && <PlaybookDoc p={viewingPlaybook} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
