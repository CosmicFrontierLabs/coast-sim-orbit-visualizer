import { access, cp, mkdir } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(repoRoot, "orbit_visualizer", "dist");

async function exists(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function copyOptionalDir(name) {
  const src = join(repoRoot, name);
  const dest = join(distRoot, name);
  await mkdir(dest, { recursive: true });

  if (!(await exists(src))) {
    console.log(`[orbit-visualizer] optional ${name}/ assets not found; using runtime fallbacks`);
    return;
  }

  await cp(src, dest, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
  console.log(`[orbit-visualizer] copied ${name}/ assets`);
}

await mkdir(distRoot, { recursive: true });
await copyOptionalDir("model");
await copyOptionalDir("textures");
