# reddit-streak

Daily Reddit upvote streak via GitHub Actions and the official Reddit API (`snoowrap`).

## What it does

Every day at **09:00 UTC**, the workflow runs a Node.js script that:

1. Authenticates against the Reddit API using OAuth (script-type app).
2. Visits each configured subreddit:
   - [r/VintageStory](https://www.reddit.com/r/VintageStory/)
   - [r/DispatchAdHoc](https://www.reddit.com/r/DispatchAdHoc/)
3. Loads the 10 newest posts.
4. Upvotes the first post that is not already upvoted by the authenticated user.
5. Logs every action and reports a per-subreddit summary.

## Required GitHub Secrets

Configure these under `Settings → Secrets and variables → Actions`:

| Secret | Description |
| --- | --- |
| `REDDIT_CLIENT_ID` | Reddit script app client ID |
| `REDDIT_CLIENT_SECRET` | Reddit script app client secret |
| `REDDIT_USERNAME` | Reddit account username |
| `REDDIT_PASSWORD` | Reddit account password |
| `REDDIT_USER_AGENT` | Custom user agent string, e.g. `reddit-streak/1.0 by u/yourname` |

To create a Reddit script app, visit https://www.reddit.com/prefs/apps and select **create another app...** → **script**.

## Running locally

```bash
npm install
export REDDIT_CLIENT_ID=...
export REDDIT_CLIENT_SECRET=...
export REDDIT_USERNAME=...
export REDDIT_PASSWORD=...
export REDDIT_USER_AGENT="reddit-streak/1.0 by u/yourname"
npm start
```

## Running tests

```bash
npm test
```

Tests use the built-in Node.js test runner with mocked Reddit clients — no network access required.

## Project layout

```
.
├── .github/workflows/
│   ├── ci.yml              # runs tests on push / pull request
│   └── reddit-streak.yml   # daily cron job at 09:00 UTC
├── src/
│   ├── index.js            # entry point: builds snoowrap client, runs the streak
│   └── upvoter.js          # core logic (testable, no network deps)
├── test/
│   └── upvoter.test.js     # unit tests with mocked Reddit client
├── package.json
└── README.md
```

## Manual trigger

The workflow supports `workflow_dispatch`, so you can run it on demand from the **Actions** tab without waiting for the daily 09:00 UTC schedule:

1. Open the repository on GitHub.
2. Go to **Actions → Reddit Streak**.
3. Click **Run workflow**, choose the branch, optionally fill in the inputs below, and confirm.

### Manual run inputs

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `dry_run` | boolean | `false` | When enabled, fetches the newest posts and logs which post would be upvoted, without calling the Reddit upvote API. Useful for testing credentials and code without affecting your account history. |
| `subreddits` | string | _empty_ | Comma-separated list of subreddits to target during this manual run (e.g. `VintageStory,DispatchAdHoc`). When left empty, the defaults baked into `src/index.js` are used. |

The same inputs are exposed as the `DRY_RUN` and `SUBREDDITS` environment variables, so you can also run a dry run locally:

```bash
DRY_RUN=true SUBREDDITS=VintageStory npm start
```
