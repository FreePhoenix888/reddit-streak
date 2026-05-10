const DEFAULT_NAV_TIMEOUT_MS = 60_000;
const DEFAULT_POST_TIMEOUT_MS = 30_000;

function buildSubredditUrl(subreddit) {
  const name = String(subreddit).replace(/^\/?r\//, '').replace(/\/+$/g, '');
  return `https://www.reddit.com/r/${name}/new/`;
}

async function findLatestPost({ page, timeoutMs = DEFAULT_POST_TIMEOUT_MS }) {
  await page.waitForSelector('shreddit-post, article', { timeout: timeoutMs });
  return page.locator('shreddit-post, article').first();
}

async function readPostInfo(post) {
  return await post.evaluate((el) => {
    const id =
      el.getAttribute('id') ||
      el.getAttribute('data-post-id') ||
      el.getAttribute('data-fullname') ||
      '';
    const titleEl =
      el.querySelector('[slot="title"]') ||
      el.querySelector('a[slot="full-post-link"]') ||
      el.querySelector('h1, h2, h3');
    const title = (titleEl?.textContent || '').trim();
    return { id, title };
  });
}

async function findUpvoteButton(post) {
  const selectors = [
    'button[upvote]',
    'shreddit-post-vote button[upvote]',
    'button[aria-label="upvote" i]',
    'button[aria-label*="upvote" i]',
  ];
  for (const selector of selectors) {
    const button = post.locator(selector).first();
    if ((await button.count()) > 0) {
      return button;
    }
  }
  return null;
}

async function readUpvoteState(button) {
  return await button.evaluate((el) => {
    const pressed = el.getAttribute('aria-pressed');
    const ariaLabel = el.getAttribute('aria-label') || '';
    return {
      pressed: pressed === 'true',
      ariaLabel,
    };
  });
}

async function isLoggedIn({ page }) {
  return await page.evaluate(() => {
    if (document.cookie.includes('reddit_session=')) return true;
    if (document.querySelector('[data-testid="user-drawer-button"]')) return true;
    if (document.querySelector('shreddit-async-loader[bundlename="user_drawer"]')) return true;
    return false;
  });
}

async function upvoteLatestInSubreddit({
  page,
  subreddit,
  logger = console,
  dryRun = false,
  navTimeoutMs = DEFAULT_NAV_TIMEOUT_MS,
  postTimeoutMs = DEFAULT_POST_TIMEOUT_MS,
}) {
  const url = buildSubredditUrl(subreddit);
  logger.log(`[${subreddit}] navigating to ${url}${dryRun ? ' (dry run)' : ''}`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: navTimeoutMs });

  if (!(await isLoggedIn({ page }))) {
    const message = `Not logged in on Reddit. Provide REDDIT_COOKIES to authenticate.`;
    logger.error(`[${subreddit}] ${message}`);
    throw new Error(message);
  }

  let post;
  try {
    post = await findLatestPost({ page, timeoutMs: postTimeoutMs });
  } catch (error) {
    logger.warn(`[${subreddit}] no posts found: ${error.message}`);
    return { subreddit, status: 'empty' };
  }

  const { id, title } = await readPostInfo(post);
  const button = await findUpvoteButton(post);
  if (!button) {
    const message = `upvote button not found on latest post`;
    logger.error(`[${subreddit}] ${message}`);
    throw new Error(message);
  }

  const state = await readUpvoteState(button);
  if (state.pressed) {
    logger.log(`[${subreddit}] post ${id} "${title}" already upvoted`);
    return { subreddit, status: 'already-upvoted', postId: id, title };
  }

  if (dryRun) {
    logger.log(`[${subreddit}] would upvote post ${id} "${title}" (dry run)`);
    return { subreddit, status: 'dry-run', postId: id, title };
  }

  await button.scrollIntoViewIfNeeded().catch(() => {});
  await button.click();
  logger.log(`[${subreddit}] clicked upvote on post ${id} "${title}"`);

  return { subreddit, status: 'upvoted', postId: id, title };
}

async function runStreak({
  page,
  subreddits,
  logger = console,
  dryRun = false,
  navTimeoutMs = DEFAULT_NAV_TIMEOUT_MS,
  postTimeoutMs = DEFAULT_POST_TIMEOUT_MS,
}) {
  const results = [];
  const errors = [];
  for (const subreddit of subreddits) {
    try {
      const result = await upvoteLatestInSubreddit({
        page,
        subreddit,
        logger,
        dryRun,
        navTimeoutMs,
        postTimeoutMs,
      });
      results.push(result);
    } catch (error) {
      logger.error(`[${subreddit}] error: ${error.message}`);
      results.push({ subreddit, status: 'error', error: error.message });
      errors.push({ subreddit, error });
    }
  }
  return { results, errors };
}

export {
  buildSubredditUrl,
  findLatestPost,
  readPostInfo,
  findUpvoteButton,
  readUpvoteState,
  isLoggedIn,
  upvoteLatestInSubreddit,
  runStreak,
  DEFAULT_NAV_TIMEOUT_MS,
  DEFAULT_POST_TIMEOUT_MS,
};
