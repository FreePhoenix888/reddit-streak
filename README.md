# reddit-streak

Daily Reddit upvote streak via GitHub Actions and a real browser. Reddit's HTTP API is **not** used — every action goes through a Chromium browser controlled by [Playwright](https://playwright.dev/) wrapped in [browser-commander](https://github.com/link-foundation/browser-commander).

## What it does

Every day at **09:00 UTC**, the workflow runs a Node.js script that:

1. Launches a headless Chromium browser via `browser-commander`.
2. Restores the Reddit session from cookies stored as a GitHub secret.
3. Visits each configured subreddit's `/new/` page:
   - [r/VintageStory](https://www.reddit.com/r/VintageStory/new/)
   - [r/DispatchAdHoc](https://www.reddit.com/r/DispatchAdHoc/new/)
4. Locates the latest post and clicks the upvote button if it is not already pressed.
5. Logs every action and reports a per-subreddit summary.

## Required GitHub Secrets

Configure under `Settings → Secrets and variables → Actions`:

| Secret | Description |
| --- | --- |
| `REDDIT_COOKIES` | JSON array of Reddit cookies that authenticates your account (see below). |

### Capturing `REDDIT_COOKIES`

1. Sign in to Reddit in your normal browser.
2. Open DevTools → **Application → Cookies → `https://www.reddit.com`**.
3. Export the cookies for `reddit.com` (any browser extension that exports cookies as JSON works, e.g. EditThisCookie). At minimum, `reddit_session` and `token_v2` are required; exporting all `.reddit.com` cookies is safest.
4. Paste the resulting JSON into the `REDDIT_COOKIES` secret. The expected shape is an array of objects:

   ```json
   [
     { "name": "reddit_session", "value": "...", "domain": ".reddit.com", "path": "/", "secure": true, "sameSite": "None" },
     { "name": "token_v2",        "value": "...", "domain": ".reddit.com", "path": "/", "secure": true, "sameSite": "None" }
   ]
   ```

   A header-style string (`reddit_session=...; token_v2=...`) is also accepted and gets the defaults filled in.

> Do **not** put your Reddit password into the workflow. Reddit aggressively blocks programmatic logins from new IPs (captcha/2FA), so cookie-based session reuse is the only reliable path.

## Running locally

```bash
npm install
npx playwright install chromium
export REDDIT_COOKIES='[{"name":"reddit_session","value":"..."}, ...]'
npm start
```

To watch the browser do its thing locally, run with `HEADED=true`:

```bash
HEADED=true npm start
```

## Running tests

```bash
npm test
```

Tests use the built-in Node.js test runner with mocked Playwright pages — no browser or network access required.

## Project layout

```
.
├── .github/workflows/
│   ├── ci.yml              # runs tests on push / pull request
│   └── reddit-streak.yml   # daily cron job at 09:00 UTC
├── src/
│   ├── index.js            # entry point: launches the browser, restores cookies, runs the streak
│   └── upvoter.js          # core logic (testable, no real browser deps)
├── test/
│   ├── index.test.js       # tests for env parsing and cookie parsing
│   └── upvoter.test.js     # unit tests with a mocked page
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
| `dry_run` | boolean | `false` | When enabled, navigates and locates the post that *would* be upvoted, without actually clicking the upvote button. Useful for testing the session cookie and selectors without affecting your account history. |
| `subreddits` | string | _empty_ | Comma-separated list of subreddits to target during this manual run (e.g. `VintageStory,DispatchAdHoc`). When left empty, the defaults baked into `src/index.js` are used. |

The same inputs are exposed as the `DRY_RUN` and `SUBREDDITS` environment variables, so you can also run a dry run locally:

```bash
DRY_RUN=true SUBREDDITS=VintageStory npm start
```
