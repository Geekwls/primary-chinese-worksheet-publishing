/**
 * Chrome 适配层：定位可执行文件、拼装固定启动参数、同步执行。
 *
 * 为什么要"固定浏览器版本"：分页是基于实测高度的，换浏览器就等于换了一把尺子，
 * 同一份题目会得到另一套版面。渲染器是排版系统的一部分，不是可替换的插件。
 */
import { existsSync } from "node:fs";

import { RenderError } from "../core/errors.mjs";
import { onPath, run } from "../core/shell.mjs";

export const PX_PER_MM = 96 / 25.4;

const FALLBACKS = ["google-chrome", "chromium", "chromium-browser", "google-chrome-stable"];

export function findChrome(tokens) {
  const configured = tokens?.global?.render?.chrome_binary;
  for (const candidate of [configured, ...FALLBACKS.map(onPath)]) {
    if (candidate && existsSync(candidate)) return candidate;
  }
  throw new RenderError(
    "未找到 Chrome/Chromium。PDF 渲染必须固定浏览器版本，不允许换用其它渲染器顶替；" +
      "请安装 google-chrome 或在 tokens/global.json 的 render.chrome_binary 指定路径。",
  );
}

export function chromeBaseArgs(chrome, profileDir) {
  return [
    chrome,
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--force-device-scale-factor=1",
    `--user-data-dir=${profileDir}`,
  ];
}

/** 同步执行 Chrome，返回 { status, stdout, stderr }。超时即视为渲染失败。 */
export function runChrome(args, { timeoutMs = 180_000 } = {}) {
  const proc = run(args, { timeoutMs });
  if (proc.error) throw new RenderError(`Chrome 执行失败：${proc.error.message}`);
  return proc;
}
