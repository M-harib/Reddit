const express = require("express");
const { fetchTrendingStories } = require("../services/redditService");

const router = express.Router();

router.get("/trending", async (req, res) => {
  try {
    const stories = await fetchTrendingStories({
      subreddit: req.query.subreddit,
      limit: req.query.limit,
      time: req.query.time,
    });

    res.json({ ok: true, count: stories.length, stories });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "Failed to fetch trending stories from Reddit.",
      detail: error.message,
    });
  }
});

module.exports = router;
