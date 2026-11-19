/**
 * poppler 封装：pdfinfo / pdffonts / pdftotext / pdftoppm。
 *
 * 只用 poppler 意味着任何装了它（几乎每台 Linux/CI 都有）的机器都能复现同一份验收证据，
 * 不引入 Python 生态里那些"装了才能验"的重型依赖。
 */
import { QaError } from "../core/errors.mjs";
import { onPath, run } from "../core/shell.mjs";

const PT2MM = 25.4 / 72;

export function tool(name) {
  const path = onPath(name);
  if (!path) throw new QaError(`缺少检测工具 ${name}（poppler-utils）。验收不允许跳过几何/字体检测。`);
  return path;
}

export function pdfInfo(pdf) {
  const { status, stdout, stderr } = run([tool("pdfinfo"), String(pdf)]);
  if (status !== 0) throw new QaError(`PDF 无法解析（可能损坏）：${pdf}\n${stderr.slice(-400)}`);

  const info = {};
  for (const line of stdout.split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) info[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  const pages = Number.parseInt(info.Pages ?? "0", 10) || 0;
  const size = (info["Page size"] ?? "").match(/([\d.]+)\s*x\s*([\d.]+)\s*pts/);
  return {
    pages,
    width_mm: size ? Number(size[1]) * PT2MM : 0,
    height_mm: size ? Number(size[2]) * PT2MM : 0,
  };
}

export function pdfFonts(pdf) {
  const { stdout } = run([tool("pdffonts"), String(pdf)]);
  const fonts = [];
  for (const line of stdout.split("\n").slice(2)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 6) continue;
    const flags = parts.filter((t) => t === "yes" || t === "no");
    if (flags.length < 3) continue;
    const second = parts[2] ?? "";
    const type = /^\d+$/.test(second) ? `${parts[1]} ${second}` : parts[1];
    fonts.push({ name: parts[0], type, embedded: flags[0], line: line.trim() });
  }
  return fonts;
}

export function pdfText(pdf) {
  const { status, stdout, stderr } = run([tool("pdftotext"), "-enc", "UTF-8", "-layout", String(pdf), "-"]);
  if (status !== 0) throw new QaError(`pdftotext 失败：${stderr.slice(-300)}`);
  return stdout;
}

/** 逐页转 PNG，返回生成的文件前缀（poppler 会追加 -1.png、-2.png …）。 */
export function pdfToPng(pdf, prefix, { dpi = 100 } = {}) {
  const { status, stderr } = run([tool("pdftoppm"), "-png", "-r", String(dpi), String(pdf), prefix], {
    timeoutMs: 300_000,
  });
  if (status !== 0) throw new QaError(`pdftoppm 失败：${stderr.slice(-300)}`);
  return prefix;
}
