import { NextRequest } from "next/server";
import { getShifts, toMin, STAFF } from "@/lib/shift";
import { checkIcsToken } from "@/lib/siteAuth";

export const runtime = "nodejs";

// シフトをカレンダーに購読してもらうための配信（iCalendar形式）。
//
// Googleカレンダーの「URLで追加」に貼ると、以後シフトを直すたびに
// 各自のカレンダーへ反映される。手で入れ直さなくてよい。
// Googleが取りに来る間隔はGoogle側の都合で、数時間かかることがある。
//
// URLに鍵を付ける。合言葉のCookieとは別の値にしてあるので、
// このURLが漏れてもシステム本体には入れない。

/** 前後どれだけ配信するか。増やしすぎるとファイルが重くなる */
const PAST_DAYS = 30;
const AHEAD_DAYS = 120;

const pad = (n: number) => String(n).padStart(2, "0");

/** JSTの日付＋"H:MM"（24:30のような表記も可）を、UTCのICS時刻に直す */
function icsTime(date: string, hhmm: string): string | null {
  const min = toMin(hhmm);
  if (min === null) return null;
  const [y, m, d] = date.split("-").map(Number);
  // JSTの0時をUTCで表し、そこに分を足す。24時超えは自動で翌日になる
  const t = Date.UTC(y, m - 1, d, -9, min);
  const dt = new Date(t);
  return (
    `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}` +
    `T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00Z`
  );
}

/** ICSは特殊文字のエスケープと75オクテット折り返しが要る */
function esc(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 74) return line;
  const out: string[] = [];
  let cur = Buffer.alloc(0);
  for (const ch of line) {
    const b = Buffer.from(ch, "utf8");
    if (cur.length + b.length > 73) {
      out.push(cur.toString("utf8"));
      cur = Buffer.alloc(0);
    }
    cur = Buffer.concat([cur, b]);
  }
  out.push(cur.toString("utf8"));
  return out.join("\r\n ");
}

function shiftLabel(start: string): string {
  const s = toMin(start) ?? 0;
  if (s < 12 * 60) return "朝番";
  if (s < 17 * 60) return "昼番";
  return "夜番";
}

// GET /api/shift/ics?key=...&staff=坂本
//   staff を省くと全員ぶん（誰が入るかを見たいとき用）
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (!(await checkIcsToken(q.get("key")))) {
    return new Response("鍵が違います", { status: 401 });
  }

  const staff = q.get("staff") || "";
  if (staff && !STAFF.includes(staff as (typeof STAFF)[number])) {
    return new Response(`知らない名前です: ${staff}`, { status: 400 });
  }

  const day = 86400_000;
  const now = Date.now() + 9 * 3600_000;
  const from = new Date(now - PAST_DAYS * day).toISOString().slice(0, 10);
  const to = new Date(now + AHEAD_DAYS * day).toISOString().slice(0, 10);

  const entries = (await getShifts()).filter(
    (e) => e.date >= from && e.date <= to && (!staff || e.staff === staff),
  );

  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const name = staff ? `flat. シフト（${staff}）` : "flat. シフト";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//flat.//shift//JA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    "X-WR-TIMEZONE:Asia/Tokyo",
    // Googleに取りに来てほしい間隔（守られるかはGoogle次第）
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const e of entries) {
    const start = icsTime(e.date, e.start);
    const end = icsTime(e.date, e.end);
    if (!start || !end) continue;
    const title = staff
      ? `flat. ${shiftLabel(e.start)}`
      : `flat. ${e.staff}（${shiftLabel(e.start)}）`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@flat-keihi.vercel.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      fold(`SUMMARY:${esc(title)}`),
      fold(`DESCRIPTION:${esc(`${e.staff} ${e.start}〜${e.end}${e.note ? `\n${e.note}` : ""}`)}`),
      "LOCATION:flat.",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
