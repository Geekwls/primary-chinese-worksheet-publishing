/**
 * 版面家具：卷头、大题标题、教师解析页。
 *
 * 这些不是"题型"，而是整卷的骨架；它们同样以排版原子形式参与实测与分页，
 * 因此标题不会孤行、卷头也不会把首题挤到页外。
 */
import { Part } from "../domain/part.mjs";
import { esc } from "../core/text.mjs";

/** 卷头：标题 + 副标题/单元 + 时限/满分 + 姓名班级等填写栏 + 分隔粗线。 */
export function buildDocHead(doc, ctx) {
  const dp = ctx.docProfile;
  const subtitleHtml = doc.subtitle ? `<div class="doc-subtitle">${esc(doc.subtitle)}</div>` : "";
  const subs = [];
  if (dp.show_time_limit && doc.time_limit) subs.push(`时间：${esc(doc.time_limit)}`);
  if (dp.show_total_score && doc.total_score) subs.push(`满分：${esc(doc.total_score)}分`);
  const subHtml = subs.length ? `<div class="doc-sub">${subs.join("　　")}</div>` : "";

  const fields = doc.meta_fields?.length ? doc.meta_fields : dp.meta_fields ?? [];
  const meta = fields.length
    ? `<div class="doc-meta">${fields.map((f) => `<span class="mf">${esc(f)}：<b></b></span>`).join("")}</div>`
    : "";

  const body = `<div class="doc-title">${esc(doc.title ?? "")}</div>${subtitleHtml}${subHtml}${meta}<div class="doc-head-rule"></div>`;
  return new Part("doc-head", body, { cls: "doc-head", group: "doc", role: "doc_head" });
}

/** 大题标题：keepNext 保证不单独留在页底。 */
export function buildSection(sec, ctx, index) {
  const score = sec.score;
  const scoreHtml = score !== null && score !== undefined ? `<span class="sec-score">（${esc(score)}分）</span>` : "";
  // 命题标签色块（生活情境/新角度等，来自草稿 section.tag_label）
  const tagHtml = sec.tag_label ? `<span class="sec-tag">${esc(sec.tag_label)}</span>` : "";
  // 卡片式题头（基础知识回顾卷的卡片化布局）：题头改为圆角色块胶囊
  const cardCls = sec.card_style ? "sec sec-card" : "sec";
  return new Part(`sec-${index}`, `${tagHtml}<span>${esc(sec.title ?? "")}</span>${scoreHtml}`, {
    cls: cardCls,
    group: sec.section_id ?? `s${index}`,
    role: "section",
    keepNext: true,
  });
}

/**
 * 教师解析页内容：独立附加页，绝不挤占学生卷版面。
 *
 * 题号与正文共用同一条自增序列，因此解析编号天然与卷面一致；
 * 没有答案也没有解析的题目跳过内容但保留编号，避免后续题号错位。
 */
export function buildExplanationParts(doc, ctx) {
  ctx.resetNo();
  const parts = [
    new Part("exp-title", '<div class="exp-page-title">参考答案与教学解析</div>', { group: "exp", role: "exp" }),
  ];
  for (const sec of doc.sections ?? []) {
    for (const q of sec.questions ?? []) {
      const no = ctx.nextNo();
      const answer = q.answer_text;
      const explain = q.explain;
      if (!answer && !explain) continue;
      const aHtml = answer ? `<div class="exp-a">${esc(answer)}</div>` : "";
      const nHtml = explain ? `<div class="exp-n">${esc(explain)}</div>` : "";
      const body =
        `<div class="exp-q"><div class="exp-h">${no}. ${esc(q.stem ?? "")}</div>${aHtml}${nHtml}</div>`;
      parts.push(
        new Part(`exp-${q.question_id ?? no}`, body, { group: q.question_id ?? "", role: "exp" }),
      );
    }
  }
  return parts;
}
