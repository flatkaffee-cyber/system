"use client";

import { useRef, useState, useEffect } from "react";
import Nav from "@/components/Nav";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "メンバーが立て替えた仕入の領収書、freeeでどう登録する？",
  "エスプレッソマシン25万円を買った。会計処理は？",
  "水道光熱費を口座振替で払った。科目は？",
  "役員報酬はいつから・いくらで登録すればいい？",
];

export default function Soudan() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, streaming]);

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
        body: JSON.stringify({ messages: next }),
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
          content: `すみません、エラーが出ました（${msg}）。もう一度お試しください。`,
        };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <div className="wrap">
      <header>
        <h1>☕ flat. 会計サポート</h1>
        <p>会計の困りごとを文章で相談 → やり方を提案します</p>
      </header>
      <Nav />

      <div className="chat" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="card">
            <p style={{ marginTop: 0, fontSize: 14 }}>
              例えばこんな相談ができます👇
            </p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                className="suggestion"
                onClick={() => send(s)}
              >
                {s}
              </button>
            ))}
            <p className="hint">
              ※ いまは助言のみ（freeeの直接読み書きは開発中）。状況を具体的に書くほど精度が上がります。
            </p>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          placeholder="会計の相談を書く（例：仕入の立替をどう登録する？）"
          rows={2}
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
      <p className="hint" style={{ textAlign: "center" }}>
        ⌘/Ctrl + Enter で送信
      </p>
    </div>
  );
}
