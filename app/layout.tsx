import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "flat. 立替精算",
  description: "領収書をアップすると自動で科目を判定する立替精算アプリ",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
