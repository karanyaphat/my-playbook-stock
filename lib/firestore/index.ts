import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, getDocsFromServer,
  deleteDoc, query, orderBy, where, Timestamp, updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// Strip undefined values without touching Timestamps or nested objects
function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
import type {
  Playbook, Portfolio, Holding, Transaction,
  Snapshot, Alert, MonitorSettings, ProjectionSettings,
} from "@/types";

// ---- Paths ----
const u = (uid: string) => doc(db, "users", uid);
const playbooksCol = (uid: string) => collection(db, "users", uid, "playbooks");
const portfoliosCol = (uid: string) => collection(db, "users", uid, "portfolios");
const holdingsCol = (uid: string, pid: string) => collection(db, "users", uid, "portfolios", pid, "holdings");
const txCol = (uid: string, pid: string) => collection(db, "users", uid, "portfolios", pid, "transactions");
const snapshotsCol = (uid: string, pid: string) => collection(db, "users", uid, "portfolios", pid, "snapshots");
const alertsCol = (uid: string) => collection(db, "users", uid, "alerts");
const settingsDoc = (uid: string, key: string) => doc(db, "users", uid, "settings", key);

// ---- User Profile ----
export async function getUserProfile(uid: string) {
  const snap = await getDoc(u(uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateUserProfile(uid: string, data: { activePlaybookId?: string | null; activePortfolioId?: string | null }) {
  await setDoc(u(uid), { ...data, updatedAt: Timestamp.now() }, { merge: true });
}

// ---- Playbooks ----
export async function getPlaybooks(uid: string): Promise<Playbook[]> {
  const snap = await getDocs(playbooksCol(uid));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Playbook));
}

export async function getPlaybook(uid: string, id: string): Promise<Playbook | null> {
  const snap = await getDoc(doc(playbooksCol(uid), id));
  return snap.exists() ? { id: snap.id, ...snap.data() } as Playbook : null;
}

export async function createPlaybook(uid: string, data: Omit<Playbook, "id" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(playbooksCol(uid), { ...data, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  return ref.id;
}

export async function updatePlaybook(uid: string, id: string, data: Partial<Playbook>) {
  await updateDoc(doc(playbooksCol(uid), id), { ...data, updatedAt: Timestamp.now() });
}

export async function deletePlaybook(uid: string, id: string) {
  await deleteDoc(doc(playbooksCol(uid), id));
}

// ---- Portfolios ----
export async function getPortfolios(uid: string): Promise<Portfolio[]> {
  const snap = await getDocs(portfoliosCol(uid));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Portfolio));
}

export async function createPortfolio(uid: string, data: Omit<Portfolio, "id" | "createdAt" | "updatedAt"> & { updatedAt?: unknown }): Promise<string> {
  const ref = await addDoc(portfoliosCol(uid), { ...data, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  return ref.id;
}

// ---- Holdings ----
export async function getHoldings(uid: string, pid: string): Promise<Holding[]> {
  // getDocsFromServer bypasses Firestore offline cache — ensures fresh data
  const snap = await getDocsFromServer(holdingsCol(uid, pid));
  return snap.docs.map((d) => d.data() as Holding);
}

export async function setHolding(uid: string, pid: string, holding: Holding) {
  const clean = stripUndefined(holding);
  await setDoc(doc(holdingsCol(uid, pid), holding.ticker), { ...clean, updatedAt: Timestamp.now() });
}

// ---- Transactions ----
export async function getTransactions(uid: string, pid: string): Promise<Transaction[]> {
  const q = query(txCol(uid, pid), orderBy("date", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Transaction));
}

export async function addTransaction(uid: string, pid: string, tx: Omit<Transaction, "id" | "createdAt">) {
  const clean = stripUndefined(tx);
  await addDoc(txCol(uid, pid), { ...clean, createdAt: Timestamp.now() });
}

export async function deleteTransaction(uid: string, pid: string, txId: string) {
  await deleteDoc(doc(txCol(uid, pid), txId));
}

// คำนวณ holding ใหม่จาก transactions ที่เหลือทั้งหมดของ ticker นั้น
export async function recalculateHolding(uid: string, pid: string, ticker: string) {
  const q = query(txCol(uid, pid), orderBy("date", "asc"));
  const snap = await getDocsFromServer(q);
  const txs = snap.docs.map((d) => d.data() as Transaction).filter((t) => t.ticker === ticker);

  let shares = 0;
  let avgCost = 0;
  let currency: "USD" | "THB" = "USD";

  for (const tx of txs) {
    currency = tx.currency;
    if (tx.type === "BUY" || tx.type === "TRANSFER_IN") {
      const newShares = shares + tx.shares;
      avgCost = newShares > 0 ? (shares * avgCost + tx.shares * tx.price) / newShares : tx.price;
      shares = newShares;
    } else if (tx.type === "SELL" || tx.type === "TRANSFER_OUT") {
      shares = Math.max(0, shares - tx.shares);
    }
    // DIVIDEND — ไม่กระทบ shares/avgCost
  }

  const holdingRef = doc(holdingsCol(uid, pid), ticker);
  if (shares <= 0) {
    // ไม่เหลือหุ้น — ลบ holding ออก
    await deleteDoc(holdingRef);
  } else {
    await setDoc(holdingRef, { ticker, shares, avgCost, currency, updatedAt: Timestamp.now() });
  }
}

// ---- Snapshots ----
export async function addSnapshot(uid: string, pid: string, snapshot: Snapshot) {
  await addDoc(snapshotsCol(uid, pid), snapshot);
}

export async function getSnapshots(uid: string, pid: string): Promise<Snapshot[]> {
  const q = query(snapshotsCol(uid, pid), orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as Snapshot);
}

// ---- Alerts ----
export async function getAlerts(uid: string): Promise<Alert[]> {
  const q = query(alertsCol(uid), where("isDismissed", "==", false), orderBy("triggeredAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Alert));
}

export async function addAlert(uid: string, alert: Omit<Alert, "id">) {
  await addDoc(alertsCol(uid), alert);
}

export async function markAlertRead(uid: string, alertId: string) {
  await updateDoc(doc(alertsCol(uid), alertId), { isRead: true });
}

export async function dismissAlert(uid: string, alertId: string) {
  await updateDoc(doc(alertsCol(uid), alertId), { isDismissed: true });
}

// ---- Settings ----
export async function getMonitorSettings(uid: string): Promise<MonitorSettings | null> {
  const snap = await getDoc(settingsDoc(uid, "monitor"));
  return snap.exists() ? snap.data() as MonitorSettings : null;
}

export async function saveMonitorSettings(uid: string, data: Partial<MonitorSettings>) {
  await setDoc(settingsDoc(uid, "monitor"), { ...data, updatedAt: Timestamp.now() }, { merge: true });
}

export async function getProjectionSettings(uid: string): Promise<ProjectionSettings | null> {
  const snap = await getDoc(settingsDoc(uid, "projection"));
  return snap.exists() ? snap.data() as ProjectionSettings : null;
}

export async function saveProjectionSettings(uid: string, data: Partial<ProjectionSettings>) {
  await setDoc(settingsDoc(uid, "projection"), { ...data, updatedAt: Timestamp.now() }, { merge: true });
}

// ---- Manual Prices ----
export async function getManualPrices(uid: string): Promise<Record<string, number>> {
  const snap = await getDoc(settingsDoc(uid, "manualPrices"));
  return snap.exists() ? ((snap.data().prices as Record<string, number>) ?? {}) : {};
}

export async function saveManualPrices(uid: string, prices: Record<string, number>) {
  await setDoc(settingsDoc(uid, "manualPrices"), { prices, updatedAt: Timestamp.now() }, { merge: false });
}
