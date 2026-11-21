# 试卷源码库 (papers/)

本目录用于存放所有经过结构化录入的**真实业务试卷 JSON 源文件**（受 Git 版本控制）。

---

## 1. 推荐目录结构与命名规范

随着试卷数量增加，建议按**学科 / 年级**进行分层归类管理：

```text
papers/
├── README.md
├── g2-review-u12.json              # 现有测试与复习样卷
│
├── chinese/                       # 语文学科
│   ├── g1/                        # 一年级
│   └── g2/                        # 二年级
│       ├── unit1-2-review.json    # 第一、二单元复习卷
│       └── midterm-exam.json      # 期中综合测试卷
├── math/                          # 数学学科
│   ├── g1/
│   └── g2/
└── english/                       # 英语学科（三至六年级）
    └── g3/
```

### 文件命名建议
- 格式：`<类型>-<单元/阶段/代号>.json`
- 示例：
  - `review-u12.json`：第 1~2 单元复习卷（`doc_type: "review"`）
  - `practice-pinyin.json`：拼音专项突破练习（`doc_type: "practice"`）
  - `exam-midterm.json`：期中全真模拟卷（`doc_type: "examination"`）

---

## 2. 试卷 JSON 核心必填字段

每份试卷 JSON 必须严格遵循 `assets/schemas/document.schema.json` 契约定义：

| 字段 | 类型 | 说明 | 示例 |
| :--- | :--- | :--- | :--- |
| `doc_id` | string | 全局唯一试卷标识（小写英数字连字符） | `"g2-review-u12"` |
| `title` | string | 试卷主标题 | `"二年级上册语文 第一、二单元复习卷"` |
| `grade` | number | 适用年级（1~6） | `2` |
| `subject` | string | 学科类型（`chinese` / `math` / `english`） | `"chinese"` |
| `doc_type` | string | 试卷类型（`review` / `practice` / `examination`） | `"review"` |
| `total_score` | number | 卷面满分（须与所有大题小题总分严格对齐） | `100` |
| `target_page_count` | number | 目标页数（双面印刷必须为 2 或 4） | `4` |
| `sections` | array | 卷面各大题列表 | `[...]` |

---

## 3. 常用出卷与校验命令

在项目根目录下执行：

```bash
# 1. 快速语法与数据结构校验（零等待，快速发现分值不符、字段缺失）
node src/cli.mjs papers/g2-review-u12.json --check-only

# 2. 正式排版编译（产出学生卷 + 教师解析卷 + 物理坐标清单 + 质量验收报告）
node src/cli.mjs papers/g2-review-u12.json --out ./build/g2-review-u12

# 3. 仅编译学生卷（加快排版速度）
node src/cli.mjs papers/g2-review-u12.json --no-teacher --out ./build/g2-review-u12

# 4. 指定特定打印机硬件边距补偿配置
node src/cli.mjs papers/g2-review-u12.json --printer inkjet-desktop --out ./build/g2-review-u12
```

所有构建产物将统一生成在 `build/<试卷标识>/` 目录下，不会污染项目根目录或源码库。
