/**
 * 预览图：逐页 PNG，供人工视觉复核。
 *
 * 它不属于验收项（不参与 PASS/BLOCK 判定），
 * 但 P1 视觉检查没有它就是空谈 —— 所以默认生成，失败也不阻断出卷。
 */
import { join } from "node:path";

import { ensureDir } from "../core/io.mjs";
import { pdfToPng } from "./poppler.mjs";

export function runPreview(outDir, pdfs, { dpi = 80 } = {}) {
  const dir = ensureDir(join(outDir, "preview"));
  const written = [];
  for (const [name, pdf] of Object.entries(pdfs)) {
    if (!pdf) continue;
    try {
      pdfToPng(pdf, join(dir, name), { dpi });
      written.push(name);
    } catch {
      // 预览失败不影响交付物判定
    }
  }
  return written;
}
