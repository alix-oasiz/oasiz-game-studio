import * as THREE from "three";
import {
  MAP_RADIUS,
  BOARD_COLOR,
  BG_COLOR,
  GRID_LINE_COLOR,
  TRAIL_OPACITY,
  type Vec2,
} from "./constants.ts";
import { debugLog } from "./debug-log.ts";
import { type TerritoryGrid } from "./Territory.ts";
import { type TerritoryMultiPolygon } from "./polygon-ops.ts";

const TERRITORY_Y = 0.03;
const TERRITORY_HEIGHT = 0.24;
const TRAIL_Y = 0.022;
const CELL_SIZE = 0.1;
const BORDER_WIDTH = 1.0;
const PATTERN_TILE = 5.0;
const TAKEOVER_DURATION = 0.7;
const TAKEOVER_WAVE_WIDTH = 1.8;
const EXTRUDE_CURVE_SEGMENTS = 8;
const TERRITORY_DEPTH_LAYERS = 3;
const TERRITORY_DEPTH_OFFSET_X = -0.07;
const TERRITORY_DEPTH_OFFSET_Z = 0.14;
const TERRITORY_DEPTH_DROP = 0.02;
const LOOP_POINT_SCALE = 1000;
const LOOP_MIN_AREA = CELL_SIZE * CELL_SIZE * 6;
const LOOP_MIN_DIST = CELL_SIZE * 0.16;

interface TerritoryTakeoverEffect {
  victimId: number;
  mesh: THREE.Mesh;
  material: THREE.Material;
  startMs: number;
  durationMs: number;
  maxRadius: number;
  uniforms: {
    rippleOrigin: { value: THREE.Vector2 };
    rippleRadius: { value: number };
    rippleWidth: { value: number };
    rippleColor: { value: THREE.Color };
  };
}

interface ContourSegment {
  a: Vec2;
  b: Vec2;
}

interface ShapeBuildResult {
  shapes: THREE.Shape[];
  outerLoops: Vec2[][];
}

interface TerritoryMaterialSet {
  top: THREE.MeshPhongMaterial;
  depth: THREE.MeshPhongMaterial;
  band: THREE.MeshPhongMaterial;
}

export class Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  private territoryObjects: Map<number, THREE.Mesh> = new Map();
  private territoryDepthLayers: Map<number, THREE.Mesh[]> = new Map();
  private territorySideBands: Map<number, THREE.Mesh> = new Map();
  private territoryShadows: Map<number, THREE.Mesh> = new Map();
  private territoryContactShadows: Map<number, THREE.Mesh> = new Map();
  private territoryMaterials: Map<number, TerritoryMaterialSet> = new Map();
  private territorySkinIds: Map<number, string> = new Map();
  private patternTextures: Map<string, THREE.Texture | null> = new Map();
  private shadowMaterial: THREE.MeshBasicMaterial | null = null;
  private contactShadowMaterial: THREE.MeshBasicMaterial | null = null;
  private trailMeshes: Map<number, THREE.Mesh> = new Map();
  private trailMaterials: Map<number, THREE.MeshLambertMaterial> = new Map();
  private trailLengths: Map<number, number> = new Map();
  private trailCapLogged: Set<number> = new Set();
  private trailEarlyReturnLogged: Set<number> = new Set();
  private avatars: Map<number, THREE.Group> = new Map();
  private avatarLastPositions: Map<number, Vec2> = new Map();
  private territoryTakeovers: TerritoryTakeoverEffect[] = [];

  private cameraTarget: Vec2 = { x: 0, z: 0 };
  private territoryRenderOrder = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);

    const wrapper = document.getElementById("game-wrapper")!;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
    this.camera.position.set(0, 20, 12.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.createBoard();
    this.createLighting();

    window.addEventListener("resize", () => this.onResize());
  }

  private createBoard(): void {
    const boardGeo = new THREE.CircleGeometry(MAP_RADIUS, 48);
    const boardMat = new THREE.MeshBasicMaterial({ color: BOARD_COLOR });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.rotation.x = -Math.PI / 2;
    this.scene.add(board);
  }

  private createLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(-15, 50, 20);
    dir.target.position.set(0, 0, 0);
    this.scene.add(dir.target);
    dir.castShadow = true;
    dir.shadow.mapSize.width = 2048;
    dir.shadow.mapSize.height = 2048;
    dir.shadow.intensity = 0.15;
    const d = MAP_RADIUS + 5;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 120;
    dir.shadow.bias = -0.0001;
    this.scene.add(dir);

    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(15, 30, -10);
    this.scene.add(fill);
  }

  createAvatar(
    id: number,
    color: number,
    name?: string,
    texture?: THREE.Texture | null,
    model?: THREE.Group | null,
  ): THREE.Group {
    const group = new THREE.Group();

    if (model && model.children.length > 0) {
      const clone = model.clone(true);
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          child.material = (child.material as THREE.Material).clone();
        }
      });
      clone.name = "model-body";
      this.setupAnimatedBody(clone, "model");
      group.add(clone);
    } else {
      const bodyGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
      let bodyMat: THREE.Material;
      if (texture) {
        bodyMat = new THREE.MeshLambertMaterial({ map: texture });
      } else {
        bodyMat = new THREE.MeshLambertMaterial({ color });
      }
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.35;
      body.name = "box-body";
      this.setupAnimatedBody(body, "cube");
      group.add(body);
    }

    const ringGeo = new THREE.TorusGeometry(0.45, 0.04, 6, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
    });
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.4;
    ring.name = "ring";
    group.add(ring);

    if (name) {
      const label = this.createTextSprite(name);
      label.position.y = 1.1;
      label.name = "label";
      group.add(label);
    }

    this.scene.add(group);
    this.avatars.set(id, group);
    return group;
  }

  replaceAvatarBody(id: number, model: THREE.Group): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;

    const oldBody = avatar.children.find(
      (c) => c.name === "box-body" || c.name === "model-body",
    );
    if (oldBody) {
      avatar.remove(oldBody);
      if (oldBody instanceof THREE.Mesh) {
        oldBody.geometry.dispose();
        if (oldBody.material instanceof THREE.Material)
          oldBody.material.dispose();
      }
    }

    const clone = model.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        child.material = (child.material as THREE.Material).clone();
      }
    });
    clone.name = "model-body";
    this.setupAnimatedBody(clone, "model");
    avatar.add(clone);
  }

  private setupAnimatedBody(
    body: THREE.Object3D,
    kind: "cube" | "model",
  ): void {
    body.userData.basePosition = body.position.clone();
    body.userData.baseRotation = body.rotation.clone();
    body.userData.baseScale = body.scale.clone();
    body.userData.animationKind = kind;
  }

  private createTextSprite(text: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = 256;
    canvas.height = 64;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "600 36px Quicksand, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Shadow for readability
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillText(text, canvas.width / 2 + 1, canvas.height / 2 + 1);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2, 0.5, 1);
    return sprite;
  }

  updateAvatar(id: number, pos: Vec2, time: number, moveDir?: Vec2): void {
    const avatar = this.avatars.get(id);
    if (!avatar || !avatar.visible) return;

    const prevPos = this.avatarLastPositions.get(id);
    const moveDx = prevPos ? pos.x - prevPos.x : 0;
    const moveDz = prevPos ? pos.z - prevPos.z : 0;
    const moveBlend = Math.min(
      Math.sqrt(moveDx * moveDx + moveDz * moveDz) * 10,
      1,
    );
    this.avatarLastPositions.set(id, { x: pos.x, z: pos.z });

    avatar.position.x = pos.x;
    avatar.position.z = pos.z;

    let turnDelta = 0;
    if (moveDir && (moveDir.x !== 0 || moveDir.z !== 0)) {
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      let current = avatar.rotation.y;
      let delta = targetAngle - current;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      turnDelta = delta;
      avatar.rotation.y = current + delta * 0.25;
    }

    const body =
      avatar.getObjectByName("box-body") ??
      avatar.getObjectByName("model-body");
    if (body) {
      const basePosition = body.userData.basePosition as
        | THREE.Vector3
        | undefined;
      const baseRotation = body.userData.baseRotation as
        | THREE.Euler
        | undefined;
      const baseScale = body.userData.baseScale as THREE.Vector3 | undefined;
      if (basePosition && baseRotation && baseScale) {
        const isModel = body.userData.animationKind === "model";
        const bobSpeed = isModel ? 9 : 11;
        const bobAmount = isModel ? 0.05 : 0.09;
        const turnAmount = Math.max(-1, Math.min(1, turnDelta / 0.65));
        const leanAmount = isModel ? 0.16 : 0.28;
        const pitchAmount = isModel ? 0.075 : 0.13;
        const swayAmount = isModel ? 0.04 : 0.08;
        const settle = 0.24;

        const targetX = basePosition.x - turnAmount * swayAmount;
        const targetY =
          basePosition.y +
          Math.sin(time * bobSpeed * Math.PI * 2) * bobAmount * moveBlend;
        const targetRotX =
          baseRotation.x +
          moveBlend * pitchAmount +
          Math.sin(time * bobSpeed * Math.PI * 2 + Math.PI / 2) *
            bobAmount *
            0.35 *
            moveBlend;
        const targetRotZ = baseRotation.z - turnAmount * leanAmount;
        const targetScaleX =
          baseScale.x *
          (1 +
            moveBlend * (isModel ? 0.04 : 0.08) +
            Math.abs(turnAmount) * 0.04);
        const targetScaleY =
          baseScale.y *
          Math.max(
            0.82,
            1 -
              moveBlend * (isModel ? 0.06 : 0.12) -
              Math.abs(turnAmount) * 0.07,
          );
        const targetScaleZ = targetScaleX;

        body.position.x += (targetX - body.position.x) * settle;
        body.position.z = basePosition.z;
        body.position.y += (targetY - body.position.y) * settle;
        body.rotation.x += (targetRotX - body.rotation.x) * settle;
        body.rotation.y += (baseRotation.y - body.rotation.y) * settle;
        body.rotation.z += (targetRotZ - body.rotation.z) * settle;
        body.scale.x += (targetScaleX - body.scale.x) * settle;
        body.scale.y += (targetScaleY - body.scale.y) * settle;
        body.scale.z += (targetScaleZ - body.scale.z) * settle;
      }
    }

    const ring = avatar.getObjectByName("ring") as THREE.Mesh | undefined;
    if (ring?.material instanceof THREE.MeshBasicMaterial) {
      ring.material.opacity = 0.6 + 0.4 * Math.sin(time * 1.2 * Math.PI * 2);
    }
  }

  hideAvatar(id: number): void {
    const avatar = this.avatars.get(id);
    if (avatar) avatar.visible = false;
  }

  showAvatar(id: number): void {
    const avatar = this.avatars.get(id);
    if (avatar) avatar.visible = true;
  }

  updateAvatarLabel(id: number, name: string): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;
    const oldLabel = avatar.getObjectByName("label");
    if (oldLabel) {
      avatar.remove(oldLabel);
      if (
        oldLabel instanceof THREE.Sprite &&
        oldLabel.material instanceof THREE.SpriteMaterial
      ) {
        oldLabel.material.map?.dispose();
        oldLabel.material.dispose();
      }
    }
    const label = this.createTextSprite(name);
    label.position.y = 1.1;
    label.name = "label";
    avatar.add(label);
  }

  setRingColor(id: number, color: number): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;
    const ring = avatar.getObjectByName("ring") as THREE.Mesh | undefined;
    if (ring?.material instanceof THREE.MeshBasicMaterial) {
      ring.material.color.setHex(color);
    }
  }

  showCrown(id: number): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;

    const crownGroup = new THREE.Group();
    crownGroup.position.y = 0.5;

    // Crown band
    const bandGeo = new THREE.CylinderGeometry(0.3, 0.32, 0.12, 6);
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    const band = new THREE.Mesh(bandGeo, goldMat);
    crownGroup.add(band);

    // Crown points (5 small cones around the band)
    const pointCount = 5;
    for (let i = 0; i < pointCount; i++) {
      const angle = (Math.PI * 2 * i) / pointCount;
      const coneGeo = new THREE.ConeGeometry(0.06, 0.18, 4);
      const cone = new THREE.Mesh(coneGeo, goldMat);
      cone.position.set(Math.cos(angle) * 0.28, 0.12, Math.sin(angle) * 0.28);
      crownGroup.add(cone);
    }

    avatar.add(crownGroup);
  }

  private makePointKey(point: Vec2): string {
    return `${Math.round(point.x * LOOP_POINT_SCALE)}:${Math.round(point.z * LOOP_POINT_SCALE)}`;
  }

  private makeEdgeKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private loopArea(loop: Vec2[]): number {
    let area = 0;
    for (let i = 0; i < loop.length; i++) {
      const curr = loop[i];
      const next = loop[(i + 1) % loop.length];
      area += curr.x * next.z - next.x * curr.z;
    }
    return area * 0.5;
  }

  private pointInLoop(point: Vec2, loop: Vec2[]): boolean {
    let inside = false;
    for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
      const pi = loop[i];
      const pj = loop[j];
      const intersects =
        pi.z > point.z !== pj.z > point.z &&
        point.x <
          ((pj.x - pi.x) * (point.z - pi.z)) / (pj.z - pi.z + 1e-6) + pi.x;
      if (intersects) inside = !inside;
    }
    return inside;
  }

  private simplifyLoop(loop: Vec2[]): Vec2[] {
    if (loop.length <= 4) return loop.slice();
    let pts = loop.slice();
    let changed = true;
    const minDistSq = LOOP_MIN_DIST * LOOP_MIN_DIST;
    const collinearEpsilon = CELL_SIZE * 0.025;

    while (changed && pts.length > 4) {
      changed = false;
      const next: Vec2[] = [];
      for (let i = 0; i < pts.length; i++) {
        const prev = pts[(i - 1 + pts.length) % pts.length];
        const curr = pts[i];
        const following = pts[(i + 1) % pts.length];
        const dx = curr.x - prev.x;
        const dz = curr.z - prev.z;
        if (dx * dx + dz * dz < minDistSq) {
          changed = true;
          continue;
        }
        const ax = curr.x - prev.x;
        const az = curr.z - prev.z;
        const bx = following.x - curr.x;
        const bz = following.z - curr.z;
        const cross = Math.abs(ax * bz - az * bx);
        const dot = ax * bx + az * bz;
        if (cross < collinearEpsilon && dot >= 0) {
          changed = true;
          continue;
        }
        next.push(curr);
      }
      pts = next;
    }
    return pts;
  }

  private smoothLoop(loop: Vec2[], iterations = 1): Vec2[] {
    let pts = loop.slice();
    for (let pass = 0; pass < iterations; pass++) {
      if (pts.length < 3) break;
      const smoothed: Vec2[] = [];
      for (let i = 0; i < pts.length; i++) {
        const curr = pts[i];
        const next = pts[(i + 1) % pts.length];
        smoothed.push({
          x: curr.x * 0.75 + next.x * 0.25,
          z: curr.z * 0.75 + next.z * 0.25,
        });
        smoothed.push({
          x: curr.x * 0.25 + next.x * 0.75,
          z: curr.z * 0.25 + next.z * 0.75,
        });
      }
      pts = smoothed;
    }
    return pts;
  }

  private buildSideBandGeometry(
    loops: Vec2[][],
    offsetX: number,
    offsetZ: number,
    drop: number,
  ): THREE.BufferGeometry | null {
    const positions: number[] = [];
    for (const loop of loops) {
      if (loop.length < 3) continue;
      for (let i = 0; i < loop.length; i++) {
        const curr = loop[i];
        const next = loop[(i + 1) % loop.length];
        positions.push(
          curr.x,
          0,
          curr.z,
          next.x,
          0,
          next.z,
          next.x + offsetX,
          -drop,
          next.z + offsetZ,
          curr.x,
          0,
          curr.z,
          next.x + offsetX,
          -drop,
          next.z + offsetZ,
          curr.x + offsetX,
          -drop,
          curr.z + offsetZ,
        );
      }
    }

    if (positions.length === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geo.computeVertexNormals();
    return geo;
  }

  private extractContourLoops(
    smooth: Float32Array,
    rows: number,
    cols: number,
    minX: number,
    minZ: number,
  ): Vec2[][] {
    const segments: ContourSegment[] = [];
    const ISO = 0.5;
    const isoLerp = (a: number, b: number, va: number, vb: number): number => {
      const d = vb - va;
      if (Math.abs(d) < 0.001) return (a + b) * 0.5;
      return a + ((ISO - va) / d) * (b - a);
    };
    const addSegment = (ax: number, az: number, bx: number, bz: number) => {
      if (Math.abs(ax - bx) < 1e-5 && Math.abs(az - bz) < 1e-5) return;
      segments.push({ a: { x: ax, z: az }, b: { x: bx, z: bz } });
    };

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const vTL = smooth[r * cols + c];
        const vTR = smooth[r * cols + (c + 1)];
        const vBR = smooth[(r + 1) * cols + (c + 1)];
        const vBL = smooth[(r + 1) * cols + c];

        const config =
          ((vTL >= ISO ? 1 : 0) << 3) |
          ((vTR >= ISO ? 1 : 0) << 2) |
          ((vBR >= ISO ? 1 : 0) << 1) |
          (vBL >= ISO ? 1 : 0);
        if (config === 0 || config === 15) continue;

        const x0 = minX + c * CELL_SIZE;
        const x1 = minX + (c + 1) * CELL_SIZE;
        const z0 = minZ + r * CELL_SIZE;
        const z1 = minZ + (r + 1) * CELL_SIZE;

        const tmx = isoLerp(x0, x1, vTL, vTR);
        const rmy = isoLerp(z0, z1, vTR, vBR);
        const bmx = isoLerp(x0, x1, vBL, vBR);
        const lmy = isoLerp(z0, z1, vTL, vBL);

        switch (config) {
          case 1:
            addSegment(x0, lmy, bmx, z1);
            break;
          case 2:
            addSegment(bmx, z1, x1, rmy);
            break;
          case 3:
            addSegment(x0, lmy, x1, rmy);
            break;
          case 4:
            addSegment(tmx, z0, x1, rmy);
            break;
          case 5:
            addSegment(tmx, z0, x1, rmy);
            addSegment(x0, lmy, bmx, z1);
            break;
          case 6:
            addSegment(tmx, z0, bmx, z1);
            break;
          case 7:
            addSegment(tmx, z0, x0, lmy);
            break;
          case 8:
            addSegment(x0, lmy, tmx, z0);
            break;
          case 9:
            addSegment(tmx, z0, bmx, z1);
            break;
          case 10:
            addSegment(x0, lmy, tmx, z0);
            addSegment(bmx, z1, x1, rmy);
            break;
          case 11:
            addSegment(tmx, z0, x1, rmy);
            break;
          case 12:
            addSegment(x0, lmy, x1, rmy);
            break;
          case 13:
            addSegment(bmx, z1, x1, rmy);
            break;
          case 14:
            addSegment(x0, lmy, bmx, z1);
            break;
        }
      }
    }

    const pointMap = new Map<string, Vec2>();
    const adjacency = new Map<string, string[]>();
    const addLink = (from: Vec2, to: Vec2) => {
      const fromKey = this.makePointKey(from);
      const toKey = this.makePointKey(to);
      pointMap.set(fromKey, from);
      pointMap.set(toKey, to);
      if (!adjacency.has(fromKey)) adjacency.set(fromKey, []);
      if (!adjacency.has(toKey)) adjacency.set(toKey, []);
      adjacency.get(fromKey)!.push(toKey);
      adjacency.get(toKey)!.push(fromKey);
    };

    for (const segment of segments) addLink(segment.a, segment.b);

    const usedEdges = new Set<string>();
    const loops: Vec2[][] = [];

    for (const [startKey, neighbors] of adjacency) {
      for (const firstNeighbor of neighbors) {
        const firstEdge = this.makeEdgeKey(startKey, firstNeighbor);
        if (usedEdges.has(firstEdge)) continue;

        const loopKeys = [startKey];
        let prevKey = startKey;
        let currentKey = firstNeighbor;
        usedEdges.add(firstEdge);

        for (let guard = 0; guard < adjacency.size * 3; guard++) {
          if (currentKey === startKey) break;
          loopKeys.push(currentKey);
          const candidates = adjacency.get(currentKey) ?? [];
          let nextKey = "";
          for (const candidate of candidates) {
            const edgeKey = this.makeEdgeKey(currentKey, candidate);
            if (candidate === prevKey || usedEdges.has(edgeKey)) continue;
            nextKey = candidate;
            break;
          }

          if (!nextKey) {
            const fallback = candidates.find(
              (candidate) => candidate !== prevKey,
            );
            if (!fallback) break;
            nextKey = fallback;
          }

          usedEdges.add(this.makeEdgeKey(currentKey, nextKey));
          prevKey = currentKey;
          currentKey = nextKey;
        }

        if (currentKey !== startKey || loopKeys.length < 3) continue;
        const loop = loopKeys
          .map((key) => pointMap.get(key))
          .filter((point): point is Vec2 => Boolean(point));
        if (loop.length < 3 || Math.abs(this.loopArea(loop)) < LOOP_MIN_AREA)
          continue;
        loops.push(loop);
      }
    }

    return loops;
  }

  private buildShapesFromLoops(loops: Vec2[][]): ShapeBuildResult {
    const cleaned = loops.filter(
      (loop) =>
        loop.length >= 3 && Math.abs(this.loopArea(loop)) >= LOOP_MIN_AREA,
    );
    if (cleaned.length === 0) return { shapes: [], outerLoops: [] };

    const infos = cleaned.map((loop) => ({
      loop,
      area: Math.abs(this.loopArea(loop)),
      parent: -1,
    }));
    const sorted = infos
      .map((_, index) => index)
      .sort((a, b) => infos[b].area - infos[a].area);

    for (const idx of sorted) {
      let bestParent = -1;
      let bestArea = Number.POSITIVE_INFINITY;
      for (const candidate of sorted) {
        if (candidate === idx || infos[candidate].area <= infos[idx].area)
          continue;
        if (
          this.pointInLoop(infos[idx].loop[0], infos[candidate].loop) &&
          infos[candidate].area < bestArea
        ) {
          bestParent = candidate;
          bestArea = infos[candidate].area;
        }
      }
      infos[idx].parent = bestParent;
    }

    const depthMemo = new Map<number, number>();
    const getDepth = (index: number): number => {
      const cached = depthMemo.get(index);
      if (cached !== undefined) return cached;
      const parent = infos[index].parent;
      const depth = parent === -1 ? 0 : getDepth(parent) + 1;
      depthMemo.set(index, depth);
      return depth;
    };

    const orientPoints = (
      loop: Vec2[],
      clockwise: boolean,
    ): THREE.Vector2[] => {
      const points = loop.map((point) => new THREE.Vector2(point.x, -point.z));
      if (THREE.ShapeUtils.isClockWise(points) !== clockwise) points.reverse();
      return points;
    };

    const shapes: THREE.Shape[] = [];
    const outerLoops: Vec2[][] = [];
    const shapeMap = new Map<number, THREE.Shape>();
    for (const idx of sorted) {
      const depth = getDepth(idx);
      if (depth % 2 === 0) {
        outerLoops.push(infos[idx].loop);
        const shape = new THREE.Shape(orientPoints(infos[idx].loop, false));
        shape.autoClose = true;
        shapes.push(shape);
        shapeMap.set(idx, shape);
        continue;
      }

      let ancestor = infos[idx].parent;
      while (ancestor !== -1 && getDepth(ancestor) % 2 === 1) {
        ancestor = infos[ancestor].parent;
      }
      if (ancestor === -1) continue;
      const hole = new THREE.Path(orientPoints(infos[idx].loop, true));
      hole.autoClose = true;
      shapeMap.get(ancestor)?.holes.push(hole);
    }

    return { shapes, outerLoops };
  }

  private buildShapesFromPolygons(
    polygons: TerritoryMultiPolygon,
  ): ShapeBuildResult {
    const orientPoints = (
      loop: Vec2[],
      clockwise: boolean,
    ): THREE.Vector2[] => {
      const points = loop.map((point) => new THREE.Vector2(point.x, -point.z));
      if (THREE.ShapeUtils.isClockWise(points) !== clockwise) points.reverse();
      return points;
    };

    const shapes: THREE.Shape[] = [];
    const outerLoops: Vec2[][] = [];

    for (const polygon of polygons) {
      if (
        polygon.outer.length < 3 ||
        Math.abs(this.loopArea(polygon.outer)) < LOOP_MIN_AREA
      ) {
        continue;
      }
      outerLoops.push(polygon.outer);
      const shape = new THREE.Shape(orientPoints(polygon.outer, false));
      shape.autoClose = true;
      for (const holeLoop of polygon.holes) {
        if (
          holeLoop.length < 3 ||
          Math.abs(this.loopArea(holeLoop)) < LOOP_MIN_AREA
        ) {
          continue;
        }
        const hole = new THREE.Path(orientPoints(holeLoop, true));
        hole.autoClose = true;
        shape.holes.push(hole);
      }
      shapes.push(shape);
    }

    return { shapes, outerLoops };
  }

  private clearTerritoryVisuals(id: number, disposeMaterials = false): void {
    const terr = this.territoryObjects.get(id);
    if (terr) {
      this.scene.remove(terr);
      terr.geometry.dispose();
      this.territoryObjects.delete(id);
    }

    const depthLayers = this.territoryDepthLayers.get(id);
    if (depthLayers) {
      for (const layer of depthLayers) {
        this.scene.remove(layer);
        layer.geometry.dispose();
      }
      this.territoryDepthLayers.delete(id);
    }

    const sideBand = this.territorySideBands.get(id);
    if (sideBand) {
      this.scene.remove(sideBand);
      sideBand.geometry.dispose();
      this.territorySideBands.delete(id);
    }

    const shadow = this.territoryShadows.get(id);
    if (shadow) {
      this.scene.remove(shadow);
      shadow.geometry.dispose();
      this.territoryShadows.delete(id);
    }

    const contactShadow = this.territoryContactShadows.get(id);
    if (contactShadow) {
      this.scene.remove(contactShadow);
      contactShadow.geometry.dispose();
      this.territoryContactShadows.delete(id);
    }

    if (disposeMaterials) {
      const materials = this.territoryMaterials.get(id);
      if (materials) {
        materials.top.dispose();
        materials.depth.dispose();
        materials.band.dispose();
        this.territoryMaterials.delete(id);
      }
      this.territorySkinIds.delete(id);
    }
  }

  updateTerritory(
    id: number,
    grid: TerritoryGrid,
    color: number,
    skinId = "",
  ): void {
    const bounds = grid.getBounds(id);
    if (!bounds) {
      this.clearTerritoryVisuals(id, true);
      return;
    }

    // Recreate material if skin changed
    const prevSkinId = this.territorySkinIds.get(id);
    if (prevSkinId !== skinId) {
      const oldMat = this.territoryMaterials.get(id);
      if (oldMat) {
        oldMat.top.dispose();
        oldMat.depth.dispose();
        oldMat.band.dispose();
        this.territoryMaterials.delete(id);
      }
      this.territorySkinIds.set(id, skinId);
    }

    this.clearTerritoryVisuals(id);

    let materials = this.territoryMaterials.get(id);
    if (!materials) {
      const patTex = this.getPatternTexture(skinId);
      const topMat = new THREE.MeshPhongMaterial({
        color: patTex ? 0xffffff : color,
        map: patTex ?? null,
        side: THREE.DoubleSide,
        flatShading: false,
        shininess: 12,
        specular: new THREE.Color(0x95dff7),
      });
      const depthMat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color).multiplyScalar(0.7),
        flatShading: true,
        shininess: 10,
        specular: new THREE.Color(0x72a3c3),
      });
      const bandMat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(color).multiplyScalar(0.56),
        flatShading: true,
        shininess: 6,
        specular: new THREE.Color(0x4c7692),
        side: THREE.DoubleSide,
      });
      materials = { top: topMat, depth: depthMat, band: bandMat };
      this.territoryMaterials.set(id, materials);
    }
    const patTex = this.getPatternTexture(skinId);
    materials.top.color.setHex(patTex ? 0xffffff : color);
    materials.top.map = patTex ?? null;
    materials.top.needsUpdate = true;
    materials.depth.color.copy(new THREE.Color(color).multiplyScalar(0.7));
    materials.depth.needsUpdate = true;
    materials.band.color.copy(new THREE.Color(color).multiplyScalar(0.56));
    materials.band.needsUpdate = true;
    if (!this.shadowMaterial) {
      this.shadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x8fb3d2,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }
    if (!this.contactShadowMaterial) {
      this.contactShadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x7288aa,
        transparent: true,
        opacity: 0.12,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }
    const polygons = grid.getPolygons(id);
    if (!polygons) {
      this.clearTerritoryVisuals(id, true);
      return;
    }

    const bMinX = bounds.minX;
    const bMinZ = bounds.minZ;
    const bMaxX = bounds.maxX;
    const bMaxZ = bounds.maxZ;

    const { shapes: rawShapes, outerLoops } =
      this.buildShapesFromPolygons(polygons);
    if (rawShapes.length === 0) {
      return;
    }

    const order = ++this.territoryRenderOrder;
    const topGeo = new THREE.ShapeGeometry(rawShapes, EXTRUDE_CURVE_SEGMENTS);
    topGeo.rotateX(-Math.PI / 2);
    topGeo.computeVertexNormals();

    const mesh = new THREE.Mesh(topGeo, materials.top);
    mesh.position.y = TERRITORY_Y;
    mesh.renderOrder = order;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.territoryObjects.set(id, mesh);

    const depthLayers: THREE.Mesh[] = [];
    for (let layer = 1; layer <= TERRITORY_DEPTH_LAYERS; layer++) {
      const t = layer / TERRITORY_DEPTH_LAYERS;
      const layerGeo = new THREE.ShapeGeometry(
        rawShapes,
        EXTRUDE_CURVE_SEGMENTS,
      );
      layerGeo.rotateX(-Math.PI / 2);
      layerGeo.computeVertexNormals();
      const layerMesh = new THREE.Mesh(layerGeo, materials.depth);
      layerMesh.position.set(
        TERRITORY_DEPTH_OFFSET_X * t,
        TERRITORY_Y - TERRITORY_DEPTH_DROP * t,
        TERRITORY_DEPTH_OFFSET_Z * t,
      );
      layerMesh.renderOrder = order - 0.3 - layer * 0.01;
      layerMesh.castShadow = false;
      layerMesh.receiveShadow = true;
      this.scene.add(layerMesh);
      depthLayers.push(layerMesh);
    }
    this.territoryDepthLayers.set(id, depthLayers);

    const sideBandGeo = this.buildSideBandGeometry(
      outerLoops,
      TERRITORY_DEPTH_OFFSET_X,
      TERRITORY_DEPTH_OFFSET_Z,
      TERRITORY_DEPTH_DROP,
    );
    if (sideBandGeo) {
      const sideBandMesh = new THREE.Mesh(sideBandGeo, materials.band);
      sideBandMesh.position.y = TERRITORY_Y;
      sideBandMesh.renderOrder = order - 0.12;
      sideBandMesh.castShadow = false;
      sideBandMesh.receiveShadow = true;
      this.scene.add(sideBandMesh);
      this.territorySideBands.set(id, sideBandMesh);
    }

    const shadowCenterX = (bMinX + bMaxX) * 0.5;
    const shadowCenterZ = (bMinZ + bMaxZ) * 0.5;
    const footprintGeo = new THREE.ShapeGeometry(
      rawShapes,
      EXTRUDE_CURVE_SEGMENTS,
    );
    footprintGeo.rotateX(-Math.PI / 2);

    // Drop shadow: wide soft shadow on the ground
    const shadowOffset = 0.16;
    const shadowSpread = 1.02;
    const shadowGeo = footprintGeo.clone();
    const shadowPositions = (
      shadowGeo.getAttribute("position") as THREE.BufferAttribute
    ).array as Float32Array;
    for (let i = 0; i < shadowPositions.length; i += 3) {
      shadowPositions[i] =
        shadowCenterX +
        (shadowPositions[i] - shadowCenterX) * shadowSpread -
        shadowOffset;
      shadowPositions[i + 1] = 0.015;
      shadowPositions[i + 2] =
        shadowCenterZ +
        (shadowPositions[i + 2] - shadowCenterZ) * shadowSpread -
        shadowOffset * 0.9;
    }
    (shadowGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
      true;

    const shadowMesh = new THREE.Mesh(shadowGeo, this.shadowMaterial!);
    shadowMesh.renderOrder = order - 1;
    this.scene.add(shadowMesh);
    this.territoryShadows.set(id, shadowMesh);

    // Contact shadow: tighter edge shadow to make the territory feel thicker.
    const contactOffset = 0.045;
    const contactSpread = 1.006;
    const contactGeo = footprintGeo.clone();
    const contactPositions = (
      contactGeo.getAttribute("position") as THREE.BufferAttribute
    ).array as Float32Array;
    for (let i = 0; i < contactPositions.length; i += 3) {
      contactPositions[i] =
        shadowCenterX +
        (contactPositions[i] - shadowCenterX) * contactSpread -
        contactOffset;
      contactPositions[i + 1] = TERRITORY_Y - TERRITORY_DEPTH_DROP * 0.55;
      contactPositions[i + 2] =
        shadowCenterZ +
        (contactPositions[i + 2] - shadowCenterZ) * contactSpread -
        contactOffset * 0.85;
    }
    (contactGeo.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
      true;

    const contactMesh = new THREE.Mesh(contactGeo, this.contactShadowMaterial!);
    contactMesh.renderOrder = order - 0.5;
    this.scene.add(contactMesh);
    this.territoryContactShadows.set(id, contactMesh);
    footprintGeo.dispose();
  }

  private static readonly MAX_TRAIL_POINTS = 512;

  updateTrail(
    id: number,
    trail: Vec2[],
    color: number,
    startTangent: Vec2 | null = null,
  ): void {
    const prevLen = this.trailLengths.get(id) ?? 0;
    const maxPts = Renderer.MAX_TRAIL_POINTS;
    const n = Math.min(trail.length, maxPts);
    if (trail.length > maxPts && !this.trailCapLogged.has(id)) {
      this.trailCapLogged.add(id);
      // #region agent log
      debugLog("H1", "Renderer.ts:1117", "trail render cap reached", {
        playerId: id,
        trailLength: trail.length,
        renderedLength: n,
        prevLen,
      });
      // #endregion
    }
    if (prevLen === n && n > 0) {
      if (trail.length > maxPts && !this.trailEarlyReturnLogged.has(id)) {
        this.trailEarlyReturnLogged.add(id);
        // #region agent log
        debugLog(
          "H2",
          "Renderer.ts:1118",
          "trail render early-return while capped",
          {
            playerId: id,
            trailLength: trail.length,
            renderedLength: n,
            prevLen,
          },
        );
        // #endregion
      }
      return;
    }
    this.trailLengths.set(id, n);

    let mesh = this.trailMeshes.get(id);

    if (n < 2) {
      if (mesh) mesh.visible = false;
      this.trailCapLogged.delete(id);
      this.trailEarlyReturnLogged.delete(id);
      return;
    }

    const halfWidth = 0.25;
    const y = TRAIL_Y;

    if (!mesh) {
      let mat = this.trailMaterials.get(id);
      if (!mat) {
        mat = new THREE.MeshLambertMaterial({
          color,
          transparent: true,
          opacity: TRAIL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        this.trailMaterials.set(id, mat);
      }

      const posAttr = new THREE.BufferAttribute(
        new Float32Array(maxPts * 2 * 3),
        3,
      );
      posAttr.setUsage(THREE.DynamicDrawUsage);
      const idxArr = new Uint16Array((maxPts - 1) * 6);
      for (let i = 0; i < maxPts - 1; i++) {
        const vi = i * 2;
        const ii = i * 6;
        idxArr[ii] = vi;
        idxArr[ii + 1] = vi + 1;
        idxArr[ii + 2] = vi + 2;
        idxArr[ii + 3] = vi + 1;
        idxArr[ii + 4] = vi + 3;
        idxArr[ii + 5] = vi + 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", posAttr);
      const normalArr = new Float32Array(maxPts * 2 * 3);
      for (let i = 0; i < normalArr.length; i += 3) {
        normalArr[i + 1] = 1;
      }
      geo.setAttribute("normal", new THREE.BufferAttribute(normalArr, 3));
      geo.setIndex(new THREE.BufferAttribute(idxArr, 1));

      mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.trailMeshes.set(id, mesh);
    }

    mesh.visible = true;
    const posArr = (
      mesh.geometry.getAttribute("position") as THREE.BufferAttribute
    ).array as Float32Array;

    const normalize = (x: number, z: number): Vec2 => {
      const len = Math.sqrt(x * x + z * z) || 1;
      return { x: x / len, z: z / len };
    };

    const blendPoints = 4;
    const normalizedStartTangent =
      startTangent && (startTangent.x !== 0 || startTangent.z !== 0)
        ? normalize(startTangent.x, startTangent.z)
        : null;

    const updateStart = trail.length >= prevLen ? Math.max(0, prevLen - 2) : 0;

    for (let i = updateStart; i < n; i++) {
      let dx: number, dz: number;
      if (i === 0) {
        dx = trail[1].x - trail[0].x;
        dz = trail[1].z - trail[0].z;
      } else if (i === n - 1) {
        dx = trail[i].x - trail[i - 1].x;
        dz = trail[i].z - trail[i - 1].z;
      } else {
        dx = trail[i + 1].x - trail[i - 1].x;
        dz = trail[i + 1].z - trail[i - 1].z;
      }
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const alongDir = { x: dx / len, z: dz / len };
      const trailSide = { x: -dz / len, z: dx / len };
      let widthDir = trailSide;

      if (normalizedStartTangent && i < blendPoints) {
        let tangent = normalizedStartTangent;
        if (tangent.x * trailSide.x + tangent.z * trailSide.z < 0) {
          tangent = { x: -tangent.x, z: -tangent.z };
        }

        const t = i / Math.max(1, blendPoints - 1);
        widthDir = normalize(
          tangent.x * (1 - t) + trailSide.x * t,
          tangent.z * (1 - t) + trailSide.z * t,
        );
      }

      const px = widthDir.x * halfWidth;
      const pz = widthDir.z * halfWidth;
      const capOffset = i === 0 ? -halfWidth : i === n - 1 ? halfWidth : 0;
      const centerX = trail[i].x + alongDir.x * capOffset;
      const centerZ = trail[i].z + alongDir.z * capOffset;

      const off = i * 6;
      posArr[off] = centerX + px;
      posArr[off + 1] = y;
      posArr[off + 2] = centerZ + pz;
      posArr[off + 3] = centerX - px;
      posArr[off + 4] = y;
      posArr[off + 5] = centerZ - pz;
    }

    const posAttr = mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    mesh.geometry.setDrawRange(0, Math.max(0, n - 1) * 6);
  }

  setCameraTarget(pos: Vec2): void {
    this.cameraTarget.x = pos.x;
    this.cameraTarget.z = pos.z;
    this.camera.position.x = pos.x;
    this.camera.position.y = 20;
    this.camera.position.z = pos.z + 12.5;
    this.camera.lookAt(pos.x, 0, pos.z);
  }

  updateCamera(targetPos: Vec2, dt: number): void {
    const lerpFactor = 1 - Math.exp(-4 * dt);
    this.cameraTarget.x += (targetPos.x - this.cameraTarget.x) * lerpFactor;
    this.cameraTarget.z += (targetPos.z - this.cameraTarget.z) * lerpFactor;

    this.camera.position.x = this.cameraTarget.x;
    this.camera.position.y = 20;
    this.camera.position.z = this.cameraTarget.z + 12.5;
    this.camera.lookAt(this.cameraTarget.x, 0, this.cameraTarget.z);
  }

  removeTerritory(id: number): void {
    this.clearTerritoryVisuals(id, true);
  }

  startTerritoryTakeover(
    victimId: number,
    _killerId: number,
    origin: Vec2,
    killerColor: number,
    _killerSkinId = "",
  ): void {
    const victimMesh = this.territoryObjects.get(victimId);
    if (!victimMesh) return;
    this.cleanupTakeoversForVictim(victimId);

    const sourceMaterial = Array.isArray(victimMesh.material)
      ? victimMesh.material[0]
      : victimMesh.material;
    const material = sourceMaterial.clone();
    const uniforms = {
      rippleOrigin: { value: new THREE.Vector2(origin.x, origin.z) },
      rippleRadius: { value: 0 },
      rippleWidth: { value: TAKEOVER_WAVE_WIDTH },
      rippleColor: { value: new THREE.Color(killerColor) },
    };

    material.transparent = true;
    material.depthWrite = false;
    material.onBeforeCompile = (
      shader: Parameters<THREE.Material["onBeforeCompile"]>[0],
    ) => {
      shader.uniforms.rippleOrigin = uniforms.rippleOrigin;
      shader.uniforms.rippleRadius = uniforms.rippleRadius;
      shader.uniforms.rippleWidth = uniforms.rippleWidth;
      shader.uniforms.rippleColor = uniforms.rippleColor;

      shader.vertexShader =
        "varying vec2 vWorldXZ;\n" +
        shader.vertexShader.replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\n vWorldXZ = worldPosition.xz;",
        );

      shader.fragmentShader =
        "uniform vec2 rippleOrigin;\n" +
        "uniform float rippleRadius;\n" +
        "uniform float rippleWidth;\n" +
        "uniform vec3 rippleColor;\n" +
        "varying vec2 vWorldXZ;\n" +
        shader.fragmentShader.replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float rippleDist = distance(vWorldXZ, rippleOrigin);
          float hideMask = smoothstep(rippleRadius - rippleWidth, rippleRadius + rippleWidth, rippleDist);
          float wave = 1.0 - smoothstep(0.0, rippleWidth * 1.5, abs(rippleDist - rippleRadius));
          diffuseColor.rgb = mix(diffuseColor.rgb, rippleColor, wave * 0.85);
          diffuseColor.a *= hideMask;`,
        );
    };
    material.needsUpdate = true;

    const mesh = new THREE.Mesh(victimMesh.geometry.clone(), material);
    mesh.renderOrder = victimMesh.renderOrder + 2;
    mesh.position.copy(victimMesh.position);
    mesh.rotation.copy(victimMesh.rotation);
    mesh.scale.copy(victimMesh.scale);
    this.scene.add(mesh);

    const box = new THREE.Box3().setFromObject(mesh);
    const corners = [
      new THREE.Vector2(box.min.x, box.min.z),
      new THREE.Vector2(box.min.x, box.max.z),
      new THREE.Vector2(box.max.x, box.min.z),
      new THREE.Vector2(box.max.x, box.max.z),
    ];
    let maxRadius = 0;
    for (const corner of corners) {
      maxRadius = Math.max(
        maxRadius,
        corner.distanceTo(uniforms.rippleOrigin.value),
      );
    }

    this.territoryTakeovers.push({
      victimId,
      mesh,
      material,
      startMs: performance.now(),
      durationMs: TAKEOVER_DURATION * 1000,
      maxRadius: maxRadius + TAKEOVER_WAVE_WIDTH,
      uniforms,
    });

    this.removeTerritory(victimId);
    this.hideAvatar(victimId);
  }

  render(): void {
    this.updateTerritoryTakeovers();
    this.renderer.render(this.scene, this.camera);
  }

  hasActiveEffects(): boolean {
    return this.territoryTakeovers.length > 0;
  }

  private updateTerritoryTakeovers(): void {
    if (this.territoryTakeovers.length === 0) return;
    const now = performance.now();
    this.territoryTakeovers = this.territoryTakeovers.filter((effect) => {
      const t = Math.min(1, (now - effect.startMs) / effect.durationMs);
      effect.uniforms.rippleRadius.value = effect.maxRadius * t;
      if (t < 1) return true;
      this.scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.material.dispose();
      return false;
    });
  }

  private cleanupTakeoversForVictim(victimId: number): void {
    this.territoryTakeovers = this.territoryTakeovers.filter((effect) => {
      if (victimId >= 0 && effect.victimId !== victimId) return true;
      this.scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.material.dispose();
      return false;
    });
  }

  private disposeObject(obj: THREE.Object3D): void {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (obj.material instanceof THREE.Material) obj.material.dispose();
    }
    for (const child of obj.children) {
      this.disposeObject(child);
    }
  }

  private getPatternTexture(skinId: string): THREE.Texture | null {
    if (this.patternTextures.has(skinId))
      return this.patternTextures.get(skinId) ?? null;
    const canvas = this.createPatternCanvas(skinId);
    if (!canvas) {
      this.patternTextures.set(skinId, null);
      return null;
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    this.patternTextures.set(skinId, tex);
    return tex;
  }

  private createPatternCanvas(skinId: string): HTMLCanvasElement | null {
    const S = 256;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const ctx = c.getContext("2d")!;

    const stripe45 = (colors: string[], w: number) => {
      const period = colors.length * w;
      for (let band = 0; band < colors.length; band++) {
        ctx.fillStyle = colors[band];
        const off = band * w;
        for (let t = -S; t < S * 2; t += period) {
          ctx.beginPath();
          ctx.moveTo(t + off, 0);
          ctx.lineTo(t + off + w, 0);
          ctx.lineTo(t + off + w + S, S);
          ctx.lineTo(t + off + S, S);
          ctx.closePath();
          ctx.fill();
        }
      }
    };

    const hexGrid = (bg: string, stroke: string, r: number) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, S, S);
      const hw = r * Math.sqrt(3),
        hh = r * 2;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2.5;
      for (let row = -1; row < S / (hh * 0.75) + 2; row++) {
        for (let col = -1; col < S / hw + 2; col++) {
          const cx = col * hw + (row % 2 === 0 ? 0 : hw / 2);
          const cy = row * hh * 0.75;
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + (Math.PI / 3) * i;
            const px = cx + r * Math.cos(a),
              py = cy + r * Math.sin(a);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
    };

    switch (skinId) {
      case "cat": {
        ctx.fillStyle = "#FFAA00";
        ctx.fillRect(0, 0, S, S);
        ctx.strokeStyle = "#7A4000";
        ctx.lineWidth = 5;
        for (let i = -S; i < S * 2; i += 36) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + S, S);
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(255,224,160,0.3)";
        ctx.lineWidth = 2;
        for (let i = -S + 18; i < S * 2; i += 36) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i + S, S);
          ctx.stroke();
        }
        break;
      }
      case "dog": {
        ctx.fillStyle = "#FF6B35";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "#7B3F00";
        for (const [x, y, rx, ry, rot] of [
          [45, 55, 22, 16, 0.3],
          [128, 35, 28, 20, 0.5],
          [195, 90, 20, 14, 0.1],
          [65, 155, 24, 18, 0.8],
          [160, 195, 26, 18, 0.2],
          [220, 145, 18, 14, 0.6],
          [25, 225, 20, 16, 0.4],
          [108, 235, 22, 15, 0.7],
        ] as number[][]) {
          ctx.beginPath();
          ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "bunny": {
        ctx.fillStyle = "#FF3D71";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "rgba(255,143,173,0.65)";
        for (const [x, y, r] of [
          [50, 50, 30],
          [160, 40, 22],
          [220, 130, 26],
          [100, 160, 34],
          [200, 210, 28],
          [40, 210, 20],
        ] as number[][]) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255,0.15)";
        for (const [x, y, r] of [
          [50, 50, 18],
          [160, 40, 13],
          [220, 130, 15],
          [100, 160, 20],
          [200, 210, 16],
        ] as number[][]) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "fox": {
        ctx.fillStyle = "#FF8C00";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        for (let row = 0; row < 5; row++) {
          const cy = row * 64 + 32;
          ctx.beginPath();
          ctx.moveTo(0, cy);
          ctx.lineTo(128, cy - 28);
          ctx.lineTo(256, cy);
          ctx.lineTo(256, cy + 14);
          ctx.lineTo(128, cy - 14);
          ctx.lineTo(0, cy + 14);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = "rgba(59,28,0,0.22)";
        ctx.beginPath();
        ctx.arc(128, 128, 40, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "penguin": {
        ctx.fillStyle = "#4DD0E1";
        ctx.fillRect(0, 0, S, S);
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.ellipse(128, 128, 59, 79, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#FFFFFF";
        ctx.beginPath();
        ctx.ellipse(128, 128, 55, 75, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "chicken": {
        ctx.fillStyle = "#FFD700";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "rgba(255,253,224,0.75)";
        for (const [x, y] of [
          [30, 20],
          [80, 45],
          [140, 25],
          [200, 60],
          [240, 30],
          [20, 90],
          [110, 85],
          [175, 95],
          [230, 110],
          [55, 140],
          [120, 160],
          [190, 145],
          [240, 175],
          [30, 195],
          [85, 220],
          [150, 205],
          [220, 230],
          [10, 250],
          [170, 245],
        ] as number[][]) {
          ctx.beginPath();
          ctx.arc(x, y, 3 + (x % 3), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = "#CC0000";
        for (const [x, y] of [
          [60, 15],
          [195, 25],
          [240, 200],
        ] as number[][]) {
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "turtle": {
        hexGrid("#00E096", "#007A50", 24);
        ctx.fillStyle = "rgba(102,255,180,0.18)";
        const r2 = 24,
          hw2 = r2 * Math.sqrt(3),
          hh2 = r2 * 2;
        for (let row = -1; row < S / (hh2 * 0.75) + 2; row++) {
          for (let col = -1; col < S / hw2 + 2; col++) {
            const cx = col * hw2 + (row % 2 === 0 ? 0 : hw2 / 2);
            const cy = row * hh2 * 0.75;
            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const a = Math.PI / 6 + (Math.PI / 3) * i;
              const px = cx + (r2 - 4) * Math.cos(a),
                py = cy + (r2 - 4) * Math.sin(a);
              if (i === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          }
        }
        break;
      }
      case "frog": {
        ctx.fillStyle = "#66FF80";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "rgba(26,92,0,0.75)";
        for (const [x, y, rx, ry, rot] of [
          [60, 60, 45, 35, 0.4],
          [180, 80, 50, 38, 1.2],
          [100, 180, 55, 42, 0.8],
          [220, 200, 40, 30, 0.2],
          [30, 200, 35, 28, 1.5],
        ] as number[][]) {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        break;
      }
      case "piglet": {
        ctx.fillStyle = "#FF9999";
        ctx.fillRect(0, 0, S, S);
        ctx.strokeStyle = "#FF6B6B";
        ctx.lineWidth = 2.5;
        for (let y = 20; y < S; y += 28) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          for (let x = 0; x <= S; x += 20) {
            ctx.quadraticCurveTo(
              x + 10,
              y + 7 * Math.sin((x * 2 * Math.PI) / 128),
              x + 20,
              y + 5 * Math.sin(((x + 20) * 2 * Math.PI) / 128),
            );
          }
          ctx.stroke();
        }
        break;
      }
      case "bear": {
        ctx.fillStyle = "#8B5E3C";
        ctx.fillRect(0, 0, S, S);
        ctx.strokeStyle = "#B8894F";
        ctx.lineWidth = 2;
        for (let gy = 14; gy < S; gy += 22) {
          for (let gx = 14; gx < S; gx += 20) {
            const angle = (gx * 0.31 + gy * 0.47) % (Math.PI * 2);
            ctx.beginPath();
            ctx.moveTo(gx - 7 * Math.cos(angle), gy - 7 * Math.sin(angle));
            ctx.lineTo(gx + 7 * Math.cos(angle), gy + 7 * Math.sin(angle));
            ctx.stroke();
          }
        }
        break;
      }
      case "monkey": {
        ctx.fillStyle = "#A0522D";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "rgba(210,150,107,0.3)";
        ctx.beginPath();
        ctx.ellipse(128, 128, 95, 105, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(210,150,107,0.65)";
        ctx.beginPath();
        ctx.ellipse(128, 128, 68, 78, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "mouse": {
        ctx.fillStyle = "#BBBBBB";
        ctx.fillRect(0, 0, S, S);
        ctx.strokeStyle = "rgba(216,216,216,0.8)";
        ctx.lineWidth = 1.5;
        for (let y = 0; y < S; y += 10) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(S, y);
          ctx.stroke();
        }
        ctx.fillStyle = "rgba(255,182,193,0.55)";
        for (const [x, y] of [
          [32, 128],
          [224, 128],
          [128, 32],
          [128, 224],
        ] as number[][]) {
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "cow": {
        ctx.fillStyle = "#F5F5DC";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "#111111";
        ctx.beginPath();
        ctx.moveTo(30, 20);
        ctx.bezierCurveTo(80, 0, 120, 30, 90, 70);
        ctx.bezierCurveTo(110, 100, 60, 110, 20, 80);
        ctx.bezierCurveTo(0, 50, 10, 30, 30, 20);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(170, 40);
        ctx.bezierCurveTo(220, 20, 255, 60, 240, 100);
        ctx.bezierCurveTo(255, 130, 200, 140, 175, 110);
        ctx.bezierCurveTo(150, 85, 155, 55, 170, 40);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(60, 160);
        ctx.bezierCurveTo(110, 140, 150, 170, 130, 215);
        ctx.bezierCurveTo(140, 255, 80, 256, 50, 225);
        ctx.bezierCurveTo(20, 200, 25, 175, 60, 160);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(185, 175);
        ctx.bezierCurveTo(230, 160, 260, 195, 245, 235);
        ctx.bezierCurveTo(255, 260, 200, 256, 175, 230);
        ctx.bezierCurveTo(155, 205, 160, 185, 185, 175);
        ctx.fill();
        break;
      }
      case "panda": {
        ctx.fillStyle = "#333333";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.beginPath();
        ctx.ellipse(128, 110, 95, 108, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.beginPath();
        ctx.ellipse(128, 110, 72, 85, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case "elephant": {
        ctx.fillStyle = "#999999";
        ctx.fillRect(0, 0, S, S);
        ctx.strokeStyle = "#777777";
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          const yBase = 28 + i * 52;
          ctx.beginPath();
          ctx.moveTo(0, yBase);
          for (let x = 0; x <= S; x += 4) {
            ctx.lineTo(
              x,
              yBase + 13 * Math.sin((x * 2 * Math.PI) / 256 + i * 1.3),
            );
          }
          ctx.stroke();
        }
        break;
      }
      case "parrot": {
        stripe45(["#FF3D71", "#FFD700", "#00A1E4", "#00CC44"], 36);
        break;
      }
      case "crocodile": {
        ctx.fillStyle = "#2E8B57";
        ctx.fillRect(0, 0, S, S);
        const cw = 26,
          ch = 20;
        ctx.fillStyle = "rgba(61,184,122,0.22)";
        for (let row = -1; row < S / ch + 2; row++) {
          for (let col = -1; col < S / cw + 2; col++) {
            const ox = row % 2 === 0 ? 0 : cw / 2;
            ctx.fillRect(
              col * cw + ox - cw / 2 + 2,
              row * ch - ch / 2 + 2,
              cw - 4,
              ch - 4,
            );
          }
        }
        ctx.strokeStyle = "#1A5C30";
        ctx.lineWidth = 2;
        for (let row = -1; row < S / ch + 2; row++) {
          for (let col = -1; col < S / cw + 2; col++) {
            const ox = row % 2 === 0 ? 0 : cw / 2;
            ctx.strokeRect(col * cw + ox - cw / 2, row * ch - ch / 2, cw, ch);
          }
        }
        break;
      }
      case "axolotl": {
        ctx.fillStyle = "#FFB6C1";
        ctx.fillRect(0, 0, S, S);
        ctx.fillStyle = "rgba(221,160,221,0.85)";
        for (const [x, y] of [
          [20, 20],
          [60, 40],
          [110, 15],
          [160, 35],
          [210, 20],
          [240, 50],
          [30, 70],
          [80, 85],
          [140, 65],
          [190, 80],
          [240, 100],
          [15, 120],
          [65, 140],
          [120, 120],
          [175, 135],
          [230, 150],
          [40, 170],
          [95, 190],
          [155, 165],
          [205, 185],
          [245, 200],
          [20, 215],
          [75, 235],
          [130, 210],
          [185, 230],
          [235, 250],
          [50, 250],
          [105, 255],
          [165, 245],
        ] as number[][]) {
          ctx.beginPath();
          ctx.arc(x, y, 4 + (x % 3), 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case "mole": {
        ctx.fillStyle = "#5C4033";
        ctx.fillRect(0, 0, S, S);
        ctx.strokeStyle = "rgba(58,34,24,0.6)";
        ctx.lineWidth = 1.2;
        for (let i = 0; i < S; i += 8) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, S);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(S, i);
          ctx.stroke();
        }
        break;
      }
      case "unicorn": {
        stripe45(["#FF6EB4", "#C084FF", "#4FC3FF", "#FFD700", "#00CC44"], 28);
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        for (const [x, y] of [
          [40, 60],
          [110, 30],
          [190, 70],
          [240, 140],
          [60, 180],
          [150, 200],
          [220, 230],
          [30, 240],
        ] as number[][]) {
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default:
        return null;
    }
    return c;
  }

  private onResize(): void {
    const wrapper = document.getElementById("game-wrapper")!;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  cleanupPlayer(id: number): void {
    this.removeTerritory(id);
    this.cleanupTakeoversForVictim(id);
    const trail = this.trailMeshes.get(id);
    if (trail) {
      this.scene.remove(trail);
      trail.geometry.dispose();
      this.trailMeshes.delete(id);
    }
    const trailMat = this.trailMaterials.get(id);
    if (trailMat) {
      trailMat.dispose();
      this.trailMaterials.delete(id);
    }
    this.trailLengths.delete(id);
    this.avatarLastPositions.delete(id);
    this.hideAvatar(id);
  }

  dispose(): void {
    for (const [id] of this.avatars) this.cleanupPlayer(id);
    this.cleanupTakeoversForVictim(-1);
    for (const tex of this.patternTextures.values()) tex?.dispose();
    this.patternTextures.clear();
    this.renderer.dispose();
  }
}
