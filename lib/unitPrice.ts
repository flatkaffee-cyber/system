// レシート・注文の1行から「1個（1パック）あたりの値段」を出す。
// 行の金額は買った個数ぶんの合計なので、原価に使うには1個あたりに直す必要がある。
// 例: 「クリームチーズ 227g 4コ×単368」¥1,590 → 1個 ¥368・4個
//     「ステンボウル15 @698×2」¥1,396        → 1個 ¥698・2個
//     「有塩バター 3コ」¥3,330               → 1個 ¥1,110・3個

const num = (s: string) => Number(s.replace(/,/g, ""));

export function unitPriceOf(name: string, amount: number, knownQty?: number): { price: number; qty: number } {
  // 注文（Amazonなど）は個数が別に分かっている。行の金額は単価×個数
  if (knownQty && knownQty > 1) return { price: Math.round(amount / knownQty), qty: knownQty };
  const s = name.normalize("NFKC");
  // 単価が書いてある（単368・@698）
  const unit = /(?:単|@)\s*([\d,]+)/.exec(s);
  // 買った個数（4コ×単・@698×2・5点・(2個×）。
  // 「160ml缶×30本」「1L×6本」「780ml瓶×12」のような商品名の中の「×N」は箱の中身なので数えない。
  // 買った個数の「×N」は単価（@・単）の直後にだけ付く
  const q =
    /(\d+)\s*(?:コ|個|点|本|袋|パック)\s*×\s*(?:単|@)/.exec(s) ??
    /(?:単|@)\s*[\d,]+\s*×\s*(\d+)/.exec(s) ??
    /(?:^|[\s(（])(\d+)\s*(?:コ|個|点|パック|袋)(?!\s*入)(?![\d])/.exec(s);
  const qty = q ? Math.max(1, Number(q[1])) : 1;
  if (unit) return { price: num(unit[1]), qty };
  return { price: Math.round(amount / qty), qty };
}
