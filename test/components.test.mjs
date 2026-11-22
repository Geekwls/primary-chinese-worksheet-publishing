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

test("注册表覆盖 23 类题型且组件 ID 唯一", () => {
  assert.equal(SUPPORTED_TYPES.length, 23);
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

test("填空矩阵组件：括号槽矩阵布局，答案只在教师卷", () => {
  const q = {
    question_id: "q_fg",
    type: "fill_blank",
    stem: "在括号里填上合适的量词。",
    cols: 2,
    items: ["一{艘}军舰", "一{孔}石桥", "一{方}鱼塘", "一{丛}翠竹"],
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.fill_blank.build(q, ctxS, "q_fg");
  const partsT = REGISTRY.fill_blank.build(q, ctxT, "q_fg");

  // 题干 + 2 行矩阵（每行 2 条）+ 尾部；行间整链绑定
  assert.equal(partsS.length, 4);
  assert.equal(partsS[1].keepNext, true, "非末行应绑定 keepNext");
  assert.equal(partsS[2].keepNext, false, "末行不绑定");
  assert.ok(partsS[1].html.includes("fill-grid cols cols2"));
  assert.ok(partsS[1].html.includes("（<i class=\"gap\""));
  assert.ok(!partsS[1].html.includes("艘"));
  assert.ok(partsT[1].html.includes("艘"), "教师卷括号内应显示答案");
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
});

test("阅读小题分值与 keep:whole 整链绑定", () => {
  const q = {
    question_id: "q_rd",
    type: "reading",
    stem: "读短文，完成练习。",
    keep: "whole",
    passage: { title: "短文", paragraphs: ["第一段。"] },
    subs: [
      { stem: "短文共有{2}个自然段。", answer: "2", lines: 0, score: 3 },
      { stem: "“我”是什么？", answer: "水", lines: 1, score: 4 },
    ],
  };
  const ctxS = contextFor(2, "student");
  const parts = REGISTRY.reading.build(q, ctxS, "q_rd");

  // passage(keepNext) + sub1(keepNext, 整链) + sub2(末位不绑) + tail
  const subParts = parts.filter((p) => p.label?.startsWith("sub"));
  assert.equal(subParts[0].keepNext, true, "非末位小题应绑定 keepNext");
  assert.equal(subParts[1].keepNext, false, "末位小题不绑定");
  assert.ok(subParts[0].html.includes("（3分）"), "小题分值应渲染");
  assert.ok(!subParts[0].html.includes("（4分）"));

  // 不设 keep 时保持原行为（可逐小题拆页）
  const partsFree = REGISTRY.reading.build({ ...q, keep: undefined }, contextFor(2, "student"), "q_rd2");
  assert.equal(partsFree.filter((p) => p.label?.startsWith("sub"))[0].keepNext, false);
});

test("连词成句组件：词语间距排版 + 单行书写线", () => {
  const q = {
    question_id: "q_so",
    type: "sentence_order",
    stem: "连词成句，并加上标点。",
    items: [{ words: ["树叶", "一片片", "落下来"], answer: "一片片树叶落下来。", score: 2 }],
  };
  const ctxS = contextFor(2, "student");
  const parts = REGISTRY.sentence_order.build(q, ctxS, "q_so");
  const html = parts[1].html;
  assert.ok(html.includes("树叶"), "词语应渲染");
  assert.ok(html.includes("（2分）"), "小题分值应渲染");
  assert.ok(html.includes("wline"), "应有书写线");
});

test("标点运用组件：定宽标点槽，可带槽后文本", () => {
  const q = {
    question_id: "q_pt",
    type: "punctuation",
    stem: "给句子加上合适的标点。",
    items: [
      { before: "我会变", answer: "。" },
      { before: "太阳一晒", answer: "，", after: "我就变成汽。" },
    ],
  };
  const ctxS = contextFor(2, "student");
  const parts = REGISTRY.punctuation.build(q, ctxS, "q_pt");
  assert.equal(parts.filter((p) => p.label?.startsWith("sub")).length, 2);
  assert.ok(parts[1].html.includes("我会变"));
  assert.ok(parts[1].html.includes("slot\" style=\"width:100%\""), "标点槽应为定宽槽");
  assert.ok(parts[2].html.includes("我就变成汽。"), "槽后文本应渲染");
});

test("多音字圈选模式：读音并列无作答槽，教师卷正确读音带黑圈且高度不变", () => {
  const q = {
    question_id: "q_pc",
    type: "polyphonic",
    stem: "给下列多音字选择正确的读音，并圈出来。",
    mode: "circle",
    items: [
      { word: "教书", options: ["jiāo", "jiào"], answer: "jiāo" },
      { word: "因为", options: ["wéi", "wèi"], answer: "wèi" },
    ],
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.polyphonic.build(q, ctxS, "q_pc");
  const partsT = REGISTRY.polyphonic.build(q, ctxT, "q_pc");

  assert.ok(partsS[1].html.includes("poly-reading"), "学生卷读音应并列显示");
  assert.ok(!partsS[1].html.includes("ring"), "学生卷不得出现圈标记");
  assert.ok(!partsS[1].html.includes("poly-slot"), "圈选式不应有作答槽");
  assert.equal(partsT[1].html.match(/poly-reading ring/g)?.length, 2, "教师卷正确读音各带一个黑圈");
  assert.equal(partsT[1].html.match(/poly-reading"/g)?.length, 2, "错误读音无标记");
  // 双轨同构：Part 字段（含 keepNext/splittable）一致
  assert.deepEqual(partsS.map((p) => [p.pid, p.keepNext, p.splittable]), partsT.map((p) => [p.pid, p.keepNext, p.splittable]));
});

test("古诗分层：author 可选字段渲染作者行，缺省不渲染", () => {
  const withAuthor = {
    question_id: "q_pa", type: "poem_fill", stem: "把古诗补充完整。",
    items: [{ title: "《梅花》", author: "宋 · 王安石", lines: ["墙角数枝梅，{凌寒}独自开。"] }],
  };
  const withoutAuthor = { ...withAuthor, items: [{ title: "《梅花》", lines: ["墙角数枝梅，{凌寒}独自开。"] }] };
  const htmlWith = REGISTRY.poem_fill.build(withAuthor, contextFor(2, "student"), "q_pa")[1].html;
  const htmlWithout = REGISTRY.poem_fill.build(withoutAuthor, contextFor(2, "student"), "q_pb")[1].html;
  assert.ok(htmlWith.includes("poem-a"), "author 应渲染为作者行");
  assert.ok(htmlWith.includes("宋 · 王安石"));
  assert.ok(!htmlWithout.includes("poem-a"), "缺省 author 不得渲染作者行");
});

test("填空矩阵编号：圈号跨行连续", () => {
  const q = {
    question_id: "q_fn",
    type: "fill_blank",
    stem: "在括号里填上合适的量词。",
    cols: 3,
    numbered: true,
    items: ["一{艘}军舰", "一{孔}石桥", "一{方}鱼塘", "一{丛}翠竹", "一{把}铜号", "一{面}队旗"],
  };
  const parts = REGISTRY.fill_blank.build(q, contextFor(2, "student"), "q_fn");
  const all = parts.map((p) => p.html).join("");
  const nos = all.match(/class="fg-no">(.)(?=<\/span>)/gu).map((m) => m.slice(-1));
  assert.deepEqual(nos, ["①", "②", "③", "④", "⑤", "⑥"], "圈号应跨行连续");
  // 不编号时无前缀（回归保护）
  const partsPlain = REGISTRY.fill_blank.build({ ...q, numbered: false }, contextFor(2, "student"), "q_fn2");
  assert.ok(!partsPlain.map((p) => p.html).join("").includes("fg-no"));
});

test("词语仿写分类式块：标签+示例+编号槽，答案只在教师卷", () => {
  const q = {
    question_id: "q_wpb",
    type: "word_pattern",
    stem: "照样子，写出同结构的词语。",
    style: "block",
    items: [
      { label: "ABB式：", samples: ["喜洋洋"], answers: ["笑盈盈"] },
      { label: "AABB式：", samples: ["开开心心"], answers: ["快快乐乐", "高高兴兴"] },
    ],
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.word_pattern.build(q, ctxS, "q_wpb");
  const partsT = REGISTRY.word_pattern.build(q, ctxT, "q_wpb");

  // 题干 + 1 个分栏容器（结构块并排）+ 尾部
  assert.equal(partsS.length, 3);
  assert.equal(partsS[1].cls, "wp-group", "分类式块全宽单行");
  assert.equal((partsS[1].html.match(/wp-label/g) ?? []).length, 2);
  assert.ok(partsS[1].html.includes("示例：喜洋洋"));
  assert.ok(partsS[1].html.includes("wp-no"));
  assert.ok(!partsS[1].html.includes("wp-slots"), "分类式块应为单行（标签+示例+槽同行）");
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.equal(partsT.flatMap((p) => answerStrings(p.html)).length, 3);
  // 默认行式输出不受影响
  const partsRow = REGISTRY.word_pattern.build({ ...q, style: undefined }, contextFor(2, "student"), "q_wpc");
  assert.ok(!partsRow.map((p) => p.html).join("").includes("wp-block"));
});

test("成语四字方格：实字格+空白格，教师卷空白格红字答案", () => {
  const q = {
    question_id: "q_ig",
    type: "idiom_fill",
    stem: "把下面的成语补充完整。",
    slot: "grid",
    items: [
      { text: "{五}颜{六}色" },
      { text: "{百}发{百}中" },
    ],
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.idiom_fill.build(q, ctxS, "q_ig");
  const partsT = REGISTRY.idiom_fill.build(q, ctxT, "q_ig");

  assert.equal(partsS.length, 4, "题干 + 2 个成语行 + 尾部");
  const allS = partsS.map((p) => p.html).join("");
  assert.equal((allS.match(/idiom-cell filled/g) ?? []).length, 4, "实字格数");
  assert.equal((allS.match(/idiom-cell blank/g) ?? []).length, 4, "空白格数");
  assert.ok(!allS.includes("五颜"), "学生卷空白格不得出现答案");
  const allT = partsT.map((p) => p.html).join("");
  assert.equal((allT.match(/class="ans">/g) ?? []).length, 4, "教师卷每个空白格一个红字答案");
  // 默认括号形态不受影响
  const partsParen = REGISTRY.idiom_fill.build({ ...q, slot: undefined }, contextFor(2, "student"), "q_ig2");
  assert.ok(!partsParen.map((p) => p.html).join("").includes("idiom-cell"));
});

test("仿写填空支架：句框槽替代书写线，答案只在教师卷", () => {
  const q = {
    question_id: "q_sc",
    type: "sentence_rewrite",
    stem: "照样子，写句子。",
    items: [
      {
        kind: "imitate",
        sentence: "例：梧桐树叶像手掌。",
        require: "（用“……像……”写一个比喻句）",
        scaffold: "{弯弯的月亮}像{小船}。",
        score: 4,
      },
      { require: "（把句子补充完整）", scaffold: "放学了，我先{把作业写完}，再{出去玩}。", score: 3 },
    ],
  };
  const ctxS = contextFor(2, "student");
  const ctxT = contextFor(2, "teacher");
  const partsS = REGISTRY.sentence_rewrite.build(q, ctxS, "q_sc");
  const partsT = REGISTRY.sentence_rewrite.build(q, ctxT, "q_sc");

  const sub1 = partsS[1].html;
  assert.ok(sub1.includes("例：梧桐树叶像手掌。"), "例句块保留");
  assert.ok(sub1.includes("像"), "句框含连接词");
  assert.ok(!sub1.includes("wline"), "有支架时不留书写横线");
  assert.ok(!sub1.includes("cue"), "支架题不挂「仿写：」引导（句框即作答区）");
  assert.ok(sub1.includes("（4分）"), "小题分值渲染");
  const sub2 = partsS[2].html;
  assert.ok(sub2.includes("放学了，我先"), "无例句的补充句子支架直接渲染");
  assert.ok(!sub2.includes("cue"), "无例句不出「仿写：」引导");
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.equal(partsT.flatMap((p) => answerStrings(p.html)).length, 4, "教师卷槽内红字答案");
});

test("着重号与题干微标签：题干/选项/短文支持加点，标签正常渲染", () => {
  const qChoice = {
    question_id: "q_ch_dot",
    type: "choice",
    stem: "下列加点字的读音~有误~的一项是（ ）",
    tags: ["名校真题", "基础巩固"],
    options: ["A. ~挨~打(ái)", "B. [假]{.dot}期(jià)", "C. 处[罚]{.dot}(fá)"],
    answer: "A",
  };
  const ctxS = contextFor(3, "student");
  const ctxT = contextFor(3, "teacher");
  const partsS = REGISTRY.choice.build(qChoice, ctxS, "q_ch_dot");
  const partsT = REGISTRY.choice.build(qChoice, ctxT, "q_ch_dot");

  const headHtml = partsS[0].html;
  assert.ok(headHtml.includes('<span class="q-tag">名校真题</span>'), "题干微标签渲染");
  assert.ok(headHtml.includes('<span class="q-tag">基础巩固</span>'), "多标签并列");
  assert.ok(headHtml.includes('<span class="dot">有误</span>'), "题干着重号加点渲染");

  const optHtml = partsS[1].html;
  assert.ok(optHtml.includes('<span class="dot">挨</span>'), "选项 ~挨~ 加点渲染");
  assert.ok(optHtml.includes('<span class="dot">假</span>'), "选项 [假]{.dot} 加点渲染");
  assert.ok(optHtml.includes('<span class="dot">罚</span>'), "选项 处[罚]{.dot} 加点渲染");
});

test("看拼音写字词：语境语段括号模式与方格模式，双轨同构且答案只在教师卷", () => {
  const qPyPassage = {
    question_id: "q_py_ctx",
    type: "pinyin_write_word",
    stem: "根据语境，看拼音写字词。",
    tags: ["生活情境"],
    passage: "清晨，同学们在认真地做[gōng kè]{功课}，下课后在操场上[kuáng huān]{狂欢}。",
  };
  const ctxS = contextFor(3, "student");
  const ctxT = contextFor(3, "teacher");
  const partsS = REGISTRY.pinyin_write_word.build(qPyPassage, ctxS, "q_py_ctx");
  const partsT = REGISTRY.pinyin_write_word.build(qPyPassage, ctxT, "q_py_ctx");

  assert.equal(partsS.length, 3, "题干 + 语段 + 尾部");
  const pHtmlS = partsS[1].html;
  const pHtmlT = partsT[1].html;

  assert.ok(pHtmlS.includes('<div class="pinyin-passage">'), "语段容器包裹");
  assert.ok(pHtmlS.includes('<span class="pinline-py">gōng kè</span>'), "拼音渲染");
  assert.ok(pHtmlS.includes('pinline-paren'), "学生卷标准括号作答槽");
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0, "学生卷无答案泄露");

  assert.ok(pHtmlT.includes('<span class="ans">功课</span>'), "教师卷括号内红字答案功课");
  assert.ok(pHtmlT.includes('<span class="ans">狂欢</span>'), "教师卷括号内红字答案狂欢");

  // 方格形态支持
  const partsSq = REGISTRY.pinyin_write_word.build({ ...qPyPassage, form: "square" }, ctxS, "q_py_sq");
  assert.equal((partsSq[1].html.match(/class="sqg"/g) ?? []).length, 4, "方格形态 4 个方格作答槽");
});

test("成语多步联动：补充四字词语 + 关联设问小题", () => {
  const qIdiomMulti = {
    question_id: "q_im",
    type: "idiom_fill",
    stem: "将下列成语补充完整，并完成练习。",
    items: [
      { text: "张{口}舞爪" },
      { text: "手忙{脚}{乱}" },
    ],
    subs: [
      { stem: "上述词语都含有身体器官，再写一个：{面红耳赤}。", score: 2 },
      { stem: "选词填空：早上起床要抓紧，不要{手忙脚乱}。", score: 2, tags: ["思维提升"] },
    ],
  };
  const ctxS = contextFor(3, "student");
  const ctxT = contextFor(3, "teacher");
  const partsS = REGISTRY.idiom_fill.build(qIdiomMulti, ctxS, "q_im");
  const partsT = REGISTRY.idiom_fill.build(qIdiomMulti, ctxT, "q_im");

  assert.equal(partsS.length, 5, "题干 + 成语行 + 小题1 + 小题2 + 尾部");
  const sub2Html = partsS[3].html;
  assert.ok(sub2Html.includes('<span class="q-tag">思维提升</span>'), "小题支持微标签");
  assert.ok(sub2Html.includes('（2分）'), "小题分值显示");
  assert.equal(partsS.flatMap((p) => answerStrings(p.html)).length, 0);
  assert.ok(partsT[2].html.includes('class="ans">面红耳赤</span>'), "小题1教师卷答案");
  assert.ok(partsT[3].html.includes('class="ans">手忙脚乱</span>'), "小题2教师卷答案");
});
