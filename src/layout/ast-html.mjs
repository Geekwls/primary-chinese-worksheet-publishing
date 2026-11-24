/**
 * 布局 AST 解释器：AST 节点 → HTML 字符串。
 *
 * 这是全引擎唯一的 HTML 生成点（题型控制器只产 AST，页面骨架 furniture 除外）。
 * 每个分支都是对历史 atoms.mjs / questions.mjs 生成逻辑的逐字节搬运：
 * class 名、内联样式公式、属性顺序一律不变 —— 保真测试（test/ast-fidelity.test.mjs）
 * 以黄金基线锁定这一点。
 *
 * 双轨语义：节点携带 answer 数据；教师卷差异只在各分支出口用 ans() 包覆盖层，
 * 学生卷同一棵 AST 渲染出零答案的等结构 HTML。
 */
import { esc, splitAnswer } from "../core/text.mjs";

/** 渲染行内标记（如 ~加点字~ 或 [加点字]{.dot}），无标记时直接 esc。 */
function formatInlineMarkers(str) {
  const s = String(str ?? "");
  if (!s.includes("~") && !s.includes("{.dot}")) return esc(s);
  return s
    .replace(/~([^\n~]+)~/g, (_, m) => `<span class="dot">${esc(m)}</span>`)
    .replace(/\[([^\]]+)\]\{\.dot\}/g, (_, m) => `<span class="dot">${esc(m)}</span>`);
}

/** 教师卷答案覆盖层；学生卷出口不调用。 */
function ans(value, cls = "ans") {
  return value ? `<span class="${cls}">${esc(value)}</span>` : "";
}

/** 线槽宽公式：每字 1.18em + 0.5em 余量，下限 2.2em，不设上限（防止长答案被压裁）。 */
const lineWidth = (answer) => Math.max(2.2, [...String(answer ?? "")].length * 1.18 + 0.5);

/** 口算槽宽公式：系数 1.3 与线槽不同（数字含小数点/等号），下限 3.8em。 */
const oralWidth = (answer) => Math.max(3.8, [...String(answer ?? "")].length * 1.3 + 1.2);

/** 行内内容渲染。 */
export function inlineToHtml(children, ctx) {
  return (children ?? []).map((node) => astToHtml(node, ctx)).join("");
}

/** 行内填空槽：按 form 分支，逐字节对应历史上的各槽形态。 */
function blankSlotHtml(node, ctx) {
  const overlay = ctx.isTeacher ? ans(node.answer) : "";
  switch (node.form) {
    case "line": {
      const width = lineWidth(node.answer).toFixed(2);
      return `<span class="brk"><i class="slot" style="width:${width}em"></i>${overlay}</span>`;
    }
    case "paren":
      return `<span class="brk">（<i class="gap"></i>）${overlay}</span>`;
    case "word":
      return `<span class="brk">（<i class="slot w"></i>）${overlay}</span>`;
    case "fixed":
      return `<span class="brk" style="width:var(--slot-w)"><i class="slot" style="width:100%"></i>${overlay}</span>`;
    case "oral": {
      const width = oralWidth(node.answer).toFixed(2);
      return (
        `<span class="calc-oral-slot"><span class="brk" style="width:${width}em;display:inline-block">` +
        `<i class="slot" style="width:100%"></i>${overlay}</span></span>`
      );
    }
    case "bare_num":
      return `（<i class="slot i"></i>${overlay}）`;
    case "bare_word":
      return `（<i class="slot w"></i>${overlay}）`;
    case "bare_stroke":
      return `（<i class="slot p"></i>${overlay}）`;
    case "choice":
      return `<span class="choice-bracket">（<i class="slot i"></i>${overlay}）</span>`;
    case "judge":
      return `<span class="judge-bracket">（<i class="slot i"></i>${overlay}）</span>`;
    default:
      throw new Error(`未知作答槽形态：${node.form}（词汇表见 docs/layout-ast.md）`);
  }
}

/** 圈号序数（①-⑳），超出 20 个时钳制到 ⑳ —— 填空/仿写条目不会这么多。 */
function circled(i) {
  return String.fromCodePoint(0x2460 + Math.min(Math.max(Math.trunc(i), 0), 19));
}

/** 书写横线的裸行序列（不含外层容器），教师卷切行 + 行数不足告警与历史行为一致。 */
function wlineRows(count, answers, ctx, label) {
  const total = Math.max(0, Math.trunc(count));
  const text = (answers ?? []).find((a) => a) ?? "";
  const segs = ctx.isTeacher ? splitAnswer(text, ctx.lineCapacity) : [];
  if (segs.length > total && total > 0) {
    ctx.warnings.push(
      `教师卷答案预计需要 ${segs.length} 行，但只预留 ${total} 行（${label || "题目"}），请增加 lines 或缩短答案`,
    );
  }
  let html = "";
  for (let i = 0; i < total; i++) {
    html += `<div class="wline">${i < segs.length ? ans(segs[i]) : ""}</div>`;
  }
  return html;
}

/** 看拼音写词语词条：拼音逐音节对齐汉字，不对应时整词居中而不猜位置。 */
function pinyinItemHtml(item, ctx) {
  const word = String(item.answer ?? "");
  const syllables = String(item.pinyin ?? "").split(/\s+/).filter(Boolean);
  const chars = [...word];
  let py;
  if (syllables.length === chars.length && syllables.length > 0) {
    py = syllables.map((s) => `<span class="pyc">${esc(s)}</span>`).join("");
  } else {
    py = `<span class="pyc" style="width:calc(var(--tz)*${Math.max(1, chars.length)})">${esc(syllables.join(" "))}</span>`;
  }
  const useSquare = item.box === "square" || ctx.docProfile.pinyin_box === "square";
  const cellCls = useSquare ? "tzg square" : "tzg";
  let cells = "";
  for (const ch of chars) {
    cells += `<span class="${cellCls}">${ctx.isTeacher ? ans(ch) : ""}</span>`;
  }
  return `<div class="pitem"><div class="pyrow">${py}</div><div class="tzrow">${cells}</div></div>`;
}

/** 单个 AST 节点 → HTML。未知节点类型直接抛错，不做"凑合渲染"。 */
export function astToHtml(node, ctx) {
  switch (node.kind) {
    case "text":
      return esc(node.value);

    case "dot":
      return `<span class="dot">${esc(node.value)}</span>`;

    case "inline_pinyin": {
      const pinyin = esc(node.pinyin);
      const chars = [...String(node.answer ?? "")];
      const form = node.form ?? "paren";
      if (form === "tianzi") {
        const syllables = String(node.pinyin ?? "").trim().split(/\s+/).filter(Boolean);
        let cols = "";
        for (let i = 0; i < chars.length; i++) {
          const ch = chars[i];
          const py = syllables[i] ?? (chars.length === 1 ? String(node.pinyin ?? "").trim() : "");
          cols +=
            `<span class="pinline-tz-unit">` +
            `<span class="pinline-py">${esc(py)}</span>` +
            `<span class="tzg">${ctx.isTeacher ? ans(ch) : ""}</span>` +
            `</span>`;
        }
        return `<span class="pinline-tz-group">${cols}</span>`;
      }
      if (form === "square") {
        let cells = "";
        for (const ch of chars) {
          cells += `<span class="sqg">${ctx.isTeacher ? ans(ch) : ""}</span>`;
        }
        return `<span class="pinline-wrap"><span class="pinline-py">${pinyin}</span><span class="sqrow">${cells}</span></span>`;
      }
      const charCount = Math.max(1, chars.length);
      const slotWidth = (charCount * 1.5 + 0.6).toFixed(2);
      const overlay = ctx.isTeacher ? ans(node.answer) : "";
      return `<span class="pinline-wrap"><span class="pinline-py">${pinyin}</span><span class="brk pinline-paren">（<i class="slot" style="width:${slotWidth}em;border-bottom:none;margin:0"></i>${overlay}）</span></span>`;
    }

    case "pinyin_passage":
      return `<div class="pinyin-passage">${inlineToHtml(node.children, ctx).replace(/\n/g, "<br>")}</div>`;

    case "example":
      return `<span class="eg">${esc(node.value)}</span>`;

    case "blank_slot":
      return blankSlotHtml(node, ctx);

    case "q_head": {
      const showScore = (ctx.docProfile.section_score_visible ?? true) && node.score !== null && node.score !== undefined;
      const hint = showScore ? `<span class="pt">（${esc(node.score)}分）</span>` : "";
      const tagsHtml = (node.tags ?? []).map((t) => `<span class="q-tag">${esc(t)}</span>`).join("");
      return `<span class="no">${node.number}.</span> ${tagsHtml}${inlineToHtml(node.children, ctx)}${hint}`;
    }

    case "writing_lines": {
      const rows = wlineRows(node.count, node.answers, ctx, node.label);
      return node.boxed === false ? rows : `<div class="wlines">${rows}</div>`;
    }

    case "work_box":
      return `<div class="calc-work-box">${wlineRows(node.count, node.answers, ctx, node.label)}</div>`;

    case "choice_options": {
      if (!node.options?.length) return "";
      const maxLen = Math.max(...node.options.map((o) => [...String(o).replace(/~([^\n~]+)~/g, "$1").replace(/\[([^\]]+)\]\{\.dot\}/g, "$1")].length));
      const cols = node.cols ?? (maxLen <= 12 ? 4 : maxLen <= 26 ? 2 : 1);
      const optsHtml = node.options.map((opt) => `<span class="opt">${formatInlineMarkers(opt)}</span>`).join("");
      return `<div class="choice-options cols cols${cols}">${optsHtml}</div>`;
    }

    case "sub_options": {
      const opts = (node.options ?? []).map((opt) => `<span class="opt">${formatInlineMarkers(opt)}</span>`).join("");
      return `<div class="sub-options">${opts}</div>`;
    }

    case "sub_plain": {
      const req = esc(node.require ?? "");
      const reqHtml = req ? ` <span class="pt">${req}</span>` : "";
      const bracketHtml = node.bracket ? blankSlotHtml({ kind: "blank_slot", form: "choice", answer: node.bracket.answer }, ctx) : "";
      const cueHtml = node.cue ? '<div class="cue">仿写：</div>' : "";
      const optionsHtml = node.options ? astToHtml({ kind: "sub_options", options: node.options }, ctx) : "";
      const linesHtml = node.lines ? `<div class="wlines">${wlineRows(node.lines.count, node.lines.answers, ctx, node.lines.label)}</div>` : "";
      const scoreHtml =
        (ctx.docProfile.section_score_visible ?? true) && node.score !== null && node.score !== undefined
          ? ` <span class="pt">（${esc(node.score)}分）</span>`
          : "";
      const tagsHtml = (node.tags ?? []).map((t) => `<span class="q-tag">${esc(t)}</span>`).join("");
      return (
        `<div class="sub"><div class="subh"><span class="no">（${node.number}）</span>` +
        `${tagsHtml}${inlineToHtml(node.children, ctx)}${bracketHtml}${reqHtml}${scoreHtml}</div>` +
        `${cueHtml}${optionsHtml}${linesHtml}</div>`
      );
    }

    case "sub_choice": {
      const bracketHtml = node.bracket ? blankSlotHtml({ kind: "blank_slot", form: "choice", answer: node.bracket.answer }, ctx) : "";
      const optionsHtml = node.options ? astToHtml({ kind: "choice_options", options: node.options, cols: node.cols }, ctx) : "";
      return (
        `<div class="sub choice-sub"><div class="subh"><span class="no">（${node.number}）</span>` +
        `${inlineToHtml(node.children, ctx)}${bracketHtml}</div>` +
        `${optionsHtml}</div>`
      );
    }

    case "sub_judge": {
      const bracketHtml = node.answer !== null ? blankSlotHtml({ kind: "blank_slot", form: "judge", answer: node.answer }, ctx) : "";
      return (
        `<div class="sub judge-sub"><div class="judge-row"><span class="no">（${node.number}）</span>` +
        `<span class="judge-stem">${inlineToHtml(node.children, ctx)}</span>` +
        `${bracketHtml}</div></div>`
      );
    }

    case "choice_standalone": {
      const bracketHtml = node.bracket ? blankSlotHtml({ kind: "blank_slot", form: "choice", answer: node.bracket.answer }, ctx) : "";
      const optionsHtml = node.options ? astToHtml({ kind: "choice_options", options: node.options, cols: node.cols }, ctx) : "";
      return `<div class="choice-sub choice-standalone">${bracketHtml}${optionsHtml}</div>`;
    }

    case "judge_standalone": {
      const bracketHtml = blankSlotHtml({ kind: "blank_slot", form: "judge", answer: node.answer }, ctx);
      return `<div class="judge-standalone">${bracketHtml}</div>`;
    }

    case "sub_stroke": {
      let tianziHtml = "";
      if (node.word) {
        tianziHtml = `<span class="stroke-tzg-wrap"><span class="tzg"><span class="ch">${esc(node.word)}</span></span></span>`;
      }
      let detailHtml = "";
      if (node.detail) {
        const inner = inlineToHtml(node.detail.children, ctx);
        detailHtml =
          node.detail.wrap === "text"
            ? `<span class="stroke-text">${inner}</span>`
            : `<span class="stroke-details">${inner}</span>`;
      }
      return (
        `<div class="sub stroke-sub"><div class="stroke-row">` +
        `<span class="no">（${node.number}）</span>` +
        `${tianziHtml}` +
        `${detailHtml}` +
        `</div></div>`
      );
    }

    case "passage": {
      let html = "";
      if (node.title) html += `<div class="passage-title">${esc(node.title)}</div>`;
      if (node.dialogue?.length) {
        for (const line of node.dialogue) {
          html +=
            `<div class="dialogue-line"><span class="dialogue-speaker">${esc(line.speaker)}</span>` +
            `<div class="dialogue-bubble">${formatInlineMarkers(line.text)}</div></div>`;
        }
        return html;
      }
      for (const para of node.paragraphs ?? []) {
        html += `<p class="passage">${formatInlineMarkers(para)}</p>`;
      }
      return html;
    }

    case "pinyin_row":
      return (node.items ?? []).map((item) => pinyinItemHtml(item, ctx)).join("");

    case "similar_cells": {
      let cells = "";
      if (node.layout === "braced") {
        for (const it of node.items ?? []) {
          const chars = it.chars ?? [];
          const answers = it.answers ?? [];
          let pairLines = "";
          chars.forEach((ch, i) => {
            const a = i < answers.length ? answers[i] : "";
            pairLines +=
              `<div class="brace-pair-line">` +
              `<span class="ch">${esc(ch)}</span>` +
              `<span class="brk">（<i class="slot w"></i>）${ctx.isTeacher ? ans(a) : ""}</span>` +
              `</div>`;
          });
          cells +=
            `<div class="similar-brace-col">` +
            `<div class="brace-symbol">` +
            `<svg viewBox="0 0 10 40" class="brace-svg"><path d="M 8 2 Q 2 2 2 10 L 2 17 Q 2 20 0 20 Q 2 20 2 23 L 2 30 Q 2 38 8 38" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>` +
            `</div>` +
            `<div class="brace-pair-items">${pairLines}</div>` +
            `</div>`;
        }
        return `<div class="similar-braced-row">${cells}</div>`;
      }
      for (const it of node.items ?? []) {
        const chars = it.chars ?? [];
        const answers = it.answers ?? [];
        chars.forEach((ch, i) => {
          const a = i < answers.length ? answers[i] : "";
          cells +=
            `<span class="gc"><span class="ch">${esc(ch)}</span>` +
            `<span class="brk">（<i class="slot w"></i>）${ctx.isTeacher ? ans(a) : ""}</span></span>`;
        });
      }
      return cells;
    }

    case "poly_cells": {
      let cells = "";
      for (const it of node.items ?? []) {
        const word = String(it.word ?? "");
        const options = it.options ?? [];
        const answer = String(it.answer ?? "");
        const optStr = options.length ? `（${options.join(" / ")}）` : "";
        const slotHtml =
          `<span class="poly-slot">` +
          `<i class="slot w"></i>` +
          (ctx.isTeacher ? ans(answer, "ans ans-slot") : "") +
          `</span>`;
        cells +=
          `<span class="poly-card">` +
          `<span class="poly-word">${formatInlineMarkers(word)}</span>` +
          (options.length ? `<span class="poly-options">${esc(optStr)}</span>` : "") +
          slotHtml +
          `</span>`;
      }
      return cells;
    }

    case "poly_circle_cells": {
      // 多音字圈选：读音并列，学生在正确读音上画圈；教师卷正确读音带 ring 黑圈。
      let cells = "";
      for (const it of node.items ?? []) {
        const word = String(it.word ?? "");
        const answer = String(it.answer ?? "");
        const readings = (it.options ?? [])
          .map((o) => String(o))
          .map((r) =>
            ctx.isTeacher && r === answer
              ? `<span class="poly-reading ring">${esc(r)}</span>`
              : `<span class="poly-reading">${esc(r)}</span>`,
          )
          .join("");
        cells +=
          `<span class="poly-card"><span class="poly-word">${formatInlineMarkers(word)}</span>` +
          `<span class="poly-choices">${readings}</span></span>`;
      }
      return cells;
    }

    case "pin_annotation": {
      let cols = "";
      for (const it of node.items ?? []) {
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
        cols += `<span class="pin-item">${body}</span>`;
      }
      return cols;
    }

    case "witem_row":
      return (node.items ?? [])
        .map((it) => `<span class="witem">${inlineToHtml(it.children, ctx)}</span>`)
        .join("");

    case "fill_grid": {
      // 填空矩阵：一行 cols 个条目（如"一（艘）军舰"），条目内的括号槽由 children 携带。
      // numbered 时条目前缀圈号（start 保证跨行连续编号）。
      const cols = Math.max(1, Math.trunc(Number(node.cols ?? 2)));
      const cells = (node.items ?? [])
        .map((it, i) => {
          const no = node.numbered
            ? `<span class="fg-no">${circled(node.start + i)}</span>`
            : "";
          return `<span class="witem">${no}${inlineToHtml(it.children, ctx)}</span>`;
        })
        .join("");
      return `<div class="fill-grid cols cols${cols}">${cells}</div>`;
    }

    case "word_pattern": {
      let rows = "";
      for (const it of node.items ?? []) {
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
      return rows;
    }

    case "word_pattern_group": {
      // 词语仿写分类式块：标签加粗 + 示例 + ①② 编号槽同行 —— 单行保证 pdftotext
      // 线性抽取时块内文本连续（P0-03），也让两种词语结构的区别一眼可辨。
      let blocks = "";
      for (const it of node.items ?? []) {
        const label = esc(it.label ?? "");
        const samples = (it.samples ?? []).map((s) => esc(s)).join("、");
        const labelHtml = label ? `<span class="wp-label">${label}</span>` : "";
        const sampleHtml = samples ? `<span class="wp-sample">示例：${samples}</span>` : "";
        const headHtml = `${labelHtml}${sampleHtml}`;
        const slots = (it.answers ?? [])
          .map((a, i) =>
            `<span class="wp-no">${circled(i)}</span>` +
            `<span class="brk" style="width:var(--slot-w)"><i class="slot" style="width:100%"></i>` +
            `${ctx.isTeacher ? ans(a) : ""}</span>`,
          )
          .join("");
        blocks += `<div class="wp-block">${headHtml}${slots}</div>`;
      }
      return blocks;
    }

    case "idiom_grid_cells": {
      // 成语四字方格：每个字一个方格（实字格 + 空白格），明确"每格一字"；no 存在时前缀圈号。
      const cols = node.cols ?? 3;
      const itemsHtml = (node.items ?? [])
        .map((it) => {
          const no = it.no !== undefined && it.no !== null
            ? `<span class="fg-no">${circled(it.no)}</span>`
            : "";
          const cells = (it.cells ?? [])
            .map((c) =>
              c.type === "blank"
                ? `<span class="idiom-cell blank">${ctx.isTeacher ? `<span class="ans">${esc(c.answer)}</span>` : ""}</span>`
                : `<span class="idiom-cell filled">${esc(c.value)}</span>`,
            )
            .join("");
          return `<div class="idiom-item">${no}<span class="idiom-grid">${cells}</span></div>`;
        })
        .join("");
      return `<div class="idiom-grid-wrap cols cols${cols}">${itemsHtml}</div>`;
    }

    case "poem": {
      let blocks = "";
      for (const it of node.items ?? []) {
        const title = it.title ? `<div class="poem-t">${esc(it.title)}</div>` : "";
        const author = it.author ? `<div class="poem-a">${esc(it.author)}</div>` : "";
        const lines = (it.lines ?? [])
          .map((children) => `<div class="poem-l">${inlineToHtml(children, ctx)}</div>`)
          .join("");
        blocks += `<div class="poem">${title}${author}${lines}</div>`;
      }
      return blocks;
    }

    case "composition_grid": {
      const cells = "<i></i>".repeat(node.rows * node.cols);
      return `<div class="zwg" style="grid-template-columns:repeat(${node.cols},var(--zw))">${cells}</div>`;
    }

    case "prompt":
      return `<div class="comp-prompt">${esc(node.value)}</div>`;

    case "image": {
      const h = node.height_mm ? `${node.height_mm}mm` : "36mm";
      const cap = node.caption ? `<div class="comp-img-cap">${esc(node.caption)}</div>` : "";
      if (!node.src) return "";
      return `<div class="comp-img-wrap"><img class="comp-img" src="${esc(node.src)}" style="max-height:${h}" />${cap}</div>`;
    }

    case "table": {
      let html = `<table class="qtable">`;
      if (node.headers?.length) {
        html += `<tr>${node.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
      }
      for (const row of node.rows ?? []) {
        html += `<tr>${row.map((cell) => {
          if (cell && typeof cell === "object" && cell.fill) {
            return `<td>${ctx.isTeacher ? ans(cell.answer) : "&nbsp;"}</td>`;
          }
          return `<td>${esc(cell && typeof cell === "object" ? cell.text : cell)}</td>`;
        }).join("")}</tr>`;
      }
      return `${html}</table>`;
    }

    case "flow_diagram": {
      const nodes = (node.nodes ?? []).map((n) => {
        const inner = n && typeof n === "object" && n.fill
          ? (ctx.isTeacher ? ans(n.answer) : `<span class="fd-blank">&nbsp;&nbsp;&nbsp;&nbsp;</span>`)
          : esc(n && typeof n === "object" ? n.text : n);
        return `<div class="fd-node">${inner}</div>`;
      });
      return `<div class="flow-diagram">${nodes.join(`<div class="fd-arrow">${esc(node.arrow ?? "→")}</div>`)}</div>`;
    }

    case "dialogue": {
      return (node.lines ?? [])
        .map((line) =>
          `<div class="dialogue-line"><span class="dialogue-speaker">${esc(line.speaker)}</span>` +
          `<div class="dialogue-bubble">${esc(line.text)}</div></div>`)
        .join("");
    }

    case "frame_sequence": {
      return `<div class="frame-seq">${(node.frames ?? []).map((f, i) =>
        `<div class="frame-box"><span class="frame-no">第${i + 1}幅</span>` +
        (f.qmark ? `<span class="frame-q">？</span>` : "") +
        (f.caption ? `<span class="frame-caption">${esc(f.caption)}</span>` : "") +
        `</div>`).join("")}</div>`;
    }

    case "match_board": {
      const items = node.rows ?? [];
      const rowCount = items.length;
      const rowHeightMm = 12.0;
      // 保持 DOM 文本顺序与排版物理顺序一致，确保 PDF 文本提取与契约一致
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
      return (
        `<div class="match-container" style="position:relative;width:100%">` +
        rowsHtml +
        svgHtml +
        `</div>`
      );
    }

    default:
      throw new Error(`未知布局 AST 节点：${node?.kind}（词汇表见 docs/layout-ast.md）`);
  }
}
