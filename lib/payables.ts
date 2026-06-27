// 「払うものリスト」のデータ型と取得ロジック。
// 現状: freeeアプリ未登録のため、サーバーから直接freeeを叩けない。
//   → いまは 2026-06-28 時点の freee 実データのスナップショットを返す。
// 将来: FREEE_CLIENT_ID 等が設定されたら getPayables() を freee API 参照に差し替える。
//   - 役員借入金(取引先別) … メンバーへ返す立替
//   - 未払金(取引先別)     … 業者へ払う分
//   - 未決済の取引          … まだ払っていない取引

export type Payable = {
  id: string;
  payee: string; // 誰に/どこに（取引先）。未設定なら "（取引先未設定）"
  amount: number; // 残額（円）
  description: string; // 何の分か
  account: string; // freeeの勘定科目
  /** freeeの取引先が設定されているか（人別集計できるか） */
  hasPartner: boolean;
};

export type PayablesResult = {
  payables: Payable[];
  total: number;
  /** データの鮮度。live=freee直結 / snapshot=手動スナップショット */
  source: "live" | "snapshot";
  updatedAt: string; // YYYY-MM-DD
};

// 2026-06-28 時点の freee 役員借入金スナップショット（残高 313,359）
const SNAPSHOT: Payable[] = [
  {
    id: "sakamoto-espresso",
    payee: "坂本",
    amount: 250000,
    description: "エスプレッソマシン Simonelli Oscar II（メルカリ）立替",
    account: "役員借入金",
    hasPartner: true,
  },
  {
    id: "founding-cost",
    payee: "（取引先未設定）",
    amount: 63359,
    description: "設立費ほか立替（取引先を設定すると人別に分かれます）",
    account: "役員借入金",
    hasPartner: false,
  },
];

export async function getPayables(): Promise<PayablesResult> {
  // TODO(freee連携): FREEE_CLIENT_ID/SECRET/REFRESH_TOKEN が揃ったら
  //   freeeの試算表(役員借入金・未払金)や未決済取引から動的に組み立てる。
  const payables = SNAPSHOT;
  return {
    payables,
    total: payables.reduce((s, p) => s + p.amount, 0),
    source: "snapshot",
    updatedAt: "2026-06-28",
  };
}
