"use client";

import { useEffect, useState } from "react";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/lib/auth-context";
import { usePortfolioStore } from "@/stores/portfolio.store";
import { getPlaybooks, updatePlaybook, deletePlaybook, updateUserProfile } from "@/lib/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusCircle, Edit, Trash2, CheckCircle, BookMarked } from "lucide-react";
import Link from "next/link";
import type { Playbook } from "@/types";

const DIFFICULTY_COLOR: Record<string, string> = {
  BEGINNER: "bg-green-100 text-green-700",
  INTERMEDIATE: "bg-yellow-100 text-yellow-700",
  ADVANCED: "bg-red-100 text-red-700",
};

export default function PlaybookPage() {
  const { user } = useAuth();
  const { activePlaybook, setActivePlaybook } = usePortfolioStore();
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    getPlaybooks(user.uid).then((data) => { setPlaybooks(data); setLoading(false); });
  }, [user]);

  async function handleSetActive(p: Playbook) {
    if (!user) return;
    // Deactivate ทุก Playbook ยกเว้นตัวที่เลือก (รวม case ที่ Firestore มีหลายอัน active)
    await Promise.all([
      updatePlaybook(user.uid, p.id, { isActive: true }),
      ...playbooks.filter((x) => x.id !== p.id).map((x) =>
        updatePlaybook(user.uid, x.id, { isActive: false })
      ),
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

  if (loading) return <div className="flex justify-center h-64 items-center"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>;

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
                  {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="w-8 h-8" nativeButton={false} render={<Link href={`/playbook/${p.id}`} />}>
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(p.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {/* Assets */}
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
    </div>
  );
}
