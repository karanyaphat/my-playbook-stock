"use client";

import { useEffect, useState, useCallback } from "react";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { usePortfolioStore } from "@/stores/portfolio.store";
import { getTransactions, addTransaction, deleteTransaction, recalculateHolding, getHoldings, setHolding } from "@/lib/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle, Gift } from "lucide-react";
import type { Transaction, Holding } from "@/types";

const TX_TYPES = ["BUY", "SELL", "DIVIDEND", "TRANSFER_IN", "TRANSFER_OUT"] as const;
const TYPE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  BUY: "default", SELL: "secondary", DIVIDEND: "outline", TRANSFER_IN: "default", TRANSFER_OUT: "destructive",
};

export default function TransactionsPage() {
  const { user } = useAuth();
  const { activePlaybook, activePortfolio } = usePortfolioStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [ticker, setTicker] = useState("");
  const [type, setType] = useState<typeof TX_TYPES[number]>("BUY");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");

  const allTickers = activePlaybook
    ? [...activePlaybook.assets.map((a) => a.ticker), activePlaybook.cashReserve.ticker ?? ""].filter(Boolean)
    : [];

  // Currency ของ ticker ที่เลือก — reactive
  const selectedCurrency: "USD" | "THB" = (() => {
    if (!ticker || !activePlaybook) return "USD";
    const asset = activePlaybook.assets.find((a) => a.ticker === ticker);
    if (asset) return asset.currency;
    if (ticker === activePlaybook.cashReserve.ticker) return activePlaybook.cashReserve.currency ?? "USD";
    return "USD";
  })();
  const currencySymbol = selectedCurrency === "THB" ? "฿" : "$";

  const load = useCallback(async () => {
    if (!user || !activePortfolio) return;
    setLoading(true);
    const data = await getTransactions(user.uid, activePortfolio.id);
    setTransactions(data);
    setLoading(false);
  }, [user, activePortfolio]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !activePortfolio || !ticker || !shares || !price) return;
    setSaving(true);

    const asset = activePlaybook?.assets.find((a) => a.ticker === ticker);
    const currency = asset?.currency ?? (ticker === activePlaybook?.cashReserve.ticker ? (activePlaybook.cashReserve.currency ?? "USD") : "USD");
    const sharesNum = parseFloat(shares);
    const priceNum = parseFloat(price);
    const total = sharesNum * priceNum;

    const tx: Omit<Transaction, "id" | "createdAt"> = {
      ticker, type, shares: sharesNum, price: priceNum, currency, total,
      note: note || undefined, date: Timestamp.fromDate(new Date(date)),
    };

    await addTransaction(user.uid, activePortfolio.id, tx);

    // Update holding
    if (type !== "DIVIDEND" && type !== "TRANSFER_OUT") {
      const holdings = await getHoldings(user.uid, activePortfolio.id);
      const existing = holdings.find((h) => h.ticker === ticker);
      const oldShares = existing?.shares ?? 0;
      const oldAvg = existing?.avgCost ?? 0;
      let newShares = oldShares;
      let newAvg = oldAvg;
      if (type === "BUY" || type === "TRANSFER_IN") {
        newShares = oldShares + sharesNum;
        newAvg = newShares > 0 ? (oldShares * oldAvg + sharesNum * priceNum) / newShares : priceNum;
      } else if (type === "SELL") {
        newShares = Math.max(0, oldShares - sharesNum);
      }
      await setHolding(user.uid, activePortfolio.id, {
        ticker, shares: newShares, avgCost: newAvg, currency, updatedAt: Timestamp.now(),
      });
    }

    setTicker(""); setShares(""); setPrice(""); setNote("");
    setOpen(false);
    await load();
    setSaving(false);
  }

  const buys = transactions.filter((t) => t.type === "BUY");
  const divs = transactions.filter((t) => t.type === "DIVIDEND");
  const totalInvested = buys.reduce((s, t) => s + (t.currency === "THB" ? t.total / 33 : t.total), 0);
  const totalDiv = divs.reduce((s, t) => s + (t.currency === "THB" ? t.total / 33 : t.total), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Transactions</h1><p className="text-sm text-muted-foreground">ประวัติการซื้อ-ขาย และปันผล</p></div>
        <Button onClick={() => setOpen(true)} className="gap-2"><Plus className="w-4 h-4" />Add Transaction</Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Invested</CardTitle><ArrowDownCircle className="w-4 h-4 text-blue-500" /></CardHeader>
          <CardContent><p className="text-2xl font-bold">${totalInvested.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p><p className="text-xs text-muted-foreground mt-1">{buys.length} transactions</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Sell</CardTitle><ArrowUpCircle className="w-4 h-4 text-orange-500" /></CardHeader>
          <CardContent><p className="text-2xl font-bold">{transactions.filter((t) => t.type === "SELL").length}</p><p className="text-xs text-muted-foreground mt-1">transactions</p></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Dividend</CardTitle><Gift className="w-4 h-4 text-green-500" /></CardHeader>
          <CardContent><p className="text-2xl font-bold">${totalDiv.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p><p className="text-xs text-muted-foreground mt-1">{divs.length} payments</p></CardContent></Card>
      </div>

      <Card><CardContent className="p-0">
        {loading ? <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
          : transactions.length === 0 ? <div className="flex flex-col items-center py-16 text-muted-foreground"><p className="text-sm">ยังไม่มี transaction</p></div>
          : (
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50"><tr className="text-xs text-muted-foreground">
                <th className="px-4 py-2.5 text-left">Date</th><th className="px-4 py-2.5 text-left">Asset</th>
                <th className="px-4 py-2.5 text-left">Type</th><th className="px-4 py-2.5 text-right">Shares</th>
                <th className="px-4 py-2.5 text-right">Price</th><th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5 text-left">Note</th><th />
              </tr></thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{tx.date.toDate().toLocaleDateString("th-TH", { day: "2-digit", month: "short", year: "2-digit" })}</td>
                    <td className="px-4 py-2.5 font-medium">{tx.ticker}</td>
                    <td className="px-4 py-2.5"><Badge variant={TYPE_VARIANT[tx.type]} className="text-xs">{tx.type}</Badge></td>
                    <td className="px-4 py-2.5 text-right">{tx.shares.toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right">{tx.currency === "THB" ? "฿" : "$"}{tx.price.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{tx.currency === "THB" ? "฿" : "$"}{tx.total.toLocaleString("en-US", { maximumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2.5 text-muted-foreground max-w-[120px] truncate">{tx.note ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-muted-foreground hover:text-destructive"
                        onClick={async () => {
  if (!user || !activePortfolio || !tx.id) return;
  await deleteTransaction(user.uid, activePortfolio.id, tx.id);
  await recalculateHolding(user.uid, activePortfolio.id, tx.ticker);
  await load();
}}>
                        <Trash2 className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </CardContent></Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add Transaction</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5"><Label>Asset</Label>
                <Select value={ticker} onValueChange={(v) => { if (v) setTicker(v); }}>
                  <SelectTrigger><SelectValue placeholder="เลือก Asset" /></SelectTrigger>
                  <SelectContent>{allTickers.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="flex flex-col gap-1.5"><Label>Type</Label>
                <Select value={type} onValueChange={(v) => { if (v) setType(v as typeof TX_TYPES[number]); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TX_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <div className="flex flex-col gap-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div className="flex flex-col gap-1.5">
                <Label>Shares / Units</Label>
                <Input type="number" step="any" min="0" placeholder="0.00" value={shares} onChange={(e) => setShares(e.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between h-5">
                  <Label>Price</Label>
                  {ticker && (
                    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${selectedCurrency === "THB" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                      {selectedCurrency}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol}</span>
                  <Input type="number" step="any" min="0" placeholder="0.00" value={price} onChange={(e) => setPrice(e.target.value)} required className="pl-7" />
                </div>
              </div>
            </div>
            <div className="rounded-lg bg-muted px-4 py-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">
                {currencySymbol}{(parseFloat(shares || "0") * parseFloat(price || "0")).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {ticker && <span className="ml-1.5 text-xs text-muted-foreground">{selectedCurrency}</span>}
              </span>
            </div>
            <div className="flex flex-col gap-1.5"><Label>Note (optional)</Label><Input placeholder="DCA รายเดือน" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Add"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
