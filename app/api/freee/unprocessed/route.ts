import { NextRequest, NextResponse } from "next/server";
import { isConnected } from "@/lib/freee";
import { pickSource } from "@/lib/freeeMirror/source";
import { matchKbIn, getKbEntries, getDecisions } from "@/lib/kb";
import { matchDocsIn, getDocsIndex } from "@/lib/docs";
import { isGoogleConnected } from "@/lib/google";
import { cardOrdersForMatching } from "@/lib/purchase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const src = await pickSource(req);
  // 写しから出すときは、freee との接続が切れていても最後に取り込んだ明細を出す
  if (src.kind === "freee" && !(await isConnected())) {
    return NextResponse.json({ connected: false, txns: [] });
  }
  try {
    const walletables = await src.walletables();
    const walletName = new Map(walletables.map((w) => [w.id, w.name]));

    // ノウハウ・書類索引・判断はKVから1回だけ読む。
    // 以前は明細1件ごとに matchKb/matchDocs がKVを読んでいて、
    // 未処理が100件あると往復200回で1分近くかかっていた。
    // カード払いの発注。明細に出たときの手がかりにする。
    // 発注そのものはfreeeに登録していない（明細側で消し込むため）
    const cardOrders = await cardOrdersForMatching();

    const [decisions, kbEntries, docsIndex, gmail] = await Promise.all([
      getDecisions(),
      getKbEntries(),
      getDocsIndex(),
      isGoogleConnected(),
    ]);
    const out: unknown[] = [];

    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

    // 銀行と現金などの口座の、未処理（status 1）の明細
    const unprocessed = await src.walletTxns(
      { from: "2026-06-01", to: today },
      { walletableTypes: ["bank_account", "wallet"], status: 1 },
    );

    for (const t of unprocessed) {
      const hint = matchKbIn(kbEntries, t.description);
      const doc = matchDocsIn(docsIndex, t.amount, t.description)[0];
      // この明細の金額に対応する想定仕訳（書類のpaymentから）
      const pay = doc?.payments.find((p) => p.amount === t.amount);
      out.push({
        id: t.id,
        date: t.date,
        amount: t.amount,
        side: t.entry_side, // expense=出金, income=入金
        description: t.description,
        walletName: walletName.get(t.walletable_id) ?? "",
        hint: hint ? { category: hint.category, note: hint.note } : null,
        doc: doc
          ? {
              id: doc.id,
              title: doc.title,
              type: doc.type,
              summary: doc.summary,
              payNote: pay?.note ?? "",
              suggestedLines: doc.suggestedLines,
              taxReview: doc.taxReview,
              taxReviewReason: doc.taxReviewReason,
            }
          : null,
        decision: decisions[String(t.id)] ?? null,
        // 金額が一致し、発注から10日以内のもの
        purchase:
          cardOrders
            .filter((o) => {
              if (o.paidAmount !== t.amount) return false;
              const days =
                (Date.parse(`${t.date}T00:00:00Z`) -
                  Date.parse(`${o.orderedAt}T00:00:00Z`)) /
                86400000;
              return days >= 0 && days <= 10;
            })
            .map((o) => ({
              id: o.id,
              shop: o.shop ?? "",
              orderedAt: o.orderedAt,
              amount: o.paidAmount ?? 0,
              items: o.lines.map((l) => `${l.name} ${l.qty}${l.unit}`).join("・"),
            }))[0] ?? null,
      });
    }

    // freeeの「自動で経理（新しい順）」と一致：日付降順→同日はID降順
    out.sort((a: any, b: any) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return b.id - a.id;
    });
    return NextResponse.json({ connected: true, gmail, txns: out });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ connected: true, error: msg, txns: [] });
  }
}
