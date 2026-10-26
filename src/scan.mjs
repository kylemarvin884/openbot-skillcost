import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { SkillcostError } from './errors.mjs';
import { estimateTokens } from './estimate.mjs';
import { extractMcpText } from './mcp.mjs';

const MCP_NAMES = new Set(['opencode.json', '.mcp.json', 'mcp.json']);
const SKIP_DIRS = new Set(['node_modules', '.git']);

export function classifyFile(name) {
  const lower = name.toLowerCase();
  if (lower === 'skill.md' || lower.endsWith('.skill.md')) return 'skill';
  if (MCP_NAMES.has(lower)) return 'mcp';
  return null;
}

function toDisplayPath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join('/');
}

function comparePaths(a, b) {
  if (a.path < b.path) return -1;
  if (a.path > b.path) return 1;
  return 0;
}

async function walk(directory, root, found) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    throw new SkillcostError('E_READ', `无法读取目录：${directory}`, {
      path: directory,
      cause,
    });
  }

  entries.sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });

  for (const entry of entries) {
    // Symlinks are skipped so a scan cannot loop or escape the target tree.
    if (entry.isSymbolicLink()) continue;

    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(absolutePath, root, found);
      continue;
    }

    if (!entry.isFile()) continue;

    const kind = classifyFile(entry.name);
    if (kind === null) continue;

    found.push(await measureFile(absolutePath, root, kind));
  }
}

async function measureFile(absolutePath, root, kind) {
  let buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (cause) {
    throw new SkillcostError('E_READ', `无法读取文件：${toDisplayPath(root, absolutePath)}`, {
      path: absolutePath,
      cause,
    });
  }

  const displayPath = toDisplayPath(root, absolutePath);
  const fileBytes = buffer.length;
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');

  if (kind === 'skill') {
    return {
      path: displayPath,
      absolutePath,
      kind,
      bytes: Buffer.byteLength(text, 'utf8'),
      fileBytes,
      tokens: estimateTokens(text, { kind: 'skill' }),
    };
  }

  let document;
  try {
    document = JSON.parse(text);
  } catch (cause) {
    throw new SkillcostError('E_JSON', `JSON 解析失败：${displayPath}（${cause.message}）`, {
      path: absolutePath,
      cause,
    });
  }

  const mcpText = extractMcpText(document);
  return {
    path: displayPath,
    absolutePath,
    kind,
    bytes: Buffer.byteLength(mcpText, 'utf8'),
    fileBytes,
    tokens: estimateTokens(mcpText, { kind: 'json' }),
  };
}

/**
 * Recursively scan a directory for skill files and MCP configs.
 * Returns files sorted by estimated tokens, descending.
 */
export async function scan(root, { contextWindow = 200_000 } = {}) {
  if (!Number.isSafeInteger(contextWindow) || contextWindow <= 0) {
    throw new SkillcostError('E_USAGE', `contextWindow 必须是正整数，收到：${contextWindow}`);
  }

  const absoluteRoot = path.resolve(root);
  let info;
  try {
    info = await stat(absoluteRoot);
  } catch (cause) {
    const message =
      cause.code === 'ENOENT'
        ? `目录不存在：${root}`
        : `无法访问：${root}（${cause.code ?? cause.message}）`;
    throw new SkillcostError(cause.code === 'ENOENT' ? 'E_DIR' : 'E_READ', message, {
      path: absoluteRoot,
      cause,
    });
  }

  if (!info.isDirectory()) {
    throw new SkillcostError('E_DIR', `不是目录：${root}`, { path: absoluteRoot });
  }

  const found = [];
  await walk(absoluteRoot, absoluteRoot, found);

  if (found.length === 0) {
    throw new SkillcostError(
      'E_NO_MATCH',
      `没有找到 SKILL.md、*.skill.md 或 MCP 配置（opencode.json / .mcp.json / mcp.json）：${root}`,
      { path: absoluteRoot },
    );
  }

  found.sort((a, b) => b.tokens - a.tokens || b.bytes - a.bytes || comparePaths(a, b));

  const files = found.map((file) => ({
    ...file,
    percent: (file.tokens / contextWindow) * 100,
  }));

  const totals = files.reduce(
    (sum, file) => {
      sum.files += 1;
      sum.bytes += file.bytes;
      sum.fileBytes += file.fileBytes;
      sum.tokens += file.tokens;
      return sum;
    },
    { files: 0, bytes: 0, fileBytes: 0, tokens: 0, percent: 0 },
  );
  totals.percent = (totals.tokens / contextWindow) * 100;

  return {
    root: absoluteRoot,
    contextWindow,
    files,
    totals,
  };
}
