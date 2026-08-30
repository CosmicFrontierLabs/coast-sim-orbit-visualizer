import {
  buildPlanStats,
  type BodyFaceDwellBin,
  type BodyDirectionSample,
  type ConsistencyWorst,
  type IntegrityFinding,
  type PanelSunAngleSummary,
  type PlanStats,
} from "../src/plan_stats";
import type { VizData } from "../src/types";
import { fmtTime } from "../src/timeline_utils";

declare global {
  interface Window {
    VIZ_ASSET_BASE?: string;
  }
}

const ASSET_BASE = window.VIZ_ASSET_BASE ?? "./";
const DEFAULT_DOWNLINK_RATE_MBPS = 7.33;
const SVG_NS = "http://www.w3.org/2000/svg";
const PANEL_SUN_MODE_COLORS: Record<string, string> = {
  SCIENCE: "#4aa3ff",
  SLEWING: "#d66bff",
  CHARGING: "#f1ba4a",
  PASS: "#55d69c",
  IDLE: "#667085",
  OTHER: "#b6c2d8",
};

let currentStats: PlanStats | null = null;

function mustEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing required element: #${id}`);
  return el as T;
}

function text(value: string): Text {
  return document.createTextNode(value);
}

function clear(el: HTMLElement): void {
  el.replaceChildren();
}

function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function percent(part: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((100 * part) / total).toFixed(1)}%`;
}

function percentValue(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (100 * part) / total));
}

function numberCell(value: string): HTMLTableCellElement {
  const td = document.createElement("td");
  td.className = "num";
  td.textContent = value;
  return td;
}

function pathLeaf(path: string | undefined): string {
  if (!path) return "—";
  return path.split("/").filter(Boolean).at(-1) ?? path;
}

function formatDegrees(value: number | null, digits = 2): string {
  return value === null ? "—" : `${value.toFixed(digits)}°`;
}

function formatMB(value: number | null): string {
  if (value === null) return "—";
  if (value >= 1024) return `${(value / 1024).toFixed(2)} GB`;
  return `${value.toFixed(0)} MB`;
}

function formatWorst(worst: ConsistencyWorst | null): string {
  if (!worst) return "no sampled science interval";
  return `${worst.type} ${worst.target} at ${fmtTime(worst.time)}`;
}

function formatGspSweep(stats: PlanStats): string {
  const worst = stats.gspExecution.worstSweep;
  if (!worst) return "no sampled contact interval";
  const station = worst.station ? `${worst.station} ` : "";
  return `${station}${fmtTime(worst.start)} to ${fmtTime(worst.end)}; executed boresight motion`;
}

function numericQueryParam(params: URLSearchParams, names: string[]): number | undefined {
  for (const name of names) {
    const raw = params.get(name);
    if (raw === null || raw.trim() === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function statsOptions(): { downlinkRateMBps: number; earthLimbMinAngleDeg?: number } {
  const params = new URLSearchParams(window.location.search);
  const rate = numericQueryParam(params, ["downlink_mbps"]);
  const earthLimbMinAngle = numericQueryParam(params, ["earth_limb_min_deg", "earth_limb_min_angle_deg"]);
  return {
    downlinkRateMBps: rate !== undefined && rate > 0 ? rate : DEFAULT_DOWNLINK_RATE_MBPS,
    earthLimbMinAngleDeg:
      earthLimbMinAngle !== undefined && earthLimbMinAngle >= 0 ? earthLimbMinAngle : undefined,
  };
}

function kindClass(kind: string): string {
  const upper = kind.toUpperCase();
  if (upper.includes("CHARGE")) return "charge";
  if (upper === "GSP") return "gsp";
  if (upper === "AT") return "at";
  const normalized = kind.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized || "unknown";
}

function renderSummary(stats: PlanStats): void {
  const summary = mustEl<HTMLElement>("stats-summary");
  clear(summary);

  const items = [
    {
      label: "Plan Window",
      value: formatSeconds(stats.window.durationSec),
      detail: `${fmtTime(stats.window.start)} to ${fmtTime(stats.window.end)}`,
    },
    {
      label: "Scheduled Coverage",
      value: percent(stats.totals.scheduledUnionSec, stats.window.durationSec),
      detail: `${formatSeconds(stats.totals.scheduledUnionSec)} active, ${formatSeconds(stats.totals.idleSec)} idle`,
    },
    {
      label: "Plan Entries",
      value: String(stats.totals.entries),
      detail: `${stats.totals.ephemSamples} ephemeris samples`,
    },
    {
      label: "Slew Budget",
      value: formatSeconds(stats.totals.entrySlewSec),
      detail:
        stats.totals.explicitSlewSec > 0
          ? `${formatSeconds(stats.totals.explicitSlewSec)} explicit slew tracks`
          : "from entry slewtime metadata",
    },
    {
      label: "Ground Contact",
      value: formatSeconds(stats.totals.gspSec),
      detail: `${stats.stations.length} station${stats.stations.length === 1 ? "" : "s"}`,
    },
    {
      label: "Source",
      value: stats.metadata.mission ?? "Plan",
      detail: pathLeaf(stats.metadata.sourcePlan),
    },
  ];

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "stat-tile";
    const label = document.createElement("div");
    label.className = "stat-label";
    label.textContent = item.label;
    const value = document.createElement("div");
    value.className = "stat-value";
    value.textContent = item.value;
    const detail = document.createElement("div");
    detail.className = "stat-detail";
    detail.textContent = item.detail;
    card.append(label, value, detail);
    summary.append(card);
  });

  mustEl<HTMLElement>("stats-window").textContent = stats.metadata.coastSim
    ? `COASTSim ${stats.metadata.coastSim}`
    : "";
}

function renderTimeBars(stats: PlanStats): void {
  const bars = mustEl<HTMLElement>("time-bars");
  clear(bars);

  const rows = [
    { label: "Scheduled", value: stats.totals.scheduledUnionSec, className: "bar-scheduled" },
    { label: "Idle", value: stats.totals.idleSec, className: "bar-idle" },
    { label: "Slewing", value: stats.totals.entrySlewSec, className: "bar-slew" },
    { label: "Exposing", value: stats.totals.exposureSec, className: "bar-exposure" },
    { label: "Ground Contact", value: stats.totals.gspSec, className: "bar-gsp" },
    { label: "Charging", value: stats.totals.chargeSec, className: "bar-charge" },
  ];

  rows.forEach((row) => {
    const line = document.createElement("div");
    line.className = "time-bar-row";
    const label = document.createElement("div");
    label.className = "time-bar-label";
    label.textContent = row.label;
    const track = document.createElement("div");
    track.className = "time-bar-track";
    const fill = document.createElement("div");
    fill.className = `time-bar-fill ${row.className}`;
    fill.style.width = percent(row.value, stats.window.durationSec);
    track.append(fill);
    const value = document.createElement("div");
    value.className = "time-bar-value";
    value.textContent = `${formatSeconds(row.value)} ${percent(row.value, stats.window.durationSec)}`;
    line.append(label, track, value);
    bars.append(line);
  });
}

function renderConstraints(stats: PlanStats): void {
  const c = stats.constraints;
  const telemetry = stats.constraintTelemetry;
  const keepoutSource = c.earthKeepoutConfigured ? "schedule constraint" : "physical limb only; schedule limit unavailable";
  const sunKeepoutSource = c.sunKeepoutConfigured
    ? `${c.sunKeepoutDeg.toFixed(2)}° schedule constraint`
    : "schedule Sun keepout unavailable";
  const eclipseGate = c.sunKeepoutDisabledInEclipse
    ? `; ${c.sunKeepoutUmbraOnly === true ? "umbra" : "eclipse"} samples excluded`
    : "";
  const sunWorstDetail =
    c.sunApplicableWorstTime === null
      ? "no applicable sun vector samples"
      : `${formatDegrees(c.sunApplicableMinAngleDeg)} minimum applicable Sun angle at ` +
        `${fmtTime(c.sunApplicableWorstTime)}${c.sunApplicableWorstEntry ? `, ${c.sunApplicableWorstEntry}` : ""}`;
  mustEl<HTMLElement>("constraint-summary").replaceChildren(
    metric(
      c.earthKeepoutConfigured ? "Earth Keepout Margin" : "Earth Limb Clearance",
      formatDegrees(c.earthKeepoutMinMarginDeg),
      c.earthWorstTime === null
        ? "no attitude samples"
        : `${c.earthKeepoutDeg.toFixed(2)}° ${keepoutSource}; limb clearance ${formatDegrees(c.earthMinMarginDeg)} at ${fmtTime(c.earthWorstTime)}${c.earthWorstEntry ? `, ${c.earthWorstEntry}` : ""}`,
    ),
    metric(
      c.earthKeepoutConfigured ? "Earth Keepout Violations" : "Earth Intersections",
      String(c.earthViolationSamples),
      `${c.samples} science collection samples checked against ${c.earthKeepoutDeg.toFixed(2)}° ${keepoutSource}`,
    ),
    metric(
      c.sunKeepoutConfigured ? "Sun Keepout Margin" : "Sun Keepout",
      c.sunKeepoutConfigured ? formatDegrees(c.sunKeepoutMinMarginDeg) : "—",
      c.sunKeepoutConfigured
        ? `${sunKeepoutSource}${eclipseGate}; ${sunWorstDetail}`
        : sunKeepoutSource,
    ),
    metric(
      c.sunKeepoutConfigured ? "Sun Keepout Violations" : "Sun Keepout Samples",
      c.sunKeepoutConfigured ? String(c.sunViolationSamples) : "—",
      `${c.sunKeepoutSamples} applicable science samples checked`,
    ),
    metric(
      "Executed Hard Violations",
      telemetry.available ? String(telemetry.hardViolationSamples) : "—",
      telemetry.available
        ? `${telemetry.samples} ephemeris samples checked from COAST housekeeping`
        : "constraint telemetry unavailable in viz-data",
    ),
    metric(
      "Executed Soft Violations",
      telemetry.available ? String(telemetry.softViolationSamples) : "—",
      telemetry.available
        ? `${telemetry.violations.length} violation type${telemetry.violations.length === 1 ? "" : "s"} reported`
        : "constraint telemetry unavailable in viz-data",
    ),
  );
}

function renderAttitudeConsistency(stats: PlanStats): void {
  const a = stats.attitudeConsistency;
  const gsp = stats.gspExecution;
  mustEl<HTMLElement>("attitude-consistency").replaceChildren(
    metric(
      "Science Boresight Error",
      formatDegrees(a.maxBoresightErrorDeg, 3),
      formatWorst(a.worstBoresight),
    ),
    metric(
      "Science Roll Error",
      formatDegrees(a.maxRollErrorDeg, 3),
      formatWorst(a.worstRoll),
    ),
    metric(
      "Science Intervals Over Limit",
      String(a.intervalsOverThreshold),
      `${a.checkedIntervals} science intervals checked; limits ${a.thresholdDeg}° boresight, ${a.rollThresholdDeg}° roll`,
    ),
  );
  mustEl<HTMLElement>("gsp-tracking-motion").replaceChildren(
    metric(
      "Max GSP Tracking Motion",
      formatDegrees(gsp.maxSweepDeg, 3),
      formatGspSweep(stats),
    ),
    metric(
      "GSP Attitude Samples",
      String(gsp.samplesChecked),
      `${gsp.contactsChecked} contact interval${gsp.contactsChecked === 1 ? "" : "s"} checked from executed telemetry`,
    ),
  );
}

function renderOrbitContext(stats: PlanStats): void {
  const o = stats.orbitContext;
  mustEl<HTMLElement>("orbit-summary").replaceChildren(
    metric("Eclipse Time", formatSeconds(o.eclipseSec), `${o.eclipseCount} eclipse intervals`),
    metric(
      "Beta Angle",
      `${formatDegrees(o.betaMinDeg, 1)} / ${formatDegrees(o.betaMeanDeg, 1)} / ${formatDegrees(o.betaMaxDeg, 1)}`,
      "min / mean / max",
    ),
    metric(
      "Latitude Range",
      `${formatDegrees(o.latMinDeg, 1)} to ${formatDegrees(o.latMaxDeg, 1)}`,
      "sub-satellite latitude",
    ),
  );
}

function renderDownlink(stats: PlanStats): void {
  mustEl<HTMLElement>("downlink-rate").textContent =
    stats.downlinkRateMBps === null ? "" : `${stats.downlinkRateMBps.toFixed(2)} MB/s`;
  const rows = stats.stations.map((station) => {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = station.station;
    tr.append(
      name,
      numberCell(String(station.count)),
      numberCell(formatSeconds(station.contactSec)),
      numberCell(formatMB(station.downlinkMB)),
    );
    return tr;
  });
  mustEl<HTMLElement>("downlink-table").replaceChildren(
    table(["Station", "Passes", "Contact", "Volume"], rows, "No GSP entries available for downlink estimates."),
  );
}

function renderTimelineChart(stats: PlanStats): void {
  const chart = mustEl<HTMLElement>("timeline-chart");
  clear(chart);

  const axis = document.createElement("div");
  axis.className = "plan-timeline-axis";
  [0, 0.25, 0.5, 0.75, 1].forEach((fraction) => {
    const tick = document.createElement("div");
    tick.className = "plan-timeline-tick";
    tick.style.left = `${fraction * 100}%`;
    tick.textContent = fraction === 0 ? "Start" : fraction === 1 ? "End" : `+${formatSeconds(stats.window.durationSec * fraction)}`;
    axis.append(tick);
  });
  chart.append(axis);

  stats.timeline.forEach((lane) => {
    const row = document.createElement("div");
    row.className = "plan-timeline-row";
    const label = document.createElement("div");
    label.className = "plan-timeline-label";
    label.textContent = lane.label;
    const track = document.createElement("div");
    track.className = "plan-timeline-track";

    lane.segments.forEach((segment) => {
      const seg = document.createElement("div");
      seg.className = `plan-timeline-segment plan-kind-${kindClass(segment.kind)}`;
      const left = percentValue(segment.start - stats.window.start, stats.window.durationSec);
      const width = percentValue(segment.end - segment.start, stats.window.durationSec);
      seg.style.left = `${left}%`;
      seg.style.width = `${width}%`;
      seg.title = `${segment.label}\n${fmtTime(segment.start)} to ${fmtTime(segment.end)}\n${formatSeconds(segment.end - segment.start)}`;
      seg.setAttribute("aria-label", seg.title);
      track.append(seg);
    });

    row.append(label, track);
    chart.append(row);
  });

  const legend = document.createElement("div");
  legend.className = "plan-timeline-legend";
  [
    ["AT", "at"],
    ["GSP", "gsp"],
    ["Charge", "charge"],
    ["Idle", "idle"],
    ["Slew", "slew"],
    ["Eclipse", "eclipse"],
  ].forEach(([label, kind]) => {
    const item = document.createElement("span");
    item.className = "plan-timeline-legend-item";
    const swatch = document.createElement("span");
    swatch.className = `plan-timeline-swatch plan-kind-${kind}`;
    item.append(swatch, text(label));
    legend.append(item);
  });
  chart.append(legend);
}

function panelDirectionLabel(direction: [number, number, number] | null): string {
  if (!direction) return "Panel direction unavailable";
  const axisNames = ["X", "Y", "Z"];
  for (let i = 0; i < direction.length; i++) {
    const aligned = direction.every((value, j) => j === i || Math.abs(value) < 1e-9);
    if (Math.abs(Math.abs(direction[i]) - 1) < 1e-9 && aligned) {
      return `Configured body ${direction[i] < 0 ? "-" : "+"}${axisNames[i]} panel normal`;
    }
  }
  return `Configured body panel normal [${direction.map((value) => value.toFixed(3)).join(", ")}]`;
}

function niceAxisMaximum(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10;
  return niceFraction * exponent;
}

function vectorLabel(vector: [number, number, number] | null, digits = 2): string {
  return vector ? `[${vector.map((value) => value.toFixed(digits)).join(", ")}]` : "unavailable";
}

function heatColor(source: "sun" | "earth", fraction: number): string {
  const intensity = Math.max(0, Math.min(1, Math.sqrt(fraction)));
  const [r, g, b] = source === "sun" ? [241, 186, 74] : [73, 190, 210];
  return `rgba(${r}, ${g}, ${b}, ${0.1 + 0.9 * intensity})`;
}

function bodyAxisLabel(vector: [number, number, number] | null): string | null {
  if (!vector) return null;
  const axes = ["X", "Y", "Z"];
  const index = vector.findIndex((value) => Math.abs(Math.abs(value) - 1) < 1e-9);
  if (index < 0 || vector.some((value, candidate) => candidate !== index && Math.abs(value) > 1e-9)) {
    return null;
  }
  return `${vector[index] < 0 ? "-" : "+"}${axes[index]}`;
}

function oppositeAxisLabel(label: string): string {
  return `${label.startsWith("-") ? "+" : "-"}${label.slice(1)}`;
}

function renderPanelSunFaceMap(summary: PanelSunAngleSummary): void {
  const root = mustEl<HTMLElement>("panel-sun-direction-heatmap");
  clear(root);
  const occupiedBins = summary.frontFaceBins.filter((bin) => bin.sunlitDurationSec > 0);
  if (occupiedBins.length === 0 && summary.backsideSunlitSec <= 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No front-side sunlight intervals are available.";
    root.append(empty);
    return;
  }

  const width = 560;
  const height = 440;
  const centerX = 280;
  const centerY = 172;
  const radius = 140;
  const maxEquivalent = occupiedBins.length > 0 ? Math.max(...occupiedBins.map((bin) => bin.equivalentSunSec)) : 0;
  const maxDuration = occupiedBins.length > 0 ? Math.max(...occupiedBins.map((bin) => bin.sunlitDurationSec)) : 0;
  const colorMaximum = Math.max(1, maxEquivalent > 0 ? maxEquivalent : maxDuration);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("thermal-chart-svg", "panel-face-map");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "Sun direction projected onto the front of the solar panel; center is face-on and the rim is grazing incidence",
  );

  const definitions = document.createElementNS(SVG_NS, "defs");
  const clipPath = document.createElementNS(SVG_NS, "clipPath");
  clipPath.setAttribute("id", "panel-face-map-clip");
  const clipCircle = document.createElementNS(SVG_NS, "circle");
  clipCircle.setAttribute("cx", String(centerX));
  clipCircle.setAttribute("cy", String(centerY));
  clipCircle.setAttribute("r", String(radius));
  clipPath.append(clipCircle);
  definitions.append(clipPath);
  svg.append(definitions);

  const background = document.createElementNS(SVG_NS, "circle");
  background.setAttribute("cx", String(centerX));
  background.setAttribute("cy", String(centerY));
  background.setAttribute("r", String(radius));
  background.setAttribute("class", "panel-face-background");
  svg.append(background);

  occupiedBins.forEach((bin) => {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(centerX + bin.uMin * radius));
    rect.setAttribute("y", String(centerY - bin.vMax * radius));
    rect.setAttribute("width", String((bin.uMax - bin.uMin) * radius));
    rect.setAttribute("height", String((bin.vMax - bin.vMin) * radius));
    const colorValue = maxEquivalent > 0 ? bin.equivalentSunSec : bin.sunlitDurationSec;
    rect.setAttribute("fill", heatColor("sun", colorValue / colorMaximum));
    rect.setAttribute("class", "thermal-heat-cell");
    rect.setAttribute("clip-path", "url(#panel-face-map-clip)");
    const uCenter = (bin.uMin + bin.uMax) / 2;
    const vCenter = (bin.vMin + bin.vMax) / 2;
    const incidenceDeg =
      (Math.asin(Math.min(1, Math.hypot(uCenter, vCenter))) * 180) / Math.PI;
    const title = document.createElementNS(SVG_NS, "title");
    title.textContent =
      `About ${formatDegrees(incidenceDeg, 0)} from face-on: ` +
      `${formatSeconds(bin.sunlitDurationSec)} dwell, ` +
      `${formatSeconds(bin.equivalentSunSec)} equivalent exposure`;
    rect.append(title);
    svg.append(rect);
  });

  [30, 60].forEach((angle) => {
    const ringRadius = Math.sin((angle * Math.PI) / 180) * radius;
    const ring = document.createElementNS(SVG_NS, "circle");
    ring.setAttribute("cx", String(centerX));
    ring.setAttribute("cy", String(centerY));
    ring.setAttribute("r", String(ringRadius));
    ring.setAttribute("class", "panel-face-ring");
    svg.append(ring);
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(centerX + ringRadius / Math.sqrt(2) + 4));
    label.setAttribute("y", String(centerY - ringRadius / Math.sqrt(2) - 3));
    label.setAttribute("class", "panel-face-ring-label");
    label.textContent = `${angle}°`;
    svg.append(label);
  });

  const outline = document.createElementNS(SVG_NS, "circle");
  outline.setAttribute("cx", String(centerX));
  outline.setAttribute("cy", String(centerY));
  outline.setAttribute("r", String(radius));
  outline.setAttribute("class", "panel-face-outline");
  svg.append(outline);

  const uLabel = bodyAxisLabel(summary.panelBasisUSc) ?? "+U";
  const vLabel = bodyAxisLabel(summary.panelBasisVSc) ?? "+V";
  const axes: Array<[number, number, number, number]> = [
    [centerX - radius, centerY, centerX + radius, centerY],
    [centerX, centerY - radius, centerX, centerY + radius],
  ];
  axes.forEach(([x1, y1, x2, y2]) => {
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y1", String(y1));
    line.setAttribute("y2", String(y2));
    line.setAttribute("class", "panel-face-axis");
    svg.append(line);
  });

  const axisLabels: Array<[number, number, string, string]> = [
    [centerX + radius + 13, centerY + 4, uLabel, "start"],
    [centerX - radius - 13, centerY + 4, oppositeAxisLabel(uLabel), "end"],
    [centerX, centerY - radius - 12, vLabel, "middle"],
    [centerX, centerY + radius + 20, oppositeAxisLabel(vLabel), "middle"],
  ];
  axisLabels.forEach(([x, y, labelText, anchor]) => {
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(y));
    label.setAttribute("text-anchor", anchor);
    label.setAttribute("class", "panel-face-axis-label");
    label.textContent = labelText;
    svg.append(label);
  });

  const centerLabel = document.createElementNS(SVG_NS, "text");
  centerLabel.setAttribute("x", String(centerX));
  centerLabel.setAttribute("y", String(centerY - 5));
  centerLabel.setAttribute("text-anchor", "middle");
  centerLabel.setAttribute("class", "panel-face-center-label");
  const centerLine1 = document.createElementNS(SVG_NS, "tspan");
  centerLine1.setAttribute("x", String(centerX));
  centerLine1.textContent = "0° · face-on";
  const centerLine2 = document.createElementNS(SVG_NS, "tspan");
  centerLine2.setAttribute("x", String(centerX));
  centerLine2.setAttribute("dy", "13");
  centerLine2.textContent = "maximum input";
  centerLabel.append(centerLine1, centerLine2);
  svg.append(centerLabel);

  const rimLabel = document.createElementNS(SVG_NS, "text");
  rimLabel.setAttribute("x", String(centerX + radius * 0.76));
  rimLabel.setAttribute("y", String(centerY + radius * 0.7));
  rimLabel.setAttribute("class", "panel-face-rim-label");
  rimLabel.textContent = "90° · grazing";
  svg.append(rimLabel);

  const scaleWidth = 170;
  const scaleX = (width - scaleWidth) / 2;
  const scaleY = 364;
  for (let index = 0; index < 40; index++) {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(scaleX + (index / 40) * scaleWidth));
    rect.setAttribute("y", String(scaleY));
    rect.setAttribute("width", String(scaleWidth / 40 + 0.2));
    rect.setAttribute("height", "8");
    rect.setAttribute("fill", heatColor("sun", index / 39));
    svg.append(rect);
  }

  const scaleTitle = document.createElementNS(SVG_NS, "text");
  scaleTitle.setAttribute("x", String(width / 2));
  scaleTitle.setAttribute("y", String(scaleY - 9));
  scaleTitle.setAttribute("text-anchor", "middle");
  scaleTitle.setAttribute("class", "thermal-axis-title");
  scaleTitle.textContent = "Equivalent direct-Sun exposure per cell";
  svg.append(scaleTitle);
  const scaleMin = document.createElementNS(SVG_NS, "text");
  scaleMin.setAttribute("x", String(scaleX));
  scaleMin.setAttribute("y", String(scaleY + 22));
  scaleMin.setAttribute("class", "thermal-axis-label");
  scaleMin.textContent = "0";
  svg.append(scaleMin);
  const scaleMax = document.createElementNS(SVG_NS, "text");
  scaleMax.setAttribute("x", String(scaleX + scaleWidth));
  scaleMax.setAttribute("y", String(scaleY + 22));
  scaleMax.setAttribute("text-anchor", "end");
  scaleMax.setAttribute("class", "thermal-axis-label");
  scaleMax.textContent = formatSeconds(maxEquivalent);
  svg.append(scaleMax);
  root.append(svg);

  const frontSideSunlitSec = occupiedBins.reduce((total, bin) => total + bin.sunlitDurationSec, 0);
  const exposureSummary = document.createElement("div");
  exposureSummary.className = "panel-face-summary";
  [
    ["Front side", formatSeconds(frontSideSunlitSec)],
    ["Behind panel", formatSeconds(summary.backsideSunlitSec)],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("span");
    item.append(text(`${labelText}: `));
    const value = document.createElement("strong");
    value.textContent = valueText;
    item.append(value);
    exposureSummary.append(item);
  });
  root.append(exposureSummary);
}

function renderPanelSunAngle(stats: PlanStats): void {
  const summary = stats.panelSunAngle;
  const context = mustEl<HTMLElement>("panel-sun-angle-context");
  const summaryRoot = mustEl<HTMLElement>("panel-sun-angle-summary");
  const chartRoot = mustEl<HTMLElement>("panel-sun-angle-histogram");
  const directionRoot = mustEl<HTMLElement>("panel-sun-direction-heatmap");
  clear(summaryRoot);
  clear(chartRoot);
  clear(directionRoot);
  context.textContent = panelDirectionLabel(summary.panelNormalSc);

  if (!summary.available) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = `Histogram unavailable: ${summary.unavailableReason ?? "required telemetry is missing"}.`;
    chartRoot.append(empty);
    const directionEmpty = empty.cloneNode(true) as HTMLElement;
    directionEmpty.textContent = `Direction map unavailable: ${summary.unavailableReason ?? "required telemetry is missing"}.`;
    directionRoot.append(directionEmpty);
    return;
  }

  [
    ["Median", formatDegrees(summary.medianDeg, 1)],
    ["Mean", formatDegrees(summary.meanDeg, 1)],
    ["Range", `${formatDegrees(summary.minDeg, 1)} to ${formatDegrees(summary.maxDeg, 1)}`],
    ["Within 45° of face-on", `${percent(summary.within45Sec, summary.durationSec)} · ${formatSeconds(summary.within45Sec)}`],
    ["On panel-facing side", `${percent(summary.within90Sec, summary.durationSec)} · ${formatSeconds(summary.within90Sec)}`],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");
    item.className = "sun-angle-stat";
    const label = document.createElement("span");
    label.textContent = labelText;
    const value = document.createElement("strong");
    value.textContent = valueText;
    item.append(label, value);
    summaryRoot.append(item);
  });

  const legend = document.createElement("div");
  legend.className = "sun-angle-legend";
  summary.modes.forEach((mode) => {
    const item = document.createElement("span");
    item.className = "sun-angle-legend-item";
    const swatch = document.createElement("span");
    swatch.className = "sun-angle-swatch";
    swatch.style.backgroundColor = PANEL_SUN_MODE_COLORS[mode] ?? PANEL_SUN_MODE_COLORS.OTHER;
    item.append(swatch, text(mode));
    legend.append(item);
  });
  chartRoot.append(legend);

  const width = 1000;
  const height = 330;
  const margin = { top: 16, right: 18, bottom: 48, left: 64 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maxBinMinutes = Math.max(
    ...summary.bins.map(
      (bin) => Object.values(bin.durationSecByMode).reduce((total, duration) => total + duration, 0) / 60,
    ),
  );
  const yMax = niceAxisMaximum(maxBinMinutes);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("sun-angle-chart");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `Histogram of Sun angle to the configured solar-panel normal over ${formatSeconds(summary.durationSec)}`,
  );

  for (let tick = 0; tick <= 4; tick++) {
    const minutes = (yMax * tick) / 4;
    const y = margin.top + plotHeight - (minutes / yMax) * plotHeight;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("class", "sun-angle-grid-line");
    line.setAttribute("x1", String(margin.left));
    line.setAttribute("x2", String(width - margin.right));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    svg.append(line);
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "sun-angle-axis-label");
    label.setAttribute("x", String(margin.left - 9));
    label.setAttribute("y", String(y + 4));
    label.setAttribute("text-anchor", "end");
    label.textContent = `${Math.round(minutes)}`;
    svg.append(label);
  }

  summary.bins.forEach((bin, binIndex) => {
    const binWidth = plotWidth / summary.bins.length;
    let stackedMinutes = 0;
    summary.modes.forEach((mode) => {
      const durationSec = bin.durationSecByMode[mode] ?? 0;
      if (durationSec <= 0) return;
      const minutes = durationSec / 60;
      const barHeight = (minutes / yMax) * plotHeight;
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("class", "sun-angle-bar");
      rect.setAttribute("x", String(margin.left + binIndex * binWidth + 0.7));
      rect.setAttribute("y", String(margin.top + plotHeight - ((stackedMinutes + minutes) / yMax) * plotHeight));
      rect.setAttribute("width", String(Math.max(1, binWidth - 1.4)));
      rect.setAttribute("height", String(Math.max(0.5, barHeight)));
      rect.setAttribute("fill", PANEL_SUN_MODE_COLORS[mode] ?? PANEL_SUN_MODE_COLORS.OTHER);
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent = `${bin.minDeg}-${bin.maxDeg}° · ${mode}: ${formatSeconds(durationSec)}`;
      rect.append(title);
      svg.append(rect);
      stackedMinutes += minutes;
    });
  });

  [0, 30, 60, 90, 120, 150, 180].forEach((degrees) => {
    const x = margin.left + (degrees / 180) * plotWidth;
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "sun-angle-axis-label");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(height - 24));
    label.setAttribute("text-anchor", "middle");
    label.textContent = `${degrees}°`;
    svg.append(label);
  });

  [45, 90].forEach((degrees) => {
    const x = margin.left + (degrees / 180) * plotWidth;
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("class", `sun-angle-reference sun-angle-reference-${degrees}`);
    line.setAttribute("x1", String(x));
    line.setAttribute("x2", String(x));
    line.setAttribute("y1", String(margin.top));
    line.setAttribute("y2", String(margin.top + plotHeight));
    svg.append(line);
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("class", "sun-angle-reference-label");
    label.setAttribute("x", String(x + 5));
    label.setAttribute("y", String(margin.top + 13));
    label.textContent = `${degrees}°`;
    svg.append(label);
  });

  const xTitle = document.createElementNS(SVG_NS, "text");
  xTitle.setAttribute("class", "sun-angle-axis-title");
  xTitle.setAttribute("x", String(margin.left + plotWidth / 2));
  xTitle.setAttribute("y", String(height - 3));
  xTitle.setAttribute("text-anchor", "middle");
  xTitle.textContent = "Angle from face-on (0° direct, 90° edge-on)";
  svg.append(xTitle);
  const yTitle = document.createElementNS(SVG_NS, "text");
  yTitle.setAttribute("class", "sun-angle-axis-title");
  yTitle.setAttribute("transform", `translate(15 ${margin.top + plotHeight / 2}) rotate(-90)`);
  yTitle.setAttribute("text-anchor", "middle");
  yTitle.textContent = "Duration (minutes)";
  svg.append(yTitle);
  chartRoot.append(svg);
  renderPanelSunFaceMap(summary);
}

const BODY_FACE_LAYOUT: Array<{
  face: string;
  column: number;
  row: number;
  uLabel: string;
  vLabel: string;
}> = [
  { face: "+Z", column: 1, row: 0, uLabel: "+X", vLabel: "+Y" },
  { face: "-X", column: 0, row: 1, uLabel: "-Y", vLabel: "+Z" },
  { face: "+Y", column: 1, row: 1, uLabel: "-X", vLabel: "+Z" },
  { face: "+X", column: 2, row: 1, uLabel: "+Y", vLabel: "+Z" },
  { face: "-Y", column: 3, row: 1, uLabel: "+X", vLabel: "+Z" },
  { face: "-Z", column: 1, row: 2, uLabel: "+X", vLabel: "-Y" },
];

function renderBodyFaceMap(
  rootId: string,
  bins: BodyFaceDwellBin[],
  source: "sun" | "earth",
  sharedMaxDuration: number,
): void {
  const root = mustEl<HTMLElement>(rootId);
  clear(root);
  if (bins.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = source === "sun" ? "No sunlit direction intervals are available." : "No Earth-direction intervals are available.";
    root.append(empty);
    return;
  }

  const width = 640;
  const height = 460;
  const faceSize = 118;
  const gap = 8;
  const originX = 68;
  const originY = 14;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("thermal-chart-svg", "body-face-map");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `${source === "sun" ? "Sunlit Sun" : "Earth-center"} direction dwell in spacecraft body coordinates`,
  );

  BODY_FACE_LAYOUT.forEach((layout) => {
    const faceX = originX + layout.column * (faceSize + gap);
    const faceY = originY + layout.row * (faceSize + gap);
    const background = document.createElementNS(SVG_NS, "rect");
    background.setAttribute("x", String(faceX));
    background.setAttribute("y", String(faceY));
    background.setAttribute("width", String(faceSize));
    background.setAttribute("height", String(faceSize));
    background.setAttribute("class", "body-face-background");
    svg.append(background);

    bins.filter((bin) => bin.face === layout.face).forEach((bin) => {
      const rect = document.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(faceX + ((bin.uMin + 1) / 2) * faceSize));
      rect.setAttribute("y", String(faceY + ((1 - bin.vMax) / 2) * faceSize));
      rect.setAttribute("width", String(((bin.uMax - bin.uMin) / 2) * faceSize + 0.2));
      rect.setAttribute("height", String(((bin.vMax - bin.vMin) / 2) * faceSize + 0.2));
      rect.setAttribute("fill", heatColor(source, bin.durationSec / sharedMaxDuration));
      rect.setAttribute("class", "thermal-heat-cell");
      const title = document.createElementNS(SVG_NS, "title");
      title.textContent =
        `${layout.face} face, ${layout.uLabel} ${bin.uMin.toFixed(1)} to ${bin.uMax.toFixed(1)}, ` +
        `${layout.vLabel} ${bin.vMin.toFixed(1)} to ${bin.vMax.toFixed(1)}: ${formatSeconds(bin.durationSec)}`;
      rect.append(title);
      svg.append(rect);
    });

    const outline = document.createElementNS(SVG_NS, "rect");
    outline.setAttribute("x", String(faceX));
    outline.setAttribute("y", String(faceY));
    outline.setAttribute("width", String(faceSize));
    outline.setAttribute("height", String(faceSize));
    outline.setAttribute("class", "body-face-outline");
    svg.append(outline);
    const faceLabel = document.createElementNS(SVG_NS, "text");
    faceLabel.setAttribute("x", String(faceX + 6));
    faceLabel.setAttribute("y", String(faceY + 15));
    faceLabel.setAttribute("class", "body-face-label");
    faceLabel.textContent = layout.face;
    svg.append(faceLabel);
    const axes = document.createElementNS(SVG_NS, "text");
    axes.setAttribute("x", String(faceX + faceSize - 5));
    axes.setAttribute("y", String(faceY + faceSize - 6));
    axes.setAttribute("text-anchor", "end");
    axes.setAttribute("class", "body-face-axis-label");
    axes.textContent = `→${layout.uLabel}  ↑${layout.vLabel}`;
    svg.append(axes);
  });

  const title = document.createElementNS(SVG_NS, "text");
  title.setAttribute("x", String(width / 2));
  title.setAttribute("y", String(height - 25));
  title.setAttribute("text-anchor", "middle");
  title.setAttribute("class", "thermal-axis-title");
  title.textContent =
    `${source === "sun" ? "Sunlit Sun" : "Earth center"} dwell · shared scale 0 to ${formatSeconds(sharedMaxDuration)} per bin`;
  svg.append(title);
  if (source === "earth") {
    const qualifier = document.createElementNS(SVG_NS, "text");
    qualifier.setAttribute("x", String(width / 2));
    qualifier.setAttribute("y", String(height - 8));
    qualifier.setAttribute("text-anchor", "middle");
    qualifier.setAttribute("class", "thermal-axis-label");
    qualifier.textContent = "Map shows Earth center; surface view factors below integrate the finite Earth disk";
    svg.append(qualifier);
  }
  root.append(svg);
}

const BODY_COMPONENT_COLORS = ["#f1ba4a", "#49bed2", "#d66bff"];
const BODY_COMPONENT_DASHES = ["", "7 4", "2 3"];

function componentPath(
  samples: BodyDirectionSample[],
  source: "sun" | "earth",
  component: number,
  xAt: (time: number) => number,
  yAt: (value: number) => number,
): string {
  let path = "";
  let previousEnd: number | null = null;
  samples.forEach((sample) => {
    const value = (source === "sun" ? sample.sunBody : sample.earthBody)[component];
    const command = previousEnd !== null && Math.abs(sample.time - previousEnd) <= 1e-6 ? "L" : "M";
    path += `${command} ${xAt(sample.time).toFixed(2)} ${yAt(value).toFixed(2)} `;
    previousEnd = sample.time + sample.durationSec;
  });
  return path.trim();
}

function renderDirectionComponents(
  rootId: string,
  samples: BodyDirectionSample[],
  source: "sun" | "earth",
): void {
  const root = mustEl<HTMLElement>(rootId);
  clear(root);
  if (samples.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No body-direction samples are available.";
    root.append(empty);
    return;
  }

  const width = 1100;
  const height = 280;
  const margin = { top: 28, right: 22, bottom: 42, left: 50 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const start = samples[0].time;
  const end = samples.at(-1)!.time + samples.at(-1)!.durationSec;
  const duration = Math.max(1, end - start);
  const xAt = (time: number): number => margin.left + ((time - start) / duration) * plotWidth;
  const yAt = (value: number): number => margin.top + ((1 - value) / 2) * plotHeight;
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.classList.add("thermal-chart-svg", "thermal-component-chart");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${source === "sun" ? "Sun" : "Earth"} body-frame X, Y, and Z direction cosines over time`);

  if (source === "sun") {
    let eclipseStart: number | null = null;
    samples.forEach((sample, index) => {
      if (sample.inEclipse && eclipseStart === null) eclipseStart = sample.time;
      const next = samples[index + 1];
      const closes = sample.inEclipse && (!next || !next.inEclipse || Math.abs(next.time - (sample.time + sample.durationSec)) > 1e-6);
      if (closes && eclipseStart !== null) {
        const rect = document.createElementNS(SVG_NS, "rect");
        rect.setAttribute("x", String(xAt(eclipseStart)));
        rect.setAttribute("y", String(margin.top));
        rect.setAttribute("width", String(Math.max(0, xAt(sample.time + sample.durationSec) - xAt(eclipseStart))));
        rect.setAttribute("height", String(plotHeight));
        rect.setAttribute("class", "thermal-eclipse-band");
        svg.append(rect);
        eclipseStart = null;
      }
    });
  }

  samples.forEach((sample) => {
    const rect = document.createElementNS(SVG_NS, "rect");
    rect.setAttribute("x", String(xAt(sample.time)));
    rect.setAttribute("y", String(margin.top + plotHeight - 4));
    rect.setAttribute("width", String(Math.max(0.5, xAt(sample.time + sample.durationSec) - xAt(sample.time))));
    rect.setAttribute("height", "4");
    rect.setAttribute("fill", PANEL_SUN_MODE_COLORS[sample.mode] ?? PANEL_SUN_MODE_COLORS.OTHER);
    rect.setAttribute("class", "thermal-mode-strip");
    svg.append(rect);
  });

  [-1, -0.5, 0, 0.5, 1].forEach((value) => {
    const y = yAt(value);
    const line = document.createElementNS(SVG_NS, "line");
    line.setAttribute("x1", String(margin.left));
    line.setAttribute("x2", String(margin.left + plotWidth));
    line.setAttribute("y1", String(y));
    line.setAttribute("y2", String(y));
    line.setAttribute("class", "thermal-grid-line");
    svg.append(line);
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(margin.left - 8));
    label.setAttribute("y", String(y + 4));
    label.setAttribute("text-anchor", "end");
    label.setAttribute("class", "thermal-axis-label");
    label.textContent = value.toFixed(value === 0 ? 0 : 1);
    svg.append(label);
  });

  [0, 0.25, 0.5, 0.75, 1].forEach((fraction) => {
    const x = margin.left + fraction * plotWidth;
    const label = document.createElementNS(SVG_NS, "text");
    label.setAttribute("x", String(x));
    label.setAttribute("y", String(height - 20));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "thermal-axis-label");
    label.textContent = `+${((duration * fraction) / 3600).toFixed(1)}h`;
    svg.append(label);
  });

  ["X", "Y", "Z"].forEach((axis, component) => {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", componentPath(samples, source, component, xAt, yAt));
    path.setAttribute("stroke", BODY_COMPONENT_COLORS[component]);
    if (BODY_COMPONENT_DASHES[component]) {
      path.setAttribute("stroke-dasharray", BODY_COMPONENT_DASHES[component]);
    }
    path.setAttribute("class", "thermal-component-line");
    svg.append(path);
    const legendX = margin.left + component * 62;
    const legendLine = document.createElementNS(SVG_NS, "line");
    legendLine.setAttribute("x1", String(legendX));
    legendLine.setAttribute("x2", String(legendX + 18));
    legendLine.setAttribute("y1", "15");
    legendLine.setAttribute("y2", "15");
    legendLine.setAttribute("stroke", BODY_COMPONENT_COLORS[component]);
    legendLine.setAttribute("stroke-width", "2");
    if (BODY_COMPONENT_DASHES[component]) {
      legendLine.setAttribute("stroke-dasharray", BODY_COMPONENT_DASHES[component]);
    }
    svg.append(legendLine);
    const legend = document.createElementNS(SVG_NS, "text");
    legend.setAttribute("x", String(legendX + 23));
    legend.setAttribute("y", "18");
    legend.setAttribute("fill", BODY_COMPONENT_COLORS[component]);
    legend.setAttribute("class", "thermal-component-legend");
    legend.textContent = axis;
    svg.append(legend);
  });

  if (source === "sun") {
    const eclipseSwatch = document.createElementNS(SVG_NS, "rect");
    eclipseSwatch.setAttribute("x", "242");
    eclipseSwatch.setAttribute("y", "9");
    eclipseSwatch.setAttribute("width", "18");
    eclipseSwatch.setAttribute("height", "10");
    eclipseSwatch.setAttribute("class", "thermal-eclipse-band");
    svg.append(eclipseSwatch);
    const eclipseLabel = document.createElementNS(SVG_NS, "text");
    eclipseLabel.setAttribute("x", "266");
    eclipseLabel.setAttribute("y", "18");
    eclipseLabel.setAttribute("class", "thermal-axis-label");
    eclipseLabel.textContent = "Eclipse";
    svg.append(eclipseLabel);
  }

  const modeLabel = document.createElementNS(SVG_NS, "text");
  modeLabel.setAttribute("x", String(width - margin.right));
  modeLabel.setAttribute("y", "18");
  modeLabel.setAttribute("text-anchor", "end");
  modeLabel.setAttribute("class", "thermal-axis-label");
  modeLabel.textContent = "ACS mode strip along chart baseline";
  svg.append(modeLabel);

  const yTitle = document.createElementNS(SVG_NS, "text");
  yTitle.setAttribute("transform", `translate(13 ${margin.top + plotHeight / 2}) rotate(-90)`);
  yTitle.setAttribute("text-anchor", "middle");
  yTitle.setAttribute("class", "thermal-axis-title");
  yTitle.textContent = "Direction cosine";
  svg.append(yTitle);

  const crosshair = document.createElementNS(SVG_NS, "line");
  crosshair.setAttribute("y1", String(margin.top));
  crosshair.setAttribute("y2", String(margin.top + plotHeight));
  crosshair.setAttribute("class", "thermal-hover-crosshair");
  crosshair.setAttribute("visibility", "hidden");
  svg.append(crosshair);
  const hoverDots = BODY_COMPONENT_COLORS.map((color) => {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("r", "4");
    dot.setAttribute("fill", color);
    dot.setAttribute("class", "thermal-hover-dot");
    dot.setAttribute("visibility", "hidden");
    svg.append(dot);
    return dot;
  });
  const tooltip = document.createElementNS(SVG_NS, "g");
  tooltip.setAttribute("class", "thermal-hover-tooltip");
  tooltip.setAttribute("visibility", "hidden");
  const tooltipBackground = document.createElementNS(SVG_NS, "rect");
  tooltipBackground.setAttribute("width", "285");
  tooltipBackground.setAttribute("height", "48");
  tooltipBackground.setAttribute("rx", "4");
  const tooltipLine1 = document.createElementNS(SVG_NS, "text");
  tooltipLine1.setAttribute("x", "9");
  tooltipLine1.setAttribute("y", "18");
  const tooltipLine2 = document.createElementNS(SVG_NS, "text");
  tooltipLine2.setAttribute("x", "9");
  tooltipLine2.setAttribute("y", "36");
  tooltip.append(tooltipBackground, tooltipLine1, tooltipLine2);
  svg.append(tooltip);

  const overlay = document.createElementNS(SVG_NS, "rect");
  overlay.setAttribute("x", String(margin.left));
  overlay.setAttribute("y", String(margin.top));
  overlay.setAttribute("width", String(plotWidth));
  overlay.setAttribute("height", String(plotHeight));
  overlay.setAttribute("class", "thermal-hover-overlay");
  overlay.addEventListener("pointermove", (event) => {
    const bounds = svg.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width;
    const targetTime = start + ((pointerX - margin.left) / plotWidth) * duration;
    const sample = samples.reduce((nearest, candidate) =>
      Math.abs(candidate.time - targetTime) < Math.abs(nearest.time - targetTime) ? candidate : nearest,
    );
    const x = xAt(sample.time);
    const values = source === "sun" ? sample.sunBody : sample.earthBody;
    crosshair.setAttribute("x1", String(x));
    crosshair.setAttribute("x2", String(x));
    crosshair.setAttribute("visibility", "visible");
    hoverDots.forEach((dot, component) => {
      dot.setAttribute("cx", String(x));
      dot.setAttribute("cy", String(yAt(values[component])));
      dot.setAttribute("visibility", "visible");
    });
    const tooltipX = x > width / 2 ? x - 295 : x + 10;
    tooltip.setAttribute("transform", `translate(${tooltipX} ${margin.top + 8})`);
    tooltip.setAttribute("visibility", "visible");
    tooltipLine1.textContent = `${fmtTime(sample.time)} · ${sample.mode}${sample.inEclipse ? " · eclipse" : ""}`;
    tooltipLine2.textContent = `X ${values[0].toFixed(3)}   Y ${values[1].toFixed(3)}   Z ${values[2].toFixed(3)}`;
  });
  overlay.addEventListener("pointerleave", () => {
    crosshair.setAttribute("visibility", "hidden");
    hoverDots.forEach((dot) => dot.setAttribute("visibility", "hidden"));
    tooltip.setAttribute("visibility", "hidden");
  });
  svg.append(overlay);
  root.append(svg);
}

function renderDirectionComponentTabs(samples: BodyDirectionSample[]): void {
  const tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>("#body-component-tabs .thermal-tab"),
  );
  const selectSource = (source: "sun" | "earth"): void => {
    tabs.forEach((tab) => {
      const selected = tab.dataset.source === source;
      tab.classList.toggle("is-active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });
    renderDirectionComponents("body-components-chart", samples, source);
  };
  tabs.forEach((tab) => {
    tab.onclick = () => selectSource(tab.dataset.source === "earth" ? "earth" : "sun");
  });
  selectSource("sun");
}

function exposureCell(
  valueText: string,
  fraction: number,
  source: "sun" | "earth" | "space",
): HTMLTableCellElement {
  const td = numberCell(valueText);
  const [r, g, b] = source === "sun" ? [241, 186, 74] : source === "earth" ? [73, 190, 210] : [139, 124, 255];
  const intensity = Math.max(0, Math.min(1, Math.sqrt(fraction)));
  td.style.backgroundColor = `rgba(${r}, ${g}, ${b}, ${0.03 + 0.22 * intensity})`;
  return td;
}

function renderThermalGeometry(stats: PlanStats): void {
  const geometry = stats.thermalGeometry;
  const summaryRoot = mustEl<HTMLElement>("thermal-geometry-summary");
  const tableRoot = mustEl<HTMLElement>("surface-exposure-table");
  clear(summaryRoot);
  clear(tableRoot);

  if (!geometry.available) {
    const roots = [
      summaryRoot,
      mustEl<HTMLElement>("sun-body-face-map"),
      mustEl<HTMLElement>("earth-body-face-map"),
      mustEl<HTMLElement>("body-components-chart"),
      tableRoot,
    ];
    roots.forEach((root) => {
      clear(root);
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = `Thermal geometry unavailable: ${geometry.unavailableReason ?? "required telemetry is missing"}.`;
      root.append(empty);
    });
    return;
  }

  [
    ["Analyzed", `${formatSeconds(geometry.durationSec)} · ${geometry.samples.length} intervals`],
    ["Sunlit", `${percent(geometry.sunlitSec, geometry.durationSec)} · ${formatSeconds(geometry.sunlitSec)}`],
    ["Eclipse", `${percent(geometry.eclipseSec, geometry.durationSec)} · ${formatSeconds(geometry.eclipseSec)}`],
    [
      "Earth apparent radius",
      `${formatDegrees(geometry.earthAngularRadiusMeanDeg, 1)} mean · ` +
        `${formatDegrees(geometry.earthAngularRadiusMinDeg, 1)} to ` +
        `${formatDegrees(geometry.earthAngularRadiusMaxDeg, 1)}`,
    ],
  ].forEach(([labelText, valueText]) => {
    const item = document.createElement("div");
    item.className = "sun-angle-stat";
    const label = document.createElement("span");
    label.textContent = labelText;
    const value = document.createElement("strong");
    value.textContent = valueText;
    item.append(label, value);
    summaryRoot.append(item);
  });

  const sharedMapMaxDuration = Math.max(
    1,
    ...geometry.sunDwellBins.map((bin) => bin.durationSec),
    ...geometry.earthDwellBins.map((bin) => bin.durationSec),
  );
  renderBodyFaceMap("sun-body-face-map", geometry.sunDwellBins, "sun", sharedMapMaxDuration);
  renderBodyFaceMap("earth-body-face-map", geometry.earthDwellBins, "earth", sharedMapMaxDuration);
  renderDirectionComponentTabs(geometry.samples);

  const rows = geometry.surfaces.map((surface) => {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = surface.name;
    const normal = document.createElement("td");
    normal.className = "num";
    normal.textContent = vectorLabel(surface.normalSc, 0);
    const minSunAngle = surface.peakSunCosine > 0
      ? (Math.acos(Math.max(-1, Math.min(1, surface.peakSunCosine))) * 180) / Math.PI
      : null;
    tr.append(
      name,
      normal,
      exposureCell(
        formatSeconds(surface.directSunEquivalentSec),
        surface.directSunEquivalentSec / Math.max(1, geometry.sunlitSec),
        "sun",
      ),
      exposureCell(
        formatSeconds(surface.sunAbove10PercentSec),
        surface.sunAbove10PercentSec / Math.max(1, geometry.sunlitSec),
        "sun",
      ),
      exposureCell(
        formatSeconds(surface.sunAbove50PercentSec),
        surface.sunAbove50PercentSec / Math.max(1, geometry.sunlitSec),
        "sun",
      ),
      exposureCell(
        formatSeconds(surface.sunAbove90PercentSec),
        surface.sunAbove90PercentSec / Math.max(1, geometry.sunlitSec),
        "sun",
      ),
      numberCell(formatDegrees(minSunAngle, 1)),
      exposureCell(
        formatSeconds(surface.longestAbove10PercentSec),
        surface.longestAbove10PercentSec / Math.max(1, geometry.sunlitSec),
        "sun",
      ),
      exposureCell(
        `${(100 * surface.meanEarthViewFactor).toFixed(1)}%`,
        surface.meanEarthViewFactor,
        "earth",
      ),
      exposureCell(
        `${(100 * surface.peakEarthViewFactor).toFixed(1)}%`,
        surface.peakEarthViewFactor,
        "earth",
      ),
      exposureCell(
        `${(100 * surface.meanDeepSpaceViewFactor).toFixed(1)}%`,
        surface.meanDeepSpaceViewFactor,
        "space",
      ),
      exposureCell(
        `${(100 * surface.minimumDeepSpaceViewFactor).toFixed(1)}%`,
        surface.minimumDeepSpaceViewFactor,
        "space",
      ),
    );
    return tr;
  });
  tableRoot.replaceChildren(
    table(
      [
        "Surface",
        "Body normal",
        {
          label: "Sun eq.",
          title: "Normal-incidence-equivalent Sun exposure: integral of max(0, normal dot Sun direction) outside eclipse.",
        },
        { label: "Load ≥10%", title: "Sunlit dwell with projected direct-Sun load at least 10% of normal incidence." },
        { label: "Load ≥50%", title: "Sunlit dwell with projected direct-Sun load at least 50% of normal incidence." },
        { label: "Load ≥90%", title: "Sunlit dwell with projected direct-Sun load at least 90% of normal incidence." },
        { label: "Best Sun angle", title: "Smallest Sun angle to the surface normal outside eclipse." },
        { label: "Longest ≥10%", title: "Longest continuous dwell above 10% projected direct-Sun load." },
        { label: "Mean Earth VF", title: "Duration-weighted radiative view factor to Earth's finite apparent disk." },
        { label: "Peak Earth VF", title: "Maximum radiative view factor to Earth's finite apparent disk." },
        { label: "Mean deep-space VF", title: "Mean unobstructed deep-space view factor, 1 minus Earth view factor." },
        { label: "Min deep-space VF", title: "Minimum unobstructed deep-space view factor, 1 minus peak Earth view factor." },
      ],
      rows,
      "No surface exposure geometry is available.",
    ),
  );
}

function metric(labelText: string, valueText: string, detailText: string): HTMLElement {
  const item = document.createElement("div");
  item.className = "metric-item";
  const label = document.createElement("div");
  label.className = "metric-label";
  label.textContent = labelText;
  const value = document.createElement("div");
  value.className = "metric-value";
  value.textContent = valueText;
  const detail = document.createElement("div");
  detail.className = "metric-detail";
  detail.textContent = detailText;
  item.append(label, value, detail);
  return item;
}

function renderScienceSummary(stats: PlanStats): void {
  const science = stats.science;
  mustEl<HTMLElement>("science-summary").replaceChildren(
    metric("Science Entries", String(science.count), "entries excluding GSP and charge modes"),
    metric(
      "Exposure Efficiency",
      percent(science.exposureSec, science.scheduledSec),
      `${formatSeconds(science.exposureSec)} exposure / ${formatSeconds(science.scheduledSec)} scheduled`,
    ),
    metric("Slew Overhead", formatSeconds(science.slewSec), `${formatSeconds(science.meanSlewSec)} mean per science entry`),
    metric("Non-Exposure Time", formatSeconds(science.overheadSec), "scheduled science time not reported as exposure"),
    metric("Median Exposure", formatSeconds(science.medianExposureSec), "per science entry"),
    metric("Science Share", percent(science.scheduledSec, stats.window.durationSec), "fraction of full plan window"),
  );
}

function renderSlewDistribution(stats: PlanStats): void {
  const root = mustEl<HTMLElement>("slew-distribution");
  clear(root);
  const maxCount = Math.max(1, ...stats.slewDistribution.map((bin) => bin.count));

  stats.slewDistribution.forEach((bin) => {
    const row = document.createElement("div");
    row.className = "hist-row";
    const label = document.createElement("div");
    label.className = "hist-label";
    label.textContent = bin.label;
    const track = document.createElement("div");
    track.className = "hist-track";
    const fill = document.createElement("div");
    fill.className = "hist-fill";
    fill.style.width = `${(100 * bin.count) / maxCount}%`;
    track.append(fill);
    const count = document.createElement("div");
    count.className = "hist-count";
    count.textContent = String(bin.count);
    row.append(label, track, count);
    root.append(row);
  });
}

type TableHeader = string | { label: string; title: string };

function table(headers: TableHeader[], rows: HTMLTableRowElement[], emptyText: string): HTMLElement {
  if (rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = emptyText;
    return empty;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "table-wrap";
  const tableEl = document.createElement("table");
  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = typeof header === "string" ? header : header.label;
    if (typeof header !== "string") th.title = header.title;
    headerRow.append(th);
  });
  thead.append(headerRow);
  const tbody = document.createElement("tbody");
  rows.forEach((row) => tbody.append(row));
  tableEl.append(thead, tbody);
  wrapper.append(tableEl);
  return wrapper;
}

function renderActivityTable(stats: PlanStats): void {
  const rows = stats.activities.map((activity) => {
    const tr = document.createElement("tr");
    const type = document.createElement("td");
    type.textContent = activity.type;
    tr.append(
      type,
      numberCell(String(activity.count)),
      numberCell(formatSeconds(activity.durationSec)),
      numberCell(percent(activity.durationSec, stats.window.durationSec)),
      numberCell(formatSeconds(activity.exposureSec)),
      numberCell(formatSeconds(activity.slewSec)),
    );
    return tr;
  });
  mustEl<HTMLElement>("activity-table").replaceChildren(
    table(["Type", "Count", "Duration", "Plan", "Exposure", "Slew"], rows, "No plan entries found."),
  );
}

function renderStationTable(stats: PlanStats): void {
  const rows = stats.stations.map((station) => {
    const tr = document.createElement("tr");
    const name = document.createElement("td");
    name.textContent = station.station;
    tr.append(
      name,
      numberCell(String(station.count)),
      numberCell(formatSeconds(station.scheduledSec)),
      numberCell(formatSeconds(station.contactSec)),
    );
    return tr;
  });
  mustEl<HTMLElement>("station-table").replaceChildren(
    table(["Station", "Count", "Scheduled", "Contact"], rows, "No GSP entries found."),
  );
}

function renderGapClassification(stats: PlanStats): void {
  const root = mustEl<HTMLElement>("gap-classification");
  clear(root);
  if (stats.gapCategories.length === 0) return;

  const maxDuration = Math.max(1, ...stats.gapCategories.map((row) => row.durationSec));
  stats.gapCategories.forEach((gap) => {
    const row = document.createElement("div");
    row.className = "gap-class-row";
    const label = document.createElement("div");
    label.className = "gap-class-label";
    label.textContent = gap.category;
    const track = document.createElement("div");
    track.className = "gap-class-track";
    const fill = document.createElement("div");
    fill.className = "gap-class-fill";
    fill.style.width = `${(100 * gap.durationSec) / maxDuration}%`;
    track.append(fill);
    const value = document.createElement("div");
    value.className = "gap-class-value";
    value.textContent = `${formatSeconds(gap.durationSec)} / ${gap.count}`;
    row.append(label, track, value);
    root.append(row);
  });
}

function renderGapTable(stats: PlanStats): void {
  const rows = stats.gaps.slice(0, 12).map((gap) => {
    const tr = document.createElement("tr");
    const window = document.createElement("td");
    window.append(text(`${fmtTime(gap.start)}\n${fmtTime(gap.end)}`));
    window.className = "preline";
    const context = document.createElement("td");
    context.append(text(`${gap.category}\n${gap.after ?? "plan start"}\n${gap.before ?? "plan end"}`));
    context.className = "preline";
    tr.append(window, numberCell(formatSeconds(gap.durationSec)), context);
    return tr;
  });
  mustEl<HTMLElement>("gap-table").replaceChildren(
    table(["Window", "Duration", "Between"], rows, "No idle gaps in this plan window."),
  );
}

function renderSlewScatter(stats: PlanStats): void {
  const root = mustEl<HTMLElement>("slew-scatter");
  clear(root);
  const points = stats.slews.filter((slew) => slew.distanceDeg !== null);
  if (points.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No slew distance metadata found.";
    root.append(empty);
    return;
  }

  const width = 520;
  const height = 220;
  const padLeft = 58;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 48;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const maxDistance = Math.max(1, ...points.map((slew) => slew.distanceDeg ?? 0));
  const maxDuration = Math.max(1, ...points.map((slew) => slew.durationSec));

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Slew distance versus duration scatter plot");
  svg.classList.add("slew-scatter-svg");

  const axis = document.createElementNS("http://www.w3.org/2000/svg", "path");
  axis.setAttribute(
    "d",
    `M ${padLeft} ${padTop} V ${height - padBottom} H ${width - padRight}`,
  );
  axis.classList.add("scatter-axis");
  svg.append(axis);

  [0, 0.5, 1].forEach((fraction) => {
    const x = padLeft + fraction * plotWidth;
    const y = height - padBottom - fraction * plotHeight;
    const distanceTick = document.createElementNS("http://www.w3.org/2000/svg", "text");
    distanceTick.setAttribute("x", x.toFixed(1));
    distanceTick.setAttribute("y", String(height - padBottom + 16));
    distanceTick.setAttribute("text-anchor", "middle");
    distanceTick.textContent = `${(maxDistance * fraction).toFixed(maxDistance < 10 ? 1 : 0)}°`;
    distanceTick.classList.add("scatter-tick-label");
    svg.append(distanceTick);

    const durationTick = document.createElementNS("http://www.w3.org/2000/svg", "text");
    durationTick.setAttribute("x", String(padLeft - 8));
    durationTick.setAttribute("y", (y + 4).toFixed(1));
    durationTick.setAttribute("text-anchor", "end");
    durationTick.textContent = formatSeconds(maxDuration * fraction);
    durationTick.classList.add("scatter-tick-label");
    svg.append(durationTick);
  });

  const xLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  xLabel.setAttribute("x", String(padLeft + plotWidth / 2));
  xLabel.setAttribute("y", String(height - 8));
  xLabel.setAttribute("text-anchor", "middle");
  xLabel.textContent = "Slew distance (deg)";
  xLabel.classList.add("scatter-label");
  svg.append(xLabel);

  const yLabel = document.createElementNS("http://www.w3.org/2000/svg", "text");
  yLabel.setAttribute("x", "14");
  yLabel.setAttribute("y", String(padTop + plotHeight / 2));
  yLabel.setAttribute("text-anchor", "middle");
  yLabel.setAttribute("transform", `rotate(-90 14 ${padTop + plotHeight / 2})`);
  yLabel.textContent = "Slew duration (s)";
  yLabel.classList.add("scatter-label");
  svg.append(yLabel);

  points.forEach((slew) => {
    const distance = slew.distanceDeg ?? 0;
    const x = padLeft + (distance / maxDistance) * plotWidth;
    const y = height - padBottom - (slew.durationSec / maxDuration) * plotHeight;
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", x.toFixed(1));
    circle.setAttribute("cy", y.toFixed(1));
    circle.setAttribute("r", "4");
    circle.classList.add("scatter-point");
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${slew.type} ${slew.target}\n${formatSeconds(slew.durationSec)}, ${distance.toFixed(1)}°\n${fmtTime(slew.start)}`;
    circle.append(title);
    svg.append(circle);
  });

  root.append(svg);
}

function renderSlewTable(stats: PlanStats): void {
  const rows = stats.slews.slice(0, 12).map((slew) => {
    const tr = document.createElement("tr");
    const target = document.createElement("td");
    target.textContent = slew.target;
    const type = document.createElement("td");
    type.textContent = slew.type;
    tr.append(
      target,
      type,
      numberCell(fmtTime(slew.start)),
      numberCell(formatSeconds(slew.durationSec)),
      numberCell(slew.distanceDeg === null ? "—" : `${slew.distanceDeg.toFixed(1)}°`),
    );
    return tr;
  });
  mustEl<HTMLElement>("slew-table").replaceChildren(
    table(["Target", "Type", "Start", "Duration", "Distance"], rows, "No entry slewtime metadata found."),
  );
}

function findingClass(finding: IntegrityFinding): string {
  return finding.severity === "error" ? "finding-error" : "finding-warn";
}

function renderFindings(stats: PlanStats): void {
  const rows = stats.findings.map((finding) => {
    const tr = document.createElement("tr");
    tr.className = findingClass(finding);
    const severity = document.createElement("td");
    severity.textContent = finding.severity.toUpperCase();
    const label = document.createElement("td");
    label.textContent = finding.label;
    const detail = document.createElement("td");
    detail.textContent = finding.detail;
    tr.append(severity, label, detail);
    return tr;
  });
  mustEl<HTMLElement>("finding-table").replaceChildren(
    table(["Severity", "Check", "Detail"], rows, "No schedule integrity issues detected."),
  );
}

function positionChecksSection(stats: PlanStats): void {
  const checks = mustEl<HTMLElement>("checks-section");
  const anchor = mustEl<HTMLElement>("checks-anchor");
  const header = mustEl<HTMLElement>("stats-header");
  if (stats.findings.length > 0) {
    header.after(checks);
  } else {
    anchor.after(checks);
  }
}

function csvCell(value: unknown): string {
  const textValue = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(textValue)) return `"${textValue.replaceAll('"', '""')}"`;
  return textValue;
}

function csvRows(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function statsCsv(stats: PlanStats): string {
  const sections = [
    [
      "summary",
      csvRows(
        ["metric", "value"],
        [
          ["window_sec", stats.window.durationSec],
          ["scheduled_sec", stats.totals.scheduledUnionSec],
          ["idle_sec", stats.totals.idleSec],
          ["exposure_sec", stats.totals.exposureSec],
          ["entry_slew_sec", stats.totals.entrySlewSec],
          ["gsp_sec", stats.totals.gspSec],
          ["gsp_executed_max_sweep_deg", stats.gspExecution.maxSweepDeg],
          ["gsp_executed_contact_samples", stats.gspExecution.samplesChecked],
          ["earth_limb_schedule_constraint_deg", stats.constraints.earthKeepoutDeg],
          ["earth_keepout_min_margin_deg", stats.constraints.earthKeepoutMinMarginDeg],
          ["earth_keepout_violation_samples", stats.constraints.earthViolationSamples],
          ["earth_limb_clearance_min_deg", stats.constraints.earthMinMarginDeg],
          ["earth_physical_intersection_samples", stats.constraints.earthPhysicalIntersectionSamples],
          ["executed_constraint_samples", stats.constraintTelemetry.samples],
          ["executed_hard_constraint_violation_samples", stats.constraintTelemetry.hardViolationSamples],
          ["executed_soft_constraint_violation_samples", stats.constraintTelemetry.softViolationSamples],
          ["charge_sec", stats.totals.chargeSec],
          ["downlink_MB", stats.totals.downlinkMB],
          ["thermal_geometry_sec", stats.thermalGeometry.durationSec],
          ["thermal_sunlit_sec", stats.thermalGeometry.sunlitSec],
          ["thermal_eclipse_sec", stats.thermalGeometry.eclipseSec],
          ["earth_apparent_radius_mean_deg", stats.thermalGeometry.earthAngularRadiusMeanDeg],
        ],
      ),
    ],
    [
      "activities",
      csvRows(
        ["type", "count", "duration_sec", "exposure_sec", "slew_sec"],
        stats.activities.map((row) => [row.type, row.count, row.durationSec, row.exposureSec, row.slewSec]),
      ),
    ],
    [
      "stations",
      csvRows(
        ["station", "count", "scheduled_sec", "contact_sec", "downlink_MB"],
        stats.stations.map((row) => [row.station, row.count, row.scheduledSec, row.contactSec, row.downlinkMB]),
      ),
    ],
    [
      "gaps",
      csvRows(
        ["start", "end", "duration_sec", "category", "after", "before"],
        stats.gaps.map((row) => [fmtTime(row.start), fmtTime(row.end), row.durationSec, row.category, row.after, row.before]),
      ),
    ],
    [
      "slews",
      csvRows(
        ["target", "type", "start", "duration_sec", "distance_deg"],
        stats.slews.map((row) => [row.target, row.type, fmtTime(row.start), row.durationSec, row.distanceDeg]),
      ),
    ],
    [
      "surface_exposure_geometry",
      csvRows(
        [
          "surface",
          "normal_x",
          "normal_y",
          "normal_z",
          "direct_sun_equivalent_sec",
          "peak_sun_cosine",
          "sun_above_10_percent_sec",
          "sun_above_50_percent_sec",
          "sun_above_90_percent_sec",
          "longest_sun_above_10_percent_sec",
          "mean_earth_view_factor",
          "peak_earth_view_factor",
          "mean_deep_space_view_factor",
          "minimum_deep_space_view_factor",
        ],
        stats.thermalGeometry.surfaces.map((row) => [
          row.name,
          ...row.normalSc,
          row.directSunEquivalentSec,
          row.peakSunCosine,
          row.sunAbove10PercentSec,
          row.sunAbove50PercentSec,
          row.sunAbove90PercentSec,
          row.longestAbove10PercentSec,
          row.meanEarthViewFactor,
          row.peakEarthViewFactor,
          row.meanDeepSpaceViewFactor,
          row.minimumDeepSpaceViewFactor,
        ]),
      ),
    ],
    [
      "body_direction_timeseries",
      csvRows(
        [
          "time_unix",
          "time_utc",
          "duration_sec",
          "mode",
          "in_eclipse",
          "sun_body_x",
          "sun_body_y",
          "sun_body_z",
          "earth_body_x",
          "earth_body_y",
          "earth_body_z",
          "earth_angular_radius_deg",
        ],
        stats.thermalGeometry.samples.map((row) => [
          row.time,
          new Date(row.time * 1000).toISOString(),
          row.durationSec,
          row.mode,
          row.inEclipse,
          ...row.sunBody,
          ...row.earthBody,
          row.earthAngularRadiusDeg,
        ]),
      ),
    ],
    [
      "constraint_violations",
      csvRows(
        ["kind", "constraint", "samples", "first", "last", "modes", "first_entry", "last_entry", "detail"],
        stats.constraintTelemetry.violations.map((row) => [
          row.kind,
          row.constraint,
          row.samples,
          fmtTime(row.firstTime),
          fmtTime(row.lastTime),
          row.modes.join("; "),
          row.firstEntry,
          row.lastEntry,
          row.detail,
        ]),
      ),
    ],
    [
      "findings",
      csvRows(
        ["severity", "label", "detail"],
        stats.findings.map((row) => [row.severity, row.label, row.detail]),
      ),
    ],
  ];

  return sections.map(([name, csv]) => `# ${name}\n${csv}`).join("\n\n");
}

function downloadText(filename: string, textValue: string, type: string): void {
  const blob = new Blob([textValue], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function wireExportButtons(): void {
  mustEl<HTMLButtonElement>("export-json").addEventListener("click", () => {
    if (!currentStats) return;
    downloadText("plan_stats.json", JSON.stringify(currentStats, null, 2), "application/json");
  });
  mustEl<HTMLButtonElement>("export-csv").addEventListener("click", () => {
    if (!currentStats) return;
    downloadText("plan_stats.csv", statsCsv(currentStats), "text/csv");
  });
}

function render(stats: PlanStats): void {
  positionChecksSection(stats);
  renderSummary(stats);
  renderConstraints(stats);
  renderAttitudeConsistency(stats);
  renderOrbitContext(stats);
  renderDownlink(stats);
  renderTimelineChart(stats);
  renderPanelSunAngle(stats);
  renderThermalGeometry(stats);
  renderTimeBars(stats);
  renderScienceSummary(stats);
  renderSlewDistribution(stats);
  renderActivityTable(stats);
  renderStationTable(stats);
  renderGapClassification(stats);
  renderGapTable(stats);
  renderSlewScatter(stats);
  renderSlewTable(stats);
  renderFindings(stats);
}

async function loadVizData(): Promise<VizData> {
  const response = await fetch(`${ASSET_BASE}viz-data`);
  if (!response.ok) throw new Error(`viz-data request failed: ${response.status}`);
  return (await response.json()) as VizData;
}

loadVizData()
  .then((data) => {
    const stats = buildPlanStats(data, statsOptions());
    currentStats = stats;
    mustEl<HTMLElement>("stats-status").textContent =
      stats.metadata.sourcePlan ?? "Loaded from active visualizer backend";
    render(stats);
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    mustEl<HTMLElement>("stats-status").textContent = msg;
  });

wireExportButtons();
