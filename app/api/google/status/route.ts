import { NextResponse } from "next/server";
import { isGoogleConnected, gmailProfile } from "@/lib/google";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isGoogleConnected())) {
    return NextResponse.json({ connected: false });
  }
  try {
    const p = await gmailProfile();
    return NextResponse.json({
      connected: true,
      ok: true,
      email: p.emailAddress,
      messagesTotal: p.messagesTotal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "エラー";
    return NextResponse.json({ connected: true, ok: false, error: msg });
  }
}
