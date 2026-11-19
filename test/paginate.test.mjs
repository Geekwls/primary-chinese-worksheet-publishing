/**
 * 分页测试：这是"宁可多一页，也不能出残卷"的守门人。
 * 用例覆盖翻页、keepNext 绑定、以及"单块高于整页必须报错"。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { LayoutError } from "../src/core/errors.mjs";
import { Part } from "../src/domain/part.mjs";
import { manifestOf } from "../src/layout/manifest.mjs";
import { paginate } from "../src/layout/paginate.mjs";

const geo = {
  page_width: 210,
  page_height: 297,
  margin_x: 12,
  margin_y: 12,
  content_width: 186,
  content_top: 12,
  content_bottom: 276, // 单页可用 264mm
  footer_baseline_bottom: 12,
};

const part = (pid, extra = {}) => new Part(pid, "", { group: "g", ...extra });
const heightsOf = (list, h) => Object.fromEntries(list.map((p) => [p.pid, typeof h === "function" ? h(p) : h]));

test("内容刚好放得下时只有一页", () => {
  const parts = [part("a"), part("b")];
  const pages = paginate(parts, heightsOf(parts, 100), geo);
  assert.equal(pages.length, 1);
  assert.deepEqual(pages[0].map((b) => b.pid), ["a", "b"]);
  assert.equal(pages[0][0].y, 12);
  assert.equal(pages[0][1].y, 112);
});

test("放不下时整体换页，不压缩高度", () => {
  const parts = [part("a"), part("b"), part("c")];
  const pages = paginate(parts, heightsOf(parts, 200), geo);
  assert.equal(pages.length, 3);
  for (const page of pages) assert.equal(page.length, 1);
  for (const page of pages) assert.equal(page[0].height, 200);
});

test("keepNext 把题干与首行作答区绑在同一页", () => {
  // 首页剩余 30mm：题干(20) 单独放得下，但与下一块(20) 一起放不下 → 一起翻页
  const parts = [part("filler"), part("stem", { keepNext: true }), part("body")];
  const heights = { filler: 234, stem: 20, body: 20 };
  const pages = paginate(parts, heights, geo);
  assert.equal(pages.length, 2);
  assert.deepEqual(pages[0].map((b) => b.pid), ["filler"]);
  assert.deepEqual(pages[1].map((b) => b.pid), ["stem", "body"]);
});

test("下一块本身超页时放弃绑定约束，避免死循环", () => {
  const parts = [part("stem", { keepNext: true }), part("body")];
  const heights = { stem: 100, body: 300 };
  assert.throws(() => paginate(parts, heights, geo), LayoutError);
});

test("单块高于整页直接报错，并给出可用高度", () => {
  const parts = [part("huge", { label: "passage" })];
  assert.throws(
    () => paginate(parts, { huge: 300 }, geo),
    (err) => {
      assert.ok(err instanceof LayoutError);
      assert.match(err.message, /超过单页可用高度/);
      assert.match(err.message, /264\.0mm/);
      return true;
    },
  );
});

test("高度为负或缺失都算引擎故障", () => {
  assert.throws(() => paginate([part("x")], { x: -1 }, geo), /高度为负/);
  assert.throws(() => paginate([part("x")], {}, geo), /没有实测高度/);
});

test("空文档报错而不是产出 0 页 PDF", () => {
  assert.throws(() => paginate([], {}, geo), /没有任何可排版内容/);
});

test("亚毫米级浮点噪声不会白白多翻一页", () => {
  const parts = [part("a"), part("b")];
  const pages = paginate(parts, { a: 264.2, b: 264.2 }, geo); // 264.2 略超，但 a 单独可容纳
  assert.equal(pages.length, 2);
});

test("布局清单记录每页填充量与块坐标", () => {
  const parts = [part("a"), part("b"), part("c")];
  const pages = paginate(parts, heightsOf(parts, 200), geo);
  const manifest = manifestOf(pages, geo, {
    document_id: "t",
    grade: 2,
    variant: "student",
    layout_version: "1.0.0",
  });
  assert.equal(manifest.page_count, 3);
  assert.deepEqual(manifest.content_used_mm, [200, 200, 200]);
  assert.deepEqual(Object.keys(manifest.pages[0].blocks[0]), [
    "block_id",
    "question_id",
    "role",
    "x",
    "y",
    "width",
    "height",
    "label",
  ]);
});
