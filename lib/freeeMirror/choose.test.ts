import { test } from "node:test";
import assert from "node:assert/strict";
import { chooseSource } from "./choose.ts";

test("読む口: ?source で比べられる。ふだんは、切り替えのスイッチが入っていて取り込めているときだけ写し", () => {
  const base = { param: null as string | null, readFromDb: true, hasData: true, dbReady: true };
  assert.equal(chooseSource(base), "db");
  assert.equal(chooseSource({ ...base, param: "freee" }), "freee");
  assert.equal(chooseSource({ ...base, readFromDb: false }), "freee"); // 比べ終わるまでは freee
  assert.equal(chooseSource({ ...base, readFromDb: false, param: "db" }), "db"); // 比べるための ?source=db
  assert.equal(chooseSource({ ...base, param: "db", dbReady: false }), "freee");
  assert.equal(chooseSource({ ...base, hasData: false }), "freee"); // まだ一度も取り込めていない
  assert.equal(chooseSource({ ...base, dbReady: false }), "freee");
});
