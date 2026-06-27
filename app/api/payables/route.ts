import { NextResponse } from "next/server";
import { getPayables } from "@/lib/payables";

export const runtime = "nodejs";

export async function GET() {
  const data = await getPayables();
  return NextResponse.json(data);
}
