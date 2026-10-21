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
const DEFAULT_COLORS = ["白"];
const MAX_EDGE = 1600; // 写真の長い辺。ネットショップの表示には十分で、1枚1MB前後に収まる

type Row = { key: number; name: string };
type Photo = { key: number; file: File; url: string };
type ListItem = {
  id: string;
  name: string;
  sizes: { id: string; name: string; price: number | null; qty: number | null }[];
};
/** 在庫の表の1マス。色と枚数の組で持つ（キーは「色のkey:サイズのkey」） */
type QtyMap = Record<string, string>;
type Done = {
  itemId: string;
  name: string;
  photos: number;
  photoErrors: string[];
  stockError?: string;
};

let seq = 0;
const nextKey = () => ++seq;
const freshRows = (names: string[]): Row[] => names.map((name) => ({ key: nextKey(), name }));
const cell = (c: Row, s: Row) => `${c.key}:${s.key}`;
/** Square の種類の名前。色が1つで空なら、サイズだけにする */
const variationName = (colors: Row[], c: Row, s: Row) =>
  colors.length === 1 && !c.name.trim() ? s.name.trim() : `${c.name.trim()} / ${s.name.trim()}`;
/** 「白 / M」を色とサイズに分ける。区切りが無ければ色なし */
const splitName = (n: string) => {
  const i = n.lastIndexOf(" / ");
  return i < 0 ? { color: "", size: n } : { color: n.slice(0, i), size: n.slice(i + 3) };
};

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

const GUIDE_STEPS: { title: string; body: string }[] = [
  {
    title: "写真を用意する",
    body: "スマホで正方形に撮ります。1つの柄につき、前・後ろ・着用・プリントのアップ・サイズ感の4〜5枚。1枚目（平置きの前）がネットショップの一覧に出ます。",
  },
  {
    title: "商品名と値段を入れる",
    body: "同じ柄の色ちがいは1つの商品にまとめます（例：CLASSIC MELT Tシャツ）。名前に「Tシャツ」を入れておくと、売上で物販に分けて数えられます。値段は税込です。",
  },
  {
    title: "色・サイズ・枚数を入れる",
    body: "色（例：白・サックス・オリーブ）とサイズを並べ、表のマスに色×サイズごとの枚数を入れます。Square には「白 / M」のような種類として入り、在庫もそれぞれ別に数えます。在庫は店のレジと共通です。",
  },
  {
    title: "写真を選んで登録する",
    body: "［写真を選ぶ］で写真を足し、◀ ▶ で並べ替えます。［内容を確かめる］→［Square に登録する］で、商品・写真・在庫が Square に入ります。",
  },
  {
    title: "ネットショップでオンにする",
    body: "ここだけ Square で手作業です。登録後に出る［Square でこの商品を開く］を押し、販売チャネルの「Square オンライン」をオンにして保存します。オンにするまでネットショップには出ません。",
  },
];

/** 色やサイズの名前を並べて直す欄。行を足す・消すもここ */
function RowEditor(props: {
  title: string;
  rows: Row[];
  addLabel: string;
  placeholder: string;
  onRename: (key: number, name: string) => void;
  onRemove: (key: number) => void;
  onAdd: () => void;
}) {
  return (
    <div>
      <div style={{ margin: "14px 0 6px", fontSize: 12, color: "var(--muted)" }}>{props.title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {props.rows.map((r, i) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 2, flex: "1 1 120px", maxWidth: 180 }}>
            <input
              aria-label={`${props.title} ${i + 1}`}
              value={r.name}
              placeholder={props.placeholder}
              onChange={(e) => props.onRename(r.key, e.target.value)}
              style={{ minWidth: 0 }}
            />
            <button
              type="button"
              className="ghost"
              aria-label={`${props.title}「${r.name || i + 1}」を消す`}
              disabled={props.rows.length <= 1}
              onClick={() => props.onRemove(r.key)}
              style={{ padding: 0, width: 36, height: 44, fontSize: 18, flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="ghost" onClick={props.onAdd} style={{ color: "var(--accent)" }}>
        {props.addLabel}
      </button>
    </div>
  );
}

/**
 * 登録済みの商品の在庫を、色×サイズの表で直す。
 * 入れた数は「いま手元にある数」として Square に棚卸しで書く（レジの在庫も同じ数になる）。
 */
function StockEditor({ item, pin, onSaved }: { item: ListItem; pin: string; onSaved: () => void }) {
  const parts = item.sizes.map((v) => ({ ...v, ...splitName(v.name) }));
  const colorNames = [...new Set(parts.map((p) => p.color))];
  const sizeNames = [...new Set(parts.map((p) => p.size))];
  const find = (c: string, s: string) => parts.find((p) => p.color === c && p.size === s);

  const [edit, setEdit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const changed = Object.entries(edit).filter(([id, v]) => {
    const cur = item.sizes.find((x) => x.id === id)?.qty;
    return v !== "" && Number(v) !== cur;
  });

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/buppan/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, changes: changed.map(([variationId, v]) => ({ variationId, qty: Number(v) })) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "在庫を保存できませんでした");
      setEdit({});
      setMsg(`${changed.length}か所の在庫を保存しました`);
      onSaved();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "在庫を保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: "left", padding: "4px 8px 4px 0", fontWeight: 500, color: "var(--muted)" }}>在庫</th>
              {sizeNames.map((s) => (
                <th key={s} scope="col" style={{ padding: "4px 4px", fontWeight: 500, color: "var(--muted)", minWidth: 52 }}>{s}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colorNames.map((c) => (
              <tr key={c}>
                <th scope="row" style={{ textAlign: "left", padding: "4px 8px 4px 0", whiteSpace: "nowrap" }}>{c || "—"}</th>
                {sizeNames.map((s) => {
                  const v = find(c, s);
                  if (!v) return <td key={s} />;
                  const val = edit[v.id] ?? (v.qty == null ? "" : String(v.qty));
                  const low = v.qty != null && v.qty <= 1;
                  return (
                    <td key={s} style={{ padding: "3px 4px" }}>
                      <input
                        aria-label={`${item.name} ${v.name} の在庫`}
                        inputMode="numeric"
                        value={val}
                        placeholder="—"
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setEdit((cur) => ({ ...cur, [v.id]: e.target.value.replace(/[^\d]/g, "") }))}
                        style={{
                          textAlign: "right",
                          padding: "6px 8px",
                          fontSize: 14,
                          minWidth: 48,
                          borderColor: edit[v.id] !== undefined ? "var(--accent)" : low ? "#e2a9a0" : undefined,
                        }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {changed.length > 0 && (
        <button type="button" className="primary" onClick={save} disabled={busy} style={{ marginTop: 8, padding: "10px 14px", fontSize: 14 }}>
          {busy ? "保存しています…" : `在庫を保存する（${changed.length}か所）`}
        </button>
      )}
      {msg && <p className="hint" role="status">{msg}</p>}
    </div>
  );
}

/** 登録の手引き。初めての人向けに開いておき、閉じた状態はこの端末で覚える */
function Guide() {
  const KEY = "buppan:guide";
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "closed") setOpen(false);
    } catch {}
  }, []);
  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(KEY, next ? "open" : "closed");
    } catch {}
  };

  return (
    <section className="card" aria-labelledby="buppan-guide" style={{ background: "var(--accent-weak)", borderColor: "var(--accent-weak)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h3 id="buppan-guide" style={{ fontSize: 15, margin: 0 }}>登録の手引き</h3>
        <button
          type="button"
          className="ghost"
          aria-expanded={open}
          aria-controls="buppan-guide-body"
          onClick={() => toggle(!open)}
          style={{ fontSize: 13, color: "var(--accent)", padding: "4px 0" }}
        >
          {open ? "閉じる" : "開く"}
        </button>
      </div>
      {open && (
        <div id="buppan-guide-body">
          <ol style={{ margin: "10px 0 0", paddingLeft: "1.3em", display: "flex", flexDirection: "column", gap: 10 }}>
            {GUIDE_STEPS.map((s) => (
              <li key={s.title} style={{ fontSize: 13.5, lineHeight: 1.7 }}>
                <strong style={{ display: "block", fontSize: 14 }}>{s.title}</strong>
                {s.body}
              </li>
            ))}
          </ol>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 12.5, lineHeight: 1.7, color: "var(--ink)" }}>
            <strong>在庫を直すとき</strong>：下の「登録済みの物販」の表で数を書きかえ、［在庫を保存する］を押します。入れた数がそのまま「いまの在庫」になります。
            <br />
            <strong>ほかを直すとき</strong>：値段を変える・写真を足す・色やサイズを足す・消すは、いまは Square データの［商品とサービス］→［商品ライブラリ］でやります。
            <br />
            <strong>店頭で売らないもの</strong>：レジと注文画面にも出るので、出したくないときはメニュー編集で非表示にします。
          </div>
        </div>
      )}
    </section>
  );
}

export default function Buppan() {
  const [pin, setPin] = useState("");
  const [authed, setAuthed] = useState(false);
  const [err, setErr] = useState("");

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [desc, setDesc] = useState("");
  const [colors, setColors] = useState<Row[]>(() => freshRows(DEFAULT_COLORS));
  const [sizes, setSizes] = useState<Row[]>(() => freshRows(DEFAULT_SIZES));
  const [qty, setQty] = useState<QtyMap>({});
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

  function rename(set: typeof setSizes, key: number, name: string) {
    set((cur) => cur.map((r) => (r.key === key ? { ...r, name } : r)));
    setConfirming(false);
  }
  function remove(set: typeof setSizes, key: number) {
    set((cur) => cur.filter((r) => r.key !== key));
    setConfirming(false);
  }
  const qtyOf = (c: Row, s: Row) => qty[cell(c, s)] ?? "0";
  function setCell(c: Row, s: Row, v: string) {
    setQty((cur) => ({ ...cur, [cell(c, s)]: v.replace(/[^\d]/g, "") }));
    setConfirming(false);
  }
  /** 送る形：色×サイズを Square の種類1つずつに */
  const variants = () =>
    colors.flatMap((c) => sizes.map((s) => ({ name: variationName(colors, c, s), qty: Number(qtyOf(c, s) || 0) })));

  // 画面側でも先に確かめて、Square に送る前に止める
  function problem(): string | null {
    if (!name.trim()) return "商品名を入れてください";
    const p = Number(price);
    if (!Number.isInteger(p) || p <= 0) return "値段は1円以上の整数で入れてください";
    if (!colors.length) return "色を1つ以上入れてください";
    if (!sizes.length) return "サイズを1つ以上入れてください";
    const cn = colors.map((c) => c.name.trim());
    if (colors.length > 1 && cn.some((n) => !n)) return "色の名前が空の行があります";
    if (new Set(cn).size !== cn.length) return "同じ名前の色が2つあります";
    const sn = sizes.map((s) => s.name.trim());
    if (sn.some((n) => !n)) return "サイズの名前が空の行があります";
    if (new Set(sn).size !== sn.length) return "同じ名前のサイズが2つあります";
    if (colors.some((c) => sizes.some((s) => !/^\d+$/.test(qtyOf(c, s))))) return "在庫は0以上の整数で入れてください";
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
          sizes: variants(),
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
      setColors(freshRows(DEFAULT_COLORS));
      setSizes(freshRows(DEFAULT_SIZES));
      setQty({});
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

  const total = variants().reduce((n, v) => n + v.qty, 0);

  return (
    <main className="wrap">
      <Nav />
      <h2 style={{ fontSize: 18, margin: "4px 0 2px" }}>👕 物販登録</h2>
      <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>
        Tシャツなどを Square に登録します。レジと注文画面にもそのまま出ます。色ちがいは1つの商品にまとめ、色とサイズごとに在庫を持ちます。
      </p>

      <Guide />

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
          placeholder="例：CLASSIC MELT Tシャツ"
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

        <RowEditor
          title="色"
          rows={colors}
          addLabel="＋ 色を足す"
          placeholder="例：サックス"
          onRename={(k, v) => rename(setColors, k, v)}
          onRemove={(k) => remove(setColors, k)}
          onAdd={() => setColors((cur) => [...cur, { key: nextKey(), name: "" }])}
        />
        <RowEditor
          title="サイズ"
          rows={sizes}
          addLabel="＋ サイズを足す"
          placeholder="例：XXL"
          onRename={(k, v) => rename(setSizes, k, v)}
          onRemove={(k) => remove(setSizes, k)}
          onAdd={() => setSizes((cur) => [...cur, { key: nextKey(), name: "" }])}
        />

        <div style={{ margin: "14px 0 6px", fontSize: 12, color: "var(--muted)" }}>在庫の枚数（いま手元にある数）</div>
        <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: "left", padding: "8px 10px", fontSize: 12, color: "var(--muted)", fontWeight: 500, borderBottom: "1px solid var(--line)" }}>色</th>
                {sizes.map((s) => (
                  <th key={s.key} scope="col" style={{ padding: "8px 4px", fontSize: 12, color: "var(--muted)", fontWeight: 500, borderBottom: "1px solid var(--line)", minWidth: 58 }}>
                    {s.name.trim() || "—"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {colors.map((c) => (
                <tr key={c.key}>
                  <th scope="row" style={{ textAlign: "left", padding: "6px 10px", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid var(--line)" }}>
                    {c.name.trim() || "（色なし）"}
                  </th>
                  {sizes.map((s) => (
                    <td key={s.key} style={{ padding: "6px 4px", borderBottom: "1px solid var(--line)" }}>
                      <input
                        aria-label={`${c.name.trim() || "色なし"} ${s.name.trim()} の在庫`}
                        inputMode="numeric"
                        value={qtyOf(c, s)}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setCell(c, s, e.target.value)}
                        style={{ textAlign: "right", padding: "8px 8px", minWidth: 50 }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
              {colors.map((c) => `${c.name.trim() || "色なし"}：${sizes.map((s) => `${s.name.trim()} ${qtyOf(c, s)}`).join("・")}`).join("　")}（計 {total} 枚）
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
          <p className="hint">まだありません。上から登録すると、ここに色とサイズごとの在庫が出て、数を直せます。</p>
        )}
        {list?.map((it) => (
          <div key={it.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{it.name}</span>
              <span style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{yen(it.sizes[0]?.price ?? null)}</span>
            </div>
            <StockEditor item={it} pin={pin} onSaved={loadList} />
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
