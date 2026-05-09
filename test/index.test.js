const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBool, parseSubreddits, SUBREDDITS } = require('../src/index');

test('parseBool returns true for accepted truthy strings', () => {
  for (const value of ['true', 'TRUE', '1', 'yes', 'on', ' True ']) {
    assert.equal(parseBool(value), true, `expected truthy for "${value}"`);
  }
});

test('parseBool returns false for falsy strings, undefined, and other types', () => {
  for (const value of ['false', '0', 'no', 'off', '', undefined, null, 1, true]) {
    assert.equal(parseBool(value), false, `expected false for ${JSON.stringify(value)}`);
  }
});

test('parseSubreddits returns the override list when non-empty', () => {
  assert.deepEqual(parseSubreddits('a,b , c', ['fallback']), ['a', 'b', 'c']);
});

test('parseSubreddits falls back when value is empty, blank, or not a string', () => {
  assert.deepEqual(parseSubreddits('', SUBREDDITS), SUBREDDITS);
  assert.deepEqual(parseSubreddits('  ,  ,', SUBREDDITS), SUBREDDITS);
  assert.deepEqual(parseSubreddits(undefined, SUBREDDITS), SUBREDDITS);
  assert.deepEqual(parseSubreddits(null, SUBREDDITS), SUBREDDITS);
});
