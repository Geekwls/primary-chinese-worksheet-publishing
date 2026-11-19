/**
 * 打印机硬件 Profile 与物理边距补偿测试 (方向二 2.1-2.3)
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { ConfigError } from "../src/core/errors.mjs";
import { geometryOf, loadPrinterProfile, loadTokens } from "../src/config/tokens.mjs";
import { Block, Part } from "../src/domain/part.mjs";
import { paginate } from "../src/layout/paginate.mjs";

const tokens = loadTokens();

test("loadPrinterProfile 能够加载预设及默认 Profile", () => {
  const pDefault = loadPrinterProfile("default");
  assert.equal(pDefault.printer_id, "default");
  assert.equal(pDefault.margins_mm.bottom, 15.0);

  const pInkjet = loadPrinterProfile("inkjet-desktop");
  assert.equal(pInkjet.printer_id, "inkjet-desktop");
  assert.equal(pInkjet.margins_mm.bottom, 14.3);

  const pLaser = loadPrinterProfile("laser-standard");
  assert.equal(pLaser.printer_id, "laser-standard");
  assert.equal(pLaser.margins_mm.bottom, 5.0);

  const pBinding = loadPrinterProfile("binding-left");
  assert.equal(pBinding.printer_id, "binding-left");
  assert.equal(pBinding.margins_mm.left, 18.0);
});

test("loadPrinterProfile 请求不存在的 Profile 时抛出清晰错误并列出可选配置", () => {
  assert.throws(
    () => loadPrinterProfile("matrix-dot-unknown"),
    (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /未收录 matrix-dot-unknown 打印机 Profile/);
      assert.match(err.message, /已有预设/);
      return true;
    },
  );
});

test("geometryOf 默认保持基准四周对称边距", () => {
  const geo = geometryOf(tokens);
  assert.equal(geo.page_width, 210);
  assert.equal(geo.page_height, 297);
  assert.equal(geo.margin_left, 15);
  assert.equal(geo.margin_right, 15);
  assert.equal(geo.margin_top, 15);
  assert.equal(geo.margin_bottom, 15);
  assert.equal(geo.content_width, 180); // 210 - 30 = 180
  assert.equal(geo.content_top, 15);
  assert.equal(geo.content_bottom, 274); // 297 - 15 - 5 - 3 = 274
  assert.equal(geo.footer_baseline_bottom, 15);
});

test("geometryOf 正确计算喷墨机底部走纸补偿 (inkjet-desktop)", () => {
  const pInkjet = loadPrinterProfile("inkjet-desktop");
  const geo = geometryOf(tokens, pInkjet);

  assert.equal(geo.margin_bottom, 14.3);
  assert.equal(geo.content_bottom, 274.7); // 297 - 14.3 - 5 - 3 = 274.7
  assert.equal(geo.footer_baseline_bottom, 14.3);
});

test("geometryOf 正确计算标准激光机紧凑边距 (laser-standard 5mm)", () => {
  const pLaser = loadPrinterProfile("laser-standard");
  const geo = geometryOf(tokens, pLaser);

  assert.equal(geo.margin_top, 5.0);
  assert.equal(geo.margin_bottom, 5.0);
  assert.equal(geo.margin_left, 5.0);
  assert.equal(geo.margin_right, 5.0);
  assert.equal(geo.content_width, 200.0); // 210 - 10 = 200
  assert.equal(geo.content_bottom, 284.0); // 297 - 5 - 5 - 3 = 284
});

test("geometryOf 正确计算左侧装订线不对称边距 (binding-left)", () => {
  const pBinding = loadPrinterProfile("binding-left");
  const geo = geometryOf(tokens, pBinding);

  assert.equal(geo.margin_left, 18);
  assert.equal(geo.margin_right, 10);
  assert.equal(geo.content_width, 182); // 210 - 18 - 10 = 182
  assert.equal(geo.binding_gutter_mm, 8.0);
});

test("geometryOf 支持命令行显式边距覆盖 (Overrides)", () => {
  const pInkjet = loadPrinterProfile("inkjet-desktop");
  const geo = geometryOf(tokens, pInkjet, { bottom: 18.0, left: 15.0 });

  assert.equal(geo.margin_bottom, 18.0);
  assert.equal(geo.margin_left, 15.0);
  assert.equal(geo.content_bottom, 271); // 297 - 18 - 5 - 3 = 271
  assert.equal(geo.content_width, 185);
});

test("geometryOf 边距过大导致有效区域不足时报错拦截", () => {
  assert.throws(
    () => geometryOf(tokens, null, { left: 90, right: 90 }),
    (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /页面有效宽度不足/);
      return true;
    },
  );

  assert.throws(
    () => geometryOf(tokens, null, { top: 130, bottom: 130 }),
    (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /页面有效高度不足/);
      return true;
    },
  );
});

test("paginate 在不对称边距下按新的下边距和左边距安全装箱", () => {
  const pInkjet = loadPrinterProfile("inkjet-desktop");
  const geo = geometryOf(tokens, pInkjet); // 单页可用 263mm，左边距 10mm

  // 构造两个 140mm 的排版原子，总高 280mm
  const p1 = new Part("q1", "<div>Q1</div>", { group: "g" });
  const p2 = new Part("q2", "<div>Q2</div>", { group: "g" });
  const heights = { q1: 140, q2: 140 };

  const pages = paginate([p1, p2], heights, geo);
  assert.equal(pages.length, 2);

  // 验证坐标 X 严格坐落于 margin_left
  assert.equal(pages[0][0].x, 10);
  assert.equal(pages[1][0].x, 10);

  // 验证每一页最后一个块的底部不超过 content_bottom
  assert.ok(pages[0][0].y + pages[0][0].height <= geo.content_bottom + 0.3);
  assert.ok(pages[1][0].y + pages[1][0].height <= geo.content_bottom + 0.3);
});
