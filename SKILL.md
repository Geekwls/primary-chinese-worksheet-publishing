---
name: primary-school-worksheet-publishing
description: >-
  小学（一至六年级）试卷与练习卷的出版级排版与验收系统，覆盖语文、数学、英语三科（语文为基准学科：看拼音写词语、田字格、形近字组词、多音字、成语补充、古诗填空、句子改写、阅读理解、看图写话；数学：计算题、填空题、解决问题；另有选择、判断、连线、笔顺、表格、流程图等通用题型）。当用户要求生成试卷、单元复习卷、专项练习卷、配套教师解析卷，或要求检查试卷 PDF 的字号、格子尺寸、分页、字体嵌入与打印安全区时使用。产出学生卷 PDF、教师解析卷 PDF、布局清单与验收报告。不负责命题内容创作、非小学学段的试卷排版、非印刷用途的普通网页。
metadata:
  version: 1.2.0
  spec_version: 2.2.0
  status: VALIDATED
  author: 出版排版工程
  platforms: [linux, macos, windows]
  requires:
    - google-chrome 或 chromium（PDF 渲染，版本必须固定）
    - poppler-utils（pdfinfo / pdffonts / pdftotext / pdftoppm）
    - node >= 20.11（零运行时依赖，无需 npm install）
agent_created: true
---

# 小学试卷出版级排版系统

> 定位：不是"让 AI 随手排出好看的卷子"，而是把"出版质量目标"变成可执行、可复现、可追溯的工程流水线。
> 本项目遵循 [《小学低段语文试卷与复习卷出版级排版设计规范手册 (v2.2.0)》](docs/DESIGN_SPECIFICATION.md)。
> 一句话原则：**L1 出版标准决定什么算好，L2 设计系统决定语言统一，L3 排版引擎负责确定性地实现，L4 验收用证据证明它真的达标。**

## 何时使用

触发场景：

- 出卷：`出一份二年级上册第五、六单元复习卷`、`做一年级拼音专项练习`、`生成看拼音写词语的田字格卷`。
- 改卷：`这道题写不下，答题区太小`、`把解析加长`、`压成两页`、`改成一年级字号`。
- 验卷：`检查这份试卷 PDF 有没有排版问题`、`字体嵌入没有`、`打印会不会被裁掉`。
- 扩展：`加英语卷`（需补英语学科组件库）、`加新题型`（见 `references/09-versioning-and-extension.md`）。

不适用：命题内容创作（本 skill 只负责呈现）、非小学学段的试卷排版、屏幕阅读用途的普通网页。

## 四层门槛：不得跳级

```text
L1 出版设计层  ── 什么算好的试卷（儿童阅读、书写、视觉层级、教辅规范）
      ↓ 约束
L2 设计系统层  ── 令牌 / 年级 Profile / 组件契约（assets/tokens、profiles、css）
      ↓ 驱动
L3 排版工程层  ── 实测 → 空间预算 → 分页 → Layout Manifest → PDF（src/layout、src/render）
      ↓ 产出
L4 质量验收层  ── 位图墨迹 + 字体 + 文本 + 双轨一致性（src/qa）
```

**禁止的行为**：拿到题目就直接写 CSS、凭肉眼判断"差不多能放下"、为了压页数改字号、用 `overflow:hidden` 掩盖溢出、只交一个 PDF 不给验收证据。

## 快速开始

```bash
S=~/workspace/primary-school-worksheet-publishing
N=node   # 需要 node >= 20.11；引擎零依赖，不必 npm install

# 1) 只校验题目数据结构（不渲染，最快发现字段问题）
$N $S/src/cli.mjs 卷.json --check-only

# 2) 正式出卷：学生卷 + 教师解析卷 + 布局清单 + 验收报告
$N $S/src/cli.mjs 卷.json --out ./build/卷名

# 3) 切换年级/文档类型做对比试验（不改题目文件）
$N $S/src/cli.mjs 卷.json --grade 1 --doc-type practice --out ./build/卷名-g1

# 4) 只出学生卷（教师相关验收项标记为人工）
$N $S/src/cli.mjs 卷.json --no-teacher

# 5) 回归测试（格式/契约/组件/分页/位图/端到端，共 74 项）
cd $S && $N --test test/*.test.mjs
```

也可以当库用（批量出卷、CI 断言、二次开发）：

```js
import { runBuild } from "~/workspace/primary-school-worksheet-publishing/src/index.mjs";

const { report, manifestStudent } = runBuild({ document: "卷.json", out: "./build" });
if (report.blocked) throw new Error("验收阻断，查看 qa-report.md");
```

产物（`--out` 目录）：

| 文件 | 内容 |
| --- | --- |
| `student.pdf` | 学生卷，双面可印 |
| `teacher.pdf` | 教师解析卷：正文页与学生卷逐块对齐，末尾追加解析附页 |
| `layout-manifest.json` | 每块题目在每页的 x/y/宽/高（毫米），几何真相 |
| `layout-manifest-teacher.json` | 教师卷完整布局（含解析附页） |
| `qa-report.md` / `.json` | P0/P1 检测结论，含阻断项与人工待办 |
| `preview/*.png` | 逐页位图，供人工视觉复核 |

退出码：`0` 通过 · `2` 契约/配置错误 · `3` 渲染环境错误 · `4` 分页失败 · `5` 双轨冲突 · `6` PDF 渲染失败 · `7` 验收失败 · `8` 验收 BLOCK。

## 工程结构（Node · 零运行时依赖）

```text
src/
├── cli.mjs             CLI：参数解析、退出码、编排入口
├── pipeline.mjs        出卷编排：契约 → 组件 → 实测 → 分页 → 渲染 → 验收
├── index.mjs           公共 API（批量出卷 / CI / 二次开发）
├── core/               路径 · 错误 · 精确舍入 · 文本 · 子进程 · 版本
├── config/             令牌与 Profile 加载、CSS 编译
├── domain/             Part/Block 模型、数据契约、可核对文本抽取
├── components/         Ctx、原子构件、题型组件、REGISTRY、卷头与解析页
├── layout/             实测、确定性分页、Layout Manifest
├── render/             Chrome 适配、页面 HTML、PDF 输出
└── qa/                 poppler、位图墨迹、报告、验收规则、预览
test/                   74 项回归（node:test，无第三方测试框架）
assets/                 令牌 / 年级·学科·卷型·打印机 Profile / CSS / JSON Schema
examples/               两份标准回归样卷
```

分层约定：`components` 不碰文件系统与 Chrome；`layout` 只处理高度与坐标、不拼 HTML；`qa` 只吃 PDF + Manifest，不读引擎内存状态。因此每一层都能独立测试，也便于换成别的渲染器时定位影响面。

## 工作流（七步，缺一不可）

1. **确认命题边界**：年级、教材版本、卷型（practice / review / examination）、题量与分值。
   教材版本决定教学内容，排版规范决定呈现方式，两者不得混写。
2. **选 Profile**：年级 Profile 决定字号/格子/行距/栏数；文档 Profile 决定卷头字段与分值显示。
   未收录的年级必须新建 Profile 并用样卷校验，禁止临时改字号糊过去。
3. **写题目 JSON**：按 `assets/schemas/document.schema.json` 与 `references/authoring-reference.md`。
   自拟试卷的题目 JSON 统一放 `papers/`（源文件入库）；题型必须落在已收录清单内；语义题型不得用 `generic` 顶替。
4. **契约校验**：`--check-only`，先消灭字段缺失、题号重复、答案缺失、总分不一致。
5. **渲染**：引擎用 Chrome 实测每个排版原子的毫米高度，再确定性装箱，最后绝对定位输出。
   放不下就换页或报错，**绝不压缩内容**。
6. **验收**：P0 全过才算 PASS；任何 P0 未过即 BLOCK，不得交付。
7. **人工收口**：P1 视觉复核 + 目标打印机实物打样 + 田字格纸面量测，形成出版审校记录。

## 不可违反的铁律

| # | 铁律 | 违反后果 |
| --- | --- | --- |
| 1 | 所有物理尺寸用毫米，字号用 pt；不得混用 px 猜尺寸 | 打印尺寸失真 |
| 2 | 分页由引擎决定，CSS 只做视觉呈现 | 不可预测的断行、孤行、题目被劈开 |
| 3 | 教师卷答案只能绝对定位覆盖，不得改变任何块高度 | 学生卷与教师卷题目错位（P0-07） |
| 4 | 解析需要额外空间时进独立解析页，不得挤占正文页 | 版面连锁崩塌 |
| 5 | 放不下 → 换页 → 增加页数 → 报错；禁止缩字号/缩格子/裁切 | 孩子写不下、题被截断 |
| 6 | 禁止 `overflow:hidden` 掩盖溢出 | 视觉检测失效，问题流入印厂 |
| 7 | 阅读文章整体不可拆页；题干必须与首行作答区同页 | 阅读中断、题干孤行 |
| 8 | 字体必须嵌入，拼音声调字形必须实测存在 | 换机器乱码、声调丢失 |
| 9 | 印刷安全区默认 12mm；5mm 边距属未验证激进配置 | 家用打印机裁字 |
| 10 | 未做实物打样的参数一律标 `DRAFT`，不得标"出版级已验证" | 假标准 |
| 11 | 教师卷答案在黑白打印下必须可辨，不得依赖彩色 | 灰度复印后答案消失 |
| 12 | 每次出卷必须留 Layout Manifest 与验收报告 | 事故不可追溯 |
| 13 | 括号型空槽只留空白，不得括号内再画横线；注音字距必须容得下最长音节 | 版面脏、音节横向叠压 |

## 题型 → 组件映射

| 题型 `type` | 组件 | 布局策略 | 可拆页 |
| --- | --- | --- | --- |
| `pinyin_write_word` 看拼音写词语 | `pinyin_tianzi_grid` | 网格行，每行 N 词 | 行间可拆 |
| `similar_character` 形近字组词 | `similar_character_group` | 一/二年级分别 1/2 栏 | 行间可拆 |
| `add_pinyin` 给加点字注音 | `pinyin_annotation_columns` | 字列 + 注音槽 + 加点 | 整块 |
| `idiom_fill` 成语补充 | `idiom_blank_row` | 括号空槽横排 | 整块 |
| `word_pattern` 词语仿写 | `word_pattern_row` | 例词 + 词槽 | 整块 |
| `poem_fill` 古诗填空 | `poem_blank_lines` | 诗句横线空槽，按答案字数定宽 | 整块 |
| `sentence_rewrite` 句子改写/仿写 | `sentence_rewrite_block` | 单栏 + 整行书写线 | 小题间可拆 |
| `reading` 阅读理解 | `reading_passage_block` | 文章通栏（不可拆）+ 小题 | 小题间可拆 |
| `composition` 看图写话/写话 | `composition_grid` | 方格纸（年级定格数与格宽） | 整块 |
| `generic` 通用作答题 | `generic_answer_block` | 题干 + N 行横线 | 整块 |

判定顺序：**看作答方式，不看题型名字**。同一个知识考查点若作答方式不同（如单字注音 vs 语段注音），必须落到不同组件。

数学与通用题型：`calculation` 计算题 / `fill_blank`·`blank` 填空题（stem 内嵌槽或 items 矩阵模式）/ `word_problem` 解决问题 / `choice` 选择题 / `judge` 判断题 / `stroke_order` 笔顺笔画 / `pinyin_match` 连线 / `polyphonic` 多音字辨析 / `table_task` 表格任务 / `flow_diagram` 流程图填空 / `sentence_order` 连词成句 / `punctuation` 标点运用；完整契约见 `references/authoring-reference.md`。阅读小题支持独立 `score` 分值与 `"keep": "whole"` 材料-小题整链分页。

## 年级基线（首期）

| 参数 | 一年级 | 二年级 |
| --- | --- | --- |
| 题干字号 | 13.5pt | 12.2pt |
| 正文（阅读） | 13pt / 版心 170mm | 11.6pt / 版心 165mm |
| 拼音（词语行） | 11.5pt | 11pt |
| 正上方注音 | 10.5pt | 9.5pt |
| 田字格 | 13mm | 11.5mm |
| 书写行距 | 9mm | 9mm |
| 书写线宽 | 156mm | 150mm |
| 写话格 | 12mm × 14 列 | 10.5mm × 16 列 |
| 注音字距 | 11mm | 10mm |
| 每行词语数 | 3 | 4 |
| 形近字栏数 | 1 | 2 |

**两条不许破的一致性**：写话格不得小于田字格的 0.9 倍（否则成段书写与"用拼音代替"都会挤）；注音字距必须容得下最长音节（`zhǎng` 约 8.4mm），否则音节横向相撞，而块级验收查不出来。

完整参数与校准要求见 `references/02-grade-profiles.md`；这些是**设计目标**，不是法规字号，必须通过样张与教师反馈校准。

## 常见失败与处置

| 现象 | 根因 | 处置 |
| --- | --- | --- |
| `未收录题型` | 题型不在注册表 | 先登记组件契约与尺寸测试，再扩展 `src/components/registry.mjs` |
| `高度 x mm 超过单页可用高度` | 单个块过大（如整段方格） | 拆分组件或减少单块内容；不要缩字号 |
| 学生卷 4 页、教师卷 5 页 | 答案改变了块高度 | 检查是否用了非绝对定位的答案容器 |
| `教师卷答案预计需要 N 行` | 预留行数不足 | 增加 `lines` 或精简答案；不要缩小答案字号 |
| P0-02-T 墨迹越界 | 长拼音/长答案横向溢出 | 检查 `.pyc`、`.pin-slot`、`.brk .ans` 的宽度约束 |
| P0-12 文字横向溢出容器 | 元素容器比它的文字窄（音节、长答案） | 调 `pinyin_col_mm` / `pinyin_annotation`，不要靠 `overflow:visible` 硬溢 |
| 括号里还套一条横线 | 空槽同时用了括号与下划线 | 括号型用 `.gap`（无下划线），横线型用 `.slot` |
| 学生把例句改写了一遍 | 改写与仿写共用同一视觉结构 | 仿写小题标 `kind: "imitate"`，渲染出例句块与「仿写：」引导 |
| 大题标题留在页底、题目翻页 | keepNext 只绑定了下一块 | keepNext 必须传递绑定整链（标题→题干→作答块） |
| P1-08 Type 3 字体 | Chrome/Skia 嵌入形态 | 办公打印可直接用；走印厂前用 Acrobat 归一化 |
| 页面底部大片空白 | 大块整体换页 | 允许，但需人工确认是否值得拆块 |

## 参考文件

| 文件 | 用途 |
| --- | --- |
| `references/01-editorial-principles.md` | L1 出版设计：儿童人体工学、五项质量目标、验收依据 |
| `references/02-grade-profiles.md` | 年级 Profile 参数、来源、校准方法、扩展流程 |
| `references/03-page-and-typography.md` | 页面几何、安全区、字体角色、灰阶、打印配置 |
| `references/04-component-library.md` | 三级组件体系与组件契约、尺寸测试清单 |
| `references/05-question-layouts.md` | 题型布局矩阵、组件选择判定树 |
| `references/06-layout-engine.md` | 实测/预算/分页/清单机制与失败保护 |
| `references/07-dual-track.md` | 学生卷/教师卷双轨出版与一致性要求 |
| `references/08-qa-rules.md` | P0/P1 规则表、五层验收、证据包 |
| `references/09-versioning-and-extension.md` | 版本管理、三年级扩展、对旧规范的处理原则 |
| `references/authoring-reference.md` | 题型 JSON 字段速查与可复制示例 |
| `docs/QUALITY_ACCEPTANCE_SPEC.md` | 试卷质量三层验收规范（内容 A / 结构 B / 视觉 C） |
| `docs/QUESTION_TYPE_VISUAL_SPEC.md` | 题型视觉组件规范（P01–P12、作答行为→答题区域、三原则、分批路线） |
| `assets/schemas/document.schema.json` | 题目数据契约 |

## 示例

- `examples/g2-review-unit56.json`：二年级五、六单元复习卷（10 题 / 100 分 / 覆盖 8 类组件）。
- `examples/g1-pinyin-unit1.json`：一年级拼音与识字练习（验证小字号与大格子基线）。

两个示例都可直接 `--check-only` 与完整渲染，作为回归样卷使用。
