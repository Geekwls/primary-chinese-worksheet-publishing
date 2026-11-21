# 布局 AST 契约（AST_VERSION 1.0.0）

> 2026-11-21 起，题型组件层（`src/components/questions.mjs`）不再拼接 HTML。
> 组件是**策略层**：解析数据、消耗编号、组合本文档定义的版式模式节点；
> `src/layout/ast-html.mjs` 是全引擎**唯一**的题型 HTML 生成点。
> 逐字节保真由 `test/ast-fidelity.test.mjs` 对 22 份黄金基线（4 样卷 × 三轨 +
> 19 题型 × 双轨）锁定，黄金基线捕获于重构前（commit 69e1d1c）。

## 分层

```
L1 全局规范   config/css.mjs + tokens/ + profiles/     （设计令牌 → CSS 变量）
L2 题型策略   components/questions.mjs                  （解析数据 → 组合 AST 节点）
L3 布局 AST   layout/ast.mjs（词汇表）+ ast-html.mjs（解释器）
L4 组装分页   layout/measure.mjs + paginate.mjs         （Chrome 实测 → 装箱 → 坐标）
L5 渲染       render/pages.mjs + pdf.mjs                （HTML → Chrome → PDF）
```

原则：**全局规范管一致性（组件无权碰字体/边距），题型策略管专业性，
组装器管完整性，解释器管输出形态。**

## 行内节点（题干/小题文本流）

| 节点 | 参数 | 对应 CSS / 历史来源 |
|---|---|---|
| `text` | value | esc 转义文本 |
| `example` | value | `.eg`（仿写例句，原 compSentenceRewrite） |
| `blank_slot` | form, answer | `.brk/.slot/.gap`（行内填空槽节） |

`blank_slot` 的 10 种 form（几何公式一字不改）：

| form | 形态 | 宽度公式 | 历史来源 |
|---|---|---|---|
| `line` | brk + slot | max(2.2, 字数×1.18+0.5) em | inlineText "line" / compFillBlank 括号模式 |
| `paren` | brk + （gap） | CSS 定宽 | inlineText "paren" |
| `word` | brk + （slot w） | CSS 定宽 | compSimilarCharacter |
| `fixed` | brk(var(--slot-w)) + slot(100%) | CSS 变量 | compWordPattern |
| `oral` | calc-oral-slot + brk + slot(100%) | max(3.8, 字数×1.3+1.2) em | compCalculation 口算 |
| `bare_num` / `bare_word` / `bare_stroke` | 裸（slot i/w/p） | CSS 定宽 | compStrokeOrder |
| `choice` / `judge` | choice/judge-bracket + slot i | CSS 定宽 | compChoice / compJudge / compReading |

## 块级节点（一个 Part 的 html 由一或多个块级节点拼接）

| 节点 | 对应 CSS 分节 | 备注 |
|---|---|---|
| `q_head` | 题干 | 编号 + 行内内容 + 分值提示（受 docProfile.section_score_visible） |
| `writing_lines` | 书写横线 | boxed=false 供自定义容器复用；行数不足告警进 ctx.warnings |
| `work_box` | 数学作答 | calc-work-box 包裸横线行 |
| `choice_options` | 独立选择题 | cols 自适应 ≤8→4 / ≤18→2 / 1 |
| `sub_options` | 阅读理解小题 | 无分栏选项行 |
| `sub_plain` | 阅读理解小题 / 句子改写 | bracket/require/cue/options/lines 组合 |
| `sub_choice` / `sub_judge` | 独立选择 / 独立判断 | 小题组形态 |
| `choice_standalone` / `judge_standalone` | 独立选择 / 独立判断 | 单题形态 |
| `sub_stroke` | 笔顺笔画题 | word 田字格 + detail(wrap: text/details) |
| `passage` | 阅读文章 | 整块不可拆（keepNext 由 Part 层声明） |
| `pinyin_row` | 拼音+田字格 | 对齐/居中双分支 + calc(var(--tz)*N) |
| `similar_cells` / `poly_cells` / `pin_annotation` | 组词词语栏 / 多音字 / 注音 | poly 教师答案 ans ans-slot 双类 |
| `witem_row` / `word_pattern` / `poem` | 组词词语栏 / 古诗填空 | 行内槽由 children 携带 |
| `composition_grid` / `prompt` / `image` | 作文方格 | 三节点拼装进题干 Part |
| `match_board` | 连线题 | 教师卷 SVG 矢量层（38%/62% 锚点、行高 12mm） |

## 跨仓契约

- `layout-manifest.ast_version` 记录生成时的词汇表版本（1.0.0 起）。
- 上游 skill 仓库不感知 AST（adapter 只产文档契约）；未来若上游需要
  请求特定版式形态，以本文档 + ast_version 为协商基础。
- 变更规则：新增节点 = minor；改变现有节点的 HTML 输出 = major（必须
  重录黄金基线并说明版式变更理由）。

## 三个历史特例的建模位置

1. **多音字 ans-slot 双类**：poly_cells 节点内固定，教师答案受槽容器约束。
2. **田字格格心答案**：pinyin_row 节点内，教师卷逐字写入格心。
3. **连线 SVG 矢量层**：match_board 节点内，教师卷独有（学生卷零泄漏）。

## 渲染器扩展决策记录：DOCX 暂缓

**决定**：不做 DOCX 渲染器（2026-11-21，方案讨论后收敛）。

**理由**：当前产品定位是出版级 PDF 交付（Chrome 实测 + 双轨同构 + 位图验收），
"可编辑"需求的正确实现路径是回上游改草稿数据重新渲染（编辑发生在数据层，
有裁判门禁兜底），而非在成品层提供 Word。DOCX 会引入质量降级的第二产物线
（Word 自重排、无坐标控制、位图验收失效），当前无真实需求方。

**触发条件**（满足其一时重启）：真实用户/渠道明确要求 .docx 交付（如学校
可编辑母卷、Word 分发渠道）；出现成品卷批量二次加工场景。

**届时做法**：AST 已就位——新增 `src/render/docx/` 解释器消费同一棵节点树
（blank_slot→下划线 run、writing_lines→底边框空段、q_head keepNext→
w:keepNext 段落属性、方格→固定表格；连线 SVG 降级为双列表格、教师卷答案
改为行内红字）。成本是"一个解释器"，不是重写 19 个题型控制器。
