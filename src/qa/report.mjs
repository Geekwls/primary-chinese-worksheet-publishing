/**
 * 验收报告：把检测结果组织成"能被人拿去开会"的文档。
 *
 * 结论只有两种：PASS（可进入人工审校与打样）/ BLOCK（阻断发布）。
 * 中间态不存在 —— "大部分通过"在出版流程里等于没通过。
 */
import { writeJson, writeText } from "../core/io.mjs";
import { join } from "node:path";

const ICON = { PASS: "✅ 通过", FAIL: "❌ 未通过", WARN: "⚠️ 复核", SKIP: "➖ 人工" };

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export class Report {
  constructor(documentId) {
    this.documentId = documentId;
    this.checks = [];
    this.stats = {};
    this.generatedAt = nowStamp();
  }

  add(id, level, name, status, detail = "") {
    if (!ICON[status]) throw new Error(`非法状态：${status}`);
    this.checks.push({ id, level, name, status, detail });
  }

  get blocked() {
    return this.checks.some((c) => c.status === "FAIL" && c.level === "P0");
  }

  asDict() {
    const counts = { PASS: 0, FAIL: 0, WARN: 0, SKIP: 0 };
    for (const c of this.checks) counts[c.status] += 1;
    return {
      document_id: this.documentId,
      generated_at: this.generatedAt,
      verdict: this.blocked ? "BLOCK" : "PASS",
      counts,
      stats: this.stats,
      checks: this.checks,
    };
  }

  toMarkdown() {
    const lines = [
      `# PDF 出版验收报告 · ${this.documentId}`,
      "",
      `- 生成时间：${this.generatedAt}`,
      `- 验收结论：**${this.blocked ? "BLOCK · 阻断发布" : "PASS · 可进入人工审校与打样"}**`,
      "",
    ];

    if (Object.keys(this.stats).length) {
      lines.push("## 基础指标", "", "| 指标 | 值 |", "| --- | --- |");
      for (const [k, v] of Object.entries(this.stats)) lines.push(`| ${k} | ${v} |`);
      lines.push("");
    }

    lines.push("## 检测明细", "", "| 编号 | 层级 | 检测项 | 结果 | 说明 |", "| --- | --- | --- | --- | --- |");
    for (const c of this.checks) {
      const detail = c.detail.replace(/\|/g, "／").replace(/\n/g, " ");
      lines.push(`| ${c.id} | ${c.level} | ${c.name} | ${ICON[c.status]} | ${detail} |`);
    }
    lines.push("");

    const fails = this.checks.filter((c) => c.status === "FAIL");
    if (fails.length) {
      lines.push("## 必须处理（阻断发布）", "");
      for (const c of fails) lines.push(`- **${c.id} ${c.name}**：${c.detail}`);
      lines.push("");
    }

    const warns = this.checks.filter((c) => c.status === "WARN");
    if (warns.length) {
      lines.push("## 需人工复核", "");
      for (const c of warns) lines.push(`- **${c.id} ${c.name}**：${c.detail}`);
      lines.push("");
    }

    lines.push(
      "## 本报告不覆盖、必须人工完成的部分",
      "",
      "- **Q5 实物打印**：按目标打印机（家用喷墨 / 办公激光 / 专业印刷）各出一张，确认灰度可读、无裁切、无鬼影。",
      "- **P1 视觉复核**：模块疏密、同级标题一致、双栏失衡、答题线过长过短、题目是否被不合理拆开。",
      "- **P0-05 田字格几何**：需纸面直尺抽测外框与横竖中线；位图检测只能发现越界，不能替代尺寸量测。",
    );
    return lines.join("\n");
  }
}

export function writeReport(report, outDir) {
  const md = join(outDir, "qa-report.md");
  const json = join(outDir, "qa-report.json");
  writeText(md, report.toMarkdown());
  writeJson(json, report.asDict());
  return { md, json };
}
