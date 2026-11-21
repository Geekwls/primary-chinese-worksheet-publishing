/**
 * 组件注册表：题型 → 组件契约。
 *
 * 这张表就是"AI 能做什么"的边界。表外题型一律报错，
 * 不允许临时用 generic 顶替语义题型 —— 那会把设计缺陷伪装成渲染成功。
 */
import { ComponentError } from "../core/errors.mjs";
import {
  compAddPinyin,
  compCalculation,
  compChoice,
  compComposition,
  compFillBlank,
  compFlowDiagram,
  compGeneric,
  compIdiomFill,
  compJudge,
  compPinyinMatch,
  compPinyinWriteWord,
  compPoemFill,
  compPunctuation,
  compPolyphonic,
  compReading,
  compSentenceOrder,
  compSentenceRewrite,
  compSimilarCharacter,
  compStrokeOrder,
  compTableTask,
  compWordPattern,
  compWordProblem,
} from "./questions.mjs";

export const REGISTRY = {
  pinyin_write_word: { build: compPinyinWriteWord, componentId: "pinyin_tianzi_grid", label: "看拼音写词语" },
  similar_character: { build: compSimilarCharacter, componentId: "similar_character_group", label: "形近字组词" },
  polyphonic: { build: compPolyphonic, componentId: "polyphonic_choice_group", label: "多音字辨析" },
  add_pinyin: { build: compAddPinyin, componentId: "pinyin_annotation_columns", label: "给加点字注音" },
  idiom_fill: { build: compIdiomFill, componentId: "idiom_blank_row", label: "成语补充" },
  word_pattern: { build: compWordPattern, componentId: "word_pattern_row", label: "词语仿写" },
  poem_fill: { build: compPoemFill, componentId: "poem_blank_lines", label: "古诗填空" },
  sentence_rewrite: { build: compSentenceRewrite, componentId: "sentence_rewrite_block", label: "句子改写" },
  reading: { build: compReading, componentId: "reading_passage_block", label: "阅读理解" },
  composition: { build: compComposition, componentId: "composition_grid", label: "看图写话" },
  generic: { build: compGeneric, componentId: "generic_answer_block", label: "通用作答题" },
  choice: { build: compChoice, componentId: "choice_question_block", label: "选择题" },
  judge: { build: compJudge, componentId: "judge_question_block", label: "判断题" },
  stroke_order: { build: compStrokeOrder, componentId: "stroke_order_block", label: "笔顺笔画题" },
  pinyin_match: { build: compPinyinMatch, componentId: "pinyin_match_block", label: "连线题" },
  calculation: { build: compCalculation, componentId: "calculation_block", label: "计算题" },
  fill_blank: { build: compFillBlank, componentId: "fill_blank_block", label: "填空题" },
  blank: { build: compFillBlank, componentId: "blank_fill_block", label: "填空题" },
  sentence_order: { build: compSentenceOrder, componentId: "sentence_order_block", label: "连词成句" },
  punctuation: { build: compPunctuation, componentId: "punctuation_block", label: "标点运用" },
  word_problem: { build: compWordProblem, componentId: "word_problem_block", label: "解决问题" },
  table_task: { build: compTableTask, componentId: "table_task_block", label: "表格任务" },
  flow_diagram: { build: compFlowDiagram, componentId: "flow_diagram_block", label: "流程图填空" },
};

export const SUPPORTED_TYPES = Object.keys(REGISTRY);

export function isSupported(type) {
  return Object.hasOwn(REGISTRY, type);
}

export function resolveComponent(type) {
  if (!isSupported(type)) {
    throw new ComponentError(
      `未收录题型 \`${type}\`。已支持：${SUPPORTED_TYPES.join(", ")}。` +
        "新增题型必须先登记组件契约与尺寸测试，不得临时用 generic 顶替语义题型。",
    );
  }
  return REGISTRY[type];
}

export function componentIdOf(type) {
  return resolveComponent(type).componentId;
}

export function componentLabel(type) {
  return REGISTRY[type]?.label ?? type;
}
