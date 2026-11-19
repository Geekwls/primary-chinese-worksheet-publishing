/**
 * 分页层：确定性装箱。
 *
 * 为什么不用 CSS 分页：
 *   CSS 只会"尽力"，它不会在放不下时给诊断，也不会留下布局清单。
 *   这里用实测高度做显式装箱 —— 放不下就换页；单块高于整页就报错，绝不压缩内容。
 */
import { LayoutError } from "../core/errors.mjs";
import { Block } from "../domain/part.mjs";

const MAX_ITERATIONS = 100_000;

/**
 * @param parts    排版原子序列（顺序即阅读顺序）
 * @param heights  { [pid]: 高度mm }
 * @param geo      页面几何
 * @param eps      允许的亚毫米误差（避免 0.29mm 的浮点噪声导致多翻一页）
 */
export function paginate(parts, heights, geo, eps = 0.3) {
  const pages = [];
  let current = [];
  let y = geo.content_top;
  const roomFull = geo.content_bottom - geo.content_top;

  let i = 0;
  let guard = 0;
  while (i < parts.length) {
    guard += 1;
    if (guard > MAX_ITERATIONS) throw new LayoutError("分页循环失控，请检查排版原子高度是否为 0。");

    const part = parts[i];
    const h = heights[part.pid];
    if (h === undefined) throw new LayoutError(`排版原子 ${part.pid} 没有实测高度。`);
    if (h < 0) throw new LayoutError(`${part.pid} 高度为负：${h}`);

    // keepNext：标题不得孤行，题干必须与首行作答区同页。
    // 绑定是传递的：大题标题 → 题干 → 作答块 必须整链同页，否则会出现
    //「五、写话」留在页底、写话格翻到下一页的孤儿标题。
    let need = h;
    if (part.keepNext) {
      let j = i;
      let chain = 0;
      while (j < parts.length && parts[j].keepNext) {
        chain += heights[parts[j].pid];
        j += 1;
      }
      if (j < parts.length) chain += heights[parts[j].pid];
      need = chain > roomFull ? h : chain;
    }

    const room = geo.content_bottom - y;
    if (need <= room + eps) {
      current.push(new Block(part.pid, part.group, part.role, part.cls, geo.margin_x, y, geo.content_width, h, part.label));
      y += h;
      i += 1;
      continue;
    }

    // 当前页已有内容 → 翻页重试
    if (y - geo.content_top > eps) {
      pages.push(current);
      current = [];
      y = geo.content_top;
      continue;
    }

    // 空页仍放不下：不缩字号、不裁切，直接报错并给出诊断信息
    if (h > room + eps) {
      throw new LayoutError(
        `块 ${part.pid}（${part.label || part.role}）高度 ${h.toFixed(1)}mm 超过单页可用高度 ` +
          `${room.toFixed(1)}mm。请拆分为可分割组件或减少单块内容，不允许压缩字号或裁切。`,
      );
    }

    current.push(new Block(part.pid, part.group, part.role, part.cls, geo.margin_x, y, geo.content_width, h, part.label));
    y += h;
    i += 1;
  }

  if (current.length) pages.push(current);
  if (!pages.length) throw new LayoutError("文档没有任何可排版内容。");
  return pages;
}
