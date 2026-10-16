// テスト用の偽の KV。ex（有効期限）は無視する。
export function fakeKv() {
  const m = new Map<string, string>();
  return {
    m,
    async set(k: string, v: string, o?: { nx?: boolean; ex?: number }) {
      if (o?.nx && m.has(k)) return null;
      m.set(k, v);
      return "OK";
    },
    async get(k: string) {
      return m.get(k) ?? null;
    },
    async del(...ks: string[]) {
      let n = 0;
      for (const k of ks) if (m.delete(k)) n++;
      return n;
    },
  };
}
