// 月次の表の「行の色とメモ」と「経理メモ（申し送り）」の決まり。KVへの保存は store.ts、ここは純粋な関数だけ。
// 実行時に他のファイルを import しない（テストから .ts 付きで読むため）。

export const MARK_COLORS = [
  { key: "yellow", label: "黄", bg: "#fff3b0" },
  { key: "pink", label: "桃", bg: "#fbd3e0" },
  { key: "cyan", label: "水", bg: "#cdeefa" },
  { key: "green", label: "緑", bg: "#d4f0d0" },
  { key: "orange", label: "橙", bg: "#ffdcb8" },
] as const;
export type MarkColor = (typeof MARK_COLORS)[number]["key"];
export type RowMark = { color?: MarkColor; note?: string; updatedAt: string };
export type RowMarks = Record<string, RowMark>;

export const NOTE_MAX = 500;
export const MEMO_MAX = 1000;

export function isMarkColor(x: unknown): x is MarkColor {
  return MARK_COLORS.some((c) => c.key === x);
}

/** 行の印を付ける・消す。知らない色や空の色は「色なし」、空白だけのメモは「メモなし」。両方なしなら、その行の印を消す */
export function putMark(marks: RowMarks, key: string, input: { color?: string; note?: string }, now: string): RowMarks {
  const next = { ...marks };
  const color = isMarkColor(input.color) ? input.color : undefined;
  const note = (input.note ?? "").trim().slice(0, NOTE_MAX) || undefined;
  if (!color && !note) {
    delete next[key];
    return next;
  }
  next[key] = { ...(color ? { color } : {}), ...(note ? { note } : {}), updatedAt: now };
  return next;
}

export type KeiriMemo = { id: string; month: string; text: string; done: boolean; createdAt: string; doneAt?: string };

/** その月に出す経理メモ。書いた月には必ず出す。前の月に書いて済みにしていないものも出す。済みでないものが先、その中は書いた順 */
export function memosForMonth(memos: KeiriMemo[], month: string): KeiriMemo[] {
  return memos
    .filter((m) => m.month === month || (m.month < month && !m.done))
    .sort((a, b) => Number(a.done) - Number(b.done) || a.createdAt.localeCompare(b.createdAt));
}

export function addMemo(memos: KeiriMemo[], input: { month: string; text: string }, id: string, now: string): KeiriMemo[] {
  const text = input.text.trim().slice(0, MEMO_MAX);
  if (!text) throw new Error("メモが空です");
  return [...memos, { id, month: input.month, text, done: false, createdAt: now }];
}

export function setMemoDone(memos: KeiriMemo[], id: string, done: boolean, now: string): KeiriMemo[] {
  if (!memos.some((m) => m.id === id)) throw new Error("メモが見つかりません");
  return memos.map((m) => {
    if (m.id !== id) return m;
    if (done) return { ...m, done: true, doneAt: now };
    return { id: m.id, month: m.month, text: m.text, done: false, createdAt: m.createdAt };
  });
}

export function removeMemo(memos: KeiriMemo[], id: string): KeiriMemo[] {
  return memos.filter((m) => m.id !== id);
}
