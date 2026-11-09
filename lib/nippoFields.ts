// 日報のテンプレート（欄）。画面（クライアント）からも読むので、KVを使うコードとは分けて置く。
// 2026-11-09 町田さんの日報（販売個数・お客さんの様子・困ったこと・提案）の形に合わせた（坂本さん）

export type NippoKey = "sales" | "guests" | "trouble" | "other";

export const NIPPO_FIELDS: { key: NippoKey; label: string; hint: string; rows: number }[] = [
  { key: "sales", label: "販売個数", hint: "クラシックメルト 1\nプレーンワッフル 3\n（「売れた数を入れる」でレジから入ります）", rows: 5 },
  { key: "guests", label: "お客さんの様子", hint: "何時ごろ・どんなお客さん・何を頼んだか・言われたこと", rows: 5 },
  { key: "trouble", label: "困ったこと・気になったこと", hint: "機械の調子、足りなかったもの、壊れたものなど", rows: 3 },
  { key: "other", label: "その他・提案・次の人へ", hint: "やってみたこと、こうしたらいいと思ったこと、引き継ぎ", rows: 3 },
];
