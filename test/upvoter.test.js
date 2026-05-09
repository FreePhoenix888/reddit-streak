const test = require('node:test');
const assert = require('node:assert/strict');
const { upvoteLatestInSubreddit, runStreak } = require('../src/upvoter');

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} };
}

function makePost({ id, title = `post-${id}`, likes = null, upvoteImpl }) {
  const post = {
    id,
    title,
    likes,
    upvoted: false,
    upvote: async function () {
      if (upvoteImpl) return upvoteImpl.call(this);
      this.upvoted = true;
      this.likes = true;
      return this;
    }
  };
  return post;
}

function makeClient(map) {
  return {
    getSubreddit(name) {
      const posts = map[name] || [];
      return {
        getNew: async ({ limit }) => posts.slice(0, limit)
      };
    }
  };
}

test('upvotes the latest post when not yet upvoted', async () => {
  const posts = [makePost({ id: 'a' }), makePost({ id: 'b' })];
  const client = makeClient({ test: posts });
  const result = await upvoteLatestInSubreddit({ client, subreddit: 'test', logger: silentLogger() });
  assert.equal(result.status, 'upvoted');
  assert.equal(result.postId, 'a');
  assert.equal(posts[0].upvoted, true);
  assert.equal(posts[1].upvoted, false);
});

test('skips already upvoted latest post and upvotes next available', async () => {
  const posts = [
    makePost({ id: 'a', likes: true }),
    makePost({ id: 'b', likes: null }),
    makePost({ id: 'c', likes: null })
  ];
  const client = makeClient({ test: posts });
  const result = await upvoteLatestInSubreddit({ client, subreddit: 'test', logger: silentLogger() });
  assert.equal(result.status, 'upvoted');
  assert.equal(result.postId, 'b');
  assert.equal(posts[0].upvoted, false);
  assert.equal(posts[1].upvoted, true);
});

test('returns all-upvoted when every fetched post is liked', async () => {
  const posts = Array.from({ length: 10 }, (_, i) => makePost({ id: `p${i}`, likes: true }));
  const client = makeClient({ test: posts });
  const result = await upvoteLatestInSubreddit({ client, subreddit: 'test', logger: silentLogger() });
  assert.equal(result.status, 'all-upvoted');
  assert.equal(result.checked, 10);
});

test('returns empty when subreddit has no posts', async () => {
  const client = makeClient({ test: [] });
  const result = await upvoteLatestInSubreddit({ client, subreddit: 'test', logger: silentLogger() });
  assert.equal(result.status, 'empty');
});

test('respects lookahead limit', async () => {
  const posts = Array.from({ length: 20 }, (_, i) => makePost({ id: `p${i}` }));
  let requestedLimit = null;
  const client = {
    getSubreddit() {
      return {
        getNew: async ({ limit }) => {
          requestedLimit = limit;
          return posts.slice(0, limit);
        }
      };
    }
  };
  await upvoteLatestInSubreddit({ client, subreddit: 'test', logger: silentLogger(), lookahead: 5 });
  assert.equal(requestedLimit, 5);
});

test('propagates errors thrown by upvote', async () => {
  const post = makePost({
    id: 'a',
    upvoteImpl: async function () {
      throw new Error('429 Too Many Requests');
    }
  });
  const client = makeClient({ test: [post] });
  await assert.rejects(
    upvoteLatestInSubreddit({ client, subreddit: 'test', logger: silentLogger() }),
    /429/
  );
});

test('runStreak processes multiple subreddits and collects errors', async () => {
  const okPost = makePost({ id: 'ok' });
  const failPost = makePost({
    id: 'fail',
    upvoteImpl: async () => {
      throw new Error('boom');
    }
  });
  const client = makeClient({ good: [okPost], bad: [failPost] });
  const { results, errors } = await runStreak({
    client,
    subreddits: ['good', 'bad'],
    logger: silentLogger()
  });
  assert.equal(results.length, 2);
  assert.equal(results[0].status, 'upvoted');
  assert.equal(results[1].status, 'error');
  assert.equal(errors.length, 1);
});

test('runStreak continues to next subreddit after one fails', async () => {
  const failPost = makePost({
    id: 'x',
    upvoteImpl: async () => {
      throw new Error('reddit api error');
    }
  });
  const okPost = makePost({ id: 'y' });
  const client = makeClient({ first: [failPost], second: [okPost] });
  const { results } = await runStreak({
    client,
    subreddits: ['first', 'second'],
    logger: silentLogger()
  });
  assert.equal(results[1].status, 'upvoted');
  assert.equal(okPost.upvoted, true);
});
