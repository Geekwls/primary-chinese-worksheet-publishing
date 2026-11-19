/**
 * 可核对文本抽取：把"应该出现在卷面上"的内容变成可 grep 的字符串集合。
 *
 * 这是内容完整性（P0-03 / P0-09）与答案泄露（P0-11）检测的基准，
 * 只在组件 HTML 层做，不依赖 PDF，因此能定位到具体是哪一块丢了。
 */
import { norm, stripTags, unescapeHtml } from "../core/text.mjs";

const BLANK_RE = /\{[^{}]*\}/g;
const ANS_RE = /<span class="ans">([\s\S]*?)<\/span>/g;

/** 去掉填空占位与标签后的纯文本。 */
export function plain(text) {
  return stripTags(String(text ?? "").replace(BLANK_RE, "")).trim();
}

/** 组件 HTML 中"学生可见"的文本（剔除教师答案覆盖层）。 */
export function visibleText(html) {
  return unescapeHtml(stripTags(String(html ?? "").replace(ANS_RE, "")));
}

export function answerStrings(html) {
  return [...String(html ?? "").matchAll(ANS_RE)].map((m) => unescapeHtml(m[1]));
}

/** 卷面结构文本：标题 / 大题 / 题干 / 阅读文章首段，学生卷与教师卷都必须包含。 */
export function structureTexts(doc) {
  const out = [plain(doc.title ?? "")];
  for (const sec of doc.sections ?? []) {
    out.push(plain(sec.title ?? ""));
    for (const q of sec.questions ?? []) {
      out.push(plain(q.stem ?? ""));
      for (const para of q.passage?.paragraphs ?? []) out.push(plain(para).slice(0, 30));
    }
  }
  return [...new Set(out.map((t) => t.trim()))].filter((t) => [...t].length >= 2);
}

/**
 * 教师卷必须出现、且学生卷不得出现的答案与解析文本。
 *
 * answer_text 是"多条答案的汇总串"，按分隔符拆成独立答案逐条核对，
 * 避免"汇总写法与页面排布不同"造成的假失败。
 */
export function teacherAnswers(doc) {
  const out = [];
  const splitAnswer = (text) =>
    plain(text)
      .split(/[／/；;、]/)
      .forEach((seg) => out.push(seg));

  for (const sec of doc.sections ?? []) {
    for (const q of sec.questions ?? []) {
      if (q.answer_text) splitAnswer(q.answer_text);
      if (q.explain) out.push(plain(q.explain));
      if (q.answer) out.push(plain(q.answer));
      for (const it of q.items ?? []) {
        for (const a of it.answers ?? []) out.push(plain(a));
        if (it.answer) out.push(plain(it.answer));
      }
      for (const sub of q.subs ?? []) {
        if (sub.answer) splitAnswer(sub.answer);
      }
    }
  }
  return [...new Set(out.map((t) => t.trim()))].filter((t) => [...t].length >= 2);
}

export { norm };
