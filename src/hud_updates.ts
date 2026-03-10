import type { Attitude, PPSTEntry, SlewWindow } from "./types";

interface OrbitHudState {
  alt: number;
  lat: number;
  lon: number;
  beta: number;
  inEcl: number;
}

interface AttitudeHudState {
  slew: SlewWindow | null;
  slewAtt: Attitude | null;
  ppt: PPSTEntry | null;
  panelSunAngleDeg: number;
  simTime: number;
}

interface HudController {
  setInitMode: (nSlews: number) => void;
  updateOrbitHud: (state: OrbitHudState) => void;
  updateAttitudeHud: (state: AttitudeHudState) => void;
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
 *   updateAttitudeHud: (state: {slew:any,slewAtt:any,ppt:any,panelSunAngleDeg:number,simTime:number}) => void,
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
    slew,
    slewAtt,
    ppt,
    panelSunAngleDeg,
    simTime,
  }: AttitudeHudState): void {
    if (slew && slewAtt) {
      els.mode.textContent = "SLEW";
      els.ra.textContent = slewAtt.ra.toFixed(4);
      els.dec.textContent = slewAtt.dec.toFixed(4);
      els.roll.textContent = slewAtt.roll.toFixed(2);
      els.panelSun.textContent = panelSunAngleDeg.toFixed(2);
      els.tgt.textContent = slew.to ?? "(slew)";
      const prog = (((simTime - slew.begin) / (slew.end - slew.begin)) * 100).toFixed(0);
      els.scrubLabel.textContent = `${slew.to}  ${prog}%`;
      return;
    }

    if (ppt) {
      els.mode.textContent = "PPT";
      els.ra.textContent = ppt.ra.toFixed(4);
      els.dec.textContent = ppt.dec.toFixed(4);
      els.roll.textContent = ppt.roll.toFixed(2);
      els.panelSun.textContent = panelSunAngleDeg.toFixed(2);
      els.tgt.textContent = ppt.name;
      const prog = (((simTime - ppt.begin) / (ppt.end - ppt.begin)) * 100).toFixed(0);
      els.scrubLabel.textContent = `${ppt.name}  ${prog}%`;
      return;
    }

    els.mode.textContent = "GAP";
    [els.ra, els.dec, els.roll, els.panelSun].forEach((el) => {
      el.textContent = "—";
    });
    els.tgt.textContent = "(slew / gap)";
    els.scrubLabel.textContent = "(between observations)";
  }

  return {
    setInitMode,
    updateOrbitHud,
    updateAttitudeHud,
  };
}
