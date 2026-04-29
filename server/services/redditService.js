const axios = require("axios");

function normalizePosts(posts) {
  return (posts || [])
    .map((entry) => entry.data)
    .filter((post) => post && !post.stickied)
    .map((post) => {
      const body = (post.selftext || "").trim();
      const fallbackText = (post.title || "").trim();
      const usableText = body.length >= 40 ? body : fallbackText;

      return {
        id: post.id,
        title: post.title,
        author: post.author,
        score: post.score,
        comments: post.num_comments,
        subreddit: post.subreddit,
        selftext: usableText,
        permalink: `https://www.reddit.com${post.permalink}`,
        createdUtc: post.created_utc,
      };
    })
    .filter((post) => post.selftext && post.selftext.length >= 20);
}

async function getRedditListing(url) {
  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      "User-Agent": "reddit-story-video-bot/1.0",
    },
  });

  return response.data?.data?.children || [];
}

function mergeUniqueStories(target, incoming) {
  const seen = new Set(target.map((story) => story.id));
  for (const story of incoming) {
    if (!seen.has(story.id)) {
      target.push(story);
      seen.add(story.id);
    }
  }
}

async function fetchTrendingStories({ subreddit, limit, time }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
  const safeSubreddit = (subreddit || process.env.DEFAULT_SUBREDDIT || "stories").trim();
  const safeTime = time || process.env.DEFAULT_TIME || "day";
  const expandedLimit = Math.max(25, Math.min(safeLimit * 6, 100));
  const stories = [];

  // 1) Try subreddit top + hot so community inputs like "stories" still behave as expected.
  try {
    const topUrl = `https://www.reddit.com/r/${encodeURIComponent(safeSubreddit)}/top.json?t=${safeTime}&limit=${expandedLimit}`;
    const topPosts = normalizePosts(await getRedditListing(topUrl));
    mergeUniqueStories(stories, topPosts);
  } catch (error) {
    // Ignore and continue to hot/search fallback.
  }

  if (stories.length < safeLimit) {
    try {
      const hotUrl = `https://www.reddit.com/r/${encodeURIComponent(safeSubreddit)}/hot.json?limit=${expandedLimit}`;
      const hotPosts = normalizePosts(await getRedditListing(hotUrl));
      mergeUniqueStories(stories, hotPosts);
    } catch (error) {
      // Ignore and continue to search fallback.
    }
  }

  // 2) Fallback to Reddit-wide search when the user enters a topic/keyword (e.g., "aita").
  if (stories.length < safeLimit) {
    try {
      const query = encodeURIComponent(safeSubreddit);
      const searchUrl = `https://www.reddit.com/search.json?q=${query}&sort=top&t=${safeTime}&limit=${expandedLimit}&include_over_18=on`;
      const searchPosts = normalizePosts(await getRedditListing(searchUrl));
      mergeUniqueStories(stories, searchPosts);
    } catch (error) {
      // If this also fails, return whatever we already have.
    }
  }

  return stories.slice(0, safeLimit);
}

module.exports = {
  fetchTrendingStories,
};
