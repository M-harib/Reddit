const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;
const { createAssSubtitles } = require("./subtitleService");

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const DEFAULT_PFP_CANDIDATES = [
  path.join(__dirname, "../../public/assets/reddit-pfp.png"),
  path.join(__dirname, "../../public/assets/reddit-pfp.jpg"),
  path.join(__dirname, "../../public/assets/reddit-pfp.jpeg"),
  path.join(__dirname, "../../public/assets/reddit-pfp.webp"),
  path.join(__dirname, "../../public/assets/reddit-pfp.svg"),
];

function resolveDefaultPfpPath() {
  return DEFAULT_PFP_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || DEFAULT_PFP_CANDIDATES[DEFAULT_PFP_CANDIDATES.length - 1];
}

function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, data) => {
      if (err) return reject(err);
      const duration = data?.format?.duration;
      if (!duration) return reject(new Error("Unable to read narration duration."));
      return resolve(duration);
    });
  });
}

function toFfmpegFilterPath(filePath) {
  return filePath.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escapeXml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapTitleForCard(title, maxChars = 21, maxLines = 4) {
  const cleaned = (title || "").replace(/\s+/g, " ").trim();
  if (!cleaned) return [""];

  const words = cleaned.split(" ");
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars) {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines - 1) break;
    } else {
      current = candidate;
    }
  }

  if (current && lines.length < maxLines) {
    lines.push(current);
  }

  if (lines.length === maxLines && words.join(" ").length > lines.join(" ").length) {
    lines[maxLines - 1] = `${lines[maxLines - 1].slice(0, Math.max(0, maxChars - 1)).trim()}...`;
  }

  return lines;
}

function getDefaultPfpDataUri() {
  try {
    const pfpPath = resolveDefaultPfpPath();
    const raw = fs.readFileSync(pfpPath);
    const ext = path.extname(pfpPath).toLowerCase();
    const mimeByExt = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
    };
    const mime = mimeByExt[ext] || "image/png";
    return `data:${mime};base64,${raw.toString("base64")}`;
  } catch (error) {
    return "";
  }
}

function buildTitleCardSvg({ title, username = "DailyRedditorr", pfpDataUri = "" }) {
  const lines = wrapTitleForCard(title);
  const titleSvgLines = lines
    .map((line, index) => {
      const y = 758 + index * 62;
      return `<tspan x="84" y="${y}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="18" flood-color="#000000" flood-opacity="0.14"/>
    </filter>
    <clipPath id="pfpClip">
      <circle cx="104" cy="626" r="30"/>
    </clipPath>
  </defs>

  <rect x="0" y="0" width="1080" height="1920" fill="transparent"/>

  <g filter="url(#shadow)">
    <rect x="38" y="540" width="688" height="622" rx="44" ry="44" fill="#ffffff" fill-opacity="0.97"/>
  </g>

  <rect x="74" y="596" width="60" height="60" fill="#ff4500" clip-path="url(#pfpClip)"/>
  ${pfpDataUri ? `<image href="${pfpDataUri}" x="74" y="596" width="60" height="60" preserveAspectRatio="xMidYMid slice" clip-path="url(#pfpClip)"/>` : ""}
  <circle cx="104" cy="626" r="30" fill="none" stroke="#ffffff" stroke-width="3"/>

  <text x="154" y="640" font-family="Georgia, 'Times New Roman', serif" font-size="44" font-weight="700" fill="#111111">${escapeXml(username)}</text>

  <g transform="translate(456,602)">
    <circle cx="19" cy="19" r="16" fill="#1d9bf0"/>
    <path d="M12 19.5 L17 24.5 L27 14.5" fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  </g>

  <g fill="#777777" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="700">
    <g transform="translate(88,676)">
      <ellipse cx="13" cy="16" rx="13" ry="8" fill="none" stroke="#777777" stroke-width="2.8"/>
      <circle cx="13" cy="16" r="3.2" fill="#777777"/>
      <text x="34" y="23">999,999</text>
    </g>

    <g transform="translate(88,1082)">
      <path d="M2 14 Q10 4 18 14 Q10 29 10 29 Q10 29 2 14 Z" fill="none" stroke="#777777" stroke-width="2.8" stroke-linejoin="round"/>
      <circle cx="10" cy="16" r="3" fill="#777777"/>
      <text x="34" y="22">999+</text>
    </g>

    <g transform="translate(220,1082)">
      <path d="M2 10 L20 10 L20 3 L32 16 L20 29 L20 22 L2 22 Z" fill="none" stroke="#777777" stroke-width="2.8" stroke-linejoin="round"/>
      <text x="44" y="22">999+</text>
    </g>
  </g>

  <text x="84" y="758" font-family="Arial, Helvetica, sans-serif" font-size="54" font-weight="700" fill="#111111">${titleSvgLines}</text>
</svg>`;
}

async function createTitleCardPng({ tempDir, outputName, title }) {
  const pfpDataUri = getDefaultPfpDataUri();
  const svg = buildTitleCardSvg({ title, pfpDataUri });
  const pngPath = path.join(tempDir, `${outputName}-title-card.png`);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  return { pngPath };
}

function createStoryVideo({
  gameplayPath,
  musicPath,
  subtitleText,
  narrationPath,
  outputPath,
  musicVolume = 0.15,
  subtitlePreset = "classic",
  subtitleEffect = "none",
  subtitleStartOffset = 0,
  subtitleDuration = 0,
  titleCardTitle = "",
  titleCardDuration = 0,
  tempDir,
  outputName,
}) {
  return new Promise(async (resolve, reject) => {
    let subtitlePath = null;
    let titleCardAssets = null;

    try {
      const narrationDuration = await getAudioDuration(narrationPath);
      const safeTitleCardDuration = Math.max(0, Math.min(Number(titleCardDuration) || 0, narrationDuration));
      const safeSubtitleStartOffset = Math.max(0, Math.min(Number(subtitleStartOffset) || 0, narrationDuration));
      const safeSubtitleDuration = Math.max(0, Math.min(Number(subtitleDuration) || 0, narrationDuration - safeSubtitleStartOffset));

      if (subtitlePreset !== "none" && subtitleText && tempDir && outputName && safeSubtitleDuration > 0) {
        subtitlePath = createAssSubtitles({
          text: subtitleText,
          totalDuration: safeSubtitleDuration,
          startOffset: safeSubtitleStartOffset,
          tempDir,
          outputName,
          preset: subtitlePreset,
          effect: subtitleEffect,
        });
      }

      const subtitleFilterPath = subtitlePath ? toFfmpegFilterPath(subtitlePath) : null;

      const titleEnable = `between(t,0,${safeTitleCardDuration.toFixed(2)})`;
      if (!tempDir || !outputName) {
        throw new Error("Missing tempDir or outputName for title-card rendering.");
      }

      titleCardAssets = await createTitleCardPng({
        tempDir,
        outputName,
        title: titleCardTitle,
      });

      const videoFilters = [
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase:flags=bicubic,crop=1080:1920,format=rgba[base]",
        "[1:v]format=rgba[card]",
        `[base][card]overlay=x=0:y=0:enable='${titleEnable}':eof_action=pass[titlecard]`,
      ];

      if (subtitleFilterPath) {
        videoFilters.push(`[titlecard]ass='${subtitleFilterPath}'[vout]`);
      } else {
        videoFilters.push("[titlecard]null[vout]");
      }

      ffmpeg()
        .input(gameplayPath)
        .inputOptions(["-stream_loop", "-1"])
        .input(titleCardAssets.pngPath)
        .inputOptions(["-loop", "1", "-framerate", "30"])
        .input(musicPath)
        .inputOptions(["-stream_loop", "-1"])
        .input(narrationPath)
        .complexFilter([
          ...videoFilters,
          `[2:a]volume=${musicVolume}[bgm]`,
          "[3:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        ])
        .outputOptions([
          "-t",
          String(narrationDuration),
          "-map",
          "[vout]",
          "-map",
          "[aout]",
          "-crf",
          "20",
          "-preset",
          "medium",
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          "-shortest",
        ])
        .videoCodec("libx264")
        .audioCodec("aac")
        .on("start", (commandLine) => {
          console.log("FFMPEG_CMD", commandLine);
        })
        .on("end", () => {
          if (subtitlePath && fs.existsSync(subtitlePath)) {
            fs.unlinkSync(subtitlePath);
          }
          if (titleCardAssets?.pngPath && fs.existsSync(titleCardAssets.pngPath)) {
            fs.unlinkSync(titleCardAssets.pngPath);
          }
          resolve(outputPath);
        })
        .on("error", (err) => {
          if (subtitlePath && fs.existsSync(subtitlePath)) {
            fs.unlinkSync(subtitlePath);
          }
          if (titleCardAssets?.pngPath && fs.existsSync(titleCardAssets.pngPath)) {
            fs.unlinkSync(titleCardAssets.pngPath);
          }
          reject(err);
        })
        .save(outputPath);
    } catch (error) {
      if (subtitlePath && fs.existsSync(subtitlePath)) {
        fs.unlinkSync(subtitlePath);
      }
      if (titleCardAssets?.pngPath && fs.existsSync(titleCardAssets.pngPath)) {
        fs.unlinkSync(titleCardAssets.pngPath);
      }
      reject(error);
    }
  });
}

module.exports = {
  createStoryVideo,
};
