#!/usr/bin/env node
/**
 * 打印机硬件物理校准与几何标定样张生成工具 (Section 2.2, 4.1, 14.1 & 附录 B)
 *
 * 依据规范出版级要求，生成 100% 物理尺寸的校准 PDF：
 * 1. 四周 0–210mm / 0–297mm 绝对物理毫米标尺，直接检测打印机硬件走纸截断；
 * 2. 5mm、8mm、10mm、12mm、15mm 阶梯式可打印边界线，判定设备不可打印区域；
 * 3. 100.0mm × 100.0mm 绝对比例标定框（含 141.42mm 对角线），直测驱动缩放偏差与滚轴形变；
 * 4. 一年级 14.0mm 与二年级 12.0mm 标准田字格实测组，检验长宽比 1:1 与几何失真；
 * 5. 0.18mm~0.70mm 印刷线宽阶梯与出版级文字灰阶阶梯；
 * 6. 附录 B 实物打样现场签署单（包含边距补偿判定与责任人签署）。
 *
 * 输出：
 *   standard-sample/print-review/print-calibration.pdf
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDir } from "../src/core/io.mjs";
import { loadTokens } from "../src/config/tokens.mjs";
import { htmlToPdf } from "../src/render/pdf.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_PDF = join(ROOT, "standard-sample/print-review/print-calibration.pdf");
const WORK_DIR = join(ROOT, "standard-sample/.cache");

console.log("=== 开始生成打印机硬件物理校准样张 (print-calibration.pdf) ===");

// 1. 生成四周毫米标尺 SVG 刻度
function generateRulerSvg() {
  const topTicks = [];
  const bottomTicks = [];
  const leftTicks = [];
  const rightTicks = [];

  // 横向标尺 (0 - 210 mm)
  for (let mm = 0; mm <= 210; mm++) {
    const is10 = mm % 10 === 0;
    const is5 = mm % 5 === 0;
    const len = is10 ? 4.5 : is5 ? 3.0 : 1.8;
    const strokeW = is10 ? 0.35 : 0.2;

    // 顶端标尺 (y: 0 -> len)
    topTicks.push(`<line x1="${mm}" y1="0" x2="${mm}" y2="${len}" stroke="#0f172a" stroke-width="${strokeW}" />`);
    if (is10 && mm > 0 && mm < 210) {
      topTicks.push(
        `<text x="${mm}" y="${len + 2.4}" font-size="2.2" font-family="sans-serif" text-anchor="middle" fill="#0f172a">${mm}</text>`,
      );
    }

    // 底端标尺 (y: 297 -> 297 - len)
    bottomTicks.push(
      `<line x1="${mm}" y1="297" x2="${mm}" y2="${297 - len}" stroke="#0f172a" stroke-width="${strokeW}" />`,
    );
    if (is10 && mm > 0 && mm < 210) {
      bottomTicks.push(
        `<text x="${mm}" y="${297 - len - 0.8}" font-size="2.2" font-family="sans-serif" text-anchor="middle" fill="#0f172a">${mm}</text>`,
      );
    }
  }

  // 纵向标尺 (0 - 297 mm)
  for (let mm = 0; mm <= 297; mm++) {
    const is10 = mm % 10 === 0;
    const is5 = mm % 5 === 0;
    const len = is10 ? 4.5 : is5 ? 3.0 : 1.8;
    const strokeW = is10 ? 0.35 : 0.2;

    // 左侧标尺 (x: 0 -> len)
    leftTicks.push(`<line x1="0" y1="${mm}" x2="${len}" y2="${mm}" stroke="#0f172a" stroke-width="${strokeW}" />`);
    if (is10 && mm > 0 && mm < 297) {
      leftTicks.push(
        `<text x="${len + 0.8}" y="${mm + 0.8}" font-size="2.2" font-family="sans-serif" text-anchor="start" fill="#0f172a">${mm}</text>`,
      );
    }

    // 右侧标尺 (x: 210 -> 210 - len)
    rightTicks.push(
      `<line x1="210" y1="${mm}" x2="${210 - len}" y2="${mm}" stroke="#0f172a" stroke-width="${strokeW}" />`,
    );
    if (is10 && mm > 0 && mm < 297) {
      rightTicks.push(
        `<text x="${210 - len - 0.8}" y="${mm + 0.8}" font-size="2.2" font-family="sans-serif" text-anchor="end" fill="#0f172a">${mm}</text>`,
      );
    }
  }

  return `
    <!-- 四边物理标尺刻度 -->
    <g class="rulers">
      ${topTicks.join("\n      ")}
      ${bottomTicks.join("\n      ")}
      ${leftTicks.join("\n      ")}
      ${rightTicks.join("\n      ")}
    </g>

    <!-- 阶梯安全边距框 -->
    <!-- 5mm 极限边框 -->
    <rect x="5" y="5" width="200" height="287" fill="none" stroke="#dc2626" stroke-width="0.22" stroke-dasharray="1.5 1.5" />
    <text x="5.5" y="7.5" font-size="1.8" fill="#dc2626" font-family="sans-serif">5mm 极限边距</text>
    <text x="204.5" y="291.5" font-size="1.8" fill="#dc2626" font-family="sans-serif" text-anchor="end">5mm</text>

    <!-- 8mm 紧凑边框 -->
    <rect x="8" y="8" width="194" height="281" fill="none" stroke="#ea580c" stroke-width="0.22" stroke-dasharray="2 2" />
    <text x="8.5" y="10.5" font-size="1.8" fill="#ea580c" font-family="sans-serif">8mm 紧凑边距</text>

    <!-- 10mm 规范标准版心 -->
    <rect x="10" y="10" width="190" height="277" fill="none" stroke="#0284c7" stroke-width="0.4" />
    <text x="10.5" y="12.5" font-size="2.0" font-weight="bold" fill="#0284c7" font-family="sans-serif">★ 10.0mm 规范标准版心边界</text>
    <text x="199.5" y="286.5" font-size="2.0" font-weight="bold" fill="#0284c7" font-family="sans-serif" text-anchor="end">10mm</text>

    <!-- 12mm 宽松边框 -->
    <rect x="12" y="12" width="186" height="273" fill="none" stroke="#7c3aed" stroke-width="0.22" stroke-dasharray="3 2" />
    <text x="12.5" y="14.5" font-size="1.8" fill="#7c3aed" font-family="sans-serif">12mm 宽松边距</text>

    <!-- 15mm 喷墨走纸盲区边框 -->
    <rect x="15" y="15" width="180" height="267" fill="none" stroke="#64748b" stroke-width="0.22" stroke-dasharray="2 3" />
    <text x="15.5" y="17.5" font-size="1.8" fill="#64748b" font-family="sans-serif">15mm 喷墨安全边距</text>
  `;
}

// 2. 组装整页 HTML
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>打印机硬件物理校准样张 · v2.1.0</title>
  <style>
    @page {
      size: 210mm 297mm;
      margin: 0;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 210mm;
      height: 297mm;
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif;
      overflow: hidden;
      position: relative;
    }
    .svg-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 210mm;
      height: 297mm;
      pointer-events: none;
      z-index: 1;
    }
    .sheet-content {
      position: absolute;
      top: 15mm;
      left: 17mm;
      width: 176mm;
      height: 267mm;
      z-index: 2;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    /* 标头区 */
    .header-box {
      border-bottom: 1.5px solid #0f172a;
      padding-bottom: 2mm;
    }
    .header-title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .main-title {
      font-size: 15pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin: 0;
      color: #0f172a;
    }
    .sub-title {
      font-size: 8pt;
      color: #475569;
      margin: 1mm 0 0 0;
      font-family: sans-serif;
    }
    .badge-bar {
      display: flex;
      gap: 3mm;
      margin-top: 1.8mm;
      font-size: 7.5pt;
      color: #334155;
    }
    .badge {
      background: #f1f5f9;
      border: 0.5px solid #cbd5e1;
      padding: 0.8mm 2mm;
      border-radius: 1mm;
      font-weight: 600;
    }
    .badge.warn {
      background: #fef2f2;
      color: #b91c1c;
      border-color: #fca5a5;
    }

    /* 上半区：100mm 标定框 + 田字格与线阶梯 */
    .top-section {
      display: flex;
      gap: 4mm;
      margin-top: 2.5mm;
    }
    .left-scale-box {
      width: 100mm;
      flex-shrink: 0;
    }
    /* 100mm x 100mm 绝对物理方框 */
    .calibration-square {
      width: 100mm;
      height: 100mm;
      border: 0.4mm solid #0f172a;
      position: relative;
      background: #fafafa;
    }
    .square-inner-guide {
      position: absolute;
      top: 0;
      left: 0;
      width: 100mm;
      height: 100mm;
    }
    .square-text {
      position: absolute;
      top: 15mm;
      left: 10mm;
      width: 80mm;
      font-size: 7.2pt;
      line-height: 1.45;
      color: #1e293b;
    }
    .square-text h4 {
      margin: 0 0 1.5mm 0;
      font-size: 8.5pt;
      color: #0f172a;
      border-bottom: 0.3mm solid #cbd5e1;
      padding-bottom: 1mm;
    }

    .right-tools-box {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2.2mm;
    }
    .panel-card {
      border: 0.3mm solid #cbd5e1;
      border-radius: 1.5mm;
      padding: 2mm 2.5mm;
      background: #ffffff;
    }
    .panel-title {
      font-size: 8.2pt;
      font-weight: 700;
      margin: 0 0 1.5mm 0;
      color: #0f172a;
      display: flex;
      justify-content: space-between;
    }
    .panel-title span { font-weight: normal; font-size: 7pt; color: #64748b; }

    /* 田字格测试组件样式 */
    .tianzi-row {
      display: flex;
      align-items: center;
      gap: 2.5mm;
      margin-bottom: 1.8mm;
    }
    .tianzi-label {
      width: 20mm;
      font-size: 7pt;
      font-weight: 600;
      color: #334155;
      line-height: 1.2;
    }
    .tianzi-group {
      display: inline-flex;
      border: 0.22mm solid #94a3b8;
    }
    .tianzi-cell {
      position: relative;
      border-right: 0.22mm solid #94a3b8;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: "KaiTi", "STKaiti", "Noto Serif CJK SC", serif;
      color: #0f172a;
    }
    .tianzi-cell:last-child { border-right: none; }
    .tianzi-cell::before {
      content: "";
      position: absolute;
      top: 50%;
      left: 0;
      right: 0;
      border-top: 0.18mm dashed #94a3b8;
    }
    .tianzi-cell::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: 50%;
      border-left: 0.18mm dashed #94a3b8;
    }
    .tianzi-cell span { position: relative; z-index: 1; }
    .g1-cell { width: 14mm; height: 14mm; font-size: 10pt; }
    .g2-cell { width: 12mm; height: 12mm; font-size: 9pt; }

    /* 线宽阶梯 */
    .line-row {
      display: flex;
      align-items: center;
      margin-bottom: 1.2mm;
      font-size: 6.8pt;
      color: #475569;
    }
    .line-desc { width: 32mm; }
    .line-bar { flex: 1; background: #0f172a; }

    /* 色彩与灰阶 */
    .color-swatches {
      display: flex;
      gap: 1.5mm;
      margin-top: 1mm;
    }
    .swatch {
      flex: 1;
      height: 6mm;
      border-radius: 0.8mm;
      border: 0.2mm solid #cbd5e1;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 5.5pt;
      font-weight: 700;
      color: #ffffff;
    }

    /* 中半区：低段字号阶梯 */
    .mid-section {
      border: 0.3mm solid #cbd5e1;
      border-radius: 1.5mm;
      padding: 2.2mm 3mm;
      background: #ffffff;
      margin-top: 1.5mm;
    }
    .type-ladder {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 4mm;
      row-gap: 1.2mm;
      font-size: 7.5pt;
    }
    .type-item {
      display: flex;
      align-items: baseline;
      gap: 2mm;
      border-bottom: 0.2mm dashed #e2e8f0;
      padding-bottom: 0.6mm;
    }
    .type-tag {
      width: 25mm;
      font-size: 6.8pt;
      color: #64748b;
      flex-shrink: 0;
    }
    .type-text { color: #0f172a; white-space: nowrap; overflow: hidden; }

    /* 下半区：打样实测记录表 (附录 B) */
    .bottom-section {
      border: 0.4mm solid #0f172a;
      border-radius: 1.5mm;
      padding: 2.5mm 3.5mm;
      background: #ffffff;
      margin-top: 1.5mm;
    }
    .sign-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 7pt;
      margin-top: 1.2mm;
    }
    .sign-table th, .sign-table td {
      border: 0.25mm solid #94a3b8;
      padding: 1.2mm 2mm;
      text-align: left;
    }
    .sign-table th { background: #f8fafc; font-weight: 700; color: #1e293b; width: 22%; }
    .sign-table td { color: #334155; }
    .input-line { display: inline-block; border-bottom: 0.3mm solid #475569; min-width: 18mm; height: 3mm; }

    /* 页脚操作提示 */
    .footer-notes {
      font-size: 6.5pt;
      color: #64748b;
      margin-top: 1.5mm;
      display: flex;
      justify-content: space-between;
      border-top: 0.3mm solid #e2e8f0;
      padding-top: 1mm;
    }
  </style>
</head>
<body>
  <!-- 1. 四周物理标尺与边距安全框 SVG 覆盖层 (210mm x 297mm) -->
  <svg class="svg-overlay" viewBox="0 0 210 297" width="210mm" height="297mm" xmlns="http://www.w3.org/2000/svg">
    ${generateRulerSvg()}
  </svg>

  <!-- 2. 正文主体（严格坐落于 15mm 安全内版心，不遮挡毫米刻度） -->
  <div class="sheet-content">
    <!-- 标头 -->
    <div class="header-box">
      <div class="header-title-row">
        <div>
          <h1 class="main-title">小学语文出版级排版 · 打印机硬件物理校准样张</h1>
          <p class="sub-title">Printer Hardware Calibration & Scale Verification Sheet · Design Spec v2.1.0</p>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 9pt; font-weight: bold; color: #0284c7;">A4 (210.0 × 297.0 mm)</div>
          <div style="font-size: 7pt; color: #64748b;">标准物理单位 / 100% 打印</div>
        </div>
      </div>
      <div class="badge-bar">
        <span class="badge warn">⚠️ 打印要求：必须在打印驱动中选择「实际大小 / 100% 缩放」，严禁选择「适应纸张」</span>
        <span class="badge">标定基准：10.0mm 页面边距</span>
        <span class="badge">验证状态：VALIDATED</span>
      </div>
    </div>

    <!-- 上部核心标定区 -->
    <div class="top-section">
      <!-- 左：100mm 标定方块 -->
      <div class="left-scale-box">
        <div class="calibration-square">
          <svg class="square-inner-guide" viewBox="0 0 100 100" width="100mm" height="100mm" xmlns="http://www.w3.org/2000/svg">
            <!-- 对角线 -->
            <line x1="0" y1="0" x2="100" y2="100" stroke="#94a3b8" stroke-width="0.25" stroke-dasharray="1.5 1.5" />
            <line x1="0" y1="100" x2="100" y2="0" stroke="#94a3b8" stroke-width="0.25" stroke-dasharray="1.5 1.5" />
            <!-- 中心十字基准线 -->
            <line x1="50" y1="0" x2="50" y2="100" stroke="#cbd5e1" stroke-width="0.2" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="#cbd5e1" stroke-width="0.2" />
            <!-- 对角线标注 -->
            <text x="52" y="47" font-size="2.6" fill="#0284c7" font-family="sans-serif" font-weight="bold">对角线: 141.42 mm</text>
            <text x="50" y="97" font-size="2.4" fill="#0f172a" font-family="sans-serif" text-anchor="middle" font-weight="bold">横向: 100.0 mm</text>
            <text x="3" y="52" font-size="2.4" fill="#0f172a" font-family="sans-serif" transform="rotate(-90 3,52)" text-anchor="middle" font-weight="bold">纵向: 100.0 mm</text>
          </svg>
          <div class="square-text">
            <h4>100.0 mm 绝对比例标定框</h4>
            <p style="margin: 0 0 1mm 0;"><b>【钢尺实测指引】</b></p>
            <p style="margin: 0 0 0.8mm 0;">1. 测量外边框宽度应精确等于 <b>100.0 mm</b>（容差 ±0.3mm）。</p>
            <p style="margin: 0 0 0.8mm 0;">2. 测量外边框高度应精确等于 <b>100.0 mm</b>（容差 ±0.3mm）。</p>
            <p style="margin: 0 0 0.8mm 0;">3. 测量虚线对角线应精确等于 <b>141.4 mm</b>。</p>
            <p style="margin: 0 0 0.8mm 0; color: #b91c1c;">★ 若实测为 96~97mm，表明驱动被勾选了「适合可打印区域」，需调回 100%。</p>
            <p style="margin: 0; color: #475569;">★ 若宽为 100mm 但高为 98.5mm，表明进纸辊存在纵向拉伸或走纸打滑。</p>
          </div>
        </div>
      </div>

      <!-- 右：田字格几何校验 + 印刷线宽 + 色阶 -->
      <div class="right-tools-box">
        <!-- 田字格几何 -->
        <div class="panel-card">
          <div class="panel-title">
            田字格几何尺寸实测 <span>验证 1:1 无形变拉伸</span>
          </div>
          <!-- 一年级 14mm -->
          <div class="tianzi-row">
            <div class="tianzi-label">一年级标准<br><span style="font-weight:normal;color:#64748b;">14.0 mm</span></div>
            <div class="tianzi-group">
              <div class="tianzi-cell g1-cell"><span>语</span></div>
              <div class="tianzi-cell g1-cell"><span>文</span></div>
              <div class="tianzi-cell g1-cell"><span>规</span></div>
              <div class="tianzi-cell g1-cell"><span>范</span></div>
            </div>
            <div style="font-size: 6.5pt; color: #64748b; line-height: 1.2;">
              4联总宽：<b>56.0 mm</b><br>
              格高：<b>14.0 mm</b>
            </div>
          </div>
          <!-- 二年级 12mm -->
          <div class="tianzi-row" style="margin-bottom: 0;">
            <div class="tianzi-label">二年级标准<br><span style="font-weight:normal;color:#64748b;">12.0 mm</span></div>
            <div class="tianzi-group">
              <div class="tianzi-cell g2-cell"><span>出</span></div>
              <div class="tianzi-cell g2-cell"><span>版</span></div>
              <div class="tianzi-cell g2-cell"><span>校</span></div>
              <div class="tianzi-cell g2-cell"><span>准</span></div>
            </div>
            <div style="font-size: 6.5pt; color: #64748b; line-height: 1.2;">
              4联总宽：<b>48.0 mm</b><br>
              格高：<b>12.0 mm</b>
            </div>
          </div>
        </div>

        <!-- 印刷线宽阶梯 -->
        <div class="panel-card">
          <div class="panel-title">
            印刷线宽梯阶 <span>确认极细线条无断线/虚化</span>
          </div>
          <div class="line-row">
            <div class="line-desc">0.18 mm (0.50pt 田字格十字虚线)</div>
            <div class="line-bar" style="height: 0.18mm;"></div>
          </div>
          <div class="line-row">
            <div class="line-desc">0.22 mm (0.62pt 田字格外边线)</div>
            <div class="line-bar" style="height: 0.22mm;"></div>
          </div>
          <div class="line-row">
            <div class="line-desc">0.30 mm (0.85pt 答题横线)</div>
            <div class="line-bar" style="height: 0.30mm;"></div>
          </div>
          <div class="line-row" style="margin-bottom: 0;">
            <div class="line-desc">0.45 mm (1.28pt 大题分界线)</div>
            <div class="line-bar" style="height: 0.45mm;"></div>
          </div>
        </div>

        <!-- 灰阶与色彩辨识 -->
        <div class="panel-card" style="padding-bottom: 1.8mm;">
          <div class="panel-title">
            墨色阶梯与色彩对比度 <span>黑白/彩色分辨</span>
          </div>
          <div class="color-swatches">
            <div class="swatch" style="background: #0f172a;">#0F172A<br>100%正文</div>
            <div class="swatch" style="background: #1e293b;">#1E293B<br>二级文字</div>
            <div class="swatch" style="background: #475569;">#475569<br>提示拼音</div>
            <div class="swatch" style="background: #94a3b8; color: #0f172a;">#94A3B8<br>田字格</div>
            <div class="swatch" style="background: #cbd5e1; color: #0f172a;">#CBD5E1<br>极浅参考</div>
            <div class="swatch" style="background: #b3261e;">#B3261E<br>教师答案</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 中部：低段字号阶梯 -->
    <div class="mid-section">
      <div class="panel-title" style="margin-bottom: 1.5mm;">
        低学段字号与易读性阶梯 (Typography Legibility Ladder) <span>汉字、拼音与数字混排测试</span>
      </div>
      <div class="type-ladder">
        <div class="type-item">
          <div class="type-tag">20pt (试卷主标题)</div>
          <div class="type-text" style="font-size: 20pt; font-weight: bold; line-height: 1.1;">二年级语文期末复习卷</div>
        </div>
        <div class="type-item">
          <div class="type-tag">16pt (一级题型标题)</div>
          <div class="type-text" style="font-size: 16pt; font-weight: bold; line-height: 1.1;">一、看拼音，写词语 (10分)</div>
        </div>
        <div class="type-item">
          <div class="type-tag">13pt (一年级正文基准)</div>
          <div class="type-text" style="font-size: 13pt;">小鸟在枝头唱着动听的歌曲。1 2 3 4 5</div>
        </div>
        <div class="type-item">
          <div class="type-tag">12pt (二年级正文基准)</div>
          <div class="type-text" style="font-size: 12pt;">春风吹绿了大地，桃花绽开了笑脸。</div>
        </div>
        <div class="type-item">
          <div class="type-tag">11pt (拼音与辅助说明)</div>
          <div class="type-text" style="font-size: 11pt; font-family: sans-serif;">chūn fēng chuī lǜ le dà dì (共 4 小题)</div>
        </div>
        <div class="type-item">
          <div class="type-tag">10.5pt (教师答案/解析)</div>
          <div class="type-text" style="font-size: 10.5pt; color: #b3261e; font-weight: bold;">【解析】本题考查形近字辨析与拼读。</div>
        </div>
      </div>
    </div>

    <!-- 下部：附录 B 打印硬件校准与签署表 -->
    <div class="bottom-section">
      <div class="panel-title" style="margin-bottom: 1mm; font-size: 8.8pt;">
        附录 B：实物打样硬件校准与签署记录表 <span>现场量测并手写记录</span>
      </div>
      <table class="sign-table">
        <tr>
          <th>测试设备型号</th>
          <td>型号：<span class="input-line" style="min-width: 45mm;"></span> 类型：[ ] 激光机  [ ] 喷墨机  [ ] 印刷数码机</td>
          <th>纸张与墨水</th>
          <td>克重：[ ] 70g [ ] 80g 纸 ｜ 墨：[ ] 激光碳粉 [ ] 原装连供喷墨</td>
        </tr>
        <tr>
          <th>100mm 标定实测</th>
          <td>横向：<span class="input-line"></span> mm ｜ 纵向：<span class="input-line"></span> mm (缩放偏差：<span class="input-line" style="min-width: 12mm;"></span> %)</td>
          <th>对角线实测</th>
          <td>实测值：<span class="input-line"></span> mm (理论标准 141.42 mm，允许误差 ±0.5mm)</td>
        </tr>
        <tr>
          <th>田字格尺寸实测</th>
          <td>14mm格：<span class="input-line"></span> mm ｜ 12mm格：<span class="input-line"></span> mm (长宽比是否 1:1：[ ] 是 [ ] 否)</td>
          <th>极细线条表现</th>
          <td>0.18mm 虚线：[ ] 清晰 [ ] 变浅 [ ] 断线 ｜ 0.22mm 实线：[ ] 良好</td>
        </tr>
        <tr>
          <th>硬件边缘截断位置<br>(观察四周刻度)</th>
          <td colspan="3">
            顶端截断：<span class="input-line" style="min-width: 12mm;"></span> mm ｜ 
            底端截断：<span class="input-line" style="min-width: 12mm;"></span> mm ｜ 
            左侧截断：<span class="input-line" style="min-width: 12mm;"></span> mm ｜ 
            右侧截断：<span class="input-line" style="min-width: 12mm;"></span> mm
            <span style="color: #64748b; margin-left: 2mm;">(若底端在 285mm 处被切断，说明底端硬件不可打印区为 12mm)</span>
          </td>
        </tr>
        <tr>
          <th>校准判定结论</th>
          <td colspan="3">
            [ ] <b>完全合格 (VALIDATED)</b>：10mm 规范边距内墨迹完好，100mm 比例误差 &lt; 0.5%，允许正式出版批量生成。<br>
            [ ] <b>需边距补偿配置</b>：目标设备存在不可打印区，需在配置中注入 <code>print_safety_margin: { bottom: <span class="input-line" style="min-width: 10mm;"></span> mm }</code>。<br>
            [ ] <b>驱动缩放错误</b>：驱动开启了自动缩放，必须纠正驱动设置后重新校验。
          </td>
        </tr>
        <tr>
          <th>校验人签署</th>
          <td>测试工程师 / 审校：<span class="input-line" style="min-width: 25mm;"></span></td>
          <th>校验日期</th>
          <td>202____ 年 ____ 月 ____ 日</td>
        </tr>
      </table>
    </div>

    <!-- 底部操作提示 -->
    <div class="footer-notes">
      <span>小学低段语文试卷排版引擎 · 确定性渲染内核 (ENGINE v1.1.0 · SPEC v2.1.0)</span>
      <span>检验依据：GB/T 18358-2009 中小学教科书印刷质量标准 ｜ 物理输出测量工具：高精度毫米钢直尺 / 游标卡尺</span>
    </div>
  </div>
</body>
</html>`;

// 3. 调用无头 Chrome 生成 PDF
ensureDir(dirname(OUT_PDF));
ensureDir(WORK_DIR);
const tokens = loadTokens();

htmlToPdf(html, OUT_PDF, tokens, WORK_DIR);

console.log(`\n✅ 打印机硬件物理校准样张已成功生成：`);
console.log(`   ${OUT_PDF}`);
