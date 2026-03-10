// filepath: /Users/jak51/STAR/coast-sim/orbit-visualizer/src/main.ts
export type OrbitPoint = { t: number; x: number; y: number; z: number };
export type Trajectory = { points: OrbitPoint[] };

function toNum(v: unknown, d = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function mapCoastPlanToTrajectory(plan: unknown): Trajectory {
  const p = (plan ?? {}) as Record<string, unknown>;

  if (Array.isArray(p.trajectory)) {
    return {
      points: p.trajectory
        .map((s) => s as Record<string, unknown>)
        .map((s) => ({ t: toNum(s.t), x: toNum(s.x), y: toNum(s.y), z: toNum(s.z) })),
    };
  }

  if (Array.isArray(p.states)) {
    return {
      points: p.states
        .map((s) => s as Record<string, unknown>)
        .map((s) => {
          const pos = (s.position ?? {}) as Record<string, unknown>;
          return {
            t: toNum(s.time ?? s.t),
            x: toNum(pos.x),
            y: toNum(pos.y),
            z: toNum(pos.z),
          };
        }),
    };
  }

  if (Array.isArray(p.ephemeris)) {
    return {
      points: p.ephemeris
        .map((s) => s as Record<string, unknown>)
        .map((s) => {
          const r = Array.isArray(s.r) ? s.r : [0, 0, 0];
          return { t: toNum(s.t), x: toNum(r[0]), y: toNum(r[1]), z: toNum(r[2]) };
        }),
    };
  }

  return { points: [] };
}

export async function launchVisualizerFromPlan(plan: unknown): Promise<void> {
  const trajectory = mapCoastPlanToTrajectory(plan);
  // TODO: replace with renderer bootstrap call.
  console.log(`[orbit-visualizer] Loaded ${trajectory.points.length} trajectory points.`);
}
