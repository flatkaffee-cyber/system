// 経理の毎日のお知らせ（坂本さんの LINE）の文面。
// 明細の消込などの決まった作業は Claude が毎朝やるので、ここに出すのは坂本さんにしかできないことだけ。
// 何も頼むことが無い日は null（送らない）。
// 純粋な関数。実行時に他のファイルを import しない（テストから .ts 付きで読むため）。

export type RemindInput = {
  today: string; // YYYY-MM-DD（JST）
  base: string; // システムの URL
  /** Claude が片付けられずに残った未処理の銀行明細 */
  unprocessed: { date: string; amount: number; description: string }[];
  /** レシートが無いまま「詳細未登録」で記帳した支払い */
  noReceipt: { date: string; amount: number; partner: string }[];
  /** 保存したのに freee に入っていない立替レシート */
  unregisteredAdvances: { date: string; amount: number; payer: string; vendor: string }[];
  /** 返済日の前（1〜5日）だけ。人ごとの次の返済 */
  repay?: {
    date: string;
    items: { person: string; amount: number }[];
    /** 銀行の残高から役員報酬と業務委託費を引いた見込み。分からなければ null */
    afterPayroll: number | null;
    prepayThreshold: number;
  };
};

const yen = (n: number) => `¥${n.toLocaleString()}`;
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

function listed<T>(rows: T[], line: (r: T) => string, max = 8): string[] {
  const out = rows.slice(0, max).map(line);
  if (rows.length > max) out.push(`ほか${rows.length - max}件`);
  return out;
}

export function buildRemindMessage(x: RemindInput): string | null {
  const parts: string[] = [];

  if (x.noReceipt.length > 0) {
    parts.push(
      "",
      `■ レシートが無い支払い ${x.noReceipt.length}件`,
      "レシートか注文履歴があれば「🧾 領収書」から取り込んでください",
      ...listed(x.noReceipt, (r) => `・${md(r.date)} ${r.partner} ${yen(r.amount)}`),
      `${x.base}/ryoshusho`,
    );
  }
  if (x.unregisteredAdvances.length > 0) {
    parts.push(
      "",
      `■ freee に入っていない立替レシート ${x.unregisteredAdvances.length}件`,
      ...listed(x.unregisteredAdvances, (r) => `・${md(r.date)} ${r.payer} ${r.vendor} ${yen(r.amount)}`),
      `${x.base}/receipts`,
    );
  }
  if (x.unprocessed.length > 0) {
    parts.push(
      "",
      `■ 判断が要る銀行明細 ${x.unprocessed.length}件`,
      ...listed(x.unprocessed, (t) => `・${md(t.date)} ${yen(t.amount)} ${t.description.slice(0, 18)}`, 5),
      `${x.base}/meisai`,
    );
  }
  if (x.repay && x.repay.items.length > 0) {
    const total = x.repay.items.reduce((s, i) => s + i.amount, 0);
    const lines = [
      "",
      `■ ${md(x.repay.date)} の立替の返済 ${yen(total)}`,
      ...x.repay.items.map((i) => `・${i.person} ${yen(i.amount)}`),
    ];
    const a = x.repay.afterPayroll;
    if (a != null) {
      lines.push(
        `役員報酬と業務委託費を払ったあとの口座の見込み ${yen(a)}`,
        a >= x.repay.prepayThreshold
          ? `${yen(x.repay.prepayThreshold)}以上残るので、前倒しで多めに返せます。いくら返すか決めてください`
          : "前倒しはせず、いつもの額で返す月です",
      );
    }
    lines.push(`${x.base}/kariire`);
    parts.push(...lines);
  }

  if (parts.length === 0) return null;
  return ["【flat. 経理】坂本さんに頼みたいこと", ...parts].join("\n");
}
