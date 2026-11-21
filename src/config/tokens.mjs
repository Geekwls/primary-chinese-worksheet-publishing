/**
 * 配置层入口：令牌（Design Tokens）+ 年级 Profile + 文档 Profile。
 *
 * 铁律：组件与 CSS 里不允许出现魔法数字，一切物理尺寸都从这里进。
 * 因此本模块只负责"取数"，不做任何业务判断。
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { ConfigError } from "../core/errors.mjs";
import { readJson, readText } from "../core/io.mjs";
import {
  CSS_DIR,
  DESIGN_SYSTEM_DIR,
  DOC_PROFILES_DIR,
  PRINTER_PROFILES_DIR,
  PROFILES_DIR,
  SCENARIOS_DIR,
} from "../core/paths.mjs";

function loadConfigJson(path, kind) {
  if (!existsSync(path)) throw new ConfigError(`${kind}不存在：${path}`);
  try {
    return readJson(path);
  } catch (err) {
    throw new ConfigError(`${kind} JSON 解析失败：${path} → ${err.message}`);
  }
}

/** 加载 Design System（L1-L2）并合并兼容 tokens。 */
export function loadTokens() {
  const tokens = {};
  if (existsSync(DESIGN_SYSTEM_DIR)) {
    for (const name of ["page", "grid", "spacing", "typography", "colors", "borders", "hierarchy"]) {
      const p = join(DESIGN_SYSTEM_DIR, `${name}.json`);
      if (existsSync(p)) tokens[name] = loadConfigJson(p, `设计系统 ${name}`);
    }
  }

  // 兼容原有 tokens.* 访问
  tokens.global = {
    font: tokens.typography?.fonts ?? {
      family_cjk: "Noto Sans CJK SC",
      family_cjk_serif: "Noto Serif CJK SC",
      family_pinyin: "Noto Sans, Noto Sans CJK SC",
      family_latin: "Noto Sans, Arial",
    },
    paper: {
      page_width_mm: tokens.page?.paper?.page_width_mm ?? 210,
      page_height_mm: tokens.page?.paper?.page_height_mm ?? 297,
      margin_x_mm: tokens.page?.margins_mm?.left ?? 15,
      margin_y_mm: tokens.page?.margins_mm?.top ?? 15,
      footer_height_mm: tokens.page?.regions?.footer?.height_mm ?? 5,
      footer_gap_mm: tokens.page?.regions?.footer?.gap_to_content_mm ?? 3,
    },
    line_width_mm: tokens.borders?.line_widths_mm ?? {
      hair: 0.18,
      thin: 0.22,
      normal: 0.30,
      strong: 0.45,
    },
  };

  tokens.colors = {
    ink: {
      primary: tokens.colors?.palette?.body_text ?? "#0F172A",
      secondary: tokens.colors?.palette?.secondary_text ?? "#1E293B",
      muted: tokens.colors?.palette?.assistant_text ?? "#475569",
    },
    line: {
      primary: tokens.colors?.palette?.divider_line ?? "#CBD5E1",
      secondary: tokens.colors?.palette?.grid_line ?? "#94A3B8",
    },
    answer: {
      teacher: tokens.colors?.palette?.teacher_answer ?? "#B3261E",
    },
  };

  tokens.spacing = {
    gap: {
      xs: tokens.spacing?.scale_mm?.["spacing-1"] ?? 2.0,
      s: tokens.spacing?.scale_mm?.["spacing-2"] ?? 3.0,
      m: tokens.spacing?.scale_mm?.["spacing-3"] ?? 4.0,
      l: tokens.spacing?.scale_mm?.["spacing-4"] ?? 6.0,
    },
    slot: {
      inline_mm: tokens.spacing?.slot_mm?.inline_mm ?? 14.0,
      word_mm: tokens.spacing?.slot_mm?.word_mm ?? 32.0,
      phrase_mm: tokens.spacing?.slot_mm?.phrase_mm ?? 48.0,
    },
  };

  return tokens;
}

/**
 * 年级 Profile 加载（学科 overlay 可选）：
 *   assets/profiles/grade-N.json            学科无关基底
 *   assets/profiles/subjects/{subject}-grade-N.json   可选学科覆盖层
 *
 * overlay 只允许覆盖基底已有参数（含 font_pt/line_height/geometry/spacing/layout
 * 内的二级键与顶层标量/数组整体替换），禁止发明新键或覆盖 profile_id/grade 身份键 ——
 * 否则学科层就会偷改全局规范，破坏"全局规范管一致性"的分层原则。
 * 中文为历史默认学科，不设 overlay。
 */
export function loadGradeProfile(grade, subject = null) {
  const path = join(PROFILES_DIR, `grade-${Number(grade)}.json`);
  if (!existsSync(path)) {
    const available = readdirSync(PROFILES_DIR)
      .filter((f) => f.startsWith("grade-") && f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort();
    throw new ConfigError(
      `未收录 ${grade} 年级 Profile（已有：${available.join(", ")}）。` +
        "扩展年级前必须先建 Profile 并通过样卷校验，不允许临时改字号糊过去。",
    );
  }
  const base = loadConfigJson(path, "年级 Profile");

  if (!subject || subject === "chinese") return base;
  const overlayPath = join(PROFILES_DIR, "subjects", `${subject}-grade-${Number(grade)}.json`);
  if (!existsSync(overlayPath)) return base;
  const overlay = loadConfigJson(overlayPath, "学科 Profile 覆盖层");
  return mergeProfileOverlay(base, overlay, overlayPath);
}

const MERGEABLE_SECTIONS = new Set(["font_pt", "line_height", "geometry", "spacing", "layout"]);
const IDENTITY_KEYS = new Set(["profile_id", "grade"]);

function mergeProfileOverlay(base, overlay, source) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (IDENTITY_KEYS.has(key)) {
      throw new ConfigError(`学科 overlay 不得覆盖身份键 ${key}：${source}`);
    }
    if (MERGEABLE_SECTIONS.has(key)) {
      if (!base[key] || typeof base[key] !== "object") {
        throw new ConfigError(`学科 overlay 键 ${key} 在基底 Profile 中不存在：${source}`);
      }
      merged[key] = { ...base[key] };
      for (const [k, v] of Object.entries(value ?? {})) {
        if (!(k in base[key])) {
          throw new ConfigError(
            `学科 overlay 键 ${key}.${k} 在基底 Profile 中不存在（overlay 只允许覆盖已有参数）：${source}`,
          );
        }
        merged[key][k] = v;
      }
    } else if (key in base) {
      merged[key] = value;
    } else {
      throw new ConfigError(
        `学科 overlay 键 ${key} 在基底 Profile 中不存在（overlay 只允许覆盖已有参数）：${source}`,
      );
    }
  }
  return merged;
}

export function loadDocProfile(name) {
  const key = String(name ?? "review").trim() || "review";
  // 别名映射：支持旧 profile 标识与新 scenario 标识互通
  const ALIASES = {
    review: "unit-review",
    practice: "special-practice",
    examination: "comprehensive-test",
  };
  const scenarioKey = ALIASES[key] ?? key;

  // 优先在 SCENARIOS_DIR 寻找
  const scenarioPath = join(SCENARIOS_DIR, `${scenarioKey}.json`);
  if (existsSync(scenarioPath)) return loadConfigJson(scenarioPath, "场景 Profile");

  // 回退在 DOC_PROFILES_DIR 寻找
  const docPath = join(DOC_PROFILES_DIR, `${key}.json`);
  if (existsSync(docPath)) return loadConfigJson(docPath, "文档 Profile");

  throw new ConfigError(`未知场景/文档类型 profile：${key}`);
}

export function loadPrinterProfile(nameOrPath) {
  if (!nameOrPath) return null;
  if (typeof nameOrPath === "object") return nameOrPath;
  const key = String(nameOrPath).trim();
  if (!key || key === "default") {
    const defaultPath = join(PRINTER_PROFILES_DIR, "default.json");
    return existsSync(defaultPath) ? loadConfigJson(defaultPath, "默认打印机 Profile") : null;
  }

  // 绝对或相对路径
  if (key.endsWith(".json")) {
    const target = existsSync(key) ? key : join(PRINTER_PROFILES_DIR, key);
    if (!existsSync(target)) throw new ConfigError(`打印机 Profile 文件不存在：${key}`);
    return loadConfigJson(target, "自定义打印机 Profile");
  }

  // 按预设 ID 查找
  const profilePath = join(PRINTER_PROFILES_DIR, `${key}.json`);
  if (!existsSync(profilePath)) {
    const available = existsSync(PRINTER_PROFILES_DIR)
      ? readdirSync(PRINTER_PROFILES_DIR)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(/\.json$/, ""))
          .sort()
      : [];
    throw new ConfigError(
      `未收录 ${key} 打印机 Profile（已有预设：${available.join(", ")}）。` +
        "若为硬件补偿，可指定已有预设（如 inkjet-desktop）或传自定义 JSON 文件路径。",
    );
  }
  return loadConfigJson(profilePath, "打印机硬件 Profile");
}

export function loadBaseCss() {
  return readText(join(CSS_DIR, "worksheet-base.css"));
}

/**
 * 页面几何：全部单位毫米，支持打印机硬件 Profile 与不对称边距补偿。
 *
 * @param {object} tokens - 设计令牌
 * @param {object|null} printerProfile - 打印机硬件 Profile
 * @param {object} [marginOverrides={}] - 单独指定的边距覆盖 { top, bottom, left, right }
 */
export function geometryOf(tokens, printerProfile = null, marginOverrides = {}) {
  const paper = tokens.global.paper;
  const pageWidth = Number(paper.page_width_mm);
  const pageHeight = Number(paper.page_height_mm);
  const footerHeight = Number(paper.footer_height_mm);
  const footerGap = Number(paper.footer_gap_mm);

  // 基础默认边距
  let marginTop = Number(paper.margin_y_mm);
  let marginBottom = Number(paper.margin_y_mm);
  let marginLeft = Number(paper.margin_x_mm);
  let marginRight = Number(paper.margin_x_mm);

  // 1. 打印机 Profile 注入
  if (printerProfile?.margins_mm) {
    const pmm = printerProfile.margins_mm;
    if (pmm.top != null) marginTop = Number(pmm.top);
    if (pmm.bottom != null) marginBottom = Number(pmm.bottom);
    if (pmm.left != null) marginLeft = Number(pmm.left);
    if (pmm.right != null) marginRight = Number(pmm.right);
  }

  // 2. 显式命令行覆盖注入
  if (marginOverrides.top != null) marginTop = Number(marginOverrides.top);
  if (marginOverrides.bottom != null) marginBottom = Number(marginOverrides.bottom);
  if (marginOverrides.left != null) marginLeft = Number(marginOverrides.left);
  if (marginOverrides.right != null) marginRight = Number(marginOverrides.right);

  const contentWidth = pageWidth - marginLeft - marginRight;
  const contentTop = marginTop;
  const contentBottom = pageHeight - marginBottom - footerHeight - footerGap;

  if (contentWidth <= 50) {
    throw new ConfigError(`页面有效宽度不足 (${contentWidth.toFixed(1)}mm)，请检查左右边距设置。`);
  }
  if (contentBottom - contentTop <= 50) {
    throw new ConfigError(`页面有效高度不足 (${(contentBottom - contentTop).toFixed(1)}mm)，请检查上下边距设置。`);
  }

  return {
    page_width: pageWidth,
    page_height: pageHeight,
    margin_left: marginLeft,
    margin_right: marginRight,
    margin_top: marginTop,
    margin_bottom: marginBottom,
    // 兼容历史字段
    margin_x: marginLeft,
    margin_y: marginTop,
    content_width: contentWidth,
    content_top: contentTop,
    content_bottom: contentBottom,
    footer_height: footerHeight,
    footer_gap: footerGap,
    footer_baseline_bottom: marginBottom,
    printer: printerProfile?.printer_id ?? "default",
    binding_gutter_mm: printerProfile?.binding_gutter_mm ?? 0.0,
  };
}
