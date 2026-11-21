/**
 * 布局清单：把"引擎打算画在哪里"固化成可追溯证据。
 *
 * 单位统一毫米。学生卷与教师卷各出一份，两份必须逐块一致（P0-07），
 * 这样"答案把版面挤坏"就不再是肉眼判断，而是可以 diff 的事实。
 */
import { roundHalfEven } from "../core/format.mjs";

export function manifestOf(pages, geo, meta) {
  const pageRecords = pages.map((blocks, index) => ({
    page: index + 1,
    blocks: blocks.map((b) => b.asDict()),
  }));

  const used = pages.map((blocks) => {
    if (!blocks.length) return 0;
    const last = Math.max(...blocks.map((b) => b.y + b.height));
    return roundHalfEven(last - geo.content_top, 2);
  });

  return {
    document_id: meta.document_id ?? null,
    layout_version: meta.layout_version ?? "1.0.0",
    ast_version: meta.ast_version ?? null,
    units: "mm",
    grade: meta.grade ?? null,
    variant: meta.variant ?? null,
    page: {
      width: geo.page_width,
      height: geo.page_height,
      margin_x: geo.margin_x,
      margin_y: geo.margin_y,
      margin_left: geo.margin_left ?? geo.margin_x,
      margin_right: geo.margin_right ?? geo.margin_x,
      margin_top: geo.margin_top ?? geo.margin_y,
      margin_bottom: geo.margin_bottom ?? geo.margin_y,
      content_width: geo.content_width,
      content_top: geo.content_top,
      content_bottom: geo.content_bottom,
      printer: geo.printer ?? "default",
    },
    page_count: pages.length,
    content_used_mm: used,
    pages: pageRecords,
  };
}
