import {
  buildPlanStats,
  type ConsistencyWorst,
  type IntegrityFinding,
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
  const keepoutSource = c.earthKeepoutConfigured ? "schedule constraint" : "physical limb only; schedule limit unavailable";
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
      "Minimum Sun Angle",
      formatDegrees(c.sunMinAngleDeg),
      c.sunWorstTime === null
        ? "no sun vector samples"
        : `${fmtTime(c.sunWorstTime)}${c.sunWorstEntry ? `, ${c.sunWorstEntry}` : ""}`,
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

function table(headers: string[], rows: HTMLTableRowElement[], emptyText: string): HTMLElement {
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
    th.textContent = header;
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
          ["charge_sec", stats.totals.chargeSec],
          ["downlink_MB", stats.totals.downlinkMB],
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
  renderSummary(stats);
  renderConstraints(stats);
  renderAttitudeConsistency(stats);
  renderOrbitContext(stats);
  renderDownlink(stats);
  renderTimelineChart(stats);
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
