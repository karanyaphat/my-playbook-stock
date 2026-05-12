"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Timestamp } from "firebase/firestore";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/lib/auth-context";
import { usePortfolioStore } from "@/stores/portfolio.store";
import { createPlaybook, updateUserProfile, getPlaybooks, updatePlaybook } from "@/lib/firestore";
import { playbookFormSchema, type PlaybookFormValues } from "@/lib/playbook/validator";
import { PLAYBOOK_TEMPLATES } from "@/lib/playbook/templates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, ChevronRight, ChevronLeft, BookOpen, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["เลือก Template", "Assets", "Cash Reserve", "Crisis Rules", "Trim Rules", "Review"];
const REFERENCE_INDEXES = [
  { value: "^NDX", label: "Nasdaq-100 (^NDX)" },
  { value: "^GSPC", label: "S&P 500 (^GSPC)" },
  { value: "^DJI", label: "Dow Jones (^DJI)" },
  { value: "^SET.BK", label: "SET Index (^SET.BK)" },
];
const DIFFICULTY_COLOR: Record<string, string> = {
  BEGINNER: "bg-green-100 text-green-700",
  INTERMEDIATE: "bg-yellow-100 text-yellow-700",
  ADVANCED: "bg-red-100 text-red-700",
};

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 px-4 py-3">
      <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
      <div className="text-sm text-blue-800 dark:text-blue-300 flex flex-col gap-1">{children}</div>
    </div>
  );
}

// Map field path prefix → step index
const FIELD_STEP_MAP: [string, number][] = [
  ["name", 0], ["referenceIndex", 0],
  ["assets", 1],
  ["cashReserve", 2],
  ["crisisRules", 3],
  ["trimRules", 4],
];

function firstErrorStep(errors: Record<string, unknown>): number {
  for (const [field, stepIdx] of FIELD_STEP_MAP) {
    if (field in errors) return stepIdx;
  }
  return 5;
}

export default function NewPlaybookPage() {
  const { user } = useAuth();
  const { setActivePlaybook } = usePortfolioStore();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const form = useForm<PlaybookFormValues>({
    resolver: zodResolver(playbookFormSchema),
    defaultValues: {
      name: "",
      description: "",
      referenceIndex: "^NDX",
      assets: [],
      cashReserve: { type: "TICKER", ticker: "SGOV", currency: "USD", floor: 5, max: 15 },
      crisisRules: [],
      trimRules: [],
    },
  });

  const { fields: assetFields, append: appendAsset, remove: removeAsset } = useFieldArray({ control: form.control, name: "assets" });
  const { fields: crisisFields, append: appendCrisis, remove: removeCrisis } = useFieldArray({ control: form.control, name: "crisisRules" });
  const { fields: trimFields, append: appendTrim, remove: removeTrim } = useFieldArray({ control: form.control, name: "trimRules" });

  const totalPct = form.watch("assets").reduce((s, a) => s + (Number(a.targetPct) || 0), 0);
  const cashType = form.watch("cashReserve.type");
  const watchedAssets = form.watch("assets");

  function applyTemplate(id: string) {
    const t = PLAYBOOK_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    form.reset({
      name: t.name,
      description: t.description,
      referenceIndex: t.referenceIndex,
      assets: t.assets,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cashReserve: t.cashReserve as any,
      crisisRules: t.crisisRules,
      trimRules: t.trimRules,
    });
    setSaveError(null);
    setSelectedTemplate(id);
  }

  async function onSubmit(values: PlaybookFormValues) {
    if (!user) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Deactivate playbooks เดิมก่อน
      const existing = await getPlaybooks(user.uid);
      await Promise.all(existing.filter((p) => p.isActive).map((p) => updatePlaybook(user.uid, p.id, { isActive: false })));

      // Firestore ไม่รับ undefined — strip ออกก่อน
      const clean = JSON.parse(JSON.stringify({ ...values, isActive: true, currency: "MIXED" }));
      const id = await createPlaybook(user.uid, clean);
      await updateUserProfile(user.uid, { activePlaybookId: id });
      setActivePlaybook({ id, ...clean, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
      router.push("/playbook");
    } catch (err) {
      console.error("createPlaybook error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(`บันทึกไม่สำเร็จ: ${msg}`);
      setSaving(false);
    }
  }

  function onInvalid(errors: Record<string, unknown>) {
    const errStep = firstErrorStep(errors);
    setStep(errStep);

    // Build human-readable error list
    const msgs: string[] = [];
    if (errors.name) msgs.push("กรุณาตั้งชื่อ Playbook");
    if (errors.assets) msgs.push("Assets: สัดส่วนรวมต้องเท่ากับ 100% และทุก Asset ต้องมี Ticker และ Role");
    if (errors.cashReserve) msgs.push("Cash Reserve: กรุณากรอกข้อมูลให้ครบ");
    if (errors.crisisRules) msgs.push("Crisis Rules: ตรวจสอบ Allocation ของแต่ละ Level ว่ารวม 100%");
    if (errors.trimRules) msgs.push("Trim Rules: กรุณาเลือก Asset และกรอกค่าให้ครบ");
    setSaveError(msgs.join(" · ") || "กรุณาตรวจสอบข้อมูลให้ครบถ้วน");
  }

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">New Playbook</h1>
        <p className="text-sm text-muted-foreground">สร้างกฎการลงทุนของคุณ</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-1">
            <div className={cn("flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-colors",
              i === step ? "bg-primary text-primary-foreground" :
              i < step ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            )}>
              <span>{i + 1}</span>
              <span className="hidden sm:inline">{s}</span>
            </div>
            {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="flex flex-col gap-6">

        {/* ───── Step 0: Template ───── */}
        {step === 0 && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLAYBOOK_TEMPLATES.map((t) => (
                <Card key={t.id}
                  className={cn("cursor-pointer transition-all hover:border-primary", selectedTemplate === t.id ? "border-primary border-2" : "")}
                  onClick={() => applyTemplate(t.id)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-sm">{t.name}</CardTitle>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0", DIFFICULTY_COLOR[t.difficulty] ?? "")}>{t.difficulty}</span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-2">{t.description}</p>
                    <div className="flex flex-wrap gap-1">{t.tags.map((tag) => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}</div>
                  </CardContent>
                </Card>
              ))}
              <Card className={cn("cursor-pointer transition-all hover:border-primary border-dashed", !selectedTemplate ? "border-primary border-2" : "")}
                onClick={() => { form.reset({ name: "", description: "", referenceIndex: "^NDX", assets: [], cashReserve: { type: "TICKER", ticker: "", currency: "USD", floor: 5, max: 15 }, crisisRules: [], trimRules: [] }); setSelectedTemplate(null); }}>
                <CardContent className="flex flex-col items-center justify-center h-full py-8 gap-2">
                  <BookOpen className="w-8 h-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Custom</p>
                  <p className="text-xs text-muted-foreground text-center">สร้างจากศูนย์ด้วยตัวเอง</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-2">
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
          </div>
        )}

        {/* ───── Step 1: Assets ───── */}
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
                    <Input type="number" step="0.1" min="0" max="100" {...form.register(`assets.${i}.targetPct`, { valueAsNumber: true })} placeholder="20" />
                  </div>
                  <div className="col-span-4 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Role / บทบาท</Label>}
                    <Input {...form.register(`assets.${i}.role`)} placeholder="Growth, Cashflow, Hedge..." />
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
            {form.formState.errors.assets?.root && <p className="text-xs text-destructive">{form.formState.errors.assets.root.message}</p>}
          </div>
        )}

        {/* ───── Step 2: Cash Reserve ───── */}
        {step === 2 && (
          <div className="flex flex-col gap-4">
            <InfoBox>
              <p className="font-medium">Cash Reserve คืออะไร และทำไมถึงสำคัญ?</p>
              <p>Cash Reserve คือ "กระสุนสำรอง" ที่เก็บไว้นอกพอร์ตหลัก เมื่อตลาดเกิดวิกฤตและ Asset ราคาถูก เราสามารถ Deploy เงินส่วนนี้เข้าซื้อได้ทันที โดยไม่ต้องขาย Asset หลักออก</p>
              <ul className="list-disc ml-4 flex flex-col gap-0.5">
                <li><strong>Floor %</strong> — ขั้นต่ำที่ต้องรักษาไว้เสมอ (ห้ามใช้ ยกเว้นวิกฤตระดับสูงสุด)</li>
                <li><strong>Max %</strong> — เมื่อ Cash Reserve เต็ม ให้นำปันผลหรือเงินใหม่ Re-invest เข้า Asset หลักแทน</li>
                <li>ช่วยควบคุมอารมณ์ — มีแผนชัดเจนว่าจะ "ยิง" เงินตอนไหน ไม่ตัดสินใจตอนตื่นตระหนก</li>
              </ul>
            </InfoBox>

            <div className="flex gap-3">
              {(["TICKER", "CASH"] as const).map((t) => (
                <Button key={t} type="button" variant={cashType === t ? "default" : "outline"} size="sm"
                  onClick={() => {
                    if (t === "TICKER") {
                      form.setValue("cashReserve", { type: "TICKER", ticker: "", currency: "USD", floor: form.getValues("cashReserve.floor") ?? 5, max: form.getValues("cashReserve.max") ?? 15 });
                    } else {
                      form.setValue("cashReserve", { type: "CASH", cashLabel: "", cashCurrency: "THB", floor: form.getValues("cashReserve.floor") ?? 5, max: form.getValues("cashReserve.max") ?? 15 });
                    }
                  }}>
                  {t === "TICKER" ? "ETF / กองทุนตลาดเงิน" : "เงินสด (บัญชีโบรกเกอร์/ธนาคาร)"}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              {cashType === "TICKER" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Ticker <span className="text-muted-foreground text-xs">(เช่น SGOV, VMFXX, กองตลาดเงินไทย)</span></Label>
                    <Input {...form.register("cashReserve.ticker")} placeholder="SGOV" />
                  </div>
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
                  <div className="flex flex-col gap-1.5">
                    <Label>ชื่อบัญชี <span className="text-muted-foreground text-xs">(ไม่บังคับ)</span></Label>
                    <Input {...form.register("cashReserve.cashLabel")} placeholder="Brokerage Cash / บัญชีออมทรัพย์ SCB" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label>Currency</Label>
                    <Select value={form.watch("cashReserve.cashCurrency") ?? "THB"} onValueChange={(v) => { if (v) form.setValue("cashReserve.cashCurrency", v as "USD" | "THB"); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="THB">THB</SelectItem></SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>Floor % <span className="text-muted-foreground text-xs">(ขั้นต่ำ — ห้ามใช้)</span></Label>
                <Input type="number" min="0" max="50" {...form.register("cashReserve.floor", { valueAsNumber: true })} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Max % <span className="text-muted-foreground text-xs">(เมื่อเต็ม → Re-invest)</span></Label>
                <Input type="number" min="0" max="50" {...form.register("cashReserve.max", { valueAsNumber: true })} />
              </div>
            </div>
          </div>
        )}

        {/* ───── Step 3: Crisis Rules ───── */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <InfoBox>
              <p className="font-medium">หลักการของ Crisis Rules</p>
              <p>เมื่อ Reference Index ปรับตัวลงถึงระดับที่กำหนด ระบบจะแจ้งเตือนให้ Deploy Cash Reserve เข้าซื้อ Asset ตามแผน — ทำให้เราซื้อได้ตอนราคาถูก อย่างมีวินัย ไม่ใช้อารมณ์</p>
              <ul className="list-disc ml-4 flex flex-col gap-0.5">
                <li><strong>Drawdown %</strong> — ตลาดลงจาก ATH เท่าไหร่ถึงจะ Trigger Level นี้</li>
                <li><strong>Deploy %</strong> — ใช้ Cash Reserve กี่ % ของที่เหลืออยู่เหนือ Floor ในรอบนี้</li>
                <li><strong>ซื้อ Asset ไหน</strong> — กำหนดเองได้ว่าจะกระจายเงินไปยัง Asset ใด เท่าไหร่ (รวม 100%)</li>
                <li>ยิ่ง Level สูง ยิ่ง Aggressive — เพราะโอกาสยิ่งหายาก</li>
              </ul>
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
                      {/* Level config */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Level</Label>
                          <Input type="number" {...form.register(`crisisRules.${i}.level`, { valueAsNumber: true })} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Drawdown จาก ATH (%)</Label>
                          <Input type="number" {...form.register(`crisisRules.${i}.drawdownPct`, { valueAsNumber: true })} placeholder="10" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label className="text-xs">Deploy Cash Reserve (%)</Label>
                          <Input type="number" {...form.register(`crisisRules.${i}.deployCashPct`, { valueAsNumber: true })} placeholder="10" />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-xs">คำอธิบาย / Action</Label>
                        <Input {...form.register(`crisisRules.${i}.description`)} placeholder="เช่น เริ่มสะสมเชิงรับ" />
                      </div>

                      {/* Asset allocations */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">ซื้อ Asset ไหน เท่าไหร่</Label>
                          <Badge variant={Math.abs(allocTotal - 100) < 0.01 ? "default" : "destructive"} className="text-xs">รวม {allocTotal.toFixed(0)}%</Badge>
                        </div>
                        <AllocFields
                          control={form.control}
                          crisisIndex={i}
                          assetTickers={watchedAssets.map((a) => a.ticker).filter(Boolean)}
                          form={form}
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Button type="button" variant="outline" size="sm" className="gap-2 w-fit"
              onClick={() => appendCrisis({ level: crisisFields.length + 1, drawdownPct: 10, deployCashPct: 10, allocations: [{ ticker: "", pct: 100 }], description: "" })}>
              <Plus className="w-4 h-4" />Add Crisis Level
            </Button>
          </div>
        )}

        {/* ───── Step 4: Trim Rules ───── */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <InfoBox>
              <p className="font-medium">Trim Rules คืออะไร?</p>
              <p>Trim Rule คือกฎที่กำหนดว่าเมื่อ Asset ใดมีสัดส่วนเกิน % ที่กำหนด ให้ทำการ "ตัด" ออกบางส่วน เพื่อนำเงินกลับเข้า Cash Reserve หรือ Asset ที่ขาดสัดส่วน</p>
              <ul className="list-disc ml-4 flex flex-col gap-0.5">
                <li><strong>Trim เมื่อถึง %</strong> — สัดส่วน Asset นั้นในพอร์ตเกินเท่าไหร่จึงจะ Trigger</li>
                <li><strong>Trim ออก %</strong> — ขายออกกี่ % ของมูลค่าพอร์ตรวม</li>
                <li>Asset ที่ไม่มี Trim Rule = <strong>ไม่ถูก Trim ไม่ว่าจะโตแค่ไหน</strong></li>
                <li>เป็นการ "Lock กำไร" อัตโนมัติโดยไม่ต้องเดาจุด Top</li>
              </ul>
            </InfoBox>

            <div className="flex flex-col gap-2">
              {trimFields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-3 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Asset</Label>}
                    <Select value={form.watch(`trimRules.${i}.ticker`)} onValueChange={(v) => { if (v) form.setValue(`trimRules.${i}.ticker`, v); }}>
                      <SelectTrigger><SelectValue placeholder="เลือก" /></SelectTrigger>
                      <SelectContent>
                        {watchedAssets.filter((a) => a.ticker).map((a) => (
                          <SelectItem key={a.ticker} value={a.ticker}>{a.ticker}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Trim เมื่อสัดส่วนถึง %</Label>}
                    <Input type="number" {...form.register(`trimRules.${i}.triggerPct`, { valueAsNumber: true })} placeholder="35" />
                  </div>
                  <div className="col-span-3 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">Trim ออก % ของพอร์ต</Label>}
                    <Input type="number" step="0.1" {...form.register(`trimRules.${i}.trimActionPct`, { valueAsNumber: true })} placeholder="5" />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1">
                    {i === 0 && <Label className="text-xs">เอาเงินไปไหน</Label>}
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
              <div className="text-xs text-muted-foreground border-t pt-3 flex flex-col gap-1">
                <p className="font-medium">Asset ที่ไม่ถูก Trim (ไม่มี Trim Rule):</p>
                <div className="flex flex-wrap gap-1.5">
                  {watchedAssets.filter((a) => a.ticker && !form.watch("trimRules").some((r) => r.ticker === a.ticker)).map((a) => (
                    <Badge key={a.ticker} variant="outline" className="text-xs">{a.ticker} — ไม่มี Trim</Badge>
                  ))}
                  {watchedAssets.every((a) => form.watch("trimRules").some((r) => r.ticker === a.ticker)) && (
                    <span>ทุก Asset มี Trim Rule แล้ว</span>
                  )}
                </div>
              </div>
            )}

            <Button type="button" variant="outline" size="sm" className="gap-2 w-fit"
              onClick={() => appendTrim({ ticker: "", triggerPct: 35, trimActionPct: 5, redirectTo: "CASH_RESERVE" })}>
              <Plus className="w-4 h-4" />Add Trim Rule
            </Button>
          </div>
        )}

        {/* ───── Step 5: Review ───── */}
        {step === 5 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">สรุป Playbook</CardTitle></CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div><span className="text-muted-foreground">ชื่อ:</span> <strong>{form.watch("name")}</strong></div>
              <div><span className="text-muted-foreground">Reference Index:</span> {form.watch("referenceIndex")}</div>
              <div>
                <p className="text-muted-foreground mb-1">Assets ({form.watch("assets").length}):</p>
                <div className="flex flex-wrap gap-1.5">{form.watch("assets").map((a) => <Badge key={a.ticker} variant="outline">{a.ticker} {a.targetPct}%</Badge>)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Cash Reserve: </span>
                {form.watch("cashReserve.type") === "TICKER"
                  ? `${form.watch("cashReserve.ticker")} (${form.watch("cashReserve.floor")}–${form.watch("cashReserve.max")}%)`
                  : `เงินสด${form.watch("cashReserve.cashLabel") ? ` — ${form.watch("cashReserve.cashLabel")}` : ""} (${form.watch("cashReserve.floor")}–${form.watch("cashReserve.max")}%)`}
              </div>
              <div><span className="text-muted-foreground">Crisis Levels:</span> {form.watch("crisisRules").length} levels</div>
              <div>
                <span className="text-muted-foreground">Trim Rules:</span> {form.watch("trimRules").length} rules
                {form.watch("assets").filter((a) => a.ticker && !form.watch("trimRules").some((r) => r.ticker === a.ticker)).length > 0 && (
                  <span className="ml-2 text-muted-foreground text-xs">
                    (ไม่มี Trim: {form.watch("assets").filter((a) => a.ticker && !form.watch("trimRules").some((r) => r.ticker === a.ticker)).map((a) => a.ticker).join(", ")})
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Error banner */}
        {saveError && (
          <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            ⚠️ {saveError}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between">
          <Button type="button" variant="outline" onClick={() => { setStep((s) => s - 1); setSaveError(null); }} disabled={step === 0} className="gap-2">
            <ChevronLeft className="w-4 h-4" />Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => { setStep((s) => s + 1); setSaveError(null); }} className="gap-2">
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Playbook"}</Button>
          )}
        </div>
      </form>
    </div>
  );
}

// Sub-component สำหรับ allocation fields ใน Crisis Rules
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AllocFields({ control, crisisIndex, assetTickers, form }: { control: any; crisisIndex: number; assetTickers: string[]; form: any }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name: `crisisRules.${crisisIndex}.allocations`,
  });

  return (
    <div className="flex flex-col gap-2">
      {fields.map((f, j) => (
        <div key={f.id} className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-5">
            <Select
              value={form.watch(`crisisRules.${crisisIndex}.allocations.${j}.ticker`)}
              onValueChange={(v) => { if (v) form.setValue(`crisisRules.${crisisIndex}.allocations.${j}.ticker`, v); }}
            >
              <SelectTrigger><SelectValue placeholder="เลือก Asset" /></SelectTrigger>
              <SelectContent>
                {assetTickers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-5">
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="50"
                {...form.register(`crisisRules.${crisisIndex}.allocations.${j}.pct`, { valueAsNumber: true })}
              />
              <span className="text-sm text-muted-foreground shrink-0">%</span>
            </div>
          </div>
          <div className="col-span-2 flex justify-end">
            <Button type="button" variant="ghost" size="icon" className="w-7 h-7" onClick={() => remove(j)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="gap-1.5 w-fit text-xs h-7"
        onClick={() => append({ ticker: "", pct: 0 })}>
        <Plus className="w-3 h-3" />Add Asset
      </Button>
    </div>
  );
}
