"use client";

import { useEffect, useState } from "react";

// 領収書の原本を行の下に開く。/api/receipts/image は { image: dataURL } を返す。PDFのこともあるので iframe で出し分ける。
export default function ReceiptPreview({ id, title }: { id: string; title: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch(`/api/receipts/image?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.image) setImage(j.image);
        else setError(j.error || "画像がありません");
      })
      .catch(() => alive && setError("画像を読み込めませんでした"));
    return () => { alive = false; };
  }, [id]);

  return (
    <div className="rp-box">
      {error && <p className="hint">{error}</p>}
      {!error && !image && <p className="hint">領収書を読み込んでいます…</p>}
      {image &&
        (image.startsWith("data:application/pdf") ? (
          <iframe src={image} title={`領収書: ${title}`} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- dataURLなので next/image は使えない
          <img src={image} alt={`領収書: ${title}`} />
        ))}
      <style jsx>{`
        .rp-box { padding: 8px 0 4px 52px; }
        img { display: block; max-width: min(420px, 100%); height: auto; border-radius: 10px; border: 1px solid var(--line); }
        iframe { width: 100%; height: 60vh; border: 1px solid var(--line); border-radius: 10px; }
      `}</style>
    </div>
  );
}
