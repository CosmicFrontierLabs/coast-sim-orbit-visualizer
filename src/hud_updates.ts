import type { PPSTEntry, TimelineSegment, VizData } from "./types";
import { ppstDisplayName, ppstTitle } from "./timeline_utils";
import { segmentDetail } from "./timeline_segments";

interface OrbitHudState {
  alt: number;
  lat: number;
  lon: number;
  beta: number;
  inEcl: number;
}

interface AttitudeHudState {
  ppt: PPSTEntry | null;
  panelSunAngleDeg: number;
  simTime: number;
  /** Actual spacecraft attitude from DITL telemetry (interpolated onto sim time). */
  ra: number;
  dec: number;
  roll: number;
}

interface HudController {
  setInitMode: (nSlews: number) => void;
  updateOrbitHud: (state: OrbitHudState) => void;
  updateAttitudeHud: (state: AttitudeHudState) => void;
  updateSelectionHud: (segment: TimelineSegment | null, data: VizData | null) => void;
}

function mustEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Missing required HUD element: #${id}`);
  }
  return el as T;
}
/**
 * Create helpers that write simulation state into HUD DOM elements.
 *
 * @returns {{
 *   setInitMode: (nSlews:number) => void,
 *   updateOrbitHud: (state: {alt:number,lat:number,lon:number,beta:number,inEcl:number}) => void,
 *   updateAttitudeHud: (state: {ppt:any,panelSunAngleDeg:number,simTime:number,ra:number,dec:number,roll:number}) => void,
 * }}
 */
export function createHudController(): HudController {
  const els = {
    alt: mustEl<HTMLElement>("h-alt"),
    lat: mustEl<HTMLElement>("h-lat"),
    lon: mustEl<HTMLElement>("h-lon"),
    beta: mustEl<HTMLElement>("h-beta"),
    eclipse: mustEl<HTMLElement>("h-eclipse"),
    mode: mustEl<HTMLElement>("h-mode"),
    ra: mustEl<HTMLElement>("h-ra"),
    dec: mustEl<HTMLElement>("h-dec"),
    roll: mustEl<HTMLElement>("h-roll"),
    panelSun: mustEl<HTMLElement>("h-panel-sun"),
    tgt: mustEl<HTMLElement>("h-tgt"),
    selKind: mustEl<HTMLElement>("h-sel-kind"),
    selName: mustEl<HTMLElement>("h-sel-name"),
    selDetail: mustEl<HTMLElement>("h-sel-detail"),
    scrubLabel: mustEl<HTMLElement>("scrub-label"),
  };

  function setInitMode(nSlews: number): void {
    els.mode.textContent = `INIT (${nSlews} slews)`;
  }

  function updateOrbitHud({ alt, lat, lon, beta, inEcl }: OrbitHudState): void {
    els.alt.textContent = alt.toFixed(1);
    els.lat.textContent = lat.toFixed(2);
    els.lon.textContent = lon.toFixed(2);
    els.beta.textContent = beta.toFixed(2);
    els.eclipse.textContent = inEcl ? "🌑 ECLIPSE" : "☀ SUNLIGHT";
  }

  function updateAttitudeHud({
    ppt,
    panelSunAngleDeg,
    simTime,
    ra,
    dec,
    roll,
  }: AttitudeHudState): void {
    // Always display the actual attitude from DITL telemetry.
    els.ra.textContent = ra.toFixed(4);
    els.dec.textContent = dec.toFixed(4);
    els.roll.textContent = roll.toFixed(2);
    els.panelSun.textContent = panelSunAngleDeg.toFixed(2);

    if (ppt) {
      const mode = ppt.obstype ?? "PPT";
      const targetLabel = ppstDisplayName(ppt);
      const title = ppstTitle(ppt);
      els.mode.textContent = mode;
      els.tgt.textContent = targetLabel;
      els.tgt.title = title;
      const prog = (((simTime - ppt.begin) / (ppt.end - ppt.begin)) * 100).toFixed(0);
      els.scrubLabel.textContent = `${targetLabel}  ${prog}%`;
      els.scrubLabel.title = title;
      return;
    }

    els.mode.textContent = "GAP";
    els.tgt.textContent = "—";
    els.tgt.title = "";
    els.scrubLabel.textContent = "(between observations)";
    els.scrubLabel.title = "";
  }

  function updateSelectionHud(segment: TimelineSegment | null, data: VizData | null): void {
    if (!segment) {
      els.selKind.textContent = "None";
      els.selName.textContent = "Click a timeline segment";
      els.selDetail.textContent = "";
      els.selName.title = "";
      els.selDetail.title = "";
      return;
    }

    els.selKind.textContent = segment.kind.toUpperCase();
    els.selName.textContent = segment.label;
    els.selName.title = segment.title;
    const detail = segmentDetail(segment, data ?? undefined);
    els.selDetail.textContent = detail;
    els.selDetail.title = detail;
  }

  return {
    setInitMode,
    updateOrbitHud,
    updateAttitudeHud,
    updateSelectionHud,
  };
}
