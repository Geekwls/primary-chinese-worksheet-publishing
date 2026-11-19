/**
 * 组件注册表：题型 → 组件契约。
 *
 * 这张表就是"AI 能做什么"的边界。表外题型一律报错，
 * 不允许临时用 generic 顶替语义题型 —— 那会把设计缺陷伪装成渲染成功。
 */
import { ComponentError } from "../core/errors.mjs";
import {
  compAddPinyin,
  compComposition,
  compGeneric,
  compIdiomFill,
  compPinyinWriteWord,
  compPoemFill,
  compReading,
  compSentenceRewrite,
  compSimilarCharacter,
  compWordPattern,
} from "./questions.mjs";

export const REGISTRY = {
  pinyin_write_word: { build: compPinyinWriteWord, componentId: "pinyin_tianzi_grid", label: "看拼音写词语" },
  similar_character: { build: compSimilarCharacter, componentId: "similar_character_group", label: "形近字组词" },
  add_pinyin: { build: compAddPinyin, componentId: "pinyin_annotation_columns", label: "给加点字注音" },
  idiom_fill: { build: compIdiomFill, componentId: "idiom_blank_row", label: "成语补充" },
  word_pattern: { build: compWordPattern, componentId: "word_pattern_row", label: "词语仿写" },
  poem_fill: { build: compPoemFill, componentId: "poem_blank_lines", label: "古诗填空" },
  sentence_rewrite: { build: compSentenceRewrite, componentId: "sentence_rewrite_block", label: "句子改写" },
  reading: { build: compReading, componentId: "reading_passage_block", label: "阅读理解" },
  composition: { build: compComposition, componentId: "composition_grid", label: "看图写话" },
  generic: { build: compGeneric, componentId: "generic_answer_block", label: "通用作答题" },
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
