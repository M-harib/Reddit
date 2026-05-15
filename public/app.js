/* ═══════════════════════════════════════════════
   KarmaTok — app.js
   Multi-page SPA: Landing → Step 1 → Step 2 → Step 3
═══════════════════════════════════════════════ */

/* ── Element refs ────────────────────────────── */
const viewLanding   = document.getElementById("view-landing");
const viewCreator   = document.getElementById("view-creator");
const step1El       = document.getElementById("step-1");
const step2El       = document.getElementById("step-2");
const step3El       = document.getElementById("step-3");
const stepTrack     = document.getElementById("step-track");

// Landing CTAs
const ctaNavBtn    = document.getElementById("cta-nav-btn");
const ctaHeroBtn   = document.getElementById("cta-hero-btn");
const ctaFooterBtn = document.getElementById("cta-footer-btn");

// Creator nav
const creatorHomeBtn = document.getElementById("creator-home-btn");
const connectionStatusEl = document.getElementById("connection-status");

// Step 1
const fetchForm          = document.getElementById("fetch-form");
const storiesContainer   = document.getElementById("stories");
const storyTitleInput    = document.getElementById("story-title");      // hidden
const storyTextInput     = document.getElementById("story-text");       // hidden
const selectedBanner     = document.getElementById("selected-banner");
const selectedTitleText  = document.getElementById("selected-title-text");
const clearStoryBtn      = document.getElementById("clear-story-btn");
const writeTitleInput    = document.getElementById("write-title");
const writeTextInput     = document.getElementById("write-text");
const useWriteBtn        = document.getElementById("use-write-btn");
const step1BackBtn       = document.getElementById("step1-back");
const step1NextBtn       = document.getElementById("step1-next");

// Step 2
const voiceSelect         = document.getElementById("voice-id");
const ttsSpeedSelect      = document.getElementById("tts-speed");
const ttsPitchInput       = document.getElementById("tts-pitch");
const ttsPitchValue       = document.getElementById("tts-pitch-value");
const previewVoiceBtn     = document.getElementById("preview-voice-btn");
const voicePreviewPlayer  = document.getElementById("voice-preview-player");
const insightWords        = document.getElementById("insight-words");
const insightDuration     = document.getElementById("insight-duration");
const quickPackGrid       = document.getElementById("quick-pack-grid");
const subtitlePresetInput = document.getElementById("subtitle-preset");
const captionStyleGrid    = document.getElementById("caption-style-grid");
const subtitleEffectSelect = document.getElementById("subtitle-effect");
const musicVolumeInput    = document.getElementById("music-volume");
const gameplayInput       = document.getElementById("gameplay");
const musicInput          = document.getElementById("music");
const saveAsDefaultsInput = document.getElementById("save-as-defaults");
const saveDefaultMediaBtn = document.getElementById("save-default-media-btn");
const defaultMediaStatus  = document.getElementById("default-media-status");
const defaultMediaFiles   = document.getElementById("default-media-files");
const step2BackBtn        = document.getElementById("step2-back");
const step2NextBtn        = document.getElementById("step2-next");

// Step 3
const generateBtn            = document.getElementById("generate-btn");
const generateBtnLabel       = document.getElementById("generate-btn-label");
const statusEl               = document.getElementById("status");
const generationProgress     = document.getElementById("generation-progress");
const generationStage        = document.getElementById("generation-stage");
const generationElapsed      = document.getElementById("generation-elapsed");
const generationProgressFill = document.getElementById("generation-progress-fill");
const generationPercent      = document.getElementById("generation-percent");
const resultSection          = document.getElementById("result-section");
const previewPlaceholder     = document.getElementById("preview-placeholder");
const previewProgressFill    = document.getElementById("preview-progress-fill");
const resultVideo            = document.getElementById("result-video");
const downloadLink           = document.getElementById("download-link");
const step3BackBtn           = document.getElementById("step3-back");
const startOverBtn           = document.getElementById("start-over-btn");

// Summary fields
const summaryTitle    = document.getElementById("summary-title");
const summaryVoice    = document.getElementById("summary-voice");
const summaryCaptions = document.getElementById("summary-captions");
const summaryLength   = document.getElementById("summary-length");

/* ── Constants ───────────────────────────────── */
const SETTINGS_KEY           = "storyforgeSettingsV1";
const VOICE_PREVIEW_CACHE_PREFIX = "karmatokVoicePreview:";
const SAMPLE_PREVIEW_TEXT    = "This is a voice preview for your Reddit story video. Let's make this sound amazing.";
const CHANNEL_URL_KEY        = "karmatokChannelUrlV1";

const QUICK_PACKS = {
  viral:   { subtitlePreset: "viral",     subtitleEffect: "pop",    ttsSpeed: "1",    ttsPitch: "1",  musicVolume: "0.17" },
  cinema:  { subtitlePreset: "cinematic", subtitleEffect: "fade",   ttsSpeed: "0.75", ttsPitch: "0",  musicVolume: "0.12" },
  gaming:  { subtitlePreset: "comic",     subtitleEffect: "wiggle", ttsSpeed: "1.25", ttsPitch: "2",  musicVolume: "0.2"  },
  minimal: { subtitlePreset: "minimal",   subtitleEffect: "none",   ttsSpeed: "1",    ttsPitch: "0",  musicVolume: "0.1"  },
};

/* ── State ───────────────────────────────────── */
let currentStep          = 0;    // 0=landing, 1-3=steps
let progressTimer        = null;
let elapsedTimer         = null;
let activeCaptionCards   = [];
let activeQuickPackBtns  = [];
let defaultMediaState    = { gameplay: false, music: false };
let currentPreviewObjectUrl = null;
let audioContextRef      = null;
let backendOnline        = false;
let generationBusy       = false;
let fetchBusy            = false;
let connectionTimer      = null;
let lastKnownBackendOnline = null;
let voicePreviewWarmTimeout = null;
const voicePreviewCache  = new Map();

/* ════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════ */

function showView(view) {
  viewLanding.hidden  = view !== "landing";
  viewCreator.hidden  = view !== "creator";
  window.scrollTo(0, 0);
}

function showStep(n) {
  step1El.hidden = n !== 1;
  step2El.hidden = n !== 2;
  step3El.hidden = n !== 3;
  currentStep = n;
  updateStepTrack(n);
  window.scrollTo(0, 0);
}

function updateStepTrack(n) {
  if (!stepTrack) return;
  const items     = stepTrack.querySelectorAll(".step-item");
  const dividers  = stepTrack.querySelectorAll(".step-divider");

  items.forEach((item) => {
    const s = Number(item.dataset.step);
    item.classList.toggle("is-active", s === n);
    item.classList.toggle("is-done",   s < n);
    if (s === n) {
      item.querySelector(".step-bubble").textContent = s;
    } else if (s < n) {
      item.querySelector(".step-bubble").textContent = "✓";
    } else {
      item.querySelector(".step-bubble").textContent = s;
    }
  });

  dividers.forEach((div, i) => {
    div.classList.toggle("is-done", i < n - 1);
  });
}

function goToCreator() {
  showView("creator");
  showStep(1);
  if (!backendOnline) checkBackendHealth();
}

function goToLanding() {
  showView("landing");
  currentStep = 0;
}

// CTA buttons
[ctaNavBtn, ctaHeroBtn, ctaFooterBtn].forEach((btn) => {
  if (btn) btn.addEventListener("click", goToCreator);
});

// Creator home button
if (creatorHomeBtn) {
  creatorHomeBtn.addEventListener("click", goToLanding);
}

// Step back/next
step1BackBtn.addEventListener("click", goToLanding);
step1NextBtn.addEventListener("click", () => { updateScriptInsights(); showStep(2); });
step2BackBtn.addEventListener("click", () => showStep(1));
step2NextBtn.addEventListener("click", () => { populateSummary(); setStatus(""); showStep(3); });
step3BackBtn.addEventListener("click", () => showStep(2));
startOverBtn.addEventListener("click", () => {
  resetStory();
  resetResult();
  showView("landing");
});

/* ── Story tabs ──────────────────────────────── */
const storyTabs   = document.querySelectorAll(".story-tab");
const tabBrowse   = document.getElementById("tab-browse");
const tabWrite    = document.getElementById("tab-write");

storyTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    storyTabs.forEach((t) => {
      t.classList.toggle("is-active", t === tab);
      t.setAttribute("aria-selected", String(t === tab));
    });
    tabBrowse.hidden = tab.dataset.tab !== "browse";
    tabWrite.hidden  = tab.dataset.tab !== "write";
  });
});

// Use-write button
if (useWriteBtn) {
  useWriteBtn.addEventListener("click", () => {
    const title = (writeTitleInput?.value || "").trim();
    const text  = (writeTextInput?.value || "").trim();
    if (!title || !text) {
      alert("Please enter both a title and a script.");
      return;
    }
    selectStory(title, text);
    showStep(2);
  });
}

/* ── Story selection ─────────────────────────── */
function selectStory(title, text) {
  storyTitleInput.value = title;
  storyTextInput.value  = text;
  selectedTitleText.textContent = title;
  selectedBanner.hidden = false;
  step1NextBtn.disabled = false;
  updateScriptInsights();
}

function resetStory() {
  storyTitleInput.value = "";
  storyTextInput.value  = "";
  if (selectedTitleText) selectedTitleText.textContent = "";
  if (selectedBanner)    selectedBanner.hidden = true;
  step1NextBtn.disabled = true;
}

if (clearStoryBtn) {
  clearStoryBtn.addEventListener("click", resetStory);
}

/* ── Populate Step 3 summary ─────────────────── */
function populateSummary() {
  const title   = storyTitleInput.value || "—";
  const voiceEl = voiceSelect?.options[voiceSelect.selectedIndex];
  const voice   = voiceEl ? voiceEl.text : "—";
  const preset  = subtitlePresetInput?.value || "—";
  const effect  = subtitleEffectSelect?.value || "none";
  const { words, seconds } = estimateNarrationSeconds(storyTextInput.value, ttsSpeedSelect.value);

  summaryTitle.textContent    = title.length > 60 ? title.slice(0, 57) + "…" : title;
  summaryVoice.textContent    = `${voice} · Speed ${ttsSpeedSelect?.value || 1}×`;
  summaryCaptions.textContent = `${preset} · ${effect === "none" ? "no animation" : effect}`;
  summaryLength.textContent   = `${words} words · ~${formatDuration(seconds)}`;
}

/* ── Reset result area ───────────────────────── */
function resetResult() {
  setStatus("");
  if (generationProgress) generationProgress.hidden = true;
  if (resultSection) resultSection.hidden = true;
  if (downloadLink) downloadLink.hidden = true;
  if (resultVideo) { resultVideo.pause(); resultVideo.hidden = true; resultVideo.removeAttribute("src"); }
  if (currentPreviewObjectUrl) { URL.revokeObjectURL(currentPreviewObjectUrl); currentPreviewObjectUrl = null; }
}

/* ════════════════════════════════════════════════
   STATUS & CONTROLS
════════════════════════════════════════════════ */

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function updateConnectionBadge(isOnline, message) {
  if (!connectionStatusEl) return;
  connectionStatusEl.textContent = message;
  connectionStatusEl.classList.toggle("is-online",  isOnline);
  connectionStatusEl.classList.toggle("is-offline", !isOnline);
}

function refreshControlStates() {
  const shouldDisable = !backendOnline || generationBusy;

  if (fetchForm) {
    const fetchBtn = fetchForm.querySelector("button[type='submit']");
    if (fetchBtn) fetchBtn.disabled = !backendOnline || fetchBusy;
  }

  if (generateBtn)    generateBtn.disabled    = shouldDisable;
  if (previewVoiceBtn) previewVoiceBtn.disabled = shouldDisable;
  if (saveDefaultMediaBtn) saveDefaultMediaBtn.disabled = shouldDisable;
}

/* ════════════════════════════════════════════════
   BACKEND HEALTH
════════════════════════════════════════════════ */

async function checkBackendHealth() {
  try {
    const res = await fetch(`/health?t=${Date.now()}`, { cache: "no-store" });
    backendOnline = res.ok;
    updateConnectionBadge(backendOnline, backendOnline ? "Backend: online" : "Backend: offline");
    if (!backendOnline) {
      setStatus("Backend is offline. Start it with 'npm run dev'.", true);
    } else if (lastKnownBackendOnline !== true) {
      loadDefaultMediaState();
      loadVoices();
    }
    lastKnownBackendOnline = backendOnline;
  } catch {
    backendOnline = false;
    updateConnectionBadge(false, "Backend: offline");
    lastKnownBackendOnline = false;
  }
  refreshControlStates();
}

function startBackendMonitoring() {
  checkBackendHealth();
  if (connectionTimer) clearInterval(connectionTimer);
  connectionTimer = setInterval(checkBackendHealth, 6000);
}

async function isBackendReachable() {
  try { return (await fetch(`/health?t=${Date.now()}`, { cache: "no-store" })).ok; }
  catch { return false; }
}

/* ════════════════════════════════════════════════
   VOICES
════════════════════════════════════════════════ */

async function loadVoices() {
  try {
    const res  = await fetch("/api/video/voices");
    const data = await res.json();
    if (!res.ok || !data.ok || !Array.isArray(data.voices)) return;

    voiceSelect.innerHTML = "";
    data.voices.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.id;
      opt.textContent = v.label;
      if (v.id === "jessie-style") opt.selected = true;
      voiceSelect.appendChild(opt);
    });

    try {
      const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (saved.voiceId && data.voices.some((v) => v.id === saved.voiceId)) {
        voiceSelect.value = saved.voiceId;
      }
    } catch { /* ignore */ }
  } catch { /* keep default */ }
  finally { scheduleVoicePreviewWarm(); }
}

/* ════════════════════════════════════════════════
   VOICE PREVIEW
════════════════════════════════════════════════ */

function getVoicePreviewKey() {
  return JSON.stringify({
    voiceId:     voiceSelect.value,
    ttsSpeed:    ttsSpeedSelect.value,
    ttsPitch:    ttsPitchInput.value,
    previewText: SAMPLE_PREVIEW_TEXT,
  });
}

function getStoredPreviewUrl(key) {
  if (voicePreviewCache.has(key)) return voicePreviewCache.get(key);
  try {
    const stored = localStorage.getItem(VOICE_PREVIEW_CACHE_PREFIX + key);
    if (stored) { voicePreviewCache.set(key, stored); return stored; }
  } catch { /* ignore */ }
  return "";
}

function storePreviewUrl(key, url) {
  voicePreviewCache.set(key, url);
  try { localStorage.setItem(VOICE_PREVIEW_CACHE_PREFIX + key, url); } catch { /* ignore */ }
}

function clearStoredPreviewUrl(key) {
  voicePreviewCache.delete(key);
  try { localStorage.removeItem(VOICE_PREVIEW_CACHE_PREFIX + key); } catch { /* ignore */ }
}

async function requestVoicePreviewUrl() {
  const res = await fetch("/api/video/preview-voice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voiceId:     voiceSelect.value,
      ttsSpeed:    ttsSpeedSelect.value,
      ttsPitch:    ttsPitchInput.value,
      previewText: SAMPLE_PREVIEW_TEXT,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || "Could not generate preview.");
  return { previewUrl: data.previewUrl, warning: data.warning };
}

function scheduleVoicePreviewWarm() {
  if (!backendOnline) return;
  if (voicePreviewWarmTimeout) clearTimeout(voicePreviewWarmTimeout);
  voicePreviewWarmTimeout = setTimeout(async () => {
    const key = getVoicePreviewKey();
    if (getStoredPreviewUrl(key)) return;
    try {
      const gen = await requestVoicePreviewUrl();
      storePreviewUrl(key, gen.previewUrl);
    } catch { /* best-effort */ }
  }, 140);
}

if (previewVoiceBtn) {
  previewVoiceBtn.addEventListener("click", async () => {
    if (!backendOnline) { setStatus("Backend is offline.", true); return; }
    try {
      previewVoiceBtn.disabled = true;
      const key = getVoicePreviewKey();
      let previewUrl = getStoredPreviewUrl(key);
      let warning = "";
      if (!previewUrl) {
        setStatus("Generating voice sample…");
        const gen = await requestVoicePreviewUrl();
        previewUrl = gen.previewUrl;
        warning    = gen.warning || "";
        storePreviewUrl(key, previewUrl);
      }
      voicePreviewPlayer.pause();
      voicePreviewPlayer.currentTime = 0;
      voicePreviewPlayer.src = previewUrl;
      voicePreviewPlayer.hidden = false;
      await voicePreviewPlayer.play();
      setStatus(warning ? `Voice preview ready. ${warning}` : "Playing voice sample.");
    } catch (err) {
      clearStoredPreviewUrl(getVoicePreviewKey());
      setStatus(err.message, true);
    } finally {
      previewVoiceBtn.disabled = false;
    }
  });
}

[voiceSelect, ttsSpeedSelect, ttsPitchInput].forEach((el) => {
  el.addEventListener("change", () => {
    scheduleVoicePreviewWarm();
    // Hide stale preview when settings change
    if (voicePreviewPlayer && !voicePreviewPlayer.hidden) {
      voicePreviewPlayer.pause();
      voicePreviewPlayer.hidden = true;
    }
  });
});

/* ════════════════════════════════════════════════
   SETTINGS PERSISTENCE
════════════════════════════════════════════════ */

function saveSettings() {
  const settings = {
    voiceId:        voiceSelect.value,
    ttsSpeed:       ttsSpeedSelect.value,
    ttsPitch:       ttsPitchInput.value,
    subtitlePreset: subtitlePresetInput.value,
    subtitleEffect: subtitleEffectSelect.value,
    musicVolume:    musicVolumeInput.value,
  };
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.ttsSpeed)       ttsSpeedSelect.value      = s.ttsSpeed;
    if (s.ttsPitch != null) ttsPitchInput.value      = s.ttsPitch;
    if (s.subtitleEffect) subtitleEffectSelect.value = s.subtitleEffect;
    if (s.musicVolume)    musicVolumeInput.value     = s.musicVolume;
    if (s.subtitlePreset) {
      subtitlePresetInput.value = s.subtitlePreset;
      setCaptionPreset(s.subtitlePreset);
    }
    updatePitchLabel();
  } catch { /* ignore */ }
}

/* ════════════════════════════════════════════════
   CAPTION PRESETS
════════════════════════════════════════════════ */

function setCaptionPreset(preset) {
  if (subtitlePresetInput) subtitlePresetInput.value = preset;
  activeCaptionCards.forEach((card) => {
    card.classList.toggle("active", card.dataset.preset === preset);
  });
}

if (captionStyleGrid && subtitlePresetInput) {
  activeCaptionCards = Array.from(captionStyleGrid.querySelectorAll(".caption-style-card"));
  activeCaptionCards.forEach((card) => {
    card.addEventListener("click", () => {
      setCaptionPreset(card.dataset.preset || "viral");
      saveSettings();
    });
  });
  setCaptionPreset(subtitlePresetInput.value || "viral");
}

/* ════════════════════════════════════════════════
   QUICK PACKS
════════════════════════════════════════════════ */

function setQuickPackActive(name) {
  activeQuickPackBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.pack === name);
  });
}

function applyQuickPack(name) {
  const pack = QUICK_PACKS[name];
  if (!pack) return;
  ttsSpeedSelect.value       = pack.ttsSpeed;
  ttsPitchInput.value        = pack.ttsPitch;
  subtitleEffectSelect.value = pack.subtitleEffect;
  musicVolumeInput.value     = pack.musicVolume;
  setCaptionPreset(pack.subtitlePreset);
  setQuickPackActive(name);
  updatePitchLabel();
  updateScriptInsights();
  saveSettings();
}

if (quickPackGrid) {
  activeQuickPackBtns = Array.from(quickPackGrid.querySelectorAll(".quick-pack"));
  activeQuickPackBtns.forEach((btn) => {
    btn.addEventListener("click", () => applyQuickPack(btn.dataset.pack));
  });
}

/* ════════════════════════════════════════════════
   SCRIPT INSIGHTS
════════════════════════════════════════════════ */

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function formatDuration(total) {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function estimateNarrationSeconds(text, speed) {
  const words    = (text || "").trim().split(/\s+/).filter(Boolean).length;
  const safeSpd  = clamp(Number(speed) || 1, 0.5, 2);
  const seconds  = words ? (words / (150 * safeSpd)) * 60 : 0;
  return { words, seconds };
}

function updateScriptInsights() {
  const { words, seconds } = estimateNarrationSeconds(storyTextInput.value, ttsSpeedSelect.value);
  if (insightWords)    insightWords.textContent    = `${words} words`;
  if (insightDuration) insightDuration.textContent = `Est. ${formatDuration(seconds)}`;
}

if (ttsSpeedSelect) ttsSpeedSelect.addEventListener("change", updateScriptInsights);
updateScriptInsights();

/* ── Pitch label ─────────────────────────────── */
function updatePitchLabel() {
  const v = Number(ttsPitchInput.value) || 0;
  ttsPitchValue.textContent = `${v > 0 ? "+" : ""}${v} st`;
}
ttsPitchInput.addEventListener("input", () => {
  updatePitchLabel();
  // Hide stale preview so user knows the sample no longer reflects current settings
  if (voicePreviewPlayer && !voicePreviewPlayer.hidden) {
    voicePreviewPlayer.pause();
    voicePreviewPlayer.hidden = true;
  }
});
updatePitchLabel();

/* ── Settings auto-save ──────────────────────── */
[voiceSelect, ttsSpeedSelect, ttsPitchInput, subtitleEffectSelect, musicVolumeInput].forEach((el) => {
  el.addEventListener("change", saveSettings);
});

/* ════════════════════════════════════════════════
   DROP ZONES
════════════════════════════════════════════════ */

function setDropZoneFile(input) {
  if (!input?.id) return;
  const label = document.querySelector(`[data-file-for="${input.id}"]`);
  if (!label) return;
  label.textContent = input.files?.[0] ? input.files[0].name : "No file selected";
}

function bindDropZones() {
  document.querySelectorAll(".drop-zone").forEach((zone) => {
    const input = zone.querySelector('input[type="file"]');
    if (!input) return;

    input.addEventListener("change", () => setDropZoneFile(input));

    zone.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      try {
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        input.files = dt.files;
      } catch { /* ignore */ }
      setDropZoneFile(input);
    });

    setDropZoneFile(input);
  });
}

/* ════════════════════════════════════════════════
   DEFAULT MEDIA
════════════════════════════════════════════════ */

function setDefaultMediaStatusText(msg, isError = false) {
  if (!defaultMediaStatus) return;
  defaultMediaStatus.textContent   = msg;
  defaultMediaStatus.style.color   = isError ? "#ff6b6b" : "";
}

function setDefaultMediaFilesText(gameplay, music) {
  if (!defaultMediaFiles) return;
  defaultMediaFiles.textContent =
    `${gameplay ? "Gameplay: " + gameplay : "Gameplay: not saved"} · ${music ? "Music: " + music : "Music: not saved"}`;
}

async function loadDefaultMediaState() {
  try {
    const res  = await fetch("/api/video/default-media");
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || "Failed to load defaults.");

    defaultMediaState = {
      gameplay: Boolean(data.defaults?.gameplay),
      music:    Boolean(data.defaults?.music),
    };

    if (defaultMediaState.gameplay && defaultMediaState.music) {
      setDefaultMediaStatusText("Default media ready — gameplay and music saved.");
    } else if (defaultMediaState.gameplay || defaultMediaState.music) {
      setDefaultMediaStatusText("Partial defaults saved. Add the missing file for full auto mode.");
    } else {
      setDefaultMediaStatusText("No defaults saved yet.");
    }

    setDefaultMediaFilesText(data.defaults?.gameplayFile, data.defaults?.musicFile);
  } catch {
    setDefaultMediaStatusText("Could not load default media status.", true);
  }
}

async function saveDefaultMediaFromFiles(gpFile, mxFile) {
  if (!backendOnline) throw new Error("Backend is offline.");
  if (!gpFile && !mxFile) throw new Error("Choose at least one file to save.");

  const fd = new FormData();
  if (gpFile) fd.append("gameplay", gpFile);
  if (mxFile) fd.append("music",    mxFile);

  setDefaultMediaStatusText("Saving defaults…");
  const res  = await fetch("/api/video/default-media", { method: "POST", body: fd });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || "Failed to save defaults.");
  await loadDefaultMediaState();
}

if (saveDefaultMediaBtn) {
  saveDefaultMediaBtn.addEventListener("click", async () => {
    const gpFile = gameplayInput?.files?.[0];
    const mxFile = musicInput?.files?.[0];
    try {
      saveDefaultMediaBtn.disabled = true;
      await saveDefaultMediaFromFiles(gpFile, mxFile);
      setDefaultMediaStatusText("Defaults saved successfully.");
    } catch (err) {
      setDefaultMediaStatusText(err.message, true);
    } finally {
      saveDefaultMediaBtn.disabled = false;
    }
  });
}

/* ════════════════════════════════════════════════
   REDDIT FETCH
════════════════════════════════════════════════ */

function createStoryCard(story) {
  const card = document.createElement("article");
  card.className = "story-card";
  const preview = story.selftext.slice(0, 380);
  card.innerHTML = `
    <h3>${story.title}</h3>
    <p class="story-meta">r/${story.subreddit} · u/${story.author} · ${story.score} upvotes</p>
    <p>${preview}${story.selftext.length > 380 ? "…" : ""}</p>
    <button type="button">Use This Story</button>
  `;
  card.querySelector("button").addEventListener("click", () => {
    selectStory(story.title, story.selftext);
    showStep(2);
  });
  return card;
}

fetchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!backendOnline) { setStatus("Backend offline.", true); return; }

  const subreddit = document.getElementById("subreddit").value.trim() || "stories";
  const limit     = Number(document.getElementById("limit").value) || 8;

  fetchBusy = true;
  refreshControlStates();
  storiesContainer.innerHTML = `<p style="color:var(--text-2);font-size:13px;grid-column:1/-1">Fetching trending stories…</p>`;

  try {
    const res  = await fetch(`/api/reddit/trending?subreddit=${encodeURIComponent(subreddit)}&limit=${limit}&time=day`);
    const data = await res.json();

    if (!res.ok || !data.ok) throw new Error(data.error || "Could not fetch stories.");
    if (!data.stories.length) {
      storiesContainer.innerHTML = `<p style="color:var(--text-2);font-size:13px;grid-column:1/-1">No qualifying stories found. Try another topic.</p>`;
      return;
    }

    storiesContainer.innerHTML = "";
    data.stories.forEach((s) => storiesContainer.appendChild(createStoryCard(s)));
  } catch (err) {
    storiesContainer.innerHTML = `<p style="color:#ff6b6b;font-size:13px;grid-column:1/-1">${err.message}</p>`;
  } finally {
    fetchBusy = false;
    refreshControlStates();
  }
});

/* ════════════════════════════════════════════════
   VIDEO GENERATION PROGRESS
════════════════════════════════════════════════ */

function setPreviewProgress(val) {
  const clamped = Math.max(0, Math.min(100, Number(val) || 0));
  if (generationProgressFill) generationProgressFill.style.width = `${clamped}%`;
  if (previewProgressFill)    previewProgressFill.style.width    = `${clamped}%`;
  if (generationPercent)      generationPercent.textContent       = `${Math.round(clamped)}%`;
}

function startGenerationFeedback() {
  let progress = 8;
  let elapsed  = 0;
  const stages = [
    "Generating voiceover…",
    "Compositing video…",
    "Compositing video…",
    "Exporting MP4…",
  ];

  if (resultSection)    resultSection.hidden    = false;
  if (previewPlaceholder) previewPlaceholder.hidden = false;
  if (resultVideo)      resultVideo.hidden      = true;
  if (generationProgress) generationProgress.hidden = false;

  setPreviewProgress(progress);
  if (generationStage)   generationStage.textContent  = stages[0];
  if (generationElapsed) generationElapsed.textContent = "00:00";

  progressTimer = setInterval(() => {
    progress = Math.min(92, progress + Math.random() * 3.5);
    setPreviewProgress(progress);
    if (generationStage) {
      if      (progress > 78) generationStage.textContent = stages[3];
      else if (progress > 56) generationStage.textContent = stages[2];
      else if (progress > 28) generationStage.textContent = stages[1];
    }
  }, 900);

  elapsedTimer = setInterval(() => {
    elapsed += 1;
    if (generationElapsed) generationElapsed.textContent = formatDuration(elapsed);
  }, 1000);
}

function stopGenerationFeedback(completed) {
  if (progressTimer) { clearInterval(progressTimer); progressTimer = null; }
  if (elapsedTimer)  { clearInterval(elapsedTimer);  elapsedTimer  = null; }

  if (completed) {
    setPreviewProgress(100);
    if (generationStage) generationStage.textContent = "Done ✓";
    setTimeout(() => {
      if (generationProgress) generationProgress.hidden = true;
      if (previewPlaceholder) previewPlaceholder.hidden = true;
    }, 800);
  } else {
    if (generationProgress) generationProgress.hidden = true;
  }
}

/* ════════════════════════════════════════════════
   VIDEO LOAD
════════════════════════════════════════════════ */

function waitForVideoLoad(url, timeoutMs = 18000) {
  return new Promise((resolve, reject) => {
    let handle = null;
    const isReady = () => Number.isFinite(resultVideo.duration) && resultVideo.duration > 0;
    const cleanup = () => {
      resultVideo.removeEventListener("loadedmetadata", onLoad);
      resultVideo.removeEventListener("canplay",        onLoad);
      resultVideo.removeEventListener("error",          onErr);
      clearTimeout(handle);
    };
    const onLoad = () => { if (!isReady()) return; cleanup(); resolve(url); };
    const onErr  = () => { cleanup(); reject(new Error("Video preview load failed.")); };

    handle = setTimeout(() => { cleanup(); reject(new Error("Video preview timed out.")); }, timeoutMs);
    resultVideo.addEventListener("loadedmetadata", onLoad);
    resultVideo.addEventListener("canplay",        onLoad);
    resultVideo.addEventListener("error",          onErr, { once: true });
    resultVideo.src = url;
    resultVideo.load();
  });
}

async function loadResultVideo(url) {
  const busted = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  if (currentPreviewObjectUrl) { URL.revokeObjectURL(currentPreviewObjectUrl); currentPreviewObjectUrl = null; }
  resultVideo.pause();
  resultVideo.hidden = true;
  resultVideo.removeAttribute("src");
  resultVideo.load();

  try {
    await waitForVideoLoad(busted);
  } catch {
    const res  = await fetch(busted, { cache: "no-store" });
    if (!res.ok) throw new Error("Video created but preview could not load.");
    const blob = await res.blob();
    currentPreviewObjectUrl = URL.createObjectURL(blob);
    await waitForVideoLoad(currentPreviewObjectUrl);
  }
}

/* ════════════════════════════════════════════════
   GENERATE BUTTON
════════════════════════════════════════════════ */

function setGenerating(busy) {
  generationBusy = busy;
  if (generateBtn) {
    generateBtn.disabled = busy || !backendOnline;
    generateBtnLabel.textContent = busy ? "Rendering…" : "Generate Video";
  }
  refreshControlStates();
}

/* Completion bell */
function ensureAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) return null;
  if (!audioContextRef) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioContextRef = new Ctx();
  }
  if (audioContextRef.state === "suspended") audioContextRef.resume().catch(() => {});
  return audioContextRef;
}

function playCompletionBell() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now    = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
  master.connect(ctx.destination);
  const base = ctx.createOscillator();
  base.type = "sine";
  base.frequency.setValueAtTime(880, now);
  base.frequency.exponentialRampToValueAtTime(660, now + 1.1);
  const harm = ctx.createOscillator();
  harm.type = "triangle";
  harm.frequency.setValueAtTime(1320, now);
  harm.frequency.exponentialRampToValueAtTime(990, now + 1.0);
  const harmGain = ctx.createGain();
  harmGain.gain.setValueAtTime(0.22, now);
  harmGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
  base.connect(master);
  harm.connect(harmGain);
  harmGain.connect(master);
  base.start(now); harm.start(now);
  base.stop(now + 1.25); harm.stop(now + 1.0);
}

if (generateBtn) {
  generateBtn.addEventListener("click", async () => {
    ensureAudioContext();
    if (!backendOnline) { setStatus("Backend is offline.", true); return; }

    const title    = storyTitleInput.value;
    const text     = storyTextInput.value;
    const gameplay = gameplayInput?.files?.[0];
    const music    = musicInput?.files?.[0];

    if (!title || !text) { setStatus("No story selected. Go back to Step 1.", true); return; }

    const canFallback = defaultMediaState.gameplay && defaultMediaState.music;
    if (!gameplay || !music) {
      if (!canFallback) { setStatus("Upload gameplay/music or save defaults first.", true); return; }
    }

    if (saveAsDefaultsInput?.checked && !gameplay && !music) {
      setStatus("Upload at least one file to save as defaults.", true);
      return;
    }

    resetResult();
    setStatus("Creating video — this takes 30–90 seconds…");
    setGenerating(true);
    startGenerationFeedback();

    try {
      if (saveAsDefaultsInput?.checked) {
        await saveDefaultMediaFromFiles(gameplay, music);
      }

      const fd = new FormData();
      fd.append("storyTitle",     title);
      fd.append("storyText",      text);
      fd.append("musicVolume",    musicVolumeInput.value);
      fd.append("ttsSpeed",       ttsSpeedSelect.value);
      fd.append("ttsPitch",       ttsPitchInput.value);
      fd.append("voiceId",        voiceSelect.value);
      fd.append("subtitlePreset", subtitlePresetInput.value);
      fd.append("subtitleEffect", subtitleEffectSelect.value);
      if (gameplay) fd.append("gameplay", gameplay);
      if (music)    fd.append("music",    music);

      let res;
      try {
        res = await fetch("/api/video/create", { method: "POST", body: fd });
      } catch (netErr) {
        backendOnline = false;
        updateConnectionBadge(false, "Backend: offline");
        const alive = await isBackendReachable();
        throw new Error(alive
          ? "Network error on /api/video/create. Refresh once and try again."
          : "Cannot reach backend. Start it with 'npm run dev'."
        );
      }

      const raw  = await res.text();
      let data   = {};
      try { data = raw ? JSON.parse(raw) : {}; }
      catch { data = { ok: false, error: raw || "Video generation failed." }; }

      if (!res.ok || !data.ok) {
        throw new Error(data.detail ? `${data.error} ${data.detail}` : (data.error || "Video generation failed."));
      }

      downloadLink.href     = data.videoUrl;
      downloadLink.download = "reddit-story-video.mp4";
      downloadLink.hidden   = false;

      if (resultSection) resultSection.hidden = false;
      await loadResultVideo(data.videoUrl);
      resultVideo.hidden = false;

      setStatus(data.warning ? `Done! ${data.warning}` : "Video created successfully.");
      playCompletionBell();
      stopGenerationFeedback(true);
    } catch (err) {
      setStatus(err.message, true);
      stopGenerationFeedback(false);
    } finally {
      setGenerating(false);
    }
  });
}

/* ════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════ */

loadSavedSettings();
bindDropZones();
loadDefaultMediaState();
startBackendMonitoring();
