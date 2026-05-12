import type { Playbook } from "@/types";

function formatDate(ts: { seconds: number }): string {
  return new Date(ts.seconds * 1000).toLocaleDateString("th-TH", {
    day: "numeric", month: "long", year: "numeric",
  });
}

function redirectLabel(to: string): string {
  if (to === "CASH_RESERVE") return "Cash Reserve";
  if (to === "LOWEST_ASSET") return "Asset ที่มีสัดส่วนน้อยที่สุด";
  return to;
}

export function generatePlaybookMarkdown(p: Playbook): string {
  const lines: string[] = [];
  const cash = p.cashReserve.type === "TICKER" ? p.cashReserve.ticker : p.cashReserve.cashLabel;

  // ---- Header ----
  lines.push(`# 📘 ${p.name}`);
  lines.push("");
  if (p.description) {
    lines.push(`> ${p.description}`);
    lines.push("");
  }
  lines.push(`**สร้างเมื่อ:** ${formatDate(p.createdAt)}  `);
  lines.push(`**Reference Index:** ${p.referenceIndex}  `);
  lines.push(`**สกุลเงิน:** ${p.currency}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  // ---- Asset Allocation ----
  lines.push("## 🎯 Asset Allocation");
  lines.push("");
  lines.push(
    "สัดส่วนเป้าหมายของแต่ละ asset ใน Playbook นี้ ใช้เป็นแนวทางในการ DCA และ Rebalance " +
    "หาก asset ใดมีสัดส่วนเกิน Trim Threshold ที่กำหนดไว้ ระบบจะแจ้งเตือนให้ทำการ Trim"
  );
  lines.push("");
  lines.push("| Ticker | Role | สัดส่วน | สกุลเงิน | Trim Threshold |");
  lines.push("|--------|------|:------:|:-------:|:--------------:|");
  for (const a of p.assets) {
    const trim = a.trimThreshold ? `${a.trimThreshold}%` : "—";
    lines.push(`| **${a.ticker}** | ${a.role} | ${a.targetPct}% | ${a.currency} | ${trim} |`);
  }
  lines.push("");
  lines.push(
    `> **Cash Reserve:** ${cash} — เป้าหมาย **${p.cashReserve.floor}–${p.cashReserve.max}%** ของพอร์ต  \n` +
    `> Cash Reserve คือเงินสำรองที่เก็บไว้ใน asset สภาพคล่องสูง (เช่น SGOV) ` +
    `ไม่นับรวมใน allocation หลัก แต่ใช้ Deploy ในช่วง Crisis`
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // ---- Crisis Rules ----
  if (p.crisisRules.length > 0) {
    lines.push("## 🛡️ Crisis Deployment Rules");
    lines.push("");
    lines.push(
      `เมื่อ **${p.referenceIndex}** ปรับตัวลงจาก All-Time High (ATH) ถึงระดับที่กำหนด ` +
      `ให้นำ Cash Reserve ออกมา Deploy ซื้อ asset ตามสัดส่วนที่ระบุในแต่ละ Level ` +
      `กลยุทธ์นี้ช่วยลด average cost และเพิ่ม upside ในช่วงที่ตลาดอ่อนแอ`
    );
    lines.push("");
    for (const r of p.crisisRules) {
      lines.push(`### Level ${r.level} — ลดลง ≥ ${r.drawdownPct}%`);
      lines.push("");
      lines.push(`- **Deploy Cash:** ${r.deployCashPct}% ของ Cash Reserve ที่มีอยู่`);
      if (r.allocations?.length > 0) {
        lines.push("- **จัดสรรไปที่:**");
        for (const a of r.allocations) {
          lines.push(`  - ${a.ticker} — ${a.pct}%`);
        }
      }
      if (r.description) {
        lines.push(`- 💬 *"${r.description}"*`);
      }
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  // ---- Trim Rules ----
  if (p.trimRules.length > 0) {
    lines.push("## ✂️ Trim Rules");
    lines.push("");
    lines.push(
      "เมื่อ asset ใดมีสัดส่วนในพอร์ตสูงเกิน Trigger ที่กำหนด ให้ขายทำกำไรบางส่วน " +
      "และโอนเงินไปยังปลายทางที่กำหนดไว้ เพื่อรักษา balance ของพอร์ตไม่ให้ over-concentrated ใน asset ใด asset หนึ่ง"
    );
    lines.push("");
    lines.push("| Asset | Trigger | Trim ออก | โอนไปที่ |");
    lines.push("|-------|:-------:|:--------:|---------|");
    for (const r of p.trimRules) {
      lines.push(`| **${r.ticker}** | ≥ ${r.triggerPct}% | ${r.trimActionPct}% ของ ${r.ticker} | ${redirectLabel(r.redirectTo)} |`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // ---- Failure Protocol ----
  if (p.failureProtocol) {
    const fp = p.failureProtocol;
    const action = fp.action === "SWITCH_PLAYBOOK"
      ? `เปลี่ยนไปใช้ Playbook อื่น`
      : `ลด weight ของ assets หลักและปรับ allocation ใหม่`;
    lines.push("## ⚠️ Failure Protocol");
    lines.push("");
    lines.push(
      "กลไกตรวจสอบว่า Playbook นี้ยังทำงานได้ดีพอหรือไม่ " +
      "โดยเปรียบเทียบผลตอบแทนกับ benchmark หากแพ้ benchmark ต่อเนื่องยาวนาน " +
      "แสดงว่า Playbook นี้อาจไม่เหมาะกับสภาวะตลาดปัจจุบัน ควรทบทวนกลยุทธ์"
    );
    lines.push("");
    lines.push(
      `ถ้า Playbook นี้ให้ผลตอบแทนต่ำกว่า **${fp.benchmarkTicker}** เกิน **${fp.underperformPct}%** ` +
      `ต่อเนื่อง **${fp.durationYears} ปี** → ${action}`
    );
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  // ---- Summary ----
  lines.push("## 📋 สรุปกลยุทธ์");
  lines.push("");
  const totalPct = p.assets.reduce((s, a) => s + a.targetPct, 0);
  const growthAssets = p.assets.filter((a) => a.role.toLowerCase().includes("growth"));
  const incomeAssets = p.assets.filter((a) => a.role.toLowerCase().includes("income") || a.role.toLowerCase().includes("cashflow"));
  const hedgeAssets = p.assets.filter((a) => ["gold", "insurance", "haven", "safe"].some((k) => a.role.toLowerCase().includes(k)));
  const otherAssets = p.assets.filter((a) => ![...growthAssets, ...incomeAssets, ...hedgeAssets].includes(a));

  lines.push(`Playbook นี้ประกอบด้วย asset **${p.assets.length} ตัว** รวม allocation **${totalPct}%**`);
  lines.push("");
  if (growthAssets.length > 0) lines.push(`- **Growth** (${growthAssets.reduce((s, a) => s + a.targetPct, 0)}%): ${growthAssets.map((a) => a.ticker).join(", ")}`);
  if (incomeAssets.length > 0) lines.push(`- **Income / Cashflow** (${incomeAssets.reduce((s, a) => s + a.targetPct, 0)}%): ${incomeAssets.map((a) => a.ticker).join(", ")}`);
  if (hedgeAssets.length > 0) lines.push(`- **Hedge / Insurance** (${hedgeAssets.reduce((s, a) => s + a.targetPct, 0)}%): ${hedgeAssets.map((a) => a.ticker).join(", ")}`);
  if (otherAssets.length > 0) lines.push(`- **Other** (${otherAssets.reduce((s, a) => s + a.targetPct, 0)}%): ${otherAssets.map((a) => a.ticker).join(", ")}`);
  lines.push(`- **Cash Reserve** (${p.cashReserve.floor}–${p.cashReserve.max}%): ${cash}`);
  lines.push("");
  if (p.crisisRules.length > 0) {
    const minDrop = Math.min(...p.crisisRules.map((r) => r.drawdownPct));
    lines.push(`มีแผน Crisis Deployment **${p.crisisRules.length} ระดับ** เริ่ม deploy เมื่อตลาดร่วงเกิน **${minDrop}%**`);
  }
  if (p.trimRules.length > 0) {
    lines.push(`มี Trim Rules **${p.trimRules.length} รายการ** คุม over-concentration`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`*เอกสารนี้สร้างจาก [My Playbook Stock](https://github.com/karanyaphat/my-playbook-stock) เมื่อ ${new Date().toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" })}*`);

  return lines.join("\n");
}
