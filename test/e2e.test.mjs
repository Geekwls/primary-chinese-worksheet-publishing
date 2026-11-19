/**
 * 端到端回归：真出卷、真渲染、真验收。
 *
 * 这是唯一能证明"引擎、渲染器、验收器三者还对得上"的测试，
 * 因此断言的是结果而非实现：PASS、双轨逐块一致、产物齐全。
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { loadTokens } from "../src/config/tokens.mjs";
import { SKILL_ROOT } from "../src/core/paths.mjs";
import { runBuild } from "../src/pipeline.mjs";
import { findChrome } from "../src/render/chrome.mjs";

function chromeAvailable() {
  try {
    findChrome(loadTokens());
    return true;
  } catch {
    return false;
  }
}

const needsChrome = chromeAvailable() ? {} : { skip: "未安装 Chrome/Chromium，跳过端到端渲染" };

test("二年级样卷：PASS，双轨逐块一致，产物齐全", needsChrome, () => {
  const out = mkdtempSync(join(tmpdir(), "wbpub-e2e-"));
  const result = runBuild({
    document: join(SKILL_ROOT, "examples/g2-review-unit56.json"),
    out,
    teacher: true,
    preview: false,
  });

  assert.equal(result.report.blocked, false, "验收被阻断");
  const failed = result.report.checks.filter((c) => c.status === "FAIL");
  assert.deepEqual(failed.map((c) => c.id), [], "存在未通过的检测项");

  for (const name of [
    "student.pdf",
    "teacher.pdf",
    "layout-manifest.json",
    "layout-manifest-teacher.json",
    "qa-report.md",
    "qa-report.json",
  ]) {
    assert.ok(existsSync(join(out, name)), `缺少产物 ${name}`);
  }

  // 双轨一致性：页数与每块坐标必须完全相同
  const student = result.manifestStudent;
  const teacher = result.manifestTeacher;
  assert.equal(teacher.page_count, student.page_count);
  for (const [i, page] of student.pages.entries()) {
    for (const [j, block] of page.blocks.entries()) {
      const other = teacher.pages[i].blocks[j];
      assert.deepEqual(
        [other.x, other.y, other.width, other.height],
        [block.x, block.y, block.width, block.height],
        `第 ${i + 1} 页 ${block.block_id} 双轨坐标不一致`,
      );
    }
  }

  // 所有块都落在安全区内
  const { margin_x: mx, content_top: top, content_bottom: bottom, content_width: cw } = student.page;
  for (const page of student.pages) {
    for (const b of page.blocks) {
      assert.ok(b.x >= mx - 0.2 && b.x + b.width <= mx + cw + 0.2, `${b.block_id} 横向越界`);
      assert.ok(b.y >= top - 0.2 && b.y + b.height <= bottom + 0.3, `${b.block_id} 纵向越界`);
    }
  }

  const saved = JSON.parse(readFileSync(join(out, "layout-manifest.json"), "utf8"));
  assert.equal(saved.units, "mm");
  assert.equal(saved.variant, "student");
});

test("--no-teacher：只出学生卷，教师相关项标记为人工", needsChrome, () => {
  const out = mkdtempSync(join(tmpdir(), "wbpub-e2e-solo-"));
  const result = runBuild({
    document: join(SKILL_ROOT, "examples/g1-pinyin-unit1.json"),
    out,
    teacher: false,
    preview: false,
  });

  assert.equal(result.report.blocked, false);
  assert.ok(existsSync(join(out, "student.pdf")));
  assert.equal(existsSync(join(out, "teacher.pdf")), false);

  const byId = Object.fromEntries(result.report.checks.map((c) => [`${c.id}:${c.name}`, c.status]));
  const dualTrack = result.report.checks.find((c) => c.id === "P0-07");
  assert.equal(dualTrack.status, "SKIP");
  assert.ok(byId["P0-09:答案与解析未丢失/裁切"] === "SKIP");
});
