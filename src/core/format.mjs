/**
 * 数值格式化：刻意复刻 Python 的 round / %g / f-string 语义。
 *
 * 为什么不能简单地 "乘 10^n 再 Math.round"：
 *   53.735 在 double 里是 53.73499999999999943，Python 会舍成 53.73；
 *   但 53.735 * 100 在浮点里恰好等于 5373.5，看起来像"平局"，
 *   草率的实现会得到 53.74 —— 页面坐标从这一刻起以 0.01mm 漂移，
 *   Manifest 与既有产线再也 diff 不上。
 * 所以这里把 double 的二进制真值展开成整数分数，做精确的十进制舍入。
 */

const buffer = new DataView(new ArrayBuffer(8));
const POW10 = (n) => 10n ** BigInt(n);

/** 精确取出 double 的 |value| = mant * 2^exp（mant 为整数）。 */
function toFraction(value) {
  buffer.setFloat64(0, Math.abs(value));
  const bits = buffer.getBigUint64(0);
  const expBits = Number((bits >> 52n) & 0x7ffn);
  let mant = bits & 0xfffffffffffffn;
  let exp;
  if (expBits === 0) {
    exp = -1074; // 次正规数
  } else {
    mant |= 1n << 52n; // 补回隐含的整数位
    exp = expBits - 1075;
  }
  return { mant, exp };
}

/** 圆整到 nd 位小数，半值取偶（与 Python round 逐位一致）。 */
export function roundHalfEven(value, nd = 0) {
  const v = Number(value);
  if (!Number.isFinite(v)) return v;
  if (v === 0) return 0;

  const { mant, exp } = toFraction(v);
  let num = mant * POW10(nd); // value * 10^nd = num / den
  let den = 1n;
  if (exp >= 0) num <<= BigInt(exp);
  else den <<= BigInt(-exp);

  let q = num / den;
  const twiceRemainder = (num % den) * 2n;
  if (twiceRemainder > den) q += 1n;
  else if (twiceRemainder === den && q % 2n === 1n) q += 1n; // 真正的平局才取偶

  const out = Number(q) / 10 ** nd;
  return v < 0 ? -out : out;
}

/** 等价于 Python f"{v:.{nd}f}"。 */
export function fixed(value, nd = 0) {
  return roundHalfEven(value, nd).toFixed(nd);
}

/** 等价于 Python f"{v:.3f}".rstrip("0").rstrip(".")，用于 CSS 尺寸。 */
export function trimNum(value, nd = 3) {
  const s = fixed(value, nd);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

/** 等价于 Python 的 %g / f"{v:g}"：6 位有效数字并去掉尾随零。 */
export function g(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs < 1e-4 || abs >= 1e6) return n.toExponential(5).replace(/\.?0+e/, "e");
  return String(Number(n.toPrecision(6)));
}
