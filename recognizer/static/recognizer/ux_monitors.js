// ==========================================================================
// SignTalk AI - Shared Camera UX Monitors
// (Offscreen Low-Light Luminance Detector + Hand Guide Frame Evaluator)
// ==========================================================================
(function (global) {
  function createLightingMonitor(options) {
    const videoEl = options && options.videoEl;
    const warningEl = options && options.warningEl;
    const intervalMs = (options && options.intervalMs) || 800;
    const lowThreshold = (options && options.lowThreshold) || 58;
    const recoverThreshold = (options && options.recoverThreshold) || 66;

    const sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = 64;
    sampleCanvas.height = 48;
    const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });

    let lastCheckAt = 0;
    let isLowLight = false;

    function setLowLight(flag) {
      if (isLowLight === flag) return;
      isLowLight = flag;
      if (warningEl) {
        warningEl.classList.toggle("hidden", !isLowLight);
      }
    }

    function check(now) {
      if (!videoEl || !warningEl || !sampleCtx) return false;
      if (videoEl.readyState < 2 || !videoEl.videoWidth) return isLowLight;
      const ts = typeof now === "number" ? now : performance.now();
      if (ts - lastCheckAt < intervalMs) return isLowLight;
      lastCheckAt = ts;

      try {
        sampleCtx.drawImage(videoEl, 0, 0, sampleCanvas.width, sampleCanvas.height);
        const data = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
        let lumaSum = 0;
        let samples = 0;
        for (let i = 0; i < data.length; i += 16) {
          lumaSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          samples++;
        }
        if (samples > 0) {
          const avgLuma = lumaSum / samples;
          if (!isLowLight && avgLuma < lowThreshold) {
            setLowLight(true);
          } else if (isLowLight && avgLuma >= recoverThreshold) {
            setLowLight(false);
          }
        }
      } catch (err) {
        // Ignore transient frame read failures while video metadata settles
      }
      return isLowLight;
    }

    function reset() {
      lastCheckAt = 0;
      setLowLight(false);
    }

    return { check, reset };
  }

  function createHandGuideController(options) {
    const overlayEl = options && options.overlayEl;
    const textEl = options && options.textEl;
    let lastState = null;
    let lastLabel = null;
    let isVisible = false;

    function hide() {
      if (!overlayEl || !isVisible) {
        if (overlayEl) overlayEl.classList.add("hidden");
        isVisible = false;
        return;
      }
      overlayEl.classList.add("hidden");
      isVisible = false;
    }

    function applyState(stateClass, message) {
      if (!overlayEl) return;
      if (!isVisible) {
        overlayEl.classList.remove("hidden");
        isVisible = true;
      }
      if (lastState !== stateClass) {
        overlayEl.classList.remove("state-idle", "state-good", "state-warn");
        overlayEl.classList.add(stateClass);
        lastState = stateClass;
      }
      if (textEl && lastLabel !== message) {
        textEl.textContent = message;
        lastLabel = message;
      }
    }

    function update(landmarks, opts) {
      if (!overlayEl) return;
      const cfg = opts || {};
      if (cfg.hidden || cfg.stopped || cfg.paused) {
        hide();
        return;
      }

      const requiredHands = cfg.requiredHands || 1;
      const allowMultiple = Boolean(cfg.allowMultiple);

      if (!landmarks || landmarks.length === 0) {
        const prompt = requiredHands >= 2
          ? "Show both hands inside guide frame"
          : allowMultiple
            ? "Place 1 or 2 hands inside guide frame"
            : "Place hand inside guide frame";
        applyState("state-idle", prompt);
        return;
      }

      let minX = 1, minY = 1, maxX = 0, maxY = 0;
      for (let h = 0; h < landmarks.length; h++) {
        const pts = landmarks[h];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
      }

      const span = Math.max(maxX - minX, maxY - minY);
      if (minX < 0.04 || maxX > 0.96 || minY < 0.04 || maxY > 0.96) {
        applyState("state-warn", "⚠️ Near frame edge — center hand in guide");
      } else if (minX < 0.08 || maxX > 0.92 || minY < 0.07 || maxY > 0.93) {
        applyState("state-warn", "⚠️ Keep full hand inside guide box");
      } else if (span < 0.11) {
        applyState("state-warn", "⚠️ Move hand slightly closer to camera");
      } else if (requiredHands >= 2 && landmarks.length < 2) {
        applyState("state-warn", "⚠️ Show 2nd hand inside guide (ISL)");
      } else {
        applyState(
          "state-good",
          landmarks.length >= 2 ? "✓ Hands inside frame" : "✓ Hand inside frame"
        );
      }
    }

    return { update, hide };
  }

  global.SignTalkUX = {
    createLightingMonitor,
    createHandGuideController,
  };
})(window);
