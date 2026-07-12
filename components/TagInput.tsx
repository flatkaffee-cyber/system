"use client";

import { useEffect, useState } from "react";

export default function TagInput({
  tags,
  onChange,
}: {
  tags: string[];
  onChange: (t: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((j) => setSuggestions(j.tags ?? []))
      .catch(() => {});
  }, []);

  function add(t: string) {
    const v = t.trim();
    if (!v || tags.includes(v)) return;
    onChange([...tags, v]);
    setInput("");
  }
  function remove(t: string) {
    onChange(tags.filter((x) => x !== t));
  }

  return (
    <div>
      {tags.length > 0 && (
        <div className="tag-chips">
          {tags.map((t) => (
            <span key={t} className="tag-chip">
              {t}
              <button type="button" onClick={() => remove(t)}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="tag-input-row">
        <input
          list="tag-suggest"
          value={input}
          placeholder="例: 家具費 / エスプレッソマシーン"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(input);
            }
          }}
        />
        <datalist id="tag-suggest">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="button" className="tag-add" onClick={() => add(input)}>
          追加
        </button>
      </div>
      {suggestions.filter((s) => !tags.includes(s)).length > 0 && (
        <div className="tag-suggest-chips">
          {suggestions
            .filter((s) => !tags.includes(s))
            .slice(0, 8)
            .map((s) => (
              <button type="button" key={s} className="tag-suggest-chip" onClick={() => add(s)}>
                ＋{s}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
