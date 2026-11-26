// ==========================================================================
// SignTalk AI - Studio Application Engine (Alphabet Recognition & Learning)
// ==========================================================================

// ---- Default Settings & State ----
let CONFIG = {
  predictIntervalMs: 60,
  holdFrames: 4,
  minConfidence: 0.65,
  soundEffects: true,
  skeletonStyle: "cyber", // cyber, emerald, minimal, hidden
  mirrored: true,
  configVersion: 2,
};

// Load saved config (upgrade v1 slower defaults once to v2 fast defaults)
try {
  const saved = localStorage.getItem("signtalk_config");
  if (saved) {
    const parsed = JSON.parse(saved);
    if (!parsed.configVersion || parsed.configVersion < 2) {
      CONFIG = {
        ...CONFIG,
        soundEffects: parsed.soundEffects ?? CONFIG.soundEffects,
        skeletonStyle: parsed.skeletonStyle ?? CONFIG.skeletonStyle,
        mirrored: parsed.mirrored ?? CONFIG.mirrored,
        configVersion: 2,
      };
      localStorage.setItem("signtalk_config", JSON.stringify(CONFIG));
    } else {
      CONFIG = { ...CONFIG, ...parsed };
    }
  }
} catch (e) {
  console.warn("Could not load config from localStorage", e);
}

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const CDN_BASES = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14",
  "https://unpkg.com/@mediapipe/tasks-vision@0.10.14",
];

const WORDS = (
  "hello help please thank thanks yes no sorry good morning night evening name " +
  "water food home school college hospital doctor medicine money bank phone friend family " +
  "mother father brother sister teacher student book pen paper computer internet work office " +
  "market bus train station road city village india delhi mumbai today tomorrow yesterday " +
  "time what where when why how who which need want like love eat drink sleep come go stop " +
  "wait open close start finish understand know learn study read write speak listen see " +
  "happy sad angry tired hungry thirsty sick fine well welcome meet again later now here " +
  "there this that with without very more less big small hot cold new old"
).split(" ");

// Safe element getter helper
function getEl(id) {
  return document.getElementById(id);
}

// ---- DOM Elements ----
const videoContainer = getEl("videoContainer");
const video = getEl("video");
const canvas = getEl("overlay");
const ctx = canvas ? canvas.getContext("2d") : null;
const lockWave = getEl("lockWave");
const statusDot = document.querySelector(".status-dot");
const statusText = getEl("statusText");
const badgeStatus = getEl("badgeStatus");
const badgeHands = getEl("badgeHands");
const handsText = getEl("handsText");
const badgeFps = getEl("badgeFps");
const badgeLatency = getEl("badgeLatency");
const lightingWarning = getEl("lightingWarning");
const handGuideOverlay = getEl("handGuideOverlay");
const handGuideText = getEl("handGuideText");

const lightingMonitor = window.SignTalkUX?.createLightingMonitor({
  videoEl: video,
  warningEl: lightingWarning,
});
const handGuide = window.SignTalkUX?.createHandGuideController({
  overlayEl: handGuideOverlay,
  textEl: handGuideText,
});

// Camera Error Recovery Elements
const cameraErrorOverlay = getEl("cameraErrorOverlay");
const cameraErrorTitle = getEl("cameraErrorTitle");
const cameraErrorDesc = getEl("cameraErrorDesc");
const btnRetryCamera = getEl("btnRetryCamera");

// Recognition HUD
const letterEl = getEl("letter");
const ringProgressCircle = getEl("ringProgressCircle");
const confidenceTag = getEl("confidenceTag");
const holdBar = getEl("holdBar");
const holdFramesText = getEl("holdFramesText");
const candidatesList = getEl("candidatesList");

// Translator Elements
const textEl = getEl("text");
const charCount = getEl("charCount");
const wordCount = getEl("wordCount");
const suggestionsEl = getEl("suggestions");
const autoSpeak = getEl("chkAutoSpeak");
const voiceSelect = getEl("voiceSelect");
const rateSlider = getEl("speechRateSlider");
const rateVal = getEl("rateVal");
const btnSpeak = getEl("btnSpeak");
const btnSpace = getEl("btnSpace");
const btnBackspace = getEl("btnBackspace");
const btnCopy = getEl("btnCopy");
const btnSaveWord = getEl("btnSaveWord");
const btnClear = getEl("btnClear");
const savedWordsList = getEl("savedWordsList");
const savedWordsCount = getEl("savedWordsCount");
const btnExportSavedWords = getEl("btnExportSavedWords");
const btnClearSavedWords = getEl("btnClearSavedWords");

// Camera Controls
const languageSelect = getEl("languageSelect");
const cameraSelect = getEl("cameraSelect");
const btnPauseCam = getEl("btnPauseCam");
const iconPause = getEl("iconPause");
const iconPlay = getEl("iconPlay");
const btnMirrorCam = getEl("btnMirrorCam");
const btnToggleSkeleton = getEl("btnToggleSkeleton");
const btnCaptureFrame = getEl("btnCaptureFrame");
const btnStopCam = getEl("btnStopCam");

// Audio & Theme Controls
const btnAudioToggle = getEl("btnAudioToggle");
const iconSoundOn = getEl("iconSoundOn");
const iconSoundOff = getEl("iconSoundOff");
const btnThemeToggle = getEl("btnThemeToggle");

// Settings Modal Elements
const btnOpenSettings = getEl("btnOpenSettings");
const btnCloseSettings = getEl("btnCloseSettings");
const settingsModal = getEl("settingsModal");
const settingHoldFrames = getEl("settingHoldFrames");
const valHoldFrames = getEl("valHoldFrames");
const settingMinConf = getEl("settingMinConf");
const valMinConf = getEl("valMinConf");
const settingInterval = getEl("settingInterval");
const valInterval = getEl("valInterval");
const settingSkeletonStyle = getEl("settingSkeletonStyle");
const btnSaveSettings = getEl("btnSaveSettings");
const btnResetSettings = getEl("btnResetSettings");

// Toast
const toastEl = getEl("toast");

// Practice Arena Elements
const quizStreakEl = getEl("quizStreak");
const quizScoreEl = getEl("quizScore");
const quizAccuracyEl = getEl("quizAccuracy");
const quizTimerEl = getEl("quizTimer");
const quizTimerLabel = getEl("quizTimerLabel");
const quizBestStreakEl = getEl("quizBestStreak");
const quizComboBadge = getEl("quizComboBadge");
const btnModeEndless = getEl("btnModeEndless");
const btnModeBlitz = getEl("btnModeBlitz");
const challengeCard = getEl("challengeCard");
const challengeBurst = getEl("challengeBurst");
const challengeLiveFeed = getEl("challengeLiveFeed");
const challengeImg = getEl("challengeImg");
const challengeLetter = getEl("challengeLetter");
const challengeHint = getEl("challengeHint");
const challengeHoldText = getEl("challengeHoldText");
const challengeHoldBar = getEl("challengeHoldBar");
const challengeFeedback = getEl("challengeFeedback");
const btnSkipChallenge = getEl("btnSkipChallenge");
const btnResetQuiz = getEl("btnResetQuiz");
const btnNextChallenge = getEl("btnNextChallenge");

// Gallery Elements
const gallerySearch = getEl("gallerySearch");
const galleryCountBadge = getEl("galleryCountBadge");
const alphaQuickStrip = getEl("alphaQuickStrip");
const galleryGrid = getEl("galleryCardsGrid");
const btnOpenFullChartAsl = getEl("btnOpenFullChartAsl");
const btnOpenFullChartIsl = getEl("btnOpenFullChartIsl");
const btnToggleGalleryDiagram = getEl("btnToggleGalleryDiagram");

// Lightbox Elements
const signLightboxModal = getEl("signLightboxModal");
const btnCloseLightbox = getEl("btnCloseLightbox");
const lightboxBadge = getEl("lightboxBadge");
const lightboxTitle = getEl("lightboxTitle");
const lightboxImg = getEl("lightboxImg");
const lightboxSummary = getEl("lightboxSummary");
const lightboxSteps = getEl("lightboxSteps");
const lightboxTip = getEl("lightboxTip");
const btnPracticeThisSign = getEl("btnPracticeThisSign");

// Full Chart Modal Elements
const chartModal = getEl("chartModal");
const chartModalTitle = getEl("chartModalTitle");
const btnCloseChartModal = getEl("btnCloseChartModal");
const fullChartImg = getEl("fullChartImg");
const btnSwitchChartAsl = getEl("btnSwitchChartAsl");
const btnSwitchChartIsl = getEl("btnSwitchChartIsl");
const btnSwitchChartIslGov = getEl("btnSwitchChartIslGov");

// QR Modal Elements
const btnOpenQR = getEl("btnOpenQR");
const qrModal = getEl("qrModal");
const btnCloseQR = getEl("btnCloseQR");
const qrCodeContainer = getEl("qrCodeContainer");
const qrSyncStatus = getEl("qrSyncStatus");
const remoteCamOverlay = getEl("remoteCamOverlay");
const btnDisconnectMobile = getEl("btnDisconnectMobile");

// History Elements
const historyList = getEl("historyList");
const btnExportHistory = getEl("btnExportHistory");
const btnClearHistory = getEl("btnClearHistory");

const csrfMeta = document.querySelector('meta[name="csrf-token"]');
const csrfToken = csrfMeta ? csrfMeta.content : "";

let currentActiveLightboxSign = null;
let currentGalleryCategory = "all";
let currentAlphaFilter = null;
let dictionaryData = null;

// ---- Web Audio API Synthesizer ----
let audioCtx = null;
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playSoundTone(freq, type = "sine", duration = 0.08, gainVal = 0.08) {
  if (!CONFIG.soundEffects) return;
  try {
    const actx = getAudioContext();
    if (!actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, actx.currentTime);
    gain.gain.setValueAtTime(gainVal, actx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + duration);
    osc.connect(gain);
    gain.connect(actx.destination);
    osc.start();
    osc.stop(actx.currentTime + duration);
  } catch (e) {
    console.debug("Audio play error", e);
  }
}

function playTickSound() {
  playSoundTone(520, "triangle", 0.04, 0.04);
}

function playLockSound() {
  playSoundTone(587.33, "sine", 0.12, 0.12);
  setTimeout(() => playSoundTone(880, "sine", 0.18, 0.1), 60);
}

function playSuccessFanfare() {
  if (!CONFIG.soundEffects) return;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, idx) => {
    setTimeout(() => playSoundTone(freq, "sine", 0.22, 0.15), idx * 75);
  });
}

function playQuizMismatchTone() {
  playSoundTone(270, "triangle", 0.11, 0.08);
}

// Update sound toggle icon
function updateSoundButton() {
  if (!iconSoundOn || !iconSoundOff) return;
  if (CONFIG.soundEffects) {
    iconSoundOn.classList.remove("hidden");
    iconSoundOff.classList.add("hidden");
  } else {
    iconSoundOn.classList.add("hidden");
    iconSoundOff.classList.remove("hidden");
  }
}
updateSoundButton();

if (btnAudioToggle) {
  btnAudioToggle.addEventListener("click", () => {
    CONFIG.soundEffects = !CONFIG.soundEffects;
    saveConfig();
    updateSoundButton();
    showToast(CONFIG.soundEffects ? "Sound effects enabled 🔊" : "Sound effects muted 🔇");
  });
}

// ---- Theme Switcher ----
const themes = ["dark", "cyber", "light"];
let currentTheme = document.documentElement.getAttribute("data-theme") || "dark";

if (btnThemeToggle) {
  btnThemeToggle.addEventListener("click", () => {
    const nextIdx = (themes.indexOf(currentTheme) + 1) % themes.length;
    currentTheme = themes[nextIdx];
    document.documentElement.setAttribute("data-theme", currentTheme);
    localStorage.setItem("signtalk_theme", currentTheme);
    showToast(`Theme switched to ${currentTheme.toUpperCase()} mode`);
  });
}

const savedTheme = localStorage.getItem("signtalk_theme");
if (savedTheme && themes.includes(savedTheme)) {
  currentTheme = savedTheme;
  document.documentElement.setAttribute("data-theme", currentTheme);
}

// ---- Toast Notification ----
let toastTimer = null;
function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2600);
}

// ---- Status and HUD Updates ----
let cameraState = "starting"; // starting | active | paused | stopped | error
let isCameraStopped = false;
let modelState = "loading";   // loading | ready | error
let cameraErrorMsg = "";
let modelErrorMsg = "";

function setStatus(msg, isError = false) {
  if (statusText) statusText.textContent = msg;
  if (badgeStatus) badgeStatus.classList.toggle("error", isError);
}

function syncStatus(trackingNote = null) {
  if (cameraState === "error") {
    setStatus(cameraErrorMsg || "Camera error", true);
    return;
  }
  if (cameraState === "stopped") {
    setStatus("Camera stopped");
    return;
  }
  if (cameraState === "starting") {
    setStatus("Starting Camera…");
    return;
  }
  if (cameraState === "paused") {
    setStatus("Camera paused");
    return;
  }
  if (modelState === "error") {
    setStatus(modelErrorMsg || "AI Model error", true);
    return;
  }
  if (modelState === "loading") {
    setStatus("Camera Active • Downloading AI Model…");
    return;
  }
  if (trackingNote) {
    setStatus(trackingNote);
    return;
  }
  setStatus("Ready: hold a sign steadily");
}

function showCameraErrorOverlay(err) {
  if (!cameraErrorOverlay) return;
  cameraErrorOverlay.classList.remove("hidden");
  
  const isDenied = err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
  const isBusy = err && (err.name === "NotReadableError" || err.name === "TrackStartError");

  if (isDenied) {
    if (cameraErrorTitle) cameraErrorTitle.textContent = "Camera Permission Denied (कैमरा एक्सेस ब्लॉक है)";
    if (cameraErrorDesc) cameraErrorDesc.textContent = "Browser ke URL bar me camera/lock icon par click karein aur Camera ko 'Allow' karke refresh ya Retry button dabayein.";
  } else if (isBusy) {
    if (cameraErrorTitle) cameraErrorTitle.textContent = "Camera In Use By Another App (कैमरा व्यस्त है)";
    if (cameraErrorDesc) cameraErrorDesc.textContent = "Aapka webcam kisi doosre app (Zoom, Python, WhatsApp ya doosre tab) me open hai. Use band karke yahan Retry karein.";
  } else {
    if (cameraErrorTitle) cameraErrorTitle.textContent = "Camera Connection Issue";
    if (cameraErrorDesc) cameraErrorDesc.textContent = (err && err.message) ? err.message : "Webcam initialize nahi ho paya. Kripya webcam connect karein aur permission allow karein.";
  }
}

function hideCameraErrorOverlay() {
  if (cameraErrorOverlay) cameraErrorOverlay.classList.add("hidden");
}

// ---- MediaPipe Landmarker Loading ----
let HandLandmarker, FilesetResolver, DrawingUtils, WASM_URL;
let handLandmarker = null, drawing = null;
let isVideoPaused = false;
let currentStream = null;

function withTimeout(promise, ms, what) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function loadMediaPipe() {
  for (const base of CDN_BASES) {
    try {
      const m = await withTimeout(
        import(`${base}/vision_bundle.mjs`),
        15000,
        "MediaPipe download"
      );
      ({ HandLandmarker, FilesetResolver, DrawingUtils } = m);
      WASM_URL = `${base}/wasm`;
      return;
    } catch (e) {
      console.warn("MediaPipe load failed from", base, e);
    }
  }
  throw new Error("Could not download MediaPipe vision bundle. Please check your internet connection.");
}

async function createLandmarker() {
  const fileset = await withTimeout(
    FilesetResolver.forVisionTasks(WASM_URL),
    20000,
    "MediaPipe runtime download"
  );
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    return await withTimeout(
      HandLandmarker.createFromOptions(fileset, options),
      20000,
      "Hand model download"
    );
  } catch (e) {
    console.warn("GPU delegate failed, falling back to CPU", e);
    options.baseOptions.delegate = "CPU";
    return await withTimeout(
      HandLandmarker.createFromOptions(fileset, options),
      20000,
      "Hand model download"
    );
  }
}

// ---- Camera Devices & Management ----
async function populateCameraDevices() {
  if (!cameraSelect || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((d) => d.kind === "videoinput");
    cameraSelect.innerHTML = "";
    videoDevices.forEach((device, i) => {
      const opt = document.createElement("option");
      opt.value = device.deviceId;
      opt.textContent = device.label || `Camera ${i + 1}`;
      cameraSelect.appendChild(opt);
    });
  } catch (e) {
    console.warn("Could not enumerate camera devices", e);
  }
}

async function startCamera(deviceId = null) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Camera API not supported or origin is insecure. Please use http://localhost:8000 or HTTPS.");
  }

  if (currentStream) {
    currentStream.getTracks().forEach((track) => track.stop());
  }

  const constraints = {
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
      : { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  currentStream = stream;
  isCameraStopped = false;
  updateStopCamButton(false);

  if (video) {
    video.srcObject = stream;
    // Attempt playback immediately
    try {
      await video.play();
    } catch (e) {
      console.warn("Initial video.play() pending metadata", e);
    }

    // Wait for metadata with a safe 2.5s timeout race so it never hangs
    if (!video.videoWidth || video.readyState < 1) {
      await Promise.race([
        new Promise((resolve) => {
          const onMeta = () => {
            video.removeEventListener("loadedmetadata", onMeta);
            video.removeEventListener("loadeddata", onMeta);
            resolve();
          };
          video.addEventListener("loadedmetadata", onMeta);
          video.addEventListener("loadeddata", onMeta);
        }),
        new Promise((resolve) => setTimeout(resolve, 2500))
      ]);
    }

    try {
      await video.play();
    } catch (e) {
      console.warn("video.play() warning:", e);
    }
  }

  if (canvas && video) {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
  }

  hideCameraErrorOverlay();
  await populateCameraDevices();
  if (deviceId && cameraSelect) {
    cameraSelect.value = deviceId;
  }
  return stream;
}

if (cameraSelect) {
  cameraSelect.addEventListener("change", () => {
    startCamera(cameraSelect.value).catch((err) => {
      setStatus("Failed to switch camera", true);
    });
  });
}

// Mirror view toggle
function updateMirror() {
  if (videoContainer) videoContainer.classList.toggle("mirrored", CONFIG.mirrored);
  if (btnMirrorCam) btnMirrorCam.classList.toggle("active", CONFIG.mirrored);
}
updateMirror();

if (btnMirrorCam) {
  btnMirrorCam.addEventListener("click", () => {
    CONFIG.mirrored = !CONFIG.mirrored;
    updateMirror();
    saveConfig();
    showToast(CONFIG.mirrored ? "Mirrored camera enabled" : "Natural camera view");
  });
}

// Stop / Start camera hardware completely
function updateStopCamButton(stopped) {
  if (!btnStopCam) return;
  btnStopCam.classList.toggle("stopped", stopped);
  btnStopCam.textContent = stopped ? "▶ Start Camera" : "⏹ Stop Camera";
}

if (btnStopCam) {
  btnStopCam.addEventListener("click", async () => {
    if (!isCameraStopped) {
      isCameraStopped = true;
      isVideoPaused = false;
      cameraState = "stopped";
      if (iconPause) iconPause.classList.remove("hidden");
      if (iconPlay) iconPlay.classList.add("hidden");
      stopLaptopCamera();
      latestLandmarks = [];
      resetHold();
      resetSmoother();
      locked = null;
      if (letterEl) letterEl.textContent = "–";
      if (confidenceTag) confidenceTag.textContent = "0%";
      if (handsText) handsText.textContent = "0 Hands";
      if (badgeFps) badgeFps.textContent = "0 FPS";
      lightingMonitor?.reset();
      handGuide?.hide();
      updateStopCamButton(true);
      syncStatus();
      showToast("Camera stopped");
    } else {
      isCameraStopped = false;
      cameraState = "starting";
      updateStopCamButton(false);
      syncStatus();
      try {
        await startCamera(cameraSelect ? cameraSelect.value : null);
        cameraState = "active";
        syncStatus();
        requestAnimationFrame(loop);
        showToast("Camera started");
      } catch (err) {
        isCameraStopped = true;
        cameraState = "error";
        cameraErrorMsg = "Camera error: " + (err.message || "Could not start camera");
        updateStopCamButton(true);
        showCameraErrorOverlay(err);
        syncStatus();
      }
    }
  });
}

// Pause / Resume camera
if (btnPauseCam) {
  btnPauseCam.addEventListener("click", () => {
    if (isCameraStopped) {
      btnStopCam?.click();
      return;
    }
    isVideoPaused = !isVideoPaused;
    if (isVideoPaused) {
      cameraState = "paused";
      if (video) video.pause();
      lightingMonitor?.reset();
      handGuide?.hide();
      if (iconPause) iconPause.classList.add("hidden");
      if (iconPlay) iconPlay.classList.remove("hidden");
      syncStatus();
    } else {
      cameraState = "active";
      if (video) video.play().catch(console.warn);
      if (iconPause) iconPause.classList.remove("hidden");
      if (iconPlay) iconPlay.classList.add("hidden");
      syncStatus();
    }
  });
}

// Skeleton overlay toggle
if (btnToggleSkeleton) {
  btnToggleSkeleton.addEventListener("click", () => {
    const styles = ["cyber", "emerald", "minimal", "hidden"];
    const nextIdx = (styles.indexOf(CONFIG.skeletonStyle) + 1) % styles.length;
    CONFIG.skeletonStyle = styles[nextIdx];
    if (settingSkeletonStyle) settingSkeletonStyle.value = CONFIG.skeletonStyle;
    btnToggleSkeleton.classList.toggle("active", CONFIG.skeletonStyle !== "hidden");
    saveConfig();
    showToast(`Skeleton: ${CONFIG.skeletonStyle.toUpperCase()}`);
  });
}

// Capture frame screenshot
if (btnCaptureFrame) {
  btnCaptureFrame.addEventListener("click", () => {
    try {
      if (!canvas || !video) return;
      const snapCanvas = document.createElement("canvas");
      snapCanvas.width = canvas.width || 640;
      snapCanvas.height = canvas.height || 480;
      const snapCtx = snapCanvas.getContext("2d");

      if (CONFIG.mirrored) {
        snapCtx.translate(snapCanvas.width, 0);
        snapCtx.scale(-1, 1);
      }
      snapCtx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height);
      snapCtx.drawImage(canvas, 0, 0, snapCanvas.width, snapCanvas.height);

      const link = document.createElement("a");
      link.download = `signtalk-capture-${Date.now()}.png`;
      link.href = snapCanvas.toDataURL("image/png");
      link.click();
      showToast("📸 Screenshot captured & downloaded!");
    } catch (e) {
      console.error("Screenshot error", e);
      showToast("Could not capture screenshot");
    }
  });
}

// ---- Text & Suggestions State ----
let text = "";

function renderText() {
  if (textEl) {
    if (textEl.tagName === "TEXTAREA" || textEl.tagName === "INPUT") {
      textEl.value = text;
      textEl.scrollTop = textEl.scrollHeight;
    } else {
      textEl.textContent = text;
    }
  }
  const trimmed = text.trim();
  if (charCount) charCount.textContent = `${text.length} chars`;
  const words = trimmed ? trimmed.split(/\s+/).length : 0;
  if (wordCount) wordCount.textContent = `${words} words`;
  renderSuggestions();
}

if (textEl) {
  textEl.addEventListener("input", () => {
    text = textEl.value;
    const trimmed = text.trim();
    if (charCount) charCount.textContent = `${text.length} chars`;
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    if (wordCount) wordCount.textContent = `${words} words`;
    renderSuggestions();
  });
}

function addLetter(letter) {
  text += letter;
  renderText();
}

function addSpace() {
  if (text.length === 0 || text.endsWith(" ")) return;
  const words = text.trim().split(/\s+/);
  const lastWord = words[words.length - 1];
  text += " ";
  renderText();
  if (autoSpeak && autoSpeak.checked && lastWord) {
    speakText(lastWord);
  }
}

function backspace() {
  if (text.length === 0) return;
  text = text.slice(0, -1);
  renderText();
}

function clearText() {
  if (text.trim().length > 0) {
    saveToHistory(text.trim(), languageSelect ? languageSelect.value : "asl");
  }
  text = "";
  renderText();
  showToast("Cleared text (saved to history)");
}

function copyText() {
  if (!text) {
    showToast("No text to copy");
    return;
  }
  navigator.clipboard
    .writeText(text)
    .then(() => showToast("Copied to clipboard! 📋"))
    .catch(() => showToast("Could not copy text"));
}

function getSavedWords() {
  try {
    const raw = localStorage.getItem("signtalk_saved_words");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function persistSavedWords(list) {
  try {
    localStorage.setItem("signtalk_saved_words", JSON.stringify(list));
  } catch (e) {
    console.warn("Could not store saved words", e);
  }
}

function renderSavedWords() {
  const list = getSavedWords();
  if (savedWordsCount) savedWordsCount.textContent = list.length;
  if (!savedWordsList) return;
  if (list.length === 0) {
    savedWordsList.innerHTML = '<span class="saved-empty">Click "Save" to bookmark words or sentences for quick reuse.</span>';
    return;
  }

  savedWordsList.innerHTML = "";
  list.forEach((entry, idx) => {
    const chip = document.createElement("div");
    chip.className = "saved-word-chip";
    chip.innerHTML = `
      <button type="button" class="saved-word-insert" title="Insert '${escapeHtml(entry.word)}' into translator">${escapeHtml(entry.word)}</button>
      <button type="button" class="saved-word-mini" data-action="speak" title="Speak">🔊</button>
      <button type="button" class="saved-word-mini del" data-action="delete" title="Remove">&times;</button>
    `;

    chip.querySelector(".saved-word-insert").addEventListener("click", () => {
      if (text && !text.endsWith(" ")) text += " ";
      text += entry.word + " ";
      renderText();
      showToast(`Inserted "${entry.word}"`);
    });
    chip.querySelector('[data-action="speak"]').addEventListener("click", () => {
      speakText(entry.word);
    });
    chip.querySelector('[data-action="delete"]').addEventListener("click", () => {
      const updated = getSavedWords();
      updated.splice(idx, 1);
      persistSavedWords(updated);
      renderSavedWords();
      showToast(`Removed "${entry.word}"`);
    });

    savedWordsList.appendChild(chip);
  });
}

function saveCurrentWord() {
  const cleaned = text.trim();
  if (!cleaned) {
    showToast("Type or sign a word first to save");
    return;
  }
  const lang = languageSelect ? languageSelect.value : "asl";
  const list = getSavedWords().filter((item) => item.word.toLowerCase() !== cleaned.toLowerCase());
  list.unshift({
    word: cleaned,
    lang: lang.toUpperCase(),
    savedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  });
  if (list.length > 60) list.pop();
  persistSavedWords(list);
  renderSavedWords();
  saveToHistory(cleaned, lang);
  showToast(`💾 Saved "${cleaned}"!`);
}

function getCurrentWord() {
  const parts = text.split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

function renderSuggestions() {
  if (!suggestionsEl) return;
  const current = getCurrentWord();
  suggestionsEl.innerHTML = "";
  if (!current) return;

  const matches = WORDS.filter(
    (w) => w.startsWith(current) && w !== current
  ).slice(0, 4);

  matches.forEach((word) => {
    const btn = document.createElement("button");
    btn.className = "chip";
    btn.textContent = word;
    btn.addEventListener("click", () => {
      const parts = text.split(/\s+/);
      parts[parts.length - 1] = word;
      text = parts.join(" ") + " ";
      renderText();
      if (autoSpeak && autoSpeak.checked) speakText(word);
    });
    suggestionsEl.appendChild(btn);
  });
}

// Translator Action Listeners
if (btnSpace) btnSpace.addEventListener("click", addSpace);
if (btnBackspace) btnBackspace.addEventListener("click", backspace);
if (btnCopy) btnCopy.addEventListener("click", copyText);
if (btnSaveWord) btnSaveWord.addEventListener("click", saveCurrentWord);
if (btnClear) btnClear.addEventListener("click", clearText);
if (btnSpeak) btnSpeak.addEventListener("click", () => speakText());

if (btnExportSavedWords) {
  btnExportSavedWords.addEventListener("click", () => {
    const list = getSavedWords();
    if (list.length === 0) {
      showToast("No saved words to export");
      return;
    }
    const content = list.map((w) => `[${w.savedAt || ""}] (${w.lang || "ASL"}) ${w.word}`).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signtalk-saved-words-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported saved words");
  });
}

if (btnClearSavedWords) {
  btnClearSavedWords.addEventListener("click", () => {
    localStorage.removeItem("signtalk_saved_words");
    renderSavedWords();
    showToast("Saved words cleared");
  });
}

// Quick Phrase Chips
document.querySelectorAll(".phrase-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const phrase = chip.getAttribute("data-phrase");
    if (text && !text.endsWith(" ")) {
      text += " ";
    }
    text += phrase + " ";
    renderText();
    if (autoSpeak && autoSpeak.checked) speakText(phrase);
  });
});

// ---- Speech Synthesis ----
let systemVoices = [];
function populateVoices() {
  if (!("speechSynthesis" in window) || !voiceSelect) return;
  systemVoices = window.speechSynthesis.getVoices();
  voiceSelect.innerHTML = "";

  systemVoices.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${v.name} (${v.lang})`;
    if (v.default || v.lang.startsWith("en")) {
      opt.selected = true;
    }
    voiceSelect.appendChild(opt);
  });
}

if ("speechSynthesis" in window) {
  populateVoices();
  window.speechSynthesis.onvoiceschanged = populateVoices;
}

if (rateSlider) {
  rateSlider.addEventListener("input", () => {
    if (rateVal) rateVal.textContent = `${rateSlider.value}x`;
  });
}

function speakText(customString = null) {
  if (!("speechSynthesis" in window)) {
    showToast("Speech synthesis not supported in this browser");
    return;
  }
  const s = (customString ?? text).trim();
  if (!s) {
    showToast("No text to speak");
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(s);
  if (voiceSelect) {
    const selectedVoiceIdx = parseInt(voiceSelect.value);
    if (systemVoices[selectedVoiceIdx]) {
      u.voice = systemVoices[selectedVoiceIdx];
    }
  }
  u.rate = rateSlider ? (parseFloat(rateSlider.value) || 1.0) : 1.0;
  window.speechSynthesis.speak(u);
}

// ---- Circular Progress Ring ----
const RING_CIRCUMFERENCE = 2 * Math.PI * 44; // ~276.46
function updateHoldGauge(ratio) {
  const boundedRatio = Math.max(0, Math.min(1, ratio));
  const offset = RING_CIRCUMFERENCE * (1 - boundedRatio);
  if (ringProgressCircle) ringProgressCircle.style.strokeDashoffset = offset;
  if (holdBar) holdBar.style.width = `${boundedRatio * 100}%`;
  if (holdFramesText) {
    holdFramesText.textContent = `${Math.round(boundedRatio * CONFIG.holdFrames)} / ${CONFIG.holdFrames}`;
  }
}

// ---- Stabilizer & Recognition Logic (with Temporal EMA Smoothing) ----
let candidate = null;
let streak = 0;
let streakGrace = 0;
let locked = null;
let emaScores = {};
const EMA_ALPHA = 0.72;

function resetSmoother() {
  emaScores = {};
}

function smoothPrediction(label, confidence, candidates = []) {
  const incoming = (candidates && candidates.length > 0)
    ? candidates
    : (label ? [{ label, confidence }] : []);

  // Avoid artificial cold-start confidence drop on the very first frame after hand enters
  if (Object.keys(emaScores).length === 0) {
    const fresh = {};
    for (const c of incoming) {
      fresh[c.label] = c.confidence;
    }
    emaScores = fresh;
  } else {
    const decayed = {};
    for (const [cls, score] of Object.entries(emaScores)) {
      const val = score * (1 - EMA_ALPHA);
      if (val >= 0.01) decayed[cls] = val;
    }
    for (const c of incoming) {
      decayed[c.label] = (decayed[c.label] || 0) + EMA_ALPHA * c.confidence;
    }
    emaScores = decayed;
  }

  const sorted = Object.entries(emaScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([lbl, conf]) => ({ label: lbl, confidence: Math.min(1, conf) }));

  if (sorted.length === 0) {
    return { label, confidence, candidates };
  }
  return {
    label: sorted[0].label,
    confidence: sorted[0].confidence,
    candidates: sorted,
  };
}

function resetHold() {
  candidate = null;
  streak = 0;
  streakGrace = 0;
  updateHoldGauge(0);
}

function triggerLockEffect() {
  if (!lockWave) return;
  lockWave.classList.remove("flash");
  void lockWave.offsetWidth;
  lockWave.classList.add("flash");
  playLockSound();
}

function isPracticeTabActive() {
  const panel = getEl("tab-practice");
  return Boolean(panel && panel.classList.contains("active"));
}

function handlePrediction(label, confidence, candidates = []) {
  if (!letterEl) return;
  const smoothed = smoothPrediction(label, confidence, candidates);
  label = smoothed.label;
  confidence = smoothed.confidence;
  candidates = smoothed.candidates;

  if (label && label !== "–" && label !== letterEl.textContent) {
    letterEl.classList.remove("pop-3d");
    void letterEl.offsetWidth;
    letterEl.classList.add("pop-3d");
  }
  letterEl.textContent = label;
  const pct = (confidence * 100).toFixed(0);
  if (confidenceTag) {
    confidenceTag.textContent = `${pct}%`;
    if (confidence >= 0.8) {
      confidenceTag.style.color = "var(--accent-success)";
    } else if (confidence >= 0.65) {
      confidenceTag.style.color = "var(--accent-warning)";
    } else {
      confidenceTag.style.color = "var(--accent-danger)";
    }
  }

  // Render Candidate Bars
  renderCandidates(candidates);

  // Practice Mode Check (only evaluate when Practice Arena tab is actually open!)
  if (isQuizActive && isPracticeTabActive()) {
    handleQuizEvaluation(label, confidence);
  }

  // Check confidence cutoff
  if (confidence < CONFIG.minConfidence) {
    streakGrace++;
    if (streakGrace > 1) {
      resetHold();
    }
    return;
  }

  if (label !== locked) locked = null;
  if (label === locked) {
    updateHoldGauge(1);
    return;
  }

  if (label === candidate) {
    streak++;
    streakGrace = 0;
    playTickSound();
  } else if (candidate && streakGrace === 0 && streak > 1) {
    // Allow 1-frame transient flicker without resetting progress completely
    streakGrace = 1;
    return;
  } else {
    candidate = label;
    streak = 1;
    streakGrace = 0;
  }

  const ratio = streak / CONFIG.holdFrames;
  updateHoldGauge(ratio);

  if (streak >= CONFIG.holdFrames) {
    addLetter(label);
    locked = label;
    triggerLockEffect();
    resetHold();
    updateHoldGauge(1);
  }
}

function renderCandidates(candidates) {
  if (!candidatesList) return;
  if (!candidates || candidates.length === 0) return;
  candidatesList.innerHTML = "";
  candidates.forEach((c) => {
    const row = document.createElement("div");
    row.className = "candidate-row";
    const pct = Math.round(c.confidence * 100);

    row.innerHTML = `
      <span class="candidate-char">${c.label}</span>
      <div class="candidate-bar-track">
        <div class="candidate-bar-fill" style="width: ${pct}%"></div>
      </div>
      <span class="candidate-pct">${pct}%</span>
    `;
    candidatesList.appendChild(row);
  });
}

function handLost() {
  resetHold();
  resetSmoother();
  locked = null;
  if (letterEl) letterEl.textContent = "–";
  if (confidenceTag) confidenceTag.textContent = "0%";
  updateHoldGauge(0);
  if (handsText) handsText.textContent = "0 Hands";
  if (candidatesList) {
    candidatesList.innerHTML = '<div class="candidate-empty">Position hand to analyze probabilities…</div>';
  }
  if (challengeLiveFeed && isQuizActive && isPracticeTabActive() && !blitzGameOver) {
    wrongHoldCount = 0;
    challengeLiveFeed.className = "challenge-live-feed";
    challengeLiveFeed.textContent = "✋ Show hand inside guide frame…";
  }
  syncStatus();
}

// ---- Network Inference Loop ----
let lastVideoTime = -1;
let lastPredictAt = 0;
let inFlight = false;
let frameCount = 0;
let lastFpsTime = performance.now();
let latestLandmarks = [];

async function sendForPrediction(hands) {
  inFlight = true;
  const startTime = performance.now();
  try {
    const lang = languageSelect ? languageSelect.value : "asl";
    const res = await fetch("/api/predict/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        language: lang,
        hands: hands.map((h) => h.map((p) => [p.x, p.y, p.z])),
      }),
    });

    const elapsed = Math.round(performance.now() - startTime);
    if (badgeLatency) badgeLatency.textContent = `${elapsed} ms`;

    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Prediction failed", true);
      return;
    }

    setStatus(`Tracking: ${lang.toUpperCase()}`);
    handlePrediction(data.label, data.confidence, data.candidates);
  } catch (err) {
    console.error(err);
    setStatus("Server unreachable", true);
  } finally {
    inFlight = false;
  }
}

function drawSkeleton(landmarks) {
  if (CONFIG.skeletonStyle === "hidden" || !drawing || !ctx) return;

  let connectorColor = "#06b6d4";
  let landmarkColor = "#ffffff";

  if (CONFIG.skeletonStyle === "emerald") {
    connectorColor = "#10b981";
    landmarkColor = "#84cc16";
  } else if (CONFIG.skeletonStyle === "minimal") {
    connectorColor = "rgba(255, 255, 255, 0.15)";
    landmarkColor = "#38bdf8";
  }

  for (const lm of landmarks) {
    if (CONFIG.skeletonStyle !== "minimal") {
      drawing.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, {
        color: connectorColor,
        lineWidth: 3,
      });
    }
    drawing.drawLandmarks(lm, {
      color: landmarkColor,
      radius: CONFIG.skeletonStyle === "minimal" ? 2 : 3,
    });
  }
}

function loop() {
  if (remoteMode || isCameraStopped) return;
  if (!isVideoPaused && video && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();
    lightingMonitor?.check(now);

    // Keep overlay canvas synced with live camera dimensions
    if (canvas && video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    // FPS Meter
    frameCount++;
    if (now - lastFpsTime >= 1000) {
      const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      if (badgeFps) badgeFps.textContent = `${fps} FPS`;
      frameCount = 0;
      lastFpsTime = now;
    }

    if (handLandmarker) {
      const result = handLandmarker.detectForVideo(video, now);
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);

      const lang = languageSelect ? languageSelect.value : "asl";
      handGuide?.update(result?.landmarks || [], {
        requiredHands: lang === "isl" ? 2 : 1,
        paused: isVideoPaused,
        stopped: isCameraStopped,
        hidden: remoteMode,
      });

      if (result && result.landmarks && result.landmarks.length > 0) {
        latestLandmarks = result.landmarks;
        const numHands = result.landmarks.length;
        if (handsText) handsText.textContent = `${numHands} Hand${numHands > 1 ? "s" : ""}`;
        drawSkeleton(result.landmarks);

        if (window.SignTalkBridge?.onFrameLandmarks) {
          window.SignTalkBridge.onFrameLandmarks(result.landmarks, now);
        }

        if (window.SignTalkBridge?.isMotionMode && window.SignTalkBridge.isMotionMode()) {
          syncStatus("Motion Mode: Trace J, Z or words");
        } else {
          if (lang === "isl" && numHands < 2) {
            resetHold();
            resetSmoother();
            locked = null;
            if (letterEl) letterEl.textContent = "–";
            if (confidenceTag) confidenceTag.textContent = "0%";
            syncStatus("ISL needs 2 hands (1 detected)");
          } else {
            const hands = lang === "isl" ? result.landmarks : [result.landmarks[0]];
            if (!inFlight && now - lastPredictAt >= CONFIG.predictIntervalMs) {
              lastPredictAt = now;
              sendForPrediction(hands);
            }
          }
        }
      } else {
        latestLandmarks = [];
        if (window.SignTalkBridge?.onFrameLandmarks) {
          window.SignTalkBridge.onFrameLandmarks([], now);
        }
        handLost();
      }
    }
  }

  requestAnimationFrame(loop);
}

// Language selector change
if (languageSelect) {
  languageSelect.addEventListener("change", () => {
    const lang = languageSelect.value;
    resetHold();
    resetSmoother();
    locked = null;
    if (letterEl) letterEl.textContent = "–";
    if (confidenceTag) confidenceTag.textContent = "0%";
    showToast(`Switched to ${languageSelect.options[languageSelect.selectedIndex].text}`);

    if (lang === "isl") {
      currentGalleryCategory = "isl";
      document.querySelectorAll(".cat-pill").forEach((p) => {
        p.classList.toggle("active", p.getAttribute("data-category") === "isl");
      });
    } else {
      currentGalleryCategory = "all";
      document.querySelectorAll(".cat-pill").forEach((p) => {
        p.classList.toggle("active", p.getAttribute("data-category") === "all");
      });
    }
    renderGallery();

    if (isQuizActive) {
      pickNewQuizTarget();
    }
  });
}

// ---- Gamified Practice & Quiz Mode ----
let isQuizActive = false; // Enabled automatically when Practice Arena tab is active
let quizScore = 0;
let quizStreak = 0;
let quizBestStreak = Number(localStorage.getItem("signtalk_best_streak") || "0") || 0;
let quizAttempts = 0;
let quizCorrect = 0;
let quizRound = 1;
let currentTargetLetter = "A";
let quizHoldStreak = 0;
let roundStartedAt = performance.now();
let wrongHoldCount = 0;
let lastWrongPenaltyLetter = null;
let quizGameMode = "endless"; // "endless" | "blitz"
let blitzSecondsLeft = 60;
let blitzTimerId = null;
let blitzGameOver = false;
let quizNextTimer = null;
const QUIZ_HOLD_REQUIRED = 3;

// Populated dynamically from /api/info/ so quizzes only challenge trained model classes
const SUPPORTED_SIGNS = {
  asl: ["A", "B", "C", "D", "E"],
  isl: ["A", "B", "C"],
};

async function loadModelInfo() {
  try {
    const res = await fetch("/api/info/");
    if (!res.ok) return;
    const info = await res.json();
    if (info.asl && Array.isArray(info.asl.classes) && info.asl.classes.length > 0) {
      SUPPORTED_SIGNS.asl = info.asl.classes;
    }
    if (info.isl && Array.isArray(info.isl.classes) && info.isl.classes.length > 0) {
      SUPPORTED_SIGNS.isl = info.isl.classes;
    }
  } catch (err) {
    console.warn("Could not fetch model metadata from /api/info/:", err);
  }
}

function getQuizCombo() {
  return Math.min(4, 1 + Math.floor(quizStreak / 3));
}

function setChallengeCardVisual(lang, letter, fallbackUrl = null) {
  if (!challengeImg) return;
  const prefix = lang === "isl" ? "isl" : "asl";
  const localSvg = fallbackUrl || `/static/recognizer/img/signs/${prefix}_${letter.toLowerCase()}.svg`;
  challengeImg.onerror = () => {
    challengeImg.onerror = null;
    challengeImg.src = localSvg;
  };
  challengeImg.src = localSvg;
}

function triggerQuizBurst() {
  if (!challengeBurst) return;
  challengeBurst.innerHTML = "";
  const colors = ["#10b981", "#38bdf8", "#f59e0b", "#a855f7", "#ec4899"];
  for (let i = 0; i < 12; i++) {
    const dot = document.createElement("span");
    dot.className = "burst-dot";
    const angle = (Math.PI * 2 * i) / 12;
    const dist = 45 + Math.random() * 55;
    dot.style.setProperty("--tx", `${Math.round(Math.cos(angle) * dist)}px`);
    dot.style.setProperty("--ty", `${Math.round(Math.sin(angle) * dist)}px`);
    dot.style.background = colors[i % colors.length];
    challengeBurst.appendChild(dot);
  }
}

function stopBlitzTimer() {
  if (blitzTimerId) {
    clearInterval(blitzTimerId);
    blitzTimerId = null;
  }
}

function startBlitzTimer() {
  stopBlitzTimer();
  if (quizGameMode !== "blitz" || blitzGameOver) return;
  blitzTimerId = setInterval(() => {
    if (!isQuizActive || !isPracticeTabActive() || quizGameMode !== "blitz" || blitzGameOver) return;
    blitzSecondsLeft = Math.max(0, blitzSecondsLeft - 1);
    updateQuizScoreboard();
    if (blitzSecondsLeft <= 0) {
      blitzGameOver = true;
      stopBlitzTimer();
      const acc = quizAttempts > 0 ? Math.round((quizCorrect / quizAttempts) * 100) : 100;
      if (challengeFeedback) {
        challengeFeedback.textContent = `🏁 Time's Up! Final Score: ${quizScore} | Accuracy: ${acc}% | Streak Best: ${quizBestStreak}`;
        challengeFeedback.classList.remove("hidden", "warn");
      }
      if (challengeLiveFeed) {
        challengeLiveFeed.className = "challenge-live-feed";
        challengeLiveFeed.textContent = "⏱️ 60s Blitz Complete — click Reset Game to play again!";
      }
      playSuccessFanfare();
    }
  }, 1000);
}

function startPracticeSign(letter, lang = null, entry = null) {
  if (quizNextTimer) {
    clearTimeout(quizNextTimer);
    quizNextTimer = null;
  }
  if (lang && languageSelect && (lang === "asl" || lang === "isl")) {
    languageSelect.value = lang;
  }
  const activeLang = languageSelect ? languageSelect.value : "asl";
  const practiceTabBtn = document.querySelector('[data-tab="tab-practice"]');
  if (practiceTabBtn) practiceTabBtn.click();

  isQuizActive = true;
  blitzGameOver = false;
  currentTargetLetter = letter;
  quizHoldStreak = 0;
  wrongHoldCount = 0;
  lastWrongPenaltyLetter = null;
  roundStartedAt = performance.now();

  if (challengeLetter) challengeLetter.textContent = `Sign: "${currentTargetLetter}"`;
  if (challengeHint) {
    challengeHint.textContent = entry?.summary || entry?.tip || `Form the sign for '${currentTargetLetter}' with your hand`;
  }
  setChallengeCardVisual(activeLang, currentTargetLetter, entry?.local_fallback);
  if (challengeHoldBar) challengeHoldBar.style.width = "0%";
  if (challengeHoldText) challengeHoldText.textContent = "Hold sign steadily in view…";
  if (challengeFeedback) challengeFeedback.classList.add("hidden");
  if (challengeLiveFeed) {
    challengeLiveFeed.className = "challenge-live-feed";
    challengeLiveFeed.textContent = "✋ Form target sign inside frame…";
  }
  updateQuizScoreboard();
  if (quizGameMode === "blitz" && !blitzTimerId) startBlitzTimer();
}

function pickNewQuizTarget() {
  if (quizNextTimer) {
    clearTimeout(quizNextTimer);
    quizNextTimer = null;
  }
  const lang = languageSelect ? languageSelect.value : "asl";
  const list = SUPPORTED_SIGNS[lang] || SUPPORTED_SIGNS.asl;
  let nextLetter;
  do {
    nextLetter = list[Math.floor(Math.random() * list.length)];
  } while (nextLetter === currentTargetLetter && list.length > 1);

  currentTargetLetter = nextLetter;
  quizHoldStreak = 0;
  wrongHoldCount = 0;
  lastWrongPenaltyLetter = null;
  roundStartedAt = performance.now();

  if (challengeLetter) challengeLetter.textContent = `Sign: "${currentTargetLetter}"`;

  setChallengeCardVisual(lang, currentTargetLetter);

  if (dictionaryData && dictionaryData[lang]) {
    const entry = dictionaryData[lang].find((s) => s.letter === currentTargetLetter);
    if (entry && challengeHint) {
      challengeHint.textContent = entry.summary || entry.tip || `Form the sign for '${currentTargetLetter}' with your hand`;
    }
  }

  if (challengeHoldBar) challengeHoldBar.style.width = "0%";
  if (challengeHoldText) challengeHoldText.textContent = "Hold sign steadily in view…";
  if (challengeFeedback) challengeFeedback.classList.add("hidden");
  if (challengeLiveFeed) {
    challengeLiveFeed.className = "challenge-live-feed";
    challengeLiveFeed.textContent = "✋ Form target sign inside frame…";
  }
  updateQuizScoreboard();
}

function handleQuizEvaluation(label, confidence) {
  if (!isQuizActive || blitzGameOver || quizNextTimer) return;
  const now = performance.now();
  const pct = Math.round(confidence * 100);

  if (label === currentTargetLetter && confidence >= CONFIG.minConfidence) {
    wrongHoldCount = 0;
    quizHoldStreak++;
    const progress = Math.min(100, Math.round((quizHoldStreak / QUIZ_HOLD_REQUIRED) * 100));
    if (challengeHoldBar) challengeHoldBar.style.width = `${progress}%`;
    if (challengeHoldText) challengeHoldText.textContent = `Matching… ${progress}%`;
    if (challengeLiveFeed) {
      challengeLiveFeed.className = "challenge-live-feed live-match";
      challengeLiveFeed.textContent = `🎯 Locking "${label}" (${pct}%) — hold steady!`;
    }

    if (quizHoldStreak >= QUIZ_HOLD_REQUIRED) {
      const elapsedSec = (now - roundStartedAt) / 1000;
      const speedBonus = elapsedSec <= 3.5 ? 5 : 0;
      quizStreak++;
      const combo = getQuizCombo();
      const gained = 10 + (quizStreak - 1) * 2 + speedBonus;
      quizScore += gained;
      quizCorrect++;
      quizAttempts++;
      quizRound++;
      if (quizStreak > quizBestStreak) {
        quizBestStreak = quizStreak;
        try {
          localStorage.setItem("signtalk_best_streak", String(quizBestStreak));
        } catch (e) {}
      }
      updateQuizScoreboard();
      playSuccessFanfare();
      triggerQuizBurst();
      if (challengeCard) {
        challengeCard.classList.remove("success-pop", "wrong-shake");
        void challengeCard.offsetWidth;
        challengeCard.classList.add("success-pop");
      }
      window.SignTalkBridge?.logProgressAttempt(currentTargetLetter, label, true, confidence);

      if (challengeFeedback) {
        const extras = [];
        if (combo > 1) extras.push(`Combo x${combo}`);
        if (speedBonus > 0) extras.push("Speed +5");
        const suffix = extras.length > 0 ? ` (${extras.join(" • ")})` : "";
        challengeFeedback.textContent = `🎉 Great Job! +${gained} Points!${suffix}`;
        challengeFeedback.classList.remove("hidden", "warn");
      }

      quizNextTimer = setTimeout(() => {
        if (!blitzGameOver) pickNewQuizTarget();
      }, 1000);
    }
  } else {
    quizHoldStreak = Math.max(0, quizHoldStreak - 1);
    if (challengeHoldBar) {
      challengeHoldBar.style.width = `${(quizHoldStreak / QUIZ_HOLD_REQUIRED) * 100}%`;
    }
    if (label && label !== "–") {
      if (challengeLiveFeed) {
        challengeLiveFeed.className = "challenge-live-feed live-mismatch";
        challengeLiveFeed.textContent = `👀 Seeing "${label}" (${pct}%) — try "${currentTargetLetter}"`;
      }
      const inGrace = now - roundStartedAt < 1200;
      if (!inGrace && confidence >= CONFIG.minConfidence && !quizNextTimer) {
        wrongHoldCount++;
        if (wrongHoldCount >= 5 && label !== lastWrongPenaltyLetter) {
          lastWrongPenaltyLetter = label;
          wrongHoldCount = 0;
          quizStreak = 0;
          quizAttempts++;
          updateQuizScoreboard();
          playQuizMismatchTone();
          window.SignTalkBridge?.logProgressAttempt(currentTargetLetter, label, false, confidence);
          if (challengeCard) {
            challengeCard.classList.remove("wrong-shake");
            void challengeCard.offsetWidth;
            challengeCard.classList.add("wrong-shake");
          }
          if (challengeFeedback) {
            challengeFeedback.textContent = `⚠️ Seeing "${label}" (${pct}%) — try "${currentTargetLetter}"!`;
            challengeFeedback.classList.remove("hidden");
            challengeFeedback.classList.add("warn");
          }
        }
      }
    }
  }
}

function updateQuizScoreboard() {
  if (quizScoreEl) quizScoreEl.textContent = quizScore;
  if (quizStreakEl) quizStreakEl.textContent = `${quizStreak} 🔥`;
  const acc = quizAttempts > 0 ? Math.round((quizCorrect / quizAttempts) * 100) : 100;
  if (quizAccuracyEl) quizAccuracyEl.textContent = `${acc}%`;
  if (quizBestStreakEl) quizBestStreakEl.textContent = quizBestStreak;
  if (quizComboBadge) {
    const combo = getQuizCombo();
    quizComboBadge.textContent = combo > 1 ? `Combo x${combo} 🔥` : "Combo x1";
    quizComboBadge.classList.toggle("hot", combo > 1);
  }
  if (quizTimerEl && quizTimerLabel) {
    if (quizGameMode === "blitz") {
      const m = Math.floor(blitzSecondsLeft / 60);
      const s = String(blitzSecondsLeft % 60).padStart(2, "0");
      quizTimerEl.textContent = `${m}:${s}`;
      quizTimerLabel.textContent = "Time Left";
    } else {
      quizTimerEl.textContent = `#${quizRound}`;
      quizTimerLabel.textContent = "Round";
    }
  }
}

function resetPracticeGame(mode = quizGameMode) {
  if (quizNextTimer) {
    clearTimeout(quizNextTimer);
    quizNextTimer = null;
  }
  quizGameMode = mode;
  quizScore = 0;
  quizStreak = 0;
  quizAttempts = 0;
  quizCorrect = 0;
  quizRound = 1;
  blitzSecondsLeft = 60;
  blitzGameOver = false;
  if (btnModeEndless) btnModeEndless.classList.toggle("active", quizGameMode === "endless");
  if (btnModeBlitz) btnModeBlitz.classList.toggle("active", quizGameMode === "blitz");
  updateQuizScoreboard();
  pickNewQuizTarget();
  if (quizGameMode === "blitz") {
    startBlitzTimer();
  } else {
    stopBlitzTimer();
  }
}

if (btnModeEndless) {
  btnModeEndless.addEventListener("click", () => {
    resetPracticeGame("endless");
    showToast("Endless Practice mode active");
  });
}

if (btnModeBlitz) {
  btnModeBlitz.addEventListener("click", () => {
    resetPracticeGame("blitz");
    showToast("60s Arcade Blitz started — Go!");
  });
}

if (btnSkipChallenge) {
  btnSkipChallenge.addEventListener("click", () => {
    if (blitzGameOver) return;
    window.SignTalkBridge?.logProgressAttempt(currentTargetLetter, "SKIPPED", false, 0);
    quizStreak = 0;
    quizAttempts++;
    quizRound++;
    updateQuizScoreboard();
    showToast(`Skipped sign '${currentTargetLetter}'`);
    pickNewQuizTarget();
  });
}

if (btnNextChallenge) {
  btnNextChallenge.addEventListener("click", () => {
    if (!blitzGameOver) pickNewQuizTarget();
  });
}

if (btnResetQuiz) {
  btnResetQuiz.addEventListener("click", () => {
    resetPracticeGame(quizGameMode);
    showToast("Practice game reset");
  });
}

updateQuizScoreboard();

// ---- Visual Sign Images Gallery ----
async function loadDictionary() {
  try {
    const res = await fetch("/api/dictionary/");
    if (!res.ok) throw new Error("Dictionary fetch failed");
    dictionaryData = await res.json();
    initAlphaStrip();
    renderGallery();
  } catch (err) {
    console.error("Dictionary error:", err);
    if (galleryCountBadge) galleryCountBadge.textContent = "Dictionary offline";
  }
}

function initAlphaStrip() {
  if (!alphaQuickStrip) return;
  alphaQuickStrip.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.className = "alpha-btn active";
  allBtn.textContent = "All";
  allBtn.addEventListener("click", () => {
    document.querySelectorAll(".alpha-btn").forEach((b) => b.classList.remove("active"));
    allBtn.classList.add("active");
    currentAlphaFilter = null;
    renderGallery();
  });
  alphaQuickStrip.appendChild(allBtn);

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  letters.forEach((l) => {
    const btn = document.createElement("button");
    btn.className = "alpha-btn";
    btn.textContent = l;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".alpha-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentAlphaFilter = l;
      renderGallery();
    });
    alphaQuickStrip.appendChild(btn);
  });
}

let useLocalDiagrams = true;

function resolveSignImage(item) {
  const prefix = item.category === "isl" ? "isl" : "asl";
  const fallback = item.local_fallback || `/static/recognizer/img/signs/${prefix}_${String(item.letter || "a").toLowerCase()}.svg`;
  const primary = useLocalDiagrams ? fallback : (item.image_url || fallback);
  return { primary, fallback };
}

function getGalleryItems() {
  if (!dictionaryData) return [];
  const numbersList = (dictionaryData.numbers || []).map((n) => ({
    letter: n.digit,
    name: n.name,
    category: "number",
    is_ai_supported: false,
    image_url: n.image_url,
    local_fallback: n.local_fallback || `/static/recognizer/img/signs/num_${n.digit}.svg`,
    summary: `Sign for number ${n.digit} in American Sign Language`,
    steps: [`Hold hand upright and form the manual sign for digit ${n.digit}.`],
    tip: "Keep fingers steady in clear view of the camera.",
  }));

  let items = [];
  if (currentGalleryCategory === "all") {
    items = [
      ...(dictionaryData.asl || []),
      ...(dictionaryData.isl || []),
      ...numbersList,
      ...(dictionaryData.actions || []),
    ];
  } else if (currentGalleryCategory === "asl") {
    items = dictionaryData.asl || [];
  } else if (currentGalleryCategory === "isl") {
    items = dictionaryData.isl || [];
  } else if (currentGalleryCategory === "numbers") {
    items = numbersList;
  } else if (currentGalleryCategory === "actions") {
    items = dictionaryData.actions || [];
  }

  if (currentAlphaFilter) {
    items = items.filter((item) => {
      const l = (item.letter || "").toUpperCase();
      const n = (item.name || "").toUpperCase();
      return l === currentAlphaFilter || (item.category === "action" && n.startsWith(currentAlphaFilter));
    });
  }

  const query = gallerySearch ? gallerySearch.value.trim().toLowerCase() : "";
  if (query) {
    items = items.filter((item) => {
      return (
        (item.letter && item.letter.toLowerCase().includes(query)) ||
        (item.name && item.name.toLowerCase().includes(query)) ||
        (item.summary && item.summary.toLowerCase().includes(query)) ||
        (item.tip && item.tip.toLowerCase().includes(query)) ||
        (item.category && item.category.toLowerCase().includes(query)) ||
        (item.phrase && item.phrase.toLowerCase().includes(query))
      );
    });
  }

  return items;
}

function renderGallery() {
  if (!galleryGrid) return;
  const items = getGalleryItems();
  if (galleryCountBadge) galleryCountBadge.textContent = `${items.length} signs shown`;
  galleryGrid.innerHTML = "";

  if (items.length === 0) {
    galleryGrid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-muted);">
        No signs found matching your search. Try another letter or clear the filter.
      </div>
    `;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("div");
    card.className = "sign-card";

    const isMotionLetter = item.category === "alphabet" && (item.letter === "J" || item.letter === "Z");
    const statusTag = (item.is_animated || isMotionLetter)
      ? `<span class="anim-tag">🎬 Animated</span>`
      : item.is_ai_supported
        ? `<span class="ai-tag">🤖 AI Ready</span>`
        : `<span class="ref-tag">📖 Reference</span>`;

    const langLabel = item.category === "isl"
      ? "ISL"
      : item.category === "action"
        ? "ACTION"
        : item.category === "number"
          ? "NUM"
          : "ASL";

    const { primary, fallback } = resolveSignImage(item);

    card.innerHTML = `
      <div class="sign-card-top">
        <div class="sign-letter-badge">${escapeHtml(item.letter)}</div>
        ${statusTag}
      </div>
      <div class="sign-img-frame" title="Click to inspect ${escapeHtml(item.name)}">
        <img 
          src="${escapeHtml(primary)}" 
          alt="${escapeHtml(item.name)}" 
          class="sign-img" 
          loading="lazy"
          onerror="this.onerror=null; this.src='${escapeHtml(fallback)}';"
        >
      </div>
      <div class="sign-card-body">
        <div class="sign-card-title">${escapeHtml(item.name)} <span style="opacity:0.65;font-size:0.72rem;">(${langLabel})</span></div>
        <div class="sign-card-summary">${escapeHtml(item.summary || "")}</div>
      </div>
      <div class="sign-card-actions">
        <button class="btn-card-practice" title="Practice ${escapeHtml(item.name)}">${item.category === "action" ? "Try in Action Studio →" : "Practice 🎯"}</button>
        <button class="btn-card-inspect" title="View details">Details 🔍</button>
      </div>
    `;

    card.querySelector(".sign-img-frame").addEventListener("click", () => openLightbox(item));
    card.querySelector(".btn-card-inspect").addEventListener("click", () => openLightbox(item));

    card.querySelector(".btn-card-practice").addEventListener("click", () => {
      if (item.category === "action") {
        window.location.href = "/actions/";
        return;
      }
      const targetLang = item.category === "isl" ? "isl" : "asl";
      startPracticeSign(item.letter, targetLang, item);
      showToast(`Practice mode (${targetLang.toUpperCase()}): Sign '${item.letter}'`);
    });

    galleryGrid.appendChild(card);
  });
}

// Category filter pills
document.querySelectorAll(".cat-pill[data-category]").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".cat-pill[data-category]").forEach((p) => p.classList.remove("active"));
    pill.classList.add("active");
    currentGalleryCategory = pill.getAttribute("data-category");
    renderGallery();
  });
});

if (btnToggleGalleryDiagram) {
  const syncToggleLabel = () => {
    btnToggleGalleryDiagram.classList.toggle("active", useLocalDiagrams);
    btnToggleGalleryDiagram.textContent = useLocalDiagrams ? "🦴 AI Diagrams ON" : "🌐 Classic Illustrations";
  };
  syncToggleLabel();
  btnToggleGalleryDiagram.addEventListener("click", () => {
    useLocalDiagrams = !useLocalDiagrams;
    syncToggleLabel();
    renderGallery();
    showToast(useLocalDiagrams ? "Showing offline AI hand diagrams" : "Showing classic Wikimedia hand illustrations");
  });
}

if (gallerySearch) {
  gallerySearch.addEventListener("input", renderGallery);
}

// ---- Sign Lightbox Modal ----
function openLightbox(item) {
  currentActiveLightboxSign = item;
  if (lightboxBadge) {
    lightboxBadge.textContent = item.category === "isl"
      ? "ISL Sign"
      : item.category === "action"
        ? "Action Sign"
        : item.category === "number"
          ? "Number Sign"
          : "ASL Sign";
  }
  if (lightboxTitle) lightboxTitle.textContent = item.name;
  const { primary, fallback } = resolveSignImage(item);
  if (lightboxImg) {
    lightboxImg.onerror = () => {
      lightboxImg.onerror = null;
      lightboxImg.src = fallback;
    };
    lightboxImg.src = primary;
  }
  if (lightboxSummary) lightboxSummary.textContent = item.summary || "No description available.";

  if (lightboxSteps) {
    lightboxSteps.innerHTML = "";
    if (item.steps && item.steps.length > 0) {
      item.steps.forEach((step) => {
        const li = document.createElement("li");
        li.textContent = step;
        lightboxSteps.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "Hold your hand steady facing the camera as shown in the illustration.";
      lightboxSteps.appendChild(li);
    }
  }

  if (lightboxTip) lightboxTip.textContent = item.tip || "Keep hand clearly in view of camera.";
  if (signLightboxModal) signLightboxModal.classList.add("open");
}

function closeLightbox() {
  if (signLightboxModal) signLightboxModal.classList.remove("open");
}

if (btnCloseLightbox) btnCloseLightbox.addEventListener("click", closeLightbox);
if (signLightboxModal) {
  signLightboxModal.addEventListener("click", (e) => {
    if (e.target === signLightboxModal) closeLightbox();
  });
}

if (btnPracticeThisSign) {
  btnPracticeThisSign.addEventListener("click", () => {
    closeLightbox();
    if (!currentActiveLightboxSign) return;
    if (currentActiveLightboxSign.category === "action") {
      window.location.href = "/actions/";
      return;
    }
    const targetLang = currentActiveLightboxSign.category === "isl" ? "isl" : "asl";
    startPracticeSign(currentActiveLightboxSign.letter, targetLang, currentActiveLightboxSign);
    showToast(`Practice mode (${targetLang.toUpperCase()}): Sign '${currentActiveLightboxSign.letter}'`);
  });
}

// ---- Full Reference Chart Modal ----
const CHARTS = {
  asl: {
    title: "American Sign Language (ASL) Manual Alphabet Poster",
    img: "/static/recognizer/img/signs/asl_chart.jpg",
  },
  isl: {
    title: "Indian Sign Language (ISL) Alphabet Chart (A–Z)",
    img: "/static/recognizer/img/signs/isl_chart.jpg",
  },
  islGov: {
    title: "Official Indian Sign Language (Govt Vikaspedia) Photo Chart",
    img: "https://vikaspedia.in/education/special-education/isl-alphabet.jpg",
  },
};

function showChartModal(type = "asl") {
  const chart = CHARTS[type] || CHARTS.asl;
  if (chartModalTitle) chartModalTitle.textContent = chart.title;
  if (fullChartImg) fullChartImg.src = chart.img;
  if (btnSwitchChartAsl) btnSwitchChartAsl.classList.toggle("active", type === "asl");
  if (btnSwitchChartIsl) btnSwitchChartIsl.classList.toggle("active", type === "isl");
  if (btnSwitchChartIslGov) btnSwitchChartIslGov.classList.toggle("active", type === "islGov");
  if (chartModal) chartModal.classList.add("open");
}

if (btnOpenFullChartAsl) btnOpenFullChartAsl.addEventListener("click", () => showChartModal("asl"));
if (btnOpenFullChartIsl) btnOpenFullChartIsl.addEventListener("click", () => showChartModal("isl"));

if (btnSwitchChartAsl) btnSwitchChartAsl.addEventListener("click", () => showChartModal("asl"));
if (btnSwitchChartIsl) btnSwitchChartIsl.addEventListener("click", () => showChartModal("isl"));
if (btnSwitchChartIslGov) btnSwitchChartIslGov.addEventListener("click", () => showChartModal("islGov"));

if (btnCloseChartModal) {
  btnCloseChartModal.addEventListener("click", () => {
    if (chartModal) chartModal.classList.remove("open");
  });
}

if (chartModal) {
  chartModal.addEventListener("click", (e) => {
    if (e.target === chartModal) chartModal.classList.remove("open");
  });
}

// ---- Mobile QR Code & Remote Camera Sync ----
let remoteMode = false;
let remoteSessionId = null;
let remotePollTimer = null;
let lastRemoteSeq = -1;

function stopLaptopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
  if (video) video.srcObject = null;
  if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  lightingMonitor?.reset();
  handGuide?.hide();
}

function generateSessionId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function stopRemotePolling(notifyDisconnect = false) {
  if (remotePollTimer) {
    clearInterval(remotePollTimer);
    remotePollTimer = null;
  }
  if (notifyDisconnect && remoteSessionId) {
    fetch(`/api/remote_poll/${encodeURIComponent(remoteSessionId)}/?disconnect=1`).catch(() => {});
  }
}

async function disconnectMobileCamera() {
  stopRemotePolling(true);
  remoteMode = false;
  lastRemoteSeq = -1;
  if (remoteCamOverlay) remoteCamOverlay.classList.add("hidden");
  cameraState = "starting";
  syncStatus();
  try {
    await startCamera(cameraSelect ? cameraSelect.value : null);
    cameraState = "active";
    syncStatus();
    requestAnimationFrame(loop);
    showToast("Switched back to laptop camera");
  } catch (err) {
    cameraState = "error";
    showCameraErrorOverlay(err);
    syncStatus();
  }
}

function startRemotePolling(sessionId) {
  stopRemotePolling(false);
  remotePollTimer = setInterval(async () => {
    try {
      const lang = languageSelect ? languageSelect.value : "asl";
      const res = await fetch(`/api/remote_poll/${encodeURIComponent(sessionId)}/?lang=${encodeURIComponent(lang)}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.connected) {
        if (!remoteMode) {
          remoteMode = true;
          stopLaptopCamera();
          if (qrModal) qrModal.classList.remove("open");
          if (remoteCamOverlay) remoteCamOverlay.classList.remove("hidden");
          if (qrSyncStatus) qrSyncStatus.textContent = "✅ Phone connected!";
          cameraState = "active";
          showToast("📱 Mobile camera connected! Laptop camera turned off.");
        }

        if (data.seq !== lastRemoteSeq) {
          lastRemoteSeq = data.seq;
          if (handsText) {
            handsText.textContent = `${data.hand_count} Hand${data.hand_count === 1 ? "" : "s"}`;
          }
          if (data.hand_count === 0) {
            handLost();
            syncStatus("Mobile connected • Show hand");
          } else if (data.needs_two_hands) {
            resetHold();
            resetSmoother();
            locked = null;
            if (letterEl) letterEl.textContent = "–";
            if (confidenceTag) confidenceTag.textContent = "0%";
            syncStatus("ISL needs 2 hands (1 detected)");
          } else if (data.label) {
            syncStatus(`Mobile: ${data.language.toUpperCase()}`);
            handlePrediction(data.label, data.confidence, data.candidates || []);
          }
        }
      } else if (remoteMode) {
        if (qrSyncStatus) qrSyncStatus.textContent = "⏳ Phone disconnected. Waiting…";
        syncStatus("Mobile disconnected — waiting…");
      }
    } catch (err) {
      console.warn("Remote poll error:", err);
    }
  }, 180);
}

if (btnOpenQR) {
  btnOpenQR.addEventListener("click", () => {
    if (!remoteSessionId) remoteSessionId = generateSessionId();
    if (qrModal) qrModal.classList.add("open");
    const targetUrl = `${window.location.origin}/mobile/${remoteSessionId}/`;
    const qrUrlText = getEl("qrUrlText");
    if (qrUrlText) qrUrlText.textContent = targetUrl;
    if (qrSyncStatus) {
      qrSyncStatus.textContent = remoteMode
        ? "✅ Phone connected!"
        : "⏳ Waiting for phone to scan…";
    }
    if (qrCodeContainer && typeof QRCode !== "undefined") {
      qrCodeContainer.innerHTML = "";
      new QRCode(qrCodeContainer, {
        text: targetUrl,
        width: 200,
        height: 200,
        colorDark: "#1e1b4b",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });
    }
    startRemotePolling(remoteSessionId);
  });
}

if (btnDisconnectMobile) {
  btnDisconnectMobile.addEventListener("click", disconnectMobileCamera);
}

if (btnCloseQR) {
  btnCloseQR.addEventListener("click", () => {
    if (qrModal) qrModal.classList.remove("open");
    if (!remoteMode) stopRemotePolling(false);
  });
}

if (qrModal) {
  qrModal.addEventListener("click", (e) => {
    if (e.target === qrModal) {
      qrModal.classList.remove("open");
      if (!remoteMode) stopRemotePolling(false);
    }
  });
}

// ---- Tab Switching ----
function initTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      const target = btn.getAttribute("data-tab");
      const panel = document.getElementById(target);
      if (panel) panel.classList.add("active");

      isQuizActive = (target === "tab-practice");
      if (isQuizActive) {
        const lang = languageSelect ? languageSelect.value : "asl";
        const valid = SUPPORTED_SIGNS[lang] || SUPPORTED_SIGNS.asl;
        if (!valid.includes(currentTargetLetter)) {
          pickNewQuizTarget();
        }
        if (quizGameMode === "blitz" && !blitzGameOver) startBlitzTimer();
      } else {
        stopBlitzTimer();
      }
    });
  });
}

// ---- Session History ----
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getHistory() {
  try {
    const raw = localStorage.getItem("signtalk_history");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveToHistory(textStr, lang = "asl") {
  if (!textStr || !textStr.trim()) return;
  const history = getHistory();
  history.unshift({
    text: textStr.trim(),
    lang: lang.toUpperCase(),
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    date: new Date().toLocaleDateString(),
  });
  if (history.length > 50) history.pop();
  try {
    localStorage.setItem("signtalk_history", JSON.stringify(history));
  } catch (e) {
    console.warn("Could not save to localStorage", e);
  }
  renderHistory();
}

function renderHistory() {
  if (!historyList) return;
  const history = getHistory();
  if (history.length === 0) {
    historyList.innerHTML = '<div class="history-empty">Your translated sentences will be recorded here during your session.</div>';
    return;
  }

  historyList.innerHTML = "";
  history.forEach((item) => {
    const div = document.createElement("div");
    div.className = "history-item";
    div.innerHTML = `
      <div class="history-item-top">
        <span class="history-lang-badge">${escapeHtml(item.lang)}</span>
        <span class="history-time">${escapeHtml(item.time)}</span>
      </div>
      <div class="history-item-text">${escapeHtml(item.text)}</div>
      <div class="history-item-actions">
        <button type="button" class="small-tool-btn" data-hact="load">↩️ Load</button>
        <button type="button" class="small-tool-btn" data-hact="speak">🔊 Speak</button>
        <button type="button" class="small-tool-btn" data-hact="copy">📋 Copy</button>
      </div>
    `;
    div.querySelector('[data-hact="load"]').addEventListener("click", () => {
      text = item.text;
      renderText();
      document.querySelector('[data-tab="tab-translate"]')?.click();
      showToast("Loaded into translator");
    });
    div.querySelector('[data-hact="speak"]').addEventListener("click", () => speakText(item.text));
    div.querySelector('[data-hact="copy"]').addEventListener("click", () => {
      navigator.clipboard?.writeText(item.text).then(() => showToast("Copied!"));
    });
    historyList.appendChild(div);
  });
}

if (btnClearHistory) {
  btnClearHistory.addEventListener("click", () => {
    localStorage.removeItem("signtalk_history");
    renderHistory();
    showToast("History cleared");
  });
}

if (btnExportHistory) {
  btnExportHistory.addEventListener("click", () => {
    const history = getHistory();
    if (history.length === 0) {
      showToast("No history to export");
      return;
    }
    const lines = history.map(
      (h) => `[${h.date} ${h.time}] (${h.lang}) ${h.text}`
    );
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `signtalk-history-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Exported history transcript");
  });
}

// ---- Settings Modal ----
function openSettings() {
  if (!settingsModal) return;
  if (settingHoldFrames) settingHoldFrames.value = CONFIG.holdFrames;
  if (valHoldFrames) valHoldFrames.textContent = `${CONFIG.holdFrames} frames`;
  if (settingMinConf) settingMinConf.value = Math.round(CONFIG.minConfidence * 100);
  if (valMinConf) valMinConf.textContent = `${Math.round(CONFIG.minConfidence * 100)}%`;
  if (settingInterval) settingInterval.value = CONFIG.predictIntervalMs;
  if (valInterval) valInterval.textContent = `${CONFIG.predictIntervalMs}ms`;
  if (settingSkeletonStyle) settingSkeletonStyle.value = CONFIG.skeletonStyle;
  settingsModal.classList.add("open");
}

function closeSettings() {
  if (settingsModal) settingsModal.classList.remove("open");
}

function saveConfig() {
  try {
    localStorage.setItem("signtalk_config", JSON.stringify(CONFIG));
  } catch (e) {
    console.warn("Could not save to localStorage", e);
  }
}

if (btnOpenSettings) btnOpenSettings.addEventListener("click", openSettings);
if (btnCloseSettings) btnCloseSettings.addEventListener("click", closeSettings);

if (settingsModal) {
  settingsModal.addEventListener("click", (e) => {
    if (e.target === settingsModal) closeSettings();
  });
}

if (settingHoldFrames) {
  settingHoldFrames.addEventListener("input", () => {
    if (valHoldFrames) valHoldFrames.textContent = `${settingHoldFrames.value} frames`;
  });
}

if (settingMinConf) {
  settingMinConf.addEventListener("input", () => {
    if (valMinConf) valMinConf.textContent = `${settingMinConf.value}%`;
  });
}

if (settingInterval) {
  settingInterval.addEventListener("input", () => {
    if (valInterval) valInterval.textContent = `${settingInterval.value}ms`;
  });
}

if (btnSaveSettings) {
  btnSaveSettings.addEventListener("click", () => {
    if (settingHoldFrames) CONFIG.holdFrames = parseInt(settingHoldFrames.value);
    if (settingMinConf) CONFIG.minConfidence = parseInt(settingMinConf.value) / 100;
    if (settingInterval) CONFIG.predictIntervalMs = parseInt(settingInterval.value);
    if (settingSkeletonStyle) CONFIG.skeletonStyle = settingSkeletonStyle.value;
    saveConfig();
    closeSettings();
    showToast("Settings saved successfully!");
  });
}

if (btnResetSettings) {
  btnResetSettings.addEventListener("click", () => {
    CONFIG.holdFrames = 4;
    CONFIG.minConfidence = 0.65;
    CONFIG.predictIntervalMs = 60;
    CONFIG.skeletonStyle = "cyber";
    CONFIG.configVersion = 2;
    openSettings();
    saveConfig();
    showToast("Reset to fast default settings");
  });
}

// ---- Interactive 3D Mouse Tilt Controller ----
function init3DTiltEffects() {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  const tiltElements = document.querySelectorAll(".tilt-3d");
  tiltElements.forEach((el) => {
    let isHovered = false;

    el.addEventListener("mouseenter", () => {
      isHovered = true;
      el.style.transition = "transform 0.12s ease-out, box-shadow 0.25s ease";
    });

    el.addEventListener("mousemove", (e) => {
      if (!isHovered) return;
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -5;
      const rotateY = ((x - centerX) / centerX) * 5;

      el.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateZ(8px)`;
    });

    el.addEventListener("mouseleave", () => {
      isHovered = false;
      el.style.transition = "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease";
      el.style.transform = "perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)";
    });
  });
}

if (btnRetryCamera) {
  btnRetryCamera.addEventListener("click", async () => {
    cameraState = "starting";
    cameraErrorMsg = "";
    syncStatus();
    try {
      await startCamera(cameraSelect ? cameraSelect.value : null);
      cameraState = "active";
      syncStatus();
      requestAnimationFrame(loop);
    } catch (err) {
      console.error("Camera retry error:", err);
      cameraState = "error";
      cameraErrorMsg = "Camera error: " + (err.message || "Could not start camera");
      showCameraErrorOverlay(err);
      syncStatus();
    }
  });
}

// ---- Application Initialization ----
async function init() {
  try { initTabs(); } catch (e) { console.warn("initTabs error:", e); }
  try { init3DTiltEffects(); } catch (e) { console.warn("init3D error:", e); }
  try { renderHistory(); } catch (e) { console.warn("renderHistory error:", e); }
  try { renderSavedWords(); } catch (e) { console.warn("renderSavedWords error:", e); }
  try { loadModelInfo(); } catch (e) { console.warn("loadModelInfo error:", e); }
  try { loadDictionary(); } catch (e) { console.warn("loadDictionary error:", e); }

  // 1. Start camera & AI model download in parallel without blocking video preview
  cameraState = "starting";
  modelState = "loading";
  syncStatus();

  const camTask = startCamera()
    .then(() => {
      cameraState = "active";
      syncStatus();
      requestAnimationFrame(loop);
    })
    .catch((err) => {
      console.error("Camera error:", err);
      cameraState = "error";
      cameraErrorMsg = (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
        ? "Camera permission denied. Allow camera in URL bar."
        : "Camera error: " + (err.message || "Could not start camera");
      showCameraErrorOverlay(err);
      syncStatus();
    });

  const modelTask = (async () => {
    try {
      await loadMediaPipe();
      handLandmarker = await createLandmarker();
      if (ctx) drawing = new DrawingUtils(ctx);
      modelState = "ready";
      syncStatus();
    } catch (err) {
      console.error("AI Model initialization error:", err);
      modelState = "error";
      modelErrorMsg = "AI Model download failed: " + err.message;
      syncStatus();
    }
  })();

  await Promise.allSettled([camTask, modelTask]);
}

// Bridge for modular studio_features.js extensions
window.SignTalkBridge = {
  csrfToken,
  showToast,
  getLatestLandmarks: () => latestLandmarks,
  setTextValue: (val) => {
    text = String(val ?? "");
    renderText();
  },
  appendRecognizedToken: (tok) => {
    addLetter(String(tok ?? ""));
    triggerLockEffect();
  },
  displayMotionPrediction: (lbl, conf, cands = []) => {
    if (letterEl) letterEl.textContent = lbl;
    if (confidenceTag) confidenceTag.textContent = `${Math.round(conf * 100)}%`;
    renderCandidates(cands);
    updateHoldGauge(conf >= 0.7 ? 1 : conf);
  },
  refreshModelsAndGallery: async () => {
    await loadModelInfo();
    await loadDictionary();
  },
  getLandmarkerDeps: () => ({
    HandLandmarker,
    FilesetResolver,
    WASM_URL,
    MODEL_URL,
  }),
  logProgressAttempt: async (targetLetter, predictedLetter, isCorrect, confidence = 0) => {
    try {
      const lang = languageSelect ? languageSelect.value : "asl";
      await fetch("/api/progress/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
        body: JSON.stringify({
          language: lang,
          target_letter: targetLetter,
          predicted_letter: predictedLetter,
          is_correct: isCorrect,
          confidence,
        }),
      });
      if (window.SignTalkBridge?.onProgressSaved) {
        window.SignTalkBridge.onProgressSaved();
      }
    } catch (e) {
      console.warn("Could not save progress attempt:", e);
    }
  },
  isMotionMode: () => false,
  onFrameLandmarks: null,
  onProgressSaved: null,
};

// Run immediately or on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
