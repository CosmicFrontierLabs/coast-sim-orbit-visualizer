import * as THREE from "three";

/**
 * Compute area-weighted mesh normal in mesh-local coordinates.
 *
 * @param {THREE.Mesh} mesh
 * @returns {{area:number, normal:THREE.Vector3}}
 */
export function meshAreaAndNormalLocal(mesh: THREE.Mesh): { area: number; normal: THREE.Vector3 } {
  if (!mesh || !mesh.isMesh || !mesh.geometry) {
    return { area: 0, normal: new THREE.Vector3(0, 1, 0) };
  }

  const pos = mesh.geometry.getAttribute("position");
  if (!pos) return { area: 0, normal: new THREE.Vector3(0, 1, 0) };

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const triN = new THREE.Vector3();
  const nSum = new THREE.Vector3();
  let area2 = 0;

  const addTri = (i0: number, i1: number, i2: number): void => {
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    triN.crossVectors(e1, e2);
    const m = triN.length();
    if (m < 1e-16) return;
    if (nSum.lengthSq() > 0 && triN.dot(nSum) < 0) triN.negate();
    nSum.add(triN);
    area2 += m;
  };

  const idx = mesh.geometry.getIndex();
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      addTri(idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
    }
  } else {
    for (let i = 0; i + 2 < pos.count; i += 3) {
      addTri(i, i + 1, i + 2);
    }
  }

  if (nSum.lengthSq() < 1e-12) {
    return { area: 0, normal: new THREE.Vector3(0, 1, 0) };
  }
  return { area: area2 * 0.5, normal: nSum.normalize() };
}

/**
 * Estimate the aggregate panel face normal in `parentGroup` coordinates.
 *
 * @param {THREE.Mesh[]} meshes
 * @param {THREE.Object3D} parentGroup
 * @returns {THREE.Vector3}
 */
export function estimatePanelFaceNormalModel(meshes: THREE.Mesh[], parentGroup: THREE.Object3D): THREE.Vector3 {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const triN = new THREE.Vector3();
  const nSum = new THREE.Vector3();

  const addTri = (
    m: THREE.Mesh,
    pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
    i0: number,
    i1: number,
    i2: number,
  ): void => {
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    m.localToWorld(a);
    m.localToWorld(b);
    m.localToWorld(c);
    parentGroup.worldToLocal(a);
    parentGroup.worldToLocal(b);
    parentGroup.worldToLocal(c);
    e1.subVectors(b, a);
    e2.subVectors(c, a);
    triN.crossVectors(e1, e2);
    if (triN.lengthSq() < 1e-16) return;
    if (nSum.lengthSq() > 0 && triN.dot(nSum) < 0) triN.negate();
    nSum.add(triN);
  };

  for (const m of meshes) {
    if (!m.isMesh || !m.geometry) continue;
    const pos = m.geometry.getAttribute("position");
    if (!pos) continue;
    m.updateWorldMatrix(true, false);

    const idx = m.geometry.getIndex();
    if (idx) {
      for (let i = 0; i < idx.count; i += 3) {
        addTri(m, pos, idx.getX(i), idx.getX(i + 1), idx.getX(i + 2));
      }
    } else {
      for (let i = 0; i + 2 < pos.count; i += 3) {
        addTri(m, pos, i, i + 1, i + 2);
      }
    }
  }

  if (nSum.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0);
  return nSum.normalize();
}

/**
 * Compute panel drive quaternion in spacecraft coordinates.
 *
 * @param {THREE.Quaternion} bodyQ Spacecraft body orientation in ECI.
 * @param {THREE.Vector3} sunECI Sun unit vector in ECI.
 * @returns {THREE.Quaternion}
 */
export function panelDriveSCQ(bodyQ: THREE.Quaternion, sunECI: THREE.Vector3): THREE.Quaternion {
  const sunSC = sunECI.clone().applyQuaternion(bodyQ.clone().conjugate());
  sunSC.y = 0;
  if (sunSC.lengthSq() < 1e-8) return new THREE.Quaternion();
  sunSC.normalize();
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), sunSC);
}

/**
 * Compute model-space panel rotation that best aligns panel normal to sun.
 *
 * @param {Object} deps
 * @returns {{qPanelModel: THREE.Quaternion, panelAlignErrDeg:number}}
 */
export function panelDriveModelQ({
  bodyQ,
  sunECI,
  preQ,
  panelFaceNormalModel,
  panelMeshTrimDeg,
  DEG,
}: {
  bodyQ: THREE.Quaternion;
  sunECI: THREE.Vector3;
  preQ: THREE.Quaternion;
  panelFaceNormalModel: THREE.Vector3;
  panelMeshTrimDeg: number;
  DEG: number;
}): { qPanelModel: THREE.Quaternion; panelAlignErrDeg: number } {
  const qSC = panelDriveSCQ(bodyQ, sunECI);
  const qModelDrive = preQ.clone().conjugate().multiply(qSC).multiply(preQ);

  const qTrimSC = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    panelMeshTrimDeg * DEG,
  );
  const qModelTrim = preQ.clone().conjugate().multiply(qTrimSC).multiply(preQ);

  const refNormalModel = new THREE.Vector3(0, 0, 1).applyQuaternion(preQ.clone().conjugate());
  const qCal = new THREE.Quaternion().setFromUnitVectors(panelFaceNormalModel, refNormalModel);

  const qBaseModel = qModelDrive.multiply(qModelTrim).multiply(qCal);

  const ySC = new THREE.Vector3(0, 1, 0);
  const desiredSC = new THREE.Vector3(0, 0, 1).applyQuaternion(qSC).normalize();
  const currentSC = panelFaceNormalModel
    .clone()
    .applyQuaternion(qBaseModel)
    .applyQuaternion(preQ)
    .normalize();
  desiredSC.y = 0;
  currentSC.y = 0;

  if (desiredSC.lengthSq() < 1e-10 || currentSC.lengthSq() < 1e-10) {
    return { qPanelModel: qBaseModel, panelAlignErrDeg: 0 };
  }

  desiredSC.normalize();
  currentSC.normalize();
  const errRad = Math.atan2(ySC.dot(currentSC.clone().cross(desiredSC)), currentSC.dot(desiredSC));

  const qCorrSC = new THREE.Quaternion().setFromAxisAngle(ySC, errRad);
  const qCorrModel = preQ.clone().conjugate().multiply(qCorrSC).multiply(preQ);
  return {
    qPanelModel: qCorrModel.multiply(qBaseModel),
    panelAlignErrDeg: errRad / DEG,
  };
}
