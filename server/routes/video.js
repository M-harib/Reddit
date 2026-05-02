const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
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

const tempDir = path.join(__dirname, "..", "..", "temp");
const outputDir = path.join(__dirname, "..", "..", "outputs");
const previewDir = path.join(outputDir, "previews");
const mediaLibraryDir = path.join(__dirname, "..", "..", "media-library");
ensureDir(tempDir);
ensureDir(outputDir);
ensureDir(previewDir);
ensureDir(mediaLibraryDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `${Date.now()}-${file.fieldname}${ext}`);
  },
});

const upload = multer({ storage });

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
  const destination = path.join(mediaLibraryDir, `${prefix}${safeExt}`);
  fs.renameSync(uploadedPath, destination);
  return destination;
}

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

router.post("/preview-voice", async (req, res) => {
  let previewTempPath = null;

  try {
    const voiceId = String(req.body.voiceId || "jessie-style").trim();
    const voiceResolution = await resolveVoiceIdForSynthesis(voiceId);
    const ttsSpeed = Math.max(0.5, Math.min(Number(req.body.ttsSpeed) || 1, 2));
    const ttsPitch = Math.max(-8, Math.min(Number(req.body.ttsPitch) || 0, 6));
    const previewText = (req.body.previewText || "This is a voice preview for your Reddit story video. Let's make this sound amazing.")
      .toString()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);

    if (!previewText) {
      return res.status(400).json({ ok: false, error: "Preview text is required." });
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

      const safeVolume = Math.max(0.05, Math.min(Number(req.body.musicVolume) || 0.15, 1));
      const safeTtsSpeed = Math.max(0.5, Math.min(Number(req.body.ttsSpeed) || 1, 2));
      const safeTtsPitch = Math.max(-8, Math.min(Number(req.body.ttsPitch) || 0, 6));
      const selectedVoiceId = String(req.body.voiceId || "jessie-style").trim();
      const voiceResolution = await resolveVoiceIdForSynthesis(selectedVoiceId);
      const subtitlePreset = String(req.body.subtitlePreset || "classic").toLowerCase();
      const subtitleEffect = String(req.body.subtitleEffect || "none").toLowerCase();
      const id = uuidv4();

      [titleNarrationPath, bodyNarrationPath] = await Promise.all([
        generateNarrationMp3({
          text: title,
          tempDir,
          outputName: `${id}-title`,
          voiceId: voiceResolution.effectiveVoiceId,
          ttsSpeed: safeTtsSpeed,
          ttsPitch: safeTtsPitch,
        }),
        generateNarrationMp3({
          text,
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
        subtitleText: text,
        narrationPath,
        outputPath,
        musicVolume: safeVolume,
        subtitlePreset,
        subtitleEffect,
        subtitleStartOffset: titleDuration,
        subtitleDuration: bodyDuration,
        titleCardTitle: title,
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

module.exports = router;
