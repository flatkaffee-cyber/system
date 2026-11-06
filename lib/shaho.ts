// 社会保険料（健康保険・厚生年金・子ども子育て拠出金）の納付。
// 年金事務所から届く「納入告知書」の中身をそのまま持つ。会社負担と本人負担を合わせた額。
// 前月分を、毎月末（土日祝なら翌営業日）までに納める。Pay-easy なら銀行のネットバンキングから払える。

/** 事業所の情報。会社情報タブにも同じものを出す */
export const SHAHO_OFFICE = {
  office: "彦根年金事務所",
  /** 事業所整理記号 */
  seiriKigou: "02-ヘヤ",
  /** 事業所番号 */
  officeNumber: "04091",
  /** Pay-easy の収納機関番号（年金事務所の納付は全国共通） */
  payeasyBiller: "00500",
};

export type ShahoNotice = {
  /** 何月分の保険料か（YYYY-MM） */
  month: string;
  /** 納付期限 */
  due: string;
  health: number; // 健康保険料
  pension: number; // 厚生年金保険料
  child: number; // 子ども・子育て拠出金
  /** Pay-easy の納付番号・確認番号（告知書ごとに変わる） */
  payNumber: string;
  confirmNumber: string;
  /** 納めた日。分からなければ空 */
  paidOn?: string;
  note?: string;
};

export const NOTICES: ShahoNotice[] = [
  {
    // 2026-11-06 坂本さんが告知書（令和8年9月分・告知書の発行日 11/5）を共有
    month: "2026-09",
    due: "2026-11-02",
    health: 17591,
    pension: 48312,
    child: 950,
    payNumber: "1226530300007189",
    confirmNumber: "149374",
    note: "告知書の発行日（11/5）が納付期限（11/2）より後。期限を過ぎていても告知書で納められる。延滞金がかかる場合は後日通知が来る",
  },
];

export const totalOf = (n: ShahoNotice) => n.health + n.pension + n.child;
