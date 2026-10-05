// 品名から数量・単価の表記を落として、同じ商品をひとつにまとめる。
//
// 領収書の品名は買った数で文字列が変わる。
//   「くらしモアピュア6枚 2コ×単118」
//   「くらしモアピュア6枚 3コ×単118」
// これを別の商品として扱うと、品目を覚えさせても次に個数が変わった途端に
// また分からなくなる。判定と学習の両方でこの形にそろえてから使う。

/** 品名から数量・単価表記などのノイズを落として、同じ商品をまとめられる形にする */
export function normalizeItemName(raw: string): string {
  let s = String(raw || "").trim();
  if (!s) return "";
  s = s.replace(/　/g, " ");
  // 括弧内の補足（まとめ売り値下、一括割引後 等）を先に除去
  s = s.replace(/[（(][^）)]*[）)]/g, " ");
  // 「@1,080×2」「＠495x2」など単価×数量
  s = s.replace(/[@＠]\s*[\d,]+\s*[×✕╳xX*＊]\s*\d+/g, " ");
  // 「2コ×単100」「5コ×単148」「2個×178」など 数量×単価
  s = s.replace(
    /\d+\s*(コ|個|本|枚|点|袋|缶|パック|P|ｹ|ヶ)?\s*[×✕╳xX*＊]\s*単?\s*[\d,]+/g,
    " ",
  );
  // 「×3」「x2」など末尾の数量
  s = s.replace(/[×✕╳xX*＊]\s*\d+\s*(コ|個|本|枚|点|袋|缶|パック)?/g, " ");
  // 「3個」「2コ」「4点」など単独の数量
  s = s.replace(/\d+\s*(コ|個|本|枚|点|袋|缶|パック|ヶ)(入)?(?![a-zA-Z])/g, " ");
  // 残った金額表記
  s = s.replace(/[¥￥][\d,]+/g, " ");
  // 「ロイヤルブレッド 2個×」のように、数量だけ消えて記号が残る形の後始末
  s = s.replace(/[×✕╳*＊@＠]+\s*$/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/**
 * 覚えさせるキーワードの既定値。
 * 数量を落としたうえで、空になってしまうときは元の品名に戻す
 * （まるごと数量表記だった場合に、キーワードが消えないように）。
 */
export function defaultKeyword(productName: string): string {
  const n = normalizeItemName(productName);
  return n || String(productName ?? "").trim();
}

/**
 * キーワードの照合用に、読み取りでブレやすい違いを消した形にする。
 * OCRは「お酒にプラス」を「お酒ニプラス」と読むなど、ひらがな・カタカナや
 * 全角・半角を取り違えるので、照合のときだけそろえる（表示や保存には使わない）。
 */
export function foldForMatch(raw: string): string {
  return String(raw || "")
    .normalize("NFKC")
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** 数量表記だけを無視した照合（これまでどおりの当て方） */
function exactMatches(productName: string, keyword: string): boolean {
  const k = String(keyword || "").trim();
  if (!k) return false;
  const s = String(productName || "");
  const n = normalizeItemName(s);
  const nk = normalizeItemName(k) || k;
  return s.includes(k) || (!!n && (n.includes(k) || n.includes(nk)));
}

/** 品名がこのキーワードに当たるか（数量表記・かなの種類・全角半角の違いは無視） */
export function keywordMatches(productName: string, keyword: string): boolean {
  const k = String(keyword || "").trim();
  if (!k) return false;
  const s = String(productName || "");
  if (exactMatches(s, k)) return true;
  const fs = foldForMatch(s);
  const fn = foldForMatch(normalizeItemName(s));
  const fk = foldForMatch(k);
  const fnk = foldForMatch(normalizeItemName(k) || k);
  return [fk, fnk].some((x) => !!x && (fs.includes(x) || (!!fn && fn.includes(x))));
}

/**
 * 覚えさせた対応表から品目を引く。長いキーワードを優先する。
 * まずこれまでどおりの当て方で探し、当たらないときだけ、かなの種類などの違いを無視して探す
 * （ゆるい照合が、すでに当たっている品目を横取りしないように）。
 */
export function matchOverride(productName: string, overrides: Record<string, string>): string | null {
  const keys = Object.keys(overrides).sort((a, b) => b.length - a.length);
  for (const k of keys) if (exactMatches(productName, k)) return overrides[k];
  for (const k of keys) if (keywordMatches(productName, k)) return overrides[k];
  return null;
}
