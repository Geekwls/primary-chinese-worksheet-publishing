/**
 * 可核对文本抽取：把"应该出现在卷面上"的内容变成可 grep 的字符串集合。
 *
 * 这是内容完整性（P0-03 / P0-09）与答案泄露（P0-11）检测的基准，
 * 只在组件 HTML 层做，不依赖 PDF，因此能定位到具体是哪一块丢了。
 */
import { norm, stripTags, unescapeHtml } from "../core/text.mjs";

const BLANK_RE = /\{[^{}]*\}/g;
const ANS_RE = /<span class="ans(?:\s+[^"]*)?">([\s\S]*?)<\/span>/g;

/** 去掉填空占位与标签后的纯文本。 */
export function plain(text) {
  return stripTags(String(text ?? "").replace(BLANK_RE, "")).trim();
}

/** 组件 HTML 中"学生可见"的文本（剔除教师答案覆盖层）。 */
export function visibleText(html) {
  return unescapeHtml(stripTags(String(html ?? "").replace(ANS_RE, "")));
}

/**
 * 卷面结构文本（槽位切分版）。
 *
 * 作答槽（括号槽/花括号槽）会把题干原地替换：学生卷槽位为空、教师卷槽位内
 * 嵌答案文本，整段题干在 PDF 提取流中不再连续，子串匹配必然误报。
 * 按槽位切成片段逐段核对，题干每一段文字仍必须完整可提取。
 */
export function structureSegments(doc) {
  const out = [];
  const pushSegments = (text) => {
    String(text ?? "")
      .split(/（[^（）]*）|\([^()]*\)|\{[^{}]*\}/g)
      .forEach((seg) => out.push(plain(seg)));
  };
  out.push(plain(doc.title ?? ""));
  for (const sec of doc.sections ?? []) {
    out.push(plain(sec.title ?? ""));
    for (const q of sec.questions ?? []) {
      pushSegments(q.stem ?? "");
      for (const para of q.passage?.paragraphs ?? []) out.push(plain(para).slice(0, 30));
    }
  }
  return [...new Set(out.map((t) => t.trim()))].filter((t) => [...t].length >= 2);
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

  // q.answer 可能是多槽串（fill_blank 用 、 分隔，与组件解析一致）或按槽位数组
  const pushAnswer = (answer) => {
    if (Array.isArray(answer)) answer.forEach((a) => splitAnswer(a));
    else if (answer) splitAnswer(answer);
  };

  for (const sec of doc.sections ?? []) {
    for (const q of sec.questions ?? []) {
      pushAnswer(q.answer_text);
      if (q.explain) out.push(plain(q.explain));
      pushAnswer(q.answer);
      for (const it of q.items ?? []) {
        if (typeof it === "string") {
          const matches = it.match(/\{([^{}]+)\}/g);
          if (matches) matches.forEach((m) => out.push(plain(m.slice(1, -1))));
        } else {
          for (const a of it.answers ?? []) out.push(plain(a));
          if (it.answer) out.push(plain(it.answer));
        }
      }
      for (const sub of q.subs ?? []) {
        if (sub.answer) splitAnswer(sub.answer);
      }
    }
  }
  return [...new Set(out.map((t) => t.trim()))].filter((t) => [...t].length >= 2);
}

export { norm };
