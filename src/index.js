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
  const { results, errors } = await runStreak({ client, subreddits: SUBREDDITS });
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

module.exports = { main, createClient, SUBREDDITS };
