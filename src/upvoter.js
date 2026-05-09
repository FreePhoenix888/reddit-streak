const DEFAULT_LOOKAHEAD = 10;

async function upvoteLatestInSubreddit({ client, subreddit, logger = console, lookahead = DEFAULT_LOOKAHEAD, dryRun = false }) {
  const limit = Math.max(1, lookahead);
  logger.log(`[${subreddit}] fetching ${limit} newest posts${dryRun ? ' (dry run)' : ''}`);
  const listing = await client.getSubreddit(subreddit).getNew({ limit });
  const posts = Array.from(listing || []);

  if (posts.length === 0) {
    logger.warn(`[${subreddit}] no posts found`);
    return { subreddit, status: 'empty' };
  }

  for (const post of posts) {
    const id = post.id;
    const title = post.title;
    if (post.likes === true) {
      logger.log(`[${subreddit}] post ${id} "${title}" already upvoted, trying next`);
      continue;
    }
    if (dryRun) {
      logger.log(`[${subreddit}] would upvote post ${id} "${title}" (dry run)`);
      return { subreddit, status: 'dry-run', postId: id, title };
    }
    try {
      await post.upvote();
      logger.log(`[${subreddit}] upvoted post ${id} "${title}"`);
      return { subreddit, status: 'upvoted', postId: id, title };
    } catch (error) {
      logger.error(`[${subreddit}] failed to upvote post ${id}: ${error.message}`);
      throw error;
    }
  }

  logger.log(`[${subreddit}] all ${posts.length} latest posts already upvoted`);
  return { subreddit, status: 'all-upvoted', checked: posts.length };
}

async function runStreak({ client, subreddits, logger = console, lookahead = DEFAULT_LOOKAHEAD, dryRun = false }) {
  const results = [];
  const errors = [];
  for (const subreddit of subreddits) {
    try {
      const result = await upvoteLatestInSubreddit({ client, subreddit, logger, lookahead, dryRun });
      results.push(result);
    } catch (error) {
      logger.error(`[${subreddit}] error: ${error.message}`);
      results.push({ subreddit, status: 'error', error: error.message });
      errors.push({ subreddit, error });
    }
  }
  return { results, errors };
}

module.exports = { upvoteLatestInSubreddit, runStreak, DEFAULT_LOOKAHEAD };
