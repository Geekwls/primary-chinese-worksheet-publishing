/**
 * 领域错误：每类失败都对应一个明确的处置方向，不做"笼统异常"。
 *
 * ConfigError    配置/令牌/Profile 缺失 → 补资产，不得在代码里兜底默认值
 * ContractError  题目数据不合法       → 改题目 JSON
 * ComponentError 题型无法映射组件     → 先登记组件契约
 * RenderError    Chrome 不可用/PDF 未生成 → 换渲染环境，不得换渲染器
 * LayoutError    分页装不下           → 换页/增页/报错，禁止压缩
 * QaError        检测工具缺失/PDF 损坏 → 补工具链
 * RasterError    位图解码失败         → 检查 pdftoppm 输出
 */
export class WbpubError extends Error {
  constructor(message, code = "E_WBPUB") {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class ConfigError extends WbpubError {}
export class ContractError extends WbpubError {}
export class ComponentError extends WbpubError {}
export class RenderError extends WbpubError {}
export class LayoutError extends WbpubError {}
export class QaError extends WbpubError {}
export class RasterError extends WbpubError {}
export class CliError extends WbpubError {}
