/**
 * 舍入与格式化的回归测试。
 *
 * 这组用例全部来自真实事故：把 "乘 10^n 再 Math.round" 写进布局引擎，
 * 会让 53.735 变成 53.74，与 Python 产线差 0.01mm，Manifest 再也 diff 不上。
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { fixed, g, roundHalfEven, trimNum } from "../src/core/format.mjs";

test("roundHalfEven 与 Python round 逐例一致", () => {
  // [输入, 小数位, Python round 的结果]
  const cases = [
    [53.735, 2, 53.73],
    [121.555, 2, 121.56],
    [0.125, 2, 0.12],
    [2.5, 0, 2],
    [1.005, 2, 1],
    [4.5, 2, 4.5],
    [-2.5, 0, -2],
    [0.5, 0, 0],
    [1.5, 0, 2],
    [10, 3, 10],
  ];
  for (const [value, nd, expected] of cases) {
    assert.equal(roundHalfEven(value, nd), expected, `${value} → ${nd} 位`);
  }
});

test("fixed 输出与 f-string 一致", () => {
  assert.equal(fixed(209.8888, 2), "209.89");
  assert.equal(fixed(297.0071, 2), "297.01");
  assert.equal(fixed(4.5, 2), "4.50");
  assert.equal(fixed(0, 0), "0");
});

test("trimNum 去掉尾随零，用于 CSS 尺寸", () => {
  assert.equal(trimNum(186), "186");
  assert.equal(trimNum(11.5), "11.5");
  assert.equal(trimNum(5 * 0.35), "1.75");
  assert.equal(trimNum(210), "210");
});

test("g 等价于 %g", () => {
  assert.equal(g(100), "100");
  assert.equal(g(12.5), "12.5");
  assert.equal(g(0), "0");
});
