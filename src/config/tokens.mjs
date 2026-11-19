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
import { CSS_DIR, DOC_PROFILES_DIR, PROFILES_DIR, TOKENS_DIR } from "../core/paths.mjs";

const TOKEN_FILES = ["global", "typography", "colors", "spacing"];

function loadConfigJson(path, kind) {
  if (!existsSync(path)) throw new ConfigError(`${kind}不存在：${path}`);
  try {
    return readJson(path);
  } catch (err) {
    throw new ConfigError(`${kind} JSON 解析失败：${path} → ${err.message}`);
  }
}

/** 四类令牌合并为 { global, typography, colors, spacing }。 */
export function loadTokens() {
  const tokens = {};
  for (const name of TOKEN_FILES) {
    tokens[name] = loadConfigJson(join(TOKENS_DIR, `${name}.json`), "配置文件");
  }
  return tokens;
}

export function loadGradeProfile(grade) {
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
  return loadConfigJson(path, "年级 Profile");
}

export function loadDocProfile(name) {
  const key = String(name ?? "review").trim() || "review";
  const path = join(DOC_PROFILES_DIR, `${key}.json`);
  if (!existsSync(path)) throw new ConfigError(`未知文档类型 profile：${key}`);
  return loadConfigJson(path, "文档 Profile");
}

export function loadBaseCss() {
  return readText(join(CSS_DIR, "worksheet-base.css"));
}

/** 页面几何：全部单位毫米，content_bottom 已扣除页脚高度与间隙。 */
export function geometryOf(tokens) {
  const paper = tokens.global.paper;
  const pageWidth = Number(paper.page_width_mm);
  const pageHeight = Number(paper.page_height_mm);
  const marginX = Number(paper.margin_x_mm);
  const marginY = Number(paper.margin_y_mm);
  const footerHeight = Number(paper.footer_height_mm);
  const footerGap = Number(paper.footer_gap_mm);
  return {
    page_width: pageWidth,
    page_height: pageHeight,
    margin_x: marginX,
    margin_y: marginY,
    content_width: pageWidth - 2 * marginX,
    content_top: marginY,
    content_bottom: pageHeight - marginY - footerHeight - footerGap,
    footer_baseline_bottom: marginY,
  };
}
