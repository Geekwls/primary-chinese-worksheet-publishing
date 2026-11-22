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

test("填空矩阵模式：items 内嵌 {} 答案可免 q.answer，缺 {} 被拦截", () => {
  // 合法：items 模式，无 q.answer
  const docOk = {
    document_id: "fb-items-ok",
    grade: 2,
    title: "测试卷",
    sections: [{
      title: "一、填空",
      questions: [{
        question_id: "q_fb1", type: "fill_blank", stem: "在括号里填上合适的量词。",
        items: ["一{艘}军舰", "一{孔}石桥"], cols: 2,
      }],
    }],
  };
  const { warnings } = validate(docOk);
  assert.deepEqual(warnings, []);

  // 不合法：items 条目缺少 {} 答案
  const docBad = JSON.parse(JSON.stringify(docOk));
  docBad.sections[0].questions[0].items = ["一（）军舰", "一{孔}石桥"];
  assert.throws(() => validate(docBad), /缺少 \{\} 答案/);
});

test("连词成句/标点运用：缺 items 或条目字段被拦截", () => {
  // 连词成句缺 items
  const pOrder = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions.push({ question_id: "qso_bad", type: "sentence_order", stem: "连词成句" });
  });
  assert.throws(() => loadDocument(pOrder), /缺少 items/);

  // 连词成句条目缺 answer
  const pOrderBad = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions.push({
      question_id: "qso_bad2", type: "sentence_order", stem: "连词成句",
      items: [{ words: ["秋天", "来了"] }],
    });
  });
  assert.throws(() => loadDocument(pOrderBad), /缺少 words\/answer/);

  // 标点运用条目缺 answer
  const pPunct = mutate("g2-review-unit56.json", (doc) => {
    doc.sections[0].questions.push({
      question_id: "qp_bad", type: "punctuation", stem: "加标点",
      items: [{ text: "秋天来了" }],
    });
  });
  assert.throws(() => loadDocument(pPunct), /缺少 text\/before 或 answer/);
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

test("QA 规则 B-02/C-01/B-01：缺分值、指令-槽不一致、大题和值触发警告", () => {
  const doc = {
    document_id: "qa-rules",
    grade: 2,
    title: "测试卷",
    total_score: 100,
    sections: [
      {
        title: "一、阅读",
        score: 10,
        questions: [{
          question_id: "qr", type: "reading", stem: "读短文，完成练习。", score: 5,
          passage: { title: "短文", paragraphs: ["一段话。"] },
          subs: [
            { stem: "短文共有{2}个自然段。", answer: "2", lines: 0, score: 2 },
            { stem: "“我”是什么？", answer: "水", lines: 0 },
            { stem: "写了{3}句话。（3分）", answer: "3", lines: 0 },
          ],
        }],
      },
      {
        title: "二、句子",
        score: 9,
        questions: [{
          question_id: "qs", type: "sentence_rewrite", stem: "写句子。", score: 8,
          items: [{ sentence: "例：树像伞。", require: "（写比喻句）", scaffold: "{云}像{棉花糖}。", score: 4 },
                   { sentence: "例：我很开心。", require: "（扩句）", answer: "我非常开心。", lines: 1 }],
        }],
      },
      {
        title: "三、填空",
        score: 2,
        questions: [{
          question_id: "qf", type: "fill_blank", stem: "在括号里填上合适的词。一（）军舰",
          answer: ["艘"], score: 2,
        }],
      },
    ],
  };
  const { warnings } = validate(doc);
  const joined = warnings.join("\n");
  assert.match(joined, /qr 阅读第 2 小题缺分值标注/, "无 score 且 stem 无（N分）应告警");
  assert.ok(!/阅读第 1 小题缺分值/.test(joined), "有 score 字段不告警");
  assert.ok(!/阅读第 3 小题缺分值/.test(joined), "stem 含（3分）不告警");
  assert.match(joined, /qs 句子小题第 2 题缺分值标注/);
  assert.match(joined, /qf 题干要求「括号里填」但渲染为横线槽/);
  // B-01：一 10 分 vs 合计 2+3 = 5；二 8 分 vs 合计 4
  assert.match(joined, /大题「一、阅读」标注 10 分，各题合计 5 分/);
  assert.match(joined, /大题「二、句子」标注 9 分，各题合计 8 分/);
  assert.ok(!/「三、填空」标注/.test(joined), "和值一致不告警");

  // C-01 反向：矩阵模式 + 措辞「横线」也应告警
  const doc2 = JSON.parse(JSON.stringify(doc));
  doc2.sections[2].questions[0] = {
    question_id: "qf2", type: "fill_blank", stem: "在横线上填上合适的量词。",
    items: ["一{艘}军舰"], score: 2,
  };
  const { warnings: w2 } = validate(doc2);
  assert.match(w2.join("\n"), /矩阵模式渲染为括号留白，但题干写的是「横线」/);
});
