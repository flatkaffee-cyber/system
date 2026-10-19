// Square のイベント時間帯の売上。月次の「イベント」に移すために、月次レポートと経理画面の月次の両方が使う。
// /api/analytics（Square）を同じサイトの中から呼ぶ。取れない・遅すぎる（既定10秒）ときは ok=false で、イベント分は 0 として続ける。
// 呼び出し側は ok=false のとき「イベントのレジ売上が店舗に入っている」ことを画面に出す。
// 純粋な関数に近い作り（fetch は引数で差し替えられる）。実行時に他のファイルを import しない。

export type SquareEventSales = { label: string; sales: number };

export async function squareEventSales(
  origin: string,
  headers: Record<string, string>,
  from: string,
  to: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<{ ok: boolean; events: SquareEventSales[]; analytics: unknown | null }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(`${origin}/api/analytics?from=${from}&to=${to}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    });
    const a = res.ok ? await res.json().catch(() => null) : null;
    if (!a) return { ok: false, events: [], analytics: null };
    const sales: { label: string; sales: number; reason: string }[] = a?.excludedEvents?.sales ?? [];
    return {
      ok: true,
      events: sales.filter((e) => e.reason === "イベント").map(({ label, sales }) => ({ label, sales })),
      analytics: a,
    };
  } catch {
    return { ok: false, events: [], analytics: null };
  }
}
