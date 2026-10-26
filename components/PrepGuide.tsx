"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// 仕込むときに開く画面。仕込み方（手順）・材料・今日の量を大きく出し、下で仕込んだ量を入れて記録する。
// 「仕込み」画面と業務チェックの「今日の仕込み」から開く。手順は「仕込みの設定」で直せる。

export type PrepGuideItem = {
  id: string;
  name: string;
  /** 今日の量（表示用） */
  batch: string;
  /** 今日の量（数値）。入力欄の初期値 */
  batchNum: number | null;
  unit: string;
  steps?: string[];
  stepsDraft?: boolean;
  materials?: string;
  note?: string;
  photo?: { src: string; caption?: string };
};

export default function PrepGuide({
  item,
  busy,
  today,
  onRecord,
  onClose,
}: {
  item: PrepGuideItem;
  busy: boolean;
  /** 営業日（朝6時切替）。仕込んだ日の初期値で、これより先の日は選べない */
  today: string;
  /** 仕込んだ量と日を記録する。単位の無い品目は qty なし。記録し忘れた日の分は date を前の日にする */
  onRecord: (qty: number | undefined, date: string) => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(item.batchNum != null ? String(item.batchNum) : "");
  const [date, setDate] = useState(today);
  const [done, setDone] = useState<number[]>([]);
  const steps = item.steps ?? [];

  // 開いている間は後ろをスクロールさせない。Esc で閉じる
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!date || date > today) return;
    if (!item.unit) return onRecord(undefined, date);
    const n = Number(qty);
    if (qty.trim() === "" || Number.isNaN(n) || n <= 0) return;
    onRecord(n, date);
  };

  return (
    <div className="pg-wrap" role="dialog" aria-modal="true" aria-labelledby="pg-title">
      <button type="button" className="pg-scrim" aria-label="閉じる" onClick={onClose} />
      <div className="pg-sheet">
        <div className="pg-head">
          <div>
            <h2 id="pg-title" className="pg-title">{item.name}</h2>
            <div className="pg-batch">今日の量 <strong>{item.batch || "—"}</strong></div>
          </div>
          <button type="button" className="pg-x" onClick={onClose} aria-label="閉じる">
            <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
              <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="pg-body">
          {item.materials && (
            <section className="pg-sec">
              <h3>材料</h3>
              <p>{item.materials}</p>
            </section>
          )}

          <section className="pg-sec">
            <h3>
              仕込み方
              {item.stepsDraft && <span className="pg-draft">下書き</span>}
            </h3>
            {steps.length === 0 ? (
              <p className="pg-empty">
                仕込み方がまだ入っていません。<Link href="/shikomi/settings">仕込みの設定</Link>から入れられます。
              </p>
            ) : (
              <ol className="pg-steps">
                {steps.map((s, i) => {
                  const on = done.includes(i);
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        className={`pg-step ${on ? "on" : ""}`}
                        aria-pressed={on}
                        onClick={() => setDone(on ? done.filter((x) => x !== i) : [...done, i])}
                      >
                        <span className="pg-num">{on ? "✓" : i + 1}</span>
                        <span className="pg-text">{s}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            {item.stepsDraft && steps.length > 0 && (
              <p className="pg-hint">店のやり方と違うところは、仕込みの設定で直してください。</p>
            )}
            {steps.length > 0 && <p className="pg-hint">終わった手順を押すと印が付きます。</p>}
          </section>

          {item.photo && (
            <section className="pg-sec">
              <h3>仕上がり</h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.photo.src}
                alt={item.photo.caption ?? `${item.name}の仕上がり`}
                style={{ width: "100%", maxWidth: 360, borderRadius: 10, display: "block" }}
              />
              {item.photo.caption && <p className="pg-hint">{item.photo.caption}</p>}
            </section>
          )}

          {item.note && (
            <section className="pg-sec">
              <h3>注意</h3>
              <p>{item.note}</p>
            </section>
          )}
        </div>

        <form className="pg-foot" onSubmit={submit}>
          <div className="pg-day">
            <label htmlFor="pg-date">仕込んだ日</label>
            <input
              id="pg-date"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
            {date !== today && (
              <span className="pg-past">
                {Number(date.slice(5, 7))}/{Number(date.slice(8, 10))}の記録として入れます（記録し忘れた分）
              </span>
            )}
          </div>
          {item.unit ? (
            <>
              <label htmlFor="pg-qty">仕込んだ量</label>
              <input
                id="pg-qty"
                inputMode="decimal"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <span className="pg-unit">{item.unit}</span>
            </>
          ) : (
            <span className="pg-unit">仕込み終わったら記録する</span>
          )}
          <button type="submit" className="pg-rec" disabled={busy}>
            {busy ? "記録中…" : "記録する"}
          </button>
        </form>
      </div>

      <style jsx>{`
        .pg-wrap { position: fixed; inset: 0; z-index: 980; display: flex; align-items: flex-end; justify-content: center; }
        .pg-scrim { position: absolute; inset: 0; border: 0; padding: 0; background: rgba(20, 18, 15, 0.45); }
        .pg-sheet {
          position: relative;
          width: min(560px, 100%);
          max-height: min(92vh, 900px);
          display: flex;
          flex-direction: column;
          background: var(--bg);
          border-radius: 16px 16px 0 0;
          box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.18);
          animation: pg-in 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @media (min-width: 700px) {
          .pg-wrap { align-items: center; }
          .pg-sheet { border-radius: 16px; }
        }
        @keyframes pg-in { from { transform: translateY(24px); opacity: 0.5; } to { transform: none; opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .pg-sheet { animation: none; } }
        .pg-head {
          display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;
          padding: 18px 18px 12px; border-bottom: 1px solid var(--line);
        }
        .pg-title { margin: 0; font-size: 19px; line-height: 1.35; }
        .pg-batch { margin-top: 4px; font-size: 14px; color: var(--muted); }
        .pg-batch strong { color: #9c4a12; font-size: 16px; }
        .pg-x {
          width: 38px; height: 38px; flex-shrink: 0; display: grid; place-items: center;
          border: 1px solid var(--line); border-radius: 10px; background: var(--card); color: var(--ink); cursor: pointer;
        }
        .pg-body { overflow-y: auto; overscroll-behavior: contain; padding: 4px 18px 12px; }
        .pg-sec { margin-top: 14px; }
        .pg-sec h3 { margin: 0 0 6px; font-size: 13px; color: var(--muted); letter-spacing: 0.04em; display: flex; align-items: center; gap: 6px; }
        .pg-sec p { margin: 0; font-size: 14.5px; line-height: 1.7; }
        .pg-draft { font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: #fdf0e6; color: #9c5f22; letter-spacing: 0; }
        .pg-empty { color: var(--muted); }
        .pg-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
        .pg-step {
          width: 100%; display: flex; gap: 12px; align-items: flex-start; text-align: left;
          padding: 12px 12px; border: 1px solid var(--line); border-radius: 12px; background: var(--card);
          font: inherit; color: var(--ink); cursor: pointer;
        }
        .pg-step.on { background: #eaf6ec; border-color: #b7dfc0; }
        .pg-step.on .pg-text { color: var(--muted); }
        .pg-step:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .pg-num {
          flex-shrink: 0; width: 28px; height: 28px; border-radius: 999px; display: grid; place-items: center;
          background: var(--ink); color: #fff; font-weight: 800; font-size: 14px; font-variant-numeric: tabular-nums;
        }
        .pg-step.on .pg-num { background: var(--ok); }
        .pg-text { font-size: 15.5px; line-height: 1.6; }
        .pg-hint { margin-top: 6px !important; font-size: 12px !important; color: var(--muted); }
        .pg-foot {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          padding: 12px 18px calc(12px + env(safe-area-inset-bottom));
          border-top: 1px solid var(--line); background: var(--card); border-radius: 0 0 16px 16px;
        }
        .pg-foot label { margin: 0; font-size: 13px; font-weight: 700; }
        .pg-day { width: 100%; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .pg-foot .pg-day input { width: auto; font-size: 15px; font-weight: 600; text-align: left; padding: 6px 8px; }
        .pg-past { font-size: 12px; color: #9c5f22; font-weight: 700; }
        .pg-foot input { width: 96px; font-size: 18px; font-weight: 700; text-align: right; padding: 8px 10px; font-variant-numeric: tabular-nums; }
        .pg-unit { font-size: 14px; color: var(--muted); }
        .pg-rec {
          margin-left: auto; padding: 11px 20px; border: 0; border-radius: 10px;
          background: var(--ok); color: #fff; font: inherit; font-weight: 800; font-size: 15px; cursor: pointer;
        }
        .pg-rec:disabled { opacity: 0.6; }
        .pg-rec:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
      `}</style>
    </div>
  );
}
