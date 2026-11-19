/**
 * 实测层：用最终渲染所用的同一套 Chrome、同一宽度，量出每个排版原子的毫米高度。
 *
 * 这是整个引擎的地基。测出来的数字直接决定分页结果，
 * 所以"测量环境"与"出 PDF 环境"必须是同一个二进制、同一套 CSS。
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { ensureDir } from "../core/io.mjs";
import { unescapeHtml } from "../core/text.mjs";
import { RenderError } from "../core/errors.mjs";
import { roundHalfEven } from "../core/format.mjs";
import { chromeBaseArgs, runChrome } from "../render/chrome.mjs";

const MEASURE_SCRIPT = `<script>(function(){
var out={};
function ink(el){
  var r=document.createRange();
  try{ r.selectNodeContents(el); }catch(e){ return null; }
  var boxes=r.getClientRects();
  if(!boxes.length) return null;
  var minL=1e9,maxR=-1e9;
  for(var i=0;i<boxes.length;i++){
    var b=boxes[i];
    if(b.width<0.3&&b.height<0.3) continue;
    if(b.left<minL) minL=b.left;
    if(b.right>maxR) maxR=b.right;
  }
  if(maxR<-1e8) return null;
  return {l:minL,r:maxR};
}
document.querySelectorAll('[data-pid]').forEach(function(el){
  var r=el.getBoundingClientRect();
  var worst=-1e9, worstCls='';
  el.querySelectorAll('*').forEach(function(c){
    var hasText=false;
    for(var n=c.firstChild;n;n=n.nextSibling){ if(n.nodeType===3&&n.nodeValue.trim()){ hasText=true; break; } }
    if(!hasText) return;
    var b=ink(c); if(!b) return;
    var cr=c.getBoundingClientRect();
    // 行内元素的盒子紧贴文字，永远不会"溢出"自己 —— 真正被挤压的是父容器
    var pr=c.parentElement?c.parentElement.getBoundingClientRect():cr;
    var ov=Math.max(b.r-cr.right, cr.left-b.l, b.r-pr.right, pr.left-b.l);
    if(ov>worst){ worst=ov; worstCls=String(c.className||c.tagName); }
  });
  out[el.getAttribute('data-pid')]={h:r.height*25.4/96,w:r.width*25.4/96,ov:worst>0?worst*25.4/96:0,ovc:worstCls};
});
document.getElementById('__M__').textContent=JSON.stringify(out);
})();</script>`;

/** 文字墨迹超出自身容器超过该值即判定横向溢出（毫米）。0.8mm 约等于 0.2 个汉字笔画宽度。 */
export const OVERFLOW_TOL_MM = 0.8;

export function buildMeasureHtml(parts, css, widthMm) {
  const blocks = parts
    .map(
      (p) =>
        `<div class="part ${p.cls}" data-pid="${p.pid}" data-cls="${p.cls}" style="width:${widthMm}mm">${p.html}</div>`,
    )
    .join("\n");
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<style>${css}</style></head><body>` +
    `<div id="stage" style="width:${widthMm}mm">${blocks}</div>` +
    '<pre id="__M__">PENDING</pre>' +
    `${MEASURE_SCRIPT}</body></html>`
  );
}

/**
 * 返回 { heights: { [pid]: 高度mm }, overflow: [{ pid, mm, where }] }。
 * 任何一个原子没被量到都算失败 —— 静默跳过会导致它在分页时高度按 0 处理。
 *
 * overflow 记录"文字墨迹宽于自身容器"的原子：块的坐标可以完全合规，
 * 字却已经压到隔壁，这类问题靠 Manifest 与安全区检测都发现不了。
 */
export function measurePartsDetailed(parts, css, widthMm, chrome, workdir) {
  const list = parts.filter((p) => p.pid);
  if (!list.length) return { heights: {}, overflow: [] };

  ensureDir(workdir);
  const src = join(workdir, "measure.html");
  writeFileSync(src, buildMeasureHtml(list, css, widthMm), "utf8");

  const { status, stdout, stderr } = runChrome([
    ...chromeBaseArgs(chrome, join(workdir, "chrome-profile")),
    "--virtual-time-budget=4000",
    "--window-size=1400,1600",
    "--dump-dom",
    pathToFileURL(src).href,
  ]);

  if (status !== 0) throw new RenderError(`Chrome 测量失败（exit=${status}）：${stderr.slice(-800)}`);

  const match = stdout.match(/<pre id="__M__">([\s\S]*?)<\/pre>/);
  if (!match || match[1].includes("PENDING")) {
    throw new RenderError("测量脚本未回传结果：Chrome 可能未执行 JS 或被沙箱阻断。");
  }

  let data;
  try {
    data = JSON.parse(unescapeHtml(match[1]).trim());
  } catch (err) {
    throw new RenderError(`测量结果不是合法 JSON：${err.message}`);
  }

  const heights = {};
  const overflow = [];
  const missing = [];
  for (const part of list) {
    const rec = data[part.pid];
    if (!rec || rec.h === null || rec.h === undefined) {
      missing.push(part.pid);
      continue;
    }
    heights[part.pid] = roundHalfEven(Number(rec.h), 3);
    const ov = Number(rec.ov ?? 0);
    if (ov > OVERFLOW_TOL_MM) {
      overflow.push({ pid: part.pid, mm: roundHalfEven(ov, 2), where: String(rec.ovc ?? "") });
    }
  }
  if (missing.length) throw new RenderError(`以下排版原子未被测量到：${missing.slice(0, 6).join(", ")}`);
  return { heights, overflow };
}

/** 向后兼容的窄接口：只要高度。 */
export function measureParts(parts, css, widthMm, chrome, workdir) {
  return measurePartsDetailed(parts, css, widthMm, chrome, workdir).heights;
}
