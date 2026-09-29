// クラウドファンディングの支援者と、チケットの引き換え状況（Vercel KV）。
//
// CAMPFIREの支援者リスト（CSV）をそのまま貼って取り込む。
// リターン内容から「コーヒーチケット何杯分か」を読み取り、同じメールアドレスの
// 支援はまとめて1人にする（複数口の支援があるため）。
//
// メールは flat.kaffee@gmail.com（Google連携中のアカウント）から送る。
// 誰に送ったか・誰に渡したかを残すのは、二重に送ったり二重に渡したりしないため。
// メールは転送もスクリーンショットもできるので、口頭確認だけでは防げない。

const KEY = "supporters:list";

async function kv() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { createClient } = await import("@vercel/kv");
  return createClient({ url, token });
}

export type Supporter = {
  id: string;
  name: string;
  email: string;
  /** 支援したリターン名（複数口なら並べる） */
  course?: string;
  /** コーヒーチケットの杯数 */
  tickets: number;
  /** ホットサンド＋コーヒーセットの食数。コーヒー単体の券とは別物 */
  sets: number;
  sentAt?: string;
  sendError?: string;
  /** 店頭で紙の回数券を渡した日時 */
  redeemedAt?: string;
  note?: string;
  createdAt: string;
};

export async function getSupporters(): Promise<Supporter[]> {
  const store = await kv();
  if (!store) return [];
  const list = (await store.get<Supporter[]>(KEY)) ?? [];
  return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function save(list: Supporter[]): Promise<void> {
  const store = await kv();
  if (!store) throw new Error("KV未設定");
  await store.set(KEY, list);
}

export async function updateSupporter(
  id: string,
  patch: Partial<Supporter>,
): Promise<Supporter | null> {
  const list = await getSupporters();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id: list[i].id };
  await save(list);
  return list[i];
}

export async function removeSupporter(id: string): Promise<void> {
  const list = await getSupporters();
  await save(list.filter((s) => s.id !== id));
}

const newId = () => `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

/**
 * CSVを表に開く。CAMPFIREのCSVはリターン内容やコメントの中に改行が入るので、
 * 行で切る前に引用符の中かどうかを見る必要がある。
 */
function parseTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const src = text.replace(/\r\n/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      cur = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * リターン内容から、渡すものを読み取る。
 * 文言はCAMPFIREのリターン説明そのままなので、特徴のある言葉で見る。
 */
export function rewardOf(text: string): { cups: number; sets: number } {
  const t = text.replace(/\s/g, "");
  if (t.includes("ホットサンド+コーヒーセット")) return { cups: 0, sets: 5 };
  if (t.includes("コーヒーチケット5,000円分") || t.includes("5杯分")) return { cups: 5, sets: 0 };
  if (t.includes("コーヒーチケット（1杯分）") || t.includes("コーヒーチケット(1杯分)")) {
    return { cups: 1, sets: 0 };
  }
  return { cups: 0, sets: 0 };
}

/** 渡すものを日本語1行にする。メール本文に差し込む */
export function rewardLabel(s: Pick<Supporter, "tickets" | "sets">): string {
  const parts: string[] = [];
  if (s.tickets > 0) parts.push(`コーヒーチケット ${s.tickets}杯分`);
  if (s.sets > 0) parts.push(`ホットサンド＋コーヒーセット ${s.sets}食分`);
  return parts.join("　／　");
}

export type ParsedRow = {
  name: string;
  email: string;
  course: string;
  cups: number;
  sets: number;
};

/** user_1ffa13f27934 や 97361e884e64 のような自動生成のIDは名前として使わない */
const isHandle = (v: string) => /^user_[0-9a-f]{8,}$/i.test(v) || /^[0-9a-f]{10,}$/i.test(v);

/** 備考欄は名前を書く欄だが、応援コメントが入っていることが多い */
function bikoAsName(v: string): string {
  const first = v.split("\n")[0].trim();
  if (!first || first.length > 12) return "";
  if (/[！!？?。♪★☺️🙇]/.test(first)) return "";
  if (/(チケット|コーヒー|応援|頑張|おめでと)/.test(first)) return "";
  return first;
}

/**
 * 呼びかけに使う名前。発送のないリターンは氏名が空なので、
 * 備考のお名前 → 支援者名 の順で拾う。どれも使えなければ「ご支援者」。
 */
export function pickName(shimei: string, biko: string, user: string): string {
  if (shimei.trim()) return shimei.trim();
  const b = bikoAsName(biko);
  if (b) return b;
  const u = user.trim();
  if (u && !isHandle(u)) return u;
  return "ご支援者";
}

const findCol = (header: string[], words: string[]) =>
  header.findIndex((h) => words.some((w) => h.replace(/\s/g, "").includes(w)));

/**
 * CSVを読む。CAMPFIREの見出し（氏名・メールアドレス・リターン内容・数量）を使い、
 * 見出しが違う形式でも「@を含む列＝メール」で拾えるようにしておく。
 */
export function parseCsv(text: string): { rows: ParsedRow[]; skipped: number } {
  const table = parseTable(text);
  if (table.length === 0) return { rows: [], skipped: 0 };

  const head = table[0].map((h) => h.trim());
  const hasHeader = !head.some((c) => EMAIL_RE.test(c.trim()));
  const iMail = hasHeader ? findCol(head, ["メールアドレス", "メール", "mail"]) : -1;
  const iName = hasHeader ? findCol(head, ["氏名", "名前", "name"]) : -1;
  const iBiko = hasHeader ? findCol(head, ["備考"]) : -1;
  const iUser = hasHeader ? findCol(head, ["支援者"]) : -1;
  const iReward = hasHeader ? findCol(head, ["リターン内容"]) : -1;
  const iQty = hasHeader ? findCol(head, ["数量"]) : -1;

  const rows: ParsedRow[] = [];
  let skipped = 0;
  for (const c of table.slice(hasHeader ? 1 : 0)) {
    const cell = (i: number) => (i >= 0 ? (c[i] ?? "").trim() : "");
    const email = (iMail >= 0 ? cell(iMail) : (c.find((v) => EMAIL_RE.test(v.trim())) ?? "")).trim();
    if (!EMAIL_RE.test(email)) {
      skipped++;
      continue;
    }
    const reward = cell(iReward);
    const { cups, sets } = rewardOf(reward);
    const qty = Math.max(1, Number(cell(iQty)) || 1);
    const name = pickName(cell(iName), cell(iBiko), cell(iUser));
    rows.push({
      name,
      email: email.toLowerCase(),
      course: reward.split("\n")[0].trim(),
      cups: cups * qty,
      sets: sets * qty,
    });
  }
  return { rows, skipped };
}

/**
 * 取り込み。同じメールアドレスの支援はまとめて1人にする。
 * すでに入っている人は枚数だけ足し直し、送信済み・お渡し済みの記録は消さない。
 */
export async function importSupporters(
  rows: ParsedRow[],
  opts: { ticketsOnly: boolean },
): Promise<{ added: number; updated: number; skippedNoTicket: number }> {
  const merged = new Map<string, ParsedRow>();
  let skippedNoTicket = 0;
  for (const r of rows) {
    if (opts.ticketsOnly && r.cups === 0 && r.sets === 0) {
      skippedNoTicket++;
      continue;
    }
    const cur = merged.get(r.email);
    if (!cur) {
      merged.set(r.email, { ...r });
      continue;
    }
    cur.cups += r.cups;
    cur.sets += r.sets;
    // 名前は、空でない・より具体的なほうを残す
    if (!cur.name || (r.name && r.name.length > cur.name.length)) cur.name = r.name;
    if (r.course && !cur.course.includes(r.course)) cur.course = `${cur.course}／${r.course}`;
  }

  const list = await getSupporters();
  let added = 0;
  let updated = 0;
  for (const r of merged.values()) {
    const i = list.findIndex((s) => s.email === r.email);
    if (i >= 0) {
      list[i] = { ...list[i], name: r.name || list[i].name, course: r.course, tickets: r.cups, sets: r.sets };
      updated++;
    } else {
      list.push({
        id: newId(),
        name: r.name,
        email: r.email,
        course: r.course,
        tickets: r.cups,
        sets: r.sets,
        createdAt: new Date().toISOString(),
      });
      added++;
    }
  }
  await save(list);
  return { added, updated, skippedNoTicket };
}

/** リターンごとに要る但し書き。セットの人にだけ出す */
export function rewardNotes(s: Pick<Supporter, "sets">): string {
  return s.sets > 0
    ? "・ホットサンド＋コーヒーは、セットでのご注文をお願いします"
    : "";
}

/** 文面の差し込み */
export function fillTemplate(text: string, s: Supporter): string {
  return text
    .replaceAll("{name}", s.name)
    .replaceAll("{rewards}", rewardLabel(s))
    .replaceAll("{notes}", rewardNotes(s))
    .replaceAll("{tickets}", String(s.tickets))
    .replaceAll("{course}", s.course ?? "")
    // {notes} が空のときに空行が残らないようにする
    .replace(/\n{3,}/g, "\n\n");
}
