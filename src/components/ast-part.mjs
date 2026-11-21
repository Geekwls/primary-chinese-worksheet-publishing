/**
 * 题型控制器的 Part 产出入口：AST → Part（html 由解释器渲染）。
 *
 * 组件层从此不再出现 HTML 标签 —— comp* 组合 ast.mjs 节点，经本入口
 * 渲染成与历史逐字节一致的 Part.html。pipeline/measure/QA 的消费面零改动。
 */
import { Part } from "../domain/part.mjs";
import { astToHtml } from "../layout/ast-html.mjs";

/**
 * @param {string} pid    Part 标识（如 `${pid}-h`）
 * @param {object|Array} ast  单个节点或节点数组（数组按序拼接为一个 Part 的 html）
 * @param {object} opts   Part 选项（cls/group/role/keepNext/splittable/label），ast 会随 Part 存档
 * @param {object} ctx    Ctx（解释器据此决定教师卷覆盖层与告警收集）
 */
export function astPart(pid, ast, opts = {}, ctx) {
  const nodes = Array.isArray(ast) ? ast : [ast];
  const html = nodes.map((node) => astToHtml(node, ctx)).join("");
  return new Part(pid, html, { ...opts, ast: nodes });
}
