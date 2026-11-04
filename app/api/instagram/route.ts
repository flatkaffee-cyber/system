import { NextRequest, NextResponse } from "next/server";
import {
  addImage,
  connect,
  disconnect,
  getConn,
  listClosures,
  listImages,
  listRules,
  listRuns,
  postNow,
  removeImage,
  removeRule,
  saveClosures,
  saveRule,
} from "@/lib/instagram";
import { disconnectGbp, getGbpConn } from "@/lib/googleBusiness";
import { jstNow, nextRun, toMin, type Frequency, type StoryRule } from "@/lib/instagramPlan";
import { SHOP } from "@/lib/shop";

export const runtime = "nodejs";
export const maxDuration = 120;

const err = (e: unknown, status = 500) =>
  NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status });

// GET /api/instagram → 画面に出すもの全部。トークンそのものは返さない
export async function GET() {
  try {
    const [conn, gbp, rules, images, closures, runs] = await Promise.all([
      getConn(),
      getGbpConn(),
      listRules(),
      listImages(),
      listClosures(),
      listRuns(),
    ]);
    const now = jstNow();
    return NextResponse.json({
      conn: conn
        ? { username: conn.username, userId: conn.userId, host: conn.host, savedAt: conn.savedAt, refreshedAt: conn.refreshedAt, lastError: conn.lastError }
        : null,
      google: gbp ? { title: gbp.title, savedAt: gbp.savedAt, lastError: gbp.lastError } : null,
      rules: rules.map((r) => ({ ...r, next: nextRun(r, now, SHOP.closedWeekday, closures) })),
      images,
      closures,
      runs: runs.slice(-40).reverse(),
      closedLabel: SHOP.closedLabel,
    });
  } catch (e) {
    return err(e);
  }
}

const FREQS: Frequency[] = ["daily", "weekly", "monthly", "custom"];
const isDate = (d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

function cleanRule(b: Partial<StoryRule>): StoryRule {
  const name = (b.name || "").trim();
  if (!name) throw new Error("名前を入れてください");
  const slots = (b.slots || [])
    .filter((s) => s && toMin(s.time) !== null)
    .map((s) => ({ time: s.time.trim().padStart(5, "0"), imageIds: (s.imageIds || []).filter(Boolean) }));
  if (slots.length === 0) throw new Error("時刻を1つ以上入れてください");
  // cron は 7:00〜22:55 だけ動く（vercel.json）。その外の時刻は出ないので保存させない
  const late = slots.find((s) => { const m = toMin(s.time)!; return m < 7 * 60 || m > 22 * 60 + 30; });
  if (late) throw new Error(`${late.time} は出せません。時刻は7:00〜22:30の間にしてください`);
  const frequency = FREQS.includes(b.frequency as Frequency) ? (b.frequency as Frequency) : "daily";
  const rule: StoryRule = {
    id: b.id || `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.slice(0, 40),
    enabled: b.enabled !== false,
    frequency,
    weekdays: (b.weekdays || []).filter((w) => Number.isInteger(w) && w >= 0 && w <= 6),
    monthDays: (b.monthDays || []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 31),
    dates: [...new Set((b.dates || []).filter(isDate))].sort(),
    slots,
    businessDaysOnly: !!b.businessDaysOnly,
    skipIfPosted: b.skipIfPosted !== false,
    skipWindowMin: Math.min(Math.max(Number(b.skipWindowMin) || 60, 5), 600),
    ...(isDate(b.startDate) ? { startDate: b.startDate } : {}),
    ...(isDate(b.endDate) ? { endDate: b.endDate } : {}),
    updatedAt: new Date().toISOString(),
  };
  if (frequency === "weekly" && rule.weekdays.length === 0) throw new Error("曜日を選んでください");
  if (frequency === "monthly" && rule.monthDays.length === 0) throw new Error("日にちを選んでください");
  if (frequency === "custom" && rule.dates.length === 0) throw new Error("日付を1つ以上入れてください");
  return rule;
}

// POST /api/instagram { action, ... }
//   saveRule { rule } / deleteRule { id }
//   upload { name, dataUrl } / deleteImage { id }
//   closures { dates }
//   connect { token, userId? } / disconnect
//   postNow { ruleId, time }
//   disconnectGoogle
export async function POST(req: NextRequest) {
  try {
    const b = await req.json();
    switch (b.action) {
      case "saveRule": {
        const rule = cleanRule(b.rule || {});
        await saveRule(rule);
        return NextResponse.json({ ok: true, rule });
      }
      case "deleteRule":
        await removeRule(String(b.id));
        return NextResponse.json({ ok: true });
      case "upload":
        return NextResponse.json({ ok: true, image: await addImage(String(b.name || "画像"), String(b.dataUrl || "")) });
      case "deleteImage":
        await removeImage(String(b.id));
        return NextResponse.json({ ok: true });
      case "closures":
        await saveClosures(Array.isArray(b.dates) ? b.dates : []);
        return NextResponse.json({ ok: true });
      case "connect": {
        const c = await connect(String(b.token || ""), b.userId ? String(b.userId) : undefined);
        return NextResponse.json({ ok: true, username: c.username });
      }
      case "disconnect":
        await disconnect();
        return NextResponse.json({ ok: true });
      case "postNow":
        return NextResponse.json({ ok: true, run: await postNow(String(b.ruleId), String(b.time), req.nextUrl.origin) });
      case "disconnectGoogle":
        await disconnectGbp();
        return NextResponse.json({ ok: true });
      default:
        return err("不明な操作です", 400);
    }
  } catch (e) {
    return err(e, 400);
  }
}
