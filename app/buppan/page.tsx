"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Nav from "@/components/Nav";

// 物販登録。Tシャツなどを写真・名前・値段・サイズごとの在庫つきで Square に入れる画面。
// 入れた商品はレジと注文画面にも出る。ネットショップに出すスイッチだけは
// Square データで手で入れる（API から書けない）ので、登録後に案内する。
//
// 見た目は全体用のクラス（wrap・card・primary・ghost・hint・err）と inline style だけで作る。
// styled-jsx は全体用のクラス名と被ると崩れるので使わない。

const PIN_STORE = "flat:menuPin"; // メニュー編集と同じ暗証番号
const DEFAULT_SIZES = ["S", "M", "L", "XL"];
const MAX_EDGE = 1600; // 写真の長い辺。ネットショップの表示には十分で、1枚1MB前後に収まる

type SizeRow = { key: number; name: string; qty: string };
type Photo = { key: number; file: File; url: string };
type ListItem = {
  id: string;
  name: string;
  sizes: { id: string; name: string; price: number | null; qty: number | null }[];
};
type Done = {
  itemId: string;
  name: string;
  photos: number;
  photoErrors: string[];
  stockError?: string;
};

let seq = 0;
const nextKey = () => ++seq;
const freshSizes = (): SizeRow[] => DEFAULT_SIZES.map((name) => ({ key: nextKey(), name, qty: "0" }));

/** 写真を長い辺 MAX_EDGE の JPEG に縮める。読めない形式（HEIC など）はそのまま返す */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.86));
    return blob ?? file;
  } catch {
    return file;
  }
}

const yen = (n: number | null) => (n == null ? "—" : `¥${n.toLocaleString("ja-JP")}`);

export default function Buppan() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [desc, setDesc] = useState("");
  const [sizes, setSizes] = useState<SizeRow[]>(freshSizes);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [done, setDone] = useState<Done | null>(null);

  const [list, setList] = useState<ListItem[] | null>(null);
  const [listErr, setListErr] = useState("");

  const loadList = useCallback(async () => {
    setListErr("");
    try {
      const r = await fetch("/api/buppan");
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "読み込みに失敗");
      setList(j.items);
    } catch (e) {
      setListErr(e instanceof Error ? e.message : "読み込みに失敗");
    }
  }, []);

  const tryPin = useCallback(
    async (p: string) => {
      const r = await fetch("/api/menu-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auth", pin: p }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.ok) return false;
      sessionStorage.setItem(PIN_STORE, p);
      setPin(p);
      setAuthed(true);
      loadList();
      return true;
    },
    [loadList],
  );

  useEffect(() => {
    const saved = sessionStorage.getItem(PIN_STORE);
    if (saved) tryPin(saved).catch(() => {});
  }, [tryPin]);

  // 画面を離れるときに、写真のプレビュー用 URL を片付ける
  const photosRef = useRef<Photo[]>([]);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function unlock() {
    setErr("");
    if (!(await tryPin(pin))) setErr("暗証番号が違います");
  }

  function addPhotos(files: FileList | null) {
    if (!files?.length) return;
    const added = Array.from(files).map((file) => ({ key: nextKey(), file, url: URL.createObjectURL(file) }));
    setPhotos((cur) => [...cur, ...added]);
    setConfirming(false);
  }

  function movePhoto(i: number, dir: -1 | 1) {
    setPhotos((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function removePhoto(key: number) {
    setPhotos((cur) => {
      const gone = cur.find((p) => p.key === key);
      if (gone) URL.revokeObjectURL(gone.url);
      return cur.filter((p) => p.key !== key);
    });
  }

  function updateSize(key: number, patch: Partial<SizeRow>) {
    setSizes((cur) => cur.map((s) => (s.key === key ? { ...s, ...patch } : s)));
    setConfirming(false);
  }

  // 画面側でも先に確かめて、Square に送る前に止める
  function problem(): string | null {
    if (!name.trim()) return "商品名を入れてください";
    const p = Number(price);
    if (!Number.isInteger(p) || p <= 0) return "値段は1円以上の整数で入れてください";
    if (!sizes.length) return "サイズを1つ以上入れてください";
    const names = sizes.map((s) => s.name.trim());
    if (names.some((n) => !n)) return "サイズの名前が空の行があります";
    if (new Set(names).size !== names.length) return "同じ名前のサイズが2つあります";
    if (sizes.some((s) => !/^\d+$/.test(s.qty.trim()))) return "在庫は0以上の整数で入れてください";
    return null;
  }

  function review() {
    const bad = problem();
    setErr(bad ?? "");
    setConfirming(!bad);
  }

  async function register() {
    setBusy(true);
    setErr("");
    setProgress("Square に商品を作っています…");
    try {
      const r = await fetch("/api/buppan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          name: name.trim(),
          price: Number(price),
          description: desc,
          sizes: sizes.map((s) => ({ name: s.name.trim(), qty: Number(s.qty) })),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "登録に失敗しました");

      const photoErrors: string[] = [];
      let sent = 0;
      for (let i = 0; i < photos.length; i++) {
        setProgress(`写真を送っています（${i + 1}/${photos.length}）…`);
        const blob = await shrink(photos[i].file);
        const fd = new FormData();
        fd.append("pin", pin);
        fd.append("itemId", j.itemId);
        fd.append("primary", i === 0 ? "1" : "0");
        fd.append("caption", name.trim());
        const fname = blob === photos[i].file ? photos[i].file.name : `photo${i + 1}.jpg`;
        fd.append("file", blob, fname);
        const ir = await fetch("/api/buppan/image", { method: "POST", body: fd });
        const ij = await ir.json().catch(() => ({}));
        if (ir.ok) sent++;
        else photoErrors.push(`${i + 1}枚目：${ij.error || "送れませんでした"}`);
      }

      setDone({ itemId: j.itemId, name: j.name, photos: sent, photoErrors, stockError: j.stockError });
      setName("");
      setPrice("");
      setDesc("");
      setSizes(freshSizes());
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setPhotos([]);
      setConfirming(false);
      loadList();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "登録に失敗しました");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  if (!authed) {
    return (
      <main className="wrap">
        <Nav />
        <div className="card" style={{ maxWidth: 360, margin: "40px auto", textAlign: "center" }}>
          <h2 style={{ fontSize: 18, marginBottom: 6 }}>👕 物販登録</h2>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            メニュー編集と同じ暗証番号を入れてください。
          </p>
          <input
            type="password"
            inputMode="numeric"
            aria-label="暗証番号"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && unlock()}
            placeholder="4〜8桁"
            style={{ textAlign: "center", fontSize: 20, letterSpacing: 6 }}
          />
          <button className="primary" style={{ marginTop: 12 }} onClick={unlock}>
            開く
          </button>
          {err && <p className="err">{err}</p>}
        </div>
      </main>
    );
  }

  const total = sizes.reduce((s, r) => s + (Number(r.qty) || 0), 0);

  return (
    <main className="wrap">
      <Nav />
      <h2 style={{ fontSize: 18, margin: "4px 0 2px" }}>👕 物販登録</h2>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
        Tシャツなどを Square に登録します。レジと注文画面にもそのまま出ます。色ちがいは1色ずつ別の商品にしてください。
      </p>

      {done && (
        <div className="card" style={{ borderColor: "var(--ok)", background: "#eef7ef" }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, color: "var(--ok)" }}>「{done.name}」を登録しました</p>
          <p style={{ margin: 0, fontSize: 13 }}>写真 {done.photos} 枚を付けました。</p>
          {done.stockError && (
            <p className="err" style={{ marginTop: 6 }}>
              在庫が入りませんでした：{done.stockError}。Square データの商品で在庫を入れてください。
            </p>
          )}
          {done.photoErrors.map((m) => (
            <p key={m} className="err" style={{ marginTop: 4 }}>
              {m}
            </p>
          ))}
          <p style={{ margin: "12px 0 4px", fontSize: 13, fontWeight: 700 }}>ネットショップに出すには、あと1つ</p>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.7 }}>
            Square データの商品ライブラリでこの商品を開き、販売チャネルの「Square オンライン」をオンにしてください。ここからは入れられません。
          </p>
          <a
            href={`https://app.squareup.com/dashboard/items/library/${done.itemId}`}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-block", marginTop: 10, fontSize: 14, fontWeight: 700, color: "var(--accent)" }}
          >
            Square でこの商品を開く
          </a>
        </div>
      )}

      <section className="card" aria-labelledby="new-goods">
        <h3 id="new-goods" style={{ fontSize: 16, margin: "0 0 4px" }}>新しく登録する</h3>

        <label htmlFor="g-name">商品名</label>
        <input
          id="g-name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setConfirming(false);
          }}
          placeholder="例：flat. ロゴ Tシャツ（白）"
        />

        <label htmlFor="g-price">値段（税込・円）</label>
        <input
          id="g-price"
          inputMode="numeric"
          value={price}
          onChange={(e) => {
            setPrice(e.target.value.replace(/[^\d]/g, ""));
            setConfirming(false);
          }}
          placeholder="例：5500"
        />

        <label htmlFor="g-desc">説明（ネットショップの商品ページに出ます）</label>
        <textarea
          id="g-desc"
          value={desc}
          onChange={(e) => {
            setDesc(e.target.value);
            setConfirming(false);
          }}
          rows={4}
          placeholder="柄のこと、生地の厚さ、素材など"
          style={{
            width: "100%",
            padding: "10px 12px",
            border: "1px solid var(--line)",
            borderRadius: 8,
            fontSize: 15,
            fontFamily: "inherit",
            resize: "vertical",
          }}
        />

        <div style={{ margin: "14px 0 4px", fontSize: 12, color: "var(--muted)" }}>サイズと在庫の枚数</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sizes.map((s, i) => (
            <div key={s.key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 44px", gap: 8, alignItems: "center" }}>
              <input
                aria-label={`サイズ ${i + 1} の名前`}
                value={s.name}
                onChange={(e) => updateSize(s.key, { name: e.target.value })}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  aria-label={`${s.name || `サイズ ${i + 1}`} の在庫`}
                  inputMode="numeric"
                  value={s.qty}
                  onChange={(e) => updateSize(s.key, { qty: e.target.value.replace(/[^\d]/g, "") })}
                  style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                />
                <span style={{ fontSize: 13, color: "var(--muted)" }}>枚</span>
              </div>
              <button
                type="button"
                className="ghost"
                aria-label={`${s.name || `サイズ ${i + 1}`} の行を消す`}
                onClick={() => {
                  setSizes((cur) => cur.filter((x) => x.key !== s.key));
                  setConfirming(false);
                }}
                style={{ padding: 0, height: 44, fontSize: 18 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="ghost"
          onClick={() => setSizes((cur) => [...cur, { key: nextKey(), name: "", qty: "0" }])}
          style={{ color: "var(--accent)" }}
        >
          ＋ サイズを足す
        </button>

        <div style={{ margin: "10px 0 4px", fontSize: 12, color: "var(--muted)" }}>
          写真（1枚目がネットショップの一覧に出ます）
        </div>
        {photos.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 8 }}>
            {photos.map((p, i) => (
              <figure key={p.key} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ position: "relative" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={`写真 ${i + 1}`}
                    style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 8, display: "block", background: "var(--line)" }}
                  />
                  {i === 0 && (
                    <span
                      style={{ position: "absolute", top: 6, left: 6, fontSize: 11, fontWeight: 700, background: "var(--accent)", color: "#fff", padding: "1px 8px", borderRadius: 999 }}
                    >
                      メイン
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <button type="button" className="ghost" aria-label={`写真 ${i + 1} を前へ`} disabled={i === 0} onClick={() => movePhoto(i, -1)} style={{ padding: "4px 8px", fontSize: 13 }}>
                    ◀
                  </button>
                  <button type="button" className="ghost" aria-label={`写真 ${i + 1} を消す`} onClick={() => removePhoto(p.key)} style={{ padding: "4px 8px", fontSize: 13 }}>
                    消す
                  </button>
                  <button type="button" className="ghost" aria-label={`写真 ${i + 1} を後ろへ`} disabled={i === photos.length - 1} onClick={() => movePhoto(i, 1)} style={{ padding: "4px 8px", fontSize: 13 }}>
                    ▶
                  </button>
                </div>
              </figure>
            ))}
          </div>
        )}
        <label
          htmlFor="g-photos"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 48,
            margin: 0,
            border: "1px dashed var(--accent)",
            borderRadius: 10,
            color: "var(--accent)",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          写真を選ぶ
        </label>
        <input
          id="g-photos"
          type="file"
          accept="image/jpeg,image/png,image/gif,image/*"
          multiple
          onChange={(e) => {
            addPhotos(e.target.files);
            e.target.value = "";
          }}
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
        />

        {err && <p className="err" role="alert">{err}</p>}

        {!confirming ? (
          <button className="primary" style={{ marginTop: 16 }} onClick={review} disabled={busy}>
            内容を確かめる
          </button>
        ) : (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 10, background: "var(--accent-weak)" }}>
            <p style={{ margin: "0 0 8px", fontWeight: 700 }}>この内容で Square に登録します</p>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.8 }}>
              {name.trim()}　{yen(Number(price))}
              <br />
              {sizes.map((s) => `${s.name.trim()} ${s.qty}枚`).join("・")}（計 {total} 枚）
              <br />
              写真 {photos.length} 枚{photos.length === 0 && "（あとから Square で足せます）"}
            </p>
            {progress && (
              <p role="status" style={{ margin: "8px 0 0", fontSize: 13 }}>
                {progress}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button className="ghost" style={{ flex: 1 }} onClick={() => setConfirming(false)} disabled={busy}>
                直す
              </button>
              <button className="primary" style={{ flex: 2 }} onClick={register} disabled={busy}>
                {busy ? "登録しています…" : "Square に登録する"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="goods-list">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h3 id="goods-list" style={{ fontSize: 16, margin: 0 }}>登録済みの物販</h3>
          <button className="ghost" onClick={loadList} style={{ fontSize: 13 }}>
            読み直す
          </button>
        </div>
        {listErr && <p className="err">{listErr}</p>}
        {!list && !listErr && <p className="hint">読み込み中…</p>}
        {list && list.length === 0 && (
          <p className="hint">まだありません。上から登録すると、ここにサイズごとの在庫が出ます。</p>
        )}
        {list?.map((it) => (
          <div key={it.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{it.name}</span>
              <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{yen(it.sizes[0]?.price ?? null)}</span>
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
              {it.sizes.map((s) => `${s.name} ${s.qty ?? "—"}`).join("・")}
            </div>
            <a
              href={`https://app.squareup.com/dashboard/items/library/${it.id}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: 12.5, color: "var(--accent)" }}
            >
              Square で開く
            </a>
          </div>
        ))}
      </section>
    </main>
  );
}
