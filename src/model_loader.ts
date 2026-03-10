import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";

/**
 * Load the Swift GLB model, apply normalization/calibration, and publish panel state.
 *
 * @param {Object} deps
 * @returns {void}
 */
export function loadSwiftModel({
  assetBase,
  modelGroup,
  panelMeshGroup,
  fallback,
  swiftDiagWu,
  setLoading,
  clearLoading,
  meshAreaAndNormalLocal,
  estimatePanelFaceNormalModel,
  onPanelState,
}: {
  assetBase: string;
  modelGroup: THREE.Group;
  panelMeshGroup: THREE.Group;
  fallback: THREE.Object3D;
  swiftDiagWu: number;
  setLoading: (msg: string) => void;
  clearLoading: () => void;
  meshAreaAndNormalLocal: (mesh: THREE.Mesh) => { area: number; normal: THREE.Vector3 };
  estimatePanelFaceNormalModel: (meshes: THREE.Mesh[], parentGroup: THREE.Object3D) => THREE.Vector3;
  onPanelState: (state: {
    panelFaceNormalModel: THREE.Vector3;
    panelRefMesh: THREE.Mesh | null;
    panelRefNormalLocal: THREE.Vector3;
  }) => void;
}): void {
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://unpkg.com/three@0.158.0/examples/jsm/libs/draco/");
  const gltfLoaderDraco = new GLTFLoader();
  gltfLoaderDraco.setDRACOLoader(dracoLoader);
  const gltfLoaderPlain = new GLTFLoader();

  const candidateUrls = [assetBase + "model/Swift.glb", assetBase + "model/swift.glb"];
  const attempts: Array<{ loader: GLTFLoader; url: string; label: string }> = [];
  candidateUrls.forEach((url) => {
    attempts.push({ loader: gltfLoaderDraco, url, label: "draco" });
    attempts.push({ loader: gltfLoaderPlain, url, label: "plain" });
  });

  function applyLoadedModel(gltf: GLTF): void {
    modelGroup.remove(fallback);
    const model = gltf.scene;

    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      // The GLB has inverted normals — flip so sunLight illuminates correctly.
      const normals = child.geometry.getAttribute("normal") as THREE.BufferAttribute | undefined;
      if (normals) {
        for (let i = 0; i < normals.count; i++) {
          normals.setXYZ(i, -normals.getX(i), -normals.getY(i), -normals.getZ(i));
        }
        normals.needsUpdate = true;
      }

      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (!mat) return;
        mat.side = THREE.FrontSide;
        if (mat.emissive) mat.emissive.set(0x000000);
        if (mat.roughness !== undefined) {
          mat.roughness = Math.max(mat.roughness, 0.5);
        }
        mat.needsUpdate = true;
      });
    });

    const box = new THREE.Box3().setFromObject(model);
    const sz = box.getSize(new THREE.Vector3()).length();
    if (sz > 0) {
      const s = swiftDiagWu / sz;
      model.scale.setScalar(s);
      const ctr = box.getCenter(new THREE.Vector3());
      model.position.set(-ctr.x * s, -ctr.y * s, -ctr.z * s);
    }
    modelGroup.add(model);

    model.updateWorldMatrix(true, true);
    const panelMats = /solar/i;
    const toReparent: THREE.Mesh[] = [];
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      if (mats.some((m) => m && panelMats.test(m.name))) {
        toReparent.push(child);
      }
    });
    toReparent.forEach((m) => panelMeshGroup.attach(m));

    let best: THREE.Mesh | null = null;
    let bestArea = -1;
    let bestLocalN = new THREE.Vector3(0, 1, 0);
    for (const m of toReparent) {
      const { area, normal } = meshAreaAndNormalLocal(m);
      if (area > bestArea) {
        bestArea = area;
        best = m;
        bestLocalN = normal.clone();
      }
    }

    let panelFaceNormalModel = estimatePanelFaceNormalModel(toReparent, panelMeshGroup);
    if (best !== null) {
      best.updateWorldMatrix(true, false);
      const qMeshWorld = new THREE.Quaternion();
      const qParentWorld = new THREE.Quaternion();
      best.getWorldQuaternion(qMeshWorld);
      panelMeshGroup.getWorldQuaternion(qParentWorld);
      panelFaceNormalModel = bestLocalN
        .clone()
        .applyQuaternion(qMeshWorld)
        .applyQuaternion(qParentWorld.clone().conjugate())
        .normalize();
    }

    console.log(`Solar panel meshes found: ${toReparent.length}`);
    console.log("Estimated panel face normal (model space):", panelFaceNormalModel.toArray());

    onPanelState({
      panelFaceNormalModel,
      panelRefMesh: best,
      panelRefNormalLocal: bestLocalN,
    });
    clearLoading();
  }

  function tryAttempt(idx: number): void {
    if (idx >= attempts.length) {
      console.warn("GLB load failed for all attempts, using fallback box");
      clearLoading();
      return;
    }

    const { loader, url, label } = attempts[idx];
    loader.load(
      url,
      (gltf: GLTF) => applyLoadedModel(gltf),
      (p: ProgressEvent<EventTarget>) => {
        const pct = p.total ? Math.round((100 * p.loaded) / p.total) : "…";
        setLoading(`Loading Swift.glb (${label})… ${pct}%`);
      },
      (err: unknown) => {
        console.warn(`GLB load attempt failed [${label}] ${url}`, err);
        tryAttempt(idx + 1);
      },
    );
  }

  tryAttempt(0);
}
