import type { PPSTEntry, VizData } from "./types";

/**
 * Wire timeline scrubber interactions and expose render-loop update helpers.
 *
 * @param {Object} deps Dependency bundle from the main visualizer module.
 * @param {HTMLInputElement} deps.scrubSlider Range input used for timeline position.
 * @param {HTMLElement} deps.scrubMarks Container for clickable PPST segment markers.
 * @param {HTMLElement} deps.scrubTime Element showing the current simulation time label.
 * @param {() => any | null} deps.getData Returns loaded visualization data or null.
 * @param {() => number} deps.getSimTime Gets current simulation Unix timestamp.
 * @param {(t: number) => void} deps.setSimTime Sets current simulation Unix timestamp.
 * @param {() => void} deps.resetPrevTs Clears frame delta state after manual jumps.
 * @param {(t: number) => string} deps.fmtTime Formats a Unix timestamp for HUD display.
 * @returns {{buildScrubMarks: () => void, updateScrubber: () => void}}
 */
export function wireScrubber({
  scrubSlider,
  scrubMarks,
  scrubTime,
  getData,
  getSimTime,
  setSimTime,
  resetPrevTs,
  fmtTime,
}: {
  scrubSlider: HTMLInputElement;
  scrubMarks: HTMLElement;
  scrubTime: HTMLElement;
  getData: () => VizData | null;
  getSimTime: () => number;
  setSimTime: (t: number) => void;
  resetPrevTs: () => void;
  fmtTime: (t: number) => string;
}): { buildScrubMarks: () => void; updateScrubber: () => void } {
  let scrubbing = false;

  scrubSlider.addEventListener("mousedown", () => {
    scrubbing = true;
  });
  scrubSlider.addEventListener(
    "touchstart",
    () => {
      scrubbing = true;
    },
    { passive: true },
  );
  window.addEventListener("mouseup", () => {
    scrubbing = false;
  });
  window.addEventListener("touchend", () => {
    scrubbing = false;
  });
  scrubSlider.addEventListener("input", () => {
    const data = getData();
    if (!data) return;
    const t0 = data.ephem.utime[0];
    const t1 = data.ephem.utime[data.ephem.utime.length - 1];
    setSimTime(t0 + (parseInt(scrubSlider.value, 10) / 10000) * (t1 - t0));
    resetPrevTs();
  });

  function buildScrubMarks() {
    scrubMarks.innerHTML = "";
    const data = getData();
    if (!data) return;
    const t0 = data.ephem.utime[0];
    const span = data.ephem.utime[data.ephem.utime.length - 1] - t0;

    data.ppst.forEach((p: PPSTEntry) => {
      const left = (((p.begin - t0) / span) * 100).toFixed(4);
      const width = (((p.end - p.begin) / span) * 100).toFixed(4);
      const seg = document.createElement("div");
      seg.className = "ppst-seg";
      seg.style.left = `${left}%`;
      seg.style.width = `${Math.max(parseFloat(width), 0.15)}%`;
      seg.title = p.name;
      seg.addEventListener("click", () => {
        setSimTime(p.begin);
        resetPrevTs();
      });
      scrubMarks.appendChild(seg);
    });
  }

  function updateScrubber() {
    const data = getData();
    if (!data) return;
    const t0 = data.ephem.utime[0];
    const t1 = data.ephem.utime[data.ephem.utime.length - 1];
    if (!scrubbing) {
      scrubSlider.value = String(Math.round(((getSimTime() - t0) / (t1 - t0)) * 10000));
    }
    scrubTime.textContent = fmtTime(getSimTime());
  }

  return { buildScrubMarks, updateScrubber };
}

/**
 * Wire playback speed and play/pause controls.
 *
 * @param {Object} deps Dependency bundle from the main visualizer module.
 * @param {HTMLInputElement} deps.speedInput Range input selecting simulation speed index.
 * @param {HTMLElement} deps.speedDisplay Element showing the current speed multiplier.
 * @param {HTMLButtonElement} deps.playButton Play/pause toggle button.
 * @param {number[]} deps.SPEEDS Available speed multipliers indexed by slider value.
 * @param {() => number} deps.getSpeedIdx Gets current speed index.
 * @param {(idx: number) => void} deps.setSpeedIdx Sets current speed index.
 * @param {() => boolean} deps.getPlaying Gets current play/pause state.
 * @param {(playing: boolean) => void} deps.setPlaying Sets current play/pause state.
 * @returns {void}
 */
export function wirePlaybackControls({
  speedInput,
  speedDisplay,
  playButton,
  SPEEDS,
  getSpeedIdx,
  setSpeedIdx,
  getPlaying,
  setPlaying,
}: {
  speedInput: HTMLInputElement;
  speedDisplay: HTMLElement;
  playButton: HTMLButtonElement;
  SPEEDS: number[];
  getSpeedIdx: () => number;
  setSpeedIdx: (idx: number) => void;
  getPlaying: () => boolean;
  setPlaying: (playing: boolean) => void;
}): void {
  speedInput.addEventListener("input", (e: Event) => {
    const idx = parseInt((e.target as HTMLInputElement).value, 10);
    setSpeedIdx(idx);
    speedDisplay.textContent = `×${SPEEDS[getSpeedIdx()]}`;
  });

  playButton.addEventListener("click", () => {
    const next = !getPlaying();
    setPlaying(next);
    playButton.textContent = next ? "⏸ Pause" : "▶ Play";
  });
}
