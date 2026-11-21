/**
 * AST 保真测试：组件 AST 化的唯一回归门。
 *
 * 黄金基线在 Batch 0（重构前）捕获。此后每一批组件迁移都必须让
 * 当前 buildParts / REGISTRY.build 的输出与基线逐字节 deepEqual ——
 * 证明"解释器 + AST"复刻了历史 HTML，measure/QA/渲染管线因此零风险。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { captureDoc, captureType, DOC_FIXTURES, TYPE_FIXTURES, goldenPath } from "./golden/capture.mjs";

test("AST 保真：文档级样卷与黄金基线逐字节一致", () => {
  for (const fixture of DOC_FIXTURES) {
    const golden = JSON.parse(readFileSync(goldenPath(fixture.name), "utf8"));
    const current = captureDoc(fixture.path);
    assert.deepEqual(current, golden, `文档样卷 ${fixture.name} 与黄金基线不一致`);
  }
});

test("AST 保真：19 题型组件与黄金基线逐字节一致", () => {
  for (const fixture of TYPE_FIXTURES) {
    const golden = JSON.parse(readFileSync(goldenPath(fixture.name), "utf8"));
    const current = captureType(fixture);
    assert.deepEqual(current, golden, `题型 ${fixture.name} 与黄金基线不一致`);
  }
});
