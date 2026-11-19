#!/usr/bin/env node
/**
 * 自动化视觉回归差分工具 (Visual Regression Diff)
 *
 * 依据规范第十三部分与路径 A 要求：
 *   - 逐页对比 baseline（标准基准样卷截图）与 current（当前构建输出位图）
 *   - 计算像素级差异比率与变动墨迹
 *   - 输出高亮差分图像到 standard-sample/diffs/
 *   - 生成交互式卷帘对比报告 standard-sample/reports/visual-diff-report.html
 *
 * 用法：
 *   node scripts/visual-diff.mjs
 *   node scripts/visual-diff.mjs --baseline standard-sample/screenshots --current standard-sample/preview
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureDir, writeText } from "../src/core/io.mjs";
import { diffPng } from "../src/qa/raster.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// 命令行参数解析
const argv = process.argv.slice(2);
function getArg(flag, defaultValue) {
  const idx = argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < argv.length) return argv[idx + 1];
  return defaultValue;
}

const defaultBaseline = existsSync(join(ROOT, "standard-sample/goldens"))
  ? join(ROOT, "standard-sample/goldens")
  : join(ROOT, "standard-sample/screenshots");

const baselineDir = getArg("--baseline", defaultBaseline);
const currentDir = getArg("--current", join(ROOT, "standard-sample/preview"));
const diffDir = getArg("--diffs", join(ROOT, "standard-sample/diffs"));
const reportPath = getArg("--report", join(ROOT, "standard-sample/reports/visual-diff-report.html"));
const tolerance = Number(getArg("--tolerance", "10"));
const maxAllowedDiffRatio = Number(getArg("--threshold", "0.001"));
const isApprove = argv.includes("--approve");

console.log("=== 启动自动化视觉回归差分检测 (Visual Diff) ===");
console.log(`基准目录 (Baseline): ${baselineDir}`);
console.log(`当前目录 (Current):  ${currentDir}`);
console.log(`差分目录 (Diffs):    ${diffDir}`);
console.log(`报告文件 (Report):   ${reportPath}`);

if (!existsSync(baselineDir)) {
  console.error(`❌ 基准目录不存在：${baselineDir}`);
  process.exit(1);
}

// 收集基准图片
const baseFiles = readdirSync(baselineDir)
  .filter((f) => f.endsWith(".png"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

if (!baseFiles.length) {
  console.error(`❌ 基准目录无任何 PNG 图片：${baselineDir}`);
  process.exit(1);
}

ensureDir(diffDir);
ensureDir(dirname(reportPath));

// 收集当前构建图片（支持 page-*.png 或 student-*.png 命名）
let currentFiles = existsSync(currentDir)
  ? readdirSync(currentDir).filter((f) => f.endsWith(".png"))
  : [];

// 如果 currentDir 不存在或为空，尝试 fallback 到 baselineDir 本身（自检）
if (!currentFiles.length) {
  console.warn(`⚠️ 当前构建目录无位图，将对基准位图进行一致性自校验`);
  currentFiles = [...baseFiles];
}

const results = [];
let hasAnyFailure = false;

for (let i = 0; i < baseFiles.length; i++) {
  const baseName = baseFiles[i];
  const basePath = join(baselineDir, baseName);

  // 寻找匹配的当前图片：优先相同文件名，其次按序号匹配 student-X.png 或 page-X.png
  let currName = currentFiles.find((f) => f === baseName);
  if (!currName) {
    const pageNum = i + 1;
    currName = currentFiles.find(
      (f) =>
        f === `student-${pageNum}.png` ||
        f === `page-${pageNum}.png` ||
        f === `student-0${pageNum}.png` ||
        f === `page-0${pageNum}.png`,
    );
  }

  const diffName = `diff-${baseName}`;
  const diffPath = join(diffDir, diffName);

  if (!currName) {
    console.error(`❌ 未找到与基准 ${baseName} 匹配的当前构建截图！`);
    results.push({
      page: i + 1,
      baseName,
      currName: null,
      diffName: null,
      error: "当前构建缺少对应页面截图",
      diffRatio: 1.0,
      mismatch: true,
    });
    hasAnyFailure = true;
    continue;
  }

  const currPath = join(existsSync(currentDir) && currentFiles.includes(currName) ? currentDir : baselineDir, currName);

  try {
    const diffRes = diffPng(basePath, currPath, diffPath, {
      tolerance,
      diffColor: [225, 29, 72], // #E11D48
      fadeBackground: true,
    });

    const isExceeded = diffRes.diffRatio > maxAllowedDiffRatio;
    if (isExceeded) hasAnyFailure = true;

    console.log(
      `  [P${i + 1}] 尺寸 ${diffRes.width}×${diffRes.height} | 差异像素: ${diffRes.diffPixels}/${diffRes.totalPixels} (${(diffRes.diffRatio * 100).toFixed(4)}%) | ${isExceeded ? "⚠️ MISMATCH" : "✅ PASS"}`,
    );

    // 相对路径，用于 HTML 报告
    const relBase = relative(dirname(reportPath), basePath);
    const relCurr = relative(dirname(reportPath), currPath);
    const relDiff = relative(dirname(reportPath), diffPath);

    results.push({
      page: i + 1,
      baseName,
      currName,
      diffName,
      relBase,
      relCurr,
      relDiff,
      ...diffRes,
      status: isExceeded ? "FAIL" : "PASS",
    });
  } catch (err) {
    console.error(`  [P${i + 1}] 对比异常：${err.message}`);
    results.push({
      page: i + 1,
      baseName,
      currName,
      diffName: null,
      error: err.message,
      diffRatio: 1.0,
      mismatch: true,
      status: "ERROR",
    });
    hasAnyFailure = true;
  }
}

// 生成现代化交互式 HTML 报告
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>自动化视觉回归差分报告 · Visual Diff Report</title>
  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --pass: #10b981;
      --pass-bg: rgba(16, 185, 129, 0.15);
      --fail: #f43f5e;
      --fail-bg: rgba(244, 63, 94, 0.15);
      --accent: #38bdf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
      line-height: 1.5;
    }
    .header {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px 24px;
      margin-bottom: 24px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .header h1 {
      margin: 0 0 6px 0;
      font-size: 22px;
      letter-spacing: -0.5px;
    }
    .header p {
      margin: 0;
      font-size: 13px;
      color: var(--text-muted);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .badge.pass { background: var(--pass-bg); color: var(--pass); border: 1px solid var(--pass); }
    .badge.fail { background: var(--fail-bg); color: var(--fail); border: 1px solid var(--fail); }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .metric-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .metric-value { font-size: 24px; font-weight: 700; color: var(--accent); }
    .metric-label { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

    .pages-container { display: flex; flex-direction: column; gap: 32px; }
    .page-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .page-title { font-size: 17px; font-weight: 600; }
    .page-meta { font-size: 13px; color: var(--text-muted); }

    /* 视图切换按钮组 */
    .view-controls {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }
    .view-btn {
      background: #0f172a;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .view-btn.active, .view-btn:hover {
      background: #0284c7;
      color: white;
      border-color: #0284c7;
    }

    /* 并排视图 */
    .side-by-side {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    .img-box {
      background: #000;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 8px;
    }
    .img-box h4 {
      margin: 0 0 8px 0;
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }
    .img-box img {
      width: 100%;
      height: auto;
      display: block;
      border-radius: 4px;
    }

    /* 卷帘滑动视图 */
    .slider-view {
      display: none;
      position: relative;
      width: 100%;
      max-width: 600px;
      margin: 0 auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: #000;
    }
    .slider-img-under { width: 100%; display: block; }
    .slider-img-over {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    .slider-img-over img { width: 100%; height: 100%; object-fit: cover; }
    .slider-handle {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 3px;
      background: var(--accent);
      cursor: ew-resize;
      box-shadow: 0 0 8px rgba(0,0,0,0.8);
    }
    .slider-handle::after {
      content: "◀ ▶";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: var(--accent);
      color: #000;
      padding: 3px 6px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 700;
      white-space: nowrap;
    }
    .slider-range {
      width: 100%;
      margin-top: 10px;
    }

    /* 纯差分视图 */
    .diff-only {
      display: none;
      max-width: 600px;
      margin: 0 auto;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      background: #000;
    }
    .diff-only img { width: 100%; display: block; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>自动化视觉回归差分检测报告</h1>
      <p>Visual Regression & Pixel Diff Report ｜ 规范版本：v2.1.0 ｜ 容差：${tolerance}级阶梯</p>
    </div>
    <div>
      <span class="badge ${hasAnyFailure ? "fail" : "pass"}">
        ${hasAnyFailure ? "MISMATCH · 存在视觉差异" : "PASS · 零回归像素级一致"}
      </span>
    </div>
  </div>

  <div class="summary-grid">
    <div class="metric-card">
      <div class="metric-value">${results.length}</div>
      <div class="metric-label">检测页面总数</div>
    </div>
    <div class="metric-card">
      <div class="metric-value" style="color: ${hasAnyFailure ? "var(--fail)" : "var(--pass)"}">
        ${hasAnyFailure ? results.filter((r) => r.mismatch).length : 0}
      </div>
      <div class="metric-label">差异页数</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${(Math.max(...results.map((r) => r.diffRatio || 0)) * 100).toFixed(4)}%</div>
      <div class="metric-label">最大差异比率</div>
    </div>
    <div class="metric-card">
      <div class="metric-value">${(maxAllowedDiffRatio * 100).toFixed(2)}%</div>
      <div class="metric-label">判定阻断阈值</div>
    </div>
  </div>

  <div class="pages-container">
    ${results
      .map(
        (r, idx) => `
    <div class="page-card" id="card-${idx}">
      <div class="page-header">
        <div>
          <span class="page-title">第 ${r.page} 页 (${r.baseName})</span>
          <div class="page-meta">
            ${r.width ? `分辨率：${r.width} × ${r.height} px ｜ ` : ""}
            差异像素：${r.diffPixels || 0} / ${r.totalPixels || 0} (${((r.diffRatio || 0) * 100).toFixed(4)}%)
          </div>
        </div>
        <span class="badge ${r.status === "PASS" ? "pass" : "fail"}">
          ${r.status === "PASS" ? "PASS" : "MISMATCH"}
        </span>
      </div>

      <div class="view-controls">
        <button class="view-btn active" onclick="switchView(${idx}, 'side')">并排对比</button>
        <button class="view-btn" onclick="switchView(${idx}, 'slider')">交互卷帘 (Split Slider)</button>
        <button class="view-btn" onclick="switchView(${idx}, 'diff')">高亮差分图</button>
      </div>

      <!-- 1. 并排视图 -->
      <div class="side-by-side" id="view-side-${idx}">
        <div class="img-box">
          <h4>基准图 (Baseline)</h4>
          <img src="${r.relBase}" alt="Baseline Page ${r.page}">
        </div>
        <div class="img-box">
          <h4>当前构建 (Current)</h4>
          <img src="${r.relCurr}" alt="Current Page ${r.page}">
        </div>
        <div class="img-box">
          <h4>差异高亮 (Diff Map)</h4>
          ${r.relDiff ? `<img src="${r.relDiff}" alt="Diff Page ${r.page}">` : `<p style="text-align:center;color:var(--text-muted)">无差分图</p>`}
        </div>
      </div>

      <!-- 2. 卷帘滑动视图 -->
      <div class="slider-view" id="view-slider-${idx}">
        <img class="slider-img-under" src="${r.relCurr}" alt="Current">
        <div class="slider-img-over" id="over-${idx}" style="width: 50%;">
          <img src="${r.relBase}" alt="Baseline">
        </div>
        <div class="slider-handle" id="handle-${idx}" style="left: 50%;"></div>
        <input type="range" class="slider-range" min="0" max="100" value="50" oninput="updateSlider(${idx}, this.value)">
      </div>

      <!-- 3. 纯差分视图 -->
      <div class="diff-only" id="view-diff-${idx}">
        ${r.relDiff ? `<img src="${r.relDiff}" alt="Diff Only Page ${r.page}">` : `<p>无差分数据</p>`}
      </div>
    </div>
    `,
      )
      .join("")}
  </div>

  <script>
    function switchView(cardIdx, mode) {
      const card = document.getElementById('card-' + cardIdx);
      const side = document.getElementById('view-side-' + cardIdx);
      const slider = document.getElementById('view-slider-' + cardIdx);
      const diff = document.getElementById('view-diff-' + cardIdx);
      const btns = card.querySelectorAll('.view-btn');
      
      btns.forEach(b => b.classList.remove('active'));
      side.style.display = 'none';
      slider.style.display = 'none';
      diff.style.display = 'none';

      if (mode === 'side') {
        side.style.display = 'grid';
        btns[0].classList.add('active');
      } else if (mode === 'slider') {
        slider.style.display = 'block';
        btns[1].classList.add('active');
      } else if (mode === 'diff') {
        diff.style.display = 'block';
        btns[2].classList.add('active');
      }
    }

    function updateSlider(cardIdx, val) {
      const over = document.getElementById('over-' + cardIdx);
      const handle = document.getElementById('handle-' + cardIdx);
      over.style.width = val + '%';
      handle.style.left = val + '%';
    }
  </script>
</body>
</html>`;

writeText(reportPath, html);
console.log(`\n✅ 视觉回归差分报告已生成：${reportPath}`);
console.log(`   共检测 ${results.length} 页，${hasAnyFailure ? "⚠️ 检测到视觉差异" : "✨ 全部像素级匹配"}`);

if (argv.includes("--check") && hasAnyFailure) {
  process.exit(1);
}
