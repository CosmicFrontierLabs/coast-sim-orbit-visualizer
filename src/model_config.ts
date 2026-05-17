import * as THREE from "three";

type AxisName = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
type AxisSpec = AxisName | [number, number, number];

interface FrameDescription {
  description?: string;
  source?: string;
  asset?: string;
}

interface SpacecraftAxisMappingConfig {
  /** Direction of the optical/boresight axis in the CAD/GLB model's local frame. */
  modelBoresight?: AxisSpec;
  /** Direction of the same physical boresight in the COAST spacecraft frame. */
  spacecraftBoresight?: AxisSpec;
  /** Extra right-hand roll applied after boresight alignment, about spacecraftBoresight. */
  rollAboutSpacecraftBoresightDeg?: number;
}

export interface SpacecraftModelConfig {
  /** Describes the frame authored into the GLB/CAD export. Informational only. */
  modelFrame?: FrameDescription;
  /** Describes the COAST spacecraft frame used by viz_data attitude output. Informational only. */
  spacecraftFrame?: FrameDescription;
  /** Maps CAD/GLB model-local axes into the COAST spacecraft frame. */
  axisMapping?: SpacecraftAxisMappingConfig;
}

type ResolvedSpacecraftModelConfig = SpacecraftModelConfig & {
  axisMapping: Required<SpacecraftAxisMappingConfig>;
};

const DEFAULT_MODEL_CONFIG: ResolvedSpacecraftModelConfig = {
  axisMapping: {
    modelBoresight: "+X",
    spacecraftBoresight: "+X",
    rollAboutSpacecraftBoresightDeg: 0,
  },
};

function axisVector(axis: AxisSpec | undefined, fallback: AxisName): THREE.Vector3 {
  const value = axis ?? fallback;
  if (Array.isArray(value)) {
    const vec = new THREE.Vector3(value[0], value[1], value[2]);
    if (vec.lengthSq() === 0) {
      throw new Error("Axis vector must not be zero length");
    }
    return vec.normalize();
  }

  switch (value) {
    case "+X":
      return new THREE.Vector3(1, 0, 0);
    case "-X":
      return new THREE.Vector3(-1, 0, 0);
    case "+Y":
      return new THREE.Vector3(0, 1, 0);
    case "-Y":
      return new THREE.Vector3(0, -1, 0);
    case "+Z":
      return new THREE.Vector3(0, 0, 1);
    case "-Z":
      return new THREE.Vector3(0, 0, -1);
  }
}

export function modelPreRotationFromConfig(config: SpacecraftModelConfig): THREE.Quaternion {
  const axisMapping = config.axisMapping ?? DEFAULT_MODEL_CONFIG.axisMapping;
  const modelBoresight = axisVector(axisMapping.modelBoresight, "+X");
  const spacecraftBoresight = axisVector(axisMapping.spacecraftBoresight, "+X");
  const rollDeg = axisMapping.rollAboutSpacecraftBoresightDeg ?? 0;

  // This quaternion rotates the visual mesh from CAD/GLB-local coordinates into
  // the COAST spacecraft frame before the COAST attitude quaternion is applied.
  const boresightQ = new THREE.Quaternion().setFromUnitVectors(modelBoresight, spacecraftBoresight);
  const rollQ = new THREE.Quaternion().setFromAxisAngle(spacecraftBoresight, THREE.MathUtils.degToRad(rollDeg));
  return rollQ.multiply(boresightQ);
}

export async function loadSpacecraftModelConfig(assetBase: string): Promise<SpacecraftModelConfig> {
  const url = `${assetBase}model/spacecraft.config.json`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      if (response.status !== 404) {
        console.warn(`Spacecraft model config request failed: ${response.status} ${url}`);
      }
      return DEFAULT_MODEL_CONFIG;
    }
    return (await response.json()) as SpacecraftModelConfig;
  } catch (err) {
    console.warn(`Spacecraft model config not loaded from ${url}; using default axes`, err);
    return DEFAULT_MODEL_CONFIG;
  }
}
