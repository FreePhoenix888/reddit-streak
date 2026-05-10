import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSubredditUrl,
  upvoteLatestInSubreddit,
  runStreak,
} from '../src/upvoter.js';

function silentLogger() {
  return { log: () => {}, warn: () => {}, error: () => {} };
}

function makeButton({ pressed = false, ariaLabel = 'upvote' } = {}) {
  let clicks = 0;
  let scrolls = 0;
  let currentPressed = pressed;
  const button = {
    count: async () => 1,
    click: async () => {
      clicks += 1;
      currentPressed = true;
    },
    scrollIntoViewIfNeeded: async () => {
      scrolls += 1;
    },
    evaluate: async (fn) => {
      const fakeEl = {
        getAttribute: (name) => {
          if (name === 'aria-pressed') return currentPressed ? 'true' : 'false';
          if (name === 'aria-label') return ariaLabel;
          return null;
        },
      };
      return fn(fakeEl);
    },
    inspect: () => ({ clicks, scrolls, pressed: currentPressed }),
  };
  return button;
}

function makeMissingButton() {
  return {
    count: async () => 0,
    click: async () => {
      throw new Error('should not click missing button');
    },
  };
}

function makePost({ id = 'post-1', title = 'Hello', button }) {
  return {
    locator: () => ({
      first: () => button,
    }),
    evaluate: async (fn) => {
      const fakeEl = {
        getAttribute: (name) => {
          if (name === 'id') return id;
          return null;
        },
        querySelector: (selector) => {
          if (selector === '[slot="title"]') {
            return { textContent: title };
          }
          return null;
        },
      };
      return fn(fakeEl);
    },
  };
}

function withFakeDocument(fakeDocument, fn) {
  const previous = globalThis.document;
  globalThis.document = fakeDocument;
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previous;
    }
  }
}

function makePage({ post, loggedIn = true, gotoUrls = [] } = {}) {
  return {
    goto: async (url) => {
      gotoUrls.push(url);
    },
    waitForSelector: async () => {
      if (!post) {
        throw new Error('no posts found');
      }
      return null;
    },
    locator: () => ({
      first: () => post,
    }),
    evaluate: async (fn) => {
      const fakeDocument = {
        cookie: loggedIn ? 'reddit_session=abc' : '',
        querySelector: () => null,
      };
      return withFakeDocument(fakeDocument, () => fn());
    },
    gotoUrls,
  };
}

test('buildSubredditUrl normalizes input forms', () => {
  assert.equal(buildSubredditUrl('VintageStory'), 'https://www.reddit.com/r/VintageStory/new/');
  assert.equal(buildSubredditUrl('r/VintageStory'), 'https://www.reddit.com/r/VintageStory/new/');
  assert.equal(buildSubredditUrl('/r/VintageStory'), 'https://www.reddit.com/r/VintageStory/new/');
  assert.equal(buildSubredditUrl('VintageStory/'), 'https://www.reddit.com/r/VintageStory/new/');
});

test('upvotes the latest post when not yet upvoted', async () => {
  const button = makeButton({ pressed: false });
  const post = makePost({ id: 'a', title: 'first', button });
  const gotoUrls = [];
  const page = makePage({ post, gotoUrls });

  const result = await upvoteLatestInSubreddit({
    page,
    subreddit: 'VintageStory',
    logger: silentLogger(),
  });

  assert.equal(result.status, 'upvoted');
  assert.equal(result.postId, 'a');
  assert.equal(result.title, 'first');
  assert.equal(button.inspect().clicks, 1);
  assert.deepEqual(gotoUrls, ['https://www.reddit.com/r/VintageStory/new/']);
});

test('reports already-upvoted when the latest post is already pressed', async () => {
  const button = makeButton({ pressed: true });
  const post = makePost({ id: 'b', button });
  const page = makePage({ post });

  const result = await upvoteLatestInSubreddit({
    page,
    subreddit: 'VintageStory',
    logger: silentLogger(),
  });

  assert.equal(result.status, 'already-upvoted');
  assert.equal(result.postId, 'b');
  assert.equal(button.inspect().clicks, 0);
});

test('returns empty when no posts are found', async () => {
  const page = makePage({ post: null });
  const result = await upvoteLatestInSubreddit({
    page,
    subreddit: 'VintageStory',
    logger: silentLogger(),
  });
  assert.equal(result.status, 'empty');
});

test('throws when not logged in', async () => {
  const button = makeButton();
  const post = makePost({ id: 'c', button });
  const page = makePage({ post, loggedIn: false });

  await assert.rejects(
    upvoteLatestInSubreddit({
      page,
      subreddit: 'VintageStory',
      logger: silentLogger(),
    }),
    /Not logged in/
  );
});

test('dryRun reports the post that would be upvoted without clicking', async () => {
  const button = makeButton({ pressed: false });
  const post = makePost({ id: 'd', title: 'dry', button });
  const page = makePage({ post });

  const result = await upvoteLatestInSubreddit({
    page,
    subreddit: 'VintageStory',
    logger: silentLogger(),
    dryRun: true,
  });

  assert.equal(result.status, 'dry-run');
  assert.equal(result.postId, 'd');
  assert.equal(button.inspect().clicks, 0);
});

test('dryRun still reports already-upvoted posts as already-upvoted', async () => {
  const button = makeButton({ pressed: true });
  const post = makePost({ id: 'e', button });
  const page = makePage({ post });

  const result = await upvoteLatestInSubreddit({
    page,
    subreddit: 'VintageStory',
    logger: silentLogger(),
    dryRun: true,
  });

  assert.equal(result.status, 'already-upvoted');
  assert.equal(button.inspect().clicks, 0);
});

test('throws when upvote button cannot be found on a real post', async () => {
  const post = makePost({ id: 'f', button: makeMissingButton() });
  const page = makePage({ post });

  await assert.rejects(
    upvoteLatestInSubreddit({
      page,
      subreddit: 'VintageStory',
      logger: silentLogger(),
    }),
    /upvote button not found/
  );
});

test('runStreak processes multiple subreddits and collects errors', async () => {
  const goodButton = makeButton({ pressed: false });
  const goodPost = makePost({ id: 'good', button: goodButton });

  const subredditPages = {
    Good: makePage({ post: goodPost }),
    Bad: makePage({ post: null, loggedIn: false }),
  };
  const visits = [];
  const page = {
    goto: async (url) => {
      visits.push(url);
      const which = url.includes('/r/Good/') ? 'Good' : 'Bad';
      page._current = subredditPages[which];
    },
    waitForSelector: async (...args) => page._current.waitForSelector(...args),
    locator: () => page._current.locator(),
    evaluate: async (fn) => page._current.evaluate(fn),
  };

  const { results, errors } = await runStreak({
    page,
    subreddits: ['Good', 'Bad'],
    logger: silentLogger(),
  });

  assert.equal(results.length, 2);
  assert.equal(results[0].status, 'upvoted');
  assert.equal(results[1].status, 'error');
  assert.equal(errors.length, 1);
  assert.equal(visits.length, 2);
});

test('runStreak forwards dryRun to per-subreddit upvotes', async () => {
  const buttonA = makeButton({ pressed: false });
  const buttonB = makeButton({ pressed: false });
  const postA = makePost({ id: '1', button: buttonA });
  const postB = makePost({ id: '2', button: buttonB });

  const subredditPages = {
    A: makePage({ post: postA }),
    B: makePage({ post: postB }),
  };
  const page = {
    goto: async (url) => {
      const which = url.includes('/r/A/') ? 'A' : 'B';
      page._current = subredditPages[which];
    },
    waitForSelector: async (...args) => page._current.waitForSelector(...args),
    locator: () => page._current.locator(),
    evaluate: async (fn) => page._current.evaluate(fn),
  };

  const { results, errors } = await runStreak({
    page,
    subreddits: ['A', 'B'],
    logger: silentLogger(),
    dryRun: true,
  });

  assert.equal(errors.length, 0);
  assert.equal(results.length, 2);
  assert.equal(results[0].status, 'dry-run');
  assert.equal(results[1].status, 'dry-run');
  assert.equal(buttonA.inspect().clicks, 0);
  assert.equal(buttonB.inspect().clicks, 0);
});
