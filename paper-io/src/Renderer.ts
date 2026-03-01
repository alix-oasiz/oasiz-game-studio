import * as THREE from 'three';
import { MAP_SIZE, BOARD_COLOR, BG_COLOR, GRID_LINE_COLOR, TERRITORY_OPACITY, TRAIL_OPACITY, type Vec2 } from './constants.ts';

export class Renderer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;

  // Per-player visual objects
  private territoryObjects: Map<number, THREE.Object3D> = new Map();
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
    // Main board surface
    const boardGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE);
    const boardMat = new THREE.MeshLambertMaterial({ color: BOARD_COLOR });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.rotation.x = -Math.PI / 2;
    board.receiveShadow = true;
    this.scene.add(board);

    // Grid lines
    const gridHelper = new THREE.GridHelper(MAP_SIZE, MAP_SIZE, GRID_LINE_COLOR, GRID_LINE_COLOR);
    gridHelper.position.y = 0.01;
    (gridHelper.material as THREE.Material).opacity = 0.4;
    (gridHelper.material as THREE.Material).transparent = true;
    this.scene.add(gridHelper);

    // Border
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

  updateAvatar(id: number, pos: Vec2, time: number): void {
    const avatar = this.avatars.get(id);
    if (!avatar || !avatar.visible) return;
    avatar.position.x = pos.x;
    avatar.position.z = pos.z;

    // Pulse ring
    const ring = avatar.children[1] as THREE.Mesh;
    if (ring?.material instanceof THREE.MeshBasicMaterial) {
      ring.material.opacity = 0.6 + 0.4 * Math.sin(time * 1.2 * Math.PI * 2);
    }
  }

  hideAvatar(id: number): void {
    const avatar = this.avatars.get(id);
    if (avatar) avatar.visible = false;
  }

  /** Update territory polygon mesh for a player */
  updateTerritory(id: number, polygons: Vec2[][], color: number): void {
    // Remove old mesh
    const old = this.territoryObjects.get(id);
    if (old) {
      this.scene.remove(old);
      this.disposeObject(old);
    }

    if (polygons.length === 0) {
      this.territoryObjects.delete(id);
      return;
    }

    // Create combined shape from all polygons
    const shape = new THREE.Shape();
    for (let pi = 0; pi < polygons.length; pi++) {
      const poly = polygons[pi];
      if (poly.length < 3) continue;

      if (pi === 0) {
        shape.moveTo(poly[0].x, poly[0].z);
        for (let i = 1; i < poly.length; i++) {
          shape.lineTo(poly[i].x, poly[i].z);
        }
        shape.closePath();
      } else {
        // Additional polygons as separate shapes — we'll merge by creating separate meshes
        // For simplicity, add as holes or just create more geometry
        const path = new THREE.Path();
        path.moveTo(poly[0].x, poly[0].z);
        for (let i = 1; i < poly.length; i++) {
          path.lineTo(poly[i].x, poly[i].z);
        }
        path.closePath();
        // We can't easily union shapes in Three.js, so we'll create a group approach below
      }
    }

    // Create geometry for the first polygon
    const geo = new THREE.ShapeGeometry(shape);
    const mat = new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      opacity: TERRITORY_OPACITY,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.03;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // For additional polygons, create separate meshes and group them
    if (polygons.length > 1) {
      const group = new THREE.Group();
      group.add(mesh);
      // Remove mesh from scene since we're putting it in the group
      this.scene.remove(mesh);

      // Add first mesh back to group
      for (let pi = 1; pi < polygons.length; pi++) {
        const poly = polygons[pi];
        if (poly.length < 3) continue;
        const s = new THREE.Shape();
        s.moveTo(poly[0].x, poly[0].z);
        for (let i = 1; i < poly.length; i++) {
          s.lineTo(poly[i].x, poly[i].z);
        }
        s.closePath();
        const g = new THREE.ShapeGeometry(s);
        const m = new THREE.Mesh(g, mat);
        m.rotation.x = -Math.PI / 2;
        m.position.y = 0.03;
        m.receiveShadow = true;
        group.add(m);
      }
      this.scene.add(group);
      this.territoryObjects.set(id, group as unknown as THREE.Mesh);
    } else {
      this.territoryObjects.set(id, mesh);
    }
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
    const y = 0.06;
    const verts: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < trail.length; i++) {
      // Compute perpendicular direction
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
      // Perpendicular (rotate 90°)
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

  /** Update camera to follow a target position */
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
      this.territoryObjects.delete(id);
    }
    const trail = this.trailMeshes.get(id);
    if (trail) {
      this.scene.remove(trail);
      this.trailMeshes.delete(id);
    }
    this.hideAvatar(id);
  }

  dispose(): void {
    for (const [id] of this.avatars) this.cleanupPlayer(id);
    this.renderer.dispose();
  }
}
