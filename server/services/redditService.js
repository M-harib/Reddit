const axios = require("axios");

async function fetchTrendingStories({ subreddit, limit, time }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 50));
  const safeSubreddit = (subreddit || process.env.DEFAULT_SUBREDDIT || "stories").trim();
  const safeTime = time || process.env.DEFAULT_TIME || "day";

  const url = `https://www.reddit.com/r/${encodeURIComponent(safeSubreddit)}/top.json?t=${safeTime}&limit=${safeLimit}`;

  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      "User-Agent": "reddit-story-video-bot/1.0",
    },
  });

  const posts = response.data?.data?.children || [];

  return posts
    .map((entry) => entry.data)
    .filter((post) => !post.stickied && post.selftext && post.selftext.trim().length > 120)
    .map((post) => ({
      id: post.id,
      title: post.title,
      author: post.author,
      score: post.score,
      comments: post.num_comments,
      subreddit: post.subreddit,
      selftext: post.selftext,
      permalink: `https://www.reddit.com${post.permalink}`,
      createdUtc: post.created_utc,
    }));
}

module.exports = {
  fetchTrendingStories,
};
