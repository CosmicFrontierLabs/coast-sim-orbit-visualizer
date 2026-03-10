// filepath: /Users/jak51/STAR/coast-sim/orbit-visualizer/src/cli.ts
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchVisualizerFromPlan } from "./main";

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
