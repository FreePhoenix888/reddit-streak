import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBool,
  parseSubreddits,
  parseCookies,
  normalizeSameSite,
  serializeCookies,
  SUBREDDITS,
} from '../src/index.js';

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

test('parseCookies returns empty array for missing/empty input', () => {
  assert.deepEqual(parseCookies(undefined), []);
  assert.deepEqual(parseCookies(null), []);
  assert.deepEqual(parseCookies(''), []);
  assert.deepEqual(parseCookies('   '), []);
});

test('parseCookies parses JSON array of cookie objects with defaults', () => {
  const json = JSON.stringify([
    { name: 'reddit_session', value: 'abc' },
    {
      name: 'token_v2',
      value: 'xyz',
      domain: '.reddit.com',
      path: '/',
      secure: true,
      sameSite: 'None',
    },
  ]);
  const cookies = parseCookies(json);
  assert.equal(cookies.length, 2);
  assert.equal(cookies[0].name, 'reddit_session');
  assert.equal(cookies[0].value, 'abc');
  assert.equal(cookies[0].domain, '.reddit.com');
  assert.equal(cookies[0].path, '/');
  assert.equal(cookies[0].secure, true);
  assert.equal(cookies[0].sameSite, 'Lax');
  assert.equal(cookies[1].sameSite, 'None');
});

test('parseCookies accepts header-style cookie strings', () => {
  const cookies = parseCookies('reddit_session=abc; token_v2=xyz');
  assert.equal(cookies.length, 2);
  assert.equal(cookies[0].name, 'reddit_session');
  assert.equal(cookies[0].value, 'abc');
  assert.equal(cookies[1].name, 'token_v2');
  assert.equal(cookies[1].value, 'xyz');
});

test('parseCookies rejects malformed JSON arrays', () => {
  assert.throws(() => parseCookies(JSON.stringify({ name: 'x', value: 'y' })), /array/);
  assert.throws(() => parseCookies(JSON.stringify([{ value: 'y' }])), /name/);
});

test('parseCookies coerces sameSite values', () => {
  assert.equal(normalizeSameSite('strict'), 'Strict');
  assert.equal(normalizeSameSite('Strict'), 'Strict');
  assert.equal(normalizeSameSite('none'), 'None');
  assert.equal(normalizeSameSite('no_restriction'), 'None');
  assert.equal(normalizeSameSite('lax'), 'Lax');
  assert.equal(normalizeSameSite(undefined), 'Lax');
  assert.equal(normalizeSameSite(null), 'Lax');
});

test('serializeCookies emits a JSON array of normalized cookie objects', () => {
  const json = serializeCookies([
    {
      name: 'reddit_session',
      value: 'abc',
      domain: '.reddit.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'None',
      expires: 1234567890,
    },
    {
      name: 'token_v2',
      value: 'xyz',
      domain: '.reddit.com',
      path: '/',
    },
  ]);
  const parsed = JSON.parse(json);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'reddit_session');
  assert.equal(parsed[0].sameSite, 'None');
  assert.equal(parsed[0].expires, 1234567890);
  assert.equal(parsed[0].httpOnly, true);
  assert.equal(parsed[1].name, 'token_v2');
  assert.equal(parsed[1].sameSite, 'Lax');
  assert.equal(Object.prototype.hasOwnProperty.call(parsed[1], 'expires'), false);
});

test('serializeCookies output round-trips through parseCookies', () => {
  const original = [
    { name: 'reddit_session', value: 'abc', domain: '.reddit.com', path: '/', sameSite: 'None' },
    { name: 'token_v2', value: 'xyz', domain: '.reddit.com', path: '/', sameSite: 'Lax' },
  ];
  const json = serializeCookies(original);
  const parsed = parseCookies(json);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].name, 'reddit_session');
  assert.equal(parsed[1].name, 'token_v2');
});

test('serializeCookies omits expires when missing or non-positive', () => {
  const json = serializeCookies([
    { name: 'a', value: '1' },
    { name: 'b', value: '2', expires: -1 },
    { name: 'c', value: '3', expires: 0 },
  ]);
  const parsed = JSON.parse(json);
  for (const entry of parsed) {
    assert.equal(Object.prototype.hasOwnProperty.call(entry, 'expires'), false);
  }
});
