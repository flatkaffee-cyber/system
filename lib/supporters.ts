// クラウドファンディングの支援者と、コーヒーチケットのお渡し状況（Vercel KV）。
//
// CAMPFIREから落としたCSVを貼り付けて取り込む。列の名前は配布元によって違うので、
// 見出しに「名前」「メール」などが含まれる列を拾う形にしてある。
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
  /** リターンのコース名。CSVにあれば入れる */
  course?: string;
  /** 渡すコーヒーチケットの枚数 */
  tickets: number;
  /** お礼メールを送った日時 */
  sentAt?: string;
  sendError?: string;
  /** 店頭でチケットを渡した日時 */
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

/** 1行をカンマで割る。引用符の中のカンマは区切りにしない */
function splitRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 見出しから、それらしい列の位置を探す */
function findColumn(header: string[], words: string[]): number {
  return header.findIndex((h) => words.some((w) => h.toLowerCase().includes(w)));
}

export type ParsedRow = { name: string; email: string; course?: string };

/**
 * CSVを読む。見出しがあれば列名から、無ければ「@を含む列がメール」で拾う。
 * 取り込めなかった行は呼び出し側に返して、画面で見せる。
 */
export function parseCsv(text: string): { rows: ParsedRow[]; skipped: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { rows: [], skipped: [] };

  const first = splitRow(lines[0]);
  const hasHeader = !first.some((c) => EMAIL_RE.test(c));
  let iName = -1;
  let iMail = -1;
  let iCourse = -1;
  if (hasHeader) {
    iName = findColumn(first, ["名前", "氏名", "name", "支援者"]);
    iMail = findColumn(first, ["メール", "mail", "email", "アドレス"]);
    iCourse = findColumn(first, ["リターン", "コース", "プラン", "return", "course"]);
  }

  const rows: ParsedRow[] = [];
  const skipped: string[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const c = splitRow(line);
    const email = (iMail >= 0 ? c[iMail] : c.find((v) => EMAIL_RE.test(v))) ?? "";
    if (!EMAIL_RE.test(email)) {
      skipped.push(line.slice(0, 80));
      continue;
    }
    // 名前の列が分からないときは、メール以外でいちばん最初の文字列を名前とみなす
    const name =
      (iName >= 0 ? c[iName] : c.find((v) => v && !EMAIL_RE.test(v) && !/^\d+$/.test(v))) ?? "";
    rows.push({
      name: name || email.split("@")[0],
      email: email.toLowerCase(),
      course: iCourse >= 0 ? c[iCourse] || undefined : undefined,
    });
  }
  return { rows, skipped };
}

/** 取り込み。メールアドレスが同じ人は上書きせず、そのまま残す（送信済みを消さないため） */
export async function importSupporters(
  rows: ParsedRow[],
  tickets: number,
): Promise<{ added: number; existing: number }> {
  const list = await getSupporters();
  const known = new Set(list.map((s) => s.email));
  let added = 0;
  let existing = 0;
  for (const r of rows) {
    if (known.has(r.email)) {
      existing++;
      continue;
    }
    list.push({
      id: newId(),
      name: r.name,
      email: r.email,
      course: r.course,
      tickets,
      createdAt: new Date().toISOString(),
    });
    known.add(r.email);
    added++;
  }
  await save(list);
  return { added, existing };
}

/** 文面の {name} {tickets} {course} を置き換える */
export function fillTemplate(text: string, s: Supporter): string {
  return text
    .replaceAll("{name}", s.name)
    .replaceAll("{tickets}", String(s.tickets))
    .replaceAll("{course}", s.course ?? "");
}
