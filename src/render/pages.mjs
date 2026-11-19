/**
 * 页面组装：绝对定位把每个块钉在清单给出的坐标上。
 *
 * CSS 在这里只负责"长什么样"，不负责"放哪里"——位置全部来自 Layout Manifest，
 * 于是 PDF、清单、截图三者可以互相印证。
 */
import { fixed } from "../core/format.mjs";

export function buildPagesHtml(pages, partsHtml, css, doc, variant) {
  const total = pages.length;
  const footerLeft = variant === "teacher" ? `${doc.title ?? ""}（教师解析卷）` : (doc.title ?? "");

  const body = pages
    .map((blocks, index) => {
      const inner = blocks
        .map(
          (b) =>
            `<div class="blk part ${b.cls}" style="left:${fixed(b.x, 3)}mm;top:${fixed(b.y, 3)}mm;` +
            `width:${fixed(b.width, 3)}mm">${partsHtml.get(b.pid) ?? ""}</div>`,
        )
        .join("");
      const footer = `<div class="ftr"><span>${footerLeft}</span><span>第 ${index + 1} 页 / 共 ${total} 页</span></div>`;
      return `<div class="page">${footer}${inner}</div>`;
    })
    .join("");

  return (
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    `<title>${doc.title ?? ""}</title><style>${css}</style></head><body>${body}</body></html>`
  );
}
