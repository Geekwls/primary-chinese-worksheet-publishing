#!/usr/bin/env node
/**
 * 命令行入口：一份题目 JSON → 学生卷 + 教师解析卷 + 布局清单 + 验收报告。
 *
 * 退出码是与 CI/自动化约定的契约，不要随意改动：
 *   0 通过 / 2 契约或配置错误 / 3 渲染环境错误 / 4 分页失败 /
 *   5 双轨冲突 / 6 PDF 渲染失败 / 7 验收执行失败 / 8 验收 BLOCK
 */
import { loadDocProfile, loadGradeProfile } from "./config/tokens.mjs";
import {
  CliError,
  ComponentError,
  ConfigError,
  ContractError,
  LayoutError,
  QaError,
  RasterError,
  RenderError,
} from "./core/errors.mjs";
import { g } from "./core/format.mjs";
import { loadDocument } from "./domain/document.mjs";
import { runBuild } from "./pipeline.mjs";

const USAGE = `小学语文试卷出版级排版引擎（Node 版）

用法：
  wbpub <题目.json> [选项]

选项：
  --out <dir>       输出目录（默认 ./build）
  --grade <n>       覆盖题目中的年级（仅用于对比试验）
  --doc-type <name> 覆盖卷型 profile：practice / review / examination
  --no-teacher      只生成学生卷（教师相关验收项标记为人工）
  --no-preview      不输出逐页 PNG 预览
  --check-only      只做数据契约校验，不渲染
  --quiet           只输出错误
  -h, --help        显示本帮助

示例：
  wbpub examples/g2-review-unit56.json --out ./build
  wbpub doc.json --grade 1 --doc-type practice --out ./build-g1
  wbpub doc.json --check-only`;

function parseArgs(argv) {
  const opts = {
    document: null,
    out: "./build",
    grade: null,
    docType: null,
    teacher: true,
    preview: true,
    checkOnly: false,
    quiet: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const takeValue = () => {
      const value = argv[++i];
      if (value === undefined) throw new CliError(`参数 ${arg} 缺少取值`);
      return value;
    };

    if (arg === "-h" || arg === "--help") opts.help = true;
    else if (arg === "--out") opts.out = takeValue();
    else if (arg === "--grade") opts.grade = Number(takeValue());
    else if (arg === "--doc-type") opts.docType = takeValue();
    else if (arg === "--no-teacher") opts.teacher = false;
    else if (arg === "--no-preview") opts.preview = false;
    else if (arg === "--check-only") opts.checkOnly = true;
    else if (arg === "--quiet") opts.quiet = true;
    else if (arg.startsWith("-")) throw new CliError(`未知参数：${arg}`);
    else if (!opts.document) opts.document = arg;
    else throw new CliError(`多余的参数：${arg}`);
  }

  if (!opts.help && !opts.document) throw new CliError("缺少题目文件路径");
  if (opts.grade !== null && !Number.isFinite(opts.grade)) throw new CliError("--grade 必须是数字");
  return opts;
}

function fail(prefix, message, code) {
  console.error(`[${prefix}] ${message}`);
  return code;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    console.error(`\n${USAGE}`);
    return 2;
  }

  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  const log = opts.quiet ? () => {} : (msg) => console.log(msg);

  try {
    if (opts.checkOnly) {
      const { doc, warnings, stats } = loadDocument(opts.document);
      const profile = loadGradeProfile(opts.grade ?? doc.grade);
      const docProfile = loadDocProfile(opts.docType ?? doc.doc_type);
      log(
        `[1/6] 契约校验通过：${stats.question_count} 题，合计 ${g(stats.score_sum)} 分` +
          `（${profile.label} / ${docProfile.label}）`,
      );
      for (const w of warnings) log(`      ⚠ ${w}`);
      return 0;
    }

    const result = runBuild({
      document: opts.document,
      out: opts.out,
      grade: opts.grade ?? undefined,
      docType: opts.docType ?? undefined,
      teacher: opts.teacher,
      preview: opts.preview,
      log,
    });

    log(`\n交付物目录：${result.outDir}`);
    log("  ├─ student.pdf" + (opts.teacher ? " / teacher.pdf" : ""));
    log("  ├─ layout-manifest.json" + (opts.teacher ? " / layout-manifest-teacher.json" : ""));
    log("  ├─ qa-report.md / qa-report.json");
    log("  └─ preview/*.png");
    return result.report.blocked ? 8 : 0;
  } catch (err) {
    if (err?.code === "DUAL_TRACK_CONFLICT") return fail("双轨冲突", err.message, 5);
    if (err instanceof ContractError) return fail("契约校验未通过", err.message, 2);
    if (err instanceof ConfigError) return fail("配置错误", err.message, 2);
    if (err instanceof ComponentError) return fail("组件错误", err.message, 2);
    if (err instanceof LayoutError) return fail("分页失败", err.message, 4);
    if (err instanceof RenderError) {
      if (err.code === "PDF_RENDER") return fail("PDF 渲染失败", err.message, 6);
      return fail("渲染环境错误", err.message, 3);
    }
    if (err instanceof QaError || err instanceof RasterError) return fail("验收失败", err.message, 7);
    if (err instanceof CliError) return fail("参数错误", err.message, 2);
    throw err;
  }
}

process.exitCode = main(process.argv.slice(2));
