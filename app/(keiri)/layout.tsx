import KeiriShell from "@/components/keiri/KeiriShell";

// 経理のページ（app/(keiri)/ の下）だけを包むレイアウト。ルートグループなので URL には出ない
export default function KeiriLayout({ children }: { children: React.ReactNode }) {
  return <KeiriShell>{children}</KeiriShell>;
}
