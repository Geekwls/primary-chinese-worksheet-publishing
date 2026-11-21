/**
 * 学科 Profile 覆盖层机制测试。
 *
 * 数据文件暂不发布（assets/profiles/subjects/ 只有 README），本文件用
 * 临时目录注入一个 math overlay 验证合成语义：
 *   1. 无 overlay / 中文 → 基底原样返回
 *   2. overlay 二级键覆盖生效，未覆盖键继承基底
 *   3. 新增键、身份键 → ConfigError（学科层不得偷改全局规范）
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { loadGradeProfile } from "../src/config/tokens.mjs";
import { ConfigError } from "../src/core/errors.mjs";
import { PROFILES_DIR } from "../src/core/paths.mjs";

const SUBJECTS_DIR = join(PROFILES_DIR, "subjects");

function withOverlay(body, fn) {
  mkdirSync(SUBJECTS_DIR, { recursive: true });
  writeFileSync(join(SUBJECTS_DIR, "math-grade-3.json"), JSON.stringify(body), "utf8");
  try {
    return fn();
  } finally {
    rmSync(join(SUBJECTS_DIR, "math-grade-3.json"), { force: true });
  }
}

test("overlay: 无覆盖层/中文时返回学科无关基底", () => {
  const base = loadGradeProfile(3);
  const chinese = loadGradeProfile(3, "chinese");
  const mathNoFile = loadGradeProfile(3, "math");
  assert.deepEqual(chinese, base);
  assert.deepEqual(mathNoFile, base);
});

test("overlay: 二级键覆盖生效且未覆盖键继承基底", () => {
  withOverlay({ label: "三年级 · 数学运算型", font_pt: { question: 11 }, geometry: { writing_line_gap_mm: 8.5 } }, () => {
    const base = loadGradeProfile(3);
    const merged = loadGradeProfile(3, "math");
    assert.equal(merged.label, "三年级 · 数学运算型");
    assert.equal(merged.font_pt.question, 11, "覆盖键生效");
    assert.equal(merged.font_pt.title, base.font_pt.title, "未覆盖键继承");
    assert.equal(merged.geometry.writing_line_gap_mm, 8.5);
    assert.equal(merged.geometry.tianzi_mm, base.geometry.tianzi_mm);
    assert.equal(merged.profile_id, "grade-3", "身份键保持基底值");
  });
});

test("overlay: 二级新增键被拒绝", () => {
  withOverlay({ geometry: { bogus_key: 1 } }, () => {
    assert.throws(() => loadGradeProfile(3, "math"), (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /geometry\.bogus_key/);
      return true;
    });
  });
});

test("overlay: 顶层新增节被拒绝", () => {
  withOverlay({ brand_new_section: { x: 1 } }, () => {
    assert.throws(() => loadGradeProfile(3, "math"), (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /brand_new_section/);
      return true;
    });
  });
});

test("overlay: 身份键（profile_id/grade）被拒绝", () => {
  withOverlay({ profile_id: "fake", grade: 9 }, () => {
    assert.throws(() => loadGradeProfile(3, "math"), (err) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /身份键/);
      return true;
    });
  });
});
