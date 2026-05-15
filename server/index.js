const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");

const redditRoutes = require("./routes/reddit");
const videoRoutes = require("./routes/video");
const { ensureDir } = require("./utils/fs");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

const publicDir = path.join(__dirname, "..", "public");
const outputDir = path.join(__dirname, "..", "outputs");
const tempDir = path.join(__dirname, "..", "temp");

ensureDir(outputDir);
ensureDir(tempDir);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.disable("x-powered-by");

// CORS — restrict in production
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:3001", "http://localhost:3000"];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || ALLOWED_ORIGINS.includes(origin) || process.env.NODE_ENV !== "production") {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Global rate limit (applies to all /api/* routes)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please slow down." },
});
app.use("/api", globalLimiter);

// Slow down repeated requests to /api
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: (hits) => (hits - 50) * 100,
});
app.use("/api", speedLimiter);

// Request timeout
app.use((req, res, next) => {
  res.setTimeout(120000, () => {
    res.status(503).json({ ok: false, error: "Request timed out." });
  });
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/reddit", redditRoutes);
app.use("/api/video", videoRoutes);
app.use("/outputs", (req, res, next) => {
  // Prevent path traversal
  const reqPath = req.path.replace(/\\/g, "/");
  if (reqPath.includes("..") || reqPath.includes("%2e%2e")) {
    return res.status(403).json({ ok: false, error: "Forbidden." });
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "attachment");
  next();
}, express.static(outputDir, { dotfiles: "deny", etag: false }));
app.use(express.static(publicDir));

app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

// Global error handler — never expose stack traces
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";
  console.error("[ERROR]", err.message, isProd ? "" : err.stack);
  res.status(status).json({
    ok: false,
    error: isProd ? "An internal error occurred." : err.message,
  });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server started on http://localhost:${port}`);
  });
}

module.exports = app;
