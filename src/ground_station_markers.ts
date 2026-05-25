import * as THREE from "three";
import type { GroundStationMeta, PPSTEntry } from "./types";

interface StationMarker {
  station: GroundStationMeta;
  group: THREE.Group;
  reticle: THREE.Group;
  reticleMeshes: Array<THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>>;
  label: THREE.Sprite;
}

export interface GroundStationMarkerController {
  setStations: (stations: GroundStationMeta[], entries: PPSTEntry[]) => void;
  update: (simTime: number, entries: PPSTEntry[]) => void;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

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

function makeMarker(station: GroundStationMeta): StationMarker {
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

  const pos = geodeticToEarthMeshLocal(station, 1.0015);
  const normal = pos.clone().normalize();
  group.position.copy(pos);
  reticle.quaternion.setFromUnitVectors(Z_AXIS, normal);
  label.position.copy(normal).multiplyScalar(0.042);
  label.scale.set(0.11, 0.041, 1);

  group.add(reticle, label);
  return { station, group, reticle, reticleMeshes, label };
}

export function createGroundStationMarkerController({
  earthMesh,
}: {
  earthMesh: THREE.Object3D;
}): GroundStationMarkerController {
  const markers: StationMarker[] = [];

  function setStations(stations: GroundStationMeta[], entries: PPSTEntry[]): void {
    for (const marker of markers) {
      earthMesh.remove(marker.group);
      for (const mesh of marker.reticleMeshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      marker.label.material.map?.dispose();
      marker.label.material.dispose();
    }
    markers.length = 0;

    const configuredCodes = configuredGspStationCodes(entries);
    for (const station of stations.filter(isFiniteStation)) {
      if (!configuredCodes.has(stationCode(station))) continue;
      const marker = makeMarker(station);
      markers.push(marker);
      earthMesh.add(marker.group);
    }
  }

  function update(simTime: number, entries: PPSTEntry[]): void {
    for (const marker of markers) {
      const active = isActiveForStation(stationCode(marker.station), simTime, entries);

      for (const mesh of marker.reticleMeshes) {
        mesh.material.color.setHex(active ? 0xfff0a3 : 0xd6f5ff);
        mesh.material.opacity = active ? 0.9 : 0.5;
      }
      marker.reticle.scale.setScalar(active ? 1.18 : 1.0);
      marker.label.material.opacity = active ? 0.92 : 0.58;
    }
  }

  return { setStations, update };
}
