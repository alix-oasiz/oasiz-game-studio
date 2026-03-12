import * as THREE from "three";
import {
  MAP_RADIUS,
  BOARD_COLOR,
  BG_COLOR,
  GRID_LINE_COLOR,
  TRAIL_OPACITY,
  type Vec2,
} from "./constants.ts";
import { type TerritoryGrid } from "./Territory.ts";

const TERRITORY_Y = 0.03;
const TERRITORY_HEIGHT = 0.24;
const TRAIL_Y = 0.22;
const CELL_SIZE = 0.18;
const BORDER_WIDTH = 1.0;
const PATTERN_TILE = 5.0;

export class Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  private territoryObjects: Map<number, THREE.Mesh> = new Map();
  private territoryShadows: Map<number, THREE.Mesh> = new Map();
  private territoryMaterials: Map<number, THREE.MeshLambertMaterial> =
    new Map();
  private territorySkinIds: Map<number, string> = new Map();
  private patternTextures: Map<string, THREE.Texture | null> = new Map();
  private shadowMaterial: THREE.MeshBasicMaterial | null = null;
  private trailMeshes: Map<number, THREE.Mesh> = new Map();
  private trailMaterials: Map<number, THREE.MeshLambertMaterial> = new Map();
  private trailLengths: Map<number, number> = new Map();
  private avatars: Map<number, THREE.Group> = new Map();
  private avatarLastPositions: Map<number, Vec2> = new Map();

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

  updateTerritory(
    id: number,
    grid: TerritoryGrid,
    color: number,
    skinId = "",
  ): void {
    const old = this.territoryObjects.get(id);
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
    }
    const oldSh = this.territoryShadows.get(id);
    if (oldSh) {
      this.scene.remove(oldSh);
      oldSh.geometry.dispose();
      this.territoryShadows.delete(id);
    }

    const bounds = grid.getBounds(id);
    if (!bounds) {
      this.territoryObjects.delete(id);
      const oldMat = this.territoryMaterials.get(id);
      if (oldMat) {
        oldMat.dispose();
        this.territoryMaterials.delete(id);
      }
      this.territorySkinIds.delete(id);
      return;
    }

    // Recreate material if skin changed
    const prevSkinId = this.territorySkinIds.get(id);
    if (prevSkinId !== skinId) {
      const oldMat = this.territoryMaterials.get(id);
      if (oldMat) {
        oldMat.dispose();
        this.territoryMaterials.delete(id);
      }
      this.territorySkinIds.set(id, skinId);
    }

    let mat = this.territoryMaterials.get(id);
    if (!mat) {
      const patTex = this.getPatternTexture(skinId);
      mat = new THREE.MeshLambertMaterial({
        color: patTex ? 0xffffff : color,
        map: patTex ?? null,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.territoryMaterials.set(id, mat);
    }
    if (!this.shadowMaterial) {
      this.shadowMaterial = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
    }

    // Compute world-space bounding box from grid bounds with padding
    const [bMinX, bMinZ] = grid.toWorld(bounds.minC, bounds.minR);
    const [bMaxX, bMaxZ] = grid.toWorld(bounds.maxC, bounds.maxR);

    let minX = Math.floor(bMinX / CELL_SIZE) * CELL_SIZE - CELL_SIZE * 2;
    let minZ = Math.floor(bMinZ / CELL_SIZE) * CELL_SIZE - CELL_SIZE * 2;
    let maxX = Math.ceil(bMaxX / CELL_SIZE) * CELL_SIZE + CELL_SIZE * 2;
    let maxZ = Math.ceil(bMaxZ / CELL_SIZE) * CELL_SIZE + CELL_SIZE * 2;

    const cols = Math.round((maxX - minX) / CELL_SIZE) + 1;
    const rows = Math.round((maxZ - minZ) / CELL_SIZE) + 1;

    // Read ownership directly from the shared grid -- zero overlap guaranteed
    const field = new Uint8Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      const wz = minZ + r * CELL_SIZE;
      for (let c = 0; c < cols; c++) {
        const wx = minX + c * CELL_SIZE;
        if (grid.isOwnedBy(wx, wz, id)) {
          field[r * cols + c] = 1;
        }
      }
    }

    // --- Compute distance from territory boundary (BFS inward) ---
    const borderCells = Math.max(1, Math.ceil(BORDER_WIDTH / CELL_SIZE));
    const distField = new Uint8Array(cols * rows);
    distField.fill(255);
    const bfsQ: number[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (!field[i]) {
          distField[i] = 0;
          continue;
        }
        if (
          r === 0 ||
          r === rows - 1 ||
          c === 0 ||
          c === cols - 1 ||
          !field[(r - 1) * cols + c] ||
          !field[(r + 1) * cols + c] ||
          !field[r * cols + c - 1] ||
          !field[r * cols + c + 1]
        ) {
          distField[i] = 0;
          bfsQ.push(r, c);
        }
      }
    }

    let qi = 0;
    while (qi < bfsQ.length) {
      const br = bfsQ[qi++];
      const bc = bfsQ[qi++];
      const nd = distField[br * cols + bc] + 1;
      if (nd > borderCells) continue;
      if (br > 0) {
        const ni = (br - 1) * cols + bc;
        if (field[ni] && distField[ni] > nd) {
          distField[ni] = nd;
          bfsQ.push(br - 1, bc);
        }
      }
      if (br < rows - 1) {
        const ni = (br + 1) * cols + bc;
        if (field[ni] && distField[ni] > nd) {
          distField[ni] = nd;
          bfsQ.push(br + 1, bc);
        }
      }
      if (bc > 0) {
        const ni = br * cols + bc - 1;
        if (field[ni] && distField[ni] > nd) {
          distField[ni] = nd;
          bfsQ.push(br, bc - 1);
        }
      }
      if (bc < cols - 1) {
        const ni = br * cols + bc + 1;
        if (field[ni] && distField[ni] > nd) {
          distField[ni] = nd;
          bfsQ.push(br, bc + 1);
        }
      }
    }

    // --- Grid-resolution SDF + Catmull-Rom interpolation ---
    // 1. Compute SDF at GRID resolution (where each cell = 1 unit)
    // 2. Catmull-Rom interpolate at render resolution for smooth contours
    // This produces smooth curves because the SDF varies continuously,
    // unlike binary data which has hard 0/1 transitions.
    const smooth = new Float32Array(cols * rows);

    const gData = grid.data;
    const gSz = grid.size;
    const gCell = grid.cellSize;
    const gHalf = grid.halfMap;

    // Sub-grid covering this territory + padding
    const pad = 6;
    const sMinC = Math.max(0, bounds.minC - pad);
    const sMaxC = Math.min(gSz - 1, bounds.maxC + pad);
    const sMinR = Math.max(0, bounds.minR - pad);
    const sMaxR = Math.min(gSz - 1, bounds.maxR + pad);
    const sCols = sMaxC - sMinC + 1;
    const sRows = sMaxR - sMinR + 1;

    // Binary ownership at grid resolution
    const gOwn = new Uint8Array(sCols * sRows);
    for (let r = 0; r < sRows; r++) {
      for (let c = 0; c < sCols; c++) {
        if (gData[(sMinR + r) * gSz + sMinC + c] === id)
          gOwn[r * sCols + c] = 1;
      }
    }

    // Chamfer DT at grid resolution
    const dE = new Float32Array(sCols * sRows); // dist to nearest empty
    const dF = new Float32Array(sCols * sRows); // dist to nearest filled
    dE.fill(9999);
    dF.fill(9999);
    for (let i = 0; i < sCols * sRows; i++) {
      if (!gOwn[i]) dE[i] = 0;
      else dF[i] = 0;
    }

    const D1 = 1.0,
      D2 = 1.414;
    const chamfer = (d: Float32Array, w: number, h: number) => {
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const i = r * w + c;
          if (r > 0) {
            d[i] = Math.min(d[i], d[i - w] + D1);
            if (c > 0) d[i] = Math.min(d[i], d[i - w - 1] + D2);
            if (c < w - 1) d[i] = Math.min(d[i], d[i - w + 1] + D2);
          }
          if (c > 0) d[i] = Math.min(d[i], d[i - 1] + D1);
        }
      }
      for (let r = h - 1; r >= 0; r--) {
        for (let c = w - 1; c >= 0; c--) {
          const i = r * w + c;
          if (r < h - 1) {
            d[i] = Math.min(d[i], d[i + w] + D1);
            if (c > 0) d[i] = Math.min(d[i], d[i + w - 1] + D2);
            if (c < w - 1) d[i] = Math.min(d[i], d[i + w + 1] + D2);
          }
          if (c < w - 1) d[i] = Math.min(d[i], d[i + 1] + D1);
        }
      }
    };

    chamfer(dE, sCols, sRows);
    chamfer(dF, sCols, sRows);

    // Grid-resolution SDF: positive inside, negative outside
    const gridSDF = new Float32Array(sCols * sRows);
    for (let i = 0; i < sCols * sRows; i++) {
      gridSDF[i] = gOwn[i] ? dE[i] : -dF[i];
    }

    // Catmull-Rom interpolation of grid SDF at each render cell (fully inlined)
    const BAND = 3;
    const halfBand = 0.5 / BAND;
    const sColsM1 = sCols - 1;
    const sRowsM1 = sRows - 1;
    const gxBase = gHalf / gCell - 0.5 - sMinC;
    const gzBase = gHalf / gCell - 0.5 - sMinR;
    const cellToGrid = 1 / gCell;

    for (let r = 0; r < rows; r++) {
      const gz = (minZ + r * CELL_SIZE) * cellToGrid + gzBase;
      const gj = Math.floor(gz);
      const fz = gz - gj;
      const fz2 = fz * fz,
        fz3 = fz2 * fz;
      // Z weights hoisted per row
      const wz0 = 0.5 * (-fz + 2 * fz2 - fz3);
      const wz1 = 0.5 * (2 - 5 * fz2 + 3 * fz3);
      const wz2 = 0.5 * (fz + 4 * fz2 - 3 * fz3);
      const wz3 = 0.5 * (-fz2 + fz3);
      // Row offsets clamped once per row
      const r0 = (gj - 1 < 0 ? 0 : gj - 1 > sRowsM1 ? sRowsM1 : gj - 1) * sCols;
      const r1 = (gj < 0 ? 0 : gj > sRowsM1 ? sRowsM1 : gj) * sCols;
      const r2 = (gj + 1 < 0 ? 0 : gj + 1 > sRowsM1 ? sRowsM1 : gj + 1) * sCols;
      const r3 = (gj + 2 < 0 ? 0 : gj + 2 > sRowsM1 ? sRowsM1 : gj + 2) * sCols;
      const rowOff = r * cols;

      for (let c = 0; c < cols; c++) {
        const gx = (minX + c * CELL_SIZE) * cellToGrid + gxBase;
        const gi = Math.floor(gx);
        const fx = gx - gi;
        const fx2 = fx * fx,
          fx3 = fx2 * fx;
        const wx0 = 0.5 * (-fx + 2 * fx2 - fx3);
        const wx1 = 0.5 * (2 - 5 * fx2 + 3 * fx3);
        const wx2 = 0.5 * (fx + 4 * fx2 - 3 * fx3);
        const wx3 = 0.5 * (-fx2 + fx3);

        const c0 = gi - 1 < 0 ? 0 : gi - 1 > sColsM1 ? sColsM1 : gi - 1;
        const c1 = gi < 0 ? 0 : gi > sColsM1 ? sColsM1 : gi;
        const c2 = gi + 1 < 0 ? 0 : gi + 1 > sColsM1 ? sColsM1 : gi + 1;
        const c3 = gi + 2 < 0 ? 0 : gi + 2 > sColsM1 ? sColsM1 : gi + 2;

        const sd =
          wz0 *
            (wx0 * gridSDF[r0 + c0] +
              wx1 * gridSDF[r0 + c1] +
              wx2 * gridSDF[r0 + c2] +
              wx3 * gridSDF[r0 + c3]) +
          wz1 *
            (wx0 * gridSDF[r1 + c0] +
              wx1 * gridSDF[r1 + c1] +
              wx2 * gridSDF[r1 + c2] +
              wx3 * gridSDF[r1 + c3]) +
          wz2 *
            (wx0 * gridSDF[r2 + c0] +
              wx1 * gridSDF[r2 + c1] +
              wx2 * gridSDF[r2 + c2] +
              wx3 * gridSDF[r2 + c3]) +
          wz3 *
            (wx0 * gridSDF[r3 + c0] +
              wx1 * gridSDF[r3 + c1] +
              wx2 * gridSDF[r3 + c2] +
              wx3 * gridSDF[r3 + c3]);

        const v = sd * halfBand + 0.5;
        smooth[rowOff + c] = v < 0 ? 0 : v > 1 ? 1 : v;
      }
    }

    // Light blur pass on boundary cells to remove remaining staircase artifacts
    {
      const blurSrc = new Float32Array(smooth);
      for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
          const i = r * cols + c;
          const v = blurSrc[i];
          if (v > 0.01 && v < 0.99) {
            smooth[i] =
              (blurSrc[i - cols - 1] +
                blurSrc[i - cols] +
                blurSrc[i - cols + 1] +
                blurSrc[i - 1] +
                v * 4 +
                blurSrc[i + 1] +
                blurSrc[i + cols - 1] +
                blurSrc[i + cols] +
                blurSrc[i + cols + 1]) /
              12;
          }
        }
      }
    }

    // --- Build mesh with height gradient (raised plateau with beveled edges) ---
    const verts: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const vertMap = new Map<number, number>();

    const addVert = (x: number, z: number): number => {
      const qx = Math.round(x * 1000);
      const qz = Math.round(z * 1000);
      const key = qx * 131072 + qz;
      const existing = vertMap.get(key);
      if (existing !== undefined) return existing;

      const gc = Math.max(
        0,
        Math.min(cols - 1, Math.round((x - minX) / CELL_SIZE)),
      );
      const gr = Math.max(
        0,
        Math.min(rows - 1, Math.round((z - minZ) / CELL_SIZE)),
      );
      const dist = distField[gr * cols + gc];
      const t = Math.min(dist / borderCells, 1.0);
      const st = t * t * (3 - 2 * t); // smoothstep

      const y = TERRITORY_Y + st * TERRITORY_HEIGHT;

      const idx = verts.length / 3;
      verts.push(x, y, z);
      uvs.push(x / PATTERN_TILE, z / PATTERN_TILE);
      vertMap.set(key, idx);
      return idx;
    };

    const addTri = (
      x0: number,
      z0: number,
      x1: number,
      z1: number,
      x2: number,
      z2: number,
    ) => {
      indices.push(addVert(x0, z0), addVert(x1, z1), addVert(x2, z2));
    };

    const ISO = 0.5;
    const isoLerp = (a: number, b: number, va: number, vb: number): number => {
      const d = vb - va;
      if (Math.abs(d) < 0.001) return (a + b) * 0.5;
      return a + ((ISO - va) / d) * (b - a);
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
        if (config === 0) continue;

        const x0 = minX + c * CELL_SIZE;
        const x1 = minX + (c + 1) * CELL_SIZE;
        const z0 = minZ + r * CELL_SIZE;
        const z1 = minZ + (r + 1) * CELL_SIZE;

        if (config === 15) {
          addTri(x0, z0, x1, z0, x1, z1);
          addTri(x0, z0, x1, z1, x0, z1);
          continue;
        }

        // Interpolated edge crossings for smooth contours
        const tmx = isoLerp(x0, x1, vTL, vTR),
          tmz = z0;
        const rmx = x1,
          rmz = isoLerp(z0, z1, vTR, vBR);
        const bmx = isoLerp(x0, x1, vBL, vBR),
          bmz = z1;
        const lmx = x0,
          lmz = isoLerp(z0, z1, vTL, vBL);

        switch (config) {
          case 1:
            addTri(x0, z1, lmx, lmz, bmx, bmz);
            break;
          case 2:
            addTri(x1, z1, bmx, bmz, rmx, rmz);
            break;
          case 4:
            addTri(x1, z0, rmx, rmz, tmx, tmz);
            break;
          case 8:
            addTri(x0, z0, tmx, tmz, lmx, lmz);
            break;
          case 3:
            addTri(x0, z1, lmx, lmz, rmx, rmz);
            addTri(x0, z1, rmx, rmz, x1, z1);
            break;
          case 6:
            addTri(x1, z0, tmx, tmz, bmx, bmz);
            addTri(x1, z0, bmx, bmz, x1, z1);
            break;
          case 12:
            addTri(x0, z0, x1, z0, rmx, rmz);
            addTri(x0, z0, rmx, rmz, lmx, lmz);
            break;
          case 9:
            addTri(x0, z0, tmx, tmz, bmx, bmz);
            addTri(x0, z0, bmx, bmz, x0, z1);
            break;
          case 5:
            addTri(x0, z1, lmx, lmz, bmx, bmz);
            addTri(x1, z0, rmx, rmz, tmx, tmz);
            break;
          case 10:
            addTri(x0, z0, tmx, tmz, lmx, lmz);
            addTri(x1, z1, bmx, bmz, rmx, rmz);
            break;
          case 7:
            addTri(x1, z0, tmx, tmz, lmx, lmz);
            addTri(x1, z0, lmx, lmz, x0, z1);
            addTri(x1, z0, x0, z1, x1, z1);
            break;
          case 11:
            addTri(x0, z0, tmx, tmz, rmx, rmz);
            addTri(x0, z0, rmx, rmz, x1, z1);
            addTri(x0, z0, x1, z1, x0, z1);
            break;
          case 13:
            addTri(x0, z0, x1, z0, rmx, rmz);
            addTri(x0, z0, rmx, rmz, bmx, bmz);
            addTri(x0, z0, bmx, bmz, x0, z1);
            break;
          case 14:
            addTri(x0, z0, x1, z0, x1, z1);
            addTri(x0, z0, x1, z1, bmx, bmz);
            addTri(x0, z0, bmx, bmz, lmx, lmz);
            break;
        }
      }
    }

    if (verts.length === 0) {
      this.territoryObjects.delete(id);
      return;
    }

    // Main raised territory mesh
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const order = ++this.territoryRenderOrder;

    const mesh = new THREE.Mesh(geo, mat!);
    mesh.renderOrder = order;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.territoryObjects.set(id, mesh);

    // Drop shadow: flat copy of the territory at ground level, offset to simulate light direction
    const oldShadow = this.territoryShadows.get(id);
    if (oldShadow) {
      this.scene.remove(oldShadow);
      oldShadow.geometry.dispose();
    }

    // Drop shadow offset matches top-left sun: shadow falls toward +X, -Z
    const shadowOffset = 0.18;
    const shadowPositions = new Float32Array(verts.length);
    for (let i = 0; i < verts.length; i += 3) {
      shadowPositions[i] = verts[i] + shadowOffset;
      shadowPositions[i + 1] = 0.015;
      shadowPositions[i + 2] = verts[i + 2] - shadowOffset;
    }
    const shadowGeo = new THREE.BufferGeometry();
    shadowGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(shadowPositions, 3),
    );
    shadowGeo.setIndex(indices);

    const shadowMesh = new THREE.Mesh(shadowGeo, this.shadowMaterial!);
    shadowMesh.renderOrder = order - 1;
    this.scene.add(shadowMesh);
    this.territoryShadows.set(id, shadowMesh);
  }

  private static readonly MAX_TRAIL_POINTS = 512;

  updateTrail(
    id: number,
    trail: Vec2[],
    color: number,
    startTangent: Vec2 | null = null,
  ): void {
    const prevLen = this.trailLengths.get(id) ?? 0;
    if (prevLen === trail.length && trail.length > 0) return;
    this.trailLengths.set(id, trail.length);

    let mesh = this.trailMeshes.get(id);

    if (trail.length < 2) {
      if (mesh) mesh.visible = false;
      return;
    }

    const halfWidth = 0.25;
    const y = TRAIL_Y;
    const maxPts = Renderer.MAX_TRAIL_POINTS;
    const n = Math.min(trail.length, maxPts);

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

    for (let i = 0; i < n; i++) {
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

      const off = i * 6;
      posArr[off] = trail[i].x + px;
      posArr[off + 1] = y;
      posArr[off + 2] = trail[i].z + pz;
      posArr[off + 3] = trail[i].x - px;
      posArr[off + 4] = y;
      posArr[off + 5] = trail[i].z - pz;
    }

    const posAttr = mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
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

  render(): void {
    this.renderer.render(this.scene, this.camera);
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
    const terr = this.territoryObjects.get(id);
    if (terr) {
      this.scene.remove(terr);
      terr.geometry.dispose();
      this.territoryObjects.delete(id);
    }
    const shadow = this.territoryShadows.get(id);
    if (shadow) {
      this.scene.remove(shadow);
      shadow.geometry.dispose();
      this.territoryShadows.delete(id);
    }
    const tMat = this.territoryMaterials.get(id);
    if (tMat) {
      tMat.dispose();
      this.territoryMaterials.delete(id);
    }
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
    this.territorySkinIds.delete(id);
    this.avatarLastPositions.delete(id);
    this.hideAvatar(id);
  }

  dispose(): void {
    for (const [id] of this.avatars) this.cleanupPlayer(id);
    for (const tex of this.patternTextures.values()) tex?.dispose();
    this.patternTextures.clear();
    this.renderer.dispose();
  }
}
