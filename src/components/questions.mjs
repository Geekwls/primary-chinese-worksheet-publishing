/**
 * L3 题型组件：题型 → 排版原子（Part）序列。
 *
 * 铁律：
 *   1. 每个 Part 自带内边距，块间不依赖外边距。
 *   2. 教师卷答案只做绝对定位覆盖，绝不改变任何块的实测高度。
 *   3. 题型无法映射组件时抛错，不做"凑合渲染"。
 *   4. 只有真正能独立成行的部分才标 splittable —— 拆错位置比不拆更糟。
 */
import { Part } from "../domain/part.mjs";
import { ans, answerLines, chunks, esc, inlineText, pinyinWordItem, stemInner, wlines } from "./atoms.mjs";

const head = (pid, q, ctx) =>
  new Part(`${pid}-h`, stemInner(q, ctx), { cls: "stem", group: pid, role: "q_head", keepNext: true });

const tail = (pid) => new Part(`${pid}-t`, "", { cls: "qtail", group: pid, role: "q_tail" });

/** 看拼音写词语：拼音行 + 田字格，按年级"每行词数"切行。 */
export function compPinyinWriteWord(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  const per = Math.trunc(ctx.profile.layout.pinyin_items_per_row ?? 3);
  chunks(q.items ?? [], per).forEach((group, r) => {
    const cells = group.map((it) => pinyinWordItem(it, ctx)).join("");
    parts.push(
      new Part(`${pid}-r${r}`, cells, {
        cls: "prow",
        group: pid,
        splittable: true,
        label: `row${r}`,
      }),
    );
  });
  parts.push(tail(pid));
  return parts;
}

/** 形近字组词：字 + 词语槽，按年级栏数切行。 */
export function compSimilarCharacter(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  const cols = Math.max(1, Math.trunc(ctx.profile.layout.similar_cols ?? 2));
  chunks(q.items ?? [], cols).forEach((group, r) => {
    let cells = "";
    for (const it of group) {
      const chars = it.chars ?? [];
      const answers = it.answers ?? [];
      chars.forEach((ch, i) => {
        const a = i < answers.length ? answers[i] : "";
        cells +=
          `<span class="gc"><span class="ch">${esc(ch)}</span>` +
          `<span class="brk">（<i class="slot w"></i>）${ctx.isTeacher ? ans(a) : ""}</span></span>`;
      });
    }
    parts.push(
      new Part(`${pid}-r${r}`, cells, {
        cls: cols === 1 ? "wrow" : `cols cols${cols}`,
        group: pid,
        splittable: true,
        label: `row${r}`,
      }),
    );
  });
  parts.push(tail(pid));
  return parts;
}

/** 给加点字注音：目标字上方留注音槽，字下方加点。 */
export function compAddPinyin(q, ctx, pid) {
  const cols = [];
  for (const it of q.items ?? []) {
    const word = String(it.word ?? "");
    const target = Math.trunc(Number(it.target ?? 0));
    const answer = String(it.answer ?? "");
    let body = "";
    [...word].forEach((ch, i) => {
      if (i === target) {
        body +=
          `<span class="pin-col"><span class="pin-slot">${ctx.isTeacher ? ans(answer) : ""}</span>` +
          `<span class="pin-c tgt">${esc(ch)}</span></span>`;
      } else {
        body += `<span class="pin-col"><span class="pin-top"></span><span class="pin-c">${esc(ch)}</span></span>`;
      }
    });
    cols.push(`<span class="pin-item">${body}</span>`);
  }
  return [
    head(pid, q, ctx),
    new Part(`${pid}-g`, cols.join(""), { cls: "pin-grp", group: pid, splittable: true }),
    tail(pid),
  ];
}

/** 成语补充：括号空槽横排。 */
export function compIdiomFill(q, ctx, pid) {
  const items = (q.items ?? [])
    .map((it) => `<span class="witem">${inlineText(String(it.text ?? ""), ctx, "paren")}</span>`)
    .join("");
  return [
    head(pid, q, ctx),
    new Part(`${pid}-g`, items, { cls: "wrow", group: pid, splittable: true }),
    tail(pid),
  ];
}

/** 词语仿写：例词 + 若干词槽。 */
export function compWordPattern(q, ctx, pid) {
  let rows = "";
  for (const it of q.items ?? []) {
    const label = esc(it.label ?? "");
    const samples = (it.samples ?? []).map((s) => esc(s)).join("、");
    const headHtml = label || samples ? `<span class="witem">${label}${samples}</span>` : "";
    let blanks = "";
    for (const a of it.answers ?? []) {
      blanks +=
        `<span class="brk" style="width:var(--slot-w)"><i class="slot" style="width:100%"></i>` +
        `${ctx.isTeacher ? ans(a) : ""}</span>`;
    }
    rows += `<div class="wrow">${headHtml}${blanks}</div>`;
  }
  return [head(pid, q, ctx), new Part(`${pid}-g`, rows, { group: pid }), tail(pid)];
}

/** 古诗填空：按答案字数定宽的横线槽。 */
export function compPoemFill(q, ctx, pid) {
  let blocks = "";
  for (const it of q.items ?? []) {
    const title = it.title ? `<div class="poem-t">${esc(it.title)}</div>` : "";
    const lines = (it.lines ?? [])
      .map((line) => `<div class="poem-l">${inlineText(String(line), ctx, "line")}</div>`)
      .join("");
    blocks += `<div class="poem">${title}${lines}</div>`;
  }
  return [head(pid, q, ctx), new Part(`${pid}-g`, blocks, { group: pid }), tail(pid)];
}

/** 句子改写/仿写：单栏，小题之间可拆，整行书写线。 */
export function compSentenceRewrite(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  ctx.resetSub();
  for (const it of q.items ?? []) {
    const no = ctx.nextSub();
    const req = esc(it.require ?? "");
    const reqHtml = req ? ` <span class="pt">${req}</span>` : "";
    const lines = it.lines === null || it.lines === undefined ? 2 : Math.max(0, Math.trunc(Number(it.lines)));
    const answers = it.answer ? [it.answer] : [];

    // 改写与仿写是两种动作：改写要动原句，仿写是另造一句。
    // 两者若用同一套视觉，学生会把例句当成待改写对象，所以仿写单独给"例句"样式与"仿写："引导。
    const sentence = String(it.sentence ?? "");
    const imitate = it.kind === "imitate" || /^例\s*[：:]/.test(sentence);
    const sentenceHtml = imitate ? `<span class="eg">${esc(sentence)}</span>` : esc(sentence);
    const cueHtml = imitate ? '<div class="cue">仿写：</div>' : "";

    const body =
      `<div class="sub"><div class="subh"><span class="no">（${no}）</span>${sentenceHtml}${reqHtml}</div>` +
      cueHtml +
      `<div class="wlines">${wlines(lines, answers, ctx, `${pid} 第${no}小题`)}</div></div>`;
    parts.push(new Part(`${pid}-s${no}`, body, { group: pid, splittable: true, label: `sub${no}` }));
  }
  parts.push(tail(pid));
  return parts;
}

/** 阅读理解：文章整块不可拆页（宁可整段换页），小题之间可拆。 */
export function compReading(q, ctx, pid) {
  const passage = q.passage ?? {};
  const parts = [head(pid, q, ctx)];

  let passageHtml = "";
  if (passage.title) passageHtml += `<div class="passage-title">${esc(passage.title)}</div>`;
  for (const para of passage.paragraphs ?? []) {
    passageHtml += `<p class="passage">${esc(para)}</p>`;
  }
  if (passageHtml) {
    parts.push(
      new Part(`${pid}-p`, passageHtml, {
        group: pid,
        keepNext: true,
        splittable: false,
        label: "passage",
      }),
    );
  }

  ctx.resetSub();
  for (const sub of q.subs ?? []) {
    const no = ctx.nextSub();
    const lines = sub.lines === null || sub.lines === undefined ? 1 : Math.max(0, Math.trunc(Number(sub.lines)));
    const answers = sub.answer ? [sub.answer] : [];
    const body =
      `<div class="sub"><div class="subh"><span class="no">（${no}）</span>` +
      `${inlineText(String(sub.stem ?? ""), ctx, "line")}</div>` +
      `<div class="wlines">${wlines(lines, answers, ctx, `${pid} 第${no}小题`)}</div></div>`;
    parts.push(new Part(`${pid}-s${no}`, body, { group: pid, splittable: true, label: `sub${no}` }));
  }
  parts.push(tail(pid));
  return parts;
}

/** 看图写话/写话：方格纸，格数与格宽由年级 Profile 决定。 */
export function compComposition(q, ctx, pid) {
  const rows = Math.trunc(Number(q.rows ?? 6));
  const cols = Math.trunc(ctx.profile.geometry.composition_cols ?? 16);
  const note = q.prompt ? `<div class="note">${esc(q.prompt)}</div>` : "";
  const cells = "<i></i>".repeat(rows * cols);
  return [
    new Part(`${pid}-h`, stemInner(q, ctx) + note, { cls: "stem", group: pid, role: "q_head", keepNext: true }),
    new Part(`${pid}-g`, `<div class="zwg" style="grid-template-columns:repeat(${cols},var(--zw))">${cells}</div>`, {
      cls: "zw-wrap",
      group: pid,
    }),
    tail(pid),
  ];
}

/** 通用作答题：题干 + N 行书写线。语义题型不得用它顶替。 */
export function compGeneric(q, ctx, pid) {
  const lines = answerLines(q, ctx);
  const answers = q.answer ? [q.answer] : [];
  return [
    head(pid, q, ctx),
    new Part(`${pid}-g`, `<div class="wlines">${wlines(lines, answers, ctx, pid)}</div>`, { group: pid }),
    tail(pid),
  ];
}
