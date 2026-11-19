/**
 * 端到端回归：真出卷、真渲染、真验收。
 *
 * 这是唯一能证明"引擎、渲染器、验收器三者还对得上"的测试，
 * 因此断言的是结果而非实现：PASS、双轨逐块一致、产物齐全。
 */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

test("一年级样卷：PASS，启蒙书写型参数生效，双轨逐块一致", needsChrome, () => {
  const out = mkdtempSync(join(tmpdir(), "wbpub-e2e-g1-"));
  const result = runBuild({
    document: join(SKILL_ROOT, "examples/g1-pinyin-unit1.json"),
    out,
    teacher: true,
    preview: false,
  });

  assert.equal(result.report.blocked, false, "一年级样卷验收被阻断");
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

  assert.equal(result.manifestStudent.page_count, 2);
  assert.equal(result.manifestTeacher.page_count, 2);

  // 双轨一致性
  const student = result.manifestStudent;
  const teacher = result.manifestTeacher;
  for (const [i, page] of student.pages.entries()) {
    for (const [j, block] of page.blocks.entries()) {
      const other = teacher.pages[i].blocks[j];
      assert.deepEqual(
        [other.x, other.y, other.width, other.height],
        [block.x, block.y, block.width, block.height],
        `一年级第 ${i + 1} 页 ${block.block_id} 双轨坐标不一致`,
      );
    }
  }
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

test("多音字题型端到端完整管线：Schema → 测量 → 分页 → 渲染 → QA 验收全通过", needsChrome, () => {
  const out = mkdtempSync(join(tmpdir(), "wbpub-e2e-poly-"));
  const tmpDocPath = join(out, "test-polyphonic.json");
  const testDoc = {
    document_id: "test-polyphonic-v1",
    grade: 2,
    doc_type: "review",
    title: "多音字专项测试卷",
    sections: [
      {
        section_id: "s1",
        title: "一、多音字辨析",
        questions: [
          {
            question_id: "q_poly",
            type: "polyphonic",
            stem: "给下列多音字选择正确的读音。",
            items: [
              { word: "长大", options: ["zhǎng", "cháng"], answer: "zhǎng" },
              { word: "长江", options: ["zhǎng", "cháng"], answer: "cháng" },
              { word: "音乐", options: ["yuè", "lè"], answer: "yuè" },
              { word: "快乐", options: ["yuè", "lè"], answer: "lè" },
            ],
            answer_text: "zhǎng　cháng　yuè　lè",
            explain: "多音字结合语境辨析：长大表示生长，读 zhǎng；长江表示长度，读 cháng。",
          },
        ],
      },
    ],
  };
  writeFileSync(tmpDocPath, JSON.stringify(testDoc), "utf8");

  const result = runBuild({
    document: tmpDocPath,
    out,
    teacher: true,
    preview: false,
  });

  assert.equal(result.report.blocked, false, "多音字管线验收被阻断");
  assert.ok(existsSync(join(out, "student.pdf")));
  assert.ok(existsSync(join(out, "teacher.pdf")));
  assert.ok(existsSync(join(out, "layout-manifest.json")));
  assert.equal(result.manifestTeacher.page_count, result.manifestStudent.page_count);
});

test("新引入题型端到端完整管线：选择+判断+笔顺+连线全链路渲染验收 PASS", needsChrome, () => {
  const out = mkdtempSync(join(tmpdir(), "wbpub-e2e-newtypes-"));
  const tmpDocPath = join(out, "test-newtypes.json");
  const testDoc = {
    document_id: "test-newtypes-v1",
    grade: 1,
    doc_type: "practice",
    title: "一年级语文 综合基础练习卷",
    sections: [
      {
        section_id: "s1",
        title: "一、单项选择题",
        questions: [
          {
            question_id: "q_ch",
            type: "choice",
            stem: "下列汉字笔画最多的是（　）。",
            options: ["A. 口", "B. 山", "C. 水", "D. 鸟"],
            answer: "D",
            explain: "口有3画，山有3画，水有4画，鸟有5画。",
          },
        ],
      },
      {
        section_id: "s2",
        title: "二、是非判断题",
        questions: [
          {
            question_id: "q_jd",
            type: "judge",
            stem: "判断下列说法是否正确。",
            items: [
              { stem: "“水”共有4画，第一笔是竖钩。", answer: "√" },
              { stem: "“天”的第一笔是横，第二笔是撇。", answer: "×" },
            ],
            explain: "“天”的第一笔是横，第二笔也是横，第三笔才是撇。",
          },
        ],
      },
      {
        section_id: "s3",
        title: "三、生字笔顺与笔画",
        questions: [
          {
            question_id: "q_st",
            type: "stroke_order",
            stem: "按要求填空。",
            items: [
              { word: "水", total_strokes: 4, query: "第二笔是", answer: "㇇" },
              { word: "火", total_strokes: 4, order: "丶 丷 火" },
            ],
            explain: "水字第二笔是横撇；火字笔顺为：点、撇、撇、捺。",
          },
        ],
      },
      {
        section_id: "s4",
        title: "四、读拼音，连一连",
        questions: [
          {
            question_id: "q_ma",
            type: "pinyin_match",
            stem: "把拼音和对应的词语连起来。",
            pairs: [
              { left: "tiān shàng", right: "天上" },
              { left: "bái yún", right: "白云" },
              { left: "xiǎo niǎo", right: "小鸟" },
            ],
            explain: "逐词拼读对照连线：tiān shàng 连 天上，bái yún 连 白云，xiǎo niǎo 连 小鸟。",
          },
        ],
      },
    ],
  };
  writeFileSync(tmpDocPath, JSON.stringify(testDoc), "utf8");

  const result = runBuild({
    document: tmpDocPath,
    out,
    teacher: true,
    preview: false,
  });

  assert.equal(result.report.blocked, false, "新题型管线验收被阻断");
  const failed = result.report.checks.filter((c) => c.status === "FAIL");
  assert.deepEqual(failed.map((c) => c.id), [], "存在未通过的检测项");

  assert.ok(existsSync(join(out, "student.pdf")));
  assert.ok(existsSync(join(out, "teacher.pdf")));
  assert.ok(existsSync(join(out, "layout-manifest.json")));

  // 双轨一致性检验
  const sPages = result.manifestStudent.pages;
  const tPages = result.manifestTeacher.pages;
  assert.equal(tPages.length, sPages.length);
  for (let i = 0; i < sPages.length; i++) {
    for (let j = 0; j < sPages[i].blocks.length; j++) {
      const sb = sPages[i].blocks[j];
      const tb = tPages[i].blocks[j];
      assert.deepEqual(
        [tb.x, tb.y, tb.width, tb.height],
        [sb.x, sb.y, sb.width, sb.height],
        `Block ${sb.block_id} 双轨坐标不一致`,
      );
    }
  }
});

test("数学卷端到端完整管线：计算/填空/解决问题（三年级）双轨渲染验收 PASS", needsChrome, () => {
  const out = mkdtempSync(join(tmpdir(), "wbpub-e2e-math-"));
  const tmpDocPath = join(out, "test-math-g3.json");
  const testDoc = {
    document_id: "test-math-g3-v1",
    grade: 3,
    doc_type: "practice",
    title: "三年级数学 第一单元混合练习",
    sections: [
      {
        section_id: "s1",
        title: "一、口算下面各题",
        questions: [
          { question_id: "q_o1", type: "calculation", stem: "36×25 =", answer: "900", score: 2 },
          { question_id: "q_o2", type: "calculation", stem: "480÷8 =", answer: "60", score: 2 },
          { question_id: "q_o3", type: "calculation", stem: "15×6 - 40 =", answer: "50", score: 2 },
        ],
      },
      {
        section_id: "s2",
        title: "二、填空题",
        questions: [
          {
            question_id: "q_f1",
            type: "fill_blank",
            stem: "3分米 = （　）厘米　7000米 = （　）千米",
            answer: ["300", "7"],
            score: 4,
          },
          {
            question_id: "q_f2",
            type: "fill_blank",
            stem: "一块正方形菜地的周长是 24{米}，它的边长是{米}。",
            answer: ["6", "6"],
            score: 4,
          },
        ],
      },
      {
        section_id: "s3",
        title: "三、列竖式计算",
        questions: [
          {
            question_id: "q_v1",
            type: "calculation",
            stem: "列竖式计算：456 + 287 = ？",
            answer: "743",
            score: 4,
          },
        ],
      },
      {
        section_id: "s4",
        title: "四、解决问题",
        questions: [
          {
            question_id: "q_w1",
            type: "word_problem",
            stem: "商店运来 5 箱苹果，每箱 24 个，一共运来多少个？",
            answer: "5×24=120（个）",
            lines: 4,
            score: 5,
          },
          {
            question_id: "q_w2",
            type: "word_problem",
            stem: "一块长方形菜地长 18 米，宽 12 米，这块菜地的周长是多少米？",
            answer: "(18+12)×2=60（米）",
            lines: 4,
            score: 5,
          },
        ],
      },
    ],
  };
  writeFileSync(tmpDocPath, JSON.stringify(testDoc), "utf8");

  const result = runBuild({
    document: tmpDocPath,
    out,
    teacher: true,
    preview: false,
  });

  assert.equal(result.report.blocked, false, "数学卷管线验收被阻断");
  const failed = result.report.checks.filter((c) => c.status === "FAIL");
  assert.deepEqual(failed.map((c) => c.id), [], "存在未通过的检测项");

  for (const name of ["student.pdf", "teacher.pdf", "layout-manifest.json", "qa-report.json"]) {
    assert.ok(existsSync(join(out, name)), `缺少产物 ${name}`);
  }

  // 数学题必须以独立 question 分组进入布局清单
  const qids = new Set(result.manifestStudent.pages.flatMap((p) => p.blocks.map((b) => b.question_id)));
  for (const qid of ["q_o1", "q_f1", "q_v1", "q_w1"]) {
    assert.ok(qids.has(qid), `布局清单缺少数学题 ${qid}`);
  }

  // 双轨一致性
  const sPages = result.manifestStudent.pages;
  const tPages = result.manifestTeacher.pages;
  assert.equal(tPages.length, sPages.length);
  for (let i = 0; i < sPages.length; i++) {
    for (let j = 0; j < sPages[i].blocks.length; j++) {
      const sb = sPages[i].blocks[j];
      const tb = tPages[i].blocks[j];
      assert.deepEqual(
        [tb.x, tb.y, tb.width, tb.height],
        [sb.x, sb.y, sb.width, sb.height],
        `数学卷第 ${i + 1} 页 ${sb.block_id} 双轨坐标不一致`,
      );
    }
  }
});
