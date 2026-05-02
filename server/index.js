const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/reddit", redditRoutes);
app.use("/api/video", videoRoutes);
app.use("/outputs", express.static(outputDir));
app.use(express.static(publicDir));

app.get("/health", (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server started on http://localhost:${port}`);
  });
}

module.exports = app;
