// サイト一覧（/sites）の並べ方。データは契約（lib/contracts.ts）の管理ページのURL・ログインIDをそのまま使う。
// 純粋な関数。実行時に他のファイルを import しない（テストから .ts 付きで読むため）。

/** 見出しの並び。ここに無い種類は、契約の種類の順で後ろに続く */
export const SITE_KINDS = ["会計・銀行", "売上・決済", "光熱・通信", "店舗賃貸借", "集客・SNS"];

export type SiteRow = {
  kind: string;
  portalUrl?: string;
  loginId?: string;
  active: boolean;
  startDate?: string;
  monthlyAmount?: number;
  notes?: string;
};

/** 使っている契約のうち、URLかログインIDがあるものを種類ごとに束ねる */
export function groupSites<T extends SiteRow>(list: T[], contractKinds: readonly string[]): { kind: string; sites: T[] }[] {
  const order = [...SITE_KINDS, ...contractKinds.filter((k) => !SITE_KINDS.includes(k))];
  const kindOf = (c: T) => (order.includes(c.kind) ? c.kind : "その他");
  const sites = list.filter((c) => c.active && (c.portalUrl || c.loginId));
  return order
    .map((kind) => ({ kind, sites: sites.filter((c) => kindOf(c) === kind) }))
    .filter((g) => g.sites.length > 0);
}

/** 契約の中身が無い、サイトだけの登録か。契約書や金額のあるものはここから消させない */
export const isSiteOnly = (c: SiteRow) => !c.startDate && !c.monthlyAmount && !c.notes;
