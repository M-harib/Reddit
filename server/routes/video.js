const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { v4: uuidv4 } = require("uuid");

const {
  generateNarrationMp3,
  getVoiceOptions,
  resolveVoiceIdForSynthesis,
  getAudioDuration,
  concatAudioFiles,
} = require("../services/ttsService");
const { createStoryVideo } = require("../services/videoService");
const { ensureDir } = require("../utils/fs");

const router = express.Router();

// ── Rate limiters ────────────────────────────────────────────────────────────

const videoCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.headers["x-forwarded-for"] || "unknown",
  message: { ok: false, error: "Video generation limit reached. Max 10 per hour per IP." },
});

const previewVoiceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Voice preview limit reached. Max 40 per hour per IP." },
});

const defaultMediaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Default media save limit reached. Max 20 per hour per IP." },
});

// ── Dirs ─────────────────────────────────────────────────────────────────────

const isServerless = Boolean(process.env.VERCEL || process.env.SERVERLESS);
const tempDir = process.env.TEMP_DIR || (isServerless ? path.join("/tmp", "temp") : path.join(__dirname, "..", "..", "temp"));
const outputDir = process.env.OUTPUT_DIR || (isServerless ? path.join("/tmp", "outputs") : path.join(__dirname, "..", "..", "outputs"));
const previewDir = path.join(outputDir, "previews");
const mediaLibraryDir = process.env.MEDIA_LIBRARY_DIR || path.join(__dirname, "..", "..", "media-library");
ensureDir(tempDir);
ensureDir(outputDir);
ensureDir(previewDir);
ensureDir(mediaLibraryDir);

// ── Multer: MIME allowlists, safe filenames, size limits ─────────────────────

const ALLOWED_VIDEO_MIMES = new Set(["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/x-matroska"]);
const ALLOWED_AUDIO_MIMES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/ogg", "audio/aac", "audio/mp4", "audio/x-m4a"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
    const safeExt = ext.match(/^\.[a-z0-9]{1,6}$/) ? ext : ".bin";
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${safeExt}`);
  },
});

function fileFilter(req, file, cb) {
  const mime = file.mimetype || "";
  if (file.fieldname === "gameplay" && !ALLOWED_VIDEO_MIMES.has(mime)) {
    return cb(new Error(`Invalid gameplay file type: ${mime}. Must be a video file.`));
  }
  if (file.fieldname === "music" && !ALLOWED_AUDIO_MIMES.has(mime)) {
    return cb(new Error(`Invalid music file type: ${mime}. Must be an audio file.`));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB max per file
    files: 2,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function findDefaultMediaFile(prefix) {
  const files = fs.readdirSync(mediaLibraryDir);
  const matched = files.find((file) => file.toLowerCase().startsWith(`${prefix}.`));
  return matched ? path.join(mediaLibraryDir, matched) : null;
}

function replaceDefaultMediaFile(prefix, uploadedPath, originalName) {
  const oldPath = findDefaultMediaFile(prefix);
  if (oldPath && fs.existsSync(oldPath)) {
    fs.unlinkSync(oldPath);
  }

  const safeExt = (path.extname(originalName || "") || ".bin").toLowerCase();
  if (isServerless) {
    const destination = path.join("/tmp", `${prefix}${safeExt}`);
    fs.renameSync(uploadedPath, destination);
    return destination;
  }

  const destination = path.join(mediaLibraryDir, `${prefix}${safeExt}`);
  fs.renameSync(uploadedPath, destination);
  return destination;
}

const sanitizeText = (s) => String(s).replace(/<[^>]*>/g, "").replace(/[<>]/g, "").trim();

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/default-media", (req, res) => {
  const gameplayPath = findDefaultMediaFile("default-gameplay");
  const musicPath = findDefaultMediaFile("default-music");

  return res.json({
    ok: true,
    defaults: {
      gameplay: Boolean(gameplayPath),
      music: Boolean(musicPath),
      gameplayFile: gameplayPath ? path.basename(gameplayPath) : null,
      musicFile: musicPath ? path.basename(musicPath) : null,
    },
  });
});

router.post(
  "/default-media",
  defaultMediaLimiter,
  upload.fields([
    { name: "gameplay", maxCount: 1 },
    { name: "music", maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const gameplay = req.files?.gameplay?.[0];
      const music = req.files?.music?.[0];

      if (!gameplay && !music) {
        return res.status(400).json({
          ok: false,
          error: "Upload at least one file (gameplay or music).",
        });
      }

      if (gameplay) {
        replaceDefaultMediaFile("default-gameplay", gameplay.path, gameplay.originalname);
      }

      if (music) {
        replaceDefaultMediaFile("default-music", music.path, music.originalname);
      }

      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "Failed to save default media.",
        detail: error.message,
      });
    } finally {
      const cleanupTargets = [
        req.files?.gameplay?.[0]?.path,
        req.files?.music?.[0]?.path,
      ].filter(Boolean);

      for (const filePath of cleanupTargets) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  }
);

router.get("/voices", (req, res) => {
  res.json({
    ok: true,
    voices: getVoiceOptions(),
  });
});

router.post("/preview-voice", previewVoiceLimiter, async (req, res) => {
  let previewTempPath = null;

  try {
    const voiceId = String(req.body.voiceId || "jessie-style").trim();

    // Validate voiceId
    const validPreviewVoiceIds = new Set(getVoiceOptions().map((v) => v.id));
    if (!validPreviewVoiceIds.has(voiceId)) {
      return res.status(400).json({ ok: false, error: "Invalid voice ID." });
    }

    const voiceResolution = await resolveVoiceIdForSynthesis(voiceId);
    const ttsSpeed = Math.max(0.5, Math.min(Number(req.body.ttsSpeed) || 1, 2));
    const ttsPitch = Math.max(-8, Math.min(Number(req.body.ttsPitch) || 0, 6));
    const previewText = (req.body.previewText || "This is a voice preview for your Reddit story video. Let's make this sound amazing.")
      .toString()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

    if (previewText.length === 0 || previewText.length > 500) {
      return res.status(400).json({ ok: false, error: "Preview text must be 1–500 characters." });
    }

    const id = uuidv4();
    previewTempPath = await generateNarrationMp3({
      text: previewText,
      tempDir,
      outputName: `${id}-preview`,
      voiceId: voiceResolution.effectiveVoiceId,
      ttsSpeed,
      ttsPitch,
    });

    const finalPreviewPath = path.join(previewDir, `${id}.mp3`);
    fs.renameSync(previewTempPath, finalPreviewPath);

    return res.json({
      ok: true,
      previewUrl: `/outputs/previews/${id}.mp3`,
      voiceId,
      effectiveVoiceId: voiceResolution.effectiveVoiceId,
      warning: voiceResolution.warning,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Voice preview failed.",
      detail: error.message,
    });
  } finally {
    if (previewTempPath && fs.existsSync(previewTempPath)) {
      fs.unlinkSync(previewTempPath);
    }
  }
});

router.post(
  "/create",
  videoCreateLimiter,
  upload.fields([
    { name: "gameplay", maxCount: 1 },
    { name: "music", maxCount: 1 },
  ]),
  async (req, res) => {
    let narrationPath = null;
    let titleNarrationPath = null;
    let bodyNarrationPath = null;
    let gameplayPath = null;
    let musicPath = null;
    let gameplay = null;
    let music = null;

    try {
      gameplay = req.files?.gameplay?.[0];
      music = req.files?.music?.[0];

      const defaultGameplayPath = findDefaultMediaFile("default-gameplay");
      const defaultMusicPath = findDefaultMediaFile("default-music");

      gameplayPath = gameplay?.path || defaultGameplayPath;
      musicPath = music?.path || defaultMusicPath;

      if (!gameplayPath || !musicPath) {
        return res.status(400).json({
          ok: false,
          error: "Gameplay and music files are required. Upload once in Default Media Library or provide files now.",
        });
      }

      const title = (req.body.storyTitle || "").trim();
      const text = (req.body.storyText || "").trim();
      if (!title || !text) {
        return res.status(400).json({
          ok: false,
          error: "Story title and text are required.",
        });
      }

      // Validate text inputs
      if (title.length > 500) {
        return res.status(400).json({ ok: false, error: "Story title must be 1–500 characters." });
      }
      if (text.length > 150000) {
        return res.status(400).json({ ok: false, error: "Story text must be 1–150,000 characters." });
      }

      // Validate numeric/enum fields
      const VALID_SPEEDS = new Set(["0.5", "0.75", "1", "1.25", "1.5", "2"]);
      if (!VALID_SPEEDS.has(String(req.body.ttsSpeed))) {
        return res.status(400).json({ ok: false, error: "Invalid TTS speed." });
      }

      const subtitlePreset = String(req.body.subtitlePreset || "classic").toLowerCase();
      const VALID_PRESETS = new Set(["none", "classic", "creator", "cinematic", "viral", "neon", "boxed", "minimal", "comic", "news", "frosted", "burn"]);
      if (!VALID_PRESETS.has(subtitlePreset)) {
        return res.status(400).json({ ok: false, error: "Invalid subtitle preset." });
      }

      const subtitleEffect = String(req.body.subtitleEffect || "none").toLowerCase();
      const VALID_EFFECTS = new Set(["none", "bounce", "fade", "pop", "slide-up", "glow-pulse", "wiggle", "flip-in", "zoom-out", "stamp"]);
      if (!VALID_EFFECTS.has(subtitleEffect)) {
        return res.status(400).json({ ok: false, error: "Invalid subtitle effect." });
      }

      // Sanitize text (strip HTML/script tags)
      const safeTitle = sanitizeText(title).slice(0, 500);
      const safeText = sanitizeText(text).slice(0, 150000);

      const safeVolume = Math.max(0.05, Math.min(Number(req.body.musicVolume) || 0.15, 1));
      const safeTtsSpeed = Math.max(0.5, Math.min(Number(req.body.ttsSpeed) || 1, 2));
      const safeTtsPitch = Math.max(-8, Math.min(Number(req.body.ttsPitch) || 0, 6));
      const selectedVoiceId = String(req.body.voiceId || "jessie-style").trim();

      // Validate voiceId against known voices
      const validVoiceIds = new Set(getVoiceOptions().map((v) => v.id));
      if (!validVoiceIds.has(selectedVoiceId)) {
        return res.status(400).json({ ok: false, error: "Invalid voice ID." });
      }

      const voiceResolution = await resolveVoiceIdForSynthesis(selectedVoiceId);
      const id = uuidv4();

      [titleNarrationPath, bodyNarrationPath] = await Promise.all([
        generateNarrationMp3({
          text: safeTitle,
          tempDir,
          outputName: `${id}-title`,
          voiceId: voiceResolution.effectiveVoiceId,
          ttsSpeed: safeTtsSpeed,
          ttsPitch: safeTtsPitch,
        }),
        generateNarrationMp3({
          text: safeText,
          tempDir,
          outputName: `${id}-body`,
          voiceId: voiceResolution.effectiveVoiceId,
          ttsSpeed: safeTtsSpeed,
          ttsPitch: safeTtsPitch,
        }),
      ]);

      const titleDuration = await getAudioDuration(titleNarrationPath);
      const bodyDuration = await getAudioDuration(bodyNarrationPath);

      narrationPath = path.join(tempDir, `${id}-narration.mp3`);
      await concatAudioFiles({
        segmentPaths: [titleNarrationPath, bodyNarrationPath],
        outputPath: narrationPath,
      });

      const outputPath = path.join(outputDir, `${id}.mp4`);

      await createStoryVideo({
        gameplayPath,
        musicPath,
        subtitleText: safeText,
        narrationPath,
        outputPath,
        musicVolume: safeVolume,
        subtitlePreset,
        subtitleEffect,
        subtitleStartOffset: titleDuration,
        subtitleDuration: bodyDuration,
        titleCardTitle: safeTitle,
        titleCardDuration: titleDuration,
        tempDir,
        outputName: id,
      });

      return res.json({
        ok: true,
        videoUrl: `/outputs/${path.basename(outputPath)}`,
        warning: voiceResolution.warning,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "Video creation failed.",
        detail: error.message,
      });
    } finally {
      const cleanupTargets = [
        narrationPath,
        titleNarrationPath,
        bodyNarrationPath,
        req.files?.gameplay?.[0]?.path,
        req.files?.music?.[0]?.path,
      ].filter(Boolean);

      for (const filePath of cleanupTargets) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    }
  }
);

// ── Multer error handler ──────────────────────────────────────────────────────

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, error: "File too large. Max 500MB for video, 50MB for audio." });
    }
    return res.status(400).json({ ok: false, error: `Upload error: ${err.message}` });
  }
  if (err && err.message && err.message.startsWith("Invalid")) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  next(err);
});

module.exports = router;
