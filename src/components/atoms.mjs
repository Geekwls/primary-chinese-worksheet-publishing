/**
 * L2 策略层工具：题型控制器复用的纯数据助手。
 *
 * AST 化（1.0.0）之后 HTML 生成统一收敛到 layout/ast-html.mjs 解释器，
 * 本模块不再包含任何 HTML 拼接 —— 只有槽解析、分组、行数读取三件事。
 */
import { esc, splitAnswer } from "../core/text.mjs";
import * as ast from "../layout/ast.mjs";

export { esc, splitAnswer };

export function chunks(seq, size) {
  const n = Math.max(1, Math.trunc(size));
  const out = [];
  for (let i = 0; i < seq.length; i += n) out.push(seq.slice(i, i + n));
  return out;
}

const INLINE_TOKEN_RE = /(?:\[([a-zA-Zāáǎàōóǒòēéěèīíǐìūúǔùǖǘǚǜü\s]+)\]\{([^{}]+)\})|(?:\{([^{}]*)\})|(?:~([^\n~]+)~)|(?:\[([^\]]+)\]\{\.dot\})/g;

/**
 * 把行内文本解析为 AST 节点序列（策略层解析，渲染在解释器）。
 * 支持：
 *   - {答案}：作答槽（form 决定 line 或 paren）
 *   - [拼音]{答案}：语境拼音汉字方框槽
 *   - ~加点字~ 或 [加点字]{.dot}：着重号
 */
export function parseInline(src, form) {
  const s = String(src ?? "");
  const out = [];
  let pos = 0;
  INLINE_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = INLINE_TOKEN_RE.exec(s)) !== null) {
    if (m.index > pos) {
      out.push(ast.text(s.slice(pos, m.index)));
    }
    if (m[1] !== undefined && m[2] !== undefined) {
      out.push(ast.inline_pinyin({ pinyin: m[1].trim(), answer: m[2] }));
    } else if (m[3] !== undefined) {
      out.push(ast.blank_slot(form, m[3]));
    } else if (m[4] !== undefined || m[5] !== undefined) {
      out.push(ast.dot(m[4] || m[5]));
    }
    pos = m.index + m[0].length;
  }
  if (pos < s.length) {
    out.push(ast.text(s.slice(pos)));
  }
  return out;
}

/** 读取题目行数字段；null/undefined 时取 fallback（默认 2）。 */
export function answerLines(q, ctx, key = "lines", fallback = 2) {
  const value = q[key];
  return value === null || value === undefined ? fallback : Math.max(0, Math.trunc(Number(value)));
}
