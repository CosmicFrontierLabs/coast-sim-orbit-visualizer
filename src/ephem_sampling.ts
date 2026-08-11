import * as THREE from "three";
import type { EciVec, EphemData } from "./types";

interface EphemSample {
  frac: number;
  posKm: THREE.Vector3;
  posW: THREE.Vector3;
  sunVec: THREE.Vector3;
  ramVec: THREE.Vector3;
  lat: number;
  lon: number;
  beta: number;
  inEcl: number;
  alt: number;
  ra: number;
  dec: number;
  roll: number;
  attitudeQ: THREE.Quaternion | null;
}

/**
 * Linearly interpolate a vector-valued sampled array.
 *
 * @param {number[][]} arr Array of `[x, y, z]` samples.
 * @param {number} t Fractional sample index.
 * @returns {THREE.Vector3}
 */
export function lerpVec(arr: EciVec[], t: number): THREE.Vector3 {
  const i0 = Math.min(Math.floor(t), arr.length - 2);
  const f = t - i0;
  const a = arr[i0];
  const b = arr[i0 + 1];
  return new THREE.Vector3(
    a[0] + f * (b[0] - a[0]),
    a[1] + f * (b[1] - a[1]),
    a[2] + f * (b[2] - a[2]),
  );
}

/**
 * Linearly interpolate a scalar sampled array.
 *
 * @param {number[]} arr Scalar samples.
 * @param {number} t Fractional sample index.
 * @returns {number}
 */
export function lerpScalar(arr: number[], t: number): number {
  const i0 = Math.min(Math.floor(t), arr.length - 2);
  const f = t - i0;
  return arr[i0] + f * (arr[i0 + 1] - arr[i0]);
}

function coastQuatToBodyWorldQ(
  quatW: number,
  quatX: number,
  quatY: number,
  quatZ: number,
): THREE.Quaternion {
  // COAST stores scalar-first ECI-to-body quaternions. Three.js object
  // quaternions rotate body/local coordinates into world/ECI.
  return new THREE.Quaternion(-quatX, -quatY, -quatZ, quatW).normalize();
}

function slerpCoastQuat(ephem: EphemData, frac: number): THREE.Quaternion | null {
  if (!ephem.quat_w || !ephem.quat_x || !ephem.quat_y || !ephem.quat_z) {
    return null;
  }
  const n = ephem.utime.length;
  if (
    n < 2 ||
    ephem.quat_w.length !== n ||
    ephem.quat_x.length !== n ||
    ephem.quat_y.length !== n ||
    ephem.quat_z.length !== n
  ) {
    return null;
  }

  const i0 = Math.min(Math.floor(frac), n - 2);
  const f = frac - i0;
  const q0 = coastQuatToBodyWorldQ(
    ephem.quat_w[i0],
    ephem.quat_x[i0],
    ephem.quat_y[i0],
    ephem.quat_z[i0],
  );
  const q1 = coastQuatToBodyWorldQ(
    ephem.quat_w[i0 + 1],
    ephem.quat_x[i0 + 1],
    ephem.quat_y[i0 + 1],
    ephem.quat_z[i0 + 1],
  );
  if (q0.dot(q1) < 0) {
    q1.set(-q1.x, -q1.y, -q1.z, -q1.w);
  }
  return q0.slerp(q1, f).normalize();
}

/**
 * Convert simulation time to fractional ephemeris index.
 *
 * @param {number} t Unix timestamp (seconds).
 * @param {number[]} ut Ephemeris sample times.
 * @returns {number}
 */
export function ephemFrac(t: number, ut: number[]): number {
  return Math.max(0, Math.min((t - ut[0]) / (ut[1] - ut[0]), ut.length - 1));
}

/**
 * Sample interpolated ephemeris frame values at the current simulation time.
 *
 * @param {Object} deps
 * @param {Object} deps.ephem Ephemeris payload.
 * @param {number} deps.simTime Unix timestamp (seconds).
 * @param {number} deps.reKm Earth radius in km.
 * @param {number} deps.scale ECI km -> world scale factor.
 * @returns {Object}
 */
export function sampleEphemFrame({
  ephem,
  simTime,
  reKm,
  scale,
}: {
  ephem: EphemData;
  simTime: number;
  reKm: number;
  scale: number;
}): EphemSample {
  const frac = ephemFrac(simTime, ephem.utime);
  const posKm = lerpVec(ephem.posvec, frac);
  const sunVec = lerpVec(ephem.sunvec, frac).normalize();
  const ramVec = lerpVec(ephem.ramvec, frac).normalize();
  const lat = lerpScalar(ephem.lat, frac);
  const lon = lerpScalar(ephem.lon, frac);
  const beta = lerpScalar(ephem.beta, frac);
  const inEcl = Math.round(lerpScalar(ephem.ineclipse, frac));
  const alt = posKm.length() - reKm;
  const posW = posKm.clone().multiplyScalar(scale);

  // Attitude from DITL telemetry if present; otherwise zero (caller falls back
  // to ram-aligned).
  const ra = ephem.ra ? lerpScalar(ephem.ra, frac) : 0;
  const dec = ephem.dec ? lerpScalar(ephem.dec, frac) : 0;
  const roll = ephem.roll ? lerpScalar(ephem.roll, frac) : 0;
  const attitudeQ = slerpCoastQuat(ephem, frac);

  return {
    frac,
    posKm,
    posW,
    sunVec,
    ramVec,
    lat,
    lon,
    beta,
    inEcl,
    alt,
    ra,
    dec,
    roll,
    attitudeQ,
  };
}
