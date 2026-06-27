"use client";

import { useRef, useState, useEffect } from "react";
import { CATEGORIES, type Category } from "@/lib/receipt";

type Msg = { role: "user" | "assistant"; content: string };

type Props = {
  date: string;
  vendor: string;
  total: number;
  summary: string;
  category: string;
  payer: string;
  onApplyCategory: (c: Category) => void;
};

// AIの返答テキストから科目候補を1つ拾う（「おすすめ科目：◯◯」優先、無ければ本文から）
function detectCategory(text: string): Category | null {
  const m = text.match(/おすすめ科目[：:]\s*([^\n（(]+)/);
  if (m) {
    const name = m[1].trim();
    const hit = CATEGORIES.find((c) => name.includes(c) || c.includes(name));
    if (hit) return hit;
  }
  for (const c of CATEGORIES) {
    if (c !== "不明" && text.includes(c)) return c;
  }
  return null;
}

export default function ReceiptChat({
  date,
  vendor,
  total,
  summary,
  category,
  payer,
  onApplyCategory,
}: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages, streaming]);

  const receiptContext =
    `日付:${date || "不明"} / 店:${vendor || "不明"} / 金額:${total}円 / ` +
    `内容:${summary || "不明"} / 立替えた人:${payer} / 現在の科目候補:${category}`;

  async function send(text: string) {
    const q = text.trim();
    if (!q || streaming) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, receiptContext }),
      });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "エラー";
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `エラーが出ました（${msg}）。`,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  const last = messages[messages.length - 1];
  const suggestion =
    last && last.role === "assistant" && !streaming
      ? detectCategory(last.content)
      : null;

  return (
    <div className="rc">
      <button type="button" className="rc-toggle" onClick={() => setOpen(!open)}>
        🤔 わからない？ AIに相談（この領収書のことを分かった状態で答えます）
      </button>

      {open && (
        <div className="rc-body">
          <div className="rc-msgs" ref={boxRef}>
            {messages.length === 0 && (
              <p className="hint" style={{ marginTop: 0 }}>
                例：「着払いの送料を現金で払った」「これは設備？消耗品？」など。
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
              </div>
            ))}
          </div>

          {suggestion && suggestion !== category && (
            <button
              type="button"
              className="rc-apply"
              onClick={() => onApplyCategory(suggestion)}
            >
              ✓ 科目を「{suggestion}」にする
            </button>
          )}

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <textarea
              rows={2}
              value={input}
              placeholder="この領収書について相談する"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  send(input);
                }
              }}
            />
            <button className="primary" type="submit" disabled={streaming || !input.trim()}>
              {streaming ? <span className="spinner" /> : "送信"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
