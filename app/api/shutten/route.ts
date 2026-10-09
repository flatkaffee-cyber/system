import { NextRequest, NextResponse } from "next/server";
import {
  getEvents, getItems, createEvent, deleteEvent,
  addItem, updateItem, deleteItem, resetChecks, setDone,
} from "@/lib/shutten";

export const runtime = "nodejs";

// GET /api/shutten?id=xxx → イベント一覧と、そのイベントの持ち物
// id が無ければ、今日以降でいちばん近いイベント（無ければ最後のイベント）
export async function GET(req: NextRequest) {
  try {
    const events = await getEvents();
    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    const id =
      req.nextUrl.searchParams.get("id") ||
      events.find((e) => e.date >= today)?.id ||
      events[events.length - 1]?.id ||
      "";
    const items = id ? await getItems(id) : [];
    return NextResponse.json({ events, id, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "取得に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type Body = {
  action?: string;
  id?: string;
  itemId?: string;
  title?: string;
  date?: string;
  memo?: string;
  copyFrom?: string;
  cat?: string;
  name?: string;
  qty?: string;
  note?: string;
  done?: boolean;
};

// POST /api/shutten { action, ... }
export async function POST(req: NextRequest) {
  let b: Body;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  try {
    switch (b.action) {
      case "createEvent": {
        if (!b.title?.trim() || !b.date) {
          return NextResponse.json({ error: "イベント名と日付が必要です" }, { status: 400 });
        }
        const ev = await createEvent(
          { title: b.title.trim(), date: b.date, memo: b.memo?.trim() || undefined },
          b.copyFrom || undefined,
        );
        return NextResponse.json({ ok: true, id: ev.id });
      }
      case "deleteEvent":
        if (!b.id) break;
        await deleteEvent(b.id);
        return NextResponse.json({ ok: true });
      case "addItem":
        if (!b.id || !b.name?.trim() || !b.cat) break;
        await addItem(b.id, {
          cat: b.cat,
          name: b.name.trim(),
          qty: b.qty?.trim() || undefined,
          note: b.note?.trim() || undefined,
        });
        return NextResponse.json({ ok: true });
      case "updateItem": {
        if (!b.id || !b.itemId) break;
        if (typeof b.done === "boolean") {
          await setDone(b.id, b.itemId, b.done);
          return NextResponse.json({ ok: true });
        }
        const patch: Record<string, unknown> = {};
        if (b.name !== undefined) patch.name = b.name.trim();
        if (b.qty !== undefined) patch.qty = b.qty.trim() || undefined;
        if (b.note !== undefined) patch.note = b.note.trim() || undefined;
        if (b.cat !== undefined) patch.cat = b.cat;
        const ok = await updateItem(b.id, b.itemId, patch);
        if (!ok) return NextResponse.json({ error: "対象が見つかりません" }, { status: 404 });
        return NextResponse.json({ ok: true });
      }
      case "deleteItem":
        if (!b.id || !b.itemId) break;
        await deleteItem(b.id, b.itemId);
        return NextResponse.json({ ok: true });
      case "resetChecks":
        if (!b.id) break;
        await resetChecks(b.id);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "不明な操作です" }, { status: 400 });
    }
    return NextResponse.json({ error: "必要な項目が足りません" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存に失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
