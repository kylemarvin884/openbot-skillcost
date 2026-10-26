#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ESTIMATOR } from './estimate.mjs';
import { formatReport } from './format.mjs';
import { SkillcostError, usageError } from './errors.mjs';
import { scan } from './scan.mjs';

const HELP = `skillcost — estimate how much context your skills and MCP configs consume

Usage:
  skillcost scan <dir> [options]
  skillcost --help

Options:
  --json           print machine-readable JSON on stdout
  --context <n>    context window size in tokens (default: 200000)
  --limit <n>      show only the top n files (totals still cover all files)
  -h, --help       show this help

Scans recursively for:
  SKILL.md, *.skill.md
  opencode.json, .mcp.json, mcp.json

MCP configs are parsed as JSON. Only tools / command / args / description text
is counted. Commands are never executed and nothing is sent over the network.

Exit codes:
  0  success
  1  scan error (missing directory, no matches, invalid JSON, read failure)
  2  usage error

Token counts are heuristic estimates, not tokenizer-exact values.
`;

function parseInteger(raw, flag, { fallback, min }) {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) {
    throw usageError(`${flag} 需要一个整数，收到：${raw}`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min) {
    throw usageError(`${flag} 必须是不小于 ${min} 的整数，收到：${raw}`);
  }
  return value;
}

function buildReport(result, limit) {
  const files = limit === null ? result.files : result.files.slice(0, limit);
  return {
    ok: true,
    root: result.root,
    contextWindow: result.contextWindow,
    estimator: ESTIMATOR,
    disclaimer: ESTIMATOR.disclaimer,
    totals: result.totals,
    totalFiles: result.files.length,
    shown: files.length,
    files,
  };
}

function printError(error, jsonMode) {
  const isKnown = error instanceof SkillcostError;
  const code = isKnown ? error.code : 'E_INTERNAL';
  const message = isKnown
    ? error.message
    : error instanceof Error
      ? `未预期错误：${error.message}`
      : `未预期错误：${String(error)}`;
  const details = isKnown ? error.details : {};

  if (jsonMode) {
    const payload = { ok: false, error: { code, message, ...details } };
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  process.stderr.write(`skillcost: ${message}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  let jsonMode = argv.includes('--json');

  try {
    let parsed;
    try {
      parsed = parseArgs({
        args: argv,
        allowPositionals: true,
        strict: true,
        options: {
          json: { type: 'boolean' },
          context: { type: 'string' },
          limit: { type: 'string' },
          help: { type: 'boolean', short: 'h' },
        },
      });
    } catch (cause) {
      throw usageError(`参数错误：${cause.message}\n运行 skillcost --help 查看用法。`);
    }

    const { values, positionals } = parsed;
    jsonMode = Boolean(values.json);

    if (values.help) {
      process.stdout.write(HELP);
      return 0;
    }

    const command = positionals[0];
    if (command === undefined) {
      process.stdout.write(HELP);
      return 0;
    }
    if (command === 'help') {
      process.stdout.write(HELP);
      return 0;
    }
    if (command !== 'scan') {
      throw usageError(`未知命令：${command}\n运行 skillcost --help 查看用法。`);
    }

    if (positionals.length < 2) {
      throw usageError('缺少目录参数。用法：skillcost scan <dir>');
    }
    if (positionals.length > 2) {
      throw usageError(`多余的参数：${positionals.slice(2).join(' ')}`);
    }

    const directory = positionals[1];
    const contextWindow = parseInteger(values.context, '--context', {
      fallback: 200_000,
      min: 1,
    });
    const limit = parseInteger(values.limit, '--limit', {
      fallback: null,
      min: 0,
    });

    const result = await scan(directory, { contextWindow });
    const report = buildReport(result, limit);

    if (jsonMode) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`${formatReport(report)}\n`);
    }
    return 0;
  } catch (error) {
    printError(error, jsonMode);
    return error instanceof SkillcostError && error.code === 'E_USAGE' ? 2 : 1;
  }
}

// Resolve symlinks so `npm install -g` works on Unix, where the global bin is a link.
function isDirectInvocation() {
  if (process.argv[1] === undefined) return false;
  try {
    const entry = realpathSync(path.resolve(process.argv[1]));
    const self = realpathSync(fileURLToPath(import.meta.url));
    return process.platform === 'win32'
      ? entry.toLowerCase() === self.toLowerCase()
      : entry === self;
  } catch {
    return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
  }
}

if (isDirectInvocation()) {
  process.exitCode = await main();
}
