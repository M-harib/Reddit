const express = require("express");
const rateLimit = require("express-rate-limit");
const { fetchTrendingStories } = require("../services/redditService");

const router = express.Router();

// ── Rate limiter ──────────────────────────────────────────────────────────────

const redditLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Reddit fetch limit reached. Max 60 per 15 minutes." },
});

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/trending", redditLimiter, async (req, res) => {
  try {
    // Validate subreddit input
    const rawSubreddit = String(req.query.subreddit || "stories").trim();
    if (!/^[a-zA-Z0-9_]{1,21}$/.test(rawSubreddit)) {
      return res.status(400).json({ ok: false, error: "Invalid subreddit name." });
    }
    const subreddit = rawSubreddit;

    // Validate and clamp limit input
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.floor(rawLimit), 1), 25) : 8;

    const stories = await fetchTrendingStories({
      subreddit,
      limit,
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
