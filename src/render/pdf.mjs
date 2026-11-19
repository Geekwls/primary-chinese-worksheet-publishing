/** PDF 输出：把组装好的页面 HTML 交给固定版本的 Chrome 打印。 */
import { existsSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { RenderError } from "../core/errors.mjs";
import { ensureDir } from "../core/io.mjs";
import { chromeBaseArgs, findChrome, runChrome } from "./chrome.mjs";

const MIN_PDF_BYTES = 2000;

export function htmlToPdf(html, outPdf, tokens, workdir) {
  const chrome = findChrome(tokens);
  ensureDir(workdir);
  const stem = basename(outPdf, extname(outPdf));
  const src = join(workdir, `${stem}.html`);
  writeFileSync(src, html, "utf8");

  ensureDir(dirname(outPdf));
  if (existsSync(outPdf)) rmSync(outPdf);

  const { status, stderr } = runChrome(
    [
      ...chromeBaseArgs(chrome, join(workdir, "chrome-profile")),
      "--no-pdf-header-footer",
      "--run-all-compositor-stages-before-draw",
      "--virtual-time-budget=6000",
      `--print-to-pdf=${outPdf}`,
      pathToFileURL(src).href,
    ],
    { timeoutMs: 240_000 },
  );

  if (!existsSync(outPdf) || statSync(outPdf).size < MIN_PDF_BYTES) {
    throw new RenderError(`PDF 未生成（exit=${status}）：${stderr.slice(-800)}`, "PDF_RENDER");
  }
  return outPdf;
}
