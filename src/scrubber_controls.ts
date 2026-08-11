import type { TimelineSegment, TimelineSegmentLane, TimelineSelection, VizData } from "./types";
import { findTimelineSegmentAtTime } from "./timeline_segments";

const DRAG_CLICK_THRESHOLD_PX = 4;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function laneForTrackY(clientY: number, rect: DOMRect): TimelineSegmentLane {
  const y = rect.height > 0 ? clamp01((clientY - rect.top) / rect.height) : 0.5;
  if (y < 0.32) return "slew";
  if (y > 0.72) return "gap";
  return "activity";
}

/**
 * Wire timeline scrubber interactions and expose render-loop update helpers.
 *
 * @param {Object} deps Dependency bundle from the main visualizer module.
 * @param {HTMLInputElement} deps.scrubSlider Range input used for timeline position.
 * @param {HTMLElement} deps.scrubTrack Container for timeline click selection.
 * @param {HTMLElement} deps.scrubMarks Container for clickable PPST segment markers.
 * @param {HTMLElement} deps.scrubTime Element showing the current simulation time label.
 * @param {() => any | null} deps.getData Returns loaded visualization data or null.
 * @param {() => TimelineSegment[]} deps.getSegments Returns derived timeline segments.
 * @param {() => TimelineSelection | null} deps.getSelection Gets the current timeline selection.
 * @param {() => number} deps.getSimTime Gets current simulation Unix timestamp.
 * @param {(t: number) => void} deps.setSimTime Sets current simulation Unix timestamp.
 * @param {(segment: TimelineSegment) => void} deps.selectSegment Selects a timeline segment.
 * @param {(t: number) => void} deps.onTimeInput Called when the user manually changes time.
 * @param {() => void} deps.resetPrevTs Clears frame delta state after manual jumps.
 * @param {(t: number) => string} deps.fmtTime Formats a Unix timestamp for HUD display.
 * @returns {{buildScrubMarks: () => void, updateScrubber: () => void}}
 */
export function wireScrubber({
  scrubSlider,
  scrubTrack,
  scrubMarks,
  scrubTime,
  getData,
  getSegments,
  getSelection,
  getSimTime,
  setSimTime,
  selectSegment,
  onTimeInput,
  resetPrevTs,
  fmtTime,
}: {
  scrubSlider: HTMLInputElement;
  scrubTrack: HTMLElement;
  scrubMarks: HTMLElement;
  scrubTime: HTMLElement;
  getData: () => VizData | null;
  getSegments: () => TimelineSegment[];
  getSelection: () => TimelineSelection | null;
  getSimTime: () => number;
  setSimTime: (t: number) => void;
  selectSegment: (segment: TimelineSegment) => void;
  onTimeInput: (t: number) => void;
  resetPrevTs: () => void;
  fmtTime: (t: number) => string;
}): { buildScrubMarks: () => void; updateScrubber: () => void } {
  let scrubbing = false;
  let pointerStart: { x: number; y: number } | null = null;
  let suppressNextTrackClick = false;

  scrubSlider.addEventListener("pointerdown", () => {
    scrubbing = true;
  });
  function endPointerInteraction(): void {
    scrubbing = false;
    pointerStart = null;
  }
  window.addEventListener("pointerup", endPointerInteraction);
  window.addEventListener("pointercancel", endPointerInteraction);
  scrubTrack.addEventListener("pointerdown", (event: PointerEvent) => {
    pointerStart = { x: event.clientX, y: event.clientY };
    suppressNextTrackClick = false;
  });
  window.addEventListener("pointermove", (event: PointerEvent) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    if (Math.hypot(dx, dy) > DRAG_CLICK_THRESHOLD_PX) {
      suppressNextTrackClick = true;
    }
  });
  scrubSlider.addEventListener("input", () => {
    const data = getData();
    if (!data) return;
    const t0 = data.ephem.utime[0];
    const t1 = data.ephem.utime[data.ephem.utime.length - 1];
    const t = t0 + (parseInt(scrubSlider.value, 10) / 10000) * (t1 - t0);
    setSimTime(t);
    onTimeInput(t);
    resetPrevTs();
  });

  scrubTrack.addEventListener("click", (event: MouseEvent) => {
    if (suppressNextTrackClick) {
      suppressNextTrackClick = false;
      return;
    }
    const data = getData();
    if (!data) return;
    const rect = scrubTrack.getBoundingClientRect();
    const frac = rect.width > 0 ? clamp01((event.clientX - rect.left) / rect.width) : 0;
    const lane = laneForTrackY(event.clientY, rect);
    const t0 = data.ephem.utime[0];
    const t1 = data.ephem.utime[data.ephem.utime.length - 1];
    const t = t0 + frac * (t1 - t0);
    const segment = findTimelineSegmentAtTime(getSegments(), t, lane);
    if (segment) {
      selectSegment(segment);
    } else {
      setSimTime(t);
      onTimeInput(t);
    }
    resetPrevTs();
  });

  function buildScrubMarks() {
    scrubMarks.innerHTML = "";
    const data = getData();
    if (!data) return;
    const t0 = data.ephem.utime[0];
    const span = data.ephem.utime[data.ephem.utime.length - 1] - t0;

    getSegments().forEach((segment: TimelineSegment) => {
      const left = (((segment.start - t0) / span) * 100).toFixed(4);
      const width = (((segment.end - segment.start) / span) * 100).toFixed(4);
      const seg = document.createElement("div");
      const typeClass = segment.entry?.obstype
        ? `timeline-seg-type-${segment.entry.obstype.toLowerCase()}`
        : "";
      seg.className = [
        "timeline-seg",
        `timeline-seg-${segment.kind}`,
        `timeline-seg-lane-${segment.lane}`,
        typeClass,
      ]
        .filter(Boolean)
        .join(" ");
      seg.style.left = `${left}%`;
      seg.style.width = `${Math.max(parseFloat(width), 0.12)}%`;
      seg.title = segment.title;
      seg.dataset.segmentId = segment.id;
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
    const activeSegment = findTimelineSegmentAtTime(getSegments(), getSimTime());
    const selection = getSelection();
    scrubTrack.title = selection?.id
      ? getSegments().find((segment) => segment.id === selection.id)?.title ?? ""
      : activeSegment?.title ?? "";
    scrubMarks.querySelectorAll<HTMLElement>(".timeline-seg").forEach((seg) => {
      const id = seg.dataset.segmentId ?? "";
      seg.classList.toggle("timeline-seg-selected", selection?.id === id);
      seg.classList.toggle("timeline-seg-active", activeSegment?.id === id);
    });
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
