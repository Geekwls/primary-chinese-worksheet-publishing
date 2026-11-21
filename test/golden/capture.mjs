/**
 * 黄金基线捕获模块：为 AST 化重构提供"逐字节一致"的回归基准。
 *
 * 快照内容 = Part 的布局字段（pid/cls/role/keepNext/splittable/label）+ html 字符串
 * + ctx.warnings。不含 ast 字段（重构过程中新旧路径并存，ast 只在迁移后才有值）。
 *
 * 两个层级：
 *   1. 文档级 —— 4 份真实样卷走 buildParts（覆盖跨题编号与真实组合）
 *   2. 题型级 —— 19 型各一组代表性题目走 REGISTRY.build（覆盖每个组件的全部分支形态）
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { Ctx } from "../../src/components/context.mjs";
import { REGISTRY } from "../../src/components/registry.mjs";
import { buildExplanationParts } from "../../src/components/furniture.mjs";
import { buildParts } from "../../src/pipeline.mjs";
import { loadDocument } from "../../src/domain/document.mjs";
import { loadDocProfile, loadGradeProfile, loadTokens, geometryOf } from "../../src/config/tokens.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

/** 与 pipeline.mjs 相同的行容量公式（改公式时两处必须同步）。 */
function lineCapacityFor(profile, geo) {
  const fontSizeMm = profile.font_pt.question * 25.4 / 72;
  const writeWidth = Math.min(geo.content_width, profile.geometry?.writing_line_width_mm ?? geo.content_width);
  return Math.trunc((writeWidth - 6) / (fontSizeMm * 1.02));
}

function contextFor(grade, variant, docType) {
  const tokens = loadTokens();
  const profile = loadGradeProfile(grade);
  const docProfile = loadDocProfile(docType);
  const geo = geometryOf(tokens, null, {});
  return new Ctx(profile, docProfile, variant, lineCapacityFor(profile, geo));
}

function serializeParts(parts) {
  return parts.map((p) => ({
    pid: p.pid,
    html: p.html,
    cls: p.cls,
    group: p.group,
    role: p.role,
    keepNext: p.keepNext,
    splittable: p.splittable,
    label: p.label,
  }));
}

/** 文档级捕获：学生卷 + 教师卷 + 解析附页三轨。 */
export function captureDoc(docPath) {
  const { doc } = loadDocument(docPath);
  const grade = Number(doc.grade);
  const docType = doc.doc_type;
  const out = {};
  for (const variant of ["student", "teacher", "explain"]) {
    const ctx = contextFor(grade, variant === "explain" ? "teacher" : variant, docType);
    const parts =
      variant === "explain" ? buildExplanationParts(doc, ctx) : buildParts(doc, ctx);
    out[variant] = { parts: serializeParts(parts), warnings: [...ctx.warnings] };
  }
  return out;
}

/** 题型级捕获：每组题目各用全新 Ctx 构建（编号确定性），学生/教师两轨。 */
export function captureType(entry) {
  const out = { student: { parts: [], warnings: [] }, teacher: { parts: [], warnings: [] } };
  for (const variant of ["student", "teacher"]) {
    const allParts = [];
    const warnings = [];
    for (const q of entry.questions) {
      const ctx = contextFor(entry.grade, variant, "review");
      allParts.push(...serializeParts(REGISTRY[q.type].build(q, ctx, q.question_id)));
      warnings.push(...ctx.warnings);
    }
    out[variant] = { parts: allParts, warnings };
  }
  return out;
}

/* ============================================================
 * 文档级 fixture
 * ============================================================ */

export const DOC_FIXTURES = [
  { name: "doc-g1", path: join(ROOT, "examples/g1-pinyin-unit1.json") },
  { name: "doc-g2", path: join(ROOT, "examples/g2-review-unit56.json") },
  { name: "doc-math-g3", path: join(HERE, "..", "fixtures/math-g3-practice.json") },
  { name: "doc-newtypes-g1", path: join(HERE, "..", "fixtures/newtypes-g1.json") },
];

/* ============================================================
 * 题型级 fixture（每组题目覆盖该组件的全部分支形态）
 * ============================================================ */

export const TYPE_FIXTURES = [
  {
    name: "type-pinyin_write_word",
    grade: 1,
    questions: [
      {
        question_id: "q_py",
        type: "pinyin_write_word",
        stem: "看拼音，写词语。",
        items: [
          { pinyin: "xiǎo niǎo", answer: "小鸟" },
          { pinyin: "bái yún", answer: "白云" },
          { pinyin: "tiān shàng de yún duǒ", answer: "云朵" },
        ],
      },
    ],
  },
  {
    name: "type-similar_character",
    grade: 2,
    questions: [
      {
        question_id: "q_sim",
        type: "similar_character",
        stem: "比一比，再组词。",
        items: [
          { chars: ["晴", "睛"], answers: ["晴天", "眼睛"] },
          { chars: ["渴", "喝"], answers: ["口渴", "喝水"] },
        ],
      },
    ],
  },
  {
    name: "type-polyphonic",
    grade: 2,
    questions: [
      {
        question_id: "q_poly",
        type: "polyphonic",
        stem: "给下列多音字选择正确的读音。",
        items: [
          { word: "长大", options: ["zhǎng", "cháng"], answer: "zhǎng" },
          { word: "音乐", options: ["yuè", "lè"], answer: "yuè" },
        ],
      },
    ],
  },
  {
    name: "type-add_pinyin",
    grade: 2,
    questions: [
      {
        question_id: "q_ap",
        type: "add_pinyin",
        stem: "给加点字注音。",
        items: [{ word: "你好呀", target: 1, answer: "hǎo" }],
      },
    ],
  },
  {
    name: "type-idiom_fill",
    grade: 2,
    questions: [
      {
        question_id: "q_if",
        type: "idiom_fill",
        stem: "把成语补充完整。",
        items: [{ text: "一{心}一{意}" }, { text: "四{海}为{家}" }],
      },
    ],
  },
  {
    name: "type-word_pattern",
    grade: 2,
    questions: [
      {
        question_id: "q_wpt",
        type: "word_pattern",
        stem: "照样子，写词语。",
        items: [{ label: "例：", samples: ["高高兴兴"], answers: ["开开心心", "快快乐乐"] }],
      },
    ],
  },
  {
    name: "type-poem_fill",
    grade: 2,
    questions: [
      {
        question_id: "q_pf",
        type: "poem_fill",
        stem: "把古诗补充完整。",
        items: [{ title: "静夜思", lines: ["床前明{月光}，疑是地上{霜}。"] }],
      },
    ],
  },
  {
    name: "type-sentence_rewrite",
    grade: 2,
    questions: [
      {
        question_id: "q_sr",
        type: "sentence_rewrite",
        stem: "按要求写句子。",
        items: [
          { sentence: "小明把作业做完了。", require: "改为被字句", answer: "作业被小明做完了。" },
          { kind: "imitate", sentence: "例：天上的白云像棉花。", answer: "水中的月亮像小船。" },
        ],
      },
    ],
  },
  {
    name: "type-reading",
    grade: 2,
    questions: [
      {
        question_id: "qr",
        type: "reading",
        stem: "读短文，回答问题。",
        passage: { title: "小鸟和青蛙", paragraphs: ["小鸟和青蛙在争论天有多大。", "它们都说自己说得对。"] },
        subs: [
          {
            sub_type: "choice",
            stem: "文章写了谁和谁在争论？",
            options: ["A. 小鸟和青蛙", "B. 青蛙和小鱼"],
            answer: "A",
          },
          { sub_type: "judge", stem: "小鸟认为天只有井口那么大。", answer: "×" },
          { stem: "你同意它们的说法吗？写一写你的理由。", answer: "不同意，天很大。" },
        ],
      },
    ],
  },
  {
    name: "type-composition",
    grade: 2,
    questions: [
      {
        question_id: "qc",
        type: "composition",
        stem: "看图写话。",
        rows: 4,
        prompt: "看看图中有谁，他们在做什么。",
        image: { src: "test.png", height_mm: 30, caption: "仔细观察小动物" },
      },
    ],
  },
  {
    name: "type-generic",
    grade: 2,
    questions: [
      {
        question_id: "q_gen",
        type: "generic",
        stem: "把你的想法写下来。",
        lines: 1,
        answer: "这是一段远远超过一行的很长很长的答案，用来触发教师卷的切行与行数不足警告机制验证。",
      },
    ],
  },
  {
    name: "type-choice",
    grade: 2,
    questions: [
      {
        question_id: "q_ch",
        type: "choice",
        stem: "下列汉字笔画最多的是（　）。",
        options: ["A. 口", "B. 山", "C. 水", "D. 鸟"],
        answer: "D",
      },
      {
        question_id: "q_ch2",
        type: "choice",
        stem: "下列说法完全正确的一项是",
        options: ["A. 弯弯曲曲", "B. 弯湾曲曲", "C. 应该辉映", "D. 记忆尤新"],
        answer: "A",
      },
    ],
  },
  {
    name: "type-judge",
    grade: 2,
    questions: [
      {
        question_id: "q_jd",
        type: "judge",
        stem: "判断下列说法是否正确。",
        items: [
          { stem: "“水”共有 4 画。", answer: "√" },
          { stem: "“天”的第一笔是撇。", answer: "×" },
        ],
      },
      { question_id: "q_jd2", type: "judge", stem: "水的密度比油大。", answer: "√" },
    ],
  },
  {
    name: "type-stroke_order",
    grade: 1,
    questions: [
      {
        question_id: "q_st",
        type: "stroke_order",
        stem: "按要求填空。",
        items: [
          { word: "水", total_strokes: 4, query: "第二笔是", answer: "㇇" },
          { word: "火", total_strokes: 4, order: "丶 丷 火" },
          { word: "木", text: "“木”的笔顺是{丶一丨丿乀}。" },
        ],
      },
    ],
  },
  {
    name: "type-pinyin_match",
    grade: 1,
    questions: [
      {
        question_id: "q_ma",
        type: "pinyin_match",
        stem: "读拼音，连一连。",
        pairs: [
          { left: "tiān shàng", right: "天上" },
          { left: "bái yún", right: "白云" },
          { left: "xiǎo niǎo", right: "小鸟" },
        ],
      },
      {
        question_id: "q_ma2",
        type: "pinyin_match",
        stem: "把图和词语连一连。",
        items: [
          { left: "太阳", right: "白天", match_index: 2 },
          { left: "月亮", right: "黑夜", match_index: 0 },
          { left: "星星", right: "夜空", match_index: 1 },
        ],
      },
    ],
  },
  {
    name: "type-calculation",
    grade: 3,
    questions: [
      { question_id: "q_ca", type: "calculation", stem: "36×25 = ？", answer: "900", score: 2 },
      { question_id: "q_cv", type: "calculation", stem: "列竖式计算：456 + 287 = ？", answer: "743" },
    ],
  },
  {
    name: "type-fill_blank",
    grade: 3,
    questions: [
      {
        question_id: "q_fb",
        type: "fill_blank",
        stem: "3分米 = （　）厘米 7000米 = （　）千米",
        answer: ["300", "7"],
        score: 4,
      },
      { question_id: "q_fb2", type: "fill_blank", stem: "一块正方形手帕的周长是 2.4{米}，边长是{米}。", answer: ["6", "6"] },
    ],
  },
  {
    name: "type-word_problem",
    grade: 3,
    questions: [
      {
        question_id: "q_wp",
        type: "word_problem",
        stem: "商店运来 5 箱苹果，每箱 24 个，一共运来多少个？",
        lines: 4,
        answer: "5×24=120（个）",
        score: 5,
      },
    ],
  },
];

export function goldenPath(name) {
  return join(HERE, `${name}.json`);
}

export function readDoc(docPath) {
  return JSON.parse(readFileSync(docPath, "utf8"));
}
