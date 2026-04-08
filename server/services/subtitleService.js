const fs = require("fs");
const path = require("path");

const SUBTITLE_STYLES = {
  classic: "Style: Main,Arial,62,&H00FFFFFF,&H000000FF,&H00000000,&H54000000,1,0,0,0,100,100,0,0,1,3,0,5,40,40,80,1",
  creator: "Style: Main,Impact,68,&H00FFFFFF,&H000000FF,&H00000000,&H50000000,1,0,0,0,100,100,1,0,1,4,1,5,40,40,80,1",
  cinematic: "Style: Main,Trebuchet MS,62,&H0000F6FF,&H000000FF,&H00000000,&H5A000000,1,0,0,0,100,100,0,0,1,3,1,5,40,40,80,1",
  viral: "Style: Main,Arial Black,86,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,8,0,2,40,40,230,1",
  neon: "Style: Main,Arial Black,66,&H00FFFF66,&H0000FFFF,&H00402200,&H66000000,1,0,0,0,100,100,1,0,1,5,2,5,40,40,84,1",
  boxed: "Style: Main,Segoe UI,58,&H00FFFFFF,&H000000FF,&H00000000,&H8C000000,1,0,0,0,100,100,0,0,3,0,0,5,40,40,88,1",
  minimal: "Style: Main,Calibri,56,&H00FFFFFF,&H000000FF,&H00000000,&H40000000,0,0,0,0,100,100,0,0,1,2,0,5,40,40,86,1",
  comic: "Style: Main,Komika Axis,64,&H0078F8FF,&H000000FF,&H000A1018,&H5A101010,1,0,0,0,100,100,0,0,1,4,1,5,40,40,88,1",
  news: "Style: Main,Franklin Gothic Medium,60,&H00FFFFFF,&H000000FF,&H00141414,&H78000000,1,0,0,0,100,100,2,0,1,3,0,5,40,40,90,1",
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
  if (preset === "viral") return "\\an2";
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
    return `{${alignmentTag}\\move(540,1220,540,1080,0,180)}`;
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

    const safeText = sanitizeSubtitleText(line).replace(/,/g, "\\,");
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
