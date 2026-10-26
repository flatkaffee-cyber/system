import { NextRequest, NextResponse } from "next/server";
import { TASKS, addTask, editTask, getTasks, resetTask } from "@/lib/shikomi";

export const runtime = "nodejs";

// GET /api/shikomi/settings → 仕込み品の設定（非表示にしたものも含む）と、コードの初期値
export async function GET() {
  try {
    const tasks = (await getTasks(true)).filter((t) => t.kind === "仕込み");
    return NextResponse.json({ tasks, defaults: TASKS.filter((t) => t.kind === "仕込み") });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "取得に失敗" }, { status: 500 });
  }
}

// POST /api/shikomi/settings
//   { id, patch }  … 設定を変える（値が null の項目は初期値に戻す）。{ hidden: true } で一覧から外す
//   { reset: id }  … 初期値に戻す（画面で足したものは消える）
//   { add: {...} } … 仕込み品を足す
export async function POST(req: NextRequest) {
  try {
    const b = (await req.json()) as {
      id?: string;
      patch?: Record<string, unknown>;
      reset?: string;
      add?: Parameters<typeof addTask>[0];
    };
    if (b.reset) {
      await resetTask(b.reset);
      return NextResponse.json({ ok: true });
    }
    if (b.add) {
      if (!b.add.name || !b.add.intervalDays) {
        return NextResponse.json({ error: "名前と何日おきかが必要です" }, { status: 400 });
      }
      const id = await addTask(b.add);
      return NextResponse.json({ ok: true, id });
    }
    if (b.id && b.patch) {
      await editTask(b.id, b.patch);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "id と patch が必要です" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "保存に失敗" }, { status: 500 });
  }
}
