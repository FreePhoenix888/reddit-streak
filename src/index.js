const Snoowrap = require('snoowrap');
const { runStreak } = require('./upvoter');

const SUBREDDITS = ['VintageStory', 'DispatchAdHoc'];

function readEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseBool(value) {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function parseSubreddits(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const list = value.split(',').map((name) => name.trim()).filter(Boolean);
  return list.length > 0 ? list : fallback;
}

function createClient() {
  return new Snoowrap({
    userAgent: readEnv('REDDIT_USER_AGENT'),
    clientId: readEnv('REDDIT_CLIENT_ID'),
    clientSecret: readEnv('REDDIT_CLIENT_SECRET'),
    username: readEnv('REDDIT_USERNAME'),
    password: readEnv('REDDIT_PASSWORD')
  });
}

async function main() {
  const client = createClient();
  const dryRun = parseBool(process.env.DRY_RUN);
  const subreddits = parseSubreddits(process.env.SUBREDDITS, SUBREDDITS);
  console.log(`Running on subreddits: ${subreddits.join(', ')}${dryRun ? ' (dry run)' : ''}`);
  const { results, errors } = await runStreak({ client, subreddits, dryRun });
  console.log('Summary:', JSON.stringify(results, null, 2));
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
}

module.exports = { main, createClient, SUBREDDITS, parseBool, parseSubreddits };
