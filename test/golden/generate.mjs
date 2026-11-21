/**
 * 黄金基线生成脚本（一次性工具，AST 化 Batch 0 执行）：
 *   node test/golden/generate.mjs
 *
 * 快照取自重构前的组件层输出。此后每一批组件 AST 化都必须通过
 * test/ast-fidelity.test.mjs 的逐字节比对。
 */
import { writeFileSync } from "node:fs";

import { captureDoc, captureType, DOC_FIXTURES, TYPE_FIXTURES, goldenPath } from "./capture.mjs";

for (const fixture of DOC_FIXTURES) {
  const snapshot = captureDoc(fixture.path);
  writeFileSync(goldenPath(fixture.name), JSON.stringify(snapshot, null, 2), "utf8");
  console.log(`golden: ${fixture.name}（student ${snapshot.student.parts.length} parts / teacher ${snapshot.teacher.parts.length} / explain ${snapshot.explain.parts.length}）`);
}

for (const fixture of TYPE_FIXTURES) {
  const snapshot = captureType(fixture);
  writeFileSync(goldenPath(fixture.name), JSON.stringify(snapshot, null, 2), "utf8");
  console.log(`golden: ${fixture.name}（student ${snapshot.student.parts.length} parts / teacher ${snapshot.teacher.parts.length}）`);
}

console.log("黄金基线生成完毕。");
