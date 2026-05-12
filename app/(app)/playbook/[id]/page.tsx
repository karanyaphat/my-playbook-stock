"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth-context";
import { usePortfolioStore } from "@/stores/portfolio.store";
import { getPlaybook, updatePlaybook } from "@/lib/firestore";
import { playbookFormSchema, type PlaybookFormValues } from "@/lib/playbook/validator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, ChevronRight, ChevronLeft, Info, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { Playbook } from "@/types";

const STEPS = ["ข้อมูลทั่วไป", "Assets", "Cash Reserve", "Crisis Rules", "Trim Rules", "Review"];
const REFERENCE_INDEXES = [
  { value: "^NDX", label: "Nasdaq-100 (^NDX)" },
  { value: "^GSPC", label: "S&P 500 (^GSPC)" },
  { value: "^DJI", label: "Dow Jones (^DJI)" },
  { value: "^SET.BK", label: "SET Index (^SET.BK)" },
];

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-4 py-3">
      <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
      <div className="text-sm text-blue-800 dark:text-blue-300 flex flex-col gap-1">{children}</div>
    </div>
  );
}

export default function EditPlaybookPage() {
  const { user } = useAuth();
  const { setActivePlaybook, activePlaybook } = usePortfolioStore();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const form = useForm<PlaybookFormValues>({
    resolver: zodResolver(playbookFormSchema),
    defaultValues: {
      name: "", description: "", referenceIndex: "^NDX",
      assets: [], cashReserve: { type: "TICKER", ticker: "", currency: "USD", floor: 5, max: 15 },
      crisisRules: [], trimRules: [],
    },
  });

  const { fields: assetFields, append: appendAsset, remove: removeAsset } = useFieldArray({ control: form.control, name: "assets" });
  const { fields: crisisFields, append: appendCrisis, remove: removeCrisis } = useFieldArray({ control: form.control, name: "crisisRules" });
  const { fields: trimFields, append: appendTrim, remove: removeTrim } = useFieldArray({ control: form.control, name: "trimRules" });

  const totalPct = form.watch("assets").reduce((s, a) => s + (Number(a.targetPct) || 0), 0);
  const cashType = form.watch("cashReserve.type");
  const watchedAssets = form.watch("assets");

  useEffect(() => {
    if (!user || !id) return;
    getPlaybook(user.uid, id).then((p) => {
      if (!p) { router.replace("/playbook"); return; }
      form.reset({
        name: p.name,
        description: p.description ?? "",
        referenceIndex: p.referenceIndex,
        assets: p.assets,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cashReserve: p.cashReserve as any,
        crisisRules: p.crisisRules,
        trimRules: p.trimRules,
      });
      setLoading(false);
    });
  }, [user, id, form, router]);

  async function onSubmit(values: PlaybookFormValues) {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    try {
      const clean = JSON.parse(JSON.stringify(values));
      await updatePlaybook(user.uid, id, clean);
      if (activePlaybook?.id === id) {
        setActivePlaybook({ ...activePlaybook, ...clean });
      }
      router.push("/playbook");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(`บันทึกไม่สำเร็จ: ${msg}`);
      setSaving(false);
    }
  }

  function onInvalid(errors: Record<string, unknown>) {
    const FIELD_STEP: [string, number][] = [
      ["name", 0], ["referenceIndex", 0], ["assets", 1],
      ["cashReserve", 2], ["crisisRules", 3], ["trimRules", 4],
    ];
    for (const [f, s] of FIELD_STEP) { if (f in errors) { setStep(s); break; } }
    setSaveError("กรุณาตรวจสอบข้อมูลให้ครบถ้วน");
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" nativeButton={false} render={<Link href="/playbook" />}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit Playbook</h1>
          <p className="text-sm text-muted-foreground">{form.watch("name")}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setStep(i)}
              className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors",
                i === step ? "bg-primary text-primary-foreground" :
                i < step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
              )}
            >
              <span>{i + 1}</span>
              <span className="hidden sm:inline">{s}</span>
            </button>
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="flex flex-col gap-6">

        {/* Step 0: Basic Info */}
        {step === 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>ชื่อ Playbook *</Label>
              <Input {...form.register("name")} placeholder="e.g. My Nasdaq Strategy" />
              {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reference Index</Label>
              <Select value={form.watch("referenceIndex")} onValueChange={(v) => { if (v) form.setValue("referenceIndex", v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REFERENCE_INDEXES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>คำอธิบาย (optional)</Label>
              <Input {...form.register("description")} placeholder="อธิบายกลยุทธ์ของคุณ" />
            </div>
          </div>
        )}

        {/* Step 1: Assets */}
        {step === 1 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">กำหนด Asset และสัดส่วนเป้าหมาย (รวม 100%)</p>
              <Badge variant={Math.abs(totalPct - 100) < 0.01 ? "default" : "destructive"}>รวม {totalPct.toFixed(1)}%</Badge>
            </div>
            <div className="flex flex-col gap-2">
              {assetFields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Ticker</Label>}
                    <Input {...form.register(`assets.${i}.ticker`)} placeholder="QQQM" />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Target %</Label>}
                    <Input type="number" step="0.1" {...form.register(`assets.${i}.targetPct`, { valueAsNumber: true })} placeholder="20" />
                  </div>
                  <div className="col-span-4 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Role</Label>}
                    <Input {...form.register(`assets.${i}.role`)} placeholder="Growth, Cashflow..." />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Currency</Label>}
                    <Select value={form.watch(`assets.${i}.currency`)} onValueChange={(v) => { if (v) form.setValue(`assets.${i}.currency`, v as "USD" | "THB"); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="THB">THB</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" className="w-8 h-8" onClick={() => removeAsset(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-2 w-fit"
              onClick={() => appendAsset({ ticker: "", targetPct: 0, role: "", currency: "USD", isCashReserve: false })}>
              <Plus className="w-4 h-4" />Add Asset
            </Button>
          </div>
        )}

        {/* Step 2: Cash Reserve */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <InfoBox>
              <p className="font-medium">Cash Reserve — "กระสุนสำรอง" สำหรับ Deploy ตอนตลาดตก</p>
              <ul className="list-disc ml-4">
                <li><strong>Floor %</strong> — ขั้นต่ำที่ต้องรักษาไว้ (ห้ามใช้)</li>
                <li><strong>Max %</strong> — เมื่อเต็ม ให้ Re-invest เข้า Asset หลักแทน</li>
              </ul>
            </InfoBox>
            <div className="flex gap-3">
              {(["TICKER", "CASH"] as const).map((t) => (
                <Button key={t} type="button" variant={cashType === t ? "default" : "outline"} size="sm"
                  onClick={() => form.setValue("cashReserve.type", t)}>
                  {t === "TICKER" ? "ETF / กองทุนตลาดเงิน" : "เงินสด (บัญชีโบรกเกอร์/ธนาคาร)"}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {cashType === "TICKER" ? (
                <>
                  <div className="flex flex-col gap-1.5"><Label>Ticker</Label><Input {...form.register("cashReserve.ticker")} placeholder="SGOV" /></div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Currency</Label>
                    <Select value={form.watch("cashReserve.currency") ?? "USD"} onValueChange={(v) => { if (v) form.setValue("cashReserve.currency", v as "USD" | "THB"); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="THB">THB</SelectItem></SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5"><Label>ชื่อบัญชี</Label><Input {...form.register("cashReserve.cashLabel")} placeholder="Brokerage Cash" /></div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Currency</Label>
                    <Select value={form.watch("cashReserve.cashCurrency") ?? "THB"} onValueChange={(v) => { if (v) form.setValue("cashReserve.cashCurrency", v as "USD" | "THB"); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="THB">THB</SelectItem></SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="flex flex-col gap-1.5"><Label>Floor %</Label><Input type="number" {...form.register("cashReserve.floor", { valueAsNumber: true })} /></div>
              <div className="flex flex-col gap-1.5"><Label>Max %</Label><Input type="number" {...form.register("cashReserve.max", { valueAsNumber: true })} /></div>
            </div>
          </div>
        )}

        {/* Step 3: Crisis Rules */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <InfoBox>
              <p className="font-medium">Crisis Rules — ซื้อตอนถูก อย่างมีวินัย</p>
              <p>เมื่อ Reference Index ลงถึงระดับที่กำหนด ให้ Deploy Cash ตามแผน โดยกำหนดเองว่าจะซื้อ Asset ไหน เท่าไหร่</p>
            </InfoBox>
            <div className="flex flex-col gap-4">
              {crisisFields.map((field, i) => {
                const allocFields = form.watch(`crisisRules.${i}.allocations`) ?? [];
                const allocTotal = allocFields.reduce((s: number, a: { pct: number }) => s + (Number(a.pct) || 0), 0);
                return (
                  <Card key={field.id}>
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm">Level {form.watch(`crisisRules.${i}.level`)}</CardTitle>
                      <Button type="button" variant="ghost" size="icon" className="w-7 h-7" onClick={() => removeCrisis(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-4">
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1"><Label className="text-xs">Level</Label><Input type="number" {...form.register(`crisisRules.${i}.level`, { valueAsNumber: true })} /></div>
                        <div className="flex flex-col gap-1"><Label className="text-xs">Drawdown %</Label><Input type="number" {...form.register(`crisisRules.${i}.drawdownPct`, { valueAsNumber: true })} /></div>
                        <div className="flex flex-col gap-1"><Label className="text-xs">Deploy %</Label><Input type="number" {...form.register(`crisisRules.${i}.deployCashPct`, { valueAsNumber: true })} /></div>
                      </div>
                      <div className="flex flex-col gap-1"><Label className="text-xs">คำอธิบาย</Label><Input {...form.register(`crisisRules.${i}.description`)} /></div>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">ซื้อ Asset ไหน</Label>
                          <Badge variant={Math.abs(allocTotal - 100) < 0.01 ? "default" : "destructive"} className="text-xs">รวม {allocTotal.toFixed(0)}%</Badge>
                        </div>
                        <AllocFields control={form.control} crisisIndex={i} assetTickers={watchedAssets.map((a) => a.ticker).filter(Boolean)} form={form} />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <Button type="button" variant="outline" size="sm" className="gap-2 w-fit"
              onClick={() => appendCrisis({ level: crisisFields.length + 1, drawdownPct: 10, deployCashPct: 10, allocations: [{ ticker: "", pct: 100 }], description: "" })}>
              <Plus className="w-4 h-4" />Add Level
            </Button>
          </div>
        )}

        {/* Step 4: Trim Rules */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <InfoBox>
              <p className="font-medium">Trim Rules — Lock กำไรอัตโนมัติ</p>
              <p>Asset ที่ไม่มี Trim Rule = <strong>ไม่ถูก Trim ไม่ว่าจะโตแค่ไหน</strong></p>
            </InfoBox>
            <div className="flex flex-col gap-2">
              {trimFields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Asset</Label>}
                    <Select value={form.watch(`trimRules.${i}.ticker`)} onValueChange={(v) => { if (v) form.setValue(`trimRules.${i}.ticker`, v); }}>
                      <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                      <SelectContent>{watchedAssets.filter((a) => a.ticker).map((a) => <SelectItem key={a.ticker} value={a.ticker}>{a.ticker}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Trim เมื่อถึง %</Label>}
                    <Input type="number" {...form.register(`trimRules.${i}.triggerPct`, { valueAsNumber: true })} placeholder="35" />
                  </div>
                  <div className="col-span-3 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Trim ออก % ของพอร์ต</Label>}
                    <Input type="number" step="0.1" {...form.register(`trimRules.${i}.trimActionPct`, { valueAsNumber: true })} placeholder="5" />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">เอาไปไหน</Label>}
                    <Select value={form.watch(`trimRules.${i}.redirectTo`)} onValueChange={(v) => { if (v) form.setValue(`trimRules.${i}.redirectTo`, v); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH_RESERVE">Cash Reserve</SelectItem>
                        <SelectItem value="LOWEST_ASSET">Asset ที่น้อยที่สุด</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <Button type="button" variant="ghost" size="icon" className="w-8 h-8" onClick={() => removeTrim(i)}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              ))}
            </div>
            {watchedAssets.length > 0 && (
              <div className="text-xs text-muted-foreground border-t pt-3">
                <p className="font-medium mb-1">ไม่มี Trim Rule:</p>
                <div className="flex flex-wrap gap-1.5">
                  {watchedAssets.filter((a) => a.ticker && !form.watch("trimRules").some((r) => r.ticker === a.ticker)).map((a) => (
                    <Badge key={a.ticker} variant="outline" className="text-xs">{a.ticker}</Badge>
                  ))}
                </div>
              </div>
            )}
            <Button type="button" variant="outline" size="sm" className="gap-2 w-fit"
              onClick={() => appendTrim({ ticker: "", triggerPct: 35, trimActionPct: 5, redirectTo: "CASH_RESERVE" })}>
              <Plus className="w-4 h-4" />Add Trim Rule
            </Button>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">สรุป Playbook</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div><span className="text-muted-foreground">ชื่อ:</span> <strong>{form.watch("name")}</strong></div>
              <div><span className="text-muted-foreground">Reference Index:</span> {form.watch("referenceIndex")}</div>
              <div>
                <p className="text-muted-foreground mb-1">Assets:</p>
                <div className="flex flex-wrap gap-1.5">{form.watch("assets").map((a) => <Badge key={a.ticker} variant="outline">{a.ticker} {a.targetPct}%</Badge>)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Cash Reserve: </span>
                {form.watch("cashReserve.type") === "TICKER"
                  ? `${form.watch("cashReserve.ticker")} (${form.watch("cashReserve.floor")}–${form.watch("cashReserve.max")}%)`
                  : `${form.watch("cashReserve.cashLabel")} (${form.watch("cashReserve.floor")}–${form.watch("cashReserve.max")}%)`}
              </div>
              <div><span className="text-muted-foreground">Crisis Levels:</span> {form.watch("crisisRules").length}</div>
              <div><span className="text-muted-foreground">Trim Rules:</span> {form.watch("trimRules").length}</div>
            </CardContent>
          </Card>
        )}

        {saveError && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            ⚠️ {saveError}
          </div>
        )}

        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => { setStep((s) => s - 1); setSaveError(null); }} disabled={step === 0} className="gap-2">
            <ChevronLeft className="w-4 h-4" />Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => { setStep((s) => s + 1); setSaveError(null); }} className="gap-2">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "บันทึกการแก้ไข"}</Button>
          )}
        </div>
      </form>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AllocFields({ control, crisisIndex, assetTickers, form }: { control: any; crisisIndex: number; assetTickers: string[]; form: any }) {
  const { fields, append, remove } = useFieldArray({ control, name: `crisisRules.${crisisIndex}.allocations` });
  return (
    <div className="flex flex-col gap-2">
      {fields.map((f, j) => (
        <div key={f.id} className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-5">
            <Select value={form.watch(`crisisRules.${crisisIndex}.allocations.${j}.ticker`)} onValueChange={(v: string) => { if (v) form.setValue(`crisisRules.${crisisIndex}.allocations.${j}.ticker`, v); }}>
              <SelectTrigger><SelectValue placeholder="เลือก Asset" /></SelectTrigger>
              <SelectContent>{assetTickers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="col-span-5">
            <div className="flex items-center gap-1">
              <Input type="number" min="0" max="100" placeholder="50"
                {...form.register(`crisisRules.${crisisIndex}.allocations.${j}.pct`, { valueAsNumber: true })} />
              <span className="text-sm text-muted-foreground shrink-0">%</span>
            </div>
          </div>
          <div className="col-span-2 flex justify-end">
            <Button type="button" variant="ghost" size="icon" className="w-7 h-7" onClick={() => remove(j)}><Trash2 className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 w-fit text-xs h-7"
        onClick={() => append({ ticker: "", pct: 0 })}><Plus className="w-3 h-3" />Add Asset</Button>
    </div>
  );
}
