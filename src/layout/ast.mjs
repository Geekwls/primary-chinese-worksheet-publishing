/**
 * 布局 AST（Layout AST）：版式模式级节点词汇表。
 *
 * 粒度原则：一个节点 ≈ worksheet-base.css 的一个分节。题型控制器（comp*）
 * 是"策略层"，只负责解析数据、消耗编号、组合这些节点；HTML 由唯一解释器
 * ast-html.mjs 产出，保证与历史输出逐字节一致。
 *
 * 铁律：
 *   1. 节点只携带"意图与约束 + 数据"（答案、行数、选项），不携带像素与样式；
 *      内容驱动的几何（槽宽按答案字数）在解释器里按既定公式计算。
 *   2. answer 是节点数据：教师/学生差异只在解释器出口（.ans 覆盖层）体现，
 *      双轨同构由解释器保证，不再依赖组件纪律。
 *   3. 词汇表闭集：新增节点必须先登记 docs/layout-ast.md，并配解释器分支
 *      与保真测试，不得在组件层私自拼 HTML。
 *
 * 契约版本：AST_VERSION 随词汇表变更递增，并写入 layout-manifest.ast_version。
 */

export const AST_VERSION = "1.0.0";

/* ============================================================
 * 行内原语（题干/小题文本流内部）
 * ============================================================ */

/** 纯文本（解释器负责 esc 转义）。 */
export const text = (value) => ({ kind: "text", value: String(value ?? "") });

/**
 * 行内作答槽。form 决定视觉形态（与 CSS 分节一一对应）：
 *   line        线槽 <span class="brk"><i class="slot" style="width:Wem">，W = max(2.2, 字数×1.18+0.5)
 *   paren       括号槽 <span class="brk">（<i class="gap"></i>）
 *   word        词语槽 <span class="brk">（<i class="slot w"></i>）
 *   fixed       定宽槽 <span class="brk" style="width:var(--slot-w)"><i class="slot" style="width:100%">
 *   oral        口算槽 <span class="calc-oral-slot"><span class="brk" style="width:Wem;display:inline-block">，W = max(3.8, 字数×1.3+1.2)
 *   bare_num    裸括号数字槽 （<i class="slot i"></i>）
 *   bare_word   裸括号词语槽 （<i class="slot w"></i>）
 *   bare_stroke 裸括号笔顺槽 （<i class="slot p"></i>）
 *   choice      选择答题括号 <span class="choice-bracket">（<i class="slot i"></i>）
 *   judge       判断答题括号 <span class="judge-bracket">（<i class="slot i"></i>）
 */
export const blank_slot = (form, answer) => ({ kind: "blank_slot", form, answer });

/* ============================================================
 * 块级原语（每个 Part 的 html 由一或多个块级节点渲染拼接）
 * ============================================================ */

/** 题干行：<span class="no">N.</span> + 行内内容 + 分值提示（受 docProfile.section_score_visible 控制）。 */
export const q_head = ({ number, children, score = null }) => ({ kind: "q_head", number, children, score });

/**
 * 书写横线组（<div class="wline">… 序列）。boxed=false 时不包 <div class="wlines"> 外壳
 * （供 work_box 等自定义容器复用）。行数不足告警进 ctx.warnings，与历史行为一致。
 */
export const writing_lines = ({ count, answers = [], label = "", boxed = true }) => ({
  kind: "writing_lines",
  count,
  answers,
  label,
  boxed,
});

/** 竖式/脱式作答区：<div class="calc-work-box"> 包书写横线（固定语义，见 compCalculation）。 */
export const work_box = ({ count, answers = [], label = "" }) => ({ kind: "work_box", count, answers, label });

/** 独立选择题选项栏：<div class="choice-options cols colsN">，列数按最长选项自适应（≤8→4 / ≤18→2 / 1）。 */
export const choice_options = (options) => ({ kind: "choice_options", options });

/** 阅读小题选项行：<div class="sub-options">（无分栏）。 */
export const sub_options = (options) => ({ kind: "sub_options", options });

/** 小题行（plain 变体）：题干 + 可选要求 + 可选"仿写："引导 + 可选书写线（句子改写/阅读简答共用）。 */
export const sub_plain = ({ number, children, require = "", cue = false, lines = null }) => ({
  kind: "sub_plain",
  number,
  children,
  require,
  cue,
  lines,
});

/** 小题行（choice 变体）：<div class="sub choice-sub">。 */
export const sub_choice = ({ number, children, bracket = null, options = null }) => ({
  kind: "sub_choice",
  number,
  children,
  bracket,
  options,
});

/** 小题行（judge 变体）：<div class="sub judge-sub"><div class="judge-row">…右对齐判断括号。 */
export const sub_judge = ({ number, children, answer = null }) => ({
  kind: "sub_judge",
  number,
  children,
  answer,
});

/** 独立选择题（无题号小题行）：<div class="choice-sub choice-standalone">。bracket=null 表示题干自带槽。 */
export const choice_standalone = ({ bracket = null, options = null }) => ({
  kind: "choice_standalone",
  bracket,
  options,
});

/** 独立判断题（无题号行）：<div class="judge-standalone">。 */
export const judge_standalone = (answer) => ({ kind: "judge_standalone", answer });

/** 小题行（stroke 变体）：<div class="sub stroke-sub"><div class="stroke-row">…。detail.wrap: "text"|"details"。 */
export const sub_stroke = ({ number, word = "", detail = null }) => ({
  kind: "sub_stroke",
  number,
  word,
  detail,
});

/** 阅读文章块：标题 + 段落（整块不可拆，keepNext 由 Part 层声明）。 */
export const passage = ({ title = "", paragraphs = [] }) => ({ kind: "passage", title, paragraphs });

/** 拼音+田字格行：一组"看拼音写词语"词条（对齐/居中双分支 + 教师卷格心答案）。 */
export const pinyin_row = (items) => ({ kind: "pinyin_row", items });

/** 形近字组词行：字 + 词语槽（<span class="gc">）。 */
export const similar_cells = (items) => ({ kind: "similar_cells", items });

/** 多音字卡片行：<span class="poly-card">（教师答案用 ans ans-slot 双类，槽内约束）。 */
export const poly_cells = (items) => ({ kind: "poly_cells", items });

/** 加点字注音列：<span class="pin-item"> 逐字列，目标字上方注音槽。 */
export const pin_annotation = (items) => ({ kind: "pin_annotation", items });

/** 成语/词语行：<span class="witem"> 包行内内容（括号槽由 children 携带）。 */
export const witem_row = (items) => ({ kind: "witem_row", items });

/** 词语仿写行组：<div class="wrow"> 例词头 + 定宽词槽（var(--slot-w)）。 */
export const word_pattern = (items) => ({ kind: "word_pattern", items });

/** 古诗填空块：<div class="poem"> 标题 + 逐行（行内线槽）。 */
export const poem = (items) => ({ kind: "poem", items });

/** 写话方格纸：<div class="zwg"> rows×cols 空格。 */
export const composition_grid = ({ rows, cols }) => ({ kind: "composition_grid", rows, cols });

/** 写话提示语：<div class="comp-prompt">。 */
export const prompt = (value) => ({ kind: "prompt", value: String(value ?? "") });

/** 写话配图：<div class="comp-img-wrap">（src/height_mm/caption）。 */
export const image = ({ src, height_mm = null, caption = "" }) => ({ kind: "image", src, height_mm, caption });

/** 连线板：<div class="match-container"> 左右双列 + 锚点，教师卷以 SVG 矢量红线覆盖。 */
export const match_board = (rows) => ({ kind: "match_board", rows });
