# 学科 Profile 覆盖层（可选，暂无数据文件）

加载规则见 `src/config/tokens.mjs` 的 `loadGradeProfile(grade, subject)`：

- 命名：`{subject}-grade-{n}.json`（如 `math-grade-3.json`），subject 取值与
  文档契约 `doc.subject` 一致（math / chinese / english）。
- 中文为历史默认学科，**不设** overlay（基底 grade-N.json 即中文基准）。
- overlay 只允许覆盖基底已有参数（font_pt/line_height/geometry/spacing/layout
  的二级键，及顶层标量/数组整体替换）；新增键与身份键（profile_id/grade）
  会被 ConfigError 拒绝 —— 学科层不得偷改全局规范。
- 上线某个 overlay 前必须：样卷双轨渲染 QA PASS + 位图验收 + 人工审校。
