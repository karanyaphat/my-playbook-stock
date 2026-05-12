import { Timestamp } from "firebase/firestore";

// ---- Enums ----

export type Currency = "USD" | "THB";
export type TransactionType = "BUY" | "SELL" | "DIVIDEND" | "TRANSFER_IN" | "TRANSFER_OUT";
export type AlertSeverity = "CRITICAL" | "WARNING" | "INFO";
export type CashReserveType = "TICKER" | "CASH";

export type AlertType =
  | "TRIM_SIGNAL"
  | "CRISIS_LEVEL"
  | "SGOV_LOW"
  | "SGOV_FULL"
  | "REBALANCE_NEEDED"
  | "FAILURE_PROTOCOL"
  | "DCA_REMINDER"
  | "CUSTOM";

// ---- Playbook ----

export interface PlaybookAsset {
  ticker: string;
  name?: string;
  targetPct: number;
  role: string;
  currency: Currency;
  isCashReserve: boolean;
  trimThreshold?: number;
  notes?: string;
}

export interface CashReserve {
  type: CashReserveType;
  ticker?: string;
  currency?: Currency;
  cashLabel?: string;
  cashCurrency?: Currency;
  floor: number;
  max: number;
}

export interface CrisisAllocation {
  ticker: string;
  pct: number;  // % ของเงินที่ deploy ในรอบนี้
}

export interface CrisisRule {
  level: number;
  drawdownPct: number;
  deployCashPct: number;
  allocations: CrisisAllocation[];  // ซื้อ asset ไหน เท่าไหร่
  description: string;
}

export interface TrimRule {
  ticker: string;
  triggerPct: number;
  trimActionPct: number;
  redirectTo: "CASH_RESERVE" | "LOWEST_ASSET" | string;
}

export interface FailureProtocol {
  benchmarkTicker: string;
  underperformPct: number;
  durationYears: number;
  action: "SWITCH_PLAYBOOK" | "REDUCE_WEIGHT";
  fallbackPlaybookId?: string;
}

export interface Playbook {
  id: string;
  name: string;
  description?: string;
  templateId?: string;
  isActive: boolean;
  currency: Currency | "MIXED";
  assets: PlaybookAsset[];
  cashReserve: CashReserve;
  crisisRules: CrisisRule[];
  trimRules: TrimRule[];
  referenceIndex: string;
  failureProtocol?: FailureProtocol;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---- Portfolio ----

export interface Portfolio {
  id: string;
  name: string;
  playbookId: string;
  baseCurrency: Currency;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Holding {
  ticker: string;
  shares: number;
  avgCost: number;
  currency: Currency;
  firstBuyDate?: Timestamp;
  updatedAt: Timestamp;
}

export interface Transaction {
  id?: string;
  ticker: string;
  type: TransactionType;
  shares: number;
  price: number;
  currency: Currency;
  total: number;
  fxRate?: number;
  totalTHB?: number;
  note?: string;
  date: Timestamp;
  createdAt: Timestamp;
}

// ---- Snapshot ----

export interface Snapshot {
  date: Timestamp;
  totalUSD: number;
  totalTHB: number;
  usdThbRate: number;
  indexValue?: number;
  holdings: Record<string, {
    shares: number;
    price: number;
    valueUSD: number;
    allocationPct: number;
  }>;
}

// ---- Alerts ----

export interface Alert {
  id?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  ticker?: string;
  isRead: boolean;
  isDismissed: boolean;
  triggeredAt: Timestamp;
  expiresAt?: Timestamp;
  metadata?: Record<string, unknown>;
}

// ---- Settings ----

export interface MonitorSettings {
  referenceIndexATH: Record<string, number>;
  enableDCAReminder: boolean;
  dcaReminderDay: number;
  enableCrisisAlert: boolean;
  updatedAt: Timestamp;
}

export interface ProjectionSettings {
  monthlyDCA: number;
  annualBonus: number;
  targetMonthlyIncome: number;
  dividendYieldPct: number;
  currentAge: number;
  retirementAge: number;
  customCAGR?: Record<string, number>;
  updatedAt: Timestamp;
}

// ---- Template ----

export interface PlaybookTemplate {
  id: string;
  name: string;
  description: string;
  strategy: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  assets: PlaybookAsset[];
  cashReserve: CashReserve;
  crisisRules: CrisisRule[];
  trimRules: TrimRule[];
  referenceIndex: string;
  tags: string[];
}

// ---- Computed (client-side) ----

export interface HoldingWithValue extends Holding {
  currentPrice: number;
  currentValueUSD: number;
  currentValueTHB: number;
  costBasisUSD: number;
  pnlUSD: number;
  pnlPct: number;
  allocationPct: number;
  targetPct: number;
  diffPct: number;
  trimThreshold?: number;
  needsTrim: boolean;
}
