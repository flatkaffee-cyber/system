import { NextRequest, NextResponse } from "next/server";
import { pickSource } from "@/lib/freeeMirror/source";
import { getPayables } from "@/lib/payables";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const data = await getPayables(await pickSource(req));
  return NextResponse.json(data);
}
