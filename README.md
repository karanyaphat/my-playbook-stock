# My Playbook Stock

> Personal Investment OS — สร้าง Playbook การลงทุนของคุณเอง ติดตามพอร์ต คำนวณกำไร/ขาดทุน และวางแผนเกษียณ

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-orange?logo=firebase)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38bdf8?logo=tailwindcss)

---

## Features

### Playbook Builder
สร้างกฎการลงทุนส่วนตัว กำหนด asset allocation, crisis rules, trim rules และ failure protocol ผ่าน multi-step form

### Dashboard
- มูลค่าพอร์ตรวม (USD / THB) พร้อมอัตราแลกเปลี่ยน real-time
- กำไร/ขาดทุน รายหุ้นและภาพรวม
- Pie chart แสดง allocation ปัจจุบัน vs เป้าหมาย
- **Manual price input** สำหรับกองทุนที่ดึงราคาอัตโนมัติไม่ได้
- Sort holdings ตามมูลค่า หรือ % กำไร/ขาดทุน

### Transactions
- บันทึกการซื้อ-ขาย, ปันผล, โอน
- รองรับ USD และ THB อัตโนมัติตาม asset
- ลบ transaction แล้ว recalculate holding อัตโนมัติ

### Monitor
- แจ้งเตือน Trim Signal เมื่อ asset เกิน threshold
- Crisis level ตาม drawdown %
- ติดตาม Cash Reserve vs เป้าหมาย

### Projection
- คาดการณ์มูลค่าพอร์ต 3 scenarios: Conservative / Base / Optimistic
- คำนวณ weighted return จาก Playbook allocation จริง
- เป้าหมาย Passive Income รายเดือนหลังเกษียณ

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS + shadcn/ui |
| Font | Graphik Trial |
| Charts | Recharts |
| Database | Firebase Firestore |
| Auth | Firebase Authentication (Google) |
| State | Zustand |
| Price API | Yahoo Finance (direct fetch) |

---

## Getting Started

### 1. Clone & Install

```bash
git clone https://github.com/karanyaphat/my-playbook-stock.git
cd my-playbook-stock
npm install
```

### 2. ตั้งค่า Firebase

สร้าง project บน [Firebase Console](https://console.firebase.google.com) แล้วเปิด Firestore และ Authentication (Google provider)

สร้างไฟล์ `.env.local` แล้วใส่ค่าจาก Firebase project settings:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

### 3. Run

```bash
npm run dev
```

เปิด [http://localhost:3000](http://localhost:3000)

---

## Project Structure

```
app/
├── (app)/
│   ├── dashboard/       # หน้าหลัก — holdings, P&L, allocation
│   ├── playbook/        # Playbook list, builder, editor
│   ├── transactions/    # ประวัติ transaction
│   ├── monitor/         # Crisis & trim alerts
│   └── projection/      # Retirement projection chart
├── (auth)/
│   └── login/           # Google sign-in
└── api/prices/          # Yahoo Finance price proxy

lib/
├── engine/allocator.ts  # คำนวณ holdings, P&L, allocation %
├── firestore/           # Firestore CRUD functions
└── playbook/            # Templates & validators

stores/
└── portfolio.store.ts   # Zustand global state

types/
└── index.ts             # TypeScript types ทั้งหมด
```

---

## Firestore Data Model

```
users/{uid}
├── playbooks/{playbookId}
├── portfolios/{portfolioId}
│   ├── holdings/{ticker}
│   ├── transactions/{txId}
│   └── snapshots/{snapshotId}
├── alerts/{alertId}
└── settings/
    ├── monitor
    ├── projection
    └── manualPrices
```

---

## License

Personal project — ไม่ได้เปิดสำหรับ production use โดยไม่ได้รับอนุญาต
