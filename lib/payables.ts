// 「払うものリスト」のデータ型と取得ロジック。
// freee接続済み（KVにトークンあり）→ freeeの役員借入金(取引先別)からライブ生成。
// 未接続 → 2026-06-28 時点のスナップショットにフォールバック。

import {
  FREEE_COMPANY_ID,
  freeeGet,
  isConnected,
} from "@/lib/freee";

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
const FISCAL_YEAR = "2026";

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

type TrialBs = {
  trial_bs: {
    balances: Array<{
      account_item_id?: number;
      closing_balance?: number;
    }>;
  };
};

type Partner = { id: number; name: string };

function todayJst(): string {
  // YYYY-MM-DD（JST）。Date.now()は使用可。
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

async function yakuinBalance(partnerId?: number): Promise<number> {
  const q: Record<string, string> = {
    company_id: FREEE_COMPANY_ID,
    fiscal_year: FISCAL_YEAR,
  };
  if (partnerId) q.partner_id = String(partnerId);
  const r = await freeeGet<TrialBs>("/api/1/reports/trial_bs", q);
  const row = r.trial_bs.balances.find(
    (b) => b.account_item_id === YAKUIN_KARIIRE,
  );
  return row?.closing_balance ?? 0;
}

async function livePayables(): Promise<PayablesResult> {
  const total = await yakuinBalance();

  const { partners } = await freeeGet<{ partners: Partner[] }>(
    "/api/1/partners",
    { company_id: FREEE_COMPANY_ID, limit: "100" },
  );

  const payables: Payable[] = [];
  let assigned = 0;
  for (const p of partners) {
    const bal = await yakuinBalance(p.id);
    if (bal > 0) {
      assigned += bal;
      payables.push({
        id: `partner-${p.id}`,
        payee: p.name,
        amount: bal,
        description: "立替（役員借入金）",
        account: "役員借入金",
        hasPartner: true,
      });
    }
  }

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

export async function getPayables(): Promise<PayablesResult> {
  try {
    if (await isConnected()) {
      return await livePayables();
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
