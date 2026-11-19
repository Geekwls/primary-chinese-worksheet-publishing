# 04 · 组件库与组件契约

> 组件是这套系统的"资产"。改一次组件，所有题型同步生效；不定义契约，就只有一堆一次性 CSS。

## 1. 三级组件体系

**Level 1 · 基础原子**（`assets/css/worksheet-base.css`）

| 组件 | CSS 类 | 说明 |
| --- | --- | --- |
| 文字段 | `.stem` `.subh` `.note` | 题干、小题、提示 |
| 填空槽 | `.slot.i` `.slot.w` `.slot.p` | 单字 / 词语 / 短语三种宽度 |
| 括号槽 | `.brk` | 全角括号 + 槽 + 答案覆盖层 |
| 书写横线 | `.wline` `.wlines` | 高度 = `writing_line_gap_mm` |
| 分隔 | `.doc-head-rule` | 卷头分隔线 |
| 页码 | `.ftr` | 页脚左卷名右页码 |
| 分值 | `.pt` `.sec-score` | 辅助字号 |

**Level 2 · 语文专用**

| 组件 | CSS 类 | 尺寸来源 |
| --- | --- | --- |
| 田字格 | `.tzg`（外框 + 虚线十字） | `geometry.tianzi_mm` |
| 田字格行 | `.tzrow`（负边距消除双线） | 同上 |
| 拼音单元 | `.pyc` | `font_pt.pinyin` |
| 拼音+田字格词组 | `.pitem` `.pyrow` | 同上 |
| 注音列 | `.pin-col` `.pin-slot` `.pin-c.tgt` | `pinyin_slot_h_mm` |
| 组词区 | `.gc` `.cols.colsN` | `layout.similar_cols` |
| 句子书写 | `.wlines` | `writing_line_gap_mm` |
| 古诗空槽 | `.poem-l` + `.slot`（em 宽） | 答案字数 |
| 阅读文章 | `.passage` `.passage-title` | `font_pt.body` |
| 答题区 | `.wlines` `.sub` | `answer_line_gap_mm` |
| 写话方格 | `.zwg` `.zw-wrap` | `composition_cell_mm` / `composition_cols` |

**Level 3 · 题型组合**（`src/components/questions.mjs` 的 `comp*` 函数）

`pinyin_write_word` · `similar_character` · `add_pinyin` · `idiom_fill` · `word_pattern` ·
`poem_fill` · `sentence_rewrite` · `reading` · `composition` · `generic`

## 2. 组件契约（新增组件必须填全）

| 属性 | 说明 | 本系统实现位置 |
| --- | --- | --- |
| `component_id` | 唯一标识 | `REGISTRY[qtype][1]` |
| `version` | 组件版本 | `SKILL.md` metadata / `LAYOUT_VERSION` |
| `supported_grades` | 适用年级 | 由 `layout` 参数间接决定，扩展时显式登记 |
| `input_schema` | 输入数据结构 | `assets/schemas/document.schema.json` |
| `min_width` / `preferred_width` | 宽度约束 | 统一 186mm 通栏；双栏由 `.cols` 派生 |
| `min_height` | 最小高度 | 由实测得到，不手写 |
| `splittable` | 是否允许跨页 | `Part.splittable` |
| `answer_mode` | 答案显示方式 | `student: empty` / `teacher: overlay`（绝对定位） |
| `print_constraints` | 打印限制 | 线宽、灰度可辨、无底纹 |
| `visual_test` | 视觉测试样例 | `examples/*.json` + `preview/*.png` |

契约示例（田字格词组）：

```yaml
component_id: pinyin_tianzi_grid
version: 1.0.0
supported_grades: [1, 2]
geometry:
  cell_size: {grade_1: 13mm, grade_2: 11.5mm}
layout:
  direction: horizontal
  items_per_row: {grade_1: 3, grade_2: 4}
  splittable: true          # 按行拆分，不劈开单个田字格
answer_mode:
  student: empty
  teacher: overlay          # 绝对定位，不改高度
print:
  background: white
  preserve_grid_lines: true
```

## 3. 新增组件的正确顺序

1. 在 `src/components/questions.mjs` 写 `compXxx(q, ctx, pid) → Part[]`。
2. 每个 Part 自带内边距；**块间不得依赖外边距**（绝对定位会错位）。
3. 答案一律放进 `<span class="ans">` 且容器 `position: relative`（保证零高度影响）。
4. 需要跨页的行级组件，按行生成独立 Part，并置 `splittable: true`。
5. 在 `src/components/registry.mjs` 的 `REGISTRY` 登记 `{ build, componentId, label }`。
6. 补 `references/authoring-reference.md` 字段说明 + 一个示例题。
7. 跑两个年级样例回归，检查 `qa-report.md` 全 PASS、`preview/*.png` 目视无异常。

## 4. 尺寸测试清单（打样时必须逐条过）

**田字格**

- [ ] 外框实测 11.5mm / 13mm（±0.3mm）。
- [ ] 横竖中线位于几何中心（偏差 ≤0.3mm）。
- [ ] 两格拼接处只有一条线（负边距生效，无重线/双线）。
- [ ] 拼音与对应汉字逐字对齐（不居中猜测）。
- [ ] 打印后虚线不断线、不糊成实线。
- [ ] 教师卷填入答案后，格子尺寸与位置不变。

**注音列**

- [ ] 注音字距 ≥1.8 字宽（二年级 10mm / 一年级 11mm），`zhǎng`、`jiāo` 这类长音节不得压到相邻字。
- [ ] 加点字下方的点不被下划线吞掉。
- [ ] 教师卷拼音不换行、不越出安全区。

**句子书写**

- [ ] 行距 = Profile 值（一、二年级均为 9mm 下限）。
- [ ] 每行都能写下一句完整的话（≥28 字）。
- [ ] 自动换行后不会只剩半行短线。
- [ ] 答案区不被题干挤压：题干增高时整体下移，而不是压缩答区。

**写话方格**

- [ ] 格宽 10.5–12mm，且不小于田字格 0.9 倍；行列数与 Profile 一致。
- [ ] 整块居中，左右留白均衡。
- [ ] 方格块不可拆页（拆开等于把作文切成两半）。

**阅读文章**

- [ ] 通栏，行距 2.0，首行缩进 2 字符。
- [ ] 文章整体不跨页；文章与第一道小题尽量同页。
- [ ] 长文章（>10 行）允许整页独占，不得为塞小题而断开。
