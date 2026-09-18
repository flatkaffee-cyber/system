// 店の基本情報。お客さんに出す文章はここから組み立てる。
//
// 同じことを何箇所にも書くと、営業時間を変えたときに直し漏れる。
// LINEのあいさつ・サイト・構造化データ・Googleビジネスプロフィールで
// 表記を揃えるためにも、ここを唯一の出どころにする。
//
// 店名・住所・電話番号は、外部サービスと一字一句同じにすること。
// 表記が割れるとGoogleに別の店と判断されることがある。

export const SHOP = {
  name: "flat.",
  legalName: "合同会社flat.",
  tagline: "CAFE & BAR flat.",
  postalCode: "522-0081",
  address: "滋賀県彦根市京町二丁目3-1",
  tel: "080-4239-6023",
  /**
   * 営業時間。18:00〜19:00は夜の準備で一度閉める（中休み）。
   * lib/shift.ts の IDLE_WINDOWS と、締めチェックの「19時からのオープン前準備」に対応する。
   */
  hours: [
    { label: "カフェ", from: "10:00", to: "18:00" },
    { label: "バー", from: "19:00", to: "24:30" },
  ],
  lastOrder: "23:30",
  /** 定休日（0=日 … 6=土） */
  closedWeekday: 2,
  closedLabel: "火曜",
  /** 初めての人に一言で伝える紹介文 */
  intro:
    "彦根城のふもと、京町のカフェ＆バーです。\n" +
    "昼はコーヒーとワッフル、夜はお酒も出しています。",
} as const;

/** 営業時間の表記。中休みがあるので2行になる */
export function hoursLines(): string[] {
  return [
    ...SHOP.hours.map((h) => `${h.label} ${h.from}〜${h.to}`),
    `（ラストオーダー ${SHOP.lastOrder}）`,
  ];
}
