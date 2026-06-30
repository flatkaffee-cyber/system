import { NextRequest, NextResponse } from "next/server";
import { getReviews, setReviewStatus } from "@/lib/kb";

export const runtime = "nodejs";

export async function GET() {
  const reviews = await getReviews();
  reviews.sort((a, b) => (a.status === b.status ? (a.date < b.date ? 1 : -1) : a.status === "pending" ? -1 : 1));
  return NextResponse.json({ reviews });
}

export async function POST(req: NextRequest) {
  let body: { id?: string; status?: "pending" | "done" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なリクエスト" }, { status: 400 });
  }
  if (!body.id || !body.status) {
    return NextResponse.json({ error: "id/status が必要です" }, { status: 400 });
  }
  await setReviewStatus(body.id, body.status);
  return NextResponse.json({ ok: true });
}
