/**
 * L1/L2 原子构件：最低层的 HTML 片段生成器。
 *
 * 铁律（与 CSS 共同保证）：
 *   1. 每个片段自带内边距，块与块之间不依赖外边距 —— 否则绝对定位会错位。
 *   2. 教师卷答案一律用 <span class="ans"> 绝对定位覆盖，不参与高度计算。
 */
import { ComponentError } from "../core/errors.mjs";
import { esc } from "../core/text.mjs";

export { esc };

/** 教师卷答案覆盖层；学生卷调用时应传入空串。 */
export function ans(text, cls = "ans") {
  return text ? `<span class="${cls}">${esc(text)}</span>` : "";
}

export function chunks(seq, size) {
  const n = Math.max(1, Math.trunc(size));
  const out = [];
  for (let i = 0; i < seq.length; i += n) out.push(seq.slice(i, i + n));
  return out;
}

/** 田字格行：一个字一格，教师卷把答案写进格心。 */
export function tzgRow(answer, ctx) {
  let cells = "";
  for (const ch of answer) {
    cells += `<span class="tzg">${ctx.isTeacher ? ans(ch) : ""}</span>`;
  }
  return `<div class="tzrow">${cells}</div>`;
}

/** 拼音 + 田字格词组：拼音逐音节对齐汉字，不对应时整词居中而不猜位置。 */
export function pinyinWordItem(item, ctx) {
  const word = String(item.answer ?? "");
  const syllables = String(item.pinyin ?? "").split(/\s+/).filter(Boolean);
  if (!word) {
    throw new ComponentError(`看拼音写词语缺少 answer 字段：${JSON.stringify(item)}`);
  }
  const chars = [...word];
  let py;
  if (syllables.length === chars.length && syllables.length > 0) {
    py = syllables.map((s) => `<span class="pyc">${esc(s)}</span>`).join("");
  } else {
    py = `<span class="pyc" style="width:calc(var(--tz)*${Math.max(1, chars.length)})">${esc(syllables.join(" "))}</span>`;
  }
  return `<div class="pitem"><div class="pyrow">${py}</div>${tzgRow(word, ctx)}</div>`;
}

const BLANK_RE = /\{([^{}]*)\}/g;

/**
 * 把题干里的 {答案} 渲染成作答槽。
 * style: "paren" 括号槽（成语/字词）；"line" 横线槽（古诗/填空）。
 */
export function inlineText(text, ctx, style = "paren") {
  const src = String(text ?? "");
  const out = [];
  let pos = 0;
  BLANK_RE.lastIndex = 0;
  let m;
  while ((m = BLANK_RE.exec(src)) !== null) {
    out.push(esc(src.slice(pos, m.index)));
    const answer = m[1];
    if (style === "paren") {
      out.push(`<span class="brk">（<i class="gap"></i>）${ctx.isTeacher ? ans(answer) : ""}</span>`);
    } else {
      // 槽宽按答案字数走，不设上限：上限会把 7 字答案压进 6 字空间，学生只能写到线外
      const width = Math.max(2.2, [...answer].length * 1.18 + 0.5);
      out.push(
        `<span class="brk"><i class="slot" style="width:${width.toFixed(2)}em"></i>` +
          `${ctx.isTeacher ? ans(answer) : ""}</span>`,
      );
    }
    pos = m.index + m[0].length;
  }
  out.push(esc(src.slice(pos)));
  return out.join("");
}

/** 题号 + 题干 + 分值。题号由上下文自增，保证与解析页编号一致。 */
export function stemInner(q, ctx, no) {
  const score = q.score;
  const showScore = (ctx.docProfile.section_score_visible ?? true) && score !== null && score !== undefined;
  const hint = showScore ? `<span class="pt">（${esc(score)}分）</span>` : "";
  const number = no === undefined || no === null ? ctx.nextNo() : no;
  return `<span class="no">${number}.</span> ${esc(q.stem ?? "")}${hint}`;
}

/**
 * 长答案按每行可容纳字数切开，优先在标点后断行，模拟教师手写批注。
 * 这是"答案不得被裁切"（P0-09）在组件层的前置保障。
 */
export function splitAnswer(text, capacity) {
  const src = String(text ?? "").trim();
  if (!src) return [];
  const chars = [...src];
  if (chars.length <= capacity) return [src];
  const PUNCT = "，。；：、！？…";
  const segs = [];
  let buf = "";
  let len = 0;
  for (const ch of chars) {
    buf += ch;
    len += 1;
    if ((len >= capacity - 1 && PUNCT.includes(ch)) || len >= capacity) {
      segs.push(buf);
      buf = "";
      len = 0;
    }
  }
  if (buf) segs.push(buf);
  return segs;
}

/** 书写横线组。预留行数不足时记录警告，由 CLI 汇总上报而不是静默裁切。 */
export function wlines(count, answers, ctx, label = "") {
  const total = Math.max(0, Math.trunc(count));
  const text = (answers ?? []).find((a) => a) ?? "";
  const segs = ctx.isTeacher ? splitAnswer(text, ctx.lineCapacity) : [];
  if (segs.length > total && total > 0) {
    ctx.warnings.push(
      `教师卷答案预计需要 ${segs.length} 行，但只预留 ${total} 行（${label || "题目"}），请增加 lines 或缩短答案`,
    );
  }
  let html = "";
  for (let i = 0; i < total; i++) {
    html += `<div class="wline">${i < segs.length ? ans(segs[i]) : ""}</div>`;
  }
  return html;
}

export function answerLines(q, ctx, key = "lines", fallback = 2) {
  const value = q[key];
  return value === null || value === undefined ? fallback : Math.max(0, Math.trunc(Number(value)));
}
