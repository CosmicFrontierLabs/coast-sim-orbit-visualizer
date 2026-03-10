import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  ATM_RADIUS,
  CAMERA_FAR_PAD,
  CAMERA_MIN_FAR,
  CAMERA_NEAR_FRAC,
  CLOUD_RADIUS,
  DEG,
  LINK_SIZE_WU,
  MOON_EPOCH_UNIX,
  MOON_INCLINATION_RAD,
  MOON_NODE_RAD,
  MOON_ORBIT_PERIOD_S,
  MOON_ORBIT_RADIUS_WU,
  MOON_RADIUS_WU,
  RE_KM,
  SC_AXIS_SHAFT_LEN,
  SC_HEAD_LEN,
  SC_HEAD_W,
  SC_SUN_VEC_SHAFT_LEN,
  SC_VEL_SHAFT_LEN,
  SC_DIAG_WU,
} from "./constants";

/**
 * Compute simplified moon ECI position at a Unix timestamp.
 *
 * @param {number} unix Unix time (seconds).
 * @returns {THREE.Vector3}
 */
export function moonPositionECI(unix: number): THREE.Vector3 {
  const theta = 2 * Math.PI * ((unix - MOON_EPOCH_UNIX) / MOON_ORBIT_PERIOD_S);
  const v = new THREE.Vector3(
    MOON_ORBIT_RADIUS_WU * Math.cos(theta),
    MOON_ORBIT_RADIUS_WU * Math.sin(theta),
    0,
  );
  v.applyAxisAngle(new THREE.Vector3(0, 0, 1), MOON_NODE_RAD);
  v.applyAxisAngle(new THREE.Vector3(1, 0, 0), MOON_INCLINATION_RAD);
  return v;
}

/**
 * Build renderer, camera, scene graph, and runtime helpers for visualization.
 *
 * @param {{assetBase: string}} deps
 * @returns {Object}
 */
export function createSceneGraph({ assetBase }: { assetBase: string }) {
  const mustEl = <T extends HTMLElement>(id: string): T => {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`Missing required element: #${id}`);
    }
    return el as T;
  };

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mustEl<HTMLElement>("container").prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x00000a);

  // Stars
  (function addStars() {
    const N = 8000;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const theta = Math.random() * 2 * Math.PI;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 200 + Math.random() * 100;
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    scene.add(
      new THREE.Points(
        g,
        new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.15,
          sizeAttenuation: true,
        }),
      ),
    );
  })();

  const camera = new THREE.PerspectiveCamera(
    45,
    innerWidth / innerHeight,
    Math.max(1e-8, SC_DIAG_WU / 20),
    400,
  );
  camera.position.set(0, 0, 4);
  camera.up.set(0, 1, 0);

  const orbitCtl = new OrbitControls(camera, renderer.domElement);
  orbitCtl.enableDamping = true;
  orbitCtl.dampingFactor = 0.07;
  orbitCtl.minDistance = Math.max(1e-9, SC_DIAG_WU / 20);
  orbitCtl.maxDistance = 50;

  function updateCameraClipping() {
    const d = camera.position.distanceTo(orbitCtl.target);
    const near = Math.max(SC_DIAG_WU * 0.05, d * CAMERA_NEAR_FRAC, 1e-8);
    const far = Math.max(CAMERA_MIN_FAR, d + CAMERA_FAR_PAD);
    if (Math.abs(camera.near - near) > 1e-10 || Math.abs(camera.far - far) > 1e-6) {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }

  scene.add(new THREE.AmbientLight(0x4466aa, 1.5));
  const sunLight = new THREE.DirectionalLight(0xfff5e0, 3.5);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 300;
  sunLight.shadow.camera.left = sunLight.shadow.camera.bottom = -3;
  sunLight.shadow.camera.right = sunLight.shadow.camera.top = 3;
  scene.add(sunLight);
  const earthLightTarget = new THREE.Object3D();
  earthLightTarget.position.set(0, 0, 0);
  scene.add(earthLightTarget);
  sunLight.target = earthLightTarget;

  const texLoader = new THREE.TextureLoader();
  const earthTex = texLoader.load(assetBase + "textures/earth_day.jpg");
  const earthNormTex = texLoader.load(assetBase + "textures/earth_normal.jpg");
  const earthCloudTex = texLoader.load(assetBase + "textures/earth_clouds.png");
  earthTex.colorSpace = THREE.SRGBColorSpace;

  const earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 64),
    new THREE.MeshStandardMaterial({
      map: earthTex,
      normalMap: earthNormTex,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: 1.0,
      metalness: 0.0,
      emissive: new THREE.Color(0x000000),
    }),
  );
  earthMesh.receiveShadow = true;
  earthMesh.renderOrder = 1;
  scene.add(earthMesh);

  const cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(CLOUD_RADIUS, 64, 64),
    new THREE.MeshPhongMaterial({
      map: earthCloudTex,
      transparent: true,
      opacity: 0.72,
      alphaTest: 0.02,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      blending: THREE.NormalBlending,
    }),
  );
  cloudMesh.rotation.x = 0;
  cloudMesh.renderOrder = 2;
  scene.add(cloudMesh);

  const atmosphereMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos    = worldPos.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position  = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uCameraPos;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vec3  viewDir  = normalize(uCameraPos - vWorldPos);
        float rim      = 1.0 - max(0.0, dot(viewDir, vWorldNormal));
        rim = pow(rim, 3.2);
        float sunDot   = dot(normalize(vWorldPos), uSunDir);
        float sunFactor = smoothstep(-0.3, 0.6, sunDot);
        vec3  dayColor  = vec3(0.12, 0.45, 1.00);
        vec3  duskColor = vec3(0.08, 0.20, 0.60);
        vec3  col       = mix(duskColor, dayColor, sunFactor);
        float alpha     = rim * (0.20 + 0.35 * sunFactor);
        gl_FragColor    = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
  });
  const atmosphereMesh = new THREE.Mesh(
    new THREE.SphereGeometry(ATM_RADIUS, 64, 64),
    atmosphereMat,
  );
  atmosphereMesh.renderOrder = 3;
  scene.add(atmosphereMesh);

  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(MOON_RADIUS_WU, 40, 40),
    new THREE.MeshPhongMaterial({
      color: 0xbabec6,
      emissive: new THREE.Color(0x080808),
      shininess: 4,
    }),
  );
  moonMesh.castShadow = true;
  moonMesh.receiveShadow = true;
  moonMesh.renderOrder = 1;
  scene.add(moonMesh);

  const gridHelper = new THREE.GridHelper(8, 16, 0x112244, 0x111e33);
  gridHelper.rotation.x = Math.PI / 2;
  gridHelper.visible = false;
  scene.add(gridHelper);
  mustEl<HTMLInputElement>("show-grid").addEventListener("change", (e: Event) => {
    gridHelper.visible = (e.target as HTMLInputElement).checked;
  });

  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffee44 }),
  );
  scene.add(sunMesh);
  const sunHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.18,
      side: THREE.BackSide,
    }),
  );
  scene.add(sunHalo);

  const sunRayBuf = new Float32Array(6);
  const sunRayGeo = new THREE.BufferGeometry();
  sunRayGeo.setAttribute("position", new THREE.BufferAttribute(sunRayBuf, 3));
  const sunRayLine = new THREE.Line(
    sunRayGeo,
    new THREE.LineBasicMaterial({
      color: 0xffdd00,
      transparent: true,
      opacity: 0.22,
    }),
  );
  scene.add(sunRayLine);

  const scGroup = new THREE.Group();
  scene.add(scGroup);
  const modelGroup = new THREE.Group();
  scGroup.add(modelGroup);
  const panelMeshGroup = new THREE.Group();
  modelGroup.add(panelMeshGroup);

  const linkGroup = new THREE.Group();
  scene.add(linkGroup);
  const linkMesh = new THREE.Mesh(
    new THREE.SphereGeometry(LINK_SIZE_WU * 0.5, 12, 12),
    new THREE.MeshPhongMaterial({
      color: 0x55ccff,
      emissive: 0x113355,
      shininess: 20,
    }),
  );
  linkGroup.add(linkMesh);

  const fallback = new THREE.Mesh(
    new THREE.BoxGeometry(2.0 / (RE_KM * 1000), 6.0 / (RE_KM * 1000), 2.5 / (RE_KM * 1000)),
    new THREE.MeshPhongMaterial({ color: 0xaaaaaa }),
  );
  modelGroup.add(fallback);

  const _VEC_UP = new THREE.Vector3(0, 1, 0);
  function makeVector(color: number, shaftLen: number): THREE.Group {
    const group = new THREE.Group();
    const shaft = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, shaftLen, 0),
      ]),
      new THREE.LineBasicMaterial({ color }),
    );
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(SC_HEAD_W, SC_HEAD_LEN, 14),
      new THREE.MeshBasicMaterial({ color }),
    );
    head.position.y = shaftLen + SC_HEAD_LEN * 0.5;
    group.add(shaft, head);
    return group;
  }

  function orientVector(vecObj: THREE.Object3D, dir: THREE.Vector3): void {
    const d = dir.clone();
    if (d.lengthSq() < 1e-12) return;
    d.normalize();
    vecObj.quaternion.setFromUnitVectors(_VEC_UP, d);
  }

  function setVector(vecObj: THREE.Object3D, origin: THREE.Vector3, dir: THREE.Vector3): void {
    vecObj.position.copy(origin);
    orientVector(vecObj, dir);
  }

  const axX = makeVector(0xff8800, SC_AXIS_SHAFT_LEN);
  const axY = makeVector(0x00ee44, SC_AXIS_SHAFT_LEN);
  const axZ = makeVector(0x4488ff, SC_AXIS_SHAFT_LEN);
  orientVector(axX, new THREE.Vector3(1, 0, 0));
  orientVector(axY, new THREE.Vector3(0, 1, 0));
  orientVector(axZ, new THREE.Vector3(0, 0, 1));
  scGroup.add(axX, axY, axZ);
  const panelGroup = new THREE.Group();
  scGroup.add(panelGroup);
  const axPanel = makeVector(0xffee00, SC_AXIS_SHAFT_LEN);
  orientVector(axPanel, new THREE.Vector3(0, 0, 1));
  panelGroup.add(axPanel);
  const axVel = makeVector(0xff2222, SC_VEL_SHAFT_LEN);
  scene.add(axVel);
  const axScSun = makeVector(0xffee88, SC_SUN_VEC_SHAFT_LEN);
  axScSun.visible = false;
  scene.add(axScSun);

  mustEl<HTMLInputElement>("show-axes").addEventListener("change", (e: Event) => {
    axX.visible =
      axY.visible =
      axZ.visible =
      axPanel.visible =
      axVel.visible =
        (e.target as HTMLInputElement).checked;
  });
  mustEl<HTMLInputElement>("show-sc-sun").addEventListener("change", (e: Event) => {
    axScSun.visible = (e.target as HTMLInputElement).checked;
  });

  return {
    renderer,
    scene,
    camera,
    orbitCtl,
    updateCameraClipping,
    atmosphereMat,
    earthMesh,
    cloudMesh,
    moonMesh,
    sunMesh,
    sunHalo,
    sunLight,
    sunRayBuf,
    sunRayGeo,
    sunRayLine,
    scGroup,
    modelGroup,
    panelMeshGroup,
    linkGroup,
    fallback,
    panelGroup,
    axVel,
    axScSun,
    setVector,
  };
}
