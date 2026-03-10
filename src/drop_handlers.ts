import type { VizData } from "./types";

/**
 * Wire global drag-and-drop behavior for local JSON and PPST files.
 *
 * @param {Object} deps
 * @param {(data: object) => void} deps.onJsonLoaded Callback for parsed JSON payloads.
 * @param {(file: File) => void} deps.onPpstDropped Callback for dropped PPST `.txt` files.
 * @param {(msg: string) => void} deps.setLoading Loader message setter.
 * @param {() => void} deps.clearLoading Loader clear callback.
 * @param {(msg: string) => void} deps.showMessage Error/status display callback.
 * @returns {void}
 */
export function wireDropHandlers({
  onJsonLoaded,
  onPpstDropped,
  setLoading,
  clearLoading,
  showMessage,
}: {
  onJsonLoaded: (data: VizData) => void;
  onPpstDropped: (file: File) => void;
  setLoading: (msg: string) => void;
  clearLoading: () => void;
  showMessage: (msg: string) => void;
}): void {
  // Drag & drop: JSON loads directly; PPST .txt is sent through upload flow.
  document.body.addEventListener("dragover", (e) => {
    e.preventDefault();
    document.body.classList.add("dragging");
  });

  document.body.addEventListener("dragleave", () => {
    document.body.classList.remove("dragging");
  });

  document.body.addEventListener("drop", async (e: DragEvent) => {
    e.preventDefault();
    document.body.classList.remove("dragging");
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;

    if (file.name.endsWith(".json")) {
      setLoading(`Reading ${file.name}…`);
      try {
        onJsonLoaded(JSON.parse(await file.text()) as VizData);
        clearLoading();
      } catch (err: unknown) {
        showMessage("Invalid JSON: " + (err instanceof Error ? err.message : String(err)));
      }
      return;
    }

    if (file.name.endsWith(".txt")) {
      onPpstDropped(file);
      return;
    }

    showMessage(`Unsupported file: ${file.name}`);
  });
}
