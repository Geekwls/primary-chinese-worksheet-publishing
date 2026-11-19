/**
 * 位图检测测试：几何验收的可信度全部压在这一层。
 * 用例用内存里合成的 PNG（含各类 filter），验证解码与墨迹边界计算。
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { deflateSync } from "node:zlib";

import { RasterError } from "../src/core/errors.mjs";
import { diffPng, inkBounds, readPng, writePng } from "../src/qa/raster.mjs";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** 生成 8bit RGB PNG；pixel(x, y) 返回 [r,g,b]。filter 固定 0（便于断言解码正确性）。 */
function makePng(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function writeTemp(buffer) {
  const dir = mkdtempSync(join(tmpdir(), "wbpub-png-"));
  const path = join(dir, "test.png");
  writeFileSync(path, buffer);
  return path;
}

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

test("整页空白被识别为 blank", () => {
  const png = readPng(writeTemp(makePng(20, 20, () => WHITE)));
  assert.equal(png.width, 20);
  assert.equal(png.channels, 3);
  assert.equal(inkBounds(png, 240).blank, true);
});

test("墨迹边界精确到像素", () => {
  // 在 (5,3) 到 (9,7) 画一个黑块
  const png = readPng(
    writeTemp(makePng(20, 20, (x, y) => (x >= 5 && x <= 9 && y >= 3 && y <= 7 ? BLACK : WHITE))),
  );
  const info = inkBounds(png, 240);
  assert.equal(info.blank, false);
  assert.deepEqual(info.px, { minX: 5, minY: 3, maxX: 9, maxY: 7 });
  assert.equal(info.darkRows, 5);
});

test("浅灰线条不会被阈值漏掉（阈值 240）", () => {
  const light = [200, 200, 200];
  const png = readPng(writeTemp(makePng(10, 10, (x) => (x === 0 ? light : WHITE))));
  assert.deepEqual(inkBounds(png, 240).px, { minX: 0, minY: 0, maxX: 0, maxY: 9 });
});

test("低于阈值的极浅底色不算墨迹", () => {
  const nearWhite = [245, 245, 245];
  const png = readPng(writeTemp(makePng(10, 10, () => nearWhite)));
  assert.equal(inkBounds(png, 240).blank, true);
});

test("非 PNG 文件被明确拒绝", () => {
  const dir = mkdtempSync(join(tmpdir(), "wbpub-bad-"));
  const path = join(dir, "bad.png");
  writeFileSync(path, Buffer.from("not a png"));
  assert.throws(() => readPng(path), (err) => {
    assert.ok(err instanceof RasterError);
    assert.match(err.message, /不是合法 PNG/);
    return true;
  });
});

test("writePng 能够正确编码 8bit RGB 位图并被 readPng 读取", () => {
  const dir = mkdtempSync(join(tmpdir(), "wbpub-write-"));
  const path = join(dir, "written.png");
  const pixels = Buffer.from([
    255, 0, 0,    0, 255, 0,
    0, 0, 255,    255, 255, 0
  ]);
  writePng(path, { width: 2, height: 2, channels: 3, pixels });
  const read = readPng(path);
  assert.equal(read.width, 2);
  assert.equal(read.height, 2);
  assert.equal(read.channels, 3);
  assert.deepEqual(Array.from(read.pixels), Array.from(pixels));
});

test("diffPng 对相同位图判定为 0 差异且 mismatch=false", () => {
  const dir = mkdtempSync(join(tmpdir(), "wbpub-diff-"));
  const p1 = join(dir, "p1.png");
  const p2 = join(dir, "p2.png");
  const pixels = Buffer.alloc(4 * 4 * 3, 200);
  writePng(p1, { width: 4, height: 4, channels: 3, pixels });
  writePng(p2, { width: 4, height: 4, channels: 3, pixels });

  const res = diffPng(p1, p2);
  assert.equal(res.totalPixels, 16);
  assert.equal(res.diffPixels, 0);
  assert.equal(res.diffRatio, 0);
  assert.equal(res.mismatch, false);
});

test("diffPng 准确识别差异像素并输出高亮差分图像", () => {
  const dir = mkdtempSync(join(tmpdir(), "wbpub-diff-"));
  const base = join(dir, "base.png");
  const curr = join(dir, "curr.png");
  const diffOut = join(dir, "diff.png");

  // 10x10 全白图
  const pixels1 = Buffer.alloc(10 * 10 * 3, 255);
  // curr 在 (2, 2) 和 (2, 3) 处修改为红色
  const pixels2 = Buffer.alloc(10 * 10 * 3, 255);
  pixels2[(2 * 10 + 2) * 3] = 255;
  pixels2[(2 * 10 + 2) * 3 + 1] = 0;
  pixels2[(2 * 10 + 2) * 3 + 2] = 0;

  pixels2[(2 * 10 + 3) * 3] = 255;
  pixels2[(2 * 10 + 3) * 3 + 1] = 0;
  pixels2[(2 * 10 + 3) * 3 + 2] = 0;

  writePng(base, { width: 10, height: 10, channels: 3, pixels: pixels1 });
  writePng(curr, { width: 10, height: 10, channels: 3, pixels: pixels2 });

  const res = diffPng(base, curr, diffOut, { tolerance: 5, diffColor: [225, 29, 72] });
  assert.equal(res.totalPixels, 100);
  assert.equal(res.diffPixels, 2);
  assert.equal(res.diffRatio, 0.02);
  assert.equal(res.mismatch, true);

  // 验证生成的 diff 图像
  const diffImg = readPng(diffOut);
  assert.equal(diffImg.width, 10);
  assert.equal(diffImg.height, 10);
  // 检查差异点处的颜色高亮
  const offset = (2 * 10 + 2) * 3;
  assert.equal(diffImg.pixels[offset], 225);
  assert.equal(diffImg.pixels[offset + 1], 29);
  assert.equal(diffImg.pixels[offset + 2], 72);
});

test("diffPng 拒绝尺寸不一致的位图", () => {
  const dir = mkdtempSync(join(tmpdir(), "wbpub-diff-"));
  const p1 = join(dir, "p1.png");
  const p2 = join(dir, "p2.png");
  writePng(p1, { width: 4, height: 4, channels: 3, pixels: Buffer.alloc(4 * 4 * 3) });
  writePng(p2, { width: 5, height: 5, channels: 3, pixels: Buffer.alloc(5 * 5 * 3) });

  assert.throws(() => diffPng(p1, p2), (err) => {
    assert.ok(err instanceof RasterError);
    assert.match(err.message, /尺寸不匹配/);
    return true;
  });
});
