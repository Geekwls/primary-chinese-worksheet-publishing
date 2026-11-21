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

test("注册表覆盖 21 类题型且组件 ID 唯一", () => {
  assert.equal(SUPPORTED_TYPES.length, 21);
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
  assert.equal(componentIdOf("polyphonic"), "polyphonic_choice_group");
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

test("多音字辨析组件：支持双轨且答案只在教师卷渲染", () => {
  const q = {
    question_id: "qp",
    type: "polyphonic",
    stem: "选择正确的读音。",
    items: [
      { word: "长大", options: ["zhǎng", "cháng"], answer: "zhǎng" },
      { word: "音乐", options: ["yuè", "lè"], answer: "yuè" },
    ],
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.polyphonic.build(q, ctxS, "qp");
  const partsT = REGISTRY.polyphonic.build(q, ctxT, "qp");

  assert.equal(partsS.length, partsT.length);
  assert.equal(partsS[1].splittable, false, "多音字选项行必须为不可拆分 (splittable: false)");
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.equal(partsT.flatMap((p) => answerStrings(p.html)).length, 2);
});

test("阅读理解小题变体：选择题与判断题在学生卷留空槽、教师卷覆盖答案", () => {
  const q = {
    question_id: "qr",
    type: "reading",
    stem: "读短文，回答问题。",
    passage: { paragraphs: ["小鸟和青蛙在争论天有多大。"] },
    subs: [
      { sub_type: "choice", stem: "文章写了谁和谁在争论？", options: ["A. 小鸟和青蛙", "B. 青蛙和小鱼"], answer: "A" },
      { sub_type: "judge", stem: "小鸟认为天只有井口那么大。", answer: "×" },
    ],
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.reading.build(q, ctxS, "qr");
  const partsT = REGISTRY.reading.build(q, ctxT, "qr");

  assert.equal(partsS.length, partsT.length);
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.equal(partsT.flatMap((p) => answerStrings(p.html)).length, 2);
  assert.ok(partsS[2].html.includes("sub-options"));
});

test("看图写话组件：支持图文配图与题目提示", () => {
  const q = {
    question_id: "qc",
    type: "composition",
    stem: "看图写话。",
    rows: 4,
    prompt: "看看图中有谁，他们在做什么。",
    image: { src: "test.png", height_mm: 30, caption: "仔细观察小动物" },
  };
  const ctx = contextFor(2, "student");
  const parts = REGISTRY.composition.build(q, ctx, "qc");
  assert.ok(parts[0].html.includes("comp-img"));
  assert.ok(parts[0].html.includes("仔细观察小动物"));
});

test("独立选择题组件：支持自适应选项分栏与双轨同构答案", () => {
  const q = {
    question_id: "q_ch",
    type: "choice",
    stem: "选择正确读音（把序号填在括号里）。",
    items: [
      { stem: "下列词语读音正确的是", options: ["A. 仔细（zǐ）", "B. 音乐（lè）"], answer: "A" },
      { stem: "下列生字笔画最多的是", options: ["A. 口", "B. 鸟", "C. 水", "D. 长"], answer: "B" },
    ],
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.choice.build(q, ctxS, "q_ch");
  const partsT = REGISTRY.choice.build(q, ctxT, "q_ch");

  assert.equal(partsS.length, partsT.length);
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.equal(partsT.flatMap((p) => answerStrings(p.html)).length, 2);
  assert.ok(partsS[1].html.includes("choice-options"));
});

test("独立判断题组件：支持陈述句与右侧对齐判断括号槽", () => {
  const q = {
    question_id: "q_jd",
    type: "judge",
    stem: "判断下列说法是否正确。",
    items: [
      { stem: "“水”共有 4 笔。", answer: "√" },
      { stem: "“天”的第一笔是撇。", answer: "×" },
    ],
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.judge.build(q, ctxS, "q_jd");
  const partsT = REGISTRY.judge.build(q, ctxT, "q_jd");

  assert.equal(partsS.length, partsT.length);
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.equal(partsT.flatMap((p) => answerStrings(p.html)).length, 2);
  assert.ok(partsT[1].html.includes("judge-bracket"));
});

test("笔顺拆解组件：支持示范田字格与指定笔画填空", () => {
  const q = {
    question_id: "q_st",
    type: "stroke_order",
    stem: "按要求填空。",
    items: [
      { word: "水", total_strokes: 4, query: "第二笔是", answer: "㇇" },
      { word: "火", total_strokes: 4, order: "丶 丷 火" },
    ],
  };
  const ctxS = contextFor(1, "student");
  const ctxT = contextFor(1, "teacher");
  const partsS = REGISTRY.stroke_order.build(q, ctxS, "q_st");
  const partsT = REGISTRY.stroke_order.build(q, ctxT, "q_st");

  assert.equal(partsS.length, partsT.length);
  assert.ok(partsS[1].html.includes("stroke-tzg-wrap"));
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.equal(partsT.flatMap((p) => answerStrings(p.html)).length, 4);
});

test("计算题组件：口算单行答题槽与竖式作答区均支持双轨同构", () => {
  const oral = {
    question_id: "q_ca",
    type: "calculation",
    stem: "36×25 = ？",
    answer: "900",
    score: 2,
  };
  const vertical = {
    question_id: "q_cv",
    type: "calculation",
    stem: "列竖式计算：456 + 287 = ？",
    answer: "743",
  };
  const ctxS = contextFor(3, "student");
  const ctxT = contextFor(3, "teacher");

  const oralS = REGISTRY.calculation.build(oral, ctxS, "q_ca");
  const oralT = REGISTRY.calculation.build(oral, ctxT, "q_ca");
  assert.equal(oralS.length, oralT.length);
  assert.ok(oralS[0].html.includes("calc-oral-slot"), "口算题应渲染答题槽");
  assert.equal(oralS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.equal(oralT.flatMap((p) => answerStrings(p.html)).length, 1);

  const vertS = REGISTRY.calculation.build(vertical, ctxS, "q_cv");
  const vertT = REGISTRY.calculation.build(vertical, ctxT, "q_cv");
  assert.equal(vertS.length, vertT.length);
  assert.ok(vertS[1].html.includes("calc-work-box"), "竖式题应预留作答区");
  assert.ok(vertS[1].html.includes("wline"), "作答区由书写线构成");
});

test("填空题组件：{槽}语法与括号槽双模式，多答案按序填充教师卷", () => {
  const bracketMode = {
    question_id: "q_fb",
    type: "fill_blank",
    stem: "3分米 = （　）厘米 7000米 = （　）千米",
    answer: ["300", "7"],
    score: 4,
  };
  const ctxS = contextFor(3, "student");
  const ctxT = contextFor(3, "teacher");
  const partsS = REGISTRY.fill_blank.build(bracketMode, ctxS, "q_fb");
  const partsT = REGISTRY.fill_blank.build(bracketMode, ctxT, "q_fb");

  assert.equal(partsS.length, partsT.length);
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.equal(partsT.flatMap((p) => answerStrings(p.html)).length, 2, "两个括号槽各覆盖一个答案");

  const slotMode = { ...bracketMode, stem: "一块正方形手帕的周长是 2.4{米}，边长是{米}。" };
  const slotParts = REGISTRY.fill_blank.build(slotMode, ctxS, "q_fb2");
  assert.ok(slotParts[0].html.includes("slot"), "花括号语法应渲染行内槽");
});

test("解决问题组件：题干 + 预留书写行，教师卷行内覆盖答案", () => {
  const q = {
    question_id: "q_wp",
    type: "word_problem",
    stem: "商店运来 5 箱苹果，每箱 24 个，一共运来多少个？",
    lines: 4,
    answer: "5×24=120（个）",
    score: 5,
  };
  const ctxS = contextFor(3, "student");
  const ctxT = contextFor(3, "teacher");
  const partsS = REGISTRY.word_problem.build(q, ctxS, "q_wp");
  const partsT = REGISTRY.word_problem.build(q, ctxT, "q_wp");

  assert.equal(partsS.length, partsT.length);
  assert.ok(partsS[1].html.includes("wlines"));
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.equal(partsT.flatMap((p) => answerStrings(p.html)).length, 1);
});

test("表格任务组件：单元格留空作答，教师卷覆盖答案", () => {
  const q = {
    question_id: "q_tb",
    type: "table_task",
    stem: "按查字典的要求填表。",
    table: {
      headers: ["受查的字", "部首", "读音"],
      rows: [
        ["钢", { fill: true, answer: "钅" }, { fill: true, answer: "gāng" }],
        ["保", { fill: true, answer: "亻" }, { fill: true, answer: "bǎo" }],
      ],
    },
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.table_task.build(q, ctxS, "q_tb");
  const partsT = REGISTRY.table_task.build(q, ctxT, "q_tb");

  assert.equal(partsS.length, partsT.length);
  assert.ok(partsS[1].html.includes("qtable"), "表格容器类");
  assert.ok(!partsS[1].html.includes("class=\"ans\""), "学生卷无答案");
  assert.equal(partsT[1].html.includes("钅"), true, "教师卷覆盖部首答案");
});

test("流程图组件：节点留空作答，教师卷覆盖答案", () => {
  const q = {
    question_id: "q_fd",
    type: "flow_diagram",
    stem: "根据短文内容，把小水滴的变化过程补充完整。",
    nodes: ["小水滴", { fill: true, answer: "水蒸气" }, "小水滴", { fill: true, answer: "雨" }],
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.flow_diagram.build(q, ctxS, "q_fd");
  const partsT = REGISTRY.flow_diagram.build(q, ctxT, "q_fd");

  assert.equal(partsS.length, partsT.length);
  assert.ok(partsS[1].html.includes("flow-diagram"), "流程图容器类");
  assert.ok(!partsS[1].html.includes("水蒸气"), "学生卷无答案");
  assert.ok(partsT[1].html.includes("水蒸气"), "教师卷覆盖节点答案");
  assert.ok(partsT[1].html.includes("→"), "流程箭头存在");
});

test("阅读对话变体：口语交际以气泡渲染对话 stimulus", () => {
  const q = {
    question_id: "q_dlg",
    type: "reading",
    stem: "口语交际：补全他们之间的对话。",
    passage: {
      title: "说说自己喜欢的动物",
      dialogue: [
        { speaker: "乐乐", text: "我最喜欢的动物是小白兔，它圆滚滚的，像一个雪球。" },
        { speaker: "阳阳", text: "我最喜欢的动物是＿＿＿＿。因为＿＿＿＿。" },
      ],
    },
    subs: [{ sub_type: "text", stem: "请补全阳阳说的话。", answer: "我最喜欢小狗。", lines: 2 }],
  };
  const ctx = contextFor(2, "student");
  const parts = REGISTRY.reading.build(q, ctx, "q_dlg");
  assert.ok(parts.some((p) => p.html.includes("dialogue-speaker")), "对话气泡说话人标签");
  assert.ok(parts.some((p) => p.html.includes("dialogue-bubble")), "对话气泡容器");
  assert.ok(!parts.some((p) => p.html.includes("passage\"")), "对话模式不再渲染普通段落");
});

test("连线题组件：学生卷留白供画线，教师卷以 SVG 矢量红线连接对应锚点", () => {
  const q = {
    question_id: "q_ma",
    type: "pinyin_match",
    stem: "读拼音，连一连。",
    pairs: [
      { left: "tiān shàng", right: "天上" },
      { left: "bái yún", right: "白云" },
      { left: "xiǎo niǎo", right: "小鸟" },
    ],
  };
  const ctxS = contextFor(1, "student");
  const ctxT = contextFor(1, "teacher");
  const partsS = REGISTRY.pinyin_match.build(q, ctxS, "q_ma");
  const partsT = REGISTRY.pinyin_match.build(q, ctxT, "q_ma");

  assert.equal(partsS.length, partsT.length);
  // 学生卷有锚点但无 SVG 连线
  assert.ok(partsS[1].html.includes("match-dot"));
  assert.ok(!partsS[1].html.includes("<line"));

  // 教师卷包含精确连线 SVG
  assert.ok(partsT[1].html.includes("<svg class=\"match-svg\""));
  assert.ok(partsT[1].html.includes("<line"));
});
