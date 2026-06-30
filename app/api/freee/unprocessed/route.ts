import { NextResponse } from "next/server";
import { FREEE_COMPANY_ID, freeeGet, isConnected } from "@/lib/freee";
import { matchKb, getDecisions } from "@/lib/kb";

export const runtime = "nodejs";

type Walletable = { id: number; name: string; type: string };
type WalletTxn = {
  id: number;
  amount: number;
  date: string;
  description: string;
  entry_side: "income" | "expense";
  status: number; // 1=未処理, 2=処理済
  due_amount: number;
  walletable_id: number;
};

export async function GET() {
  if (!(await isConnected())) {
    return NextResponse.json({ connected: false, txns: [] });
  }
  try {
    const { walletables } = await freeeGet<{ walletables: Walletable[] }>(
      "/api/1/walletables",
      { company_id: FREEE_COMPANY_ID },
    );
    const banks = walletables.filter(
      (w) => w.type === "bank_account" || w.type === "wallet",
    );

    const decisions = await getDecisions();
    const out: unknown[] = [];

    for (const w of banks) {
      const { wallet_txns } = await freeeGet<{ wallet_txns: WalletTxn[] }>(
        "/api/1/wallet_txns",
        {
          company_id: FREEE_COMPANY_ID,
          walletable_type: w.type,
          walletable_id: String(w.id),
          start_date: "2026-06-01",
          end_date: new Date(Date.now() + 9 * 3600 * 1000)
            .toISOString()
            .slice(0, 10),
        },
      );
      for (const t of wallet_txns) {
        if (t.status !== 1) continue; // 未処理のみ
        const hint = await matchKb(t.description);
        out.push({
          id: t.id,
          date: t.date,
          amount: t.amount,
          side: t.entry_side, // expense=出金, income=入金
          description: t.description,
          walletName: w.name,
          hint: hint ? { category: hint.category, note: hint.note } : null,
          decision: decisions[String(t.id)] ?? null,
        });
      }
    }

    out.sort((a: any, b: any) => (a.date < b.date ? 1 : -1));
    return NextResponse.json({ connected: true, txns: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ connected: true, error: msg, txns: [] });
  }
}
