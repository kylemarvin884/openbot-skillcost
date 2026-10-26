import test from 'node:test';
import assert from 'node:assert/strict';
import { ESTIMATOR, estimateTokens } from '../src/estimate.mjs';

test('ASCII text uses roughly 4 characters per token', () => {
  assert.equal(estimateTokens('abcdefgh'), 2);
  assert.equal(estimateTokens('abcdefghi'), 3);
});

test('CJK text uses roughly 1.2 characters per token', () => {
  assert.equal(estimateTokens('你好世界你好世界'), 7);
  assert.equal(estimateTokens('你好世界你好世界你好世界'), 10);
});

test('mixed text combines both rates', () => {
  assert.equal(estimateTokens('abcd你好'), 3);
});

test('empty input costs zero tokens', () => {
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens(null), 0);
});

test('JSON text is weighted above plain text', () => {
  const text = '{"name":"docs","enabled":true}';
  const plain = estimateTokens(text);
  const json = estimateTokens(text, { kind: 'json' });
  assert.ok(json > plain, `${json} should be greater than ${plain}`);
});

test('fenced code in Markdown is weighted above prose', () => {
  const prose = 'a'.repeat(40);
  const code = `\`\`\`\n${'a'.repeat(40)}\n\`\`\``;
  assert.ok(estimateTokens(code) > estimateTokens(prose));
});

test('estimator metadata states that it is not a tokenizer', () => {
  assert.match(ESTIMATOR.disclaimer, /不是 tokenizer 精确值/);
  assert.equal(ESTIMATOR.asciiCharsPerToken, 4);
  assert.equal(ESTIMATOR.cjkCharsPerToken, 1.2);
  assert.equal(ESTIMATOR.codeWeight, 1.15);
});
