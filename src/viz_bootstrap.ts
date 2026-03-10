import type { VizData } from "./types";

/**
 * Apply startup side effects after a visualization dataset is loaded.
 *
 * @param {Object} deps
 * @param {Object} deps.json
 * @param {number} deps.cleanSlewsCount
 * @param {{ setUploadUIInactive: () => void }} deps.loader
 * @param {HTMLElement} deps.canvasElement
 * @param {() => void} deps.startAnimate
 * @param {() => boolean} deps.isAnimating
 * @param {() => void} deps.buildScrubMarks
 * @param {{ setInitMode: (n:number) => void }} deps.hud
 * @returns {void}
 */
export function applyInitDataSideEffects({
  json,
  cleanSlewsCount,
  loader,
  canvasElement,
  startAnimate,
  isAnimating,
  buildScrubMarks,
  hud,
}: {
  json: VizData;
  cleanSlewsCount: number;
  loader: { setUploadUIInactive: () => void };
  canvasElement: HTMLElement;
  startAnimate: () => void;
  isAnimating: () => boolean;
  buildScrubMarks: () => void;
  hud: { setInitMode: (n: number) => void };
}): void {
  loader.setUploadUIInactive();
  canvasElement.style.display = "";

  if (!isAnimating()) {
    startAnimate();
  }

  buildScrubMarks();
  console.log(
    `Loaded: ${json.meta.n_ephem} ephem pts, ${json.meta.n_ppst} PPST entries, ` +
      `${cleanSlewsCount} slew tracks`,
  );

  hud.setInitMode(cleanSlewsCount);
  if (cleanSlewsCount === 0) {
    console.warn(
      "No valid slew tracks in viz_data.json; regenerate with: uv run visualize_slews PPST_*.txt",
    );
  }
}
