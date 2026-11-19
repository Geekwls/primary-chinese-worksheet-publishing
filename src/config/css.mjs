/**
 * CSS 编译层：令牌 + 年级 Profile + 文档 Profile → :root 变量 + @page + 结构样式。
 *
 * 输出顺序固定（变量按令牌分组罗列），保证同一份配置每次编译出的 CSS 完全一致，
 * 也让"改参数导致版面变化"这件事在 diff 里一眼可见。
 */
import { trimNum } from "../core/format.mjs";
import { loadBaseCss } from "./tokens.mjs";

function buildVariables(tokens, profile) {
  const g = tokens.global;
  const sp = tokens.spacing;
  const col = tokens.colors;
  const paper = g.paper;
  const lw = g.line_width_mm;
  const fp = profile.font_pt;
  const lh = profile.line_height;
  const geo = profile.geometry;
  const psp = profile.spacing;
  const contentWidth = paper.page_width_mm - 2 * paper.margin_x_mm;

  return {
    "--f-cjk": `"${g.font.family_cjk}", sans-serif`,
    "--f-py": `${g.font.family_pinyin}, sans-serif`,
    "--fs-title": `${trimNum(fp.title)}pt`,
    "--fs-section": `${trimNum(fp.section)}pt`,
    "--fs-q": `${trimNum(fp.question)}pt`,
    "--fs-body": `${trimNum(fp.body)}pt`,
    "--fs-py": `${trimNum(fp.pinyin)}pt`,
    "--fs-py-a": `${trimNum(fp.pinyin_annotation ?? fp.pinyin)}pt`,
    "--fs-hint": `${trimNum(fp.hint)}pt`,
    "--fs-footer": `${trimNum(fp.footer)}pt`,
    "--lh-q": trimNum(lh.question),
    "--lh-body": trimNum(lh.body),
    "--lh-py": trimNum(lh.pinyin),
    "--ink-1": col.ink.primary,
    "--ink-2": col.ink.secondary,
    "--ink-3": col.ink.muted,
    "--line-1": col.line.primary,
    "--line-2": col.line.secondary,
    "--answer": col.answer.teacher,
    "--lw-hair": `${trimNum(lw.hair)}mm`,
    "--lw-thin": `${trimNum(lw.thin)}mm`,
    "--lw-normal": `${trimNum(lw.normal)}mm`,
    "--lw-strong": `${trimNum(lw.strong)}mm`,
    "--gap-xs": `${trimNum(sp.gap.xs)}mm`,
    "--gap-s": `${trimNum(sp.gap.s)}mm`,
    "--gap-m": `${trimNum(sp.gap.m)}mm`,
    "--gap-l": `${trimNum(sp.gap.l)}mm`,
    "--gap-block": `${trimNum(psp.block_gap_mm)}mm`,
    "--gap-q": `${trimNum(psp.question_gap_mm)}mm`,
    "--gap-row": `${trimNum(psp.row_gap_mm)}mm`,
    "--gap-col": `${trimNum(psp.col_gap_mm)}mm`,
    "--page-w": `${trimNum(paper.page_width_mm)}mm`,
    "--page-h": `${trimNum(paper.page_height_mm)}mm`,
    "--mx": `${trimNum(paper.margin_x_mm)}mm`,
    "--my": `${trimNum(paper.margin_y_mm)}mm`,
    "--my-footer": `${trimNum(paper.margin_y_mm)}mm`,
    "--tz": `${trimNum(geo.tianzi_mm)}mm`,
    "--py-pad": `${trimNum(geo.pinyin_slot_h_mm * 0.35)}mm`,
    "--pin-col-w": `${trimNum(geo.pinyin_col_mm ?? geo.tianzi_mm)}mm`,
    "--wgap": `${trimNum(geo.writing_line_gap_mm)}mm`,
    "--wline-w": `${trimNum(geo.writing_line_width_mm ?? contentWidth)}mm`,
    "--passage-w": `${trimNum(geo.passage_width_mm ?? contentWidth)}mm`,
    "--zw": `${trimNum(geo.composition_cell_mm)}mm`,
    "--zw-cols": String(Math.trunc(geo.composition_cols)),
    "--slot-i": `${trimNum(sp.slot.inline_mm)}mm`,
    "--slot-w": `${trimNum(sp.slot.word_mm)}mm`,
    "--slot-p": `${trimNum(sp.slot.phrase_mm)}mm`,
  };
}

export function buildCss(tokens, profile, docProfile) {
  const paper = tokens.global.paper;
  const variables = buildVariables(tokens, profile);
  const root = Object.entries(variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");

  // 文档级开关：某些卷型不需要行内作答提示，直接用 CSS 关掉，避免在组件里写分支。
  const extra = docProfile.answer_hint_inline === false ? ".note{display:none}\n" : "";

  const pageRule =
    `@page { size: ${trimNum(paper.page_width_mm)}mm ${trimNum(paper.page_height_mm)}mm; margin: 0; }`;

  return `:root {\n${root}\n}\n\n${pageRule}\n\n${extra}${loadBaseCss()}`;
}
