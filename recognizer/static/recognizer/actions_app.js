// ==========================================================================
// SignTalk AI - Action Recognition & Smart Voice Engine (actions_app.js)
// Dedicated Real-time Gesture Recognition & Speech Synthesis Studio
// ==========================================================================

(() => {
  "use strict";

  // ---- Default Settings & State ----
  let CONFIG = {
    predictIntervalMs: 70,
    holdFrames: 3,
    minConfidence: 0.70,
    soundEffects: true,
    skeletonStyle: "cyber", // cyber, emerald, minimal, hidden
    mirrored: true,
    autoVoice: true,
    speechRate: 1.0,
    speechPitch: 1.0,
    selectedVoiceURI: null,
  };

  // Load saved config
  try {
    const saved = localStorage.getItem("signtalk_action_config");
    if (saved) {
      CONFIG = { ...CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn("Could not load action config from localStorage", e);
  }

  const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  const CDN_BASES = [
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14",
    "https://unpkg.com/@mediapipe/tasks-vision@0.10.14",
  ];

  // DOM Elements
  const video = document.getElementById("video");
  const canvas = document.getElementById("overlay");
  const ctx = canvas.getContext("2d");
  const videoContainer = document.getElementById("videoContainer");

  const badgeStatus = document.getElementById("badgeStatus");
  const statusText = document.getElementById("statusText");
  const badgeHands = document.getElementById("badgeHands");
  const handsText = document.getElementById("handsText");
  const badgeFps = document.getElementById("badgeFps");
  const badgeLatency = document.getElementById("badgeLatency");

  const speechBubble = document.getElementById("speechBubble");
  const speechBubbleEmoji = document.getElementById("speechBubbleEmoji");
  const speechBubbleText = document.getElementById("speechBubbleText");

  const cameraSelect = document.getElementById("cameraSelect");
  const btnPauseCam = document.getElementById("btnPauseCam");
  const iconPause = document.getElementById("iconPause");
  const iconPlay = document.getElementById("iconPlay");
  const btnFlipCam = document.getElementById("btnFlipCam");
  const btnToggleSkeleton = document.getElementById("btnToggleSkeleton");
  const btnStopCam = document.getElementById("btnStopCam");

  const actionHeroEmoji = document.getElementById("actionHeroEmoji");
  const actionHeroName = document.getElementById("actionHeroName");
  const actionHeroCategory = document.getElementById("actionHeroCategory");
  const actionHeroPhrase = document.getElementById("actionHeroPhrase");
  const chkAutoVoice = document.getElementById("chkAutoVoice");
  const btnManualSpeakAction = document.getElementById("btnManualSpeakAction");

  const soundWaveContainer = document.getElementById("soundWaveBars");
  const soundWaveBars = document.querySelectorAll(".wave-bar");
  const actionGrid = document.getElementById("actionGrid");
  const actionFeedList = document.getElementById("actionFeedList");
  const btnClearActionFeed = document.getElementById("btnClearActionFeed");

  const actionVoiceSelect = document.getElementById("actionVoiceSelect");
  const actionPitchSlider = document.getElementById("actionPitchSlider");
  const actionPitchVal = document.getElementById("actionPitchVal");
  const actionRateSlider = document.getElementById("actionRateSlider");
  const actionRateVal = document.getElementById("actionRateVal");
  const actionSearchInput = document.getElementById("actionSearchInput");
  const actionCatPills = document.querySelectorAll(".action-cat-pill");

  // App State
  let handLandmarker = null;
  let currentStream = null;
  let isPaused = false;
  let animFrameId = null;
  let lastVideoTime = -1;
  let lastPredictTime = 0;
  let fpsCounter = 0;
  let lastFpsCheck = performance.now();
  let availableVoices = [];

  // Gesture Tracker
  let actionHoldCandidate = null;
  let actionHoldCount = 0;
  let lastSpokenAction = null;
  let lastSpokenTimestamp = 0;
  let allActions = [];

  // ==========================================================================
  // Web Speech API Voice Engine
  // ==========================================================================
  function initSpeechVoices() {
    if (!("speechSynthesis" in window)) return;

    function populateVoices() {
      availableVoices = window.speechSynthesis.getVoices();
      if (!actionVoiceSelect) return;
      actionVoiceSelect.innerHTML = "";

      // Prioritize English & Indian voices
      availableVoices.forEach((voice, index) => {
        const opt = document.createElement("option");
        opt.value = voice.voiceURI;
        opt.textContent = `${voice.name} (${voice.lang})${voice.default ? " • Default" : ""}`;
        if (CONFIG.selectedVoiceURI && voice.voiceURI === CONFIG.selectedVoiceURI) {
          opt.selected = true;
        } else if (!CONFIG.selectedVoiceURI && (voice.lang.includes("en-IN") || voice.lang.includes("en-US"))) {
          opt.selected = true;
        }
        actionVoiceSelect.appendChild(opt);
      });
    }

    populateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }
  }

  function setWaveBarsActive(active) {
    if (soundWaveContainer) {
      soundWaveContainer.classList.toggle("active", active);
    }
    if (!soundWaveBars) return;
    soundWaveBars.forEach((bar) => {
      if (active) {
        bar.style.animationPlayState = "running";
        bar.style.opacity = "1";
      } else {
        bar.style.animationPlayState = "paused";
        bar.style.opacity = "0.4";
      }
    });
  }

  function speakActionPhrase(phrase, emoji) {
    if (!phrase || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.rate = parseFloat(CONFIG.speechRate || 1.0);
    utterance.pitch = parseFloat(CONFIG.speechPitch || 1.0);

    if (actionVoiceSelect && actionVoiceSelect.value) {
      const selectedVoice = availableVoices.find((v) => v.voiceURI === actionVoiceSelect.value);
      if (selectedVoice) utterance.voice = selectedVoice;
    }

    setWaveBarsActive(true);

    utterance.onend = () => {
      setWaveBarsActive(false);
    };

    utterance.onerror = () => {
      setWaveBarsActive(false);
    };

    window.speechSynthesis.speak(utterance);
    showSpeechBubble(phrase, emoji);
  }

  function showSpeechBubble(phrase, emoji) {
    if (!speechBubble || !speechBubbleText) return;
    speechBubbleEmoji.textContent = emoji || "🗣️";
    speechBubbleText.textContent = phrase;
    speechBubble.classList.remove("hidden");

    clearTimeout(speechBubble._timer);
    speechBubble._timer = setTimeout(() => {
      speechBubble.classList.add("hidden");
    }, 2800);
  }

  // ==========================================================================
  // Client-Side Geometric Gesture Recognition Engine
  // ==========================================================
  function dist3d(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = (p1.z || 0) - (p2.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function analyzeHandLandmarks(hand) {
    const wrist = hand[0];
    const thumb_mcp = hand[2], thumb_ip = hand[3], thumb_tip = hand[4];
    const index_mcp = hand[5], index_pip = hand[6], index_tip = hand[8];
    const mid_mcp = hand[9], mid_pip = hand[10], mid_tip = hand[12];
    const ring_pip = hand[14], ring_tip = hand[16];
    const pinky_mcp = hand[17], pinky_pip = hand[18], pinky_tip = hand[20];

    const palmScale = Math.max(dist3d(wrist, mid_mcp), 0.001);

    // Rotation-invariant wrist-to-tip vs wrist-to-PIP distances (matches backend action_predictor.py)
    const indexExt = dist3d(wrist, index_tip) > dist3d(wrist, index_pip) * 1.14;
    const midExt = dist3d(wrist, mid_tip) > dist3d(wrist, mid_pip) * 1.14;
    const ringExt = dist3d(wrist, ring_tip) > dist3d(wrist, ring_pip) * 1.14;
    const pinkyExt = dist3d(wrist, pinky_tip) > dist3d(wrist, pinky_pip) * 1.14;

    const thumbDistPinky = dist3d(thumb_tip, pinky_mcp) / palmScale;
    const thumbDistIdxMcp = dist3d(thumb_tip, index_mcp) / palmScale;
    const thumbExt =
      (dist3d(wrist, thumb_tip) > dist3d(wrist, thumb_ip) * 1.05 && thumbDistPinky > 0.62) ||
      thumbDistIdxMcp > 0.65;

    const numExtended = (indexExt ? 1 : 0) + (midExt ? 1 : 0) + (ringExt ? 1 : 0) + (pinkyExt ? 1 : 0);

    const spreadIdxMid = dist3d(index_tip, mid_tip) / palmScale;
    const spreadMidRng = dist3d(mid_tip, ring_tip) / palmScale;
    const pinchThumbIdx = dist3d(thumb_tip, index_tip) / palmScale;
    const pinchThumbMid = dist3d(thumb_tip, mid_tip) / palmScale;

    return {
      wrist, palmScale, thumb_mcp, index_mcp, mid_mcp,
      thumb_tip, index_tip, mid_tip, ring_tip, pinky_tip,
      thumbExt, indexExt, midExt, ringExt, pinkyExt, numExtended,
      spreadIdxMid, spreadMidRng, pinchThumbIdx, pinchThumbMid,
    };
  }

  function detectActionFromLandmarks(hands) {
    if (!hands || hands.length === 0) return null;

    const h1 = analyzeHandLandmarks(hands[0]);
    const h2 = hands.length > 1 ? analyzeHandLandmarks(hands[1]) : null;

    // 1. Two-Handed Gestures
    if (h2) {
      const avgScale = (h1.palmScale + h2.palmScale) / 2;
      const wristDist = dist3d(h1.wrist, h2.wrist) / avgScale;
      const tipDist = dist3d(h1.mid_tip, h2.mid_tip) / avgScale;

      // Namaste / Welcome: Both palms pressed together upright
      if (wristDist < 1.6 && tipDist < 1.1 && h1.numExtended >= 3 && h2.numExtended >= 3) {
        return { action: "Namaste / Welcome", phrase: "Namaste! Welcome!", emoji: "🪷", category: "Greeting" };
      }

      // Help / Emergency: Thumbs-up resting on flat open palm
      const h1Flat = h1.numExtended >= 3;
      const h2Flat = h2.numExtended >= 3;
      const h1ThumbUp = h1.thumbExt && h1.numExtended === 0 && h1.thumb_tip.y < h1.index_mcp.y;
      const h2ThumbUp = h2.thumbExt && h2.numExtended === 0 && h2.thumb_tip.y < h2.index_mcp.y;
      if ((h1Flat && h2ThumbUp) || (h2Flat && h1ThumbUp)) {
        return { action: "Help / Emergency", phrase: "Please help me!", emoji: "🆘", category: "Emergency" };
      }

      // Please: Both palms open and cupped together side-by-side
      const palmLevelDiff = Math.abs(h1.wrist.y - h2.wrist.y) / avgScale;
      if (palmLevelDiff < 0.85 && wristDist < 2.5 && h1.numExtended >= 3 && h2.numExtended >= 3) {
        return { action: "Please", phrase: "Please, could you help?", emoji: "🤲", category: "Courtesy" };
      }
    }

    // 2. Single-Hand Gestures (Dominant Hand)
    // I Love You (ILY): Thumb, Index, Pinky extended; Middle & Ring curled
    if (h1.thumbExt && h1.indexExt && h1.pinkyExt && !h1.midExt && !h1.ringExt) {
      return { action: "I Love You", phrase: "I love you!", emoji: "🤟", category: "Affection" };
    }

    // Call Me (Shaka): Thumb and Pinky extended; middle 3 curled
    if (h1.thumbExt && h1.pinkyExt && !h1.indexExt && !h1.midExt && !h1.ringExt) {
      return { action: "Call Me", phrase: "Call me later.", emoji: "🤙", category: "Social" };
    }

    // Peace / Victory: Index and Middle extended in V shape
    if (h1.indexExt && h1.midExt && !h1.ringExt && !h1.pinkyExt && h1.spreadIdxMid > 0.24) {
      return { action: "Peace / Victory", phrase: "Peace and victory!", emoji: "✌️", category: "Social" };
    }

    // No: Pinched index & middle tips near thumb (checked BEFORE Thumbs Up / Yes so beak pinch isn't shadowed!)
    if (h1.pinchThumbIdx < 0.44 && h1.pinchThumbMid < 0.50 && !h1.pinkyExt && !h1.ringExt) {
      return { action: "No", phrase: "No, thank you.", emoji: "🙅", category: "Response" };
    }

    // Good / Thumbs Up: Thumb clearly pointing upward above thumb MCP / index knuckle
    if (h1.thumbExt && h1.numExtended === 0 && h1.thumb_tip.y < h1.thumb_mcp.y - 0.15 * h1.palmScale && h1.thumb_tip.y < h1.wrist.y) {
      return { action: "Good / Great", phrase: "Very good, nice job!", emoji: "👍", category: "Feedback" };
    }

    // Bad / Thumbs Down: Thumb clearly pointing downward below thumb MCP / knuckles
    if (h1.thumbExt && h1.numExtended === 0 && h1.thumb_tip.y > h1.thumb_mcp.y + 0.15 * h1.palmScale && h1.thumb_tip.y > h1.mid_mcp.y) {
      return { action: "Bad / Dislike", phrase: "No, that's not good.", emoji: "👎", category: "Feedback" };
    }

    // Yes / Affirmative: Tight fist with all fingers curled
    if (!h1.thumbExt && h1.numExtended === 0) {
      return { action: "Yes / Affirmative", phrase: "Yes, I agree!", emoji: "✊", category: "Response" };
    }

    // Open palm gestures: Hello (spread fingers) vs Thank You (near face OR tilted forward from chin) vs Stop (upright closed palm)
    if (h1.numExtended >= 4) {
      const isSpread = h1.spreadIdxMid > 0.40 || h1.spreadMidRng > 0.38;
      if (isSpread) {
        return { action: "Hello / Hi", phrase: "Hello! How are you?", emoji: "👋", category: "Greeting" };
      }
      const verticalLift = (h1.wrist.y - h1.mid_tip.y) / h1.palmScale;
      const isTiltedForward = verticalLift < 1.20;
      if (h1.wrist.y < 0.46 || isTiltedForward) {
        return { action: "Thank You", phrase: "Thank you so much!", emoji: "🙏", category: "Courtesy" };
      }
      return { action: "Stop / Wait", phrase: "Stop, please wait.", emoji: "✋", category: "Command" };
    }

    if (h1.numExtended >= 3 && (h1.wrist.y < 0.46 || (h1.wrist.y - h1.mid_tip.y) / h1.palmScale < 1.15)) {
      return { action: "Thank You", phrase: "Thank you so much!", emoji: "🙏", category: "Courtesy" };
    }

    return null;
  }

  // ==========================================================================
  // Action Recognition Lifecycle & UI Sync
  // ==========================================================================
  function handleActionRecognition(rawHands) {
    let detected = detectActionFromLandmarks(rawHands);

    if (detected) {
      if (actionHoldCandidate === detected.action) {
        actionHoldCount++;
      } else {
        actionHoldCandidate = detected.action;
        actionHoldCount = 1;
      }

      if (actionHoldCount >= CONFIG.holdFrames) {
        triggerActionExecution(detected);
      }
    } else {
      actionHoldCount = Math.max(0, actionHoldCount - 1);
      if (actionHoldCount === 0) actionHoldCandidate = null;
    }
  }

  function triggerActionExecution(detected) {
    const now = Date.now();
    // Throttle repeat speaking of same action within 3.5 seconds
    if (lastSpokenAction === detected.action && now - lastSpokenTimestamp < 3500) {
      return;
    }

    lastSpokenAction = detected.action;
    lastSpokenTimestamp = now;

    // 1. Update Hero Monitor
    updateActionHeroDisplay(detected);

    // 2. Speak automatically if enabled
    if (chkAutoVoice && chkAutoVoice.checked) {
      speakActionPhrase(detected.phrase, detected.emoji);
    } else {
      showSpeechBubble(detected.phrase, detected.emoji);
    }

    // 3. Highlight Card in Library
    highlightActionInLibrary(detected.action);

    // 4. Log to Timeline Feed
    logActionToFeed(detected);
  }

  function updateActionHeroDisplay(detected) {
    if (actionHeroEmoji) {
      actionHeroEmoji.classList.remove("pop-3d");
      void actionHeroEmoji.offsetWidth;
      actionHeroEmoji.classList.add("pop-3d");
      actionHeroEmoji.textContent = detected.emoji;
    }
    if (actionHeroName) actionHeroName.textContent = detected.action;
    if (actionHeroCategory) actionHeroCategory.textContent = detected.category;
    if (actionHeroPhrase) actionHeroPhrase.textContent = `"${detected.phrase}"`;
  }

  function highlightActionInLibrary(actionName) {
    document.querySelectorAll(".action-card").forEach((card) => {
      if (card.dataset.action === actionName) {
        card.classList.add("active-sign", "active-pulse");
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setTimeout(() => card.classList.remove("active-sign", "active-pulse"), 2500);
      }
    });
  }

  function logActionToFeed(detected) {
    if (!actionFeedList) return;

    const emptyMsg = actionFeedList.querySelector(".feed-empty");
    if (emptyMsg) emptyMsg.remove();

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

    const item = document.createElement("div");
    item.className = "feed-item";
    item.innerHTML = `
      <div class="feed-item-left">
        <span class="feed-item-emoji">${detected.emoji}</span>
        <div>
          <div class="feed-item-phrase">${detected.phrase}</div>
          <div class="feed-item-act-name">${detected.action} • <span class="tag">${detected.category}</span></div>
        </div>
      </div>
      <span class="feed-item-time">${timeStr}</span>
    `;

    actionFeedList.prepend(item);

    // Keep max 25 items
    while (actionFeedList.children.length > 25) {
      actionFeedList.lastElementChild.remove();
    }
  }

  // ==========================================================================
  // Action Library Population & Search/Filter
  // ==========================================================================
  async function populateActionLibrary() {
    try {
      const resp = await fetch("/api/actions/");
      if (!resp.ok) throw new Error("Actions API unavailable");
      const data = await resp.json();
      allActions = (data.actions && data.actions.length > 0) ? data.actions : getDefaultActions();
      renderActionGrid(allActions);
    } catch (e) {
      console.warn("Could not load actions from API, using defaults", e);
      allActions = getDefaultActions();
      renderActionGrid(allActions);
    }
  }

  function renderActionGrid(actions) {
    if (!actionGrid) return;
    actionGrid.innerHTML = "";

    actions.forEach((act) => {
      const card = document.createElement("div");
      card.className = "action-card tilt-3d";
      card.dataset.action = act.action;
      card.dataset.category = act.category;

      card.innerHTML = `
        <div class="action-card-header">
          <span class="action-card-emoji">${act.emoji}</span>
          <span class="action-card-name">${act.action}</span>
        </div>
        <div class="action-card-phrase">"${act.phrase}"</div>
        <div class="action-card-gesture">${act.gesture || ""}</div>
        <div class="action-card-actions">
          <button class="btn-card-voice" type="button" title="Speak this phrase out loud">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            <span>Speak</span>
          </button>
        </div>
      `;

      card.querySelector(".btn-card-voice").addEventListener("click", (e) => {
        e.stopPropagation();
        speakActionPhrase(act.phrase, act.emoji);
        updateActionHeroDisplay(act);
        logActionToFeed(act);
      });

      card.addEventListener("click", () => {
        updateActionHeroDisplay(act);
        speakActionPhrase(act.phrase, act.emoji);
      });

      actionGrid.appendChild(card);
    });
  }

  function filterActions() {
    const term = (actionSearchInput?.value || "").toLowerCase().trim();
    const activeCatPill = document.querySelector(".action-cat-pill.active");
    const cat = activeCatPill ? activeCatPill.dataset.cat : "all";

    const filtered = allActions.filter((act) => {
      const matchesCat = cat === "all" || act.category.toLowerCase() === cat.toLowerCase();
      const matchesTerm =
        !term ||
        act.action.toLowerCase().includes(term) ||
        act.phrase.toLowerCase().includes(term) ||
        (act.gesture && act.gesture.toLowerCase().includes(term));
      return matchesCat && matchesTerm;
    });

    renderActionGrid(filtered);
  }

  function getDefaultActions() {
    return [
      { action: "Hello / Hi", phrase: "Hello! How are you?", emoji: "👋", category: "Greeting", gesture: "Open palm waving with spread fingers" },
      { action: "Thank You", phrase: "Thank you so much!", emoji: "🙏", category: "Courtesy", gesture: "Open flat hand extending forward from chin" },
      { action: "I Love You", phrase: "I love you!", emoji: "🤟", category: "Affection", gesture: "Thumb, index, and pinky extended upright" },
      { action: "Namaste / Welcome", phrase: "Namaste! Welcome!", emoji: "🪷", category: "Greeting", gesture: "Both palms pressed together in front of chest" },
      { action: "Help / Emergency", phrase: "Please help me!", emoji: "🆘", category: "Emergency", gesture: "Thumbs-up resting on flat open palm" },
      { action: "Yes / Affirmative", phrase: "Yes, I agree!", emoji: "✊", category: "Response", gesture: "Fist held in front with gentle nod" },
      { action: "No", phrase: "No, thank you.", emoji: "🙅", category: "Response", gesture: "Index and middle tapping thumb like a beak" },
      { action: "Good / Great", phrase: "Very good, nice job!", emoji: "👍", category: "Feedback", gesture: "Thumbs-up pointing straight upward" },
      { action: "Bad / Dislike", phrase: "No, that's not good.", emoji: "👎", category: "Feedback", gesture: "Thumbs-down pointing downward" },
      { action: "Peace / Victory", phrase: "Peace and victory!", emoji: "✌️", category: "Social", gesture: "Index and middle fingers in a spread V" },
      { action: "Stop / Wait", phrase: "Stop, please wait.", emoji: "✋", category: "Command", gesture: "Flat palm facing camera with closed fingers" },
      { action: "Call Me", phrase: "Call me later.", emoji: "🤙", category: "Social", gesture: "Thumb and pinky extended to ear (Shaka sign)" },
      { action: "Please", phrase: "Please, could you help?", emoji: "🤲", category: "Courtesy", gesture: "Both palms open and cupped together" },
    ];
  }

  // ==========================================================================
  // MediaPipe HandLandmarker Setup & Dedicated Action Camera Loop
  // ==========================================================================
  let cameraState = "starting"; // starting | active | paused | stopped | error
  let isCameraStopped = false;
  let modelState = "loading";   // loading | ready | error
  let cameraErrText = "";
  let modelErrText = "";

  function syncActionStatus() {
    if (cameraState === "error") {
      updateStatus(cameraErrText || "Camera access denied or unavailable", "danger");
      return;
    }
    if (cameraState === "stopped") {
      updateStatus("Camera Stopped", "warning");
      return;
    }
    if (cameraState === "paused") {
      updateStatus("Camera Paused", "warning");
      return;
    }
    if (cameraState === "starting") {
      updateStatus("Starting Action Camera…", "warning");
      return;
    }
    if (modelState === "error") {
      updateStatus(modelErrText || "Model load failed. Check internet.", "danger");
      return;
    }
    if (modelState === "loading") {
      updateStatus("Camera Active • Downloading AI Model…", "warning");
      return;
    }
    updateStatus("AI Action Engine Ready • Perform Gestures", "success");
  }

  function withTimeout(promise, ms, what) {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms)
      ),
    ]);
  }

  async function loadHandLandmarker() {
    modelState = "loading";
    syncActionStatus();

    for (const cdn of CDN_BASES) {
      try {
        const { FilesetResolver, HandLandmarker: HL } = await withTimeout(
          import(`${cdn}/vision_bundle.mjs`),
          15000,
          "MediaPipe bundle"
        );
        const vision = await withTimeout(
          FilesetResolver.forVisionTasks(`${cdn}/wasm`),
          20000,
          "MediaPipe WASM"
        );
        const opts = {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.65,
          minHandPresenceConfidence: 0.65,
          minTrackingConfidence: 0.65,
        };
        try {
          handLandmarker = await withTimeout(
            HL.createFromOptions(vision, opts),
            20000,
            "HandLandmarker GPU"
          );
        } catch (gpuErr) {
          console.warn("GPU delegate failed on Actions page, falling back to CPU:", gpuErr);
          opts.baseOptions.delegate = "CPU";
          handLandmarker = await withTimeout(
            HL.createFromOptions(vision, opts),
            20000,
            "HandLandmarker CPU"
          );
        }
        modelState = "ready";
        syncActionStatus();
        return;
      } catch (err) {
        console.warn(`Failed loading model from ${cdn}:`, err);
      }
    }
    modelState = "error";
    modelErrText = "Model load failed. Check internet.";
    syncActionStatus();
  }

  function updateActionStopBtn(stopped) {
    if (!btnStopCam) return;
    btnStopCam.classList.toggle("stopped", stopped);
    btnStopCam.textContent = stopped ? "▶ Start Camera" : "⏹ Stop Camera";
  }

  async function initCamera(deviceId = null) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cameraState = "error";
      cameraErrText = "Camera API requires localhost or HTTPS.";
      syncActionStatus();
      return;
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

    try {
      cameraState = "starting";
      syncActionStatus();
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = currentStream;
      isCameraStopped = false;
      updateActionStopBtn(false);

      try {
        await video.play();
      } catch (e) {
        console.warn("Initial video.play() pending metadata", e);
      }

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

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      cameraState = "active";
      syncActionStatus();
      await populateCameraDevices();
      if (deviceId && cameraSelect) cameraSelect.value = deviceId;
      startCameraLoop();
    } catch (err) {
      console.error("Camera access error:", err);
      cameraState = "error";
      cameraErrText = (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")
        ? "Camera permission denied. Allow access and refresh."
        : "Camera access denied or unavailable";
      syncActionStatus();
    }
  }

  async function populateCameraDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      if (!cameraSelect) return;
      cameraSelect.innerHTML = "";
      videoDevices.forEach((dev, idx) => {
        const opt = document.createElement("option");
        opt.value = dev.deviceId;
        opt.textContent = dev.label || `Camera ${idx + 1}`;
        cameraSelect.appendChild(opt);
      });
    } catch (e) {
      console.warn("Could not list video devices", e);
    }
  }

  function startCameraLoop() {
    if (animFrameId) cancelAnimationFrame(animFrameId);

    function loop(now) {
      animFrameId = requestAnimationFrame(loop);

      // FPS Calculation
      fpsCounter++;
      if (now - lastFpsCheck >= 1000) {
        if (badgeFps) badgeFps.textContent = `${fpsCounter} FPS`;
        fpsCounter = 0;
        lastFpsCheck = now;
      }

      if (isPaused || video.paused || video.ended || !handLandmarker) return;

      if (canvas && video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        const startTime = performance.now();
        const results = handLandmarker.detectForVideo(video, now);
        const latency = performance.now() - startTime;
        if (badgeLatency) badgeLatency.textContent = `${latency.toFixed(0)} ms`;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const handsCount = results.landmarks ? results.landmarks.length : 0;
        if (handsText) handsText.textContent = `${handsCount} Hand${handsCount !== 1 ? "s" : ""}`;

        if (handsCount > 0) {
          if (CONFIG.skeletonStyle !== "hidden") {
            drawSkeletonLandmarks(results.landmarks);
          }

          // Run action recognition at configured interval
          if (now - lastPredictTime >= CONFIG.predictIntervalMs) {
            lastPredictTime = now;
            handleActionRecognition(results.landmarks);
          }
        } else {
          actionHoldCount = 0;
          actionHoldCandidate = null;
        }
      }
    }

    animFrameId = requestAnimationFrame(loop);
  }

  // Draw cyber skeleton lines
  function drawSkeletonLandmarks(landmarksList) {
    const CONNECTIONS = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17]
    ];

    landmarksList.forEach((landmarks) => {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(52, 211, 153, 0.85)";
      ctx.shadowColor = "rgba(52, 211, 153, 0.8)";
      ctx.shadowBlur = 8;

      CONNECTIONS.forEach(([start, end]) => {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        ctx.beginPath();
        ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
        ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
        ctx.stroke();
      });

      // Draw Joint Dots
      landmarks.forEach((p, idx) => {
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, idx === 4 || idx === 8 || idx === 12 || idx === 16 || idx === 20 ? 5.5 : 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = idx === 0 ? "#10b981" : "#38bdf8";
        ctx.shadowColor = "#38bdf8";
        ctx.shadowBlur = 10;
        ctx.fill();
      });
      ctx.shadowBlur = 0;
    });
  }

  function updateStatus(text, type = "success") {
    if (statusText) statusText.textContent = text;
    if (badgeStatus) {
      badgeStatus.className = `hud-pill status-pill status-${type}`;
    }
  }

  // ==========================================================================
  // Interactive 3D Mouse Tilt Controller
  // ==========================================================================
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

  // ==========================================================================
  // Event Listeners & Initialization
  // ==========================================================================
  function setupEvents() {
    // Camera Select
    if (cameraSelect) {
      cameraSelect.addEventListener("change", () => {
        initCamera(cameraSelect.value);
      });
    }

    if (btnStopCam) {
      btnStopCam.addEventListener("click", async () => {
        if (!isCameraStopped) {
          isCameraStopped = true;
          isPaused = false;
          cameraState = "stopped";
          if (iconPause) iconPause.classList.remove("hidden");
          if (iconPlay) iconPlay.classList.add("hidden");
          if (animFrameId) {
            cancelAnimationFrame(animFrameId);
            animFrameId = null;
          }
          if (currentStream) {
            currentStream.getTracks().forEach((t) => t.stop());
            currentStream = null;
          }
          if (video) video.srcObject = null;
          if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (handsText) handsText.textContent = "0 Hands";
          if (badgeFps) badgeFps.textContent = "0 FPS";
          updateActionStopBtn(true);
          syncActionStatus();
        } else {
          isCameraStopped = false;
          updateActionStopBtn(false);
          await initCamera(cameraSelect ? cameraSelect.value : null);
        }
      });
    }

    // Pause / Resume
    if (btnPauseCam) {
      btnPauseCam.addEventListener("click", () => {
        if (isCameraStopped) {
          btnStopCam?.click();
          return;
        }
        isPaused = !isPaused;
        if (isPaused) {
          cameraState = "paused";
          if (video) video.pause();
          if (iconPause) iconPause.classList.add("hidden");
          if (iconPlay) iconPlay.classList.remove("hidden");
          syncActionStatus();
        } else {
          cameraState = "active";
          if (video) video.play().catch(console.warn);
          if (iconPause) iconPause.classList.remove("hidden");
          if (iconPlay) iconPlay.classList.add("hidden");
          syncActionStatus();
        }
      });
    }

    // Flip Mirror
    function applyActionMirror() {
      if (videoContainer) videoContainer.classList.toggle("mirrored", CONFIG.mirrored);
      if (btnFlipCam) btnFlipCam.classList.toggle("active", CONFIG.mirrored);
    }
    applyActionMirror();

    if (btnFlipCam) {
      btnFlipCam.addEventListener("click", () => {
        CONFIG.mirrored = !CONFIG.mirrored;
        applyActionMirror();
        saveConfig();
      });
    }

    // Toggle Skeleton
    if (btnToggleSkeleton) {
      btnToggleSkeleton.addEventListener("click", () => {
        CONFIG.skeletonStyle = CONFIG.skeletonStyle === "hidden" ? "cyber" : "hidden";
        btnToggleSkeleton.classList.toggle("active", CONFIG.skeletonStyle !== "hidden");
      });
    }

    // Auto-voice checkbox
    if (chkAutoVoice) {
      chkAutoVoice.checked = CONFIG.autoVoice;
      chkAutoVoice.addEventListener("change", () => {
        CONFIG.autoVoice = chkAutoVoice.checked;
        saveConfig();
      });
    }

    // Manual speak button
    if (btnManualSpeakAction) {
      btnManualSpeakAction.addEventListener("click", () => {
        const phrase = (actionHeroPhrase?.textContent || "").replace(/^"|"$/g, "") || "Hello! How are you?";
        const emoji = actionHeroEmoji?.textContent || "👋";
        speakActionPhrase(phrase, emoji);
      });
    }

    // Pitch & Rate Sliders
    if (actionPitchSlider && actionPitchVal) {
      actionPitchSlider.value = CONFIG.speechPitch || 1.0;
      actionPitchVal.textContent = actionPitchSlider.value;
      actionPitchSlider.addEventListener("input", () => {
        CONFIG.speechPitch = actionPitchSlider.value;
        actionPitchVal.textContent = actionPitchSlider.value;
        saveConfig();
      });
    }

    if (actionRateSlider && actionRateVal) {
      actionRateSlider.value = CONFIG.speechRate || 1.0;
      actionRateVal.textContent = `${actionRateSlider.value}x`;
      actionRateSlider.addEventListener("input", () => {
        CONFIG.speechRate = actionRateSlider.value;
        actionRateVal.textContent = `${actionRateSlider.value}x`;
        saveConfig();
      });
    }

    if (actionVoiceSelect) {
      actionVoiceSelect.addEventListener("change", () => {
        CONFIG.selectedVoiceURI = actionVoiceSelect.value;
        saveConfig();
      });
    }

    // Search and Category Pills
    if (actionSearchInput) {
      actionSearchInput.addEventListener("input", filterActions);
    }

    actionCatPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        actionCatPills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        filterActions();
      });
    });

    // Clear feed button
    if (btnClearActionFeed) {
      btnClearActionFeed.addEventListener("click", () => {
        if (actionFeedList) {
          actionFeedList.innerHTML = '<div class="feed-empty">Feed cleared. Perform signs in camera to speak!</div>';
        }
      });
    }

    // Theme Switcher Toggle
    const btnThemeToggle = document.getElementById("btnThemeToggle");
    if (btnThemeToggle) {
      const themes = ["dark", "cyber", "light"];
      btnThemeToggle.addEventListener("click", () => {
        const curTheme = document.documentElement.getAttribute("data-theme") || "dark";
        const nextTheme = themes[(themes.indexOf(curTheme) + 1) % themes.length];
        document.documentElement.setAttribute("data-theme", nextTheme);
        localStorage.setItem("signtalk_theme", nextTheme);
      });

      const savedTheme = localStorage.getItem("signtalk_theme");
      if (savedTheme) {
        document.documentElement.setAttribute("data-theme", savedTheme);
      }
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem("signtalk_action_config", JSON.stringify(CONFIG));
    } catch (e) {}
  }

  // ---- Bootstrap ----
  async function init() {
    setupEvents();
    initSpeechVoices();
    init3DTiltEffects();

    // 1. Start camera immediately (~250ms!)
    const camPromise = initCamera();

    // 2. In parallel: load action library & model
    populateActionLibrary();
    try {
      await loadHandLandmarker();
      await camPromise;
    } catch (e) {
      console.error("Initialization error:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
