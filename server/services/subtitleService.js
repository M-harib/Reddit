const fs = require("fs");
const path = require("path");

const SUBTITLE_STYLES = {
  classic: "Style: Main,Arial,62,&H00FFFFFF,&H000000FF,&H00000000,&H54000000,1,0,0,0,100,100,0,0,1,3,0,5,40,40,80,1",
  creator: "Style: Main,Impact,72,&H00FFFFFF,&H000000FF,&H00000000,&H46000000,1,0,0,0,106,100,2,0,1,5,1,5,40,40,84,1",
  cinematic: "Style: Main,Georgia,60,&H0000DDFF,&H000000FF,&H00222222,&H50000000,1,0,0,0,100,100,1,0,1,4,2,5,46,46,92,1",
  viral: "Style: Main,Arial Black,88,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,110,100,0,0,1,9,0,2,40,40,228,1",
  neon: "Style: Main,Arial Black,68,&H00B8FF6A,&H00FFF2A0,&H003A2900,&H62000000,1,0,0,0,104,100,2,0,1,6,2,5,40,40,88,1",
  boxed: "Style: Main,Segoe UI Semibold,58,&H00FFFFFF,&H000000FF,&H00111111,&H9C0F0F0F,1,0,0,0,100,100,0,0,3,0,0,5,48,48,92,1",
  minimal: "Style: Main,Calibri,54,&H00FFFFFF,&H000000FF,&H00000000,&H32000000,0,0,0,0,100,100,0,0,1,1,0,5,52,52,96,1",
  comic: "Style: Main,Comic Sans MS Bold,66,&H0078F8FF,&H000000FF,&H00081014,&H5A101010,1,0,0,0,108,100,1,0,1,5,1,5,40,40,90,1",
  news: "Style: Main,Franklin Gothic Demi,60,&H00FFFFFF,&H000000FF,&H00121212,&H78000000,1,0,0,0,100,100,0,0,1,3,0,5,40,40,94,1",
  frosted: "Style: Main,Segoe UI Semibold,56,&H00FFFFFF,&H00F2C0A0,&H0023324A,&H884A2F14,0,0,0,0,100,100,0,0,3,1,0,5,46,46,96,1",
  burn: "Style: Main,Arial Black,76,&H0060F8FF,&H0028A0FF,&H00000000,&H44000000,1,0,0,0,112,100,1,0,1,7,0,2,40,40,210,1",
};

function splitIntoSubtitleUnits(text) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];

  const normalized = cleaned.replace(/[\\/]+/g, " ").replace(/\s+/g, " ").trim();
  const words = normalized.split(" ").filter(Boolean);
  const chunks = [];

  // Pair words so each subtitle is 1-2 words for short-form style pacing.
  for (let i = 0; i < words.length; i += 2) {
    chunks.push(words.slice(i, i + 2).join(" "));
  }

  return chunks;
}

function sanitizeSubtitleText(text) {
  return text
    .replace(/[\\/]+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toAssTime(seconds) {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const centis = Math.floor((clamped - Math.floor(clamped)) * 100);
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function getAlignmentTagForPreset(preset) {
  // Use center alignment for all presets so captions appear in the middle
  // of the video rather than at the bottom.
  return "\\an5";
}

function getEffectTag(effect, preset) {
  const alignmentTag = getAlignmentTagForPreset(preset);

  if (effect === "bounce") {
    return `{${alignmentTag}\\fscx100\\fscy100\\t(0,70,\\fscx126\\fscy126)\\t(70,150,\\fscx100\\fscy100)}`;
  }

  if (effect === "fade") {
    return `{${alignmentTag}\\fad(140,140)}`;
  }

  if (effect === "pop") {
    return `{${alignmentTag}\\fscx86\\fscy86\\t(0,80,\\fscx118\\fscy118)\\t(80,170,\\fscx100\\fscy100)}`;
  }

  if (effect === "slide-up") {
    // animate around the vertical center (PlayResY / 2 = 960)
    // start slightly below center and move to slightly above center
    return `{${alignmentTag}\\move(540,1100,540,820,0,180)}`;
  }

  if (effect === "glow-pulse") {
    return `{${alignmentTag}\\bord6\\blur1\\t(0,120,\\bord9\\blur2)\\t(120,240,\\bord6\\blur1)}`;
  }

  if (effect === "wiggle") {
    return `{${alignmentTag}\\frz0\\t(0,45,\\frz-2)\\t(45,90,\\frz2)\\t(90,140,\\frz0)}`;
  }

  if (effect === "flip-in") {
    return `{${alignmentTag}\\fscx0\\fscy100\\t(0,110,\\fscx118)\\t(110,190,\\fscx100)}`;
  }

  if (effect === "zoom-out") {
    return `{${alignmentTag}\\fscx124\\fscy124\\t(0,160,\\fscx100\\fscy100)}`;
  }

  if (effect === "stamp") {
    return `{${alignmentTag}\\frz-8\\fscx130\\fscy130\\t(0,70,\\frz0\\fscx100\\fscy100)}`;
  }

  return `{${alignmentTag}}`;
}

function buildEvents(units, totalDuration, effect, preset, startOffset = 0) {
  if (!units.length || totalDuration <= 0) return [];

  const totalWeight = units.reduce((sum, line) => sum + Math.max(1, line.split(" ").length), 0);
  const effectTag = getEffectTag(effect, preset);

  let cursor = Math.max(0, startOffset);
  return units.map((line, index) => {
    const weight = Math.max(1, line.split(" ").length);
    let segmentDuration = (weight / totalWeight) * totalDuration;

    if (segmentDuration < 0.18) segmentDuration = 0.18;
    const start = cursor;
    let end = start + segmentDuration;

    if (index === units.length - 1 || end > totalDuration) {
      end = totalDuration;
    }

    cursor = end;

    // sanitize text but do not insert escape backslashes for commas —
    // they were appearing verbatim in some renders.
    const safeText = sanitizeSubtitleText(line);
    return `Dialogue: 0,${toAssTime(start)},${toAssTime(end)},Main,,0,0,0,,${effectTag}${safeText}`;
  });
}

function createAssSubtitles({ text, totalDuration, tempDir, outputName, preset, effect, startOffset = 0 }) {
  const units = splitIntoSubtitleUnits(text);
  const styleLine = SUBTITLE_STYLES[preset] || SUBTITLE_STYLES.classic;
  const events = buildEvents(units, totalDuration, effect, preset, Math.max(0, Number(startOffset) || 0));

  const assContent = [
    "[Script Info]",
    "ScriptType: v4.00+",
    "PlayResX: 1080",
    "PlayResY: 1920",
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    styleLine,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");

  const subtitlePath = path.join(tempDir, `${outputName}-captions.ass`);
  fs.writeFileSync(subtitlePath, assContent, "utf8");
  return subtitlePath;
}

module.exports = {
  createAssSubtitles,
};
