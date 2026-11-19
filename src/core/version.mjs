/**
 * 三维独立版本控制：
 *
 * 1. SPEC_VERSION: 设计规范手册版本（docs/DESIGN_SPECIFICATION.md）。
 *    反映出版标准、审美原则、字号推荐区间等规范定义的演进。
 *
 * 2. LAYOUT_VERSION: 布局清单数据契约版本（Layout Manifest 结构格式）。
 *    反映写入 layout-manifest.json 的字段定义与坐标体系，用于下游系统或归档校验。
 *
 * 3. ENGINE_VERSION: 排版引擎实现版本。
 *    反映 Node.js 排版流水线、测量算法、组件渲染器与 QA 质检代码的发布版本。
 */
export const SPEC_VERSION = "2.2.0";
export const LAYOUT_VERSION = "1.0.0";
export const ENGINE_VERSION = "1.2.0";
export const ENGINE_RUNTIME = "node";
