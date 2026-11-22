/**
 * CSS 编译层：令牌 + 年级 Profile + 文档 Profile → :root 变量 + @page + 结构样式。
 *
 * 输出顺序固定（变量按令牌分组罗列），保证同一份配置每次编译出的 CSS 完全一致，
 * 也让"改参数导致版面变化"这件事在 diff 里一眼可见。
 */
import { trimNum } from "../core/format.mjs";
import { loadBaseCss } from "./tokens.mjs";

function buildVariables(tokens, profile, pageGeo = null) {
  const g = tokens.global;
  const sp = tokens.spacing;
  const col = tokens.colors;
  const paper = g.paper;
  const lw = g.line_width_mm;
  const fp = profile.font_pt;
  const lh = profile.line_height;
  const geo = profile.geometry;
  const psp = profile.spacing;

  const marginXLeft = pageGeo ? pageGeo.margin_left : Number(paper.margin_x_mm);
  const marginXRight = pageGeo ? pageGeo.margin_right : Number(paper.margin_x_mm);
  const marginTop = pageGeo ? pageGeo.margin_top : Number(paper.margin_y_mm);
  const marginBottom = pageGeo ? pageGeo.margin_bottom : Number(paper.margin_y_mm);
  const contentWidth = pageGeo ? pageGeo.content_width : paper.page_width_mm - 2 * paper.margin_x_mm;
  const footerBaseline = pageGeo ? pageGeo.footer_baseline_bottom : marginBottom;

  return {
    "--font-family-title": `"${g.font.family_cjk}", sans-serif`,
    "--font-family-body": `"${g.font.family_cjk}", sans-serif`,
    "--font-family-pinyin": `${g.font.family_pinyin}, sans-serif`,
    "--font-family-number": `${g.font.family_latin ?? "Noto Sans, Arial"}, sans-serif`,
    "--font-family-emphasis": `"${g.font.family_cjk}", sans-serif`,
    "--font-family-answer": `"${g.font.family_cjk}", sans-serif`,
    "--color-primary": col.ink.primary,
    "--color-secondary": col.ink.secondary,
    "--color-border": col.line.secondary,
    "--color-grid": col.line.primary,
    "--color-divider": col.line.primary,
    "--color-background": col.surface?.base ?? "#FFFFFF",
    "--color-answer": col.answer.teacher,
    "--color-note": col.ink.muted,
    "--f-cjk": `"${g.font.family_cjk}", sans-serif`,
    "--f-kaiti": '"KaiTi", "STKaiti", "楷体", "Source Han Serif CN", "Noto Serif CJK SC", serif',
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
    "--spacing-1": "2mm",
    "--spacing-2": "3mm",
    "--spacing-3": "4mm",
    "--spacing-4": "6mm",
    "--spacing-5": "8mm",
    "--spacing-6": "12mm",
    "--gap-title-stem": "3mm",
    "--gap-stem-options": "3mm",
    "--gap-options-answer": "4mm",
    "--gap-item": "4mm",
    "--gap-section": "6mm",
    "--col-12": `${trimNum(contentWidth)}mm`,
    "--col-6": `${trimNum((contentWidth - 4) / 2)}mm`,
    "--col-4": `${trimNum((contentWidth - 8) / 3)}mm`,
    "--col-3": `${trimNum((contentWidth - 12) / 4)}mm`,
    "--page-w": `${trimNum(pageGeo ? pageGeo.page_width : paper.page_width_mm)}mm`,
    "--page-h": `${trimNum(pageGeo ? pageGeo.page_height : paper.page_height_mm)}mm`,
    "--mx": `${trimNum(marginXLeft)}mm`,
    "--mx-left": `${trimNum(marginXLeft)}mm`,
    "--mx-right": `${trimNum(marginXRight)}mm`,
    "--my": `${trimNum(marginTop)}mm`,
    "--my-top": `${trimNum(marginTop)}mm`,
    "--my-bottom": `${trimNum(marginBottom)}mm`,
    "--my-footer": `${trimNum(footerBaseline)}mm`,
    "--tz": `${trimNum(geo.tianzi_mm)}mm`,
    "--py-pad": `${trimNum(geo.pinyin_slot_h_mm * 0.35)}mm`,
    "--pin-col-w": `${trimNum(geo.pinyin_col_mm ?? geo.tianzi_mm)}mm`,
    "--wgap": `${trimNum(geo.writing_line_gap_mm)}mm`,
    "--wline-w": `${trimNum(Math.min(geo.writing_line_width_mm ?? contentWidth, contentWidth))}mm`,
    "--passage-w": `${trimNum(Math.min(geo.passage_width_mm ?? contentWidth, contentWidth))}mm`,
    "--zw": `${trimNum(geo.composition_cell_mm)}mm`,
    "--zw-cols": String(Math.trunc(geo.composition_cols)),
    "--slot-i": `${trimNum(sp.slot.inline_mm)}mm`,
    "--slot-w": `${trimNum(sp.slot.word_mm)}mm`,
    "--slot-p": `${trimNum(sp.slot.phrase_mm)}mm`,
  };
}

export function buildCss(tokens, profile, docProfile, pageGeo = null, doc = null) {
  const paper = tokens.global.paper;
  const variables = buildVariables(tokens, profile, pageGeo);
  Object.assign(variables, themeVariables(doc));
  const root = Object.entries(variables)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");

  // 文档级开关：某些卷型不需要行内作答提示，直接用 CSS 关掉，避免在组件里写分支。
  const extra = docProfile.answer_hint_inline === false ? ".note{display:none}\n" : "";

  const pageWidth = pageGeo ? pageGeo.page_width : paper.page_width_mm;
  const pageHeight = pageGeo ? pageGeo.page_height : paper.page_height_mm;
  const pageRule =
    `@page { size: ${trimNum(pageWidth)}mm ${trimNum(pageHeight)}mm; margin: 0; }`;

  return `:root {\n${root}\n}\n\n${pageRule}\n\n${extra}${loadBaseCss()}`;
}

/**
 * 主题令牌（v1.1 排版增强）：文档契约可携带 doc.theme = {primary, accent}，
 * 未携带时回退默认暖橙主题（参照主流教辅的视觉基线）。
 * 主题色只作用于装饰层（板块横幅/标签色块/题头点缀），不污染正文墨色。
 */
const DEFAULT_THEME = {
  primary: "#E8590C",
  soft: "#FFF4E6",
  accent: "#F59F00",
};

function themeVariables(doc) {
  const theme = (doc && typeof doc.theme === "object" && doc.theme) || {};
  const primary = /^#[0-9a-fA-F]{6}$/.test(theme.primary ?? "") ? theme.primary : DEFAULT_THEME.primary;
  const accent = /^#[0-9a-fA-F]{6}$/.test(theme.accent ?? "") ? theme.accent : DEFAULT_THEME.accent;
  const soft = /^#[0-9a-fA-F]{6}$/.test(theme.soft ?? "")
    ? theme.soft
    : softTint(primary);
  return {
    "--theme-primary": primary,
    "--theme-accent": accent,
    "--theme-soft": soft,
  };
}

/** 十六进制主色 → 浅底色（与白色按 1:8 混合的近似值，逐通道线性插值）。 */
function softTint(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => (n >> shift) & 0xff;
  const mix = (c) => Math.round(c + (255 - c) * 0.88);
  const to = (v) => v.toString(16).padStart(2, "0");
  return `#${to(mix(ch(16)))}${to(mix(ch(8)))}${to(mix(ch(0)))}`;
}
