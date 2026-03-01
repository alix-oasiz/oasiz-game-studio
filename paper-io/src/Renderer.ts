import * as THREE from 'three';
import { MAP_SIZE, BOARD_COLOR, BG_COLOR, GRID_LINE_COLOR, TERRITORY_OPACITY, TRAIL_OPACITY, type Vec2 } from './constants.ts';

const TERRITORY_Y = 0.03;
const TRAIL_Y = 0.06;

/** Merge multiple BufferGeometries into one */
function mergeBufferGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (geometries.length === 0) return null;

  let totalVerts = 0;
  let totalIndices = 0;
  for (const g of geometries) {
    totalVerts += g.getAttribute('position').count;
    totalIndices += g.index ? g.index.count : g.getAttribute('position').count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = new Uint32Array(totalIndices);

  let vertOffset = 0;
  let idxOffset = 0;

  for (const g of geometries) {
    const pos = g.getAttribute('position');
    const norm = g.getAttribute('normal');
    const idx = g.index;

    for (let i = 0; i < pos.count; i++) {
      positions[(vertOffset + i) * 3] = pos.getX(i);
      positions[(vertOffset + i) * 3 + 1] = pos.getY(i);
      positions[(vertOffset + i) * 3 + 2] = pos.getZ(i);
      if (norm) {
        normals[(vertOffset + i) * 3] = norm.getX(i);
        normals[(vertOffset + i) * 3 + 1] = norm.getY(i);
        normals[(vertOffset + i) * 3 + 2] = norm.getZ(i);
      }
    }

    if (idx) {
      for (let i = 0; i < idx.count; i++) {
        indices[idxOffset + i] = idx.getX(i) + vertOffset;
      }
      idxOffset += idx.count;
    } else {
      for (let i = 0; i < pos.count; i++) {
        indices[idxOffset + i] = vertOffset + i;
      }
      idxOffset += pos.count;
    }

    vertOffset += pos.count;
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(new THREE.BufferAttribute(indices, 1));
  return merged;
}

export class Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  private territoryObjects: Map<number, THREE.Mesh> = new Map();
  private trailMeshes: Map<number, THREE.Mesh> = new Map();
  private avatars: Map<number, THREE.Group> = new Map();

  private cameraTarget: Vec2 = { x: 0, z: 0 };

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);
    this.scene.fog = new THREE.Fog(BG_COLOR, 60, 100);

    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
    this.camera.position.set(0, 40, 25);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.createBoard();
    this.createLighting();

    window.addEventListener('resize', () => this.onResize());
  }

  private createBoard(): void {
    const boardGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
    const boardMat = new THREE.MeshLambertMaterial({ color: BOARD_COLOR });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.rotation.x = -Math.PI / 2;
    board.receiveShadow = true;
    this.scene.add(board);

    const gridHelper = new THREE.GridHelper(MAP_SIZE, MAP_SIZE, GRID_LINE_COLOR, GRID_LINE_COLOR);
    gridHelper.position.y = 0.01;
    (gridHelper.material as THREE.Material).opacity = 0.4;
    (gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(gridHelper);

    const borderGeo = new THREE.EdgesGeometry(new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE));
    const borderMat = new THREE.LineBasicMaterial({ color: 0xFFFFFF, opacity: 0.2, transparent: true });
    const border = new THREE.LineSegments(borderGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.02;
    this.scene.add(border);
  }

  private createLighting(): void {
    const ambient = new THREE.AmbientLight(0x1a1a2e, 0.6);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(20, 40, 20);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.left = -40;
    dir.shadow.camera.right = 40;
    dir.shadow.camera.top = 40;
    dir.shadow.camera.bottom = -40;
    this.scene.add(dir);

    const point = new THREE.PointLight(0x00E5FF, 0.4, 80);
    point.position.set(0, 10, 0);
    this.scene.add(point);
  }

  createAvatar(id: number, color: number): THREE.Group {
    const group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.7, 0.35, 0.7);
    const bodyMat = new THREE.MeshToonMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.175;
    body.castShadow = true;
    group.add(body);

    const ringGeo = new THREE.TorusGeometry(0.45, 0.04, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 });
    ringGeo.rotateX(Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.4;
    group.add(ring);

    this.scene.add(group);
    this.avatars.set(id, group);
    return group;
  }

  updateAvatar(id: number, pos: Vec2, time: number, moveDir?: Vec2): void {
    const avatar = this.avatars.get(id);
    if (!avatar || !avatar.visible) return;
    avatar.position.x = pos.x;
    avatar.position.z = pos.z;

    // Rotate to face movement direction
    if (moveDir && (moveDir.x !== 0 || moveDir.z !== 0)) {
      const targetAngle = Math.atan2(moveDir.x, moveDir.z);
      // Smooth rotation with lerp
      let current = avatar.rotation.y;
      let delta = targetAngle - current;
      // Normalize delta to [-PI, PI]
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

  /**
   * Direct polygon territory rendering using THREE.ShapeGeometry.
   * Each polygon is converted to a Shape and triangulated by Three.js,
   * producing smooth edges that follow the actual polygon boundary.
   */
  updateTerritory(id: number, polygons: Vec2[][], color: number): void {
    const old = this.territoryObjects.get(id);
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
      if (old.material instanceof THREE.Material) old.material.dispose();
    }

    if (polygons.length === 0) {
      this.territoryObjects.delete(id);
      return;
    }

    // Pre-blend color
    const boardCol = new THREE.Color(BOARD_COLOR);
    const playerCol = new THREE.Color(color);
    const blended = boardCol.lerp(playerCol, TERRITORY_OPACITY);

    // Build a merged geometry from all polygon shapes
    const geometries: THREE.BufferGeometry[] = [];

    for (const poly of polygons) {
      if (poly.length < 3) continue;

      const shape = new THREE.Shape();
      // Shape works in 2D (x, y) — we map our (x, z) to shape's (x, y)
      shape.moveTo(poly[0].x, poly[0].z);
      for (let i = 1; i < poly.length; i++) {
        shape.lineTo(poly[i].x, poly[i].z);
      }
      shape.closePath();

      const shapeGeo = new THREE.ShapeGeometry(shape);

      // ShapeGeometry produces vertices in the XY plane;
      // rotate to lie flat on XZ plane (y becomes z, set y to TERRITORY_Y)
      const posAttr = shapeGeo.getAttribute('position');
      for (let i = 0; i < posAttr.count; i++) {
        const x = posAttr.getX(i);
        const y = posAttr.getY(i); // this is our z
        posAttr.setXYZ(i, x, TERRITORY_Y, y);
      }
      posAttr.needsUpdate = true;
      shapeGeo.computeVertexNormals();

      geometries.push(shapeGeo);
    }

    if (geometries.length === 0) {
      this.territoryObjects.delete(id);
      return;
    }

    // Merge all polygon geometries into one
    const merged = mergeBufferGeometries(geometries);
    for (const g of geometries) g.dispose();

    if (!merged) {
      this.territoryObjects.delete(id);
      return;
    }

    const mat = new THREE.MeshLambertMaterial({
      color: blended,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const mesh = new THREE.Mesh(merged, mat);
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.territoryObjects.set(id, mesh);
  }

  /** Update trail as a thick ribbon mesh */
  updateTrail(id: number, trail: Vec2[], color: number): void {
    const old = this.trailMeshes.get(id);
    if (old) {
      this.scene.remove(old);
      this.disposeObject(old);
      this.trailMeshes.delete(id);
    }

    if (trail.length < 2) return;

    const halfWidth = 0.25;
    const y = TRAIL_Y;
    const verts: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < trail.length; i++) {
      let dx: number, dz: number;
      if (i === 0) {
        dx = trail[1].x - trail[0].x;
        dz = trail[1].z - trail[0].z;
      } else if (i === trail.length - 1) {
        dx = trail[i].x - trail[i - 1].x;
        dz = trail[i].z - trail[i - 1].z;
      } else {
        dx = trail[i + 1].x - trail[i - 1].x;
        dz = trail[i + 1].z - trail[i - 1].z;
      }
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      const px = -dz / len * halfWidth;
      const pz = dx / len * halfWidth;

      verts.push(trail[i].x + px, y, trail[i].z + pz);
      verts.push(trail[i].x - px, y, trail[i].z - pz);

      if (i < trail.length - 1) {
        const vi = i * 2;
        indices.push(vi, vi + 1, vi + 2);
        indices.push(vi + 1, vi + 3, vi + 2);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: TRAIL_OPACITY,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geo, mat);
    this.scene.add(mesh);
    this.trailMeshes.set(id, mesh);
  }

  setCameraTarget(pos: Vec2): void {
    this.cameraTarget.x = pos.x;
    this.cameraTarget.z = pos.z;
    this.camera.position.x = pos.x;
    this.camera.position.y = 40;
    this.camera.position.z = pos.z + 25;
    this.camera.lookAt(pos.x, 0, pos.z);
  }

  updateCamera(targetPos: Vec2, dt: number): void {
    const lerpFactor = 1 - Math.exp(-4 * dt);
    this.cameraTarget.x += (targetPos.x - this.cameraTarget.x) * lerpFactor;
    this.cameraTarget.z += (targetPos.z - this.cameraTarget.z) * lerpFactor;

    this.camera.position.x = this.cameraTarget.x;
    this.camera.position.y = 40;
    this.camera.position.z = this.cameraTarget.z + 25;
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
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  cleanupPlayer(id: number): void {
    const terr = this.territoryObjects.get(id);
    if (terr) {
      this.scene.remove(terr);
      terr.geometry.dispose();
      if (terr.material instanceof THREE.Material) terr.material.dispose();
      this.territoryObjects.delete(id);
    }
    const trail = this.trailMeshes.get(id);
    if (trail) {
      this.scene.remove(trail);
      this.disposeObject(trail);
      this.trailMeshes.delete(id);
    }
    this.hideAvatar(id);
  }

  dispose(): void {
    for (const [id] of this.avatars) this.cleanupPlayer(id);
    this.renderer.dispose();
  }
}
