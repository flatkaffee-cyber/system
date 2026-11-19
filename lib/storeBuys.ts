// 店で買って、領収書で登録した仕入れ（2026-11-19 坂本さん）
// 仕入れ表ではネットで買う予定の物（コロナ＝リカマンオンライン など）でも、
// 酒屋やスーパーで買って領収書を登録したら、それで「仕入れた」とみなす。
// ・在庫確認の日以降の領収書だけ数える（前に買った分と取り違えないため）
// ・店で買った物は手元にあるので「発注済み」ではなく「届いた」と同じ扱い
// ・数は領収書の品名（「4コ×単368」など）から読む。読めなければ1にして、画面で直せる

import { getReceipts, receiptLines } from "@/lib/receipts";
import { isPurchaseOf, type Item } from "@/lib/stockroom";

const QTY_KEY = "stockroom:storeBuyQty";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type StoreBuy = {
  /** 最後に買った日 */
  date: string;
  /** 買った店（領収書の店名） */
  vendor: string;
  /** 領収書の書き方 */
  line: string;
  /** 買った数 */
  qty: number;
  /** 数を領収書から読めず、1にしたもの */
  qtyGuessed: boolean;
  /** 画面で数を直したもの */
  qtyEdited: boolean;
};

/**
 * 領収書の品名から買った数を読む。
 * 「ツナ缶 4コ×単98」「ココナッツミルク 3コ×158」「大葉 2個」「スポンジ ×3」。
 * 「330ml瓶×24本」のような入り数は数えない（1ケースとして1）。
 */
export function parseQty(lineName: string): number | null {
  const s = lineName.normalize("NFKC");
  const a = s.match(/(\d+)\s*[コ個点]\s*[×xX＊*]/);
  if (a) return Number(a[1]);
  const b = s.match(/(\d+)\s*[コ個点]\s*$/);
  if (b) return Number(b[1]);
  const c = s.match(/[×xX＊*]\s*(\d+)\s*$/);
  if (c && !/ml|g|L|本入|入り/i.test(s.slice(0, c.index))) return Number(c[1]);
  return null;
}

const qtyKey = (since: string, itemId: string) => `${since}:${itemId}`;

export async function setStoreBuyQty(since: string, itemId: string, qty: number | null): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  if (qty === null) await store.hdel(QTY_KEY, qtyKey(since, itemId));
  else await store.hset(QTY_KEY, { [qtyKey(since, itemId)]: Math.max(0, Math.round(qty)) });
}

/** since（在庫確認の日）以降の領収書で、品目ごとに店で買った物をまとめる */
export async function getStoreBuys(items: Item[], since: string): Promise<Record<string, StoreBuy>> {
  const out: Record<string, StoreBuy & { guessedAny: boolean }> = {};
  const receipts = (await getReceipts()).filter((r) => r.date && r.date >= since);
  for (const r of receipts) {
    for (const l of receiptLines(r)) {
      if (!l.name) continue;
      for (const i of items) {
        if (i.madeInHouse || !isPurchaseOf(i, l.name)) continue;
        const q = parseQty(l.name);
        const prev = out[i.id];
        const next = {
          date: !prev || r.date > prev.date ? r.date : prev.date,
          vendor: !prev || r.date >= prev.date ? r.vendor || "" : prev.vendor,
          line: !prev || r.date >= prev.date ? l.name : prev.line,
          qty: (prev?.qty ?? 0) + (q ?? 1),
          qtyGuessed: false,
          qtyEdited: false,
          guessedAny: (prev?.guessedAny ?? false) || q === null,
        };
        out[i.id] = next;
      }
    }
  }
  let edited: Record<string, number> = {};
  try {
    const store = await kv();
    edited = (store ? await store.hgetall<Record<string, number>>(QTY_KEY) : null) ?? {};
  } catch {
    /* 直した数が読めなくても、領収書の数で出す */
  }
  const res: Record<string, StoreBuy> = {};
  for (const [id, b] of Object.entries(out)) {
    const e = edited[qtyKey(since, id)];
    res[id] = {
      date: b.date, vendor: b.vendor, line: b.line,
      qty: e !== undefined && e !== null ? Number(e) : b.qty,
      qtyGuessed: e === undefined || e === null ? b.guessedAny : false,
      qtyEdited: e !== undefined && e !== null,
    };
  }
  return res;
}
