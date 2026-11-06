// 会社情報。住所・法人番号・口座など、書類を書くときや役所・銀行で聞かれたときに見るもの。
// 最初から分かっているものは DEFAULTS に入れておき、画面で足したり直したりした分はKVに入る。
// （KVに入った値が優先。空にしたら DEFAULTS に戻る）

const KEY = "company:info";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type InfoField = { key: string; label: string; hint?: string };
export type InfoGroup = { title: string; fields: InfoField[] };

/** 画面に出す項目と並び順 */
export const GROUPS: InfoGroup[] = [
  {
    title: "法人",
    fields: [
      { key: "legalName", label: "商号" },
      { key: "legalNameKana", label: "商号（フリガナ）" },
      { key: "corporateNumber", label: "法人番号（13桁）", hint: "登記事項証明書・国税庁の法人番号公表サイトに載っている" },
      { key: "invoiceNumber", label: "インボイス登録番号", hint: "T＋13桁。未登録なら空のまま" },
      { key: "representative", label: "代表者" },
      { key: "established", label: "設立日" },
      { key: "capital", label: "資本金" },
      { key: "fiscalYear", label: "事業年度" },
      { key: "business", label: "目的（定款 第2条）" },
      { key: "publicNotice", label: "公告方法" },
    ],
  },
  {
    title: "社員・出資（定款 第6条・第8条）",
    fields: [
      { key: "members", label: "社員と出資額" },
      { key: "executives", label: "業務執行社員" },
      { key: "articlesDate", label: "定款の作成日" },
    ],
  },
  {
    title: "所在地・連絡先",
    fields: [
      { key: "postalCode", label: "郵便番号" },
      { key: "address", label: "本店所在地" },
      { key: "addressKana", label: "本店所在地（フリガナ）" },
      { key: "tel", label: "電話番号（店）" },
      { key: "email", label: "メール" },
      { key: "website", label: "ウェブサイト" },
    ],
  },
  {
    title: "店舗",
    fields: [
      { key: "shopName", label: "屋号" },
      { key: "opened", label: "開業日" },
      { key: "foodLicense", label: "飲食店営業許可番号" },
      { key: "foodHygieneManager", label: "食品衛生責任者" },
    ],
  },
  {
    title: "口座・税務",
    fields: [
      { key: "bank", label: "法人口座" },
      { key: "taxOffice", label: "所轄の税務署" },
      { key: "pensionOffice", label: "所轄の年金事務所" },
    ],
  },
];

/** 最初から分かっているもの。分からないものは入れない（画面で空欄として出る） */
export const DEFAULTS: Record<string, string> = {
  legalName: "合同会社flat.",
  representative: "代表社員 坂本 達郎",
  established: "2026年6月9日",
  capital: "300万円",
  fiscalYear: "6月1日〜翌年5月31日",
  // 2026-11-06 定款（令和8年5月30日作成）から
  business:
    "(1) 飲食店及び喫茶店の経営\n" +
    "(2) 菓子、パン及び惣菜の製造及び販売\n" +
    "(3) コーヒー豆、食品及び雑貨の販売\n" +
    "(4) 各種教室、スクール及びセミナーの企画及び運営\n" +
    "(5) イベントの企画及び運営\n" +
    "(6) 料理の仕出し及びケータリングサービス\n" +
    "(7) 前各号に附帯関連する一切の事業",
  publicNotice: "官報に掲載して行う",
  members:
    "坂本 達郎 80万円\n" +
    "國仲 杏 85万円\n" +
    "櫻井 勘吉 85万円\n" +
    "町田 創 50万円\n" +
    "（全員 有限責任社員・合計300万円）",
  executives: "坂本 達郎・町田 創",
  articlesDate: "2026年5月30日（令和8年）",
  postalCode: "522-0081",
  address: "滋賀県彦根市京町二丁目3番1号",
  tel: "0749-46-5355",
  email: "flat.kaffee@gmail.com",
  shopName: "CAFE & BAR flat.",
  opened: "2026年8月8日",
  bank: "GMOあおぞらネット銀行 フリー支店（125）普通 ***5680",
  taxOffice: "彦根税務署",
};

export async function getCompanyInfo(): Promise<Record<string, string>> {
  const store = await kv();
  const saved = store ? (await store.get<Record<string, string>>(KEY)) ?? {} : {};
  const out: Record<string, string> = { ...DEFAULTS };
  for (const [k, v] of Object.entries(saved)) if (v) out[k] = v;
  return out;
}

/** 画面で直した値を保存する。DEFAULTS と同じ値・空の値は持たない */
export async function saveCompanyInfo(values: Record<string, string>): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  const known = new Set(GROUPS.flatMap((g) => g.fields.map((f) => f.key)));
  const diff: Record<string, string> = {};
  for (const [k, raw] of Object.entries(values)) {
    const v = (raw ?? "").trim();
    if (known.has(k) && v && v !== DEFAULTS[k]) diff[k] = v;
  }
  await store.set(KEY, diff);
}
