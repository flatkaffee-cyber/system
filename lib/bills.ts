// 定期請求（毎月の固定費）。請求書を登録し、月ごとに「支払ったか」を管理する。
// 領収書(receipts)＝立替(貸)役員借入金)とは別。こちらは会社が業者へ毎月払うもの。
// KV: bills:index（マスター配列）/ bill:file:{id}（請求書画像）/ bill:payments（月次記録配列）

const BILLS_IDX = "bills:index";
const PAYMENTS_KEY = "bill:payments";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type BillMethod = "口座振替" | "振込" | "コンビニ" | "カード" | "その他";
export const BILL_METHODS: BillMethod[] = ["口座振替", "振込", "コンビニ", "カード", "その他"];

// 支払方法が「自動で引かれる」タイプか（確認中心・手動送金不要）
export function isAutoMethod(m: BillMethod): boolean {
  return m === "口座振替";
}

export type RecurringBill = {
  id: string;
  payee: string; // 支払先（例: ○○少額短期保険、△△駐車場）
  category: string; // 科目（保険料 / 家賃 など。lib/receipt CATEGORIES）
  amount: number; // 標準の月額（税込）
  method: BillMethod;
  dueDay?: number; // 毎月の支払・引落の目安日（1-31）。不定なら未設定
  memo: string;
  startMonth: string; // "YYYY-MM" この月から発生
  active: boolean; // 継続中か（解約したら false）
  createdAt: string;
};

// 月ごとの支払い記録（bill × 月）
export type BillPayment = {
  billId: string;
  month: string; // "YYYY-MM"
  amount: number; // その月の実額（変動対応）
  paidAt?: string; // 支払い済みにした日時（ISO）
  registered?: { journalId: number; at: string }; // freee記帳済み
};

export function currentMonthJst(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 7); // YYYY-MM
}

export async function getBills(): Promise<RecurringBill[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<RecurringBill[]>(BILLS_IDX)) ?? [];
}

export async function getBill(id: string): Promise<RecurringBill | null> {
  return (await getBills()).find((b) => b.id === id) ?? null;
}

export async function saveBill(
  b: Omit<RecurringBill, "createdAt">,
  imageDataUrl?: string,
): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = await getBills();
  list.unshift({ ...b, createdAt: new Date(Date.now()).toISOString() });
  await store.set(BILLS_IDX, list);
  if (imageDataUrl && imageDataUrl.length < 6_000_000) {
    try {
      await store.set(`bill:file:${b.id}`, imageDataUrl);
    } catch {
      /* 画像保存失敗はスルー */
    }
  }
}

export async function updateBill(
  id: string,
  patch: Partial<Omit<RecurringBill, "id" | "createdAt">>,
): Promise<boolean> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const list = await getBills();
  const i = list.findIndex((b) => b.id === id);
  if (i < 0) return false;
  list[i] = { ...list[i], ...patch };
  await store.set(BILLS_IDX, list);
  return true;
}

export async function deleteBill(id: string): Promise<void> {
  const store = await kv();
  if (!store) return;
  const list = await getBills();
  await store.set(BILLS_IDX, list.filter((b) => b.id !== id));
  const pays = await getPayments();
  await store.set(PAYMENTS_KEY, pays.filter((p) => p.billId !== id));
  try {
    await store.del(`bill:file:${id}`);
  } catch {
    /* スルー */
  }
}

export async function getBillImage(id: string): Promise<string | null> {
  const store = await kv();
  if (!store) return null;
  return (await store.get<string>(`bill:file:${id}`)) ?? null;
}

export async function getPayments(): Promise<BillPayment[]> {
  const store = await kv();
  if (!store) return [];
  return (await store.get<BillPayment[]>(PAYMENTS_KEY)) ?? [];
}

export async function getPayment(billId: string, month: string): Promise<BillPayment | null> {
  return (await getPayments()).find((p) => p.billId === billId && p.month === month) ?? null;
}

// 月次記録を upsert（無ければ作る）
async function upsertPayment(
  billId: string,
  month: string,
  patch: Partial<BillPayment>,
  fallbackAmount: number,
): Promise<BillPayment> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const pays = await getPayments();
  const i = pays.findIndex((p) => p.billId === billId && p.month === month);
  let rec: BillPayment;
  if (i < 0) {
    rec = { billId, month, amount: fallbackAmount, ...patch };
    pays.unshift(rec);
  } else {
    rec = { ...pays[i], ...patch };
    pays[i] = rec;
  }
  await store.set(PAYMENTS_KEY, pays);
  return rec;
}

// 支払い済み/未払いを切り替え
export async function setPaid(
  billId: string,
  month: string,
  paid: boolean,
  amount: number,
): Promise<BillPayment> {
  return upsertPayment(
    billId,
    month,
    { paidAt: paid ? new Date(Date.now()).toISOString() : undefined, amount },
    amount,
  );
}

export async function markBillRegistered(
  billId: string,
  month: string,
  journalId: number,
  amount: number,
): Promise<void> {
  await upsertPayment(
    billId,
    month,
    { registered: { journalId, at: new Date(Date.now()).toISOString() } },
    amount,
  );
}
