import * as THREE from "three";
import { SC_DIAG_WU } from "./constants";
import type { GroundStationMeta, PPSTEntry } from "./types";

// Radius (Earth = 1.0 unit) at which the reticle sits. Raised well clear of the
// surface so the marker geometry and label no longer z-fight / bleed through the
// Earth texture in the depth buffer.
const STATION_STANDOFF = 1.01;

// Stylized antenna visibility cone rising from each station along the local
// zenith (surface normal). Half-angle is derived from the station elevation
// mask when available, clamped to a visually readable range.
const CONE_HEIGHT = 0.55;
const CONE_HALF_ANGLE_MIN_DEG = 18;
const CONE_HALF_ANGLE_MAX_DEG = 55;
const DEFAULT_MIN_ELEVATION_DEG = 45;

// "Data downlink" stream drawn between an active station and the spacecraft:
// individual 1/0 glyphs travelling from the spacecraft down to the station,
// each with its own speed, phase, and slight lateral scatter so the flow
// reads as motion at any zoom level.
const STREAM_BITS = 1000;
const STREAM_TRAVEL_SEC = 3.0; // nominal spacecraft-to-station transit time
const STREAM_JITTER_FRAC = 0.035; // lateral scatter as a fraction of line length
// Glyphs are physically sized to ~1/3 of the spacecraft so they read at the
// same scale as the satellite when zoomed in, with a pixel floor so the
// string stays legible from Earth-scale views and a screen-fraction cap as a
// safety net for bits passing right next to the camera.
const BIT_SC_FRACTION = 2 / 3;
const BIT_MIN_PX = 16;
const BIT_MAX_VIEW_FRAC = 1 / 3;

// Cone fade shaping: hide cones pointing away from the camera and dim them as
// the spacecraft recedes from the station (world units, Earth radius = 1).
const CONE_PROXIMITY_NEAR = 0.12;
const CONE_PROXIMITY_FAR = 1.0;

const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function fract(x: number): number {
  return x - Math.floor(x);
}

interface StationStream {
  group: THREE.Group;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  bits: THREE.Sprite[];
  speeds: number[];
  phase0: number[];
  jitterA: number[];
  jitterB: number[];
}

interface StationMarker {
  station: GroundStationMeta;
  group: THREE.Group;
  reticle: THREE.Group;
  reticleMeshes: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>;
  cone: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  label: THREE.Sprite;
  stream: StationStream;
}

export interface GroundStationMarkerController {
  setStations: (stations: GroundStationMeta[], entries: PPSTEntry[]) => void;
  update: (simTime: number, entries: PPSTEntry[], satPosW: THREE.Vector3) => void;
}

// Shared, lazily-built glyph textures for the "0" and "1" bits.
let bitTextures: [THREE.CanvasTexture, THREE.CanvasTexture] | null = null;

function bitTexture(value: 0 | 1): THREE.CanvasTexture {
  if (!bitTextures) {
    bitTextures = [makeBitTexture("0"), makeBitTexture("1")];
  }
  return bitTextures[value];
}

function makeBitTexture(glyph: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 52px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(0, 12, 20, 0.85)";
    ctx.fillStyle = "rgba(180, 245, 210, 0.98)";
    ctx.strokeText(glyph, 32, 34);
    ctx.fillText(glyph, 32, 34);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function stationCode(station: GroundStationMeta): string {
  return station.code.trim().toUpperCase();
}

function stationCodeFromEntry(entry: PPSTEntry): string {
  return (entry.station ?? "").trim().toUpperCase();
}

function geodeticToEarthMeshLocal(station: GroundStationMeta, radius: number): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(station.latitude_deg);
  const lon = THREE.MathUtils.degToRad(station.longitude_deg);
  const cosLat = Math.cos(lat);

  return new THREE.Vector3(
    radius * cosLat * Math.cos(lon),
    radius * Math.sin(lat),
    -radius * cosLat * Math.sin(lon),
  );
}

function isFiniteStation(station: GroundStationMeta): boolean {
  return (
    station.code.trim().length > 0 &&
    Number.isFinite(station.latitude_deg) &&
    Number.isFinite(station.longitude_deg)
  );
}

function configuredGspStationCodes(entries: PPSTEntry[]): Set<string> {
  const codes = new Set<string>();
  for (const entry of entries) {
    if ((entry.obstype ?? "").toUpperCase() !== "GSP") continue;
    const code = stationCodeFromEntry(entry);
    if (code.length > 0) {
      codes.add(code);
    }
  }
  return codes;
}

function createLabelSprite(code: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 192;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 34px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.82)";
    ctx.fillStyle = "rgba(236, 248, 255, 0.96)";
    ctx.strokeText(code, canvas.width / 2, canvas.height / 2);
    ctx.fillText(code, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.58,
      depthTest: true,
      depthWrite: false,
    }),
  );
  sprite.renderOrder = 4;
  return sprite;
}

function isActiveForStation(code: string, simTime: number, entries: PPSTEntry[]): boolean {
  return entries.some((entry) => {
    if ((entry.obstype ?? "").toUpperCase() !== "GSP") return false;
    if (stationCodeFromEntry(entry) !== code) return false;

    const begin = entry.contact_begin ?? entry.begin;
    const end = entry.contact_end ?? entry.end;
    return simTime >= begin && simTime <= end;
  });
}

function markerMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0xd6f5ff,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function coneMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x5fd4ff,
    transparent: true,
    opacity: 0.1,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function reticleMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.MeshBasicMaterial,
): THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 4;
  return mesh;
}

function makeCone(station: GroundStationMeta, normal: THREE.Vector3): THREE.Mesh<
  THREE.BufferGeometry,
  THREE.MeshBasicMaterial
> {
  let minElev = station.min_elevation_deg;
  if (!Number.isFinite(minElev as number)) {
    console.warn(
      `[ground-stations] ${stationCode(station)}: min_elevation_deg not specified; ` +
        `defaulting to ${DEFAULT_MIN_ELEVATION_DEG} deg`,
    );
    minElev = DEFAULT_MIN_ELEVATION_DEG;
  }
  const halfAngleDeg = THREE.MathUtils.clamp(
    90 - (minElev as number),
    CONE_HALF_ANGLE_MIN_DEG,
    CONE_HALF_ANGLE_MAX_DEG,
  );
  const baseRadius = CONE_HEIGHT * Math.tan(THREE.MathUtils.degToRad(halfAngleDeg));

  // Cone apex at the station, opening upward (wide end away from Earth).
  const geometry = new THREE.ConeGeometry(baseRadius, CONE_HEIGHT, 48, 1, true);
  geometry.rotateX(Math.PI);
  geometry.translate(0, CONE_HEIGHT / 2, 0);

  const cone = new THREE.Mesh(geometry, coneMaterial());
  cone.renderOrder = 3;
  cone.quaternion.setFromUnitVectors(Y_AXIS, normal);
  return cone;
}

function makeStream(scene: THREE.Object3D): StationStream {
  const group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 4;

  const lineGeom = new THREE.BufferGeometry();
  lineGeom.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(
    lineGeom,
    new THREE.LineBasicMaterial({
      color: 0x7bf0c0,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    }),
  );
  line.renderOrder = 4;
  group.add(line);

  const bits: THREE.Sprite[] = [];
  const speeds: number[] = [];
  const phase0: number[] = [];
  const jitterA: number[] = [];
  const jitterB: number[] = [];
  for (let i = 0; i < STREAM_BITS; i++) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: bitTexture(((i * 7 + 3) % 5 < 2 ? 0 : 1) as 0 | 1),
        transparent: true,
        opacity: 0.95,
        depthTest: true,
        depthWrite: false,
      }),
    );
    sprite.renderOrder = 5;
    bits.push(sprite);
    group.add(sprite);

    // Deterministic per-bit variation (golden-ratio hashing keeps it stable
    // across frames without a PRNG).
    const r1 = fract(i * 0.618034 + 0.17);
    const r2 = fract(i * 0.754877 + 0.41);
    const r3 = fract(i * 0.56984 + 0.83);
    speeds.push(1 / (STREAM_TRAVEL_SEC * (0.7 + 0.6 * r1)));
    phase0.push(r2);
    jitterA.push((r3 - 0.5) * 2);
    jitterB.push((fract(r3 * 7.13 + 0.29) - 0.5) * 2);
  }

  scene.add(group);
  return { group, line, bits, speeds, phase0, jitterA, jitterB };
}

function makeMarker(station: GroundStationMeta, scene: THREE.Object3D): StationMarker {
  const code = stationCode(station);
  const group = new THREE.Group();

  const reticle = new THREE.Group();
  const reticleMeshes = [
    reticleMesh(new THREE.RingGeometry(0.037, 0.04, 64), markerMaterial(0.46)),
    reticleMesh(new THREE.RingGeometry(0.016, 0.018, 48), markerMaterial(0.52)),
    reticleMesh(new THREE.CircleGeometry(0.0058, 24), markerMaterial(0.76)),
    reticleMesh(new THREE.PlaneGeometry(0.018, 0.0025), markerMaterial(0.48)),
    reticleMesh(new THREE.PlaneGeometry(0.018, 0.0025), markerMaterial(0.48)),
    reticleMesh(new THREE.PlaneGeometry(0.018, 0.0025), markerMaterial(0.48)),
    reticleMesh(new THREE.PlaneGeometry(0.018, 0.0025), markerMaterial(0.48)),
  ];
  reticleMeshes[3].position.set(0.052, 0, 0);
  reticleMeshes[4].position.set(-0.052, 0, 0);
  reticleMeshes[5].position.set(0, 0.052, 0);
  reticleMeshes[5].rotation.z = Math.PI / 2;
  reticleMeshes[6].position.set(0, -0.052, 0);
  reticleMeshes[6].rotation.z = Math.PI / 2;
  reticle.add(...reticleMeshes);

  const label = createLabelSprite(code);

  const pos = geodeticToEarthMeshLocal(station, STATION_STANDOFF);
  const normal = pos.clone().normalize();
  group.position.copy(pos);
  reticle.quaternion.setFromUnitVectors(Z_AXIS, normal);
  label.position.copy(normal).multiplyScalar(0.042);
  label.scale.set(0.11, 0.041, 1);

  const cone = makeCone(station, normal);
  const stream = makeStream(scene);

  group.add(reticle, cone, label);
  return { station, group, reticle, reticleMeshes, cone, label, stream };
}

export function createGroundStationMarkerController({
  earthMesh,
  scene,
  camera,
}: {
  earthMesh: THREE.Object3D;
  scene: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
}): GroundStationMarkerController {
  const markers: StationMarker[] = [];

  // Scratch vectors reused across frames to avoid per-frame allocation.
  const stationW = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const zenithW = new THREE.Vector3();
  const toCam = new THREE.Vector3();
  const lineDir = new THREE.Vector3();
  const perpA = new THREE.Vector3();
  const perpB = new THREE.Vector3();

  function disposeStream(stream: StationStream): void {
    scene.remove(stream.group);
    stream.line.geometry.dispose();
    stream.line.material.dispose();
    for (const bit of stream.bits) {
      bit.material.dispose();
    }
  }

  function setStations(stations: GroundStationMeta[], entries: PPSTEntry[]): void {
    for (const marker of markers) {
      earthMesh.remove(marker.group);
      for (const mesh of marker.reticleMeshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      marker.cone.geometry.dispose();
      marker.cone.material.dispose();
      marker.label.material.map?.dispose();
      marker.label.material.dispose();
      disposeStream(marker.stream);
    }
    markers.length = 0;

    const configuredCodes = configuredGspStationCodes(entries);
    for (const station of stations.filter(isFiniteStation)) {
      if (!configuredCodes.has(stationCode(station))) continue;
      const marker = makeMarker(station, scene);
      markers.push(marker);
      earthMesh.add(marker.group);
    }
  }

  function updateStream(stream: StationStream, satPosW: THREE.Vector3): void {
    stream.group.visible = true;

    const posAttr = stream.line.geometry.getAttribute("position") as THREE.BufferAttribute;
    posAttr.setXYZ(0, stationW.x, stationW.y, stationW.z);
    posAttr.setXYZ(1, satPosW.x, satPosW.y, satPosW.z);
    posAttr.needsUpdate = true;

    // Each glyph travels the spacecraft-to-station line on its own phase and
    // speed, with a fixed lateral scatter so the packets don't stack.
    const lineLen = satPosW.distanceTo(stationW);
    if (lineLen <= 0) return;
    lineDir.copy(stationW).sub(satPosW).divideScalar(lineLen);
    perpA.crossVectors(lineDir, Math.abs(lineDir.y) < 0.9 ? Y_AXIS : X_AXIS).normalize();
    perpB.crossVectors(lineDir, perpA);

    const t = performance.now() / 1000;
    const viewTan2 = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const viewportH = Math.max(innerHeight, 1);

    for (let i = 0; i < stream.bits.length; i++) {
      const u = fract(stream.phase0[i] + t * stream.speeds[i]);
      tmp
        .copy(satPosW)
        .lerp(stationW, u)
        .addScaledVector(perpA, lineLen * STREAM_JITTER_FRAC * stream.jitterA[i])
        .addScaledVector(perpB, lineLen * STREAM_JITTER_FRAC * stream.jitterB[i]);
      stream.bits[i].position.copy(tmp);

      // Spacecraft-relative physical size, floored in pixels for far views
      // and capped as a screen fraction for bits right next to the camera.
      const distToCam = Math.max(tmp.distanceTo(camera.position), 1e-9);
      const worldPerPx = (distToCam * viewTan2) / viewportH;
      const s = Math.min(
        Math.max(SC_DIAG_WU * BIT_SC_FRACTION, worldPerPx * BIT_MIN_PX),
        distToCam * viewTan2 * BIT_MAX_VIEW_FRAC,
      );
      stream.bits[i].scale.set(s, s, 1);
    }
  }

  function update(simTime: number, entries: PPSTEntry[], satPosW: THREE.Vector3): void {
    for (const marker of markers) {
      const active = isActiveForStation(stationCode(marker.station), simTime, entries);

      for (const mesh of marker.reticleMeshes) {
        mesh.material.color.setHex(active ? 0xfff0a3 : 0xd6f5ff);
        mesh.material.opacity = active ? 0.9 : 0.5;
      }
      marker.reticle.scale.setScalar(active ? 1.18 : 1.0);
      marker.label.material.opacity = active ? 0.92 : 0.58;

      marker.group.getWorldPosition(stationW);

      // Fade the cone out when its zenith points away from the camera (station
      // on the far side of Earth) and dim it as the spacecraft recedes.
      zenithW.copy(stationW).normalize();
      toCam.copy(camera.position).sub(stationW).normalize();
      const facing = THREE.MathUtils.smoothstep(zenithW.dot(toCam), -0.05, 0.25);
      const proximity =
        1 -
        THREE.MathUtils.smoothstep(
          stationW.distanceTo(satPosW),
          CONE_PROXIMITY_NEAR,
          CONE_PROXIMITY_FAR,
        );
      marker.cone.material.color.setHex(active ? 0xffd479 : 0x5fd4ff);
      marker.cone.material.opacity =
        (active ? 0.26 : 0.12) * facing * (0.2 + 0.8 * proximity);

      if (active) {
        updateStream(marker.stream, satPosW);
      } else {
        marker.stream.group.visible = false;
      }
    }
  }

  return { setStations, update };
}
