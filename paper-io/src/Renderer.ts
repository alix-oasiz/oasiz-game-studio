import * as THREE from 'three';
import { MAP_RADIUS, BOARD_COLOR, BG_COLOR, GRID_LINE_COLOR, TRAIL_OPACITY, type Vec2 } from './constants.ts';

/**
 * Winding number point-in-polygon test.
 * Unlike the even-odd (ray-casting) algorithm, this counts a point as inside
 * if the polygon winds around it at all — so self-intersecting polygons
 * (e.g. figure-8 trails) have NO interior holes.
 */
function pointInPolygonWinding(point: Vec2, polygon: Vec2[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let winding = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    if (pj.z <= point.z) {
      if (pi.z > point.z) {
        // Upward crossing
        const cross = (pi.x - pj.x) * (point.z - pj.z) - (point.x - pj.x) * (pi.z - pj.z);
        if (cross > 0) winding++;
      }
    } else {
      if (pi.z <= point.z) {
        // Downward crossing
        const cross = (pi.x - pj.x) * (point.z - pj.z) - (point.x - pj.x) * (pi.z - pj.z);
        if (cross < 0) winding--;
      }
    }
  }
  return winding !== 0;
}

const TERRITORY_Y = 0.03;
const TRAIL_Y = 0.06;
const CELL_SIZE = 0.1;

export class Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  private territoryObjects: Map<number, THREE.Mesh> = new Map();
  private territoryMaterials: Map<number, THREE.MeshBasicMaterial> = new Map();
  private trailMeshes: Map<number, THREE.Mesh> = new Map();
  private trailMaterials: Map<number, THREE.MeshBasicMaterial> = new Map();
  private trailLengths: Map<number, number> = new Map();
  private avatars: Map<number, THREE.Group> = new Map();

  private cameraTarget: Vec2 = { x: 0, z: 0 };
  private territoryRenderOrder = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);
    this.scene.fog = new THREE.Fog(BG_COLOR, 30, 55);

    const wrapper = document.getElementById('game-wrapper')!;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
    this.camera.position.set(0, 20, 12.5);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.createBoard();
    this.createLighting();

    window.addEventListener('resize', () => this.onResize());
  }

  private createBoard(): void {
    const boardGeo = new THREE.CircleGeometry(MAP_RADIUS, 48);
    const boardMat = new THREE.MeshLambertMaterial({ color: BOARD_COLOR });
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
    const ringsMat = new THREE.MeshBasicMaterial({ color: GRID_LINE_COLOR, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
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
    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(20, 40, 20);
    this.scene.add(dir);
  }

  createAvatar(id: number, color: number, name?: string): THREE.Group {
    const group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.7, 0.35, 0.7);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.175;
    group.add(body);

    const ringGeo = new THREE.TorusGeometry(0.45, 0.04, 6, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.4;
    group.add(ring);

    // Name label sprite
    if (name) {
      const label = this.createTextSprite(name);
      label.position.y = 1.1;
      group.add(label);
    }

    this.scene.add(group);
    this.avatars.set(id, group);
    return group;
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

    // Rotate to face movement direction
    if (moveDir && (moveDir.x !== 0 || moveDir.z !== 0)) {
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      let current = avatar.rotation.y;
      let delta = targetAngle - current;
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      avatar.rotation.y = current + delta * 0.25;
    }

    const ring = avatar.children[1] as THREE.Mesh;
    if (ring?.material instanceof THREE.MeshBasicMaterial) {
      ring.material.opacity = 0.6 + 0.4 * Math.sin(time * 1.2 * Math.PI * 2);
    }
  }

  hideAvatar(id: number): void {
    const avatar = this.avatars.get(id);
    if (avatar) avatar.visible = false;
  }

  setRingColor(id: number, color: number): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;
    const ring = avatar.children[1] as THREE.Mesh;
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

  /**
   * Grid-scan territory with marching-squares contour for smooth edges.
   * 1. Rasterize all polygons onto a fine grid using pointInPolygon (handles any shape).
   * 2. Interior cells → shared-vertex grid mesh (no gaps possible).
   * 3. Boundary cells → interpolated edge vertices via marching squares for smooth outline.
   */
  updateTerritory(id: number, polygons: Vec2[][], color: number): void {

    const old = this.territoryObjects.get(id);
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
      // Don't dispose material — we reuse it
    }

    if (polygons.length === 0) {
      this.territoryObjects.delete(id);
      this.territoryMaterials.delete(id);
      return;
    }

    // Reuse or create material per player — MeshBasicMaterial to match trail color exactly
    let mat = this.territoryMaterials.get(id);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      this.territoryMaterials.set(id, mat);
    }

    // Bounding box
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const poly of polygons) {
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
    }

    // Expand by 2 cells so flood-fill border is guaranteed outside
    minX = Math.floor(minX / CELL_SIZE) * CELL_SIZE - CELL_SIZE * 2;
    minZ = Math.floor(minZ / CELL_SIZE) * CELL_SIZE - CELL_SIZE * 2;
    maxX = Math.ceil(maxX / CELL_SIZE) * CELL_SIZE + CELL_SIZE * 2;
    maxZ = Math.ceil(maxZ / CELL_SIZE) * CELL_SIZE + CELL_SIZE * 2;

    const cols = Math.round((maxX - minX) / CELL_SIZE) + 1;
    const rows = Math.round((maxZ - minZ) / CELL_SIZE) + 1;

    const field = new Uint8Array(cols * rows);
    const pt: Vec2 = { x: 0, z: 0 };
    for (let r = 0; r < rows; r++) {
      pt.z = minZ + r * CELL_SIZE;
      for (let c = 0; c < cols; c++) {
        pt.x = minX + c * CELL_SIZE;
        for (let pi = 0; pi < polygons.length; pi++) {
          if (pointInPolygonWinding(pt, polygons[pi])) {
            field[r * cols + c] = 1;
            break;
          }
        }
      }
    }

    // Flood-fill from edges to find all EXTERIOR cells.
    // Any interior cell NOT reached by the flood is a hole → fill it.
    // This guarantees zero holes inside the territory.
    const exterior = new Uint8Array(cols * rows);
    const stack: number[] = [];

    // Seed all border cells that aren't already territory
    for (let c = 0; c < cols; c++) {
      if (!field[c]) { exterior[c] = 1; stack.push(0, c); }
      const br = (rows - 1) * cols + c;
      if (!field[br]) { exterior[br] = 1; stack.push(rows - 1, c); }
    }
    for (let r = 1; r < rows - 1; r++) {
      if (!field[r * cols]) { exterior[r * cols] = 1; stack.push(r, 0); }
      const ri = r * cols + cols - 1;
      if (!field[ri]) { exterior[ri] = 1; stack.push(r, cols - 1); }
    }

    while (stack.length > 0) {
      const sc = stack.pop()!;
      const sr = stack.pop()!;
      let nr: number, nc: number, ni: number;
      nr = sr - 1; nc = sc; if (nr >= 0) { ni = nr * cols + nc; if (!exterior[ni] && !field[ni]) { exterior[ni] = 1; stack.push(nr, nc); } }
      nr = sr + 1; nc = sc; if (nr < rows) { ni = nr * cols + nc; if (!exterior[ni] && !field[ni]) { exterior[ni] = 1; stack.push(nr, nc); } }
      nr = sr; nc = sc - 1; if (nc >= 0) { ni = nr * cols + nc; if (!exterior[ni] && !field[ni]) { exterior[ni] = 1; stack.push(nr, nc); } }
      nr = sr; nc = sc + 1; if (nc < cols) { ni = nr * cols + nc; if (!exterior[ni] && !field[ni]) { exterior[ni] = 1; stack.push(nr, nc); } }
    }

    // Fill interior holes: any non-exterior, non-field cell becomes territory
    for (let i = 0; i < cols * rows; i++) {
      if (!field[i] && !exterior[i]) field[i] = 1;
    }

    // Build mesh using marching squares
    // Each cell is defined by its 4 corner nodes.
    // Fully inside cells → 2 triangles (quad). Boundary cells → interpolated triangles.
    const verts: number[] = [];
    const indices: number[] = [];
    const vertMap = new Map<number, number>();

    const addVert = (x: number, z: number): number => {
      const qx = Math.round(x * 1000);
      const qz = Math.round(z * 1000);
      const key = qx * 131072 + qz;
      const existing = vertMap.get(key);
      if (existing !== undefined) return existing;
      const idx = verts.length / 3;
      verts.push(x, TERRITORY_Y, z);
      vertMap.set(key, idx);
      return idx;
    };

    const addTri = (x0: number, z0: number, x1: number, z1: number, x2: number, z2: number) => {
      indices.push(addVert(x0, z0), addVert(x1, z1), addVert(x2, z2));
    };

    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        // 4 corners: TL(c,r), TR(c+1,r), BR(c+1,r+1), BL(c,r+1)
        const tl = field[r * cols + c];
        const tr = field[r * cols + (c + 1)];
        const br = field[(r + 1) * cols + (c + 1)];
        const bl = field[(r + 1) * cols + c];

        const config = (tl << 3) | (tr << 2) | (br << 1) | bl;
        if (config === 0) continue; // fully outside

        const x0 = minX + c * CELL_SIZE;
        const x1 = minX + (c + 1) * CELL_SIZE;
        const z0 = minZ + r * CELL_SIZE;
        const z1 = minZ + (r + 1) * CELL_SIZE;
        const mx = (x0 + x1) / 2;
        const mz = (z0 + z1) / 2;

        if (config === 15) {
          // Fully inside — simple quad
          addTri(x0, z0, x1, z0, x1, z1);
          addTri(x0, z0, x1, z1, x0, z1);
          continue;
        }

        const tmx = mx, tmz = z0;
        const rmx = x1, rmz = mz;
        const bmx = mx, bmz = z1;
        const lmx = x0, lmz = mz;

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

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);

    const mesh = new THREE.Mesh(geo, mat!);
    mesh.renderOrder = ++this.territoryRenderOrder;
    this.scene.add(mesh);
    this.territoryObjects.set(id, mesh);
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
        mat = new THREE.MeshBasicMaterial({
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
    const terrMat = this.territoryMaterials.get(id);
    if (terrMat) {
      terrMat.dispose();
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
