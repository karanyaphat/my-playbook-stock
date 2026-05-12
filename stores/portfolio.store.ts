import { create } from "zustand";
import type { Playbook, Portfolio, HoldingWithValue } from "@/types";

interface PortfolioStore {
  activePlaybook: Playbook | null;
  activePortfolio: Portfolio | null;
  holdings: HoldingWithValue[];
  prices: Record<string, number>;
  manualPrices: Record<string, number>;
  usdThb: number;
  pricesUpdatedAt: string | null;
  isLoading: boolean;

  setActivePlaybook: (p: Playbook | null) => void;
  setActivePortfolio: (p: Portfolio | null) => void;
  setHoldings: (h: HoldingWithValue[]) => void;
  setPrices: (prices: Record<string, number>, usdThb: number) => void;
  setManualPrices: (prices: Record<string, number>) => void;
  setLoading: (v: boolean) => void;
}

export const usePortfolioStore = create<PortfolioStore>((set) => ({
  activePlaybook: null,
  activePortfolio: null,
  holdings: [],
  prices: {},
  manualPrices: {},
  usdThb: 33,
  pricesUpdatedAt: null,
  isLoading: false,

  setActivePlaybook: (p) => set({ activePlaybook: p }),
  setActivePortfolio: (p) => set({ activePortfolio: p }),
  setHoldings: (h) => set({ holdings: h }),
  setPrices: (prices, usdThb) => set({ prices, usdThb, pricesUpdatedAt: new Date().toISOString() }),
  setManualPrices: (prices) => set({ manualPrices: prices }),
  setLoading: (v) => set({ isLoading: v }),
}));
