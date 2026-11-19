/**
 * 栅格检测：把 PDF 页面转成位图，测量真实墨迹边界。
 *
 * 为什么必须这一步：
 *   pdftotext -bbox 给的是"字体度量框"，不是墨迹。CJK 字体的 ascent 远大于行高，
 *   拿它判越界会大量误报，也看不出线条、田字格、方格的溢出。
 *   所以几何验收以 pdftoppm 位图的像素边界为准，文本检测只用于内容完整性。
 */
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";

import { RasterError } from "../core/errors.mjs";
import { roundHalfEven } from "../core/format.mjs";
import { ensureDir } from "../core/io.mjs";
import { pdfToPng } from "./poppler.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/** 解码 8bit PNG（不引第三方库：poppler 输出的就是标准 8bit RGB/灰度）。 */
export function readPng(path) {
  const data = readFileSync(path);
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) throw new RasterError(`不是合法 PNG：${path}`);

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (pos < data.length) {
    const length = data.readUInt32BE(pos);
    const type = data.toString("latin1", pos + 4, pos + 8);
    const chunk = data.subarray(pos + 8, pos + 8 + length);
    pos += 12 + length;
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === "IDAT") {
      idat.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  if (bitDepth !== 8) throw new RasterError(`仅支持 8bit PNG（实际 ${bitDepth}）：${path}`);
  const channels = CHANNELS[colorType];
  if (!channels) throw new RasterError(`不支持的 PNG 颜色类型 ${colorType}：${path}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  let p = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[p];
    p += 1;
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;

    if (filter === 1) {
      for (let i = channels; i < stride; i++) line[i] = (line[i] + line[i - channels]) & 0xff;
    } else if (filter === 2) {
      for (let i = 0; i < stride; i++) line[i] = (line[i] + prev[i]) & 0xff;
    } else if (filter === 3) {
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? line[i - channels] : 0;
        line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xff;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? line[i - channels] : 0;
        const b = prev[i];
        const c = i >= channels ? prev[i - channels] : 0;
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        line[i] = (line[i] + pr) & 0xff;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }

  return { width, height, channels, pixels: out };
}

export function inkBounds({ width, height, channels, pixels }, threshold) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let darkRows = 0;

  for (let y = 0; y < height; y++) {
    const start = y * width * channels;
    const row = pixels.subarray(start, start + width * channels);

    let dark = false;
    for (let i = 0; i < row.length; i++) {
      if (row[i] < threshold) {
        dark = true;
        break;
      }
    }
    if (!dark) continue;

    darkRows += 1;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    for (let x = 0; x < width; x++) {
      const i = x * channels;
      const hit =
        row[i] < threshold || (channels > 2 && (row[i + 1] < threshold || row[i + 2] < threshold));
      if (hit) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }

  if (maxX < 0) return { blank: true, darkRows: 0 };
  return { blank: false, px: { minX, minY, maxX, maxY }, darkRows };
}

/** 逐页计算墨迹外接矩形（毫米）。blank=true 表示整页无墨。 */
export function pageInkBoxes(pdf, workdir, { dpi = 100, threshold = 240 } = {}) {
  ensureDir(workdir);
  for (const name of readdirSync(workdir)) {
    if (/^ink-\d+\.png$/.test(name)) rmSync(join(workdir, name));
  }

  const prefix = join(workdir, "ink");
  pdfToPng(pdf, prefix, { dpi });

  const files = readdirSync(workdir)
    .filter((name) => /^ink-\d+\.png$/.test(name))
    .sort((a, b) => Number(a.match(/-(\d+)\.png$/)[1]) - Number(b.match(/-(\d+)\.png$/)[1]))
    .map((name) => join(workdir, name));
  if (!files.length) throw new RasterError("未生成任何页面位图。");

  const mmPerPx = 25.4 / dpi;
  return files.map((file) => {
    const decoded = readPng(file);
    const info = inkBounds(decoded, threshold);
    const rec = { page_px: [decoded.width, decoded.height], mm_per_px: mmPerPx };
    if (info.blank) {
      rec.blank = true;
      return rec;
    }
    rec.blank = false;
    rec.x0 = roundHalfEven(info.px.minX * mmPerPx, 2);
    rec.y0 = roundHalfEven(info.px.minY * mmPerPx, 2);
    rec.x1 = roundHalfEven((info.px.maxX + 1) * mmPerPx, 2);
    rec.y1 = roundHalfEven((info.px.maxY + 1) * mmPerPx, 2);
    return rec;
  });
}
