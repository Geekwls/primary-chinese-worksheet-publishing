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

      if (q.type === "reading") {
        if (!q.passage?.paragraphs?.length) {
          throw new ContractError(`题目 ${q.question_id} 是阅读题，但 passage.paragraphs 为空。`);
        }
        if (!q.subs?.length) {
          throw new ContractError(`题目 ${q.question_id} 是阅读题，但缺少 subs。`);
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
