/**
 * 栅格检测：把 PDF 页面转成位图，测量真实墨迹边界。
 *
 * 为什么必须这一步：
 *   pdftotext -bbox 给的是"字体度量框"，不是墨迹。CJK 字体的 ascent 远大于行高，
 *   拿它判越界会大量误报，也看不出线条、田字格、方格的溢出。
 *   所以几何验收以 pdftoppm 位图的像素边界为准，文本检测只用于内容完整性。
 */
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync, inflateSync, crc32 as zlibCrc32 } from "node:zlib";

import { RasterError } from "../core/errors.mjs";
import { roundHalfEven } from "../core/format.mjs";
import { ensureDir } from "../core/io.mjs";
import { pdfToPng } from "./poppler.mjs";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const CRC_TABLE = zlibCrc32
  ? null
  : (() => {
      const table = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
      }
      return table;
    })();

function getCrc32(buffer) {
  if (zlibCrc32) return zlibCrc32(buffer) >>> 0;
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data = Buffer.alloc(0)) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "latin1");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(getCrc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

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

/** 编码并写入 8bit PNG 文件（纯内置实现，零第三方依赖）。 */
export function writePng(path, { width, height, channels = 3, pixels }) {
  const colorType = channels === 1 ? 0 : channels === 3 ? 2 : channels === 4 ? 6 : null;
  if (colorType === null) throw new RasterError(`不支持写入的通道数: ${channels}`);
  if (pixels.length < width * height * channels) {
    throw new RasterError(`像素缓冲区尺寸不足: 期望 ${width * height * channels}，实际 ${pixels.length}`);
  }

  const stride = width * channels;
  const raw = Buffer.alloc(height * (1 + stride));
  let inP = 0;
  let outP = 0;

  for (let y = 0; y < height; y++) {
    raw[outP++] = 0; // Filter 0 (None)
    pixels.copy(raw, outP, inP, inP + stride);
    outP += stride;
    inP += stride;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idat = deflateSync(raw);

  const png = Buffer.concat([
    PNG_SIGNATURE,
    makeChunk("IHDR", ihdr),
    makeChunk("IDAT", idat),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);

  writeFileSync(path, png);
}

function extractRgb(buf, index, channels) {
  if (channels === 1) {
    const v = buf[index];
    return [v, v, v];
  }
  return [buf[index], buf[index + 1], buf[index + 2]];
}

/**
 * 图像差分检测（Visual Diff）：逐像素对比两张位图。
 *
 * @param {string} baselinePath - 基准图路径
 * @param {string} currentPath - 当前构建图路径
 * @param {string|null} diffOutputPath - 差分高亮图输出路径（可选）
 * @param {object} options
 * @param {number} [options.tolerance=10] - 单通道允许容差 (0-255)
 * @param {number[]} [options.diffColor=[225, 29, 72]] - 差异像素高亮色彩 RGB
 * @param {boolean} [options.fadeBackground=true] - 相同像素是否作为浅灰底衬展示
 * @returns {object} { width, height, totalPixels, diffPixels, diffRatio, mismatch, maxDelta, diffOutputPath }
 */
export function diffPng(baselinePath, currentPath, diffOutputPath = null, options = {}) {
  const {
    tolerance = 10,
    diffColor = [225, 29, 72], // #E11D48
    fadeBackground = true,
  } = options;

  const base = readPng(baselinePath);
  const curr = readPng(currentPath);

  if (base.width !== curr.width || base.height !== curr.height) {
    throw new RasterError(
      `位图尺寸不匹配无法比对：基准图(${base.width}×${base.height}) vs 当前图(${curr.width}×${curr.height})`,
    );
  }

  const width = base.width;
  const height = base.height;
  const totalPixels = width * height;
  let diffPixels = 0;
  let maxDelta = 0;

  // 输出 3 通道 RGB 差分图像
  const diffPixelsBuf = diffOutputPath ? Buffer.alloc(width * height * 3) : null;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idxBase = (y * width + x) * base.channels;
      const idxCurr = (y * width + x) * curr.channels;

      const [r1, g1, b1] = extractRgb(base.pixels, idxBase, base.channels);
      const [r2, g2, b2] = extractRgb(curr.pixels, idxCurr, curr.channels);

      const dr = Math.abs(r1 - r2);
      const dg = Math.abs(g1 - g2);
      const db = Math.abs(b1 - b2);
      const delta = Math.max(dr, dg, db);
      if (delta > maxDelta) maxDelta = delta;

      const isDiff = delta > tolerance;
      if (isDiff) diffPixels += 1;

      if (diffPixelsBuf) {
        const outIdx = (y * width + x) * 3;
        if (isDiff) {
          diffPixelsBuf[outIdx] = diffColor[0];
          diffPixelsBuf[outIdx + 1] = diffColor[1];
          diffPixelsBuf[outIdx + 2] = diffColor[2];
        } else if (fadeBackground) {
          const lum = Math.round(0.299 * r1 + 0.587 * g1 + 0.114 * b1);
          const faded = Math.min(255, Math.round(210 + lum * 0.17));
          diffPixelsBuf[outIdx] = faded;
          diffPixelsBuf[outIdx + 1] = faded;
          diffPixelsBuf[outIdx + 2] = faded;
        } else {
          diffPixelsBuf[outIdx] = r1;
          diffPixelsBuf[outIdx + 1] = g1;
          diffPixelsBuf[outIdx + 2] = b1;
        }
      }
    }
  }

  if (diffOutputPath && diffPixelsBuf) {
    writePng(diffOutputPath, { width, height, channels: 3, pixels: diffPixelsBuf });
  }

  const diffRatio = totalPixels > 0 ? diffPixels / totalPixels : 0;

  return {
    width,
    height,
    totalPixels,
    diffPixels,
    diffRatio: roundHalfEven(diffRatio, 6),
    mismatch: diffPixels > 0,
    maxDelta,
    diffOutputPath,
  };
}
