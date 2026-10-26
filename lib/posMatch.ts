// カード会計は Square のレジアプリに金額だけを渡して行うので、レジ側に「金額だけ・品目なし」の注文ができる
// （売上の商品別に「金額入力（店内）」、KDS に「?」として出ていたもの）。
// こちらのシステムで作った注文（品目あり）と、数秒後にレジが作った金額だけの注文を、金額と時刻でつなぐ。
// つないだ品目は lib/salesFix の対応表に入れ、売上の商品別に出す。

export type SqLine = { name?: string; note?: string; quantity?: string; total_money?: { amount?: number } };
export type SqOrder = {
  id: string;
  state: string;
  created_at: string;
  ticket_name?: string;
  total_money?: { amount?: number };
  tenders?: unknown[];
  line_items?: SqLine[];
};
export type PosPair = { posId: string; sysId: string; items: { name: string; qty: number; amount: number }[] };

/** レジで金額だけ打った注文か（品目に名前が1つも無い） */
export function isAmountOnly(o: SqOrder): boolean {
  const lines = o.line_items ?? [];
  return lines.length > 0 && lines.every((li) => !li.name);
}

/** レジの注文の何分前までに作られた注文を候補にするか。会計の画面で手間取っても届く長さ */
const WINDOW_MS = 30 * 60_000;

/**
 * 金額だけの注文（pos）ごとに、それより前の WINDOW_MS 以内に作られた、同じ金額で品目のある注文（sys）を探す。
 * いちばん近いものを選び、1つの注文は1回しか使わない。
 */
export function pairPosOrders(sysOrders: SqOrder[], posOrders: SqOrder[]): PosPair[] {
  const used = new Set<string>();
  const pairs: PosPair[] = [];
  const candidates = sysOrders.filter((o) => !isAmountOnly(o) && (o.line_items ?? []).some((li) => li.name));
  for (const p of [...posOrders].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    const amount = p.total_money?.amount ?? 0;
    const at = Date.parse(p.created_at);
    const hit = candidates
      .filter((s) => !used.has(s.id) && (s.total_money?.amount ?? 0) === amount)
      .map((s) => ({ s, gap: at - Date.parse(s.created_at) }))
      .filter((x) => x.gap >= 0 && x.gap <= WINDOW_MS)
      .sort((a, b) => a.gap - b.gap)[0];
    if (!hit) continue;
    used.add(hit.s.id);
    pairs.push({
      posId: p.id,
      sysId: hit.s.id,
      items: (hit.s.line_items ?? [])
        .filter((li) => li.name)
        .map((li) => ({ name: String(li.name), qty: parseInt(li.quantity ?? "1") || 1, amount: li.total_money?.amount ?? 0 })),
    });
  }
  return pairs;
}
