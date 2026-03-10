// filepath: /Users/jak51/STAR/coast-sim/orbit-visualizer/src/cli.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

type OrbitPoint = { t: number; x: number; y: number; z: number };
type Trajectory = { points: OrbitPoint[] };

function toNum(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function mapPlanToTrajectory(plan: unknown): Trajectory {
  const p = (plan ?? {}) as Record<string, unknown>;
  if (Array.isArray(p.trajectory))
    return { points: (p.trajectory as Record<string, unknown>[]).map((s) => ({ t: toNum(s.t), x: toNum(s.x), y: toNum(s.y), z: toNum(s.z) })) };
  if (Array.isArray(p.states))
    return { points: (p.states as Record<string, unknown>[]).map((s) => { const pos = (s.position ?? {}) as Record<string, unknown>; return { t: toNum(s.time ?? s.t), x: toNum(pos.x), y: toNum(pos.y), z: toNum(pos.z) }; }) };
  if (Array.isArray(p.ephemeris))
    return { points: (p.ephemeris as Record<string, unknown>[]).map((s) => { const r = Array.isArray(s.r) ? s.r as number[] : [0, 0, 0]; return { t: toNum(s.t), x: toNum(r[0]), y: toNum(r[1]), z: toNum(r[2]) }; }) };
  return { points: [] };
}

async function launchVisualizerFromPlan(plan: unknown): Promise<void> {
  const trajectory = mapPlanToTrajectory(plan);
  console.log(`[orbit-visualizer] Loaded ${trajectory.points.length} trajectory points.`);
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function run(): Promise<void> {
  const planArg = arg("--plan");
  if (!planArg) throw new Error("Missing --plan <path>");

  const planPath = resolve(planArg);
  if (!existsSync(planPath)) throw new Error(`Plan not found: ${planPath}`);

  const plan = JSON.parse(readFileSync(planPath, "utf8")) as unknown;
  await launchVisualizerFromPlan(plan);
}

run().catch((e) => {
  console.error("[orbit-visualizer]", e);
  process.exit(1);
});
