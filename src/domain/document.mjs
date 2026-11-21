/**
 * 数据契约：题目 JSON 的加载与结构校验。
 *
 * 契约属于质量验收 Q1 层，必须在渲染前拦截 —— 等 PDF 出来再靠人眼发现字段写错，
 * 成本高一个数量级，而且很容易漏。
 */
import { existsSync } from "node:fs";

import { isSupported, SUPPORTED_TYPES } from "../components/registry.mjs";
import { ContractError } from "../core/errors.mjs";
import { g } from "../core/format.mjs";
import { readText } from "../core/io.mjs";

export const REQUIRED_DOC = ["document_id", "grade", "title", "sections"];
export const REQUIRED_Q = ["question_id", "type", "stem"];

/** 加载并校验，返回 { doc, warnings, stats }。 */
export function loadDocument(path) {
  if (!existsSync(path)) throw new ContractError(`题目文件不存在：${path}`);
  let doc;
  try {
    doc = JSON.parse(readText(path));
  } catch (err) {
    throw new ContractError(`题目文件不是合法 JSON（${path}）：${err.message}`);
  }
  const { warnings, stats } = validate(doc);
  return { doc, warnings, stats };
}

/**
 * 结构性校验。
 * 致命问题直接抛 ContractError（宁可不出卷，也不出一份错卷）；
 * 可修复问题返回 warnings，随验收报告一起上报。
 */
export function validate(doc) {
  const missing = REQUIRED_DOC.filter((k) => !doc?.[k]);
  if (missing.length) throw new ContractError(`缺少必需字段：${missing.join("、")}`);

  const warnings = [];
  const seenIds = new Set();
  let questionCount = 0;
  let scoreSum = 0;

  doc.sections.forEach((sec, index) => {
    const si = index + 1;
    if (!sec.title) throw new ContractError(`第 ${si} 个大题缺少 title。`);
    if (!sec.questions?.length) warnings.push(`大题「${sec.title}」没有题目。`);

    for (const q of sec.questions ?? []) {
      questionCount += 1;
      for (const key of REQUIRED_Q) {
        if (!q[key]) throw new ContractError(`题目缺少字段 ${key}：${JSON.stringify(q)}`);
      }
      if (seenIds.has(q.question_id)) throw new ContractError(`question_id 重复：${q.question_id}`);
      seenIds.add(q.question_id);

      if (!isSupported(q.type)) {
        throw new ContractError(
          `题目 ${q.question_id} 的题型 \`${q.type}\` 未收录。已支持：${SUPPORTED_TYPES.join(", ")}`,
        );
      }

      if (q.score !== null && q.score !== undefined) scoreSum += Number(q.score);

      if (q.type === "pinyin_write_word") {
        for (const it of q.items ?? []) {
          if (!it.pinyin) {
            throw new ContractError(`题目 ${q.question_id} 的看拼音写词语条目缺少 pinyin：${JSON.stringify(it)}`);
          }
          if (!it.answer) {
            throw new ContractError(`题目 ${q.question_id} 的看拼音写词语条目缺少 answer：${JSON.stringify(it)}`);
          }
        }
      }

      if (q.type === "similar_character") {
        for (const it of q.items ?? []) {
          if (!it.chars?.length || !it.answers?.length) {
            throw new ContractError(`题目 ${q.question_id} 的形近字条目缺少 chars/answers：${JSON.stringify(it)}`);
          }
        }
      }

      if (q.type === "polyphonic") {
        if (!q.items?.length) {
          throw new ContractError(`题目 ${q.question_id} 是多音字辨析题，但 items 为空。`);
        }
        for (const it of q.items) {
          if (!it.word) {
            throw new ContractError(`题目 ${q.question_id} 的多音字条目缺少 word：${JSON.stringify(it)}`);
          }
          if (!it.answer) {
            throw new ContractError(`题目 ${q.question_id} 的多音字条目缺少 answer：${JSON.stringify(it)}`);
          }
        }
      }

      if (q.type === "reading") {
        const hasText = (q.passage?.paragraphs?.length ?? 0) > 0;
        const hasDialogue = (q.passage?.dialogue?.length ?? 0) > 0;
        if (!hasText && !hasDialogue) {
          throw new ContractError(`题目 ${q.question_id} 是阅读题，但 passage.paragraphs 与 passage.dialogue 均为空。`);
        }
        if (!q.subs?.length) {
          throw new ContractError(`题目 ${q.question_id} 是阅读题，但缺少 subs。`);
        }
      }

      if (q.type === "choice") {
        const hasDirect = Array.isArray(q.options) && q.options.length >= 2 && q.answer;
        const hasItems = Array.isArray(q.items) && q.items.length >= 1;
        if (!hasDirect && !hasItems) {
          throw new ContractError(`题目 ${q.question_id} 是选择题，但缺少 options/answer 或 items 列表。`);
        }
        if (hasItems) {
          for (const it of q.items) {
            if (!it.options?.length || !it.answer) {
              throw new ContractError(`题目 ${q.question_id} 的选择题小题缺少 options/answer：${JSON.stringify(it)}`);
            }
          }
        }
      }

      if (q.type === "judge") {
        const hasDirect = Boolean(q.answer);
        const hasItems = Array.isArray(q.items) && q.items.length >= 1;
        if (!hasDirect && !hasItems) {
          throw new ContractError(`题目 ${q.question_id} 是判断题，但缺少 answer 或 items 列表。`);
        }
        if (hasItems) {
          for (const it of q.items) {
            if (it.answer === undefined || it.answer === null) {
              throw new ContractError(`题目 ${q.question_id} 的判断题小题缺少 answer：${JSON.stringify(it)}`);
            }
          }
        }
      }

      if (q.type === "stroke_order") {
        const hasDirect = Boolean(q.word);
        const hasItems = Array.isArray(q.items) && q.items.length >= 1;
        if (!hasDirect && !hasItems) {
          throw new ContractError(`题目 ${q.question_id} 是笔顺题，但缺少 word 或 items 列表。`);
        }
      }

      if (q.type === "pinyin_match") {
        const hasItems = Array.isArray(q.items) && q.items.length >= 1;
        const hasPairs = Array.isArray(q.pairs) && q.pairs.length >= 1;
        if (!hasItems && !hasPairs) {
          throw new ContractError(`题目 ${q.question_id} 是连线题，但缺少 items 或 pairs。`);
        }
      }

      if (q.type === "calculation" || q.type === "word_problem") {
        if (!q.answer) {
          throw new ContractError(`题目 ${q.question_id} 是${q.type === "calculation" ? "计算题" : "解决问题"}，但缺少 answer（名师卷答案覆盖必需）。`);
        }
      }

      if (q.type === "fill_blank" || q.type === "blank") {
        // items 矩阵模式：答案内嵌在条目 {} 中，不要求 q.answer；stem 模式必须有按序 answer。
        const hasItems = Array.isArray(q.items) && q.items.length > 0;
        const hasAnswer = Boolean(q.answer) && (Array.isArray(q.answer) ? q.answer.some(Boolean) : true);
        if (!hasItems && !hasAnswer) {
          throw new ContractError(`题目 ${q.question_id} 是填空题，但缺少 answer（单个答案或按括号顺序的数组）或 items（{} 内含答案）。`);
        }
        if (hasItems) {
          for (const it of q.items) {
            if (!/\{[^{}]+\}/.test(String(it ?? ""))) {
              throw new ContractError(`题目 ${q.question_id} 的填空矩阵条目缺少 {} 答案：${JSON.stringify(it)}`);
            }
          }
        }
      }

      if (q.type === "sentence_order") {
        if (!Array.isArray(q.items) || q.items.length === 0) {
          throw new ContractError(`题目 ${q.question_id} 是连词成句题，但缺少 items。`);
        }
        for (const it of q.items) {
          if (!it.words?.length || !it.answer) {
            throw new ContractError(`题目 ${q.question_id} 的连词成句条目缺少 words/answer：${JSON.stringify(it)}`);
          }
        }
      }

      if (q.type === "punctuation") {
        if (!Array.isArray(q.items) || q.items.length === 0) {
          throw new ContractError(`题目 ${q.question_id} 是标点运用题，但缺少 items。`);
        }
        for (const it of q.items) {
          if (!it.answer || !(it.text || it.before)) {
            throw new ContractError(`题目 ${q.question_id} 的标点条目缺少 text/before 或 answer：${JSON.stringify(it)}`);
          }
        }
      }

      if (q.type === "table_task") {
        if (!q.table?.headers?.length || !q.table?.rows?.length) {
          throw new ContractError(`题目 ${q.question_id} 是表格任务，但缺少 table.headers 或 table.rows。`);
        }
      }

      if (q.type === "flow_diagram") {
        if (!q.nodes?.length) {
          throw new ContractError(`题目 ${q.question_id} 是流程图任务，但缺少 nodes。`);
        }
      }
    }
  });

  const total = doc.total_score;
  if (total !== null && total !== undefined && Math.abs(Number(total) - scoreSum) > 0.01) {
    warnings.push(`总分不一致：题目标注 ${total} 分，各小题合计 ${g(scoreSum)} 分。`);
  }

  return { warnings, stats: { question_count: questionCount, score_sum: scoreSum } };
}
