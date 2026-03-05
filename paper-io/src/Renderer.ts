import * as THREE from 'three';
import { MAP_RADIUS, BOARD_COLOR, BG_COLOR, GRID_LINE_COLOR, TRAIL_OPACITY, type Vec2 } from './constants.ts';
import { type TerritoryGrid } from './Territory.ts';

const TERRITORY_Y = 0.03;
const TERRITORY_HEIGHT = 0.14;
const TRAIL_Y = 0.22;
const CELL_SIZE = 0.18;
const BORDER_WIDTH = 1.0;

export class Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  private territoryObjects: Map<number, THREE.Mesh> = new Map();
  private territoryShadows: Map<number, THREE.Mesh> = new Map();
  private territoryMaterials: Map<number, THREE.MeshLambertMaterial> = new Map();
  private shadowMaterial: THREE.MeshBasicMaterial | null = null;
  private trailMeshes: Map<number, THREE.Mesh> = new Map();
  private trailMaterials: Map<number, THREE.MeshLambertMaterial> = new Map();
  private trailLengths: Map<number, number> = new Map();
  private avatars: Map<number, THREE.Group> = new Map();

  private cameraTarget: Vec2 = { x: 0, z: 0 };
  private territoryRenderOrder = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);

    const wrapper = document.getElementById('game-wrapper')!;
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

    window.addEventListener('resize', () => this.onResize());
  }

  private createBoard(): void {
    const boardGeo = new THREE.CircleGeometry(MAP_RADIUS, 48);
    const boardMat = new THREE.MeshBasicMaterial({ color: BOARD_COLOR });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.rotation.x = -Math.PI / 2;
    this.scene.add(board);

    const ringCount = MAP_RADIUS;
    const ringSegments = 48;
    const allRingVerts: number[] = [];
    const allRingIndices: number[] = [];
    let vertOffset = 0;
    for (let i = 1; i <= ringCount; i++) {
      const inner = i - 0.02;
      const outer = i + 0.02;
      for (let s = 0; s <= ringSegments; s++) {
        const angle = (Math.PI * 2 * s) / ringSegments;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        allRingVerts.push(cos * inner, 0.01, sin * inner);
        allRingVerts.push(cos * outer, 0.01, sin * outer);
      }
      for (let s = 0; s < ringSegments; s++) {
        const base = vertOffset + s * 2;
        allRingIndices.push(base, base + 1, base + 2);
        allRingIndices.push(base + 1, base + 3, base + 2);
      }
      vertOffset += (ringSegments + 1) * 2;
    }
    const ringsGeo = new THREE.BufferGeometry();
    ringsGeo.setAttribute('position', new THREE.Float32BufferAttribute(allRingVerts, 3));
    ringsGeo.setIndex(allRingIndices);
    const ringsMat = new THREE.MeshBasicMaterial({ color: GRID_LINE_COLOR, transparent: true, opacity: 0.15, side: THREE.DoubleSide });
    this.scene.add(new THREE.Mesh(ringsGeo, ringsMat));

    const borderCurve = new THREE.EllipseCurve(0, 0, MAP_RADIUS, MAP_RADIUS, 0, Math.PI * 2, false, 0);
    const borderPoints = borderCurve.getPoints(64);
    const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPoints);
    const borderMat = new THREE.LineBasicMaterial({ color: 0xFFFFFF, opacity: 0.35, transparent: true });
    const border = new THREE.LineLoop(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.02;
    this.scene.add(border);
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

  createAvatar(id: number, color: number, name?: string, texture?: THREE.Texture | null, model?: THREE.Group | null): THREE.Group {
    const group = new THREE.Group();

    if (model && model.children.length > 0) {
      const clone = model.clone(true);
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          child.material = (child.material as THREE.Material).clone();
        }
      });
      clone.name = 'model-body';
      group.add(clone);
    } else {
      const bodyGeo = new THREE.BoxGeometry(0.7, 0.35, 0.7);
      let bodyMat: THREE.Material;
      if (texture) {
        bodyMat = new THREE.MeshLambertMaterial({ map: texture });
      } else {
        bodyMat = new THREE.MeshLambertMaterial({ color });
      }
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.y = 0.175;
      body.name = 'box-body';
      group.add(body);
    }

    const ringGeo = new THREE.TorusGeometry(0.45, 0.04, 6, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.4;
    ring.name = 'ring';
    group.add(ring);

    if (name) {
      const label = this.createTextSprite(name);
      label.position.y = 1.1;
      label.name = 'label';
      group.add(label);
    }

    this.scene.add(group);
    this.avatars.set(id, group);
    return group;
  }

  replaceAvatarBody(id: number, model: THREE.Group): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;

    const oldBody = avatar.children.find(c => c.name === 'box-body' || c.name === 'model-body');
    if (oldBody) {
      avatar.remove(oldBody);
      if (oldBody instanceof THREE.Mesh) {
        oldBody.geometry.dispose();
        if (oldBody.material instanceof THREE.Material) oldBody.material.dispose();
      }
    }

    const clone = model.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        child.material = (child.material as THREE.Material).clone();
      }
    });
    clone.name = 'model-body';
    avatar.add(clone);
  }

  private createTextSprite(text: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 256;
    canvas.height = 64;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 36px Quicksand, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow for readability
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillText(text, canvas.width / 2 + 1, canvas.height / 2 + 1);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2, 0.5, 1);
    return sprite;
  }

  updateAvatar(id: number, pos: Vec2, time: number, moveDir?: Vec2): void {
    const avatar = this.avatars.get(id);
    if (!avatar || !avatar.visible) return;
    avatar.position.x = pos.x;
    avatar.position.z = pos.z;

    if (moveDir && (moveDir.x !== 0 || moveDir.z !== 0)) {
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      let current = avatar.rotation.y;
      let delta = targetAngle - current;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      avatar.rotation.y = current + delta * 0.25;
    }

    const ring = avatar.getObjectByName('ring') as THREE.Mesh | undefined;
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
    const oldLabel = avatar.getObjectByName('label');
    if (oldLabel) {
      avatar.remove(oldLabel);
      if (oldLabel instanceof THREE.Sprite && oldLabel.material instanceof THREE.SpriteMaterial) {
        oldLabel.material.map?.dispose();
        oldLabel.material.dispose();
      }
    }
    const label = this.createTextSprite(name);
    label.position.y = 1.1;
    label.name = 'label';
    avatar.add(label);
  }

  setRingColor(id: number, color: number): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;
    const ring = avatar.getObjectByName('ring') as THREE.Mesh | undefined;
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
    const goldMat = new THREE.MeshBasicMaterial({ color: 0xFFD700 });
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

  updateTerritory(id: number, grid: TerritoryGrid, color: number): void {
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
      this.territoryMaterials.delete(id);
      return;
    }

    let mat = this.territoryMaterials.get(id);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({
        color: color,
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
        if (!field[i]) { distField[i] = 0; continue; }
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1 ||
            !field[(r - 1) * cols + c] || !field[(r + 1) * cols + c] ||
            !field[r * cols + c - 1] || !field[r * cols + c + 1]) {
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
      if (br > 0)        { const ni = (br - 1) * cols + bc;     if (field[ni] && distField[ni] > nd) { distField[ni] = nd; bfsQ.push(br - 1, bc); } }
      if (br < rows - 1) { const ni = (br + 1) * cols + bc;     if (field[ni] && distField[ni] > nd) { distField[ni] = nd; bfsQ.push(br + 1, bc); } }
      if (bc > 0)        { const ni = br * cols + bc - 1;       if (field[ni] && distField[ni] > nd) { distField[ni] = nd; bfsQ.push(br, bc - 1); } }
      if (bc < cols - 1) { const ni = br * cols + bc + 1;       if (field[ni] && distField[ni] > nd) { distField[ni] = nd; bfsQ.push(br, bc + 1); } }
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
        if (gData[(sMinR + r) * gSz + sMinC + c] === id) gOwn[r * sCols + c] = 1;
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

    const D1 = 1.0, D2 = 1.414;
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
      const fz2 = fz * fz, fz3 = fz2 * fz;
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
        const fx2 = fx * fx, fx3 = fx2 * fx;
        const wx0 = 0.5 * (-fx + 2 * fx2 - fx3);
        const wx1 = 0.5 * (2 - 5 * fx2 + 3 * fx3);
        const wx2 = 0.5 * (fx + 4 * fx2 - 3 * fx3);
        const wx3 = 0.5 * (-fx2 + fx3);

        const c0 = gi - 1 < 0 ? 0 : gi - 1 > sColsM1 ? sColsM1 : gi - 1;
        const c1 = gi < 0 ? 0 : gi > sColsM1 ? sColsM1 : gi;
        const c2 = gi + 1 < 0 ? 0 : gi + 1 > sColsM1 ? sColsM1 : gi + 1;
        const c3 = gi + 2 < 0 ? 0 : gi + 2 > sColsM1 ? sColsM1 : gi + 2;

        const sd =
          wz0 * (wx0 * gridSDF[r0 + c0] + wx1 * gridSDF[r0 + c1] + wx2 * gridSDF[r0 + c2] + wx3 * gridSDF[r0 + c3]) +
          wz1 * (wx0 * gridSDF[r1 + c0] + wx1 * gridSDF[r1 + c1] + wx2 * gridSDF[r1 + c2] + wx3 * gridSDF[r1 + c3]) +
          wz2 * (wx0 * gridSDF[r2 + c0] + wx1 * gridSDF[r2 + c1] + wx2 * gridSDF[r2 + c2] + wx3 * gridSDF[r2 + c3]) +
          wz3 * (wx0 * gridSDF[r3 + c0] + wx1 * gridSDF[r3 + c1] + wx2 * gridSDF[r3 + c2] + wx3 * gridSDF[r3 + c3]);

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
            smooth[i] = (
              blurSrc[i - cols - 1] + blurSrc[i - cols] + blurSrc[i - cols + 1] +
              blurSrc[i - 1] + v * 4 + blurSrc[i + 1] +
              blurSrc[i + cols - 1] + blurSrc[i + cols] + blurSrc[i + cols + 1]
            ) / 12;
          }
        }
      }
    }

    // --- Build mesh with height gradient (raised plateau with beveled edges) ---
    const verts: number[] = [];
    const indices: number[] = [];
    const vertMap = new Map<number, number>();

    const addVert = (x: number, z: number): number => {
      const qx = Math.round(x * 1000);
      const qz = Math.round(z * 1000);
      const key = qx * 131072 + qz;
      const existing = vertMap.get(key);
      if (existing !== undefined) return existing;

      const gc = Math.max(0, Math.min(cols - 1, Math.round((x - minX) / CELL_SIZE)));
      const gr = Math.max(0, Math.min(rows - 1, Math.round((z - minZ) / CELL_SIZE)));
      const dist = distField[gr * cols + gc];
      const t = Math.min(dist / borderCells, 1.0);
      const st = t * t * (3 - 2 * t); // smoothstep

      const y = TERRITORY_Y + st * TERRITORY_HEIGHT;

      const idx = verts.length / 3;
      verts.push(x, y, z);
      vertMap.set(key, idx);
      return idx;
    };

    const addTri = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number) => {
      indices.push(addVert(x0, z0), addVert(x1, z1), addVert(x2, z2));
    };

    const ISO = 0.5;
    const isoLerp = (a: number, b: number, va: number, vb: number): number => {
      const d = vb - va;
      if (Math.abs(d) < 0.001) return (a + b) * 0.5;
      return a + (ISO - va) / d * (b - a);
    };

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const vTL = smooth[r * cols + c];
        const vTR = smooth[r * cols + (c + 1)];
        const vBR = smooth[(r + 1) * cols + (c + 1)];
        const vBL = smooth[(r + 1) * cols + c];

        const config = ((vTL >= ISO ? 1 : 0) << 3) | ((vTR >= ISO ? 1 : 0) << 2) | ((vBR >= ISO ? 1 : 0) << 1) | (vBL >= ISO ? 1 : 0);
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
        const tmx = isoLerp(x0, x1, vTL, vTR), tmz = z0;
        const rmx = x1, rmz = isoLerp(z0, z1, vTR, vBR);
        const bmx = isoLerp(x0, x1, vBL, vBR), bmz = z1;
        const lmx = x0, lmz = isoLerp(z0, z1, vTL, vBL);

        switch (config) {
          case 1: addTri(x0, z1, lmx, lmz, bmx, bmz); break;
          case 2: addTri(x1, z1, bmx, bmz, rmx, rmz); break;
          case 4: addTri(x1, z0, rmx, rmz, tmx, tmz); break;
          case 8: addTri(x0, z0, tmx, tmz, lmx, lmz); break;
          case 3: addTri(x0, z1, lmx, lmz, rmx, rmz); addTri(x0, z1, rmx, rmz, x1, z1); break;
          case 6: addTri(x1, z0, tmx, tmz, bmx, bmz); addTri(x1, z0, bmx, bmz, x1, z1); break;
          case 12: addTri(x0, z0, x1, z0, rmx, rmz); addTri(x0, z0, rmx, rmz, lmx, lmz); break;
          case 9: addTri(x0, z0, tmx, tmz, bmx, bmz); addTri(x0, z0, bmx, bmz, x0, z1); break;
          case 5: addTri(x0, z1, lmx, lmz, bmx, bmz); addTri(x1, z0, rmx, rmz, tmx, tmz); break;
          case 10: addTri(x0, z0, tmx, tmz, lmx, lmz); addTri(x1, z1, bmx, bmz, rmx, rmz); break;
          case 7: addTri(x1, z0, tmx, tmz, lmx, lmz); addTri(x1, z0, lmx, lmz, x0, z1); addTri(x1, z0, x0, z1, x1, z1); break;
          case 11: addTri(x0, z0, tmx, tmz, rmx, rmz); addTri(x0, z0, rmx, rmz, x1, z1); addTri(x0, z0, x1, z1, x0, z1); break;
          case 13: addTri(x0, z0, x1, z0, rmx, rmz); addTri(x0, z0, rmx, rmz, bmx, bmz); addTri(x0, z0, bmx, bmz, x0, z1); break;
          case 14: addTri(x0, z0, x1, z0, x1, z1); addTri(x0, z0, x1, z1, bmx, bmz); addTri(x0, z0, bmx, bmz, lmx, lmz); break;
        }
      }
    }

    if (verts.length === 0) {
      this.territoryObjects.delete(id);
      return;
    }

    // Main raised territory mesh
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
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
      shadowPositions[i]     = verts[i] + shadowOffset;
      shadowPositions[i + 1] = 0.015;
      shadowPositions[i + 2] = verts[i + 2] - shadowOffset;
    }
    const shadowGeo = new THREE.BufferGeometry();
    shadowGeo.setAttribute('position', new THREE.Float32BufferAttribute(shadowPositions, 3));
    shadowGeo.setIndex(indices);

    const shadowMesh = new THREE.Mesh(shadowGeo, this.shadowMaterial!);
    shadowMesh.renderOrder = order - 1;
    this.scene.add(shadowMesh);
    this.territoryShadows.set(id, shadowMesh);
  }

  private static readonly MAX_TRAIL_POINTS = 512;

  updateTrail(id: number, trail: Vec2[], color: number): void {
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
        });
        this.trailMaterials.set(id, mat);
      }

      const posAttr = new THREE.BufferAttribute(new Float32Array(maxPts * 2 * 3), 3);
      posAttr.setUsage(THREE.DynamicDrawUsage);
      const idxArr = new Uint16Array((maxPts - 1) * 6);
      for (let i = 0; i < maxPts - 1; i++) {
        const vi = i * 2;
        const ii = i * 6;
        idxArr[ii] = vi; idxArr[ii + 1] = vi + 1; idxArr[ii + 2] = vi + 2;
        idxArr[ii + 3] = vi + 1; idxArr[ii + 4] = vi + 3; idxArr[ii + 5] = vi + 2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', posAttr);
      geo.setIndex(new THREE.BufferAttribute(idxArr, 1));

      mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.trailMeshes.set(id, mesh);
    }

    mesh.visible = true;
    const posArr = (mesh.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;

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
      const px = -dz / len * halfWidth;
      const pz = dx / len * halfWidth;

      const off = i * 6;
      posArr[off]     = trail[i].x + px;
      posArr[off + 1] = y;
      posArr[off + 2] = trail[i].z + pz;
      posArr[off + 3] = trail[i].x - px;
      posArr[off + 4] = y;
      posArr[off + 5] = trail[i].z - pz;
    }

    const posAttr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.setDrawRange(0, Math.max(0, (n - 1)) * 6);
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

  private onResize(): void {
    const wrapper = document.getElementById('game-wrapper')!;
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
    this.hideAvatar(id);
  }

  dispose(): void {
    for (const [id] of this.avatars) this.cleanupPlayer(id);
    this.renderer.dispose();
  }
}
