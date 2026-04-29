const fetchForm = document.getElementById("fetch-form");
const storiesContainer = document.getElementById("stories");
const storyTitleInput = document.getElementById("story-title");
const storyTextInput = document.getElementById("story-text");
const videoForm = document.getElementById("video-form");
const statusEl = document.getElementById("status");
const resultVideo = document.getElementById("result-video");
const downloadLink = document.getElementById("download-link");
const voiceSelect = document.getElementById("voice-id");
const previewVoiceBtn = document.getElementById("preview-voice-btn");
const voicePreviewPlayer = document.getElementById("voice-preview-player");
const ttsPitchInput = document.getElementById("tts-pitch");
const ttsPitchValue = document.getElementById("tts-pitch-value");
const subtitlePresetInput = document.getElementById("subtitle-preset");
const captionStyleGrid = document.getElementById("caption-style-grid");
const ttsSpeedSelect = document.getElementById("tts-speed");
const subtitleEffectSelect = document.getElementById("subtitle-effect");
const musicVolumeInput = document.getElementById("music-volume");
const quickPackGrid = document.getElementById("quick-pack-grid");
const insightWords = document.getElementById("insight-words");
const insightDuration = document.getElementById("insight-duration");
const generationMeta = document.getElementById("generation-meta");
const generationStage = document.getElementById("generation-stage");
const generationElapsed = document.getElementById("generation-elapsed");
const generationProgress = document.getElementById("generation-progress");
const generationProgressFill = document.getElementById("generation-progress-fill");
const generationPercent = document.getElementById("generation-percent");
const previewPanel = document.getElementById("preview-panel");
const previewPlaceholder = document.getElementById("preview-placeholder");
const previewProgressFill = document.getElementById("preview-progress-fill");
const quickTipsWidget = document.querySelector(".quick-tips-widget");
const quickTipsTrack = document.getElementById("quick-tips-track");
const quickTipsDots = document.getElementById("quick-tips-dots");
const quickTipsProgressFill = document.getElementById("quick-tips-progress-fill");
const channelUrlInput = document.getElementById("channel-url");
const autoPostConnectBtn = document.getElementById("auto-post-connect-btn");
const defaultGameplayInput = document.getElementById("default-gameplay");
const defaultMusicInput = document.getElementById("default-music");
const saveDefaultMediaBtn = document.getElementById("save-default-media-btn");
const saveAsDefaultsInput = document.getElementById("save-as-defaults");
const defaultMediaStatus = document.getElementById("default-media-status");
const defaultMediaFiles = document.getElementById("default-media-files");
const connectionStatusEl = document.getElementById("connection-status");
const themeToggleBtn = document.getElementById("theme-toggle");

const SETTINGS_KEY = "storyforgeSettingsV1";
const THEME_KEY = "karmatokThemeV1";
const VOICE_PREVIEW_CACHE_PREFIX = "karmatokVoicePreview:";
const SAMPLE_PREVIEW_TEXT = "This is a voice preview for your Reddit story video. Let's make this sound amazing.";
const CHANNEL_URL_KEY = "karmatokChannelUrlV1";

const QUICK_PACKS = {
  viral: { subtitlePreset: "viral", subtitleEffect: "pop", ttsSpeed: "1", ttsPitch: "1", musicVolume: "0.17" },
  cinema: { subtitlePreset: "cinematic", subtitleEffect: "fade", ttsSpeed: "0.9", ttsPitch: "0", musicVolume: "0.12" },
  gaming: { subtitlePreset: "comic", subtitleEffect: "wiggle", ttsSpeed: "1.25", ttsPitch: "2", musicVolume: "0.2" },
  minimal: { subtitlePreset: "minimal", subtitleEffect: "none", ttsSpeed: "1", ttsPitch: "0", musicVolume: "0.1" },
};

let progressTimer = null;
let elapsedTimer = null;
let activeCaptionCards = [];
let activeQuickPackButtons = [];
let defaultMediaState = { gameplay: false, music: false };
let currentPreviewObjectUrl = null;
let audioContextRef = null;
let backendOnline = false;
let generationBusy = false;
let fetchBusy = false;
let connectionTimer = null;
let lastKnownBackendOnline = null;
let voicePreviewWarmTimeout = null;
let quickTipsTimer = null;
let quickTipIndex = 0;
const voicePreviewCache = new Map();

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b21313" : "#111111";
}

function setDropZoneFilename(input) {
  if (!input?.id) return;
  const fileLabel = document.querySelector(`[data-file-for="${input.id}"]`);
  if (!fileLabel) return;

  const selected = input.files?.[0];
  fileLabel.textContent = selected ? selected.name : "No file selected";
}

function bindDropZones() {
  const zones = document.querySelectorAll(".drop-zone");

  zones.forEach((zone) => {
    const input = zone.querySelector('input[type="file"]');
    if (!input) return;

    input.addEventListener("change", () => {
      setDropZoneFilename(input);
    });

    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("drag-over");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("drag-over");
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("drag-over");

      const files = event.dataTransfer?.files;
      if (!files || !files.length) return;

      try {
        const transfer = new DataTransfer();
        transfer.items.add(files[0]);
        input.files = transfer.files;
      } catch (error) {
        // Fallback: keep browser-selected files when DataTransfer assignment is unavailable.
      }

      setDropZoneFilename(input);
    });

    setDropZoneFilename(input);
  });
}

function updateConnectionBadge(isOnline, message) {
  if (!connectionStatusEl) return;

  connectionStatusEl.textContent = message;
  connectionStatusEl.classList.toggle("is-online", isOnline);
  connectionStatusEl.classList.toggle("is-offline", !isOnline);
}

function refreshControlStates() {
  const fetchButton = fetchForm.querySelector("button[type='submit']");
  const videoSubmitButton = videoForm.querySelector("button[type='submit']");
  const shouldDisableActions = !backendOnline || generationBusy;

  if (fetchButton) {
    fetchButton.disabled = !backendOnline || fetchBusy;
  }

  if (videoSubmitButton) {
    videoSubmitButton.disabled = shouldDisableActions;
    videoSubmitButton.textContent = generationBusy ? "Rendering..." : "Create Video";
  }

  previewVoiceBtn.disabled = shouldDisableActions;
  if (saveDefaultMediaBtn) {
    saveDefaultMediaBtn.disabled = shouldDisableActions;
  }
}

async function checkBackendHealth() {
  try {
    const response = await fetch(`/health?t=${Date.now()}`, { cache: "no-store" });
    const isOnline = response.ok;
    backendOnline = isOnline;
    updateConnectionBadge(isOnline, isOnline ? "Backend status: online" : "Backend status: offline");
    if (!isOnline) {
      setStatus("Backend is offline. Start it with 'npm run dev'.", true);
    } else if (lastKnownBackendOnline !== true) {
      loadDefaultMediaState();
      loadVoices();
    }

    lastKnownBackendOnline = isOnline;
  } catch (error) {
    backendOnline = false;
    updateConnectionBadge(false, "Backend status: offline");
    lastKnownBackendOnline = false;
  }

  refreshControlStates();
}

function startBackendMonitoring() {
  checkBackendHealth();
  if (connectionTimer) {
    window.clearInterval(connectionTimer);
  }
  connectionTimer = window.setInterval(checkBackendHealth, 5000);
}

function applyTheme(theme) {
  const isLight = theme === "light";
  document.body.classList.toggle("theme-light", isLight);

  if (!themeToggleBtn) return;
  themeToggleBtn.classList.toggle("is-on", isLight);
  themeToggleBtn.classList.toggle("is-off", !isLight);
  themeToggleBtn.setAttribute("aria-pressed", String(isLight));
  themeToggleBtn.setAttribute("aria-label", isLight ? "Light mode on" : "Dark mode on");
}

function initializeThemeToggle() {
  if (!themeToggleBtn) return;

  let savedTheme = "dark";
  try {
    savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  } catch (error) {
    // Ignore storage errors and default to dark mode.
  }

  applyTheme(savedTheme === "light" ? "light" : "dark");

  themeToggleBtn.addEventListener("click", () => {
    const nextTheme = document.body.classList.contains("theme-light") ? "dark" : "light";
    applyTheme(nextTheme);
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch (error) {
      // Ignore storage errors silently.
    }
  });
}

function ensureAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return null;
  }
  if (!audioContextRef) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioContextRef = new Ctx();
  }
  if (audioContextRef.state === "suspended") {
    audioContextRef.resume().catch(() => {});
  }
  return audioContextRef;
}

function playCompletionBell() {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
  master.connect(ctx.destination);

  const base = ctx.createOscillator();
  base.type = "sine";
  base.frequency.setValueAtTime(880, now);
  base.frequency.exponentialRampToValueAtTime(660, now + 1.1);

  const harmonic = ctx.createOscillator();
  harmonic.type = "triangle";
  harmonic.frequency.setValueAtTime(1320, now);
  harmonic.frequency.exponentialRampToValueAtTime(990, now + 1.0);

  const harmonicGain = ctx.createGain();
  harmonicGain.gain.setValueAtTime(0.22, now);
  harmonicGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

  base.connect(master);
  harmonic.connect(harmonicGain);
  harmonicGain.connect(master);

  base.start(now);
  harmonic.start(now);
  base.stop(now + 1.25);
  harmonic.stop(now + 1.0);
}

async function notifyCompletion(message) {
  if (!document.hidden || !("Notification" in window)) {
    return;
  }

  const showNotice = () => {
    try {
      new Notification("KarmaTok", { body: message, silent: true });
    } catch (error) {
      // Ignore notification failures silently.
    }
  };

  if (Notification.permission === "granted") {
    showNotice();
    return;
  }

  if (Notification.permission === "default") {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        showNotice();
      }
    } catch (error) {
      // Ignore permission request failures.
    }
  }
}

async function isBackendReachable() {
  try {
    const response = await fetch(`/health?t=${Date.now()}`, { cache: "no-store" });
    return response.ok;
  } catch (error) {
    return false;
  }
}

function setDefaultMediaStatus(message, isError = false) {
  if (!defaultMediaStatus) return;
  defaultMediaStatus.textContent = message;
  defaultMediaStatus.style.color = isError ? "#b21313" : "#5f5a50";
}

function setDefaultMediaFiles(gameplayFile, musicFile) {
  if (!defaultMediaFiles) return;
  const gameplayLabel = gameplayFile ? `Gameplay: ${gameplayFile}` : "Gameplay: not saved";
  const musicLabel = musicFile ? `Music: ${musicFile}` : "Music: not saved";
  defaultMediaFiles.textContent = `${gameplayLabel} • ${musicLabel}`;
}

async function saveDefaultMediaFromFiles(gameplayFile, musicFile) {
  if (!backendOnline) {
    throw new Error("Backend is offline. Start the server first.");
  }

  if (!gameplayFile && !musicFile) {
    throw new Error("Choose at least one file to save.");
  }

  const formData = new FormData();
  if (gameplayFile) formData.append("gameplay", gameplayFile);
  if (musicFile) formData.append("music", musicFile);

  setDefaultMediaStatus("Saving default media...");
  const response = await fetch("/api/video/default-media", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Failed to save default media.");
  }

  await loadDefaultMediaState();
  setDefaultMediaStatus("Default media saved successfully.");
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function estimateNarrationSeconds(text, speed) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const speakingWpm = 150;
  const safeSpeed = clamp(Number(speed) || 1, 0.5, 2);
  const estimated = words ? (words / (speakingWpm * safeSpeed)) * 60 : 0;
  return { words, seconds: estimated };
}

function updateScriptInsights() {
  const { words, seconds } = estimateNarrationSeconds(storyTextInput.value || "", ttsSpeedSelect.value);
  insightWords.textContent = `${words} words`;
  insightDuration.textContent = `Estimated voice: ${formatDuration(seconds)}`;
}

function getVoicePreviewKey() {
  return JSON.stringify({
    voiceId: voiceSelect.value,
    ttsSpeed: ttsSpeedSelect.value,
    ttsPitch: ttsPitchInput.value,
    previewText: SAMPLE_PREVIEW_TEXT,
  });
}

function getStoredPreviewUrl(key) {
  if (voicePreviewCache.has(key)) {
    return voicePreviewCache.get(key);
  }

  try {
    const stored = localStorage.getItem(VOICE_PREVIEW_CACHE_PREFIX + key);
    if (stored) {
      voicePreviewCache.set(key, stored);
      return stored;
    }
  } catch (error) {
    // Ignore storage access issues.
  }

  return "";
}

function storePreviewUrl(key, url) {
  voicePreviewCache.set(key, url);
  try {
    localStorage.setItem(VOICE_PREVIEW_CACHE_PREFIX + key, url);
  } catch (error) {
    // Ignore storage write failures.
  }
}

function clearStoredPreviewUrl(key) {
  voicePreviewCache.delete(key);
  try {
    localStorage.removeItem(VOICE_PREVIEW_CACHE_PREFIX + key);
  } catch (error) {
    // Ignore storage delete failures.
  }
}

async function requestVoicePreviewUrl() {
  const response = await fetch("/api/video/preview-voice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voiceId: voiceSelect.value,
      ttsSpeed: ttsSpeedSelect.value,
      ttsPitch: ttsPitchInput.value,
      previewText: SAMPLE_PREVIEW_TEXT,
    }),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.error || "Could not generate preview.");
  }

  return {
    previewUrl: data.previewUrl,
    warning: data.warning,
  };
}

function scheduleVoicePreviewWarm() {
  if (!backendOnline) return;
  if (voicePreviewWarmTimeout) {
    window.clearTimeout(voicePreviewWarmTimeout);
  }

  voicePreviewWarmTimeout = window.setTimeout(async () => {
    const key = getVoicePreviewKey();
    if (getStoredPreviewUrl(key)) return;

    try {
      const generated = await requestVoicePreviewUrl();
      storePreviewUrl(key, generated.previewUrl);
    } catch (error) {
      // Warmup is best-effort. Ignore failures.
    }
  }, 140);
}

function saveSettings() {
  const settings = {
    voiceId: voiceSelect.value,
    ttsSpeed: ttsSpeedSelect.value,
    ttsPitch: ttsPitchInput.value,
    subtitlePreset: subtitlePresetInput.value,
    subtitleEffect: subtitleEffectSelect.value,
    musicVolume: musicVolumeInput.value,
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.ttsSpeed) ttsSpeedSelect.value = String(saved.ttsSpeed);
    if (saved.ttsPitch !== undefined) ttsPitchInput.value = String(saved.ttsPitch);
    if (saved.subtitleEffect) subtitleEffectSelect.value = String(saved.subtitleEffect);
    if (saved.musicVolume) musicVolumeInput.value = String(saved.musicVolume);
    if (saved.subtitlePreset) subtitlePresetInput.value = String(saved.subtitlePreset);
  } catch (error) {
    // Ignore corrupted local storage values.
  }
}

function setQuickPackActive(packName) {
  activeQuickPackButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.pack === packName);
  });
}

function applyQuickPack(packName) {
  const pack = QUICK_PACKS[packName];
  if (!pack) return;
  ttsSpeedSelect.value = pack.ttsSpeed;
  ttsPitchInput.value = pack.ttsPitch;
  subtitleEffectSelect.value = pack.subtitleEffect;
  musicVolumeInput.value = pack.musicVolume;
  setCaptionPreset(pack.subtitlePreset);
  setQuickPackActive(packName);
  updatePitchLabel();
  updateScriptInsights();
  saveSettings();
  setStatus(`Applied ${packName} pack.`);
}

function setGeneratingState(isGenerating) {
  generationBusy = isGenerating;
  refreshControlStates();
}

function setPreviewProgress(value) {
  const clamped = Math.max(0, Math.min(100, Number(value) || 0));
  if (generationProgressFill) generationProgressFill.style.width = `${clamped}%`;
  if (previewProgressFill) previewProgressFill.style.width = `${clamped}%`;
  if (generationPercent) generationPercent.textContent = `${Math.round(clamped)}%`;
}

function setPreviewIdleState() {
  if (previewPanel) {
    previewPanel.hidden = false;
    previewPanel.classList.remove("is-video-ready");
  }
  setPreviewProgress(0);
  if (previewPlaceholder) {
    previewPlaceholder.hidden = false;
  }
  if (resultVideo) {
    resultVideo.pause();
    resultVideo.hidden = true;

    const hasSource = Boolean(resultVideo.getAttribute("src") || resultVideo.currentSrc);
    if (hasSource) {
      resultVideo.removeAttribute("src");
      resultVideo.load();
    }
  }

  if (currentPreviewObjectUrl) {
    URL.revokeObjectURL(currentPreviewObjectUrl);
    currentPreviewObjectUrl = null;
  }
}

function setPreviewReadyState() {
  if (previewPanel) {
    previewPanel.hidden = false;
    previewPanel.classList.add("is-video-ready");
  }
  if (previewPlaceholder) {
    previewPlaceholder.hidden = true;
  }
  if (resultVideo) {
    resultVideo.hidden = false;
  }
}

function startGenerationFeedback() {
  let progress = 8;
  let elapsedSeconds = 0;
  const stages = ["Generating voiceover...", "Compositing video...", "Compositing video...", "Exporting final MP4..."];

  if (previewPanel) {
    previewPanel.hidden = false;
    previewPanel.classList.remove("is-video-ready");
  }
  if (previewPlaceholder) previewPlaceholder.hidden = false;
  if (resultVideo) resultVideo.hidden = true;

  if (generationProgress) generationProgress.hidden = false;
  setPreviewProgress(progress);
  if (generationStage) generationStage.textContent = stages[0];
  if (generationElapsed) generationElapsed.textContent = "00:00";

  progressTimer = window.setInterval(() => {
    progress = Math.min(92, progress + Math.random() * 3.5);
    setPreviewProgress(progress.toFixed(1));
    if (generationStage) {
      if (progress > 78) {
        generationStage.textContent = stages[3];
      } else if (progress > 56) {
        generationStage.textContent = stages[2];
      } else if (progress > 28) {
        generationStage.textContent = stages[1];
      }
    }
  }, 900);

  elapsedTimer = window.setInterval(() => {
    elapsedSeconds += 1;
    if (generationElapsed) generationElapsed.textContent = formatDuration(elapsedSeconds);
  }, 1000);
}

function stopGenerationFeedback(completed) {
  if (progressTimer) {
    window.clearInterval(progressTimer);
    progressTimer = null;
  }
  if (elapsedTimer) {
    window.clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  if (completed) {
    setPreviewProgress(100);
    if (generationStage) generationStage.textContent = "Done";
    setPreviewReadyState();
    window.setTimeout(() => {
      if (generationProgress) generationProgress.hidden = true;
      if (generationProgressFill) generationProgressFill.style.width = "0%";
    }, 800);
  } else {
    if (generationProgress) generationProgress.hidden = true;
    if (generationProgressFill) generationProgressFill.style.width = "0%";
    setPreviewIdleState();
  }
}

function setCaptionPreset(preset) {
  subtitlePresetInput.value = preset;
  activeCaptionCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.preset === preset);
  });
}

function resetQuickTipsProgressBar() {
  if (!quickTipsProgressFill) return;
  quickTipsProgressFill.classList.remove("is-animating");
  // Force reflow so CSS animation restarts cleanly each tip change.
  void quickTipsProgressFill.offsetWidth;
  quickTipsProgressFill.classList.add("is-animating");
}

function showQuickTip(index) {
  if (!quickTipsTrack || !quickTipsDots) return;

  const cards = Array.from(quickTipsTrack.querySelectorAll(".tip-card"));
  const dots = Array.from(quickTipsDots.querySelectorAll(".tip-dot"));
  if (!cards.length || !dots.length) return;

  quickTipIndex = (index + cards.length) % cards.length;
  cards.forEach((card, cardIndex) => {
    card.classList.toggle("is-active", cardIndex === quickTipIndex);
  });
  dots.forEach((dot, dotIndex) => {
    dot.classList.toggle("is-active", dotIndex === quickTipIndex);
    dot.setAttribute("aria-selected", String(dotIndex === quickTipIndex));
  });

  resetQuickTipsProgressBar();
}

function startQuickTipsCarousel() {
  if (!quickTipsTrack || !quickTipsDots) return;
  if (quickTipsTimer) {
    window.clearInterval(quickTipsTimer);
  }
  quickTipsTimer = window.setInterval(() => {
    showQuickTip(quickTipIndex + 1);
  }, 4800);
}

function initializeQuickTipsCarousel() {
  if (!quickTipsTrack || !quickTipsDots) return;

  const dots = Array.from(quickTipsDots.querySelectorAll(".tip-dot"));
  if (!dots.length) return;

  dots.forEach((dot) => {
    dot.addEventListener("click", () => {
      const requested = Number(dot.dataset.tipDot);
      if (Number.isNaN(requested)) return;
      showQuickTip(requested);
      startQuickTipsCarousel();
    });
  });

  if (quickTipsWidget) {
    quickTipsWidget.addEventListener("mouseenter", () => {
      if (quickTipsTimer) {
        window.clearInterval(quickTipsTimer);
        quickTipsTimer = null;
      }
    });

    quickTipsWidget.addEventListener("mouseleave", () => {
      startQuickTipsCarousel();
      resetQuickTipsProgressBar();
    });
  }

  showQuickTip(0);
  startQuickTipsCarousel();
}

function waitForVideoLoad(url, timeoutMs = 18000) {
  return new Promise((resolve, reject) => {
    let timeoutHandle = null;

    const isPlayableVideoReady = () => {
      const duration = Number(resultVideo.duration);
      return Number.isFinite(duration) && duration > 0;
    };

    const cleanup = () => {
      resultVideo.removeEventListener("loadedmetadata", handleLoaded);
      resultVideo.removeEventListener("loadeddata", handleLoaded);
      resultVideo.removeEventListener("canplay", handleLoaded);
      resultVideo.removeEventListener("error", handleError);
      if (timeoutHandle) {
        window.clearTimeout(timeoutHandle);
      }
    };

    const handleLoaded = () => {
      if (!isPlayableVideoReady()) {
        return;
      }
      cleanup();
      resolve(url);
    };

    const handleError = () => {
      cleanup();
      reject(new Error("Video preview load failed."));
    };

    timeoutHandle = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video preview load timed out."));
    }, timeoutMs);

    resultVideo.addEventListener("loadedmetadata", handleLoaded);
    resultVideo.addEventListener("loadeddata", handleLoaded);
    resultVideo.addEventListener("canplay", handleLoaded);
    resultVideo.addEventListener("error", handleError, { once: true });

    resultVideo.src = url;
    resultVideo.load();
  });
}

async function loadResultVideo(videoUrl) {
  const cacheBustedUrl = `${videoUrl}${videoUrl.includes("?") ? "&" : "?"}t=${Date.now()}`;

  if (currentPreviewObjectUrl) {
    URL.revokeObjectURL(currentPreviewObjectUrl);
    currentPreviewObjectUrl = null;
  }

  resultVideo.pause();
  resultVideo.hidden = true;
  resultVideo.removeAttribute("src");
  resultVideo.load();

  try {
    await waitForVideoLoad(cacheBustedUrl);
    return;
  } catch (directLoadError) {
    const response = await fetch(cacheBustedUrl, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Video file was created, but preview could not be fetched from the server.");
    }

    const blob = await response.blob();
    currentPreviewObjectUrl = URL.createObjectURL(blob);
    await waitForVideoLoad(currentPreviewObjectUrl);
  }
}

async function loadDefaultMediaState() {
  try {
    const response = await fetch("/api/video/default-media");
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Failed to load default media state.");
    }

    defaultMediaState = {
      gameplay: Boolean(data.defaults?.gameplay),
      music: Boolean(data.defaults?.music),
    };

    if (defaultMediaState.gameplay && defaultMediaState.music) {
    } else if (defaultMediaState.gameplay || defaultMediaState.music) {
      setDefaultMediaStatus("Partial defaults saved. Add the missing file for full auto mode.");
    } else {
      setDefaultMediaStatus("No defaults saved yet.");
    }

    setDefaultMediaFiles(data.defaults?.gameplayFile, data.defaults?.musicFile);
  } catch (error) {
    setDefaultMediaStatus("Could not load default media status.", true);
    setDefaultMediaFiles(null, null);
  }
}

if (saveDefaultMediaBtn && defaultGameplayInput && defaultMusicInput) {
  saveDefaultMediaBtn.addEventListener("click", async () => {
    const gameplayFile = defaultGameplayInput.files?.[0];
    const musicFile = defaultMusicInput.files?.[0];

    try {
      saveDefaultMediaBtn.disabled = true;
      await saveDefaultMediaFromFiles(gameplayFile, musicFile);
      defaultGameplayInput.value = "";
      defaultMusicInput.value = "";
      setDropZoneFilename(defaultGameplayInput);
      setDropZoneFilename(defaultMusicInput);
    } catch (error) {
      setDefaultMediaStatus(error.message, true);
    } finally {
      saveDefaultMediaBtn.disabled = false;
    }
  });
}

loadDefaultMediaState();

function createStoryCard(story) {
  const card = document.createElement("article");
  card.className = "story-card";

  const textPreview = story.selftext.slice(0, 420);

  card.innerHTML = `
    <h3>${story.title}</h3>
    <p class="story-meta">r/${story.subreddit} • u/${story.author} • ${story.score} upvotes • ${story.comments} comments</p>
    <p>${textPreview}${story.selftext.length > 420 ? "..." : ""}</p>
    <button type="button">Use This Story</button>
  `;

  card.querySelector("button").addEventListener("click", () => {
    storyTitleInput.value = story.title;
    storyTextInput.value = story.selftext;
    setPreviewIdleState();
    setStatus("Story selected. Upload your gameplay and music, then create video.");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });

  return card;
}

async function loadVoices() {
  try {
    const response = await fetch("/api/video/voices");
    const data = await response.json();

    if (!response.ok || !data.ok || !Array.isArray(data.voices)) {
      return;
    }

    voiceSelect.innerHTML = "";
    data.voices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.id;
      option.textContent = voice.label;
      if (voice.id === "jessie-style") {
        option.selected = true;
      }
      voiceSelect.appendChild(option);
    });

    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (saved.voiceId && data.voices.some((voice) => voice.id === saved.voiceId)) {
        voiceSelect.value = saved.voiceId;
      }
    } catch (error) {
      // Ignore saved-setting parse errors.
    }
  } catch (error) {
    // Keep default option if voices cannot be loaded.
  } finally {
    scheduleVoicePreviewWarm();
  }
}

loadSavedSettings();
loadVoices();

function updatePitchLabel() {
  const value = Number(ttsPitchInput.value) || 0;
  const sign = value > 0 ? "+" : "";
  ttsPitchValue.textContent = `${sign}${value} semitones`;
}

ttsPitchInput.addEventListener("input", updatePitchLabel);
updatePitchLabel();

if (captionStyleGrid && subtitlePresetInput) {
  activeCaptionCards = Array.from(captionStyleGrid.querySelectorAll(".caption-style-card"));

  activeCaptionCards.forEach((card) => {
    card.addEventListener("click", () => {
      setCaptionPreset(card.dataset.preset || "viral");
      setPreviewIdleState();
      saveSettings();
    });
  });

  setCaptionPreset(subtitlePresetInput.value || "viral");
}

if (quickPackGrid) {
  activeQuickPackButtons = Array.from(quickPackGrid.querySelectorAll(".quick-pack"));
  activeQuickPackButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyQuickPack(button.dataset.pack);
      setPreviewIdleState();
    });
  });
}

[voiceSelect, ttsSpeedSelect, ttsPitchInput, subtitleEffectSelect, musicVolumeInput].forEach((element) => {
  element.addEventListener("change", () => {
    saveSettings();
    setPreviewIdleState();
  });
});

storyTextInput.addEventListener("input", updateScriptInsights);
storyTextInput.addEventListener("input", setPreviewIdleState);
storyTitleInput.addEventListener("input", setPreviewIdleState);
ttsSpeedSelect.addEventListener("change", updateScriptInsights);
updateScriptInsights();
setPreviewIdleState();

previewVoiceBtn.addEventListener("click", async () => {
  if (!backendOnline) {
    setStatus("Backend is offline. Start it with 'npm run dev'.", true);
    return;
  }

  try {
    previewVoiceBtn.disabled = true;
    const key = getVoicePreviewKey();
    let previewUrl = getStoredPreviewUrl(key);
    let warning = "";

    if (!previewUrl) {
      setStatus("Preparing voice sample...");
      const generated = await requestVoicePreviewUrl();
      previewUrl = generated.previewUrl;
      warning = generated.warning || "";
      storePreviewUrl(key, previewUrl);
    }

    voicePreviewPlayer.pause();
    voicePreviewPlayer.currentTime = 0;
    voicePreviewPlayer.src = previewUrl;
    voicePreviewPlayer.hidden = false;
    await voicePreviewPlayer.play();
    setStatus(warning ? `Voice preview ready. ${warning}` : "Voice sample playing.");
  } catch (error) {
    clearStoredPreviewUrl(getVoicePreviewKey());
    setStatus(error.message, true);
  } finally {
    previewVoiceBtn.disabled = false;
  }
});

[voiceSelect, ttsSpeedSelect, ttsPitchInput].forEach((element) => {
  element.addEventListener("change", scheduleVoicePreviewWarm);
});

scheduleVoicePreviewWarm();

try {
  if (channelUrlInput) {
    channelUrlInput.value = localStorage.getItem(CHANNEL_URL_KEY) || "";
  }
} catch (error) {
  // Ignore storage read failures.
}

if (autoPostConnectBtn) {
  autoPostConnectBtn.addEventListener("click", () => {
    const enteredUrl = (channelUrlInput?.value || "").trim();
    if (!enteredUrl) {
      setStatus("Enter your channel URL first.", true);
      return;
    }

    try {
      localStorage.setItem(CHANNEL_URL_KEY, enteredUrl);
    } catch (error) {
      // Ignore storage write failures.
    }

    setStatus("Channel URL saved. Auto-post integration coming soon.");
  });
}

fetchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!backendOnline) {
    setStatus("Backend is offline. Start it with 'npm run dev' and try again.", true);
    return;
  }

  const subreddit = document.getElementById("subreddit").value.trim() || "stories";
  const limit = Number(document.getElementById("limit").value) || 8;

  setStatus("Fetching trending Reddit stories...");
  storiesContainer.innerHTML = "";
  fetchBusy = true;
  refreshControlStates();

  try {
    const response = await fetch(`/api/reddit/trending?subreddit=${encodeURIComponent(subreddit)}&limit=${limit}&time=day`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || "Unable to fetch stories.");
    }

    if (!data.stories.length) {
      setStatus("No qualifying stories found. Try another subreddit.", true);
      return;
    }

    data.stories.forEach((story) => {
      storiesContainer.appendChild(createStoryCard(story));
    });

    setStatus(`Loaded ${data.count} trending stories.`);
  } catch (error) {
    const isNetworkIssue = error instanceof TypeError;
    backendOnline = false;
    updateConnectionBadge(false, "Backend status: offline");
    setStatus(
      isNetworkIssue
        ? "Cannot reach backend. Start the server with 'npm run dev' and refresh."
        : error.message,
      true
    );
  } finally {
    fetchBusy = false;
    refreshControlStates();
  }
});

videoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  ensureAudioContext();

  if (!backendOnline) {
    setStatus("Backend is offline. Start it with 'npm run dev' and try again.", true);
    return;
  }

  const gameplay = document.getElementById("gameplay").files[0];
  const music = document.getElementById("music").files[0];

  if (!storyTitleInput.value || !storyTextInput.value) {
    setStatus("Please select a Reddit story first.", true);
    return;
  }

  if (!gameplay || !music) {
    const canFallbackToDefaults = defaultMediaState.gameplay && defaultMediaState.music;
    if (!canFallbackToDefaults) {
      setStatus("Upload gameplay/music or use previously saved defaults.", true);
      return;
    }
  }

  if (saveAsDefaultsInput?.checked && (!gameplay || !music)) {
    setStatus("To save defaults, upload both gameplay and music files.", true);
    return;
  }

  const formData = new FormData();
  formData.append("storyTitle", storyTitleInput.value);
  formData.append("storyText", storyTextInput.value);
  formData.append("musicVolume", document.getElementById("music-volume").value);
  formData.append("ttsSpeed", document.getElementById("tts-speed").value);
  formData.append("ttsPitch", ttsPitchInput.value);
  formData.append("voiceId", voiceSelect.value);
  formData.append("subtitlePreset", document.getElementById("subtitle-preset").value);
  formData.append("subtitleEffect", document.getElementById("subtitle-effect").value);
  if (gameplay) formData.append("gameplay", gameplay);
  if (music) formData.append("music", music);

  setStatus("Creating video. This can take 30-120 seconds depending on file sizes...");
  setPreviewIdleState();
  downloadLink.hidden = true;
  setGeneratingState(true);
  startGenerationFeedback();

  try {
    if (saveAsDefaultsInput?.checked) {
      await saveDefaultMediaFromFiles(gameplay, music);
    }

    let response;
    try {
      response = await fetch("/api/video/create", {
        method: "POST",
        body: formData,
      });
    } catch (networkError) {
      backendOnline = false;
      updateConnectionBadge(false, "Backend status: offline");
      const backendReachable = await isBackendReachable();
      if (!backendReachable) {
        throw new Error("Cannot reach /api/video/create. Backend is offline. Start it with 'npm run dev' and keep that terminal open.");
      }
      throw new Error("Cannot reach /api/video/create due to a browser/network issue. Refresh once and try again.");
    }

    const raw = await response.text();
    let data = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (parseError) {
      data = { ok: false, error: raw || "Video generation failed." };
    }

    if (!response.ok || !data.ok) {
      const message = data.detail ? `${data.error || "Video generation failed."} ${data.detail}` : (data.error || "Video generation failed.");
      throw new Error(message);
    }

    downloadLink.href = data.videoUrl;
    downloadLink.download = "reddit-story-video.mp4";
    downloadLink.hidden = false;

    await loadResultVideo(data.videoUrl);

    setStatus(data.warning ? `Video created successfully. ${data.warning}` : "Video created successfully.");
    playCompletionBell();
    await notifyCompletion("Your video has finished generating.");
    stopGenerationFeedback(true);
  } catch (error) {
    setStatus(error.message, true);
    stopGenerationFeedback(false);
  } finally {
    setGeneratingState(false);
  }
});

startBackendMonitoring();
bindDropZones();
initializeThemeToggle();
initializeQuickTipsCarousel();
