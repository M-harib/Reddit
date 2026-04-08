const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const axios = require("axios");
const googleTTS = require("google-tts-api");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const ffprobePath = require("ffprobe-static").path;

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

const VOICE_OPTIONS = [
  { id: "jessie-style", label: "Jessie Style (Bright Female)", provider: "azure", voiceName: "en-US-AvaMultilingualNeural", style: "cheerful" },
  { id: "ava", label: "Ava (US Female)", provider: "azure", voiceName: "en-US-AvaNeural" },
  { id: "aria", label: "Aria (US Female)", provider: "azure", voiceName: "en-US-AriaNeural" },
  { id: "jenny", label: "Jenny (US Female)", provider: "azure", voiceName: "en-US-JennyNeural" },
  { id: "emma", label: "Emma (US Female)", provider: "azure", voiceName: "en-US-EmmaNeural" },
  { id: "michelle", label: "Michelle (US Female)", provider: "azure", voiceName: "en-US-MichelleNeural" },
  { id: "ana", label: "Ana (US Female)", provider: "azure", voiceName: "en-US-AnaNeural" },
  { id: "andrew", label: "Andrew (US Male)", provider: "azure", voiceName: "en-US-AndrewNeural" },
  { id: "brian", label: "Brian (US Male)", provider: "azure", voiceName: "en-US-BrianNeural" },
  { id: "christopher", label: "Christopher (US Male)", provider: "azure", voiceName: "en-US-ChristopherNeural" },
  { id: "roger", label: "Roger (US Male)", provider: "azure", voiceName: "en-US-RogerNeural" },
  { id: "steffan", label: "Steffan (US Male)", provider: "azure", voiceName: "en-US-SteffanNeural" },
  { id: "guy", label: "Guy (UK Male)", provider: "azure", voiceName: "en-GB-GuyNeural" },
  { id: "libby", label: "Libby (UK Female)", provider: "azure", voiceName: "en-GB-LibbyNeural" },
  { id: "maisie", label: "Maisie (UK Female)", provider: "azure", voiceName: "en-GB-MaisieNeural" },
  { id: "sonia", label: "Sonia (UK Female)", provider: "azure", voiceName: "en-GB-SoniaNeural" },
  { id: "thomas", label: "Thomas (UK Male)", provider: "azure", voiceName: "en-GB-ThomasNeural" },
  { id: "natasha", label: "Natasha (AU Female)", provider: "azure", voiceName: "en-AU-NatashaNeural" },
  { id: "william", label: "William (AU Male)", provider: "azure", voiceName: "en-AU-WilliamNeural" },
  { id: "clara", label: "Clara (CA Female)", provider: "azure", voiceName: "en-CA-ClaraNeural" },
  { id: "liam", label: "Liam (CA Male)", provider: "azure", voiceName: "en-CA-LiamNeural" },
  { id: "neerja", label: "Neerja (IN Female)", provider: "azure", voiceName: "en-IN-NeerjaNeural" },
  { id: "prabhat", label: "Prabhat (IN Male)", provider: "azure", voiceName: "en-IN-PrabhatNeural" },
  { id: "mitchell", label: "Mitchell (NZ Male)", provider: "azure", voiceName: "en-NZ-MitchellNeural" },
  { id: "molly", label: "Molly (NZ Female)", provider: "azure", voiceName: "en-NZ-MollyNeural" },
  { id: "google-basic", label: "Google Basic (Fallback)", provider: "google" },
];

function splitText(text, maxLength = 180) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const word of words) {
    if ((current + " " + word).trim().length > maxLength) {
      if (current) chunks.push(current.trim());
      current = word;
    } else {
      current += ` ${word}`;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function splitTextForAzure(text, maxLength = 2400) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  let current = "";

  for (const word of words) {
    const next = (current ? `${current} ${word}` : word).trim();
    if (next.length > maxLength) {
      if (current) chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

async function downloadMp3(url, filePath) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
  });
  fs.writeFileSync(filePath, response.data);
}

function getVoiceConfig(voiceId) {
  return VOICE_OPTIONS.find((voice) => voice.id === voiceId) || VOICE_OPTIONS[0];
}

function hasAzureSpeechCredentials() {
  return Boolean(process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION);
}

let edgeTtsAvailableCache = null;

function runExecFile(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 20 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout || "");
    });
  });
}

async function hasEdgeTtsSupport() {
  if (edgeTtsAvailableCache !== null) {
    return edgeTtsAvailableCache;
  }

  try {
    await runExecFile("py", ["-m", "edge_tts", "--help"]);
    edgeTtsAvailableCache = true;
  } catch (error) {
    edgeTtsAvailableCache = false;
  }

  return edgeTtsAvailableCache;
}

async function resolveVoiceIdForSynthesis(voiceId) {
  const selected = getVoiceConfig(voiceId);
  if (selected.provider === "azure" && !hasAzureSpeechCredentials()) {
    const edgeAvailable = await hasEdgeTtsSupport();
    return {
      effectiveVoiceId: selected.id,
      warning: edgeAvailable
        ? null
        : "Azure Speech credentials missing. Using tuned Google fallback voice. Add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in .env for Azure Neural voices.",
    };
  }

  return {
    effectiveVoiceId: selected.id,
    warning: null,
  };
}

function toAzureProsodyRate(speed) {
  const clamped = Math.max(0.5, Math.min(Number(speed) || 1, 2));
  const percent = Math.round((clamped - 1) * 100);
  return `${percent >= 0 ? "+" : ""}${percent}%`;
}

function escapeXml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function synthesizeAzureChunk({ text, filePath, voiceName, style, speed }) {
  const speechKey = process.env.AZURE_SPEECH_KEY;
  const speechRegion = process.env.AZURE_SPEECH_REGION;

  if (!speechKey || !speechRegion) {
    throw new Error("AZURE_SPEECH_KEY and AZURE_SPEECH_REGION are required for Azure Neural voices.");
  }

  const rate = toAzureProsodyRate(speed);
  const stylePart = style ? `<mstts:express-as style="${style}">` : "";
  const styleEnd = style ? "</mstts:express-as>" : "";
  const ssml = `
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
  <voice name="${voiceName}">
    ${stylePart}<prosody rate="${rate}">${escapeXml(text)}</prosody>${styleEnd}
  </voice>
</speak>`;

  const endpoint = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
  const response = await axios.post(endpoint, ssml, {
    timeout: 30000,
    responseType: "arraybuffer",
    headers: {
      "Ocp-Apim-Subscription-Key": speechKey,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-160kbitrate-mono-mp3",
      "User-Agent": "storyforge-tts/1.0",
    },
  });

  fs.writeFileSync(filePath, response.data);
}

async function synthesizeEdgeChunk({ text, filePath, voiceName, speed }) {
  const rate = toAzureProsodyRate(speed);
  await runExecFile("py", [
    "-m",
    "edge_tts",
    "--text",
    text,
    "--voice",
    voiceName,
    "--rate",
    rate,
    "--write-media",
    filePath,
  ]);
}

function getGoogleVoiceProfile(voiceId) {
  if (voiceId === "google-basic") {
    return { pitchRatio: 1, bass: 0, treble: 0, volume: 1 };
  }

  const hash = voiceId.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const profiles = [
    { pitchRatio: 1.06, bass: -2, treble: 3, volume: 1.02 },
    { pitchRatio: 0.96, bass: 2, treble: -1, volume: 1.02 },
    { pitchRatio: 1.03, bass: 1, treble: 2, volume: 1 },
    { pitchRatio: 0.94, bass: 3, treble: -2, volume: 1.03 },
    { pitchRatio: 1.08, bass: -3, treble: 4, volume: 1.01 },
    { pitchRatio: 0.98, bass: 1, treble: 0, volume: 1 },
  ];

  return profiles[hash % profiles.length];
}

function applyVoiceProfileToMp3(inputPath, profile) {
  if (!profile || (profile.pitchRatio === 1 && profile.bass === 0 && profile.treble === 0 && profile.volume === 1)) {
    return Promise.resolve();
  }

  const tempOut = `${inputPath}.profile.mp3`;
  const pitchRatio = Math.max(0.9, Math.min(profile.pitchRatio, 1.1));
  const atempoCompensation = Math.max(0.9, Math.min(1 / pitchRatio, 1.1));
  const filters = [
    `asetrate=44100*${pitchRatio.toFixed(4)}`,
    "aresample=44100",
    `atempo=${atempoCompensation.toFixed(4)}`,
    `bass=g=${profile.bass}`,
    `treble=g=${profile.treble}`,
    `volume=${profile.volume}`,
  ];

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .audioFilters(filters)
      .audioCodec("libmp3lame")
      .outputOptions(["-q:a", "2"])
      .on("end", () => {
        fs.unlinkSync(inputPath);
        fs.renameSync(tempOut, inputPath);
        resolve();
      })
      .on("error", (error) => {
        if (fs.existsSync(tempOut)) {
          fs.unlinkSync(tempOut);
        }
        reject(error);
      })
      .save(tempOut);
  });
}

async function synthesizeGoogleChunk({ text, filePath, ttsSpeed, voiceId }) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  if (!cleanText) {
    throw new Error("Google TTS text is empty.");
  }

  // google-tts-api getAudioUrl has a ~200 char limit per request.
  const chunks = splitText(cleanText, 180);

  if (chunks.length === 1) {
    const url = googleTTS.getAudioUrl(chunks[0], {
      lang: "en",
      slow: Number(ttsSpeed) < 1,
      host: "https://translate.google.com",
    });
    await downloadMp3(url, filePath);
  } else {
    const segmentPaths = [];

    try {
      for (let i = 0; i < chunks.length; i += 1) {
        const segmentPath = `${filePath}.gseg-${i + 1}.mp3`;
        const url = googleTTS.getAudioUrl(chunks[i], {
          lang: "en",
          slow: Number(ttsSpeed) < 1,
          host: "https://translate.google.com",
        });
        await downloadMp3(url, segmentPath);
        segmentPaths.push(segmentPath);
      }

      await concatAudioSegments(segmentPaths, filePath);
    } finally {
      for (const segmentPath of segmentPaths) {
        if (fs.existsSync(segmentPath)) {
          fs.unlinkSync(segmentPath);
        }
      }
    }
  }

  const profile = getGoogleVoiceProfile(voiceId);
  await applyVoiceProfileToMp3(filePath, profile);
}

async function applyPitchShiftToMp3(inputPath, semitones = 0) {
  const pitch = Math.max(-8, Math.min(Number(semitones) || 0, 6));
  if (pitch === 0) {
    return;
  }

  const sampleRate = await getAudioSampleRate(inputPath);
  const ratio = Math.pow(2, pitch / 12);
  const preserveTempo = Math.max(0.5, Math.min(1 / ratio, 2));
  const tempOut = `${inputPath}.pitch.mp3`;

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .audioFilters([
        `asetrate=${sampleRate}*${ratio.toFixed(5)}`,
        `aresample=${sampleRate}`,
        `atempo=${preserveTempo.toFixed(5)}`,
      ])
      .audioCodec("libmp3lame")
      .outputOptions(["-q:a", "2"])
      .on("end", () => {
        fs.unlinkSync(inputPath);
        fs.renameSync(tempOut, inputPath);
        resolve();
      })
      .on("error", (error) => {
        if (fs.existsSync(tempOut)) {
          fs.unlinkSync(tempOut);
        }
        reject(error);
      })
      .save(tempOut);
  });
}

function getAudioSampleRate(audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, data) => {
      if (err) return reject(err);
      const audioStream = (data?.streams || []).find((stream) => stream.codec_type === "audio");
      const parsedSampleRate = Number(audioStream?.sample_rate);
      if (!parsedSampleRate || Number.isNaN(parsedSampleRate)) {
        return resolve(44100);
      }
      return resolve(parsedSampleRate);
    });
  });
}

function concatAudioSegments(segmentPaths, outputPath) {
  return new Promise((resolve, reject) => {
    const listFilePath = path.join(path.dirname(outputPath), `concat-${Date.now()}.txt`);
    const listContent = segmentPaths.map((segment) => `file '${segment.replace(/\\/g, "/")}'`).join("\n");
    fs.writeFileSync(listFilePath, listContent, "utf8");

    ffmpeg()
      .input(listFilePath)
      .inputOptions(["-f", "concat", "-safe", "0"])
      .outputOptions(["-c", "copy"])
      .on("end", () => {
        fs.unlinkSync(listFilePath);
        resolve(outputPath);
      })
      .on("error", (err) => {
        if (fs.existsSync(listFilePath)) {
          fs.unlinkSync(listFilePath);
        }
        reject(err);
      })
      .save(outputPath);
  });
}

function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, data) => {
      if (err) return reject(err);
      const duration = data?.format?.duration;
      if (!duration) return reject(new Error("Unable to read audio duration."));
      return resolve(duration);
    });
  });
}

async function concatAudioFiles({ segmentPaths, outputPath }) {
  if (!Array.isArray(segmentPaths) || segmentPaths.length === 0) {
    throw new Error("No audio files provided for concatenation.");
  }
  return concatAudioSegments(segmentPaths, outputPath);
}

async function generateNarrationMp3({
  text,
  tempDir,
  outputName,
  voiceId = "jessie-style",
  ttsSpeed = 1,
  ttsPitch = 0,
}) {
  const cleanText = text.replace(/\s+/g, " ").trim();
  if (!cleanText) throw new Error("Story text is empty.");

  const voice = getVoiceConfig(voiceId);
  const useAzure = voice.provider === "azure" && hasAzureSpeechCredentials();
  const useEdge = voice.provider === "azure" && !useAzure && (await hasEdgeTtsSupport());
  const chunks = voice.provider === "azure" ? splitTextForAzure(cleanText, 2400) : splitText(cleanText, 180);
  const segmentPaths = [];

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const segmentPath = path.join(tempDir, `${outputName}-segment-${i + 1}.mp3`);

    try {
      if (useAzure) {
        await synthesizeAzureChunk({
          text: chunk,
          filePath: segmentPath,
          voiceName: voice.voiceName,
          style: voice.style,
          speed: ttsSpeed,
        });
      } else if (useEdge) {
        await synthesizeEdgeChunk({
          text: chunk,
          filePath: segmentPath,
          voiceName: voice.voiceName,
          speed: ttsSpeed,
        });
      } else {
        await synthesizeGoogleChunk({
          text: chunk,
          filePath: segmentPath,
          ttsSpeed,
          voiceId,
        });
      }
    } catch (error) {
      await synthesizeGoogleChunk({
        text: chunk,
        filePath: segmentPath,
        ttsSpeed,
        voiceId,
      });
    }

    await applyPitchShiftToMp3(segmentPath, ttsPitch);

    segmentPaths.push(segmentPath);
  }

  const outputPath = path.join(tempDir, `${outputName}-narration.mp3`);
  await concatAudioSegments(segmentPaths, outputPath);

  for (const segmentPath of segmentPaths) {
    if (fs.existsSync(segmentPath)) {
      fs.unlinkSync(segmentPath);
    }
  }

  return outputPath;
}

function getVoiceOptions() {
  return VOICE_OPTIONS.map((voice) => ({
    id: voice.id,
    label: voice.label,
    provider: voice.provider,
  }));
}

module.exports = {
  generateNarrationMp3,
  getVoiceOptions,
  resolveVoiceIdForSynthesis,
  getAudioDuration,
  concatAudioFiles,
};
