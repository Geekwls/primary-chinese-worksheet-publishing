# 06 · 排版引擎：实测 → 空间预算 → 分页 → 布局清单

> 一句话：**CSS 不做分页决策，引擎做。** CSS 只会"尽力"，它不会报告"我放不下"，也不会留下可追溯的几何记录。

## 1. 五段流水线

```text
结构化题目 JSON
   │  src/components/registry.mjs：题型 → 排版原子（Part）序列
   ▼
排版原子（题干 / 行组 / 结尾间距）
   │  src/layout/measure.mjs：用同一 Chrome 环境实测每个原子的毫米高度
   ▼
高度表（pid → mm）
   │  src/layout/paginate.mjs：按页高预算确定性装箱
   ▼
已定位块（Block：x, y, w, h，单位 mm）
   │  src/render/pages.mjs：绝对定位组装
   ▼
Layout Manifest + PDF（Chrome 固定版本输出）
```

## 2. 为什么必须实测，而不是估算

文字高度受字体、字距、标点挤压、行高、容器宽度共同影响。用 `行数 × 行高` 估算，误差会随多行题干与阅读文章放大到厘米级，最终表现为"最后一题被挤出页面"。

实测的做法：

- 把每个 Part 放进 `<div style="width:186mm">`，用 `getBoundingClientRect().height` 取实际高度。
- 换算：`mm = px × 25.4 / 96`（Chrome CSS px 固定 96dpi）。
- 实测与最终 PDF 使用同一浏览器、同一 CSS、同一宽度 → 高度可复现；本系统实测两次运行的高度偏差为 0.00mm。

## 3. 排版原子的切分原则

| 原则 | 说明 |
| --- | --- |
| 自包含内边距 | 每个 Part 的间距写在自己身上（`padding-bottom`），块间不加外边距 |
| 答案零影响 | 答案用绝对定位覆盖，Part 高度在两种卷别下必须完全相同 |
| 可拆粒度 = Part 粒度 | 行组是独立 Part → 天然支持跨页；题干是 Part → 永不与首行分离 |
| 结尾间距独立 | 每道题末尾一个 `.qtail` Part（高度 = `block_gap_mm`），拆分时跟着最后一块走 |

## 4. 分页算法（实际实现）

```text
y = content_top(12mm);  page = 1
for part in parts:
    h = height[part]
    need = h
    if part.keep_next:                      # 传递绑定：标题 → 题干 → 首个作答块
        need = 整条 keepNext 链 + 链尾那一个块     # 若整链高于整页，退化为只绑 h
    if y + need <= content_bottom(276mm):
        place(part, y);  y += h
    elif page 已有内容:
        page += 1;  y = content_top;  retry same part
    else:                                    # 空页仍放不下 → 结构性错误
        raise LayoutError("块高 x mm 超过单页可用高度 264mm")
```

`keep_next` 的两个使用者：大题标题（避免标题孤行）、题干（避免"题干在页底、作答区在下一页"）。
绑定必须**传递**：`五、写话` → `10. 写话。` → 方格块 是一条链，只绑一跳会把大题标题留在页底。

## 4.1 横向溢出的实测（P0-12）

高度只是两个维度之一。块的坐标可以完全合规，文字照样能压到隔壁——例如注音音节比汉字宽，槽宽却按字宽算。

因此实测层用 `Range.selectNodeContents()` 取**文字墨迹**的左右边界，与元素自身 border box 比较：

- 溢出量 = `max(墨迹右 - 盒子右, 盒子左 - 墨迹左)`
- 超过 0.8mm（约 0.2 个笔画宽）记入 `overflow`，由 P0-12 阻断
- 结果通过 `measurePartsDetailed()` 回传；`measureParts()` 保持只返回高度的窄接口

这条检测补的是 P0-02-T 与 P0-08 的死角：前者只看到安全区边界，后者只看到块级矩形。

## 5. 失败保护（不允许压缩内容）

出现以下情况时，引擎必须停下或换页，**不得缩字号、缩格子、裁切**：

| 情况 | 处置 |
| --- | --- |
| 单块高于整页 | 抛 `LayoutError`，要求拆组件或减少单块内容 |
| 题干放得下、首行放不下 | 整组移到下一页（`keep_next`） |
| 阅读文章与小题无法衔接 | 文章整体换页，小题顺延 |
| 教师卷高度与学生卷不一致 | 直接判失败（P0-07），不进入渲染 |
| 字体回退导致高度变化 | 字体固定 + 嵌入检测（P0-04）拦截 |

错误信息要求包含：块 ID、角色、实际高度、可用高度。不允许只打印"布局失败"。

## 6. Layout Manifest（几何真相）

```json
{
  "document_id": "g2-review-unit56-v1",
  "layout_version": "1.0.0",
  "units": "mm",
  "grade": 2,
  "variant": "student",
  "page": { "width": 210, "height": 297, "margin_x": 12, "margin_y": 12,
            "content_width": 186, "content_top": 12, "content_bottom": 276 },
  "page_count": 3,
  "content_used_mm": [261.4, 258.9, 240.1],
  "pages": [
    { "page": 1, "blocks": [
      { "block_id": "doc-head", "question_id": "doc", "role": "doc_head",
        "x": 12.0, "y": 12.0, "width": 186.0, "height": 26.91, "label": "" }
    ]}
  ]
}
```

用途：

1. 验收侧校验"块是否越界/重叠"（比位图更早发现问题）。
2. 教师卷与学生卷逐块比对坐标，证明双轨一致。
3. 事故追溯：任何一页的每道题在哪个位置，都有毫米级记录。

## 7. 与 CSS 分页的关系

| 做法 | 结果 |
| --- | --- |
| `break-inside: avoid` + 长文档 | 断点不可控，常出现半页空白或题干孤行 |
| `overflow: hidden` 收尾 | 溢出被吞掉，纸上才发现缺内容 |
| 引擎装箱 + 绝对定位 | 每页内容与坐标完全已知，可校验、可回归 |

绝对定位的代价是"必须有实测高度"，所以本系统把实测做成了流水线的固定一环。
