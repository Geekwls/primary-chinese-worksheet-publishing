/**
 * 验收层：Q1 数据契约 → Q2 布局几何 → Q3 PDF 文件 → Q4 视觉 → 双轨一致性。
 *
 * 两条真相互相印证：
 *   Layout Manifest —— 引擎"打算"画在哪里（几何真相）
 *   PDF 位图墨迹    —— 真正"画出来"的边界（渲染真相）
 * 任一为假，说明引擎与渲染已经脱钩，此时报告必须 BLOCK。
 */
import { statSync } from "node:fs";
import { join } from "node:path";

import { fixed, g } from "../core/format.mjs";
import { norm } from "../core/text.mjs";
import { SPEC_VERSION, ENGINE_VERSION } from "../core/version.mjs";
import { pageInkBoxes } from "./raster.mjs";
import { pdfFonts, pdfInfo, pdfText } from "./poppler.mjs";
import { Report } from "./report.mjs";

const TONE_CHARS = "āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ";
const TOL_MM = 1.2;

function checkManifest(rep, manifest, tag) {
  const geo = manifest.page;
  const mxLeft = geo.margin_left ?? geo.margin_x;
  const cw = geo.content_width;
  const top = geo.content_top;
  const bottom = geo.content_bottom;
  const bad = [];
  const overlaps = [];

  for (const page of manifest.pages) {
    const blocks = page.blocks;
    for (const b of blocks) {
      if (
        b.x < mxLeft - 0.2 ||
        b.x + b.width > mxLeft + cw + 0.2 ||
        b.y < top - 0.2 ||
        b.y + b.height > bottom + 0.3
      ) {
        bad.push(`p${page.page}:${b.block_id}@y=${b.y}`);
      }
    }
    for (let i = 0; i + 1 < blocks.length; i++) {
      const a = blocks[i];
      const b = blocks[i + 1];
      if (a.y + a.height > b.y + 0.15) overlaps.push(`p${page.page}:${a.block_id}↔${b.block_id}`);
    }
  }

  rep.add(
    "P0-02",
    "P0",
    `版面块坐标未越界（${tag}）`,
    bad.length ? "FAIL" : "PASS",
    bad.length ? bad.slice(0, 5).join("；") : `${manifest.page_count} 页全部落在安全区内`,
  );
  rep.add("P0-08", "P0", `版面块无重叠（${tag}）`, overlaps.length ? "FAIL" : "PASS", overlaps.slice(0, 5).join("；"));
}

export function runQa({
  doc,
  stats,
  manifestStudent,
  manifestTeacher,
  pdfStudent,
  pdfTeacher,
  expected,
  contractWarnings,
  heightDiffs,
  overflow,
  layoutVersion,
  workdir,
}) {
  const rep = new Report(doc.document_id ?? "unknown");
  const geo = manifestStudent.page;
  const margin = geo.margin_x;
  const hasTeacher = Boolean(manifestTeacher && pdfTeacher);
  const fullHeight = geo.content_bottom - geo.content_top;

  // ---------- Q1 数据契约
  if (contractWarnings.length) {
    rep.add("Q0-W", "P1", "数据契约警告", "WARN", contractWarnings.slice(0, 5).join("；"));
  } else {
    rep.add("Q1-01", "P0", "题目数据结构完整", "PASS", `${stats.question_count} 题 / 合计 ${g(stats.score_sum)} 分`);
  }

  // ---------- Q2 布局清单
  checkManifest(rep, manifestStudent, "学生卷");
  if (hasTeacher) checkManifest(rep, manifestTeacher, "教师卷");

  // ---------- 字内横向溢出：块的坐标可以全对，字照样能压到隔壁
  const ovs = (overflow ?? []).filter((o) => Number(o.mm) > 0);
  rep.add(
    "P0-12",
    "P0",
    "文字未横向溢出容器",
    ovs.length ? "FAIL" : "PASS",
    ovs.length
      ? `${ovs.length} 处：` +
        ovs
          .slice(0, 5)
          .map((o) => `${o.pid}:${o.where} 超 ${fixed(o.mm, 1)}mm`)
          .join("；")
      : "全部文字墨迹落在自身容器内（Range 实测）",
  );

  // ---------- Q3 PDF 基础
  let info;
  let infoT = null;
  try {
    info = pdfInfo(pdfStudent);
    if (hasTeacher) infoT = pdfInfo(pdfTeacher);
  } catch (err) {
    rep.add("P0-10", "P0", "PDF 可打开", "FAIL", err.message);
    return rep;
  }
  const kb = Math.floor(statSync(pdfStudent).size / 1024);
  rep.add(
    "P0-10",
    "P0",
    "PDF 可正常打开",
    "PASS",
    hasTeacher ? `学生卷 ${info.pages} 页 / 教师卷 ${infoT.pages} 页 / ${kb} KB` : `学生卷 ${info.pages} 页 / ${kb} KB`,
  );

  const sizeOk = Math.abs(info.width_mm - 210) <= 0.5 && Math.abs(info.height_mm - 297) <= 0.5;
  rep.add(
    "P0-01",
    "P0",
    "页面尺寸正确",
    sizeOk ? "PASS" : "FAIL",
    `${fixed(info.width_mm, 2)} × ${fixed(info.height_mm, 2)} mm` + (sizeOk ? "" : "（应为 210 × 297）"),
  );

  rep.add(
    "P0-02-P",
    "P0",
    "PDF 页数 = 布局清单页数",
    info.pages === manifestStudent.page_count ? "PASS" : "FAIL",
    `PDF ${info.pages} 页 / Manifest ${manifestStudent.page_count} 页`,
  );

  // ---------- Q2 真实墨迹边界
  let inkS = [];
  try {
    inkS = pageInkBoxes(pdfStudent, join(workdir, "ink-student"));
    if (hasTeacher) pageInkBoxes(pdfTeacher, join(workdir, "ink-teacher"));
  } catch (err) {
    rep.add("P0-02-T", "P0", "墨迹越界检测", "FAIL", `位图检测失败：${err.message}`);
    inkS = [];
  }

  const blankPages = inkS.map((p, i) => (p.blank ? i + 1 : null)).filter((v) => v !== null);
  rep.add(
    "P0-08-B",
    "P0",
    "无空白页",
    blankPages.length ? "FAIL" : "PASS",
    blankPages.length ? `空白页：${blankPages.join(", ")}` : "全部页面均有内容",
  );

  const minX = (geo.margin_left ?? geo.margin_x) - TOL_MM;
  const maxX = (geo.width ?? 210) - (geo.margin_right ?? geo.margin_x) + TOL_MM;
  // 页眉顶部物理安全边界：正文起始于 margin_top，续页页眉允许位于 margin_top 上方的专用页眉带中（最低 6.5mm）
  const headerMinY = 6.5;
  const minY = Math.min(geo.margin_top ?? geo.margin_y, headerMinY) - TOL_MM;
  const maxY = (geo.height ?? 297) - (geo.margin_bottom ?? geo.margin_y) + TOL_MM;

  const over = [];
  for (const [i, p] of inkS.entries()) {
    if (p.blank) continue;
    if (p.x0 < minX || p.x1 > maxX || p.y0 < minY || p.y1 > maxY) {
      over.push(`p${i + 1} 墨迹(${fixed(p.x0, 1)},${fixed(p.y0, 1)})-(${fixed(p.x1, 1)},${fixed(p.y1, 1)})`);
    }
  }
  const inkReport = inkS
    .map((p, i) => (p.blank ? "" : `p${i + 1} y${fixed(p.y1, 0)}`))
    .filter(Boolean)
    .join("；")
    .slice(0, 120);

  const isSymmetric =
    geo.margin_left === geo.margin_right &&
    geo.margin_top === geo.margin_bottom &&
    geo.margin_left === geo.margin_top;
  const marginDesc = isSymmetric
    ? `${g(geo.margin_left ?? geo.margin_x)}mm`
    : `上${g(geo.margin_top ?? geo.margin_y)}/下${g(geo.margin_bottom ?? geo.margin_y)}/左${g(geo.margin_left ?? geo.margin_x)}/右${g(geo.margin_right ?? geo.margin_x)}mm`;

  rep.add(
    "P0-02-T",
    "P0",
    "墨迹未越过安全边界（位图实测）",
    over.length ? "FAIL" : "PASS",
    over.length ? `越界：${over.slice(0, 4).join("；")}` : `全部墨迹在 ${marginDesc} 安全区内（${inkReport}）`,
  );

  // ---------- 底部空白（P1，需人工判断是否值得拆块）
  const used = manifestStudent.content_used_mm;
  const blanks = used
    .slice(0, -1)
    .map((u, i) => (fullHeight - u > 45 ? `p${i + 1} 底部空白 ${fixed(fullHeight - u, 0)}mm` : null))
    .filter(Boolean);
  rep.add(
    "P1-06",
    "P1",
    "页面填充合理",
    blanks.length ? "WARN" : "PASS",
    blanks.length ? `${blanks.join("；")}（大块整体换页所致，需人工判断）` : "各页填充均衡",
  );

  // ---------- 字体
  const fonts = pdfFonts(pdfStudent);
  if (!fonts.length) {
    rep.add("P0-04", "P0", "字体嵌入", "FAIL", "pdffonts 未读到字体，文本可能未矢量嵌入");
  } else {
    const notEmbedded = fonts.filter((f) => f.embedded.toLowerCase() !== "yes").map((f) => f.line);
    rep.add(
      "P0-04",
      "P0",
      "字体全部嵌入",
      notEmbedded.length ? "FAIL" : "PASS",
      notEmbedded.length
        ? `未嵌入：${notEmbedded.slice(0, 3).join("；")}`
        : `${fonts.length} 个字体全部嵌入：${[...new Set(fonts.map((f) => f.name))].sort().join("、").slice(0, 90)}`,
    );
  }

  const type3 = fonts.filter((f) => f.type.includes("Type 3")).map((f) => f.name);
  if (type3.length) {
    rep.add(
      "P1-08",
      "P1",
      "字体以 Type 3 形式嵌入",
      "WARN",
      `${type3.length} 个字形体为 Type 3（Chrome/Skia 常见行为）。屏幕与办公打印正常；` +
        "若走专业印刷/印厂预检，建议用 Acrobat 或 Ghostscript 归一化为 CID/TrueType 子集后再交付。",
    );
  } else {
    rep.add("P1-08", "P1", "字体嵌入形态", "PASS", "全部为可子集化的字体类型");
  }

  // ---------- 内容完整性
  const textS = norm(pdfText(pdfStudent));
  const textT = hasTeacher ? norm(pdfText(pdfTeacher)) : "";

  const missing = expected.student.filter((t) => norm(t) && !textS.includes(norm(t)));
  rep.add(
    "P0-03",
    "P0",
    "题干与题目内容无丢失",
    missing.length ? "FAIL" : "PASS",
    missing.length
      ? `缺失 ${missing.length} 处：${missing.slice(0, 6).join("、")}`
      : `${expected.student.length} 个排版单元文本全部命中`,
  );

  if (hasTeacher) {
    const missingT = expected.teacherTexts.filter((t) => norm(t) && !textT.includes(norm(t)));
    rep.add(
      "P0-03-T",
      "P0",
      "教师卷题干完整",
      missingT.length ? "FAIL" : "PASS",
      missingT.length ? `缺失：${missingT.slice(0, 5).join("、")}` : "教师卷题干与解析标题完整",
    );
  } else {
    rep.add("P0-03-T", "P0", "教师卷题干完整", "SKIP", "本次未生成教师卷（--no-teacher）");
  }

  const toneNeeded = new Set();
  for (const t of expected.student) for (const ch of t) if (TONE_CHARS.includes(ch)) toneNeeded.add(ch);
  const toneMissing = [...toneNeeded].filter((ch) => !textS.includes(ch)).sort();
  rep.add(
    "P0-04-T",
    "P0",
    "拼音声调字形完整",
    toneMissing.length ? "FAIL" : "PASS",
    toneMissing.length ? `缺字形：${toneMissing.join("")}` : `${toneNeeded.size} 个声调符号全部可提取`,
  );

  // ---------- 双轨一致性：教师卷不得改变任何块的坐标或高度
  if (hasTeacher) {
    const pageEqual = manifestTeacher.page_count === manifestStudent.page_count;
    const geoEqual =
      pageEqual &&
      manifestStudent.pages.every((pa, pi) =>
        pa.blocks.every((a, bi) => {
          const b = manifestTeacher.pages[pi].blocks[bi];
          if (!b) return false;
          return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
        }),
      );

    const diffBad = Object.entries(heightDiffs ?? {}).filter(([, v]) => Math.abs(v) > 0.3);
    const maxDiff = Math.max(0, ...Object.values(heightDiffs ?? {}).map((v) => Math.abs(v)));
    const ok = geoEqual && !diffBad.length;
    let detail = "";
    if (ok) {
      detail = `${manifestStudent.page_count} 页块坐标完全一致，最大高度偏差 ${fixed(maxDiff, 2)}mm`;
    } else {
      if (!pageEqual) detail += "页数不一致；";
      if (!geoEqual) detail += "块坐标不一致；";
      if (diffBad.length) detail += `答案导致高度变化：${diffBad.slice(0, 4).map(([k]) => k).join("、")}`;
    }
    rep.add("P0-07", "P0", "教师卷未改变学生卷版面", ok ? "PASS" : "FAIL", detail);
  } else {
    rep.add("P0-07", "P0", "教师卷未改变学生卷版面", "SKIP", "本次未生成教师卷（--no-teacher）");
  }

  // ---------- 教师卷答案 / 解析
  if (hasTeacher) {
    const expMissing = expected.teacherAnswers.filter((a) => norm(a) && !textT.includes(norm(a)));
    rep.add(
      "P0-09",
      "P0",
      "答案与解析未丢失/裁切",
      expMissing.length ? "FAIL" : "PASS",
      expMissing.length
        ? `缺失：${expMissing.slice(0, 5).join("、")}`
        : `${expected.teacherAnswers.length} 处答案与解析全部可提取`,
    );
  } else {
    rep.add("P0-09", "P0", "答案与解析未丢失/裁切", "SKIP", "本次未生成教师卷（--no-teacher）");
  }

  // ---------- 学生卷不泄露答案：只查"学生卷本不该出现"的答案串
  const studentCorpus = norm(expected.student.join(""));
  const leakCandidates = expected.teacherAnswers.filter(
    (a) => [...norm(a)].length >= 3 && !studentCorpus.includes(norm(a)),
  );
  const leaks = leakCandidates.filter((a) => textS.includes(norm(a)));
  rep.add(
    "P0-11",
    "P0",
    "学生卷不泄露答案",
    leaks.length ? "FAIL" : "PASS",
    leaks.length ? `泄露：${leaks.slice(0, 5).join("、")}` : "学生卷无答案泄露",
  );

  rep.stats = {
    学生卷页数: info.pages,
    教师卷页数: hasTeacher ? infoT.pages : 0,
    "页面尺寸(mm)": `${fixed(info.width_mm, 1)} × ${fixed(info.height_mm, 1)}`,
    "内容区(mm)": `${fixed(geo.content_width, 0)} × ${fixed(fullHeight, 0)}`,
    字体数量: fonts.length,
    题目数: stats.question_count,
    总分: stats.score_sum,
    设计规范版本: SPEC_VERSION,
    布局契约版本: layoutVersion,
    排版引擎版本: ENGINE_VERSION,
    检测方式: "Layout Manifest + PDF 位图墨迹 + pdftotext 文本",
  };
  return rep;
}
