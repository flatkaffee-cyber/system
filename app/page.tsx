import { redirect } from "next/navigation";

// トップは店舗側の注文ページ。領収書の撮影は経理画面の /ryoshusho に移した（2026-10-15）
export default function Home() {
  redirect("/table");
}
