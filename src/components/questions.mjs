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
import { ComponentError } from "../core/errors.mjs";
import * as ast from "../layout/ast.mjs";
import { answerLines, chunks, parseInline } from "./atoms.mjs";
import { astPart } from "./ast-part.mjs";

/** 表格任务：查字典填表/信息卡/积累卡——单元格留空作答，教师卷覆盖答案。 */
export function compTableTask(q, ctx, pid) {
  const table = q.table ?? {};
  if (!table.headers?.length || !table.rows?.length) {
    throw new ComponentError(`表格任务 ${q.question_id ?? ""} 缺少 table.headers 或 table.rows`);
  }
  return [
    astPart(
      `${pid}-h`,
      ast.q_head({ number: ctx.nextNo(), children: [ast.text(q.stem ?? "")], score: q.score }),
      { cls: "stem", group: pid, role: "q_head", keepNext: true },
      ctx,
    ),
    astPart(`${pid}-t`, ast.table({ headers: table.headers, rows: table.rows }), { group: pid, splittable: false }, ctx),
    tail(pid),
  ];
}

/** 流程图/思维导图链：节点留空作答（如小水滴变形、迎客松导图），教师卷覆盖答案。 */
export function compFlowDiagram(q, ctx, pid) {
  if (!q.nodes?.length) {
    throw new ComponentError(`流程图任务 ${q.question_id ?? ""} 缺少 nodes`);
  }
  return [
    astPart(
      `${pid}-h`,
      ast.q_head({ number: ctx.nextNo(), children: [ast.text(q.stem ?? "")], score: q.score }),
      { cls: "stem", group: pid, role: "q_head", keepNext: true },
      ctx,
    ),
    astPart(`${pid}-d`, ast.flow_diagram({ nodes: q.nodes, arrow: q.arrow ?? "→" }), { group: pid, splittable: false }, ctx),
    tail(pid),
  ];
}

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
  const items = q.items ?? [];
  for (const it of items) {
    if (!String(it.answer ?? "")) {
      throw new ComponentError(`看拼音写词语缺少 answer 字段：${JSON.stringify(it)}`);
    }
  }
  const parts = [head(pid, q, ctx)];
  const per = Math.trunc(ctx.profile.layout.pinyin_items_per_row ?? 3);
  chunks(items, per).forEach((group, r) => {
    parts.push(
      astPart(`${pid}-r${r}`, ast.pinyin_row(group), {
        cls: "prow",
        group: pid,
        splittable: true,
        label: `row${r}`,
      }, ctx),
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
    parts.push(
      astPart(`${pid}-r${r}`, ast.similar_cells(group), {
        cls: cols === 1 ? "wrow" : `cols cols${cols}`,
        group: pid,
        splittable: true,
        label: `row${r}`,
      }, ctx),
    );
  });
  parts.push(tail(pid));
  return parts;
}

/** 多音字辨析：双栏或单栏，多音字词语 + 读音选项 + 结构化约束答题槽。
 *  mode: "circle"（v1.3）——读音并列圈选式，降低书写负担，考查重点落在语境辨析。 */
export function compPolyphonic(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  const cols = Math.max(1, Math.trunc(ctx.profile.layout.similar_cols ?? 2));
  const node = q.mode === "circle" ? ast.poly_circle_cells : ast.poly_cells;
  chunks(q.items ?? [], cols).forEach((group, r) => {
    parts.push(
      astPart(`${pid}-r${r}`, node(group), {
        cls: `poly-group cols cols${cols}`,
        group: pid,
        splittable: false, // 严格不可跨栏或跨页拆分：整行选项与词语绑定
        label: `poly-row${r}`,
      }, ctx),
    );
  });
  parts.push(tail(pid));
  return parts;
}

/** 给加点字注音：目标字上方留注音槽，字下方加点。 */
export function compAddPinyin(q, ctx, pid) {
  return [
    head(pid, q, ctx),
    astPart(`${pid}-g`, ast.pin_annotation(q.items ?? []), { cls: "pin-grp", group: pid, splittable: true }, ctx),
    tail(pid),
  ];
}

/** 成语补充：括号空槽横排。
 *  slot: "grid"（v1.4）——四字方格形态：每个字一个方格（实字格 + 空白格），明确"每格一字"。 */
export function compIdiomFill(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];

  if (q.slot === "grid") {
    const items = (q.items ?? []).map((it, i) => ({
      no: i,
      cells: parseInline(String(it.text ?? ""), "paren").flatMap((n) =>
        n.kind === "blank_slot"
          ? [{ type: "blank", answer: String(n.answer ?? "") }]
          : [...String(n.value ?? "")].filter((ch) => ch.trim()).map((ch) => ({ type: "char", value: ch })),
      ),
    }));
    items.forEach((it) => {
      parts.push(
        astPart(`${pid}-g${it.no}`, ast.idiom_grid_cells([it]), {
          cls: "idiom-row",
          group: pid,
          splittable: true,
          label: `idiom${it.no}`,
        }, ctx),
      );
    });
    parts.push(tail(pid));
    return parts;
  }

  const items = (q.items ?? []).map((it) => ({ children: parseInline(String(it.text ?? ""), "paren") }));
  parts.push(
    astPart(`${pid}-g`, ast.witem_row(items), { cls: "wrow", group: pid, splittable: true }, ctx),
  );
  parts.push(tail(pid));
  return parts;
}

/** 词语仿写：例词 + 若干词槽。
 *  style: "block"（v1.4）——分类式块布局：标签 + 示例行 + ①② 编号槽，
 *  让学生一眼看出不同词语结构的区别。 */
export function compWordPattern(q, ctx, pid) {
  if (q.style === "block") {
    // 分类式块逐块全宽单行：加粗标签 + 示例 + ①②槽同行（圈号与槽不可分离）
    return [
      head(pid, q, ctx),
      astPart(`${pid}-b`, ast.word_pattern_group(q.items ?? []), {
        cls: "wp-group",
        group: pid,
        splittable: false,
      }, ctx),
      tail(pid),
    ];
  }
  return [
    head(pid, q, ctx),
    astPart(`${pid}-g`, ast.word_pattern(q.items ?? []), { group: pid }, ctx),
    tail(pid),
  ];
}

/** 古诗填空：按答案字数定宽的横线槽；title 与 author 分层（author 可省略）。 */
export function compPoemFill(q, ctx, pid) {
  const items = (q.items ?? []).map((it) => ({
    title: it.title ?? "",
    author: it.author ?? "",
    lines: (it.lines ?? []).map((line) => parseInline(String(line), "line")),
  }));
  return [
    head(pid, q, ctx),
    astPart(`${pid}-g`, ast.poem(items), { group: pid }, ctx),
    tail(pid),
  ];
}

/** 句子改写/仿写：单栏，小题之间可拆，整行书写线。
 *  scaffold（v1.6）：填空式支架（{} 内为教师卷答案，如 "{弯弯的月亮}像{小船}。"）——
 *  低年级仿写给半成品句框，降低起步难度；有 scaffold 时不再留书写横线。 */
export function compSentenceRewrite(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  ctx.resetSub();
  const items = q.items ?? [];
  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx];
    const no = ctx.nextSub();
    const lines = it.lines === null || it.lines === undefined ? 2 : Math.max(0, Math.trunc(Number(it.lines)));
    const answers = it.answer ? [it.answer] : [];

    // 改写与仿写是两种动作：改写要动原句，仿写是另造一句。
    // 两者若用同一套视觉，学生会把例句当成待改写对象，所以仿写单独给"例句"样式与"仿写："引导。
    const sentence = String(it.sentence ?? "");
    const imitate = it.kind === "imitate" || /^例\s*[：:]/.test(sentence);
    const hasScaffold = /\{[^{}]+\}/.test(String(it.scaffold ?? ""));

    let children;
    let linesNode;
    if (hasScaffold) {
      // 支架形态：例句块（若有）+ 填空句框，答案进槽
      children = [
        ...(sentence && imitate ? [ast.example(sentence)] : sentence ? [ast.text(sentence)] : []),
        ...parseInline(String(it.scaffold), "line"),
      ];
      linesNode = null;
    } else {
      children = imitate ? [ast.example(sentence)] : [ast.text(sentence)];
      linesNode = { count: lines, answers, label: `${pid} 第${no}小题` };
    }

    const keepWhole = q.keep === "whole" && no < items.length;

    parts.push(
      astPart(
        `${pid}-s${no}`,
        ast.sub_plain({
          number: no,
          children,
          require: it.require ?? "",
          // 支架形态下句框即作答区，不再挂「仿写：」引导（避免标签悬空）
          cue: imitate && !hasScaffold,
          lines: linesNode,
          score: it.score ?? null,
        }),
        { group: pid, splittable: true, keepNext: keepWhole, label: `sub${no}` },
        ctx,
      ),
    );
  }
  parts.push(tail(pid));
  return parts;
}

/** 阅读理解：文章整块不可拆页（宁可整段换页），小题支持填空、选择、判断与简答。 */
export function compReading(q, ctx, pid) {
  const passage = q.passage ?? {};
  const parts = [head(pid, q, ctx)];

  const hasPassage = Boolean(passage.title)
    || (passage.paragraphs ?? []).length > 0
    || (passage.dialogue ?? []).length > 0;
  if (hasPassage) {
    parts.push(
      astPart(
        `${pid}-p`,
        ast.passage({
          title: passage.title ?? "",
          paragraphs: passage.paragraphs ?? [],
          dialogue: passage.dialogue ?? null,
        }),
        { group: pid, keepNext: true, splittable: false, label: "passage" },
        ctx,
      ),
    );
  }

  ctx.resetSub();
  const subs = q.subs ?? [];
  for (const sub of subs) {
    const no = ctx.nextSub();
    const hasOptions = Array.isArray(sub.options) && sub.options.length > 0;
    const isChoice = sub.sub_type === "choice" || hasOptions;
    const isJudge = sub.sub_type === "judge";

    // 选择题或判断题：若 stem 中未含填空槽，在句末留标准答题括号
    const bracket = (isChoice || isJudge) && !sub.stem?.includes("{") ? { answer: sub.answer } : null;
    const defaultLines = isChoice || isJudge ? 0 : 1;
    const lines = sub.lines === null || sub.lines === undefined ? defaultLines : Math.max(0, Math.trunc(Number(sub.lines)));
    const answers = sub.answer ? [sub.answer] : [];

    // keep: "whole" —— 材料与小题整链绑定（keepNext 传递），整块放不下才回退逐小题分页
    const keepWhole = q.keep === "whole" && no < subs.length;

    parts.push(
      astPart(
        `${pid}-s${no}`,
        ast.sub_plain({
          number: no,
          children: parseInline(String(sub.stem ?? ""), "line"),
          bracket,
          options: hasOptions ? sub.options : null,
          lines: lines > 0 ? { count: lines, answers, label: `${pid} 第${no}小题` } : null,
          score: sub.score ?? null,
        }),
        { group: pid, splittable: true, keepNext: keepWhole, label: `sub${no}` },
        ctx,
      ),
    );
  }
  parts.push(tail(pid));
  return parts;
}

/** 看图写话/写话：方格纸，格数与格宽由年级 Profile 决定，支持配图与写作提示。 */
export function compComposition(q, ctx, pid) {
  const rows = Math.trunc(Number(q.rows ?? 6));
  const cols = Math.trunc(ctx.profile.geometry.composition_cols ?? 16);

  const headNodes = [ast.q_head({ number: ctx.nextNo(), children: [ast.text(q.stem ?? "")], score: q.score })];
  if (q.prompt) headNodes.push(ast.prompt(q.prompt));
  if (q.frames?.length) headNodes.push(ast.frame_sequence(q.frames));
  if (q.image) {
    const src = typeof q.image === "string" ? q.image : q.image.src ?? "";
    const height_mm = typeof q.image === "object" && q.image.height_mm ? q.image.height_mm : null;
    const caption = typeof q.image === "object" && q.image.caption ? q.image.caption : "";
    headNodes.push(ast.image({ src, height_mm, caption }));
  }

  return [
    astPart(`${pid}-h`, headNodes, { cls: "stem", group: pid, role: "q_head", keepNext: true }, ctx),
    astPart(`${pid}-g`, ast.composition_grid({ rows, cols }), { cls: "zw-wrap", group: pid }, ctx),
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

    let detail = null;
    if (it.text) {
      detail = { wrap: "text", children: parseInline(it.text, "paren") };
    } else {
      const segments = [];
      if (it.total_strokes !== undefined && it.total_strokes !== null) {
        segments.push([ast.text("共有"), ast.blank_slot("bare_num", String(it.total_strokes)), ast.text("画")]);
      }
      if (it.query) {
        const queryAnswer = it.answer ? String(it.answer) : "";
        segments.push([ast.text(it.query), ast.blank_slot("bare_word", queryAnswer)]);
      } else if (it.answer && it.total_strokes === undefined) {
        segments.push([ast.text("笔顺是："), ast.blank_slot("bare_stroke", String(it.answer))]);
      }
      if (it.order) {
        segments.push([ast.text("笔顺是："), ast.blank_slot("bare_stroke", String(it.order))]);
      }
      const children = [];
      segments.forEach((seg, i) => {
        if (i > 0) children.push(ast.text("，"));
        children.push(...seg);
      });
      children.push(ast.text("。"));
      detail = { wrap: "details", children };
    }

    parts.push(
      astPart(`${pid}-s${no}`, ast.sub_stroke({ number: no, word, detail }), {
        group: pid,
        splittable: true,
        label: `sub${no}`,
      }, ctx),
    );
  }

  parts.push(tail(pid));
  return parts;
}

/** 拼音/生字连线题：左右双列 + 连线锚点，教师卷以精确矢量 SVG 覆盖红线。 */
export function compPinyinMatch(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];

  // 标准化 pairs 与 items（pairs 推导为环形错位的 items）
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

  parts.push(astPart(`${pid}-m`, ast.match_board(items), { cls: "match-part", group: pid, splittable: false }, ctx));
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

/** 填空题：题干内嵌横线作答槽或括号槽。
 *  items 矩阵模式（v1.2）：q.items 为条目字符串数组（{} 内为答案），q.cols 决定每行条目数，
 *  每行一个 fill_grid 分部，行间可跨页 —— 适合量词题等"多空并列"的规整布局。 */
export function compFillBlank(q, ctx, pid) {
  const rawStem = String(q.stem ?? "");
  let stem = rawStem;
  let items = q.items;
  let numbered = q.numbered === true;
  let cols = q.cols;

  // 自动解构：若未提供 items，但 stem 内嵌了圈号小题（如 "指导语...①小题...②小题..."）
  // 则自动将指导语与小题分离，避免题干与各小题作答句挤在同一行
  if ((!Array.isArray(items) || !items.length) && /[①-⑳]/.test(rawStem)) {
    const m = rawStem.match(/^([^①-⑳]+)([①-⑳].*)$/s);
    if (m) {
      stem = m[1].trim();
      const rest = m[2];
      const parts = rest.split(/[①-⑳]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        items = parts;
        numbered = true;
        cols = cols ?? 1;
      }
    }
  }

  // 矩阵模式 / 条目模式：条目级 {} 答案，按 cols 装箱成行
  if (Array.isArray(items) && items.length) {
    const parts = [
      astPart(
        `${pid}-h`,
        ast.q_head({ number: ctx.nextNo(), children: [ast.text(stem)], score: q.score }),
        { cls: "stem", group: pid, role: "q_head", keepNext: true },
        ctx,
      ),
    ];
    const finalCols = Math.max(1, Math.trunc(Number(cols ?? 2)));
    const defaultForm = /横线/.test(stem) ? "line" : (finalCols === 1 && !/（|括号/.test(stem) ? "line" : "paren");
    const form = q.form ?? (cols !== undefined && finalCols === 1 && !q.form ? defaultForm : (q.form ?? "paren"));
    const parsedItems = items.map((it) => ({ children: parseInline(String(it ?? ""), form) }));
    const rows = chunks(parsedItems, finalCols);
    rows.forEach((group, r) => {
      parts.push(
        astPart(`${pid}-g${r}`, ast.fill_grid(group, finalCols, { numbered, start: r * finalCols }), {
          cls: `cols cols${finalCols}`,
          group: pid,
          splittable: true,
          keepNext: finalCols > 1 && r < rows.length - 1,
          label: `fillrow${r}`,
        }, ctx),
      );
    });
    parts.push(tail(pid));
    return parts;
  }

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

/** 连词成句：乱序词语 + 书写线，学生排序成句并加标点。 */
export function compSentenceOrder(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  ctx.resetSub();
  for (const it of q.items ?? []) {
    const no = ctx.nextSub();
    const words = (it.words ?? []).map((w) => String(w)).filter(Boolean);
    if (!words.length || !it.answer) {
      throw new ComponentError(`连词成句 ${q.question_id ?? ""} 第 ${no} 小题缺少 words 或 answer`);
    }
    const lines = Math.max(1, Math.trunc(Number(it.lines ?? 1)));
    parts.push(
      astPart(
        `${pid}-s${no}`,
        ast.sub_plain({
          number: no,
          children: [ast.text(words.join("　　"))],
          lines: { count: lines, answers: [String(it.answer)], label: `${pid} 第${no}小题` },
          score: it.score ?? null,
        }),
        { group: pid, splittable: true, label: `sub${no}` },
        ctx,
      ),
    );
  }
  parts.push(tail(pid));
  return parts;
}

/** 标点运用：句中/句末留标点槽（定宽槽），after 为槽后剩余文本（可省略）。 */
export function compPunctuation(q, ctx, pid) {
  const parts = [head(pid, q, ctx)];
  ctx.resetSub();
  for (const it of q.items ?? []) {
    const no = ctx.nextSub();
    const before = String(it.before ?? it.text ?? "");
    if (!before || (it.answer === undefined || it.answer === null || it.answer === "")) {
      throw new ComponentError(`标点运用 ${q.question_id ?? ""} 第 ${no} 小题缺少 text/before 或 answer`);
    }
    const children = [ast.text(before), ast.blank_slot("fixed", String(it.answer))];
    if (it.after !== undefined && it.after !== null && String(it.after) !== "") {
      children.push(ast.text(String(it.after)));
    }
    parts.push(
      astPart(
        `${pid}-s${no}`,
        ast.sub_plain({
          number: no,
          children,
          lines: null,
          score: it.score ?? null,
        }),
        { group: pid, splittable: true, label: `sub${no}` },
        ctx,
      ),
    );
  }
  parts.push(tail(pid));
  return parts;
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
