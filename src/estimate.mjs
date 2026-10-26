const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60]/u;
const FENCE = /^\s*(?:```|~~~)/;
const EPSILON = 1e-9;

export const ESTIMATOR = Object.freeze({
  method: 'heuristic-v1',
  disclaimer: '估算，不是 tokenizer 精确值',
  asciiCharsPerToken: 4,
  cjkCharsPerToken: 1.2,
  otherCharsPerToken: 3,
  codeWeight: 1.15,
});

function countLine(line, asciiWeight) {
  let ascii = 0;
  let cjk = 0;
  let other = 0;

  for (const char of line) {
    if (CJK.test(char)) cjk += 1;
    else if (char.codePointAt(0) < 0x80) ascii += 1;
    else other += 1;
  }

  return (ascii * asciiWeight) / ESTIMATOR.asciiCharsPerToken +
    cjk / ESTIMATOR.cjkCharsPerToken +
    other / ESTIMATOR.otherCharsPerToken;
}

function withLineBreak(line, index, lines) {
  return index < lines.length - 1 ? `${line}\n` : line;
}

/**
 * Zero-dependency token estimate.
 *
 * kind: "skill" (Markdown, fenced code weighted) or "json" (all ASCII weighted).
 * Returns an integer. It is deliberately an estimate, not a tokenizer.
 */
export function estimateTokens(text, { kind = 'skill' } = {}) {
  if (typeof text !== 'string' || text.length === 0) return 0;

  const lines = text.split('\n');
  let total = 0;

  if (kind === 'json') {
    for (let index = 0; index < lines.length; index += 1) {
      total += countLine(withLineBreak(lines[index], index, lines), ESTIMATOR.codeWeight);
    }
    return Math.ceil(total - EPSILON);
  }

  let inCode = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isFence = FENCE.test(line);
    const weight = inCode || isFence ? ESTIMATOR.codeWeight : 1;
    total += countLine(withLineBreak(line, index, lines), weight);
    if (isFence) inCode = !inCode;
  }

  return Math.ceil(total - EPSILON);
}
