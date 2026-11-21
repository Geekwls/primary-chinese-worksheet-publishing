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
import * as ast from "../layout/ast.mjs";
import { ans, answerLines, chunks, esc, inlineText, parseInline, pinyinWordItem, stemInner, wlines } from "./atoms.mjs";
import { astPart } from "./ast-part.mjs";

/** 题干 Part：编号由上下文自增，题干与分值进 q_head 节点（渲染在解释器）。 */
const head = (pid, q, ctx) =>
  astPart(
    `${pid}-h`,
    ast.q_head({ number: ctx.nextNo(), children: [ast.text(q.stem ?? "")], score: q.score }),
    { cls: "stem", group: pid, role: "q_head", keepNext: true },
    ctx,
  );

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

/** 多音字辨析：双栏或单栏，多音字词语 + 读音选项 + 结构化约束答题槽。 */
export function compPolyphonic(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  const cols = Math.max(1, Math.trunc(ctx.profile.layout.similar_cols ?? 2));
  chunks(q.items ?? [], cols).forEach((group, r) => {
    let cells = "";
    for (const it of group) {
      const word = String(it.word ?? "");
      const options = it.options ?? [];
      const answer = String(it.answer ?? "");
      const optStr = options.length ? `（${options.join(" / ")}）` : "";
      // 共享几何结构：学生卷与教师卷共享完全一致的 slot-w 槽宽与内边距；
      // 教师答案受槽容器限制，禁止任意坐标漂移或覆盖相邻选项。
      const slotHtml =
        `<span class="poly-slot">` +
        `<i class="slot w"></i>` +
        (ctx.isTeacher ? ans(answer, "ans ans-slot") : "") +
        `</span>`;
      cells +=
        `<span class="poly-card">` +
        `<span class="poly-word">${esc(word)}</span>` +
        (options.length ? `<span class="poly-options">${esc(optStr)}</span>` : "") +
        slotHtml +
        `</span>`;
    }
    parts.push(
      new Part(`${pid}-r${r}`, cells, {
        cls: `poly-group cols cols${cols}`,
        group: pid,
        splittable: false, // 严格不可跨栏或跨页拆分：整行选项与词语绑定
        label: `poly-row${r}`,
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

/** 阅读理解：文章整块不可拆页（宁可整段换页），小题支持填空、选择、判断与简答。 */
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
    const hasOptions = Array.isArray(sub.options) && sub.options.length > 0;
    const isChoice = sub.sub_type === "choice" || hasOptions;
    const isJudge = sub.sub_type === "judge";

    let stemHtml = inlineText(String(sub.stem ?? ""), ctx, "line");

    // 选择题或判断题：若 stem 中未含填空槽，在句末留标准答题括号
    let bracketHtml = "";
    if ((isChoice || isJudge) && !sub.stem?.includes("{")) {
      bracketHtml =
        `<span class="choice-bracket">（<i class="slot i"></i>` +
        (ctx.isTeacher && sub.answer ? ans(sub.answer) : "") +
        `）</span>`;
    }

    let optionsHtml = "";
    if (hasOptions) {
      const opts = sub.options.map((opt) => `<span class="opt">${esc(opt)}</span>`).join("");
      optionsHtml = `<div class="sub-options">${opts}</div>`;
    }

    const defaultLines = isChoice || isJudge ? 0 : 1;
    const lines = sub.lines === null || sub.lines === undefined ? defaultLines : Math.max(0, Math.trunc(Number(sub.lines)));
    const answers = sub.answer ? [sub.answer] : [];
    const linesHtml = lines > 0 ? `<div class="wlines">${wlines(lines, answers, ctx, `${pid} 第${no}小题`)}</div>` : "";

    const body =
      `<div class="sub"><div class="subh"><span class="no">（${no}）</span>` +
      `${stemHtml}${bracketHtml}</div>` +
      `${optionsHtml}${linesHtml}</div>`;
    parts.push(new Part(`${pid}-s${no}`, body, { group: pid, splittable: true, label: `sub${no}` }));
  }
  parts.push(tail(pid));
  return parts;
}

/** 看图写话/写话：方格纸，格数与格宽由年级 Profile 决定，支持配图与写作提示。 */
export function compComposition(q, ctx, pid) {
  const rows = Math.trunc(Number(q.rows ?? 6));
  const cols = Math.trunc(ctx.profile.geometry.composition_cols ?? 16);
  const promptHtml = q.prompt ? `<div class="comp-prompt">${esc(q.prompt)}</div>` : "";

  let imgHtml = "";
  if (q.image) {
    const src = typeof q.image === "string" ? q.image : q.image.src ?? "";
    const h = typeof q.image === "object" && q.image.height_mm ? `${q.image.height_mm}mm` : "36mm";
    const cap = typeof q.image === "object" && q.image.caption ? `<div class="comp-img-cap">${esc(q.image.caption)}</div>` : "";
    if (src) {
      imgHtml = `<div class="comp-img-wrap"><img class="comp-img" src="${esc(src)}" style="max-height:${h}" />${cap}</div>`;
    }
  }

  const cells = "<i></i>".repeat(rows * cols);
  return [
    new Part(`${pid}-h`, stemInner(q, ctx) + promptHtml + imgHtml, { cls: "stem", group: pid, role: "q_head", keepNext: true }),
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
    astPart(`${pid}-g`, ast.writing_lines({ count: lines, answers, label: pid }), { group: pid }, ctx),
    tail(pid),
  ];
}

/** 独立选择题：支持单题或小题组，选项根据字符长度自适应 4 栏、2 栏或单栏。 */
export function compChoice(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  const isGroup = Array.isArray(q.items) && q.items.length > 0;

  if (isGroup) {
    ctx.resetSub();
    for (const it of q.items) {
      const no = ctx.nextSub();
      parts.push(
        astPart(
          `${pid}-s${no}`,
          ast.sub_choice({
            number: no,
            children: parseInline(String(it.stem ?? ""), "line"),
            bracket: it.stem?.includes("{") ? null : { answer: it.answer },
            options: it.options ?? null,
          }),
          { group: pid, splittable: true, label: `sub${no}` },
          ctx,
        ),
      );
    }
  } else {
    parts.push(
      astPart(
        `${pid}-opt`,
        ast.choice_standalone({ bracket: q.stem?.includes("{") ? null : { answer: q.answer }, options: q.options ?? null }),
        { group: pid, splittable: false },
        ctx,
      ),
    );
  }

  parts.push(tail(pid));
  return parts;
}

/** 独立判断题：支持单题或小题组，题干右侧对齐标准判断括号槽。 */
export function compJudge(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  const isGroup = Array.isArray(q.items) && q.items.length > 0;

  if (isGroup) {
    ctx.resetSub();
    for (const it of q.items) {
      const no = ctx.nextSub();
      parts.push(
        astPart(
          `${pid}-s${no}`,
          ast.sub_judge({ number: no, children: parseInline(String(it.stem ?? ""), "line"), answer: it.answer }),
          { group: pid, splittable: true, label: `sub${no}` },
          ctx,
        ),
      );
    }
  } else {
    parts.push(
      astPart(`${pid}-j`, ast.judge_standalone(q.answer), { group: pid, splittable: false }, ctx),
    );
  }

  parts.push(tail(pid));
  return parts;
}

/** 笔顺拆解/笔画题：生字田字格 + 笔画数/指定笔顺填空槽。 */
export function compStrokeOrder(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  const items = q.items ?? (q.word ? [q] : []);

  ctx.resetSub();
  for (const it of items) {
    const no = ctx.nextSub();
    const word = String(it.word ?? "");
    let tianziHtml = "";
    if (word) {
      tianziHtml = `<span class="stroke-tzg-wrap"><span class="tzg"><span class="ch">${esc(word)}</span></span></span>`;
    }

    let detailHtml = "";
    if (it.text) {
      detailHtml = `<span class="stroke-text">${inlineText(it.text, ctx, "paren")}</span>`;
    } else {
      const partsArr = [];
      if (it.total_strokes !== undefined && it.total_strokes !== null) {
        partsArr.push(`共有（<i class="slot i"></i>${ctx.isTeacher ? ans(String(it.total_strokes)) : ""}）画`);
      }
      if (it.query) {
        const queryAnswer = it.answer ? String(it.answer) : "";
        partsArr.push(`${esc(it.query)}（<i class="slot w"></i>${ctx.isTeacher ? ans(queryAnswer) : ""}）`);
      } else if (it.answer && it.total_strokes === undefined) {
        partsArr.push(`笔顺是：（<i class="slot p"></i>${ctx.isTeacher ? ans(String(it.answer)) : ""}）`);
      }
      if (it.order) {
        partsArr.push(`笔顺是：（<i class="slot p"></i>${ctx.isTeacher ? ans(String(it.order)) : ""}）`);
      }
      detailHtml = `<span class="stroke-details">${partsArr.join("，")}。</span>`;
    }

    const body =
      `<div class="sub stroke-sub"><div class="stroke-row">` +
      `<span class="no">（${no}）</span>` +
      `${tianziHtml}` +
      `${detailHtml}` +
      `</div></div>`;
    parts.push(new Part(`${pid}-s${no}`, body, { group: pid, splittable: true, label: `sub${no}` }));
  }

  parts.push(tail(pid));
  return parts;
}

/** 拼音/生字连线题：左右双列 + 连线锚点，教师卷以精确矢量 SVG 覆盖红线。 */
export function compPinyinMatch(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];

  // 1. 标准化 pairs 与 items
  let items = [];
  if (Array.isArray(q.items) && q.items.length > 0) {
    items = q.items;
  } else if (Array.isArray(q.pairs) && q.pairs.length > 0) {
    const n = q.pairs.length;
    items = q.pairs.map((p, i) => {
      const rightIdx = (i + 1) % n;
      return {
        left: p.left,
        right: q.pairs[rightIdx].right,
        match_index: (i - 1 + n) % n,
      };
    });
  }

  const rowCount = items.length;
  const rowHeightMm = 12.0;

  // 2. 逐行 HTML 生成（保持 DOM 文本顺序与排版物理顺序一致，确保 PDF 文本提取与契约一致）
  let rowsHtml = "";
  for (let r = 0; r < rowCount; r++) {
    const it = items[r];
    rowsHtml +=
      `<div class="match-row" style="height:${rowHeightMm}mm">` +
      `<span class="match-text match-left-text">${esc(it.left)}</span>` +
      `<span class="match-dot match-left-dot"></span>` +
      `<span class="match-spacer"></span>` +
      `<span class="match-dot match-right-dot"></span>` +
      `<span class="match-text match-right-text">${esc(it.right)}</span>` +
      `</div>`;
  }

  // 3. 教师卷 SVG 连线生成
  let svgHtml = "";
  if (ctx.isTeacher) {
    let lines = "";
    for (let r = 0; r < rowCount; r++) {
      const targetR = items[r].match_index !== undefined ? items[r].match_index : r;
      const y1 = (r * rowHeightMm + rowHeightMm / 2).toFixed(1);
      const y2 = (targetR * rowHeightMm + rowHeightMm / 2).toFixed(1);
      lines += `<line x1="38%" y1="${y1}mm" x2="62%" y2="${y2}mm" stroke="var(--answer)" stroke-width="0.35mm" stroke-linecap="round" />`;
    }
    const totalHeightMm = (rowCount * rowHeightMm).toFixed(1);
    svgHtml =
      `<svg class="match-svg" style="position:absolute;left:0;top:0;width:100%;height:${totalHeightMm}mm;pointer-events:none;overflow:visible">` +
      lines +
      `</svg>`;
  }

  const body =
    `<div class="match-container" style="position:relative;width:100%">` +
    rowsHtml +
    svgHtml +
    `</div>`;

  parts.push(new Part(`${pid}-m`, body, { cls: "match-part", group: pid, splittable: false }));
  parts.push(tail(pid));
  return parts;
}

/** 计算题：列竖式/脱式计算预留作答区，口算单行带答题槽。 */
export function compCalculation(q, ctx, pid) {
  const stem = String(q.stem ?? "");
  const isVertical = /竖式|脱式|递等式/.test(stem);
  if (isVertical) {
    const answers = q.answer ? [String(q.answer)] : [];
    return [
      head(pid, q, ctx),
      astPart(`${pid}-work`, ast.work_box({ count: 3, answers, label: pid }), { group: pid, splittable: false }, ctx),
      tail(pid),
    ];
  }

  return [
    astPart(
      `${pid}-h`,
      ast.q_head({
        number: ctx.nextNo(),
        children: [ast.text(stem), ast.text(" "), ast.blank_slot("oral", String(q.answer ?? ""))],
        score: q.score,
      }),
      { cls: "stem", group: pid, role: "q_head" },
      ctx,
    ),
    tail(pid),
  ];
}

/** 填空题：题干内嵌横线作答槽或括号槽。 */
export function compFillBlank(q, ctx, pid) {
  const rawStem = String(q.stem ?? "");
  let children;
  if (/\{[^{}]*\}/.test(rawStem)) {
    children = parseInline(rawStem, "line");
  } else if (/（\s*）|\(\s*\)/.test(rawStem)) {
    const answers = Array.isArray(q.answer)
      ? q.answer.map(String)
      : String(q.answer ?? "").split(/[、,，]/).map((s) => s.trim());
    children = [];
    rawStem.split(/(?:（\s*）|\(\s*\))/g).forEach((seg, i) => {
      if (i > 0) children.push(ast.blank_slot("line", answers[i - 1] ?? ""));
      if (seg) children.push(ast.text(seg));
    });
  } else {
    children = [ast.text(rawStem)];
  }

  return [
    astPart(
      `${pid}-h`,
      ast.q_head({ number: ctx.nextNo(), children, score: q.score }),
      { cls: "stem", group: pid, role: "q_head" },
      ctx,
    ),
    tail(pid),
  ];
}

/** 解决问题 / 应用题：题干 + 4 行作答书写线。 */
export function compWordProblem(q, ctx, pid) {
  const lines = Math.max(3, Math.trunc(Number(q.lines ?? 4)));
  const answers = q.answer ? [String(q.answer)] : [];
  return [
    head(pid, q, ctx),
    astPart(`${pid}-lines`, ast.writing_lines({ count: lines, answers, label: pid }), { group: pid }, ctx),
    tail(pid),
  ];
}
