import { z } from "zod";

export const playbookAssetSchema = z.object({
  ticker: z.string().min(1, "กรุณาระบุ Ticker"),
  name: z.string().optional(),
  targetPct: z.number().min(0.1, "ต้องมากกว่า 0").max(100),
  role: z.string().min(1, "กรุณาระบุ Role"),
  currency: z.enum(["USD", "THB"]),
  isCashReserve: z.boolean(),
  trimThreshold: z.number().optional(),
  notes: z.string().optional(),
});

export const cashReserveSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("TICKER"),
    ticker: z.string().min(1, "กรุณาระบุ Ticker"),
    currency: z.enum(["USD", "THB"]),
    cashLabel: z.string().optional(),
    cashCurrency: z.enum(["USD", "THB"]).optional(),
    floor: z.number().min(0).max(50),
    max: z.number().min(0).max(50),
  }),
  z.object({
    type: z.literal("CASH"),
    ticker: z.string().optional(),
    currency: z.enum(["USD", "THB"]).optional(),
    cashLabel: z.string().optional(),
    cashCurrency: z.enum(["USD", "THB"]).optional(),
    floor: z.number().min(0).max(50),
    max: z.number().min(0).max(50),
  }),
]);

export const crisisAllocationSchema = z.object({
  ticker: z.string().min(1, "กรุณาระบุ Ticker"),
  pct: z.number().min(0.1).max(100),
});

export const crisisRuleSchema = z.object({
  level: z.number().int().min(1).max(10),
  drawdownPct: z.number().min(1).max(90),
  deployCashPct: z.number().min(1).max(100),
  allocations: z.array(crisisAllocationSchema).min(1, "ต้องมีอย่างน้อย 1 Asset").refine(
    (allocs) => Math.abs(allocs.reduce((s, a) => s + a.pct, 0) - 100) < 0.01,
    { message: "รวมต้องเท่ากับ 100%" }
  ),
  description: z.string().min(1),
});

export const trimRuleSchema = z.object({
  ticker: z.string().min(1),
  triggerPct: z.number().min(1).max(100),
  trimActionPct: z.number().min(0.1).max(50),
  redirectTo: z.string().min(1),
});

export const playbookFormSchema = z.object({
  name: z.string().min(1, "กรุณาตั้งชื่อ Playbook"),
  description: z.string().optional(),
  referenceIndex: z.string().min(1, "กรุณาเลือก Reference Index"),
  assets: z
    .array(playbookAssetSchema)
    .min(1, "ต้องมีอย่างน้อย 1 Asset")
    .refine(
      (assets) => {
        const total = assets.reduce((s, a) => s + a.targetPct, 0);
        return Math.abs(total - 100) < 0.01;
      },
      { message: "สัดส่วนรวมต้องเท่ากับ 100% พอดี" }
    ),
  cashReserve: cashReserveSchema,
  crisisRules: z.array(crisisRuleSchema),
  trimRules: z.array(trimRuleSchema),
});

export type PlaybookFormValues = z.infer<typeof playbookFormSchema>;
