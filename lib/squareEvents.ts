// Square のイベント時間帯の売上。月次の「イベント」に移すために、月次レポートと経理画面の月次の両方が使う。
// /api/analytics（Square）を同じサイトの中から呼ぶ。取れなければ（保護されたプレビュー環境など）イベント分は 0 として続ける。

export type SquareEventSales = { label: string; sales: number };

export async function squareEventSales(
  origin: string,
  headers: Record<string, string>,
  from: string,
  to: string,
): Promise<{ events: SquareEventSales[]; analytics: unknown | null }> {
  try {
    const res = await fetch(`${origin}/api/analytics?from=${from}&to=${to}`, { headers, cache: "no-store" });
    const a = res.ok ? await res.json().catch(() => null) : null;
    const sales: { label: string; sales: number; reason: string }[] = a?.excludedEvents?.sales ?? [];
    return {
      events: sales.filter((e) => e.reason === "イベント").map(({ label, sales }) => ({ label, sales })),
      analytics: a,
    };
  } catch {
    return { events: [], analytics: null };
  }
}
