import { NextRequest, NextResponse } from "next/server";
import {
  getRecords,
  addRecord,
  removeRecord,
  buildStates,
  analyze,
  getTasks,
  todayJST,
} from "@/lib/shikomi";

export const runtime = "nodejs";

// GET /api/shikomi → 今日やること・各作業の次回予定・予定とのずれの分析
export async function GET() {
  try {
    const today = todayJST();
    const [records, tasks] = await Promise.all([getRecords(), getTasks()]);
    const states = buildStates(records, today, tasks);
    const due = states.filter((s) => !s.doneToday && s.dueReasons.length > 0);
    return NextResponse.json({
      today,
      states,
      due,
      analysis: analyze(records, today, tasks),
      summary: {
        due: due.length,
        dueMinutes: due.reduce((n, s) => n + (s.minutes ?? 0), 0),
        doneToday: states.filter((s) => s.doneToday).length,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取得に失敗" },
      { status: 500 },
    );
  }
}

// POST /api/shikomi { taskId, type?: "made"|"out"|"plan", qty?, date?, note?, by? }
//   → 仕込んだ（made）・切れた（out）・在庫確認で仕込むと決めた（plan、date は仕込む日）を記録
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      taskId?: string;
      type?: "made" | "out" | "plan";
      qty?: number;
      date?: string;
      note?: string;
      by?: string;
    };
    if (!b.taskId) {
      return NextResponse.json({ error: "taskId が必要です" }, { status: 400 });
    }
    await addRecord({
      taskId: b.taskId,
      date: b.date || todayJST(),
      ...(b.type === "out" || b.type === "plan" ? { type: b.type } : {}),
      ...(typeof b.qty === "number" ? { qty: b.qty } : {}),
      note: b.note,
      by: b.by,
    });
    return NextResponse.json({ ok: true, states: buildStates(await getRecords(), todayJST(), await getTasks()) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "保存に失敗" },
      { status: 500 },
    );
  }
}

// DELETE /api/shikomi?taskId=..&date=..&type=made|out|plan → 記録の取り消し
export async function DELETE(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const taskId = sp.get("taskId");
    const date = sp.get("date");
    if (!taskId || !date) {
      return NextResponse.json({ error: "taskId と date が必要です" }, { status: 400 });
    }
    const type = sp.get("type");
    await removeRecord(taskId, date, type === "out" || type === "plan" ? type : "made");
    return NextResponse.json({ ok: true, states: buildStates(await getRecords(), todayJST(), await getTasks()) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "取消に失敗" },
      { status: 500 },
    );
  }
}
