/**
 * 出卷编排：一份文档 → 一份可直接交付的产物包。
 *
 * 顺序不可打乱：契约 → 组件 → 实测 → 分页 → 渲染 → 验收。
 * 任何一步失败都返回明确错误码，不产出"看起来像交付物"的半成品。
 */
import { join } from "node:path";

import { buildDocHead, buildExplanationParts, buildSection } from "./components/furniture.mjs";
import { resolveComponent } from "./components/registry.mjs";
import { Ctx } from "./components/context.mjs";
import { buildCss } from "./config/css.mjs";
import { geometryOf, loadDocProfile, loadGradeProfile, loadPrinterProfile, loadTokens } from "./config/tokens.mjs";
import { LAYOUT_VERSION } from "./core/version.mjs";
import { loadDocument } from "./domain/document.mjs";
import { structureSegments, teacherAnswers, visibleText } from "./domain/texts.mjs";
import { measurePartsDetailed } from "./layout/measure.mjs";
import { manifestOf } from "./layout/manifest.mjs";
import { paginate } from "./layout/paginate.mjs";
import { runQa } from "./qa/audit.mjs";
import { runPreview } from "./qa/preview.mjs";
import { writeReport } from "./qa/report.mjs";
import { findChrome } from "./render/chrome.mjs";
import { buildPagesHtml } from "./render/pages.mjs";
import { htmlToPdf } from "./render/pdf.mjs";
import { ensureDir, writeJson } from "./core/io.mjs";

/** 把整卷拆成排版原子序列（学生卷与教师卷各跑一次，互不共享状态）。 */
export function buildParts(doc, ctx) {
  const parts = [buildDocHead(doc, ctx)];
  doc.sections.forEach((sec, index) => {
    if (sec.title) parts.push(buildSection(sec, ctx, index + 1));
    for (const q of sec.questions ?? []) {
      const { build } = resolveComponent(q.type);
      parts.push(...build(q, ctx, q.question_id ?? `q${index + 1}`));
    }
  });
  return parts;
}

/**
 * @param {object} options
 * @param {string} options.document     题目 JSON 路径
 * @param {string} options.out          输出目录
 * @param {number} [options.grade]      覆盖年级（对比试验用）
 * @param {string} [options.docType]    覆盖卷型 profile
 * @param {boolean} [options.teacher]   是否生成教师解析卷
 * @param {boolean} [options.preview]   是否输出逐页 PNG
 * @param {(msg: string) => void} [options.log]
 */
export function runBuild({
  document,
  out,
  grade,
  docType,
  printer,
  margins = {},
  teacher = true,
  preview = true,
  log = () => {},
}) {
  // 1) 契约
  const { doc, warnings, stats } = loadDocument(document);
  const effectiveGrade = Number(grade ?? doc.grade);
  const tokens = loadTokens();
  const profile = loadGradeProfile(effectiveGrade);
  const docProfile = loadDocProfile(docType ?? doc.doc_type);
  const printerProfile = loadPrinterProfile(printer);
  const geo = geometryOf(tokens, printerProfile, margins);
  const css = buildCss(tokens, profile, docProfile, geo);

  log(
    `[1/6] 契约校验通过：${stats.question_count} 题，合计 ${stats.score_sum} 分` +
      `（${profile.label} / ${docProfile.label} / 打印配置: ${geo.printer}）`,
  );
  if (
    geo.margin_bottom !== 10 ||
    geo.margin_top !== 10 ||
    geo.margin_left !== 10 ||
    geo.margin_right !== 10
  ) {
    log(
      `      硬件边距补偿生效：上 ${geo.margin_top}mm / 下 ${geo.margin_bottom}mm / ` +
        `左 ${geo.margin_left}mm / 右 ${geo.margin_right}mm（版心可用高度: ${(geo.content_bottom - geo.content_top).toFixed(1)}mm）`,
    );
  }
  for (const w of warnings) log(`      ⚠ ${w}`);

  const outDir = ensureDir(out);
  const work = join(outDir, "_work");

  // 2) 组件 → 排版原子
  const fontSizeMm = (profile.font_pt.question * 25.4) / 72;
  // 行容量必须按"书写线实际宽度"算，不能按版心：线比版心窄时，按版心切行会让教师卷答案写到线外
  const writeWidth = Math.min(geo.content_width, profile.geometry?.writing_line_width_mm ?? geo.content_width);
  const capacity = Math.trunc((writeWidth - 6) / (fontSizeMm * 1.02));

  const ctxStudent = new Ctx(profile, docProfile, "student", capacity);
  const partsStudent = buildParts(doc, ctxStudent);
  const ctxTeacher = new Ctx(profile, docProfile, "teacher", capacity);
  const partsTeacher = buildParts(doc, ctxTeacher);
  const ctxExplain = new Ctx(profile, docProfile, "teacher", capacity);
  const partsExplain = buildExplanationParts(doc, ctxExplain);

  for (const w of [...ctxTeacher.warnings, ...ctxExplain.warnings]) {
    warnings.push(w);
    log(`      ⚠ ${w}`);
  }
  log(`[2/6] 组件映射完成：${partsStudent.length} 个排版原子（含 ${partsExplain.length} 条解析块）`);

  // 3) 实测（同一 Chrome、同一宽度）
  const chrome = findChrome(tokens);
  const mStudent = measurePartsDetailed(partsStudent, css, geo.content_width, chrome, work);
  const mTeacher = teacher
    ? measurePartsDetailed(partsTeacher, css, geo.content_width, chrome, work)
    : { heights: {}, overflow: [] };
  const mExplain = teacher && partsExplain.length
    ? measurePartsDetailed(partsExplain, css, geo.content_width, chrome, work)
    : { heights: {}, overflow: [] };
  const heightsStudent = mStudent.heights;
  const heightsTeacher = mTeacher.heights;
  const heightsExplain = mExplain.heights;
  const overflow = [...mStudent.overflow, ...mTeacher.overflow, ...mExplain.overflow];

  const heightDiffs = {};
  for (const [pid, h] of Object.entries(heightsStudent)) {
    heightDiffs[pid] = Number(((heightsTeacher[pid] ?? 0) - h).toFixed(3));
  }
  const totalHeight = Object.values(heightsStudent).reduce((a, b) => a + b, 0);
  log(
    `[3/6] Chrome 实测完成：内容高 ${totalHeight.toFixed(0)}mm / 可用单页 ` +
      `${(geo.content_bottom - geo.content_top).toFixed(0)}mm，横向溢出 ${overflow.length} 处`,
  );

  // 4) 分页
  const pagesStudent = paginate(partsStudent, heightsStudent, geo);
  const pagesTeacher = teacher ? paginate(partsTeacher, heightsTeacher, geo) : [];
  const pagesExplain = teacher && partsExplain.length ? paginate(partsExplain, heightsExplain, geo) : [];

  if (teacher && pagesStudent.length !== pagesTeacher.length) {
    const err = new Error(
      `学生卷 ${pagesStudent.length} 页 / 教师卷 ${pagesTeacher.length} 页，教师卷答案改变了版面，禁止发布。`,
    );
    err.code = "DUAL_TRACK_CONFLICT";
    throw err;
  }
  log(
    `[4/6] 分页完成：正文 ${pagesStudent.length} 页` + (pagesExplain.length ? `，解析附页 ${pagesExplain.length} 页` : ""),
  );

  // 5) 渲染
  const meta = { document_id: doc.document_id, grade: effectiveGrade, layout_version: LAYOUT_VERSION };
  const manifestStudent = manifestOf(pagesStudent, geo, { ...meta, variant: "student" });
  const manifestTeacher = teacher ? manifestOf(pagesTeacher, geo, { ...meta, variant: "teacher" }) : null;
  const manifestTeacherFull = teacher
    ? manifestOf([...pagesTeacher, ...pagesExplain], geo, { ...meta, variant: "teacher" })
    : null;

  const htmlStudent = buildPagesHtml(
    pagesStudent,
    new Map(partsStudent.map((p) => [p.pid, p.html])),
    css,
    doc,
    "student",
  );
  const pdfStudent = join(outDir, "student.pdf");
  htmlToPdf(htmlStudent, pdfStudent, tokens, work);

  let pdfTeacher = null;
  if (teacher) {
    const htmlTeacher = buildPagesHtml(
      [...pagesTeacher, ...pagesExplain],
      new Map([...partsTeacher, ...partsExplain].map((p) => [p.pid, p.html])),
      css,
      doc,
      "teacher",
    );
    pdfTeacher = join(outDir, "teacher.pdf");
    htmlToPdf(htmlTeacher, pdfTeacher, tokens, work);
  }

  writeJson(join(outDir, "layout-manifest.json"), manifestStudent);
  if (teacher) {
    writeJson(join(outDir, "layout-manifest-teacher.json"), manifestTeacherFull);
    log(
      `[5/6] PDF 输出：student.pdf（${pagesStudent.length} 页）、teacher.pdf（${pagesTeacher.length + pagesExplain.length} 页）`,
    );
  } else {
    log(`[5/6] PDF 输出：student.pdf（${pagesStudent.length} 页），未生成教师卷`);
  }

  // 6) 验收
  const report = runQa({
    doc,
    stats,
    manifestStudent,
    manifestTeacher,
    pdfStudent,
    pdfTeacher,
    expected: {
      student: partsStudent.map((p) => visibleText(p.html)).filter((t) => t.trim().length >= 2),
      // 教师卷题干按作答槽切分核对：槽位处学生卷为空、教师卷内嵌答案，
      // 整段题干在提取流中不连续，只有分段核对才能既不误报也不漏检。
      teacherTexts: [...structureSegments(doc), ...partsExplain.map((p) => visibleText(p.html))],
      teacherAnswers: teacher ? teacherAnswers(doc) : [],
    },
    contractWarnings: warnings,
    heightDiffs,
    overflow,
    layoutVersion: LAYOUT_VERSION,
    workdir: work,
  });
  writeReport(report, outDir);

  if (preview) runPreview(outDir, { student: pdfStudent, teacher: pdfTeacher });

  const fails = report.checks.filter((c) => c.status === "FAIL");
  const warns = report.checks.filter((c) => c.status === "WARN");
  log(`[6/6] 验收：${report.blocked ? "BLOCK" : "PASS"} · P0 未通过 ${fails.length} 项，需复核 ${warns.length} 项`);
  for (const c of fails) log(`      ✗ ${c.id} ${c.name}：${c.detail}`);

  return { doc, stats, report, outDir, manifestStudent, manifestTeacher, pdfStudent, pdfTeacher };
}
