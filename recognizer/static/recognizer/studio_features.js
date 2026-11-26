// ==========================================================================
// SignTalk AI - Extended Studio Features Module
// (Grammar+Hindi, Motion Mode, Custom Trainer, Two-Way Sign, Video Subtitles, Progress DB)
// ==========================================================================

const getEl = (id) => document.getElementById(id);

function bridge() {
  return window.SignTalkBridge || null;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ==========================================================================
// 1. AI GRAMMAR POLISH + HINDI TRANSLATION
// ==========================================================================
const btnPolishGrammar = getEl("btnPolishGrammar");
const btnTranslateHindi = getEl("btnTranslateHindi");
const hindiPreviewBox = getEl("hindiPreviewBox");
const hindiPreviewText = getEl("hindiPreviewText");
const btnSpeakHindi = getEl("btnSpeakHindi");
const textBox = getEl("text");

async function runPolishAndTranslate(showHindi = false) {
  const b = bridge();
  const raw = (textBox?.value || "").trim();
  if (!raw) {
    b?.showToast("Enter or sign some text first");
    return;
  }
  try {
    const res = await fetch("/api/polish_translate/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": b?.csrfToken || "",
      },
      body: JSON.stringify({ text: raw, polish: true, target_lang: "hi" }),
    });
    const data = await res.json();
    if (!res.ok) {
      b?.showToast(data.error || "Translation failed");
      return;
    }

    if (data.polished && textBox) {
      b?.setTextValue(data.polished);
    }

    if (showHindi && hindiPreviewBox && hindiPreviewText) {
      hindiPreviewText.textContent = data.translated || data.polished;
      hindiPreviewBox.classList.remove("hidden");
      speakInHindi(data.translated || data.polished);
      b?.showToast(`Polished & Translated (${data.source})`);
    } else {
      b?.showToast("Grammar polished!");
    }
  } catch (err) {
    console.error("Polish/Translate error:", err);
    b?.showToast("Could not reach translation endpoint");
  }
}

function speakInHindi(str) {
  if (!("speechSynthesis" in window) || !str) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(str);
  const voices = window.speechSynthesis.getVoices();
  const hiVoice = voices.find((v) => v.lang.toLowerCase().startsWith("hi"));
  if (hiVoice) u.voice = hiVoice;
  u.lang = "hi-IN";
  window.speechSynthesis.speak(u);
}

if (btnPolishGrammar) btnPolishGrammar.addEventListener("click", () => runPolishAndTranslate(false));
if (btnTranslateHindi) btnTranslateHindi.addEventListener("click", () => runPolishAndTranslate(true));
if (btnSpeakHindi) btnSpeakHindi.addEventListener("click", () => speakInHindi(hindiPreviewText?.textContent || ""));

// ==========================================================================
// 2. DYNAMIC MOTION MODE (J, Z & CUSTOM WORDS)
// ==========================================================================
const chkMotionMode = getEl("chkMotionMode");
const motionBuffer = [];
const MOTION_WINDOW = 20;
let lastMotionCheckAt = 0;
let motionInFlight = false;
let lastMotionLocked = "";
let lastMotionLockedAt = 0;

async function processMotionFrame(landmarks, now) {
  if (!landmarks || landmarks.length === 0) {
    motionBuffer.length = 0;
    return;
  }
  const hand = landmarks[0].map((p) => [p.x, p.y, p.z]);
  motionBuffer.push(hand);
  if (motionBuffer.length > MOTION_WINDOW) {
    motionBuffer.shift();
  }
  if (motionBuffer.length < 14 || motionInFlight || now - lastMotionCheckAt < 450) {
    return;
  }

  lastMotionCheckAt = now;
  motionInFlight = true;
  const b = bridge();
  try {
    const res = await fetch("/api/predict_motion/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": b?.csrfToken || "",
      },
      body: JSON.stringify({ sequence: motionBuffer.slice() }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.detected && data.label) {
      b?.displayMotionPrediction(data.label, data.confidence || 0.85, data.candidates || []);
      const cooldownPassed = now - lastMotionLockedAt > 1800 || data.label !== lastMotionLocked;
      if ((data.confidence || 0) >= 0.7 && cooldownPassed) {
        lastMotionLocked = data.label;
        lastMotionLockedAt = now;
        b?.appendRecognizedToken(data.label.length > 1 ? `${data.label} ` : data.label);
        motionBuffer.length = 0;
      }
    }
  } catch (err) {
    console.warn("Motion prediction error:", err);
  } finally {
    motionInFlight = false;
  }
}

if (chkMotionMode) {
  chkMotionMode.addEventListener("change", () => {
    motionBuffer.length = 0;
    bridge()?.showToast(
      chkMotionMode.checked
        ? "Motion Mode ON — trace J, Z, or custom words!"
        : "Static Alphabet Mode restored"
    );
  });
}

// ==========================================================================
// 3. STUDENT PROGRESS DASHBOARD (DJANGO DB)
// ==========================================================================
const dashTotalAttempts = getEl("dashTotalAttempts");
const dashOverallAcc = getEl("dashOverallAcc");
const dashWeakBadge = getEl("dashWeakBadge");
const dashBreakdownList = getEl("dashBreakdownList");
const btnRefreshProgress = getEl("btnRefreshProgress");
const btnResetProgress = getEl("btnResetProgress");

async function loadProgressDashboard() {
  try {
    const res = await fetch("/api/progress/");
    if (!res.ok) return;
    const data = await res.json();
    if (dashTotalAttempts) dashTotalAttempts.textContent = data.total ?? 0;
    if (dashOverallAcc) dashOverallAcc.textContent = `${data.accuracy ?? 100}%`;
    if (dashWeakBadge) {
      dashWeakBadge.textContent =
        data.weak_letters && data.weak_letters.length > 0
          ? `Weak: ${data.weak_letters.join(", ")}`
          : "All Strong!";
      dashWeakBadge.classList.toggle("warn", Boolean(data.weak_letters && data.weak_letters.length > 0));
    }

    if (dashBreakdownList) {
      if (!data.breakdown || data.breakdown.length === 0) {
        dashBreakdownList.innerHTML =
          '<div class="dash-empty">Complete or skip Practice Arena signs to track per-letter accuracy!</div>';
        return;
      }
      dashBreakdownList.innerHTML = data.breakdown
        .map((row) => {
          const tier = row.accuracy >= 75 ? "good" : row.accuracy >= 50 ? "mid" : "low";
          return `
            <div class="dash-bar-row">
              <span class="dash-letter">${escapeHtml(row.letter)}</span>
              <div class="dash-track"><div class="dash-fill ${tier}" style="width:${row.accuracy}%"></div></div>
              <span class="dash-pct">${row.accuracy}% (${row.correct}/${row.attempts})</span>
            </div>`;
        })
        .join("");
    }
  } catch (err) {
    console.warn("Could not load progress dashboard:", err);
  }
}

if (btnRefreshProgress) btnRefreshProgress.addEventListener("click", loadProgressDashboard);
if (btnResetProgress) {
  btnResetProgress.addEventListener("click", async () => {
    try {
      await fetch("/api/progress/", {
        method: "DELETE",
        headers: { "X-CSRFToken": bridge()?.csrfToken || "" },
      });
      await loadProgressDashboard();
      bridge()?.showToast("Progress stats cleared");
    } catch (err) {
      console.warn(err);
    }
  });
}

// ==========================================================================
// 4. TWO-WAY COMMUNICATION (SPEECH / TEXT -> SIGN SEQUENCE PLAYER)
// ==========================================================================
const twoWayInput = getEl("twoWayInput");
const twoWayLang = getEl("twoWayLang");
const twoWaySpeed = getEl("twoWaySpeed");
const btnTwoWayMic = getEl("btnTwoWayMic");
const btnTwoWayPlay = getEl("btnTwoWayPlay");
const btnTwoWayStop = getEl("btnTwoWayStop");
const twoWayStageImg = getEl("twoWayStageImg");
const twoWayStageEmoji = getEl("twoWayStageEmoji");
const twoWayStageLabel = getEl("twoWayStageLabel");
const twoWayStageHint = getEl("twoWayStageHint");
const twoWayTokenTrack = getEl("twoWayTokenTrack");

const PHRASE_SIGNS = {
  hello: { emoji: "👋", label: "Hello", hint: "Open palm waving side to side" },
  hi: { emoji: "👋", label: "Hi", hint: "Open palm waving gently" },
  namaste: { emoji: "🙏", label: "Namaste", hint: "Press both palms together at chest" },
  welcome: { emoji: "🪷", label: "Welcome", hint: "Press palms together and bow slightly" },
  thanks: { emoji: "🙏", label: "Thank You", hint: "Flat hand moving forward from chin" },
  "thank you": { emoji: "🙏", label: "Thank You", hint: "Flat hand moving forward from chin" },
  "i love you": { emoji: "🤟", label: "I Love You", hint: "Thumb, index & pinky extended upright" },
  love: { emoji: "🤟", label: "Love", hint: "Thumb, index & pinky extended upright" },
  help: { emoji: "🆘", label: "Help", hint: "Thumbs-up resting on flat open palm" },
  please: { emoji: "🤲", label: "Please", hint: "Circular flat palm rub over chest" },
  yes: { emoji: "👍", label: "Yes", hint: "Thumbs-up / nodding fist" },
  no: { emoji: "🙅", label: "No", hint: "Tap index & middle fingers to thumb" },
  good: { emoji: "👍", label: "Good", hint: "Thumbs-up pointing upright" },
  bad: { emoji: "👎", label: "Bad", hint: "Thumbs-down pointing downward" },
  peace: { emoji: "✌️", label: "Peace", hint: "Index & middle fingers raised in V shape" },
  stop: { emoji: "🛑", label: "Stop", hint: "Flat vertical palm facing forward" },
  call: { emoji: "🤙", label: "Call Me", hint: "Thumb & pinky extended (shaka sign)" },
};

let twoWayTimer = null;

function buildSignSequence(rawText, lang) {
  const cleaned = (rawText || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  if (!cleaned) return [];
  const words = cleaned.split(/\s+/);
  const steps = [];
  let i = 0;
  while (i < words.length) {
    const tri = words.slice(i, i + 3).join(" ");
    const bi = words.slice(i, i + 2).join(" ");
    if (PHRASE_SIGNS[tri]) {
      steps.push({ type: "phrase", ...PHRASE_SIGNS[tri] });
      i += 3;
      continue;
    }
    if (PHRASE_SIGNS[bi]) {
      steps.push({ type: "phrase", ...PHRASE_SIGNS[bi] });
      i += 2;
      continue;
    }
    const w = words[i];
    if (PHRASE_SIGNS[w]) {
      steps.push({ type: "phrase", ...PHRASE_SIGNS[w] });
    } else {
      for (const ch of w.toUpperCase()) {
        if (/[A-Z]/.test(ch)) {
          steps.push({
            type: "letter",
            label: ch,
            img: `/static/recognizer/img/signs/${lang}_${ch.toLowerCase()}.svg`,
            fallback: `/static/recognizer/img/signs/asl_${ch.toLowerCase()}.svg`,
            hint: `${lang.toUpperCase()} Finger-spell '${ch}' (word: ${w.toUpperCase()})`,
          });
        }
      }
    }
    i++;
  }
  return steps;
}

function stopTwoWayPlayback() {
  if (twoWayTimer) {
    clearTimeout(twoWayTimer);
    twoWayTimer = null;
  }
}

function playTwoWaySequence() {
  stopTwoWayPlayback();
  const lang = twoWayLang?.value || "asl";
  const delayMs = parseInt(twoWaySpeed?.value || "850", 10);
  const steps = buildSignSequence(twoWayInput?.value || "", lang);
  if (steps.length === 0) {
    bridge()?.showToast("Type or speak a sentence to animate signs");
    return;
  }

  if (twoWayTokenTrack) {
    twoWayTokenTrack.innerHTML = steps
      .map((s, idx) => `<span class="twoway-chip" data-idx="${idx}">${escapeHtml(s.label)}</span>`)
      .join("");
  }

  let idx = 0;
  function showNext() {
    if (idx >= steps.length) {
      twoWayTimer = null;
      if (twoWayStageHint) twoWayStageHint.textContent = "Sequence finished — click Play to replay!";
      return;
    }
    const step = steps[idx];
    document.querySelectorAll(".twoway-chip").forEach((c, i) => {
      c.classList.toggle("active", i === idx);
    });
    if (twoWayStageLabel) twoWayStageLabel.textContent = step.label;
    if (twoWayStageHint) twoWayStageHint.textContent = step.hint;

    if (step.type === "phrase") {
      if (twoWayStageImg) twoWayStageImg.classList.add("hidden");
      if (twoWayStageEmoji) {
        twoWayStageEmoji.textContent = step.emoji;
        twoWayStageEmoji.classList.remove("hidden");
      }
    } else {
      if (twoWayStageEmoji) twoWayStageEmoji.classList.add("hidden");
      if (twoWayStageImg) {
        twoWayStageImg.onerror = () => { twoWayStageImg.src = step.fallback; };
        twoWayStageImg.src = step.img;
        twoWayStageImg.classList.remove("hidden");
      }
    }
    idx++;
    twoWayTimer = setTimeout(showNext, delayMs);
  }
  showNext();
}

if (btnTwoWayPlay) btnTwoWayPlay.addEventListener("click", playTwoWaySequence);
if (btnTwoWayStop) btnTwoWayStop.addEventListener("click", stopTwoWayPlayback);

if (btnTwoWayMic) {
  btnTwoWayMic.addEventListener("click", () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      bridge()?.showToast("Speech Recognition not supported — try Chrome/Edge or type text");
      return;
    }
    const rec = new SpeechRec();
    rec.lang = "en-US";
    rec.interimResults = false;
    btnTwoWayMic.textContent = "🎙️ Listening…";
    rec.onresult = (e) => {
      const spoken = e.results?.[0]?.[0]?.transcript || "";
      if (twoWayInput) twoWayInput.value = spoken;
      btnTwoWayMic.textContent = "🎤 Speak";
      playTwoWaySequence();
    };
    rec.onerror = () => {
      btnTwoWayMic.textContent = "🎤 Speak";
      bridge()?.showToast("Could not hear speech — check mic permission");
    };
    rec.onend = () => {
      btnTwoWayMic.textContent = "🎤 Speak";
    };
    rec.start();
  });
}

// ==========================================================================
// 5. BROWSER CUSTOM SIGN TRAINER (NO TERMINAL NEEDED)
// ==========================================================================
const trainerLabelInput = getEl("trainerLabelInput");
const trainerModeSelect = getEl("trainerModeSelect");
const btnTrainerCapture = getEl("btnTrainerCapture");
const btnTrainerSubmit = getEl("btnTrainerSubmit");
const trainerProgressBar = getEl("trainerProgressBar");
const trainerStatusText = getEl("trainerStatusText");
const trainerClassesList = getEl("trainerClassesList");

let capturedSamples = [];
let trainerCaptureTimer = null;

async function refreshTrainerStatus() {
  try {
    const res = await fetch("/api/trainer/");
    if (!res.ok || !trainerClassesList) return;
    const data = await res.json();
    const mode = trainerModeSelect?.value || "asl";
    const info = data[mode] || { counts: {} };
    const entries = Object.entries(info.counts || {});
    if (entries.length === 0) {
      trainerClassesList.innerHTML = `<span class="dash-empty">No ${mode.toUpperCase()} samples recorded yet.</span>`;
      return;
    }
    trainerClassesList.innerHTML = entries
      .map(
        ([lbl, cnt]) => `
        <span class="trainer-chip">
          <strong>${escapeHtml(lbl)}</strong> (${cnt})
          <button type="button" class="trainer-del-btn" data-label="${escapeHtml(lbl)}" title="Delete ${escapeHtml(lbl)}">&times;</button>
        </span>`
      )
      .join("");

    trainerClassesList.querySelectorAll(".trainer-del-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const lbl = btn.getAttribute("data-label");
        if (!lbl) return;
        try {
          const delRes = await fetch("/api/trainer/", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-CSRFToken": bridge()?.csrfToken || "" },
            body: JSON.stringify({ action: "delete", mode, label: lbl }),
          });
          const out = await delRes.json();
          if (delRes.ok) {
            bridge()?.showToast(`Removed '${lbl}' & updated model`);
            bridge()?.refreshModelsAndGallery();
            refreshTrainerStatus();
          } else {
            bridge()?.showToast(out.error || "Delete failed");
          }
        } catch (err) {
          console.error(err);
        }
      });
    });
  } catch (err) {
    console.warn("Trainer status error:", err);
  }
}

function stopTrainerCapture() {
  if (trainerCaptureTimer) {
    clearInterval(trainerCaptureTimer);
    trainerCaptureTimer = null;
  }
}

if (trainerModeSelect) {
  trainerModeSelect.addEventListener("change", () => {
    stopTrainerCapture();
    capturedSamples = [];
    if (btnTrainerSubmit) btnTrainerSubmit.disabled = true;
    if (trainerProgressBar) trainerProgressBar.style.width = "0%";
    refreshTrainerStatus();
  });
}

if (btnTrainerCapture) {
  btnTrainerCapture.addEventListener("click", () => {
    const label = (trainerLabelInput?.value || "").trim();
    if (!label) {
      bridge()?.showToast("Enter a sign label first (e.g. F or Water)");
      return;
    }
    const mode = trainerModeSelect?.value || "asl";
    stopTrainerCapture();
    capturedSamples = [];
    if (btnTrainerSubmit) btnTrainerSubmit.disabled = true;

    if (mode === "motion") {
      // Capture 5 motion repetitions of 16 frames each (~1.2s per rep)
      const TARGET_REPS = 5;
      const FRAMES_PER_REP = 16;
      let currentSeq = [];
      trainerCaptureTimer = setInterval(() => {
        const lm = bridge()?.getLatestLandmarks() || [];
        if (lm.length > 0) {
          currentSeq.push(lm[0].map((p) => [p.x, p.y, p.z]));
        }
        if (currentSeq.length >= FRAMES_PER_REP) {
          capturedSamples.push(currentSeq);
          currentSeq = [];
        }
        const pct = Math.min(100, Math.round(((capturedSamples.length + currentSeq.length / FRAMES_PER_REP) / TARGET_REPS) * 100));
        if (trainerProgressBar) trainerProgressBar.style.width = `${pct}%`;
        if (trainerStatusText) {
          trainerStatusText.textContent = `Recording motion '${label}': Rep ${capturedSamples.length}/${TARGET_REPS} (Perform gesture!)`;
        }
        if (capturedSamples.length >= TARGET_REPS) {
          stopTrainerCapture();
          if (btnTrainerSubmit) btnTrainerSubmit.disabled = false;
          if (trainerStatusText) trainerStatusText.textContent = `Captured ${TARGET_REPS} motion sequences for '${label}'. Click Train & Save!`;
        }
      }, 65);
    } else {
      const TARGET_SAMPLES = 35;
      trainerCaptureTimer = setInterval(() => {
        const lm = bridge()?.getLatestLandmarks() || [];
        if (mode === "isl" && lm.length < 2) {
          if (trainerStatusText) trainerStatusText.textContent = `Show BOTH hands for ISL (${capturedSamples.length}/${TARGET_SAMPLES})`;
          return;
        }
        if (lm.length === 0) {
          if (trainerStatusText) trainerStatusText.textContent = `Show hand in camera (${capturedSamples.length}/${TARGET_SAMPLES})`;
          return;
        }
        const sample = (mode === "isl" || mode === "actions")
          ? lm.slice(0, 2).map((h) => h.map((p) => [p.x, p.y, p.z]))
          : lm[0].map((p) => [p.x, p.y, p.z]);
        capturedSamples.push(sample);

        const pct = Math.round((capturedSamples.length / TARGET_SAMPLES) * 100);
        if (trainerProgressBar) trainerProgressBar.style.width = `${pct}%`;
        if (trainerStatusText) trainerStatusText.textContent = `Captured ${capturedSamples.length}/${TARGET_SAMPLES} samples for '${label}'`;

        if (capturedSamples.length >= TARGET_SAMPLES) {
          stopTrainerCapture();
          if (btnTrainerSubmit) btnTrainerSubmit.disabled = false;
          if (trainerStatusText) trainerStatusText.textContent = `Ready! ${TARGET_SAMPLES} samples captured — click Train & Save!`;
        }
      }, 65);
    }
  });
}

if (btnTrainerSubmit) {
  btnTrainerSubmit.addEventListener("click", async () => {
    const label = (trainerLabelInput?.value || "").trim();
    const mode = trainerModeSelect?.value || "asl";
    if (!label || capturedSamples.length < 3) return;
    btnTrainerSubmit.disabled = true;
    if (trainerStatusText) trainerStatusText.textContent = "Training model live…";

    try {
      const res = await fetch("/api/trainer/", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRFToken": bridge()?.csrfToken || "" },
        body: JSON.stringify({ action: "train", mode, label, samples: capturedSamples }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (trainerStatusText) trainerStatusText.textContent = data.error || "Training failed";
        btnTrainerSubmit.disabled = false;
        return;
      }
      if (trainerStatusText) {
        trainerStatusText.textContent = `✅ Trained '${data.label}' (${data.added} new samples, ${data.classes.length} total classes)!`;
      }
      capturedSamples = [];
      bridge()?.showToast(`Model updated! '${data.label}' is live now.`);
      bridge()?.refreshModelsAndGallery();
      refreshTrainerStatus();
    } catch (err) {
      console.error(err);
      if (trainerStatusText) trainerStatusText.textContent = "Server error during training";
      btnTrainerSubmit.disabled = false;
    }
  });
}

// ==========================================================================
// 6. RECORDED VIDEO UPLOAD TRANSLATION (.MP4 / .WEBM -> SRT / TXT)
// ==========================================================================
const videoUploadInput = getEl("videoUploadInput");
const uploadedVideoPlayer = getEl("uploadedVideoPlayer");
const videoUploadLang = getEl("videoUploadLang");
const btnScanVideo = getEl("btnScanVideo");
const btnStopVideoScan = getEl("btnStopVideoScan");
const videoScanBar = getEl("videoScanBar");
const videoScanStatus = getEl("videoScanStatus");
const videoTranscriptList = getEl("videoTranscriptList");
const btnExportSrt = getEl("btnExportSrt");
const btnExportVideoTxt = getEl("btnExportVideoTxt");

let imageLandmarker = null;
let cancelVideoScan = false;
let transcriptSegments = [];
let uploadedVideoUrl = null;

async function getOrCreateImageLandmarker() {
  if (imageLandmarker) return imageLandmarker;
  const deps = bridge()?.getLandmarkerDeps();
  if (!deps || !deps.FilesetResolver || !deps.HandLandmarker) {
    throw new Error("MediaPipe is still loading — wait 2 seconds and retry.");
  }
  const fileset = await deps.FilesetResolver.forVisionTasks(deps.WASM_URL);
  const opts = {
    baseOptions: { modelAssetPath: deps.MODEL_URL, delegate: "CPU" },
    runningMode: "IMAGE",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
  };
  imageLandmarker = await deps.HandLandmarker.createFromOptions(fileset, opts);
  return imageLandmarker;
}

function fmtSec(sec) {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

function fmtSrtTime(sec) {
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function renderVideoTranscript() {
  if (!videoTranscriptList) return;
  if (transcriptSegments.length === 0) {
    videoTranscriptList.innerHTML = '<div class="dash-empty">No signs detected in video.</div>';
    return;
  }
  videoTranscriptList.innerHTML = transcriptSegments
    .map(
      (seg) => `
      <button type="button" class="transcript-row" data-time="${seg.start}">
        <span class="tr-time">${fmtSec(seg.start)} – ${fmtSec(seg.end)}</span>
        <span class="tr-label">${escapeHtml(seg.label)}</span>
        <span class="tr-conf">${Math.round(seg.confidence * 100)}%</span>
      </button>`
    )
    .join("");

  videoTranscriptList.querySelectorAll(".transcript-row").forEach((row) => {
    row.addEventListener("click", () => {
      if (uploadedVideoPlayer) {
        uploadedVideoPlayer.currentTime = parseFloat(row.getAttribute("data-time") || "0");
        uploadedVideoPlayer.play().catch(() => {});
      }
    });
  });
}

if (videoUploadInput) {
  videoUploadInput.addEventListener("change", () => {
    const file = videoUploadInput.files?.[0];
    if (!file || !uploadedVideoPlayer) return;
    if (uploadedVideoUrl) URL.revokeObjectURL(uploadedVideoUrl);
    uploadedVideoUrl = URL.createObjectURL(file);
    uploadedVideoPlayer.src = uploadedVideoUrl;
    uploadedVideoPlayer.classList.remove("hidden");
    if (btnScanVideo) btnScanVideo.disabled = false;
    if (videoScanStatus) videoScanStatus.textContent = `Loaded: ${file.name}`;
  });
}

if (btnStopVideoScan) {
  btnStopVideoScan.addEventListener("click", () => {
    cancelVideoScan = true;
  });
}

if (btnScanVideo) {
  btnScanVideo.addEventListener("click", async () => {
    if (!uploadedVideoPlayer || !uploadedVideoPlayer.duration || isNaN(uploadedVideoPlayer.duration)) {
      bridge()?.showToast("Upload a valid video file first");
      return;
    }
    cancelVideoScan = false;
    transcriptSegments = [];
    btnScanVideo.disabled = true;
    if (btnStopVideoScan) btnStopVideoScan.disabled = false;
    if (videoScanStatus) videoScanStatus.textContent = "Loading hand landmark scanner…";

    try {
      const detector = await getOrCreateImageLandmarker();
      const offscreen = document.createElement("canvas");
      offscreen.width = uploadedVideoPlayer.videoWidth || 640;
      offscreen.height = uploadedVideoPlayer.videoHeight || 480;
      const octx = offscreen.getContext("2d");

      const lang = videoUploadLang?.value || "asl";
      const duration = uploadedVideoPlayer.duration;
      const step = 0.4;
      const b = bridge();

      for (let t = 0; t <= duration; t += step) {
        if (cancelVideoScan) break;
        await new Promise((resolve) => {
          const onSeek = () => {
            uploadedVideoPlayer.removeEventListener("seeked", onSeek);
            resolve();
          };
          uploadedVideoPlayer.addEventListener("seeked", onSeek);
          uploadedVideoPlayer.currentTime = Math.min(t, duration);
        });

        octx.drawImage(uploadedVideoPlayer, 0, 0, offscreen.width, offscreen.height);
        const det = detector.detect(offscreen);
        const pct = Math.min(100, Math.round((t / duration) * 100));
        if (videoScanBar) videoScanBar.style.width = `${pct}%`;
        if (videoScanStatus) videoScanStatus.textContent = `Scanning ${fmtSec(t)} / ${fmtSec(duration)} (${pct}%)`;

        if (det?.landmarks && det.landmarks.length > 0) {
          const hands = lang === "isl"
            ? (det.landmarks.length >= 2 ? det.landmarks.slice(0, 2) : null)
            : [det.landmarks[0]];
          if (hands) {
            const res = await fetch("/api/predict/", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-CSRFToken": b?.csrfToken || "" },
              body: JSON.stringify({
                language: lang,
                hands: hands.map((h) => h.map((p) => [p.x, p.y, p.z])),
              }),
            });
            if (res.ok) {
              const pred = await res.json();
              if (pred.confidence >= 0.6) {
                const prev = transcriptSegments[transcriptSegments.length - 1];
                if (prev && prev.label === pred.label && t - prev.end <= step + 0.45) {
                  prev.end = t + step;
                  prev.confidence = Math.max(prev.confidence, pred.confidence);
                } else {
                  transcriptSegments.push({
                    start: t,
                    end: t + step,
                    label: pred.label,
                    confidence: pred.confidence,
                  });
                }
              }
            }
          }
        }
      }

      renderVideoTranscript();
      if (videoScanStatus) {
        videoScanStatus.textContent = cancelVideoScan
          ? `Stopped (${transcriptSegments.length} segments found)`
          : `✅ Scan complete (${transcriptSegments.length} sign segments)`;
      }
    } catch (err) {
      console.error("Video scan error:", err);
      if (videoScanStatus) videoScanStatus.textContent = err.message || "Scan failed";
    } finally {
      btnScanVideo.disabled = false;
      if (btnStopVideoScan) btnStopVideoScan.disabled = true;
    }
  });
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

if (btnExportSrt) {
  btnExportSrt.addEventListener("click", () => {
    if (transcriptSegments.length === 0) {
      bridge()?.showToast("Scan a video first");
      return;
    }
    const srt = transcriptSegments
      .map((s, idx) => `${idx + 1}\n${fmtSrtTime(s.start)} --> ${fmtSrtTime(s.end)}\n${s.label} (${Math.round(s.confidence * 100)}%)\n`)
      .join("\n");
    downloadFile(`signtalk-subtitles-${Date.now()}.srt`, srt);
  });
}

if (btnExportVideoTxt) {
  btnExportVideoTxt.addEventListener("click", () => {
    if (transcriptSegments.length === 0) {
      bridge()?.showToast("Scan a video first");
      return;
    }
    const txt = transcriptSegments
      .map((s) => `[${fmtSec(s.start)} - ${fmtSec(s.end)}] ${s.label} (${Math.round(s.confidence * 100)}%)`)
      .join("\n");
    downloadFile(`signtalk-transcript-${Date.now()}.txt`, txt);
  });
}

// ==========================================================================
// WIRE MODULE INTO SIGNTALK BRIDGE
// ==========================================================================
function registerFeatureHooks() {
  const b = bridge();
  if (!b) {
    setTimeout(registerFeatureHooks, 150);
    return;
  }
  b.isMotionMode = () => Boolean(chkMotionMode && chkMotionMode.checked);
  b.onFrameLandmarks = (landmarks, now) => {
    if (chkMotionMode && chkMotionMode.checked) {
      processMotionFrame(landmarks, now);
    }
  };
  b.onProgressSaved = loadProgressDashboard;
  loadProgressDashboard();
  refreshTrainerStatus();
}

registerFeatureHooks();
