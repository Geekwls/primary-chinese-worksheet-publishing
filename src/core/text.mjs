/** HTML 文本工具：转义 / 反转义 / 去标签。组件层与验收层共用同一套语义。 */

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

/** 等价于 Python html.escape(s, quote=False)：只转义 & < >。 */
export function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>]/g, (ch) => ESCAPES[ch]);
}

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

export function unescapeHtml(value) {
  return String(value ?? "").replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (raw, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : raw;
    }
    return NAMED[body] ?? raw;
  });
}

const TAG_RE = /<[^>]+>/g;

export function stripTags(value) {
  return String(value ?? "").replace(TAG_RE, "");
}

/** 归一化用于文本比对：NFC + 去掉所有空白。 */
export function norm(value) {
  return String(value ?? "").normalize("NFC").replace(/\s+/g, "");
}
