const shell = document.querySelector(".mobile-shell");
const sessionId = shell ? shell.dataset.sessionId : "";
const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || "";

const video = document.getElementById("mobileVideo");
const canvas = document.getElementById("mobileCanvas");
const ctx = canvas ? canvas.getContext("2d") : null;
const camStage = document.getElementById("mobileCamStage");
const statusPill = document.getElementById("mobileStatusPill");
const detectedPill = document.getElementById("mobileDetectedPill");
const btnFlipCamera = document.getElementById("btnFlipCamera");

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const CDN_BASES = [
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14",
  "https://unpkg.com/@mediapipe/tasks-vision@0.10.14",
];

let HandLandmarker, FilesetResolver, DrawingUtils, WASM_URL;
let handLandmarker = null;
let drawing = null;
let currentStream = null;
let facingMode = "environment";
let currentLanguage = "asl";
let lastVideoTime = -1;
let lastPushAt = 0;
let inFlight = false;

function setMobileStatus(text, state = "") {
  if (!statusPill) return;
  statusPill.textContent = text;
  statusPill.className = "status-pill" + (state ? ` ${state}` : "");
}

function withTimeout(promise, ms, what) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${what} timed out`)), ms)
    ),
  ]);
}

async function loadMediaPipe() {
  for (const base of CDN_BASES) {
    try {
      const m = await withTimeout(import(`${base}/vision_bundle.mjs`), 15000, "MediaPipe");
      ({ HandLandmarker, FilesetResolver, DrawingUtils } = m);
      WASM_URL = `${base}/wasm`;
      return;
    } catch (e) {
      console.warn("MediaPipe load failed from", base, e);
    }
  }
  throw new Error("Could not load MediaPipe");
}

async function createLandmarker() {
  const fileset = await withTimeout(FilesetResolver.forVisionTasks(WASM_URL), 20000, "WASM");
  const options = {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    return await withTimeout(HandLandmarker.createFromOptions(fileset, options), 20000, "Model");
  } catch {
    options.baseOptions.delegate = "CPU";
    return await withTimeout(HandLandmarker.createFromOptions(fileset, options), 20000, "Model");
  }
}

async function startMobileCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
  if (camStage) {
    camStage.classList.toggle("mirrored", facingMode === "user");
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  currentStream = stream;
  video.srcObject = stream;
  await video.play();
}

async function pushLandmarks(hands) {
  if (!sessionId || inFlight) return;
  inFlight = true;
  try {
    const res = await fetch(`/api/remote_push/${encodeURIComponent(sessionId)}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": csrfToken,
      },
      body: JSON.stringify({
        hands: hands.map((h) => h.map((p) => [p.x, p.y, p.z])),
      }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.language) currentLanguage = data.language;
    setMobileStatus(`Live • ${currentLanguage.toUpperCase()}`, "ready");
    if (detectedPill) {
      if (hands.length === 0) {
        detectedPill.textContent = "Show hand in camera…";
      } else if (data.needs_two_hands) {
        detectedPill.textContent = "ISL needs 2 hands (1 detected)";
      } else if (data.label) {
        const pct = Math.round((data.confidence || 0) * 100);
        detectedPill.textContent = `Sending to Laptop: ${data.label} (${pct}%)`;
      }
    }
  } catch (err) {
    console.warn("Push failed:", err);
  } finally {
    inFlight = false;
  }
}

function loop() {
  if (video && video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();

    if (canvas && video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    if (handLandmarker) {
      const result = handLandmarker.detectForVideo(video, now);
      if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (result && result.landmarks && result.landmarks.length > 0) {
        if (drawing) {
          for (const lm of result.landmarks) {
            drawing.drawConnectors(lm, HandLandmarker.HAND_CONNECTIONS, { color: "#06b6d4", lineWidth: 3 });
            drawing.drawLandmarks(lm, { color: "#ffffff", radius: 3 });
          }
        }
        if (now - lastPushAt >= 160) {
          lastPushAt = now;
          pushLandmarks(result.landmarks);
        }
      } else if (now - lastPushAt >= 900) {
        lastPushAt = now;
        pushLandmarks([]);
      }
    }
  }
  requestAnimationFrame(loop);
}

if (btnFlipCamera) {
  btnFlipCamera.addEventListener("click", async () => {
    facingMode = facingMode === "environment" ? "user" : "environment";
    try {
      await startMobileCamera();
    } catch (err) {
      setMobileStatus("Camera switch failed", "error");
    }
  });
}

async function init() {
  try {
    setMobileStatus("Starting camera...");
    const camTask = startMobileCamera();
    const modelTask = (async () => {
      await loadMediaPipe();
      handLandmarker = await createLandmarker();
      if (ctx) drawing = new DrawingUtils(ctx);
    })();
    await Promise.all([camTask, modelTask]);
    setMobileStatus("Connected", "ready");
    pushLandmarks([]);
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    setMobileStatus(err.message || "Camera error", "error");
    if (detectedPill) detectedPill.textContent = "Allow camera permission & reload.";
  }
}

init();
