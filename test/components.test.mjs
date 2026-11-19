/**
 * 组件层测试：守住三条铁律。
 *   1. 学生卷与教师卷的原子序列必须同构（否则双轨必然错位）
 *   2. 答案只能出现在教师卷，且不得改变任何块的 HTML 结构
 *   3. 表外题型必须报错，不得静默降级
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { Ctx } from "../src/components/context.mjs";
import { ComponentError } from "../src/core/errors.mjs";
import { REGISTRY, SUPPORTED_TYPES, componentIdOf, resolveComponent } from "../src/components/registry.mjs";
import { loadDocProfile, loadGradeProfile } from "../src/config/tokens.mjs";
import { buildParts } from "../src/pipeline.mjs";
import { loadDocument } from "../src/domain/document.mjs";
import { answerStrings, visibleText } from "../src/domain/texts.mjs";
import { SKILL_ROOT } from "../src/core/paths.mjs";
import { join } from "node:path";

function contextFor(grade, variant) {
  return new Ctx(loadGradeProfile(grade), loadDocProfile("review"), variant, 40);
}

test("注册表覆盖 10 类题型且组件 ID 唯一", () => {
  assert.equal(SUPPORTED_TYPES.length, 10);
  const ids = SUPPORTED_TYPES.map((t) => REGISTRY[t].componentId);
  assert.equal(new Set(ids).size, ids.length);
});

test("未收录题型抛 ComponentError 并列出支持范围", () => {
  assert.throws(() => resolveComponent("unknown_type"), (err) => {
    assert.ok(err instanceof ComponentError);
    assert.match(err.message, /未收录题型/);
    return true;
  });
  assert.equal(componentIdOf("reading"), "reading_passage_block");
});

test("学生卷与教师卷的排版原子序列完全同构", () => {
  const { doc } = loadDocument(join(SKILL_ROOT, "examples/g2-review-unit56.json"));
  const student = buildParts(doc, contextFor(2, "student"));
  const teacher = buildParts(doc, contextFor(2, "teacher"));

  assert.equal(student.length, teacher.length);
  assert.deepEqual(
    student.map((p) => [p.pid, p.role, p.keepNext]),
    teacher.map((p) => [p.pid, p.role, p.keepNext]),
  );
  // HTML 结构一致：只是多了 <span class="ans"> 覆盖层
  assert.equal(visibleText(student[3].html), visibleText(teacher[3].html));
});

test("答案只出现在教师卷", () => {
  const { doc } = loadDocument(join(SKILL_ROOT, "examples/g2-review-unit56.json"));
  const student = buildParts(doc, contextFor(2, "student"));
  const teacher = buildParts(doc, contextFor(2, "teacher"));

  assert.equal(student.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.ok(teacher.flatMap((p) => answerStrings(p.html)).length > 20);
});

test("教师卷答案使用绝对定位覆盖，块内文本量不增", () => {
  const { doc } = loadDocument(join(SKILL_ROOT, "examples/g2-review-unit56.json"));
  const student = buildParts(doc, contextFor(2, "student"));
  const teacher = buildParts(doc, contextFor(2, "teacher"));

  for (const [i, part] of student.entries()) {
    const plainStudent = visibleText(part.html).replace(/\s/g, "");
    const plainTeacher = visibleText(teacher[i].html).replace(/\s/g, "");
    assert.equal(plainTeacher, plainStudent, `${part.pid} 的可见文本被答案污染`);
  }
});

test("预留行数不足时给出警告而不是裁切", () => {
  const ctx = contextFor(2, "teacher");
  const q = {
    question_id: "qx",
    type: "generic",
    stem: "测试",
    lines: 1,
    answer: "这是一段远远超过一行的很长很长的答案".repeat(4),
  };
  REGISTRY.generic.build(q, ctx, "qx");
  assert.ok(ctx.warnings.some((w) => w.includes("只预留 1 行")));
});
