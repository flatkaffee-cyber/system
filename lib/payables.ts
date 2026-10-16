// 「払うものリスト」のデータ型と取得ロジック。
// freee の役員借入金（取引先別）から作る。読む先は Supabase の写し（まだ無ければ freee から直接）。
// どちらも読めなければ 2026-06-28 時点のスナップショットにフォールバック。

import { isConnected } from "@/lib/freee";
import { pickSource, type FreeeSource } from "@/lib/freeeMirror/source";
import { payablesFromTrialBs } from "@/lib/keiri/payables";
import { jstMonth, periodOf } from "@/lib/keiri/period";

export type Payable = {
  id: string;
  payee: string; // 誰に/どこに。未設定なら "（取引先未設定）"
  amount: number;
  description: string;
  account: string;
  hasPartner: boolean;
};

export type PayablesResult = {
  payables: Payable[];
  total: number;
  source: "live" | "snapshot";
  updatedAt: string;
};

const YAKUIN_KARIIRE = 1035440156; // 役員借入金

// 未接続時のスナップショット（2026-06-28 / 残高313,359）
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

function todayJst(): string {
  // YYYY-MM-DD（JST）。Date.now()は使用可。
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function livePayables(src: FreeeSource): Promise<PayablesResult> {
  // 取引先の内訳つきの試算表を1回で取る（前は取引先ごとに freee に聞いていた）
  const bs = await src.trialBsPartner(periodOf(jstMonth()).fiscalYear);
  if (!bs) throw new Error("今期の試算表がありません");
  const { total, byPartner } = payablesFromTrialBs(bs.trial_bs.balances, YAKUIN_KARIIRE);

  const payables: Payable[] = byPartner.map((p) => ({
    id: `partner-${p.id}`,
    payee: p.name,
    amount: p.amount,
    description: "立替（役員借入金）",
    account: "役員借入金",
    hasPartner: true,
  }));
  const assigned = byPartner.reduce((s, p) => s + p.amount, 0);

  const unassigned = total - assigned;
  if (unassigned > 0) {
    payables.push({
      id: "unassigned",
      payee: "（取引先未設定）",
      amount: unassigned,
      description: "取引先が設定されていない立替（設立費ほか）",
      account: "役員借入金",
      hasPartner: false,
    });
  }

  return { payables, total, source: "live", updatedAt: todayJst() };
}

export async function getPayables(src?: FreeeSource): Promise<PayablesResult> {
  try {
    const s = src ?? (await pickSource());
    if (s.kind === "db" || (await isConnected())) {
      return await livePayables(s);
    }
  } catch {
    // ライブ取得に失敗したらスナップショットにフォールバック
  }
  return {
    payables: SNAPSHOT,
    total: SNAPSHOT.reduce((s, p) => s + p.amount, 0),
    source: "snapshot",
    updatedAt: "2026-06-28",
  };
}
