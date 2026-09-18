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
  /** 営業時間（通常）。lib/shift.ts の OPEN_MIN / CLOSE_MIN と揃える */
  open: "10:00",
  close: "24:30",
  lastOrder: "23:30",
  /** 定休日（0=日 … 6=土） */
  closedWeekday: 2,
  closedLabel: "火曜",
  /** 初めての人に一言で伝える紹介文 */
  intro:
    "彦根城のふもと、京町のカフェ＆バーです。\n" +
    "昼はコーヒーとワッフル、夜はお酒も出しています。",
} as const;

/** 営業時間の1行表記 */
export function hoursLine(): string {
  return `${SHOP.open}〜${SHOP.close}（ラストオーダー ${SHOP.lastOrder}）`;
}
