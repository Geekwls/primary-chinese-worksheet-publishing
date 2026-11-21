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

const BLANK_RE = /\{([^{}]*)\}/g;

/**
 * 把 {答案} 文本解析为行内 AST 节点序列（策略层解析，渲染在解释器）。
 * form: "line" 横线槽（古诗/填空/阅读）；"paren" 括号槽（成语/字词/笔顺）。
 */
export function parseInline(src, form) {
  const s = String(src ?? "");
  const out = [];
  let pos = 0;
  BLANK_RE.lastIndex = 0;
  let m;
  while ((m = BLANK_RE.exec(s)) !== null) {
    out.push(ast.text(s.slice(pos, m.index)));
    out.push(ast.blank_slot(form, m[1]));
    pos = m.index + m[0].length;
  }
  out.push(ast.text(s.slice(pos)));
  return out;
}

/** 读取题目行数字段；null/undefined 时取 fallback（默认 2）。 */
export function answerLines(q, ctx, key = "lines", fallback = 2) {
  const value = q[key];
  return value === null || value === undefined ? fallback : Math.max(0, Math.trunc(Number(value)));
}
