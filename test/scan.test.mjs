import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyFile, scan } from '../src/scan.mjs';

const workspace = fileURLToPath(new URL('./fixtures/workspace/', import.meta.url));
const emptyFixture = fileURLToPath(new URL('./fixtures/empty/', import.meta.url));

// Git does not track empty directories; recreate it so the test works on a fresh clone.
await mkdir(emptyFixture, { recursive: true });

test('scan finds skills and MCP configs, sorted by estimated tokens', async () => {
  const result = await scan(workspace);

  assert.deepEqual(
    result.files.map((file) => file.path),
    ['skills/context-audit/SKILL.md', 'opencode.json', 'skills/quick.skill.md'],
  );
  assert.deepEqual(
    result.files.map((file) => file.kind),
    ['skill', 'mcp', 'skill'],
  );

  for (let index = 1; index < result.files.length; index += 1) {
    assert.ok(
      result.files[index - 1].tokens >= result.files[index].tokens,
      'files must be sorted by tokens descending',
    );
  }
});

test('every row exposes path, bytes, tokens and percent', async () => {
  const result = await scan(workspace);

  for (const file of result.files) {
    assert.equal(typeof file.path, 'string');
    assert.equal(typeof file.absolutePath, 'string');
    assert.equal(typeof file.bytes, 'number');
    assert.equal(typeof file.fileBytes, 'number');
    assert.equal(typeof file.tokens, 'number');
    assert.equal(typeof file.percent, 'number');
    assert.ok(file.bytes >= 0);
    assert.ok(file.fileBytes >= file.bytes);
    assert.ok(file.tokens > 0);
    assert.ok(Math.abs(file.percent - (file.tokens / 200_000) * 100) < 1e-12);
    assert.ok(!file.path.includes('\\'), 'display paths must use forward slashes');
  }

  assert.equal(result.totals.files, 3);
  assert.equal(
    result.totals.tokens,
    result.files.reduce((sum, file) => sum + file.tokens, 0),
  );
  assert.ok(Math.abs(result.totals.percent - (result.totals.tokens / 200_000) * 100) < 1e-12);
});

test('MCP rows count extracted text, not the whole JSON file', async () => {
  const result = await scan(workspace);
  const mcp = result.files.find((file) => file.kind === 'mcp');

  assert.ok(mcp);
  assert.ok(mcp.bytes < mcp.fileBytes, 'counted MCP text should be smaller than the file');
  assert.ok(mcp.tokens > 0);
});

test('--context changes percentages without changing tokens', async () => {
  const base = await scan(workspace, { contextWindow: 200_000 });
  const wide = await scan(workspace, { contextWindow: 400_000 });

  assert.deepEqual(
    base.files.map((file) => file.tokens),
    wide.files.map((file) => file.tokens),
  );
  for (let index = 0; index < base.files.length; index += 1) {
    assert.ok(
      Math.abs(base.files[index].percent - wide.files[index].percent * 2) < 1e-12,
      'doubling the context window should halve the percentage',
    );
  }
});

test('empty directories fail with E_NO_MATCH', async () => {
  await assert.rejects(scan(emptyFixture), (error) => {
    assert.equal(error.code, 'E_NO_MATCH');
    assert.match(error.message, /没有找到/);
    return true;
  });
});

test('missing directories fail with E_DIR', async () => {
  const missing = path.join(workspace, 'definitely-missing');
  await assert.rejects(scan(missing), (error) => {
    assert.equal(error.code, 'E_DIR');
    assert.match(error.message, /目录不存在/);
    return true;
  });
});

test('invalid MCP JSON fails with E_JSON and the file path', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'skillcost-json-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'opencode.json'), '{ "mcp": ', 'utf8');

  await assert.rejects(scan(directory), (error) => {
    assert.equal(error.code, 'E_JSON');
    assert.match(error.message, /opencode\.json/);
    assert.match(error.message, /JSON 解析失败/);
    return true;
  });
});

test('file classification is case-insensitive on all platforms', () => {
  assert.equal(classifyFile('SKILL.md'), 'skill');
  assert.equal(classifyFile('review.skill.md'), 'skill');
  assert.equal(classifyFile('opencode.json'), 'mcp');
  assert.equal(classifyFile('.mcp.json'), 'mcp');
  assert.equal(classifyFile('mcp.json'), 'mcp');
  assert.equal(classifyFile('mcp-server.json'), null);
  assert.equal(classifyFile('README.md'), null);
});
