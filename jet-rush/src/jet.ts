import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { C } from "./config";

export interface JetModel {
  group: THREE.Group;
  body: THREE.Group;
}

/** Shared textures loaded once. */
let baseTexture: THREE.Texture | null = null;
let emissiveTexture: THREE.Texture | null = null;

function ensureTextures(): { base: THREE.Texture; emissive: THREE.Texture } {
  if (!baseTexture || !emissiveTexture) {
    const tl = new THREE.TextureLoader();
    baseTexture = tl.load("assets/textures/PolygonSciFiSpace_Texture_01_A.png");
    emissiveTexture = tl.load("assets/textures/PolygonSciFiSpace_Emissive_01.png");
    baseTexture.colorSpace = THREE.SRGBColorSpace;
    baseTexture.flipY = false;
    emissiveTexture.flipY = false;
  }
  return { base: baseTexture, emissive: emissiveTexture };
}

/** Builds the jet plane model and returns the outer group + inner body group. */
export function createJet(scene: THREE.Scene, modelPath?: string): JetModel {
  const group = new THREE.Group();
  const body = new THREE.Group();

  const placeholderMat = new THREE.MeshStandardMaterial({
    color: 0x2288ff, roughness: 0.3, metalness: 0.7,
    emissive: 0x1155cc, emissiveIntensity: 0.25,
    transparent: true, opacity: 0,
  });
  const placeholder = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.1),
    placeholderMat,
  );
  placeholder.name = "placeholder";
  body.add(placeholder);

  loadShipFBX(body, modelPath || "assets/models/SM_Ship_Fighter_01.fbx");

  body.scale.setScalar(0.85);
  group.add(body);
  group.position.set(0, C.PLANE_Y, 0);
  scene.add(group);

  return { group, body };
}

/** Loads (or swaps) the FBX ship model into the body group. */
export function loadShipFBX(body: THREE.Group, modelPath: string): void {
  const old = body.getObjectByName("shipModel");
  if (old) {
    body.remove(old);
    old.traverse((child) => {
      const m = child as THREE.Mesh & { geometry?: THREE.BufferGeometry };
      if (m.geometry) m.geometry.dispose();
    });
  }

  const { base, emissive } = ensureTextures();
  const loader = new FBXLoader();
  loader.load(
    modelPath,
    (fbx) => {
      console.log("[loadShipFBX]", modelPath);

      const shipMat = new THREE.MeshStandardMaterial({
        map: base,
        emissiveMap: emissive,
        emissive: 0xffffff,
        emissiveIntensity: 2.0,
        roughness: 0.4,
        metalness: 0.6,
      });

      fbx.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          (child as THREE.Mesh).material = shipMat;
        }
      });

      fbx.scale.setScalar(C.PLANE_SCALE);
      fbx.rotation.set(0, Math.PI, 0);
      fbx.position.set(0, -0.3, 0);
      fbx.name = "shipModel";

      const ph = body.getObjectByName("placeholder");
      if (ph) body.remove(ph);
      body.add(fbx);
    },
    undefined,
    (err) => console.error("[loadShipFBX] Error:", err),
  );
}

/** Animates engine glow and exhaust based on elapsed time. */
export function updateJetFX(body: THREE.Group, elapsed: number): void {
  const glow = body.getObjectByName("glow") as THREE.Mesh | undefined;
  if (glow) {
    glow.scale.setScalar(1 + Math.sin(elapsed * 8) * 0.3);
    (glow.material as THREE.MeshBasicMaterial).opacity =
      0.6 + Math.sin(elapsed * 6) * 0.25;
  }

  const exh = body.getObjectByName("exh") as THREE.Mesh | undefined;
  if (exh) {
    exh.scale.set(1, 1, 0.7 + Math.sin(elapsed * 12) * 0.4);
  }
}
