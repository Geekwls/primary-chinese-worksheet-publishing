/**
 * 页面组装：绝对定位把每个块钉在清单给出的坐标上。
 *
 * CSS 在这里只负责"长什么样"，不负责"放哪里"——位置全部来自 Layout Manifest，
 * 于是 PDF、清单、截图三者可以互相印证。
 */
import { fixed } from "../core/format.mjs";

/** 学科标签：未标注 subject 时回退语文（引擎的历史默认学科）。 */
const SUBJECT_LABELS = { math: "数学", chinese: "语文", english: "英语" };

export function buildPagesHtml(pages, partsHtml, css, doc, variant) {
  const total = pages.length;
  const isTeacher = variant === "teacher";
  const docTitle = doc.title ?? "";
  const subtitle = doc.subtitle ?? "";
  const footerLeft = isTeacher ? `${docTitle}（教师解析卷）` : docTitle;
  const subjectLabel = SUBJECT_LABELS[doc.subject] ?? "语文";

  const body = pages
    .map((blocks, index) => {
      // 首页 vs 续页模板：续页渲染统一页眉 (Running Header)
      const isFirstPage = index === 0;
      let headerHtml = "";
      if (!isFirstPage && total > 1) {
        const headerLeft = subtitle ? `${docTitle} · ${subtitle}` : docTitle;
        const gradeTag = doc.grade ? `${doc.grade}年级${subjectLabel}` : `小学${subjectLabel}`;
        const headerRight = `${gradeTag} · ${isTeacher ? "教师解析卷" : "作答卷"}`;
        headerHtml = `<div class="run-hdr"><span>${headerLeft}</span><span>${headerRight}</span></div>`;
      }

      const inner = blocks
        .map(
          (b) =>
            `<div class="blk part ${b.cls}" style="left:${fixed(b.x, 3)}mm;top:${fixed(b.y, 3)}mm;` +
            `width:${fixed(b.width, 3)}mm">${partsHtml.get(b.pid) ?? ""}</div>`,
        )
        .join("");

      const footer = `<div class="ftr"><span>${footerLeft}</span><span>第 ${index + 1} 页 / 共 ${total} 页</span></div>`;
      return `<div class="page" data-page="${index + 1}">${headerHtml}${footer}${inner}</div>`;
    })
    .join("");

  return (
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
    `<title>${doc.title ?? ""}</title><style>${css}</style></head><body>${body}</body></html>`
  );
}
