import * as THREE from "three";
import type { BasisRTB } from "./types";

const DEG = Math.PI / 180;

/**
 * Convert RA/Dec (degrees) into a unit ECI vector.
 *
 * @param {number} ra Right ascension in degrees.
 * @param {number} dec Declination in degrees.
 * @returns {THREE.Vector3}
 */
export function radec2eci(ra: number, dec: number): THREE.Vector3 {
  const r = ra * DEG;
  const d = dec * DEG;
  return new THREE.Vector3(Math.cos(d) * Math.cos(r), Math.cos(d) * Math.sin(r), Math.sin(d));
}

/**
 * Orthonormal basis for spacecraft's local radial frame.
 * r = radially outward from Earth ("up" from surface)
 * t = east-ish tangent = (Z × r).normalize()
 * b = north-ish tangent = r × t
 */
export function scRadialBasis(pos: THREE.Vector3): BasisRTB {
  const r = pos.clone().normalize();
  let t = new THREE.Vector3(0, 0, 1).cross(r);
  if (t.lengthSq() < 1e-4) t.set(1, 0, 0).cross(r);
  t.normalize();
  const b = r.clone().cross(t);
  return { r, t, b };
}

function zeroRollBodyAxes(ra: number, dec: number): {
  x: THREE.Vector3;
  y: THREE.Vector3;
  z: THREE.Vector3;
} {
  const r = ra * DEG;
  const d = dec * DEG;
  const cosRa = Math.cos(r);
  const sinRa = Math.sin(r);
  const cosDec = Math.cos(d);
  const sinDec = Math.sin(d);
  // This is projected celestial north away from the poles and its
  // RA-dependent Euler continuation at the poles, matching COAST.
  return {
    x: new THREE.Vector3(cosDec * cosRa, cosDec * sinRa, sinDec),
    y: new THREE.Vector3(-sinRa, cosRa, 0),
    z: new THREE.Vector3(-sinDec * cosRa, -sinDec * sinRa, cosDec),
  };
}

/**
 * Build spacecraft attitude quaternion from PPST RA/Dec/Roll.
 * SC frame convention:
 *   +X_SC points at (RA, Dec) (XRT boresight), and commanded roll is a
 *   right-handed physical rotation about +X_SC.
 */
export function buildAttitudeQ(ra: number, dec: number, roll: number): THREE.Quaternion {
  const zeroRoll = zeroRollBodyAxes(ra, dec);
  const rollRad = roll * DEG;
  const cosRoll = Math.cos(rollRad);
  const sinRoll = Math.sin(rollRad);
  const y = zeroRoll.y.clone().multiplyScalar(cosRoll).addScaledVector(zeroRoll.z, sinRoll);
  const z = zeroRoll.y.clone().multiplyScalar(-sinRoll).addScaledVector(zeroRoll.z, cosRoll);
  const rotation = new THREE.Matrix4().makeBasis(zeroRoll.x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(rotation).normalize();
}

/**
 * Wrap degrees to (-180, 180].
 *
 * @param {number} deg
 * @returns {number}
 */
export function wrap180(deg: number): number {
  let x = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (x === -180) x = 180;
  return x;
}

// Recover displayed roll from spacecraft quaternion using the same
// north/east convention as buildAttitudeQ.
/**
 * Recover displayed roll angle from an attitude quaternion.
 *
 * @param {THREE.Quaternion} bodyQ Spacecraft body orientation in ECI.
 * @param {number} ra Right ascension in degrees.
 * @param {number} dec Declination in degrees.
 * @returns {number}
 */
export function renderedRollDeg(bodyQ: THREE.Quaternion, ra: number, dec: number): number {
  const zeroRoll = zeroRollBodyAxes(ra, dec);
  const zSCinECI = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyQ).normalize();
  const ang = Math.atan2(-zSCinECI.dot(zeroRoll.y), zSCinECI.dot(zeroRoll.z)) / DEG;
  return wrap180(ang);
}
