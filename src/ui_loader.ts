import { DateTime } from "luxon";
import type { VizData } from "./types";

/**
 * Create loader/upload UI controller for JSON and PPST ingestion flows.
 *
 * @param {{assetBase:string, onDataLoaded:(data:object)=>void}} deps
 * @returns {{
 *   clearLoading: () => void,
 *   fetchByDate: (year:number, day:number) => Promise<void>,
 *   loadJSON: (url:string) => Promise<void>,
 *   setLoading: (message:string) => void,
 *   setUploadUIInactive: () => void,
 *   showMessage: (message:string) => void,
 *   showUploadUI: () => void,
 *   uploadFile: (file:File) => Promise<void>,
 * }}
 */
export function createLoaderController({
  assetBase,
  onDataLoaded,
}: {
  assetBase: string;
  onDataLoaded: (data: VizData) => void;
}): {
  clearLoading: () => void;
  fetchByDate: (year: number, day: number) => Promise<void>;
  loadJSON: (url: string) => Promise<void>;
  setLoading: (message: string) => void;
  setUploadUIInactive: () => void;
  showMessage: (message: string) => void;
  showUploadUI: () => void;
  uploadFile: (file: File) => Promise<void>;
} {
  const mustEl = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Missing required element: #${id}`);
    }
    return el as T;
  };

  const loaderEl = mustEl<HTMLElement>("loader");
  const loaderMsg = mustEl<HTMLElement>("loader-msg");
  const loaderSpinner = document.querySelector("#loader .spinner") as HTMLElement | null;
  let uploadUIActive = false;

  const setLoading = (message: string): void => {
    if (uploadUIActive) return;
    if (loaderSpinner) {
      loaderSpinner.style.display = "";
    }
    loaderEl.style.display = "flex";
    loaderMsg.textContent = message;
  };

  const clearLoading = (): void => {
    if (uploadUIActive) return;
    loaderEl.style.display = "none";
  };

  const showMessage = (message: string): void => {
    loaderEl.style.display = "flex";
    loaderMsg.textContent = message;
  };

  const setUploadUIInactive = () => {
    uploadUIActive = false;
  };

  async function loadJSON(url: string): Promise<void> {
    setLoading(`Loading ${url}…`);
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      onDataLoaded((await r.json()) as VizData);
      clearLoading();
    } catch (_err) {
      showMessage("No orbit data available.\nCall launch(ditl) from Python to load a simulation.");
    }
  }

  function showUploadUI(): void {
    uploadUIActive = true;
    loaderEl.style.display = "flex";
    if (loaderSpinner) {
      loaderSpinner.style.display = "none";
    }

    const today = DateTime.utc().toISODate() ?? "";

    loaderMsg.innerHTML = `
      <div class="up-card">
        <div class="up-title">ORBIT VISUALIZER</div>
        <div class="up-tabs">
          <button class="up-tab active" id="tab-file">📂 Local file</button>
          <button class="up-tab" id="tab-date">📅 By date</button>
        </div>

        <div class="up-pane" id="pane-file">
          <label class="up-file-label">
            <span>Choose PPST .txt file…</span>
            <input type="file" id="ppst-file-input" accept=".txt" style="display:none">
          </label>
          <div class="up-hint">or drag-and-drop a PPST file onto this window</div>
        </div>

        <div class="up-pane hidden" id="pane-date">
          <input type="date" id="date-picker" class="up-date-input" value="${today}">
          <button id="btn-fetch-date" class="up-btn">Load PPST</button>
        </div>

        <div class="up-status" id="upload-status"></div>
      </div>
    `;

    const tabFile = mustEl<HTMLButtonElement>("tab-file");
    const tabDate = mustEl<HTMLButtonElement>("tab-date");
    const paneFile = mustEl<HTMLElement>("pane-file");
    const paneDate = mustEl<HTMLElement>("pane-date");

    function activateTab(which: "file" | "date"): void {
      const isFile = which === "file";
      tabFile.classList.toggle("active", isFile);
      tabDate.classList.toggle("active", !isFile);
      paneFile.classList.toggle("hidden", !isFile);
      paneDate.classList.toggle("hidden", isFile);
    }
    tabFile.addEventListener("click", () => activateTab("file"));
    tabDate.addEventListener("click", () => activateTab("date"));

    mustEl<HTMLInputElement>("ppst-file-input").addEventListener("change", (e: Event) => {
      const f = (e.target as HTMLInputElement).files?.[0];
      if (f) uploadFile(f);
    });

    mustEl<HTMLButtonElement>("btn-fetch-date").addEventListener("click", () => {
      const val = mustEl<HTMLInputElement>("date-picker").value;
      if (!val) return;
      const d = DateTime.fromISO(val, { zone: "utc" });
      if (!d.isValid) return;
      fetchByDate(d.year, d.ordinal);
    });
  }

  async function uploadFile(file: File): Promise<void> {
    const statusEl = document.getElementById("upload-status");
    if (statusEl) statusEl.textContent = `Processing ${file.name}…`;
    else setLoading(`Processing ${file.name}…`);

    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(assetBase + "api/upload", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail);
      }
      const { job_id } = await res.json();
      const url = new URL(location.href);
      url.searchParams.set("job", job_id);
      location.assign(url.toString());
    } catch (err: unknown) {
      const msg = `Upload failed: ${err instanceof Error ? err.message : String(err)}`;
      if (statusEl) statusEl.textContent = msg;
      else showMessage(msg);
    }
  }

  async function fetchByDate(year: number, day: number): Promise<void> {
    const statusEl = document.getElementById("upload-status");
    const label = `year=${year} day=${day}`;
    if (statusEl) statusEl.textContent = `Fetching PPST for ${label}…`;
    const btn = document.getElementById("btn-fetch-date") as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
      const res = await fetch(assetBase + "api/fetch-by-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, day }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(detail.detail ?? res.statusText);
      }
      const { job_id } = await res.json();
      const url = new URL(location.href);
      url.searchParams.set("job", job_id);
      location.assign(url.toString());
    } catch (err: unknown) {
      const msg = `Fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      if (statusEl) statusEl.textContent = msg;
      if (btn) btn.disabled = false;
    }
  }

  return {
    clearLoading,
    fetchByDate,
    loadJSON,
    setLoading,
    setUploadUIInactive,
    showMessage,
    showUploadUI,
    uploadFile,
  };
}
