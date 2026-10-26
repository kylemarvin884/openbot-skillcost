import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../src/cli.mjs', import.meta.url));
const workspace = fileURLToPath(new URL('./fixtures/workspace/', import.meta.url));
const emptyFixture = fileURLToPath(new URL('./fixtures/empty/', import.meta.url));

await mkdir(emptyFixture, { recursive: true });

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('--json returns a machine-readable report', () => {
  const child = run(['scan', workspace, '--json']);

  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout);

  assert.equal(report.ok, true);
  assert.equal(report.contextWindow, 200_000);
  assert.equal(report.totalFiles, 3);
  assert.equal(report.shown, 3);
  assert.equal(report.files.length, 3);
  assert.equal(report.totals.files, 3);
  assert.match(report.disclaimer, /不是 tokenizer 精确值/);
  assert.match(report.estimator.disclaimer, /不是 tokenizer 精确值/);
  assert.equal(report.estimator.method, 'heuristic-v1');

  for (const file of report.files) {
    assert.equal(typeof file.path, 'string');
    assert.equal(typeof file.kind, 'string');
    assert.equal(typeof file.bytes, 'number');
    assert.equal(typeof file.tokens, 'number');
    assert.equal(typeof file.percent, 'number');
  }
});

test('--context and --limit affect only the requested parts', () => {
  const child = run([
    'scan',
    workspace,
    '--json',
    '--context',
    '100000',
    '--limit',
    '2',
  ]);

  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout);

  assert.equal(report.contextWindow, 100_000);
  assert.equal(report.files.length, 2);
  assert.equal(report.shown, 2);
  assert.equal(report.totalFiles, 3);
  assert.equal(report.totals.files, 3);
  assert.ok(
    Math.abs(report.files[0].percent - (report.files[0].tokens / 100_000) * 100) < 1e-12,
  );
  assert.ok(
    Math.abs(report.totals.percent - (report.totals.tokens / 100_000) * 100) < 1e-12,
  );
});

test('default table output labels the estimate and totals', () => {
  const child = run(['scan', workspace]);

  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /FILE/);
  assert.match(child.stdout, /KIND/);
  assert.match(child.stdout, /BYTES/);
  assert.match(child.stdout, /EST\.TOKENS/);
  assert.match(child.stdout, /% OF CTX/);
  assert.match(child.stdout, /skills\/context-audit\/SKILL\.md/);
  assert.match(child.stdout, /TOTAL \(3\)/);
  assert.match(child.stdout, /估算，不是 tokenizer 精确值/);
});

test('missing directory exits 1 with E_DIR on stderr', () => {
  const child = run(['scan', path.join(workspace, 'missing'), '--json']);

  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  const error = JSON.parse(child.stderr);
  assert.equal(error.ok, false);
  assert.equal(error.error.code, 'E_DIR');
  assert.match(error.error.message, /目录不存在/);
});

test('no matching files exits 1 with E_NO_MATCH', () => {
  const child = run(['scan', emptyFixture, '--json']);

  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  const error = JSON.parse(child.stderr);
  assert.equal(error.error.code, 'E_NO_MATCH');
  assert.match(error.error.message, /没有找到/);
});

test('invalid JSON exits 1 with E_JSON', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'skillcost-cli-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'mcp.json'), '{ nope', 'utf8');

  const child = run(['scan', directory, '--json']);

  assert.equal(child.status, 1);
  assert.equal(child.stdout, '');
  const error = JSON.parse(child.stderr);
  assert.equal(error.error.code, 'E_JSON');
  assert.match(error.error.message, /mcp\.json/);
});

test('usage errors exit 2', () => {
  const unknown = run(['nope', '--json']);
  assert.equal(unknown.status, 2);
  assert.equal(JSON.parse(unknown.stderr).error.code, 'E_USAGE');

  const missingDir = run(['scan', '--json']);
  assert.equal(missingDir.status, 2);
  assert.equal(JSON.parse(missingDir.stderr).error.code, 'E_USAGE');

  const badContext = run(['scan', workspace, '--json', '--context', '0']);
  assert.equal(badContext.status, 2);
  assert.equal(JSON.parse(badContext.stderr).error.code, 'E_USAGE');
});

test('--limit 0 keeps totals but emits no rows', () => {
  const child = run(['scan', workspace, '--json', '--limit', '0']);

  assert.equal(child.status, 0, child.stderr);
  const report = JSON.parse(child.stdout);
  assert.deepEqual(report.files, []);
  assert.equal(report.shown, 0);
  assert.equal(report.totalFiles, 3);
  assert.equal(report.totals.files, 3);

  const table = run(['scan', workspace, '--limit', '0']);
  assert.equal(table.status, 0, table.stderr);
  assert.match(table.stdout, /TOTAL \(3\)/);
  assert.match(table.stdout, /显示前 0 \/ 3 个文件/);
});

test('--help exits 0 without scanning', () => {
  const child = run(['--help']);

  assert.equal(child.status, 0);
  assert.match(child.stdout, /Usage:/);
  assert.match(child.stdout, /skillcost scan <dir>/);
});
