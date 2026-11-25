// ネット注文の1行の金額（税込）。
// Amazon などの price は単価。モノタロウだけは、取り込みのときに「税抜の単価×個数」を price に入れているので、
// 個数をもう一度掛けると多くなる。注文の合計（税込）を行の金額で割り振って出す（2026-11-25）。

type Item = { price?: number; quantity?: number };
type Order = { source?: string; total?: number; items?: Item[] };

export function orderLineAmount(order: Order, item: Item): number {
  const price = item.price ?? 0;
  if (order.source !== "モノタロウ") return price * (item.quantity ?? 1);
  const sum = (order.items ?? []).reduce((n, i) => n + (i.price ?? 0), 0);
  return sum > 0 && order.total ? Math.round((price * order.total) / sum) : price;
}
