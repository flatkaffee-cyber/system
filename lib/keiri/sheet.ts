// 月次の表（経理で見る）の組み立て。入金・出金の行を区切りに分け、小計と合計を出し、絞り込む。
// 画面（components/keiri/KeiriSheet.tsx・KeiriMonthly.tsx）から使う純粋な関数。
// 実行時に他のファイルを import しない（テストから .ts 付きで読むため。型だけ import type）。
import type { CashRow, CashView } from "./types";

export type Side = "in" | "out";
export type SectionKey = "in" | "card" | "bank" | "cash" | "tatekae" | "move";
export const SECTION_ORDER: readonly SectionKey[] = ["in", "card", "bank", "cash", "tatekae", "move"];
export const SECTION_LABEL: Record<SectionKey, string> = {
  in: "入金",
  card: "カード",
  bank: "銀行",
  cash: "現金",
  tatekae: "立替",
  move: "移動",
};

export type SheetRow = CashRow & { side: Side };
export type SheetSection = { key: SectionKey; label: string; rows: SheetRow[]; inSum: number; outSum: number };
export type SheetTotals = { in: number; out: number; net: number };
export type Sheet = { sections: SheetSection[]; totals: SheetTotals };
export type SheetFilter = { query: string; missingOnly: boolean; todoOnly: boolean };
export const NO_FILTER: SheetFilter = { query: "", missingOnly: false, todoOnly: false };

export function sectionOf(row: CashRow, side: Side): SectionKey {
  if (row.kind === "move") return "move";
  if (side === "in") return "in";
  return row.tag ?? "bank";
}

/** 全角・半角と大文字・小文字の違いを無くす（freeeの明細は「ＡＭＡＺＯＮ．ＣＯ．ＪＰ」のように全角で来る） */
const norm = (s: string) => s.normalize("NFKC").toLowerCase();

export function matchesFilter(row: CashRow, filter: SheetFilter, note = ""): boolean {
  if (filter.missingOnly && row.receiptStatus !== "missing" && row.receiptStatus !== "missing-recorded") return false;
  if (filter.todoOnly && row.status === "done") return false;
  const q = norm(filter.query.trim());
  if (!q) return true;
  return [row.partner ?? "", row.title, row.account, row.description, note].some((s) => norm(s).includes(q));
}

const byDate = (a: SheetRow, b: SheetRow) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key);
const total = (rows: SheetRow[], side: Side) => rows.filter((r) => r.side === side).reduce((s, r) => s + r.amount, 0);

/** notes: 行の key → 行に付けたメモ（検索の対象にする） */
export function buildSheet(
  view: Pick<CashView, "inflows" | "outflows">,
  filter: SheetFilter,
  notes: Record<string, string> = {},
): Sheet {
  const rows: SheetRow[] = [
    ...view.inflows.map((r) => ({ ...r, side: "in" as const })),
    ...view.outflows.map((r) => ({ ...r, side: "out" as const })),
  ].filter((r) => matchesFilter(r, filter, notes[r.key]));

  const sections: SheetSection[] = [];
  for (const key of SECTION_ORDER) {
    const list = rows.filter((r) => sectionOf(r, r.side) === key).sort(byDate);
    if (list.length === 0) continue;
    sections.push({ key, label: SECTION_LABEL[key], rows: list, inSum: total(list, "in"), outSum: total(list, "out") });
  }

  // 移動（口座⇄現金）は合計に入れない
  const counted = rows.filter((r) => r.kind !== "move");
  const inSum = total(counted, "in");
  const outSum = total(counted, "out");
  return { sections, totals: { in: inSum, out: outSum, net: inSum - outSum } };
}

/** 行のキー操作で開閉するか。行そのものにフォーカスがあるときの Enter と Space だけ（中のボタンやリンクの Enter は、そちらに任せる） */
export function rowKeyToggles(key: string, fromRow: boolean): boolean {
  return fromRow && (key === "Enter" || key === " ");
}

/** 月のタブの最初の月（会計年度の初め・会社設立の月） */
export const FIRST_MONTH = "2026-06";

/** 月のタブに出す月。first から thisMonth まで、新しい月が先 */
export function monthTabs(thisMonth: string, first: string = FIRST_MONTH): string[] {
  const out: string[] = [];
  let y = Number(thisMonth.slice(0, 4));
  let m = Number(thisMonth.slice(5, 7));
  // 万一 first が先の月でも止まるように、20年分で打ち切る
  for (let i = 0; i < 240; i++) {
    const s = `${y}-${String(m).padStart(2, "0")}`;
    if (s < first) break;
    out.push(s);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}
