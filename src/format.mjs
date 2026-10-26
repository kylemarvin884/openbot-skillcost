import path from 'node:path';
import { ESTIMATOR } from './estimate.mjs';

const numberFormat = new Intl.NumberFormat('en-US');
const WIDE =
  /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua000-\ua4cf\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u;

function charWidth(char) {
  return WIDE.test(char) ? 2 : 1;
}

export function stringWidth(text) {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return width;
}

function padEnd(text, width) {
  return text + ' '.repeat(Math.max(0, width - stringWidth(text)));
}

function padStart(text, width) {
  return ' '.repeat(Math.max(0, width - stringWidth(text))) + text;
}

export function formatPercent(value) {
  if (!Number.isFinite(value) || value === 0) return '0.00%';
  if (value < 0.01) return '<0.01%';
  return `${value.toFixed(2)}%`;
}

function formatInteger(value) {
  return numberFormat.format(value);
}

export function formatReport(report) {
  const align = ['left', 'left', 'right', 'right', 'right'];
  const headers = ['FILE', 'KIND', 'BYTES', 'EST.TOKENS', '% OF CTX'];
  const rows = report.files.map((file) => [
    file.path,
    file.kind,
    formatInteger(file.bytes),
    formatInteger(file.tokens),
    formatPercent(file.percent),
  ]);
  const totalFiles = report.totalFiles ?? report.files.length;
  const totalRow = [
    `TOTAL (${totalFiles})`,
    '',
    formatInteger(report.totals.bytes),
    formatInteger(report.totals.tokens),
    formatPercent(report.totals.percent),
  ];

  const widths = headers.map((header, index) =>
    Math.max(
      stringWidth(header),
      stringWidth(totalRow[index]),
      ...rows.map((row) => stringWidth(row[index])),
    ),
  );

  const render = (cells) =>
    cells
      .map((cell, index) =>
        align[index] === 'right' ? padStart(cell, widths[index]) : padEnd(cell, widths[index]),
      )
      .join('  ')
      .trimEnd();

  const separatorWidth = widths.reduce((sum, width) => sum + width, 0) + 2 * (widths.length - 1);
  const relativeRoot = path.relative(process.cwd(), report.root);
  const rootLabel = (relativeRoot === '' ? '.' : relativeRoot).split(path.sep).join('/');
  const lines = [
    'skillcost — context cost of skills and MCP configs',
    `root: ${rootLabel}`,
    `context: ${formatInteger(report.contextWindow)} tokens`,
    '',
    render(headers),
    '-'.repeat(separatorWidth),
    ...rows.map(render),
    '-'.repeat(separatorWidth),
    render(totalRow),
    '',
  ];

  if (totalFiles > report.files.length) {
    lines.push(
      `显示前 ${report.files.length} / ${totalFiles} 个文件；合计仍按全部文件计算。`,
      '',
    );
  }

  lines.push(
    `估算，不是 tokenizer 精确值（heuristic estimate, not a tokenizer）。` +
      `ASCII ≈ ${ESTIMATOR.asciiCharsPerToken} 字符/token，CJK ≈ ${ESTIMATOR.cjkCharsPerToken} 字符/token，代码/JSON ×${ESTIMATOR.codeWeight}。`,
  );

  if (report.files.some((file) => file.kind === 'mcp')) {
    lines.push(
      'MCP 只统计 tools / command / args / description 文本；BYTES 是计入文本的字节数，不是配置文件大小。',
    );
  }

  return lines.join('\n');
}
