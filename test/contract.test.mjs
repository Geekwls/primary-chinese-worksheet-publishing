/** 数据契约测试：坏数据必须在渲染前被拦下，并且报错要能指到具体字段。 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { ContractError } from "../src/core/errors.mjs";
import { loadDocument, validate } from "../src/domain/document.mjs";
import { SKILL_ROOT } from "../src/core/paths.mjs";

const example = (name) => join(SKILL_ROOT, "examples", name);

function mutate(source, fn) {
  const { doc } = loadDocument(example(source));
  fn(doc);
  const dir = mkdtempSync(join(tmpdir(), "wbpub-contract-"));
  const path = join(dir, "doc.json");
  writeFileSync(path, JSON.stringify(doc), "utf8");
  return path;
}

test("示例卷通过校验并统计题量与总分", () => {
  const { doc, warnings, stats } = loadDocument(example("g2-review-unit56.json"));
  assert.equal(doc.grade, 2);
  assert.equal(stats.question_count, 11);
  assert.equal(stats.score_sum, 100);
  assert.deepEqual(warnings, []);
});

test("缺少必需字段直接报错", () => {
  const path = mutate("g2-review-unit56.json", (doc) => delete doc.title);
  assert.throws(() => loadDocument(path), (err) => {
    assert.ok(err instanceof ContractError);
    assert.match(err.message, /title/);
    return true;
  });
});

test("question_id 重复被拦下", () => {
  const path = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions[1].question_id = doc.sections[0].questions[0].question_id;
  });
  assert.throws(() => loadDocument(path), /question_id 重复/);
});

test("未收录题型被拦下，并列出已支持题型", () => {
  const path = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions[0].type = "poetry_recite";
  });
  assert.throws(() => loadDocument(path), (err) => {
    assert.match(err.message, /未收录/);
    assert.match(err.message, /pinyin_write_word/);
    return true;
  });
});

test("看拼音写词语缺 pinyin 被拦下（不允许静默对齐失败）", () => {
  const path = mutate("g2-review-unit56.json", (doc) => {
    const q = doc.sections.flatMap((s) => s.questions).find((x) => x.type === "pinyin_write_word");
    delete q.items[0].pinyin;
  });
  assert.throws(() => loadDocument(path), /缺少 pinyin/);
});

test("阅读题缺 passage 被拦下", () => {
  const path = mutate("g2-review-unit56.json", (doc) => {
    const q = doc.sections.flatMap((s) => s.questions).find((x) => x.type === "reading");
    delete q.passage;
  });
  assert.throws(() => loadDocument(path), /passage\.paragraphs 与 passage\.dialogue 均为空/);
});

test("多音字题缺 word 或 answer 被拦下", () => {
  const pathNoWord = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions.push({
      question_id: "q_poly",
      type: "polyphonic",
      stem: "多音字",
      items: [{ options: ["a", "b"], answer: "a" }],
    });
  });
  assert.throws(() => loadDocument(pathNoWord), /缺少 word/);

  const pathNoAns = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions.push({
      question_id: "q_poly2",
      type: "polyphonic",
      stem: "多音字",
      items: [{ word: "长", options: ["a", "b"] }],
    });
  });
  assert.throws(() => loadDocument(pathNoAns), /缺少 answer/);
});

test("新引入题型完整契约校验：选择/判断/笔顺/连线不合规被拦截", () => {
  // 选择题缺 options
  const pChoice = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions.push({ question_id: "qc_bad", type: "choice", stem: "选一选" });
  });
  assert.throws(() => loadDocument(pChoice), /缺少 options\/answer/);

  // 判断题缺 answer
  const pJudge = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions.push({ question_id: "qj_bad", type: "judge", stem: "判断题" });
  });
  assert.throws(() => loadDocument(pJudge), /缺少 answer/);

  // 笔顺题缺 word
  const pStroke = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions.push({ question_id: "qs_bad", type: "stroke_order", stem: "笔顺" });
  });
  assert.throws(() => loadDocument(pStroke), /缺少 word 或 items/);

  // 连线题缺 items/pairs
  const pMatch = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions.push({ question_id: "qm_bad", type: "pinyin_match", stem: "连一连" });
  });
  assert.throws(() => loadDocument(pMatch), /缺少 items 或 pairs/);
});

test("总分不一致只告警，不阻断", () => {
  const path = mutate("g2-review-unit56.json", (doc) => {
    doc.total_score = 120;
  });
  const { warnings } = loadDocument(path);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /总分不一致/);
});

test("空大题只告警", () => {
  const doc = {
    document_id: "empty-section",
    grade: 2,
    title: "测试卷",
    sections: [{ title: "一、空大题", questions: [] }],
  };
  const { warnings, stats } = validate(doc);
  assert.equal(stats.question_count, 0);
  assert.match(warnings[0], /没有题目/);
});

test("文件不存在给出明确错误", () => {
  assert.throws(() => loadDocument(join(tmpdir(), "不存在.json")), /题目文件不存在/);
});
