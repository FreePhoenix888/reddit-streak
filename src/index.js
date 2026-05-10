import { writeFile } from 'node:fs/promises';
import { launchBrowser } from 'browser-commander';
import { runStreak } from './upvoter.js';

const SUBREDDITS = ['VintageStory', 'DispatchAdHoc'];
const DEFAULT_COOKIE_OUTPUT_PATH = 'cookies.json';

function parseBool(value) {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseSubreddits(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const list = value.split(',').map((name) => name.trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
}

function parseCookies(raw) {
  if (!raw || typeof raw !== 'string') return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return parseHeaderCookies(trimmed);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('REDDIT_COOKIES JSON must be an array of cookie objects');
  }

  return parsed.map(normalizeCookie);
}

function parseHeaderCookies(header) {
  return header
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf('=');
      if (eq === -1) {
        throw new Error(`Invalid cookie pair: ${part}`);
      }
      const name = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      return normalizeCookie({ name, value });
    });
}

function normalizeCookie(cookie) {
  if (!cookie || typeof cookie !== 'object') {
    throw new Error('Cookie entries must be objects');
  }
  const { name, value } = cookie;
  if (!name || typeof value === 'undefined') {
    throw new Error(`Cookie missing name or value: ${JSON.stringify(cookie)}`);
  }
  const out = {
    name,
    value: String(value),
    domain: cookie.domain || '.reddit.com',
    path: cookie.path || '/',
    secure: cookie.secure !== false,
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: normalizeSameSite(cookie.sameSite),
  };
  if (typeof cookie.expires === 'number' && cookie.expires > 0) {
    out.expires = cookie.expires;
  }
  return out;
}

function normalizeSameSite(value) {
  if (!value) return 'Lax';
  const v = String(value).toLowerCase();
  if (v === 'strict') return 'Strict';
  if (v === 'none' || v === 'no_restriction') return 'None';
  return 'Lax';
}

function serializeCookies(cookies) {
  return JSON.stringify(
    cookies.map((cookie) => {
      const out = {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: Boolean(cookie.secure),
        httpOnly: Boolean(cookie.httpOnly),
        sameSite: normalizeSameSite(cookie.sameSite),
      };
      if (typeof cookie.expires === 'number' && cookie.expires > 0) {
        out.expires = cookie.expires;
      }
      return out;
    }),
    null,
    2
  );
}

async function main() {
  const dryRun = parseBool(process.env.DRY_RUN);
  const subreddits = parseSubreddits(process.env.SUBREDDITS, SUBREDDITS);
  const cookies = parseCookies(process.env.REDDIT_COOKIES);
  const cookieOutputPath = process.env.COOKIE_OUTPUT_PATH || DEFAULT_COOKIE_OUTPUT_PATH;

  console.log(
    `Running on subreddits: ${subreddits.join(', ')}${dryRun ? ' (dry run)' : ''}`
  );

  if (cookies.length === 0) {
    throw new Error(
      'REDDIT_COOKIES is required to authenticate against Reddit (see README.md).'
    );
  }

  const headless = !parseBool(process.env.HEADED);
  const { browser, page } = await launchBrowser({
    engine: 'playwright',
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    await browser.addCookies(cookies);

    const { results, errors } = await runStreak({ page, subreddits, dryRun });
    console.log('Summary:', JSON.stringify(results, null, 2));

    try {
      const refreshed = await browser.cookies();
      const redditCookies = refreshed.filter((cookie) =>
        (cookie.domain || '').includes('reddit.com')
      );
      await writeFile(cookieOutputPath, serializeCookies(redditCookies));
      console.log(
        `Saved ${redditCookies.length} refreshed Reddit cookies to ${cookieOutputPath}`
      );
    } catch (error) {
      console.warn(`Could not save refreshed cookies: ${error.message}`);
    }

    if (errors.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
  }
}

const isDirectInvocation = import.meta.url === `file://${process.argv[1]}`;
if (isDirectInvocation) {
  main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

export {
  main,
  SUBREDDITS,
  DEFAULT_COOKIE_OUTPUT_PATH,
  parseBool,
  parseSubreddits,
  parseCookies,
  normalizeCookie,
  normalizeSameSite,
  serializeCookies,
};
