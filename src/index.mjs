/**
 * 公共 API：把引擎当库用（批量出卷、CI 回归、自定义 CLI 都走这里）。
 *
 * 约定：所有导出函数都"要么返回结果，要么抛领域错误"，不存在返回 null 表示失败的写法。
 */
export { LAYOUT_VERSION, SPEC_VERSION, ENGINE_VERSION } from "./core/version.mjs";
export { runBuild, buildParts } from "./pipeline.mjs";

export { loadDocument, validate } from "./domain/document.mjs";
export { visibleText, structureTexts, structureSegments, teacherAnswers } from "./domain/texts.mjs";
export { buildCss } from "./config/css.mjs";
export { geometryOf, loadDocProfile, loadGradeProfile, loadPrinterProfile, loadTokens } from "./config/tokens.mjs";

export { Ctx } from "./components/context.mjs";
export { REGISTRY, SUPPORTED_TYPES, componentIdOf, componentLabel, resolveComponent } from "./components/registry.mjs";

export { measureParts, measurePartsDetailed, OVERFLOW_TOL_MM } from "./layout/measure.mjs";
export { paginate } from "./layout/paginate.mjs";
export { manifestOf } from "./layout/manifest.mjs";

export { findChrome } from "./render/chrome.mjs";
export { buildPagesHtml } from "./render/pages.mjs";
export { htmlToPdf } from "./render/pdf.mjs";

export { runQa } from "./qa/audit.mjs";
export { Report, writeReport } from "./qa/report.mjs";
export { pageInkBoxes, readPng, writePng, diffPng, inkBounds } from "./qa/raster.mjs";

export {
  WbpubError,
  ConfigError,
  ContractError,
  ComponentError,
  RenderError,
  LayoutError,
  QaError,
  RasterError,
} from "./core/errors.mjs";
