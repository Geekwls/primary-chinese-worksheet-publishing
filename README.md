# primary-chinese-worksheet-publishing

> 小学低段（一至二年级）语文试卷与复习卷出版级排版与验收引擎（零运行时依赖 Node.js 实现）。

本项目遵循 [《小学低段语文试卷与复习卷出版级排版设计规范手册 (v2.2.0)》](docs/DESIGN_SPECIFICATION.md)，将出版行业对儿童阅读、书写人体工学、几何尺寸、双轨排版与印刷安全的标准，沉淀为一套**确定性、可验证、自动化**的排版与验收流水线。

---

## 核心设计与工程原则

1. **先保证内容完整，再考虑页面利用率**：严禁为了少翻一页随意缩小字号或行距。
2. **六层规范体系 (L1–L6)**：L1 页面基准（15mm 边距、180mm 版心、12 栅格）→ L2 视觉 Token → L3 结构模板 → L4 题型契约 → L5 年级与场景 Profile → L6 出版验收。
3. **确定性布局引擎**：组件实测 → 空间预算 → 显式分页决策 → 生成 Layout Manifest。CSS 负责视觉呈现，不交由浏览器做不可控的业务分页。
4. **同构双轨出版**：学生卷与教师解析卷共享同源题型数据与版面契约，答案与解析绝不破坏试卷结构。
5. **硬件补偿与打印机 Profile**：支持标准激光、家用喷墨走纸盲区补偿（`inkjet-desktop` 15mm 底部补偿）、左侧装订线（`binding-left` 18mm 偏置）。
6. **五层质量验收体系 (Q1–Q5)**：
   - **Q1 数据契约**：JSON Schema、字段完整性与题型校验。
   - **Q2 布局几何**：Layout Manifest 坐标检查、页面不重叠、无越界。
   - **Q3 PDF 文件**：Poppler (`pdfinfo`, `pdffonts`, `pdftotext`) 矢量字体嵌入、A4 尺寸与字符完整性检查。
   - **Q4 视觉质量**：无头 Chromium 渲染与页面位图墨迹边界分析（`P0-02-T` 6.5mm 安全阈值）。
   - **Q5 物理打印**：实测纸面样张人工审校。

---

## 架构与工程目录

```text
primary-chinese-worksheet-publishing/
├── docs/
│   └── DESIGN_SPECIFICATION.md   # v2.2.0 设计规范总则与参数基线
├── assets/
│   ├── design-system/           # L1/L2 设计系统 (page, grid, typography, spacing, colors, borders, hierarchy)
│   ├── profiles/                # 年级配置 (grade-1, grade-2)
│   │   ├── scenarios/           # 卷型场景配置 (special-practice, unit-review, comprehensive-test)
│   │   └── printers/            # 打印机硬件补偿 (default, inkjet-desktop, laser-compact, binding-left)
│   ├── tokens/                  # 历史兼容令牌映射
│   ├── css/                     # 出版级基础样式 (worksheet-base.css)
│   └── schemas/                 # 数据契约 Schema
├── src/
│   ├── cli.mjs                  # 命令行入口 (wbpub)
│   ├── pipeline.mjs             # 六步出卷流水线
│   ├── domain/                  # 文档模型、校验契约、文本抽取
│   ├── components/              # 题型映射、原子组件、版面家具
│   ├── layout/                  # 实测高度、空间预算、分页算法、Layout Manifest
│   ├── render/                  # Chrome Headless PDF 渲染器、页面拼装
│   └── qa/                      # 质量验收引擎 (位图墨迹分析、Poppler 工具、报告生成)
├── examples/                    # 标准样卷与测试样例
│   ├── g1-pinyin-unit1.json     # 一年级拼音专项样卷
│   └── g2-review-unit56.json    # 二年级第五、六单元专项复习标准样卷
├── references/                  # 出版设计参考手册 (01-09)
└── test/                        # Node.js 原生测试套件 (35+ 单元与 E2E 测试)
```

---

## 快速上手

### 环境要求
- **Node.js**: `>= 20.11`（项目采用零第三方依赖设计，**无需 `npm install`**）
- **Google Chrome / Chromium**: 用于无头渲染与实测
- **poppler-utils**: 包含 `pdfinfo`, `pdffonts`, `pdftotext`, `pdftoppm` 等质检工具

### 常用命令

```bash
# 1. 结构与契约校验（秒级拦截数据错误）
npm run check

# 2. 编译并产出试卷、布局清单与 QA 验收报告
npm run build

# 3. 运行全套单元测试与端到端渲染回归（44项测试全部通过）
npm test

# 4. 构建标准样卷交付包 (Section 13.3 规范包)
npm run sample

# 5. 生成打印机硬件物理校准样张 (四周毫米尺、阶梯不可打印边界、100mm标定方框)
npm run calibrate

# 6. 自动化视觉回归差分检测 (像素级比对、交互式卷帘对比报告)
npm run diff
```

### 交付资产说明 (`--out ./build` 或 `standard-sample/`)
- `student-paper.pdf` / `student.pdf`：学生作答卷（矢量 PDF，字体全嵌入）
- `teacher-paper.pdf` / `teacher.pdf`：教师解析卷（红字标答覆盖 + 独立解析附页）
- `layout-manifest.json`：学生卷物理坐标清单（单位：mm）
- `layout-manifest-teacher.json`：教师卷物理坐标清单
- `reports/`：
  - `geometry-report.json`：物理几何与版心占用检测数据
  - `font-report.json`：字体嵌入清单与字符完整性
  - `pdf-report.json`：PDF 元信息与尺寸合规性
  - `visual-diff-report.html`：像素级差分与交互式卷帘 (Split Slider) 报告
- `screenshots/`：各页位图截图归档
- `diffs/`：高亮差分图像
- `print-review/`：
  - `print-calibration.pdf`：打印机硬件物理校准样张
  - `print-review-record.md`：附录 B 出版级验收签署记录表

---

## 规范状态

当前规范版本：**v2.1.0 (VALIDATED — 已通过标准样卷全链路验证，待实物打样签署)**  
详情查阅 [docs/DESIGN_SPECIFICATION.md](docs/DESIGN_SPECIFICATION.md)。
