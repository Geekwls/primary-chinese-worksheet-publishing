# 题型 JSON 编写手册

> 面向"写题"的人。所有字段都对应 `src/components/questions.mjs` 的实际实现，写错了契约校验会直接拦下。

## 0. 文档骨架

```json
{
  "document_id": "g2-review-unit56-v1",
  "grade": 2,
  "doc_type": "review",
  "title": "二年级上册语文 第五、六单元专项复习卷",
  "time_limit": "60分钟",
  "total_score": 100,
  "meta_fields": ["姓名", "班级", "得分"],
  "sections": []
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `document_id` | ✅ | 唯一标识，写入 Manifest 与报告 |
| `grade` | ✅ | 1 / 2（未来 3+），决定 Profile |
| `doc_type` |  | `practice` / `review` / `examination`，决定卷头字段与分值显示 |
| `title` | ✅ | 卷名，同时进页脚 |
| `time_limit` / `total_score` |  | 卷头第二行；总分与小题合计不一致会出 P1 警告 |
| `meta_fields` |  | 覆盖文档 Profile 的默认字段 |

大题：

```json
{ "section_id": "s1", "title": "一、基础字词", "score": 26, "questions": [] }
```

题目公共字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `question_id` | ✅ | 全卷唯一，重复即报错 |
| `type` | ✅ | 必须是已收录题型 |
| `stem` | ✅ | 题干。**不支持 `{}` 空槽语法** |
| `score` |  | 分值，卷面显示 `（N分）` |
| `answer_text` |  | 教师卷解析页的"标准答案"整段文本，多条用 `／` 或 `；` 分隔 |
| `explain` |  | 教学解析/易错点，进解析页 |

## 1. `pinyin_write_word` 看拼音写词语

```json
{
  "question_id": "q1", "type": "pinyin_write_word",
  "stem": "看拼音，写词语。", "score": 10,
  "items": [
    {"pinyin": "lín jū", "answer": "邻居"},
    {"pinyin": "yí zhèn", "answer": "一阵"}
  ]
}
```

- `pinyin` 用空格分隔音节；音节数 = 汉字数时逐字对齐，否则整词居中（不猜测对齐）。
- 每行词语数由 Profile 决定（一年级 3 / 二年级 4），行与行之间可跨页。

## 2. `similar_character` 形近字组词

```json
{ "question_id": "q2", "type": "similar_character", "stem": "比一比，再组词。", "score": 10,
  "items": [{"chars": ["晴", "睛"], "answers": ["晴天", "眼睛"]}] }
```

- `chars` 与 `answers` 一一对应。
- 栏数由 `layout.similar_cols` 决定（一年级 1 / 二年级 2）。

## 3. `add_pinyin` 给加点字注音

```json
{ "question_id": "q3", "type": "add_pinyin", "stem": "给加点字选择正确的读音。", "score": 6,
  "items": [{"word": "长大", "target": 0, "answer": "zhǎng"}] }
```

- `target` 是 `word` 中目标字的**下标（从 0 开始）**。
- 目标字下方自动加点，上方留注音槽；学生卷注音槽为空。

## 3.1 `polyphonic` 多音字辨析

```json
{
  "question_id": "q3_poly",
  "type": "polyphonic",
  "stem": "给下列多音字选择正确的读音。",
  "score": 6,
  "items": [
    {"word": "长大", "options": ["zhǎng", "cháng"], "answer": "zhǎng"},
    {"word": "音乐", "options": ["yuè", "lè"], "answer": "yuè"}
  ]
}
```

- `options` 为可选读音列表（通常 2~3 个音节）。
- `answer` 为教师卷标准读音，受固定槽宽约束，不会因文本过长溢出遮挡相邻选项。
- **两种形态**（`mode` 字段，默认横线式）：
  - 默认（书写式）：读音选项 + 横线槽，学生在横线上写出正确读音——适合同时考查拼音书写的卷子。
  - `"mode": "circle"`（圈选式）：读音并列显示，学生在正确读音上画圈——降低书写负担，考查重点落在语境辨析。教师卷用黑圈标出正确读音（outline 实现，不改变块高，灰度打印可辨）。题干建议写明"并圈出来"。
- 整行词语 + 读音选项 + 作答槽设置 `splittable: false`，不可跨栏或跨页拆散。
- 只支持"词语并排"形态；语段内注音需要新组件（见 `05-question-layouts.md` 第 3 节）。

## 4. `idiom_fill` 成语补充（支持 `{}` 空槽）

```json
{ "question_id": "q4", "type": "idiom_fill", "stem": "把成语补充完整。", "score": 8,
  "items": [{"text": "{千}言{万}语"}, {"text": "无{影}无{踪}"}] }
```

- `{}` 内为答案，渲染为全角括号单字槽；教师卷在槽内显示红字。
- 一行可排 2–4 个成语，超出自动换行。
- `"slot": "grid"`（可选）切换为**四字方格形态**：每个字一个方格（实字格 + 空白格），明确"每格一字"；教师卷空白格红字覆盖，逐条单行带圈号。默认括号形态不变。

## 5. `word_pattern` 词语仿写

```json
{ "question_id": "q5", "type": "word_pattern", "stem": "照样子，写词语。", "score": 8,
  "items": [
    {"label": "AABB式：", "samples": ["高高兴兴"], "answers": ["明明白白", "干干净净"]}
  ] }
```

- `answers` 的个数 = 空槽个数；`samples` 只作为示例显示，不占空槽。
- `"style": "block"`（可选）切换为**分类式单行块**：加粗标签 + `示例：…` + ①② 编号槽同行，一眼区分不同词语结构。默认行式不变。

## 6. `poem_fill` 古诗填空（支持 `{}` 空槽）

```json
{ "question_id": "q6", "type": "poem_fill", "stem": "把古诗名句补充完整。", "score": 12,
  "items": [{"title": "《登鹳雀楼》",
             "lines": ["白日依山尽，{黄河}入海流。", "欲穷千里目，{更上}一层楼。"]}] }
```

- 空槽宽度按 `{}` 内答案字数自动计算（2 字 ≈ 2.4em），不要写死宽度。
- `title` 可省略；`author`（如 "宋 · 王安石"）为可选作者行，渲染为诗题下的浅色小字，诗题与作者分层呈现。

## 7. `sentence_rewrite` 句子改写 / 仿写

```json
{ "question_id": "q7", "type": "sentence_rewrite", "stem": "按要求改写句子。", "score": 8,
  "items": [
    {"sentence": "他把小鱼放回了河里。", "require": "（改为“被”字句）",
     "answer": "小鱼被他放回了河里。", "lines": 2}
  ] }
```

- `lines` 为预留书写行数（默认 2，允许 0）。
- 每个小题是独立排版单元，小题之间可跨页。
- 教师卷答案按"每行可容纳字数"自动分行，超出会警告。
- **`kind` 区分两种动作**：`rewrite`（默认，改写原句）与 `imitate`（给例句仿写）。`imitate` 会把 `sentence` 渲染成带左竖线的例句块，并在横线前加「仿写：」引导 —— 否则学生会把例句当成待改写对象。`sentence` 以「例：」开头时也会自动按 `imitate` 处理。
- **`scaffold` 填空支架（可选，低年级推荐）**：如 `"{弯弯的月亮}像{小船}。"`，`{}` 内为教师卷红字答案。渲染为例句块（若有）+ 填空句框，不再留书写横线——给低年级半成品句框，降低起步难度。`sentence` 缺省时支架直接作题面（用于"把句子补充完整"）。
- 小题可带 `score`（如 4），行末渲染（4分）；大题 `score` 仍显示在题干后。

## 8. `reading` 阅读理解

```json
{ "question_id": "q9", "type": "reading", "stem": "读短文，完成练习。", "score": 20,
  "passage": {"title": "坐井观天（节选）",
              "paragraphs": ["青蛙坐在井里。小鸟飞来，落在井沿上。"]},
  "subs": [
    {"stem": "短文共有{3}个自然段。", "answer": "3", "lines": 0},
    {"stem": "读了这个故事，你明白了什么道理？", "answer": "看问题要全面。", "lines": 3}
  ] }
```

- 每个 `paragraphs` 元素 = 一个自然段（首行缩进 2 字，两端对齐）。
- **文章整体不可跨页**；文章与第一个小题尽量同页。
- `subs[].stem` 支持 `{}` 空槽；`lines: 0` 表示只需要空槽、不再留横线。
- `subs[].score` 为小题分值（如 3），行末渲染（3分）——阅读大题应逐小题标注分值，别把分值写进 stem 文本。
- `"keep": "whole"`（可选）：材料与全部小题 keepNext 整链绑定，放不下整体换页；链超单页时自动回退为逐小题分页。材料型题目建议开启，避免末位小题被单独拆到下一页。
- 阅读题必须同时有 `passage.paragraphs` 与 `subs`，否则契约报错。

## 9. `composition` 写话 / 看图写话

```json
{ "question_id": "q10", "type": "composition", "stem": "写话。", "score": 10,
  "rows": 7,
  "prompt": "用几句话写一写你最喜欢的一种小动物……",
  "answer_text": "参考范文：……", "explain": "评分建议：……" }
```

- 列数由 Profile 决定（一年级 14 列 ×12mm / 二年级 16 列 ×10.5mm），`rows` 为方格行数。
- 整块不可跨页；`rows` 过大（超过约 12 行）会触发"块高于整页"错误，应拆成两页写话或改横线。
- 需要配图时当前版本不支持图片题，应先扩展组件。

## 10. `generic` 通用作答题

```json
{ "question_id": "q11", "type": "generic", "stem": "想一想，说一说。", "score": 4,
  "lines": 2, "answer": "……" }
```

仅用于确实没有专用组件的开放作答。**语义明确的题型（如古诗、成语）不得用 generic 顶替**，否则将来无法统一调整该题型的版式。

## 10.1 `fill_blank` 矩阵模式（items 空槽）

```json
{ "question_id": "q4", "type": "fill_blank", "stem": "在括号里填上合适的量词。",
  "score": 6, "cols": 3,
  "items": ["一{艘}军舰", "一{孔}石桥", "一{方}鱼塘"] }
```

- **stem 模式**（默认）：`stem` 内嵌 `{}`（线槽）或 `（）`（按序转线槽），答案由 `answer`（数组按序）提供。
- **items 矩阵模式**：`items` 为条目字符串数组，`{}` 内为答案，渲染为"括号留白 + 教师卷红字"的规整矩阵，每行 `cols`（默认 2）条；矩阵行与题干 keepNext 整链绑定，超长矩阵由分页器回退逐行放。适合量词题等"多空并列"布局，替代写成一长行的 stem 模式。
- items 模式下 `answer` 字段可省略（答案内嵌 `{}`）；矩阵条目缺 `{}` 答案会被契约拦截。
- `"numbered": true`（可选）：条目前缀圈号 ①②…，跨行连续编号——每空有独立视觉位置，学生不易漏题。

## 10.2 `sentence_order` 连词成句

```json
{ "question_id": "q8", "type": "sentence_order", "stem": "连词成句，并加上标点。",
  "score": 4,
  "items": [{"words": ["树叶", "一片片", "秋天", "落下来"], "answer": "秋天，一片片树叶落下来。", "lines": 1}] }
```

- `words` 为乱序词语（渲染时以全角空距分隔），`answer` 为连好的整句（教师卷书写线上覆盖）。
- `lines` 默认 1；小题可带 `score`。

## 10.3 `punctuation` 标点运用

```json
{ "question_id": "q9", "type": "punctuation", "stem": "给句子加上合适的标点。",
  "score": 4,
  "items": [
    {"text": "我会变", "answer": "。"},
    {"before": "太阳一晒", "answer": "，", "after": "我就变成汽。"}
  ] }
```

- `text` 或 `before` 为槽前文本，`answer` 为标点（渲染为定宽槽，教师卷红字覆盖），`after` 为槽后剩余文本（可省略）。
- 不留书写横线（标点写进槽内）；小题可带 `score`。

## 11. 空槽语法速查

| 位置 | 是否支持 `{}` | 空槽样式 |
| --- | --- | --- |
| `stem` | ❌（fill_blank stem 模式除外，见 10.1） | — |
| `idiom_fill.items[].text` | ✅ | 全角括号 + 单字槽 |
| `fill_blank.items[]`（矩阵模式） | ✅ | 全角括号留白 + 教师卷红字 |
| `poem_fill.items[].lines[]` | ✅ | 下划线（按字数定宽） |
| `reading.subs[].stem` | ✅ | 下划线（按字数定宽） |
| 其他字段 | ❌ | — |

## 12. 提交前自检

- [ ] `--check-only` 通过，无警告。
- [ ] 题干都是短句，一题一个指令。
- [ ] 每道题都有答案（教师卷要用）；有教学价值的补 `explain`。
- [ ] 阅读题文章不分段过碎、`subs` 有 `lines` 且够写。
- [ ] 分值合计 = `total_score`。
- [ ] 正式出卷后看 `qa-report.md` 是否 PASS，再看 `preview/*.png` 有没有"挤、断、空"。
