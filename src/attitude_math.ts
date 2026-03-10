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
 * Orthonormal basis for Swift's local radial frame.
 * r = radially outward from Earth ("up" from surface)
 * t = east-ish tangent = (Z × r).normalize()
 * b = north-ish tangent = r × t
 */
export function swiftRadialBasis(pos: THREE.Vector3): BasisRTB {
  const r = pos.clone().normalize();
  let t = new THREE.Vector3(0, 0, 1).cross(r);
  if (t.lengthSq() < 1e-4) t.set(1, 0, 0).cross(r);
  t.normalize();
  const b = r.clone().cross(t);
  return { r, t, b };
}

/**
 * Build spacecraft attitude quaternion from PPST RA/Dec/Roll.
 * SC frame convention:
 *   +X_SC points at (RA, Dec) (XRT boresight), and commanded roll is a
 *   NEGATIVE rotation about +X_SC from north-perp toward east.
 */
export function buildAttitudeQ(ra: number, dec: number, roll: number): THREE.Quaternion {
  const boresight = radec2eci(ra, dec);
  // Align +X_SC (boresight) to target direction in ECI.
  const q1 = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), boresight);
  // North-perpendicular reference for roll=0.
  const ncp = new THREE.Vector3(0, 0, 1);
  let northPerp = ncp.clone().sub(boresight.clone().multiplyScalar(ncp.dot(boresight)));
  if (northPerp.lengthSq() < 1e-8) northPerp.set(0, 1, 0);
  else northPerp.normalize();

  // After q1, +Z_SC is an arbitrary in-plane reference; rotate it to northPerp.
  const zRefAfterQ1 = new THREE.Vector3(0, 0, 1).applyQuaternion(q1);
  const angle0 = Math.atan2(
    boresight.dot(zRefAfterQ1.clone().cross(northPerp)),
    zRefAfterQ1.dot(northPerp),
  );
  const q2 = new THREE.Quaternion().setFromAxisAngle(boresight, angle0);

  // Apply commanded roll as negative about boresight (+X_SC).
  const q3 = new THREE.Quaternion().setFromAxisAngle(boresight, -roll * DEG);
  return q3.multiply(q2).multiply(q1);
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
  const boresight = radec2eci(ra, dec).normalize();
  const ncp = new THREE.Vector3(0, 0, 1);
  let northPerp = ncp.clone().sub(boresight.clone().multiplyScalar(ncp.dot(boresight)));
  if (northPerp.lengthSq() < 1e-8) northPerp.set(0, 1, 0);
  else northPerp.normalize();
  const eastPerp = boresight.clone().cross(northPerp).normalize();
  const zSCinECI = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyQ).normalize();
  const ang = Math.atan2(zSCinECI.dot(eastPerp), zSCinECI.dot(northPerp)) / DEG;
  return wrap180(-ang);
}
