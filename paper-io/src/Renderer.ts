import * as THREE from "three";
import {
  MAP_RADIUS,
  BOARD_COLOR,
  BG_COLOR,
  GRID_LINE_COLOR,
  type Vec2,
} from "./constants.ts";
import { type TerritoryGrid } from "./Territory.ts";
import { territoryArea, type TerritoryMultiPolygon } from "./polygon-ops.ts";

const TERRITORY_Y = 0.03;
const TERRITORY_HEIGHT = 0.24;
const TRAIL_Y = TERRITORY_Y + 0.018;
const TRAIL_CARVE_FLOOR_DEPTH_T = 0.82;
const TRAIL_RENDER_ORDER_OFFSET = 1;
const TRAIL_CARVE_RENDER_ORDER = 0.25;
const TRAIL_CARVE_WALL_RENDER_ORDER = 0.62;
const CELL_SIZE = 0.1;
const BORDER_WIDTH = 1.0;
const PATTERN_TILE = 5.0;
const TAKEOVER_DURATION = 0.7;
const TAKEOVER_WAVE_WIDTH = 1.8;
const CAPTURE_ASSIMILATION_DURATION = 0.62;
const AVATAR_ABSORB_PULSE_DURATION = 0.28;
const EXTRUDE_CURVE_SEGMENTS = 8;
const TERRITORY_DEPTH_LAYERS = 3;
const TERRITORY_DEPTH_OFFSET_X = -0.07;
const TERRITORY_DEPTH_OFFSET_Z = 0.14;
const TERRITORY_DEPTH_DROP = 0.02;
const TRAIL_CARVE_FLOOR_Y =
  TERRITORY_Y - TERRITORY_DEPTH_DROP * TRAIL_CARVE_FLOOR_DEPTH_T;
// Board-level carve groove (shown on bare canvas, hidden under territory via renderOrder)
// Groove ribbon sits just above the territory surface so it's never depth-culled
const BOARD_CARVE_FLOOR_Y = TERRITORY_Y + 0.004; // 0.034 — above territory (0.03), below trail (0.048)
// Half-width: thinner on canvas, thicker inside enemy territory
const BOARD_CARVE_HALF_WIDTH_CANVAS = 0.17;
const BOARD_CARVE_HALF_WIDTH_ENEMY = 0.39;
// Negated: groove sits on the far/top edge of the ribbon (away from camera)
const BOARD_CARVE_OFFSET_X = -(TERRITORY_DEPTH_OFFSET_X * 0.4); // ≈+0.028
const BOARD_CARVE_OFFSET_Z = -(TERRITORY_DEPTH_OFFSET_Z * 0.4); // ≈-0.056
const LOOP_POINT_SCALE = 1000;
const LOOP_MIN_AREA = CELL_SIZE * CELL_SIZE * 6;
const LOOP_MIN_DIST = CELL_SIZE * 0.16;
const EFFECT_UPDATE_CULL_DIST_SQ = 50 * 50;
const TERRITORY_FULL_DETAIL_RADIUS = 22;
const TERRITORY_RENDER_RADIUS = 34;
const TERRITORY_UNLOAD_RADIUS = 40;
const TERRITORY_FULL_DETAIL_RADIUS_SQ =
  TERRITORY_FULL_DETAIL_RADIUS * TERRITORY_FULL_DETAIL_RADIUS;
const TERRITORY_RENDER_RADIUS_SQ =
  TERRITORY_RENDER_RADIUS * TERRITORY_RENDER_RADIUS;
const TERRITORY_UNLOAD_RADIUS_SQ =
  TERRITORY_UNLOAD_RADIUS * TERRITORY_UNLOAD_RADIUS;
const TERRITORY_CULL_REFRESH_DIST_SQ = 4.5 * 4.5;
const MOBILE_MIN_PIXEL_RATIO = 0.85;
const MOBILE_MAX_PIXEL_RATIO = 1.15;
const MOBILE_DPR_DECREASE_FRAME_MS = 19.5;
const MOBILE_DPR_INCREASE_FRAME_MS = 14.5;
const MOBILE_DPR_DECREASE_STREAK = 8;
const MOBILE_DPR_INCREASE_STREAK = 28;
const CAPTURED_FOLLOWER_SCALE = 0.46;
const CAPTURED_FOLLOWER_HISTORY_BASE = 9;
const CAPTURED_FOLLOWER_HISTORY_STEP = 7;
const CAPTURED_FOLLOWER_MAX_HISTORY = 320;
const AVATAR_LABEL_Y = 1.76;
const CAMERA_Z_OFFSET = 11.2;

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
  origin: THREE.Vector2;
}

interface DeathSplatEffect {
  victimId: number;
  group: THREE.Group;
  body: THREE.Object3D | null;
  bodyMaterials: THREE.Material[];
  splatMesh: THREE.Mesh;
  splatMaterial: THREE.MeshBasicMaterial;
  startMs: number;
  squashDurationMs: number;
  durationMs: number;
  baseBodyPosition: THREE.Vector3 | null;
  baseBodyScale: THREE.Vector3 | null;
  baseBodyRotation: THREE.Euler | null;
  origin: THREE.Vector2;
}

interface CaptureAssimilationEffect {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  startColor: THREE.Color;
  endColor: THREE.Color;
  startMs: number;
  durationMs: number;
  origin: THREE.Vector2;
}

interface AvatarAbsorbPulseEffect {
  playerId: number;
  color: THREE.Color;
  startMs: number;
  delayMs: number;
  durationMs: number;
}

interface AvatarFollowPose {
  x: number;
  z: number;
  rotationY: number;
}

interface CapturedFollowerVisual {
  group: THREE.Group;
  body: THREE.Object3D | null;
  bodyMaterials: THREE.Material[];
  swayPhase: number;
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

interface TerritoryUpdateOptions {
  topOnly?: boolean;
}

interface TerritoryRenderCacheEntry {
  grid: TerritoryGrid;
  color: number;
  skinId: string;
  requestedTopOnly: boolean;
  renderedTopOnly: boolean | null;
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
}

interface EnemyBoardCarveSegment {
  path: Vec2[];
  color: number;
  territoryOwnerId: number | null;
  startTangent: Vec2 | null;
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
  private territoryRenderCache: Map<number, TerritoryRenderCacheEntry> =
    new Map();
  private territoryDirtyIds = new Set<number>();
  private patternTextures: Map<string, THREE.Texture | null> = new Map();
  private shadowMaterial: THREE.MeshBasicMaterial | null = null;
  private contactShadowMaterial: THREE.MeshBasicMaterial | null = null;
  private trailMeshes: Map<number, THREE.Mesh> = new Map();
  private trailMaterials: Map<number, THREE.MeshLambertMaterial> = new Map();
  private trailCarveMeshes: Map<number, THREE.Mesh> = new Map();
  private trailCarveMaterials: Map<number, THREE.MeshLambertMaterial> =
    new Map();
  private trailCarveEdgeMeshes: Map<number, THREE.Mesh> = new Map();
  private trailCarveEdgeMaterials: Map<number, THREE.MeshLambertMaterial> =
    new Map();
  private trailBoardCarveMeshes: Map<number, THREE.Mesh> = new Map();
  private trailBoardCarveMaterials: Map<number, THREE.MeshLambertMaterial> =
    new Map();
  private trailBoardCarveMesh2s: Map<number, THREE.Mesh> = new Map();
  private trailEnemyBoardCarveMaterials: Map<
    number,
    THREE.MeshLambertMaterial[]
  > = new Map();
  /** All persisted carve segments (one per visit); re-entry does not replace previous segments. */
  private trailCarvePathPersisted: Map<number, EnemyBoardCarveSegment[]> =
    new Map();
  /** Carve path from the last frame we were inside; pushed to persisted when we exit. */
  private trailLastCarveWhenInside: Map<number, EnemyBoardCarveSegment> =
    new Map();
  /** One mesh per persisted + current segment so each visit stays visible. */
  private trailEnemyBoardCarveMeshList: Map<number, THREE.Mesh[]> = new Map();
  private trailLengths: Map<number, number> = new Map();
  private trailSourceLengths: Map<number, number> = new Map();
  private trailCarveLengths: Map<number, number> = new Map();
  private trailCarveSourceLengths: Map<number, number> = new Map();
  private avatars: Map<number, THREE.Group> = new Map();
  private avatarFollowHistory: Map<number, AvatarFollowPose[]> = new Map();
  private capturedFollowers: Map<number, CapturedFollowerVisual[]> = new Map();
  private territoryTakeovers: TerritoryTakeoverEffect[] = [];
  private deathSplats: DeathSplatEffect[] = [];
  private captureAssimilations: CaptureAssimilationEffect[] = [];
  private avatarAbsorbPulses: AvatarAbsorbPulseEffect[] = [];

  private cameraTarget: Vec2 = { x: 0, z: 0 };
  private lastTerritoryCullCenter: Vec2 = {
    x: Number.POSITIVE_INFINITY,
    z: Number.POSITIVE_INFINITY,
  };
  private readonly isMobile: boolean;
  private currentPixelRatio = 1;
  private frameTimeEma = 16.7;
  private lastPixelRatioAdjustAt = 0;
  private slowFrameStreak = 0;
  private fastFrameStreak = 0;
  private territoryRenderOrder = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(BG_COLOR);

    const wrapper = document.getElementById("game-wrapper")!;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
    this.camera.position.set(0, 20, CAMERA_Z_OFFSET);
    this.camera.lookAt(0, 0, 0);

    this.isMobile = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setSize(w, h, false);
    this.currentPixelRatio = this.getTargetPixelRatio();
    this.renderer.setPixelRatio(this.currentPixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.createBoard();
    this.createLighting();

    window.addEventListener("resize", () => this.onResize());
  }

  private createBoard(): void {
    const boardGeo = new THREE.CircleGeometry(MAP_RADIUS, 64);
    const boardMat = new THREE.MeshPhongMaterial({
      color: BOARD_COLOR,
      shininess: 12,
      specular: new THREE.Color(0xd6f3ff),
    });
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.rotation.x = -Math.PI / 2;
    board.position.y = 0.005;
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
    dir.shadow.mapSize.width = 1024;
    dir.shadow.mapSize.height = 1024;
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
    this.cleanupDeathSplatsForVictim(id);
    const group = new THREE.Group();
    group.add(this.buildAvatarBody(color, texture, model));

    if (name) {
      const label = this.createTextSprite(name);
      label.position.y = AVATAR_LABEL_Y;
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
      this.disposeAvatarBody(oldBody);
    }

    avatar.add(this.buildAvatarBody(0xffffff, null, model));
  }

  updateAvatarAppearance(
    id: number,
    color: number,
    texture?: THREE.Texture | null,
    model?: THREE.Group | null,
  ): void {
    const avatar = this.avatars.get(id);
    if (!avatar) return;

    const oldBody = avatar.children.find(
      (child) => child.name === "box-body" || child.name === "model-body",
    );
    if (oldBody) {
      avatar.remove(oldBody);
      this.disposeAvatarBody(oldBody);
    }

    avatar.add(this.buildAvatarBody(color, texture, model));
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

  private buildAvatarBody(
    color: number,
    texture?: THREE.Texture | null,
    model?: THREE.Group | null,
  ): THREE.Object3D {
    if (model && model.children.length > 0) {
      const clone = model.clone(true);
      clone.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          child.material = (child.material as THREE.Material).clone();
        }
      });
      clone.name = "model-body";
      this.setupAnimatedBody(clone, "model");
      return clone;
    }

    const bodyGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    const bodyMat = texture
      ? new THREE.MeshLambertMaterial({ map: texture })
      : new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.35;
    body.name = "box-body";
    this.setupAnimatedBody(body, "cube");
    return body;
  }

  private disposeAvatarBody(body: THREE.Object3D): void {
    body.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material)
          ? child.material
          : [child.material];
        for (const material of materials) {
          material.dispose();
        }
      }
    });
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

    ctx.lineJoin = "round";
    ctx.lineWidth = 8;
    ctx.strokeStyle = "#000000";
    ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
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
        body.position.copy(basePosition);
        body.rotation.copy(baseRotation);
        body.scale.copy(baseScale);
        const pulse = this.getAvatarAbsorbPulse(id);
        if (pulse > 0) {
          const scaleBoost = 1 + pulse * 0.16;
          body.scale.multiplyScalar(scaleBoost);
          body.position.y += pulse * 0.08;
        }
      }
    }

    this.recordAvatarFollowPose(id, avatar);
    this.updateCapturedFollowers(id, time);
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
    label.position.y = AVATAR_LABEL_Y;
    label.name = "label";
    avatar.add(label);
  }

  addCapturedFollower(ownerId: number, sourceAvatarId: number): void {
    const clone = this.cloneAvatarBody(sourceAvatarId);
    if (!clone) return;

    const group = new THREE.Group();
    clone.body.scale.multiplyScalar(CAPTURED_FOLLOWER_SCALE);
    clone.body.position.y += 0.02;
    group.add(clone.body);
    this.scene.add(group);

    const followers = this.capturedFollowers.get(ownerId) ?? [];
    followers.push({
      group,
      body: clone.body,
      bodyMaterials: clone.materials,
      swayPhase: Math.random() * Math.PI * 2,
    });
    this.capturedFollowers.set(ownerId, followers);
    this.updateCapturedFollowers(ownerId, performance.now() * 0.001);
  }

  clearCapturedFollowers(ownerId: number): void {
    const followers = this.capturedFollowers.get(ownerId);
    if (!followers) return;
    for (const follower of followers) {
      this.scene.remove(follower.group);
      this.disposeObject3D(follower.group);
      for (const material of follower.bodyMaterials) material.dispose();
    }
    this.capturedFollowers.delete(ownerId);
  }

  private cloneAvatarBody(
    sourceAvatarId: number,
  ): { body: THREE.Object3D; materials: THREE.Material[] } | null {
    const avatar = this.avatars.get(sourceAvatarId);
    if (!avatar) return null;
    const sourceBody =
      avatar.getObjectByName("box-body") ??
      avatar.getObjectByName("model-body");
    if (!sourceBody) return null;

    const body = sourceBody.clone(true);
    const materials: THREE.Material[] = [];
    body.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const clonedMaterial = Array.isArray(child.material)
          ? child.material.map((material) => material.clone())
          : child.material.clone();
        child.material = clonedMaterial;
        if (Array.isArray(clonedMaterial)) {
          materials.push(...clonedMaterial);
        } else {
          materials.push(clonedMaterial);
        }
      }
    });
    body.position.copy(
      (sourceBody.userData.basePosition as THREE.Vector3 | undefined) ??
        sourceBody.position,
    );
    body.rotation.copy(
      (sourceBody.userData.baseRotation as THREE.Euler | undefined) ??
        sourceBody.rotation,
    );
    body.scale.copy(
      (sourceBody.userData.baseScale as THREE.Vector3 | undefined) ??
        sourceBody.scale,
    );
    return { body, materials };
  }

  private recordAvatarFollowPose(id: number, avatar: THREE.Group): void {
    const history = this.avatarFollowHistory.get(id) ?? [];
    history.unshift({
      x: avatar.position.x,
      z: avatar.position.z,
      rotationY: avatar.rotation.y,
    });
    if (history.length > CAPTURED_FOLLOWER_MAX_HISTORY) {
      history.length = CAPTURED_FOLLOWER_MAX_HISTORY;
    }
    this.avatarFollowHistory.set(id, history);
  }

  private updateCapturedFollowers(ownerId: number, time: number): void {
    const followers = this.capturedFollowers.get(ownerId);
    const avatar = this.avatars.get(ownerId);
    if (!followers || followers.length === 0 || !avatar) return;

    const history = this.avatarFollowHistory.get(ownerId) ?? [];
    const fallbackPose =
      history[0] ??
      ({
        x: avatar.position.x,
        z: avatar.position.z,
        rotationY: avatar.rotation.y,
      } satisfies AvatarFollowPose);

    for (let i = 0; i < followers.length; i++) {
      const follower = followers[i];
      const historyIndex = Math.min(
        history.length - 1,
        CAPTURED_FOLLOWER_HISTORY_BASE + i * CAPTURED_FOLLOWER_HISTORY_STEP,
      );
      const pose = historyIndex >= 0 ? history[historyIndex] : fallbackPose;
      const targetX = pose.x;
      const targetZ = pose.z;

      follower.group.position.x += (targetX - follower.group.position.x) * 0.24;
      follower.group.position.z += (targetZ - follower.group.position.z) * 0.24;
      follower.group.rotation.y +=
        (pose.rotationY - follower.group.rotation.y) * 0.22;

      if (follower.body) {
        const basePosition = follower.body.userData.basePosition as
          | THREE.Vector3
          | undefined;
        if (basePosition) {
          follower.body.position.copy(basePosition);
          follower.body.position.y +=
            0.02 + Math.sin(time * 3.6 + follower.swayPhase) * 0.035;
        }
      }
    }
  }

  private disposeObject3D(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
      }
    });
  }

  startDeathSplat(
    victimId: number,
    position: Vec2,
    color: number,
    skinId = "",
  ): void {
    this.cleanupDeathSplatsForVictim(victimId);

    const group = new THREE.Group();
    group.position.set(position.x, 0, position.z);

    const avatar = this.avatars.get(victimId);
    if (avatar) {
      group.rotation.y = avatar.rotation.y;
    }

    const splatGeometry = this.createDeathSplatGeometry(victimId, color);
    const patTex = this.getPatternTexture(skinId);
    const splatMaterial = new THREE.MeshBasicMaterial({
      color: patTex ? 0xffffff : new THREE.Color(color).multiplyScalar(0.42),
      map: patTex ?? null,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const splatMesh = new THREE.Mesh(splatGeometry, splatMaterial);
    splatMesh.rotation.x = -Math.PI / 2;
    splatMesh.position.y = TRAIL_Y + 0.004;
    splatMesh.scale.set(0.2, 0.2, 0.2);
    splatMesh.renderOrder =
      this.territoryRenderOrder + TRAIL_RENDER_ORDER_OFFSET + 3;
    group.add(splatMesh);

    let body: THREE.Object3D | null = null;
    const bodyMaterials: THREE.Material[] = [];
    if (avatar) {
      const sourceBody =
        avatar.getObjectByName("box-body") ??
        avatar.getObjectByName("model-body");
      if (sourceBody) {
        body = sourceBody.clone(true);
        body.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            const clonedMaterial = Array.isArray(child.material)
              ? child.material.map((material) => material.clone())
              : child.material.clone();
            child.material = clonedMaterial;
            if (Array.isArray(clonedMaterial)) {
              bodyMaterials.push(...clonedMaterial);
            } else {
              bodyMaterials.push(clonedMaterial);
            }
          }
        });
        body.position.copy(
          (sourceBody.userData.basePosition as THREE.Vector3 | undefined) ??
            sourceBody.position,
        );
        body.rotation.copy(
          (sourceBody.userData.baseRotation as THREE.Euler | undefined) ??
            sourceBody.rotation,
        );
        body.scale.copy(
          (sourceBody.userData.baseScale as THREE.Vector3 | undefined) ??
            sourceBody.scale,
        );
        group.add(body);
      }
    }

    this.scene.add(group);
    this.deathSplats.push({
      victimId,
      group,
      body,
      bodyMaterials,
      splatMesh,
      splatMaterial,
      startMs: performance.now(),
      squashDurationMs: 190,
      durationMs: 780,
      baseBodyPosition: body ? body.position.clone() : null,
      baseBodyScale: body ? body.scale.clone() : null,
      baseBodyRotation: body ? body.rotation.clone() : null,
      origin: new THREE.Vector2(position.x, position.z),
    });
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

  private loopBounds(loop: Vec2[]): {
    width: number;
    height: number;
  } {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    for (const point of loop) {
      if (point.x < minX) minX = point.x;
      if (point.x > maxX) maxX = point.x;
      if (point.z < minZ) minZ = point.z;
      if (point.z > maxZ) maxZ = point.z;
    }
    return {
      width: maxX - minX,
      height: maxZ - minZ,
    };
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
      this.territoryRenderCache.delete(id);
      this.territoryDirtyIds.delete(id);
    }
  }

  private getTargetPixelRatio(): number {
    if (!this.isMobile) {
      return Math.min(window.devicePixelRatio || 1, 2);
    }
    return Math.min(window.devicePixelRatio || 1, MOBILE_MAX_PIXEL_RATIO);
  }

  private applyPixelRatio(pixelRatio: number): void {
    this.currentPixelRatio = pixelRatio;
    this.renderer.setPixelRatio(pixelRatio);
    this.onResize();
  }

  reportFrameTime(frameMs: number): void {
    if (!this.isMobile) return;
    this.frameTimeEma = this.frameTimeEma * 0.92 + frameMs * 0.08;
    if (this.frameTimeEma > MOBILE_DPR_DECREASE_FRAME_MS) {
      this.slowFrameStreak += 1;
      this.fastFrameStreak = 0;
    } else if (this.frameTimeEma < MOBILE_DPR_INCREASE_FRAME_MS) {
      this.fastFrameStreak += 1;
      this.slowFrameStreak = 0;
    } else {
      this.slowFrameStreak = 0;
      this.fastFrameStreak = 0;
    }
    const now = performance.now();
    if (
      this.slowFrameStreak >= MOBILE_DPR_DECREASE_STREAK &&
      this.currentPixelRatio > MOBILE_MIN_PIXEL_RATIO &&
      now - this.lastPixelRatioAdjustAt > 1400
    ) {
      this.lastPixelRatioAdjustAt = now;
      this.slowFrameStreak = 0;
      this.applyPixelRatio(
        Math.max(MOBILE_MIN_PIXEL_RATIO, this.currentPixelRatio - 0.1),
      );
    } else if (
      this.fastFrameStreak >= MOBILE_DPR_INCREASE_STREAK &&
      this.currentPixelRatio < this.getTargetPixelRatio() &&
      now - this.lastPixelRatioAdjustAt > 2400
    ) {
      this.lastPixelRatioAdjustAt = now;
      this.fastFrameStreak = 0;
      this.applyPixelRatio(
        Math.min(this.getTargetPixelRatio(), this.currentPixelRatio + 0.05),
      );
    }
  }

  private getBoundsDistanceSq(bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }): number {
    const dx =
      this.cameraTarget.x < bounds.minX
        ? bounds.minX - this.cameraTarget.x
        : this.cameraTarget.x > bounds.maxX
          ? this.cameraTarget.x - bounds.maxX
          : 0;
    const dz =
      this.cameraTarget.z < bounds.minZ
        ? bounds.minZ - this.cameraTarget.z
        : this.cameraTarget.z > bounds.maxZ
          ? this.cameraTarget.z - bounds.maxZ
          : 0;
    return dx * dx + dz * dz;
  }

  private shouldRenderTerritory(
    bounds: TerritoryRenderCacheEntry["bounds"],
    keepLoaded: boolean,
  ): boolean {
    const radiusSq = keepLoaded
      ? TERRITORY_UNLOAD_RADIUS_SQ
      : TERRITORY_RENDER_RADIUS_SQ;
    return this.getBoundsDistanceSq(bounds) <= radiusSq;
  }

  private shouldRenderTerritoryTopOnly(
    bounds: TerritoryRenderCacheEntry["bounds"],
  ): boolean {
    return this.getBoundsDistanceSq(bounds) > TERRITORY_FULL_DETAIL_RADIUS_SQ;
  }

  private shouldRebuildTerritoryImmediately(
    bounds: TerritoryRenderCacheEntry["bounds"],
  ): boolean {
    return this.getBoundsDistanceSq(bounds) <= TERRITORY_FULL_DETAIL_RADIUS_SQ;
  }

  private enqueueTerritoryUpdate(id: number): void {
    this.territoryDirtyIds.add(id);
  }

  private processQueuedTerritoryUpdates(
    maxUpdates = this.isMobile ? 2 : 4,
  ): void {
    if (this.territoryDirtyIds.size === 0) return;
    const ids = Array.from(this.territoryDirtyIds).slice(0, maxUpdates);
    for (const id of ids) {
      this.territoryDirtyIds.delete(id);
      const cached = this.territoryRenderCache.get(id);
      if (!cached) continue;
      if (
        !this.shouldRenderTerritory(
          cached.bounds,
          this.territoryObjects.has(id),
        )
      ) {
        this.clearTerritoryVisuals(id);
        continue;
      }
      const effectiveTopOnly =
        cached.requestedTopOnly ||
        this.shouldRenderTerritoryTopOnly(cached.bounds);
      this.rebuildTerritoryVisuals(id, cached, effectiveTopOnly);
      cached.renderedTopOnly = effectiveTopOnly;
    }
  }

  private refreshTerritoryVisibility(force = false): void {
    const dx = this.cameraTarget.x - this.lastTerritoryCullCenter.x;
    const dz = this.cameraTarget.z - this.lastTerritoryCullCenter.z;
    if (!force && dx * dx + dz * dz < TERRITORY_CULL_REFRESH_DIST_SQ) {
      return;
    }

    this.lastTerritoryCullCenter.x = this.cameraTarget.x;
    this.lastTerritoryCullCenter.z = this.cameraTarget.z;

    for (const [id, cached] of this.territoryRenderCache) {
      const isLoaded = this.territoryObjects.has(id);
      if (this.shouldRenderTerritory(cached.bounds, isLoaded)) {
        const effectiveTopOnly =
          cached.requestedTopOnly ||
          this.shouldRenderTerritoryTopOnly(cached.bounds);
        if (!isLoaded || cached.renderedTopOnly !== effectiveTopOnly) {
          if (this.shouldRebuildTerritoryImmediately(cached.bounds)) {
            this.rebuildTerritoryVisuals(id, cached, effectiveTopOnly);
            cached.renderedTopOnly = effectiveTopOnly;
          } else {
            this.enqueueTerritoryUpdate(id);
          }
        }
      } else if (isLoaded) {
        this.clearTerritoryVisuals(id);
      }
    }
  }

  private countTaggedTerritorySceneObjects(playerId?: number): number {
    let count = 0;
    this.scene.traverse((obj) => {
      const data = obj.userData as {
        territoryVisual?: boolean;
        territoryPlayerId?: number;
      };
      if (!data?.territoryVisual) return;
      if (playerId !== undefined && data.territoryPlayerId !== playerId) return;
      count++;
    });
    return count;
  }

  updateTerritory(
    id: number,
    grid: TerritoryGrid,
    color: number,
    skinId = "",
    options: TerritoryUpdateOptions = {},
  ): void {
    const topOnly = options.topOnly ?? false;
    const bounds = grid.getBounds(id);
    if (!bounds) {
      this.clearTerritoryVisuals(id, true);
      return;
    }
    this.territoryRenderCache.set(id, {
      grid,
      color,
      skinId,
      requestedTopOnly: topOnly,
      renderedTopOnly:
        this.territoryRenderCache.get(id)?.renderedTopOnly ?? null,
      bounds: {
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
      },
    });
    if (!this.shouldRenderTerritory(bounds, this.territoryObjects.has(id))) {
      this.clearTerritoryVisuals(id);
      return;
    }
    const cached = this.territoryRenderCache.get(id);
    if (!cached) return;
    const effectiveTopOnly =
      cached.requestedTopOnly ||
      this.shouldRenderTerritoryTopOnly(cached.bounds);
    if (this.shouldRebuildTerritoryImmediately(cached.bounds)) {
      this.rebuildTerritoryVisuals(id, cached, effectiveTopOnly);
      cached.renderedTopOnly = effectiveTopOnly;
    } else {
      this.enqueueTerritoryUpdate(id);
    }
  }

  private rebuildTerritoryVisuals(
    id: number,
    cached: TerritoryRenderCacheEntry,
    topOnly: boolean,
  ): void {
    const { grid, color, skinId, bounds } = cached;
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
        side: THREE.FrontSide,
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
    const mapChanged = materials.top.map !== (patTex ?? null);
    materials.top.color.setHex(patTex ? 0xffffff : color);
    materials.top.map = patTex ?? null;
    // needsUpdate only when the texture map is added/removed — color changes don't require it
    if (mapChanged) materials.top.needsUpdate = true;
    materials.depth.color.copy(new THREE.Color(color).multiplyScalar(0.7));
    materials.band.color.copy(new THREE.Color(color).multiplyScalar(0.56));
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

    let droppedOuterCount = 0;
    let droppedHoleCount = 0;
    for (const polygon of polygons) {
      if (
        polygon.outer.length < 3 ||
        Math.abs(this.loopArea(polygon.outer)) < LOOP_MIN_AREA
      ) {
        droppedOuterCount++;
        continue;
      }
      for (const holeLoop of polygon.holes) {
        if (
          holeLoop.length < 3 ||
          Math.abs(this.loopArea(holeLoop)) < LOOP_MIN_AREA
        ) {
          droppedHoleCount++;
        }
      }
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
    // Triangulate once — depth layers and footprint share clones of this geometry
    // ShapeGeometry already produces correct up-facing normals; no need to recompute
    const topGeo = new THREE.ShapeGeometry(rawShapes, EXTRUDE_CURVE_SEGMENTS);
    topGeo.rotateX(-Math.PI / 2);

    const mesh = new THREE.Mesh(topGeo, materials.top);
    mesh.userData.territoryVisual = true;
    mesh.userData.territoryPlayerId = id;
    mesh.userData.territoryVisualType = "top";
    mesh.position.y = TERRITORY_Y;
    mesh.renderOrder = order;
    mesh.castShadow = false;
    mesh.receiveShadow = !topOnly;
    this.scene.add(mesh);
    this.territoryObjects.set(id, mesh);

    if (topOnly) {
      return;
    }

    const depthLayers: THREE.Mesh[] = [];
    for (let layer = 1; layer <= TERRITORY_DEPTH_LAYERS; layer++) {
      const t = layer / TERRITORY_DEPTH_LAYERS;
      // Clone already-triangulated geometry — no re-triangulation cost
      const layerGeo = topGeo.clone();
      const layerMesh = new THREE.Mesh(layerGeo, materials.depth);
      layerMesh.userData.territoryVisual = true;
      layerMesh.userData.territoryPlayerId = id;
      layerMesh.userData.territoryVisualType = "depth";
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
      sideBandMesh.userData.territoryVisual = true;
      sideBandMesh.userData.territoryPlayerId = id;
      sideBandMesh.userData.territoryVisualType = "band";
      sideBandMesh.position.y = TERRITORY_Y;
      sideBandMesh.renderOrder = order - 0.12;
      sideBandMesh.castShadow = false;
      sideBandMesh.receiveShadow = true;
      this.scene.add(sideBandMesh);
      this.territorySideBands.set(id, sideBandMesh);
    }

    const shadowCenterX = (bMinX + bMaxX) * 0.5;
    const shadowCenterZ = (bMinZ + bMaxZ) * 0.5;
    // Clone the already-triangulated top geometry — no re-triangulation cost
    const footprintGeo = topGeo.clone();

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
    shadowMesh.userData.territoryVisual = true;
    shadowMesh.userData.territoryPlayerId = id;
    shadowMesh.userData.territoryVisualType = "shadow";
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
    contactMesh.userData.territoryVisual = true;
    contactMesh.userData.territoryPlayerId = id;
    contactMesh.userData.territoryVisualType = "contact-shadow";
    contactMesh.renderOrder = order - 0.5;
    this.scene.add(contactMesh);
    this.territoryContactShadows.set(id, contactMesh);
    footprintGeo.dispose();
  }

  private static readonly INITIAL_TRAIL_CAPACITY = 512;
  private static readonly MAX_TRAIL_CAPACITY = 65536;
  private static readonly UINT16_INDEX_CAPACITY = 10923; // (n-1)*6 <= 65535

  private createTrailRibbonGeometry(capacity: number): THREE.BufferGeometry {
    const maxPts = Math.max(2, capacity);
    const posAttr = new THREE.BufferAttribute(
      new Float32Array(maxPts * 2 * 3),
      3,
    );
    posAttr.setUsage(THREE.DynamicDrawUsage);
    const indexCount = (maxPts - 1) * 6;
    const idxArr =
      maxPts > Renderer.UINT16_INDEX_CAPACITY
        ? new Uint32Array(indexCount)
        : new Uint16Array(indexCount);
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
    return geo;
  }

  private ensureTrailRibbonCapacity(mesh: THREE.Mesh, minPoints: number): void {
    if (minPoints < 2) return;
    const posAttr = mesh.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    const currentCapacity = posAttr.count / 2;
    if (minPoints <= currentCapacity) return;
    let newCapacity = 1 << 31;
    for (let i = 0; i < 31; i++) {
      if (1 << i >= minPoints) {
        newCapacity = Math.min(1 << i, Renderer.MAX_TRAIL_CAPACITY);
        break;
      }
    }
    const oldGeo = mesh.geometry;
    mesh.geometry = this.createTrailRibbonGeometry(newCapacity);
    oldGeo.dispose();
  }

  private createTrailRibbonMesh(
    material: THREE.MeshLambertMaterial,
  ): THREE.Mesh {
    const geo = this.createTrailRibbonGeometry(Renderer.INITIAL_TRAIL_CAPACITY);
    const mesh = new THREE.Mesh(geo, material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }

  private createDynamicTrailMesh(
    material: THREE.MeshLambertMaterial,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    return mesh;
  }

  private getTrailEndpointHalfWidth(
    visibleTrail: Vec2[],
    index: number,
    baseHalfWidth: number,
    taperEndpoints = false,
  ): number {
    if (
      !taperEndpoints ||
      visibleTrail.length < 2 ||
      (index !== 0 && index !== visibleTrail.length - 1)
    ) {
      return baseHalfWidth;
    }

    const adjIndex = index === 0 ? 1 : index - 1;
    const dx = visibleTrail[adjIndex].x - visibleTrail[index].x;
    const dz = visibleTrail[adjIndex].z - visibleTrail[index].z;
    const segmentLength = Math.sqrt(dx * dx + dz * dz);
    return Math.min(
      baseHalfWidth,
      Math.max(CELL_SIZE * 0.08, segmentLength * 0.5),
    );
  }

  /**
   * Returns segments of the trail that are outside enemy territory.
   * When there is no carve, returns [full trail]. When there is a carve,
   * returns [segment before entering, segment after exiting] (either can be empty).
   */
  private getTrailOutsideSegments(trail: Vec2[], carvePath: Vec2[]): Vec2[][] {
    if (trail.length < 2 || carvePath.length < 2) return [trail];
    const eps = 1e-6;
    const eq = (a: Vec2, b: Vec2) =>
      Math.abs(a.x - b.x) < eps && Math.abs(a.z - b.z) < eps;
    const firstInside = carvePath[1];
    const lastInside = carvePath[carvePath.length - 1];
    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < trail.length; i++) {
      if (eq(trail[i], firstInside)) startIdx = i;
      if (eq(trail[i], lastInside)) endIdx = i;
    }
    if (startIdx < 0 || endIdx < 0) return [trail];
    const before = trail.slice(0, startIdx);
    const after = trail.slice(endIdx + 1);
    const segments: Vec2[][] = [];
    if (before.length >= 2) segments.push(before);
    if (after.length >= 2) segments.push(after);
    return segments.length > 0 ? segments : [trail];
  }

  private writeTrailRibbonPositions(
    mesh: THREE.Mesh,
    visibleTrail: Vec2[],
    windowStart: number,
    prevLen: number,
    prevSourceLen: number,
    sourceTrailLen: number,
    startTangent: Vec2 | null,
    halfWidth: number,
    y: number,
    offsetX = 0,
    offsetZ = 0,
    taperEndpointWidth = false,
    anchorStartAtPathPoint = false,
  ): void {
    const n = visibleTrail.length;
    if (n < 2) return;
    this.ensureTrailRibbonCapacity(mesh, n);
    const posArr = (
      mesh.geometry.getAttribute("position") as THREE.BufferAttribute
    ).array as Float32Array;

    const normalize = (x: number, z: number): Vec2 => {
      const len = Math.sqrt(x * x + z * z) || 1;
      return { x: x / len, z: z / len };
    };

    const blendPoints = 4;
    const normalizedStartTangent =
      windowStart === 0 &&
      startTangent &&
      (startTangent.x !== 0 || startTangent.z !== 0)
        ? normalize(startTangent.x, startTangent.z)
        : null;

    const updateStart =
      windowStart > 0 || sourceTrailLen !== prevSourceLen
        ? 0
        : visibleTrail.length >= prevLen
          ? Math.max(0, prevLen - 2)
          : 0;

    for (let i = updateStart; i < n; i++) {
      let dx: number, dz: number;
      if (i === 0) {
        dx = visibleTrail[1].x - visibleTrail[0].x;
        dz = visibleTrail[1].z - visibleTrail[0].z;
      } else if (i === n - 1) {
        dx = visibleTrail[i].x - visibleTrail[i - 1].x;
        dz = visibleTrail[i].z - visibleTrail[i - 1].z;
      } else {
        dx = visibleTrail[i + 1].x - visibleTrail[i - 1].x;
        dz = visibleTrail[i + 1].z - visibleTrail[i - 1].z;
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

      const effectiveHalfWidth = this.getTrailEndpointHalfWidth(
        visibleTrail,
        i,
        halfWidth,
        taperEndpointWidth,
      );
      const px = widthDir.x * effectiveHalfWidth;
      const pz = widthDir.z * effectiveHalfWidth;
      let capOffset = 0;
      if (i === n - 1) {
        capOffset = halfWidth;
      }
      let startForwardOffset = 0;
      if (i === 0 && !anchorStartAtPathPoint) {
        // Keep the whole first cross-section outside the territory edge.
        // One corner can project backward along moveDir when the start width
        // follows a curved boundary tangent; push the whole section forward
        // just enough so the rearmost corner lies on the exit boundary.
        //
        // The territory uses a faux-depth stack that is shifted toward the
        // camera. Compensate for that visual overhang too so the trail start
        // appears attached to the visible outer edge, not the logical top face.
        const territoryVisualOverhang = Math.max(
          0,
          -(
            alongDir.x * TERRITORY_DEPTH_OFFSET_X +
            alongDir.z * TERRITORY_DEPTH_OFFSET_Z
          ),
        );
        startForwardOffset = Math.max(
          0,
          Math.abs(widthDir.x * alongDir.x + widthDir.z * alongDir.z) *
            effectiveHalfWidth,
        );
        startForwardOffset += territoryVisualOverhang;
      }
      const centerX =
        visibleTrail[i].x +
        alongDir.x * (capOffset + startForwardOffset) +
        offsetX;
      const centerZ =
        visibleTrail[i].z +
        alongDir.z * (capOffset + startForwardOffset) +
        offsetZ;
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

  private buildTrailWallGeometry(
    visibleTrail: Vec2[],
    windowStart: number,
    startTangent: Vec2 | null,
    halfWidth: number,
    topY: number,
    bottomOffsetX: number,
    bottomOffsetZ: number,
    bottomDrop: number,
    taperEndpointWidth = false,
  ): THREE.BufferGeometry | null {
    const n = visibleTrail.length;
    if (n < 2) return null;

    const normalize = (x: number, z: number): Vec2 => {
      const len = Math.sqrt(x * x + z * z) || 1;
      return { x: x / len, z: z / len };
    };

    const blendPoints = 4;
    const normalizedStartTangent =
      windowStart === 0 &&
      startTangent &&
      (startTangent.x !== 0 || startTangent.z !== 0)
        ? normalize(startTangent.x, startTangent.z)
        : null;
    const depthDir = normalize(bottomOffsetX, bottomOffsetZ);

    const rimPoints: Array<{
      x: number;
      z: number;
      bottomX: number;
      bottomZ: number;
    }> = [];

    for (let i = 0; i < n; i++) {
      let dx: number, dz: number;
      if (i === 0) {
        dx = visibleTrail[1].x - visibleTrail[0].x;
        dz = visibleTrail[1].z - visibleTrail[0].z;
      } else if (i === n - 1) {
        dx = visibleTrail[i].x - visibleTrail[i - 1].x;
        dz = visibleTrail[i].z - visibleTrail[i - 1].z;
      } else {
        dx = visibleTrail[i + 1].x - visibleTrail[i - 1].x;
        dz = visibleTrail[i + 1].z - visibleTrail[i - 1].z;
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

      const effectiveHalfWidth = this.getTrailEndpointHalfWidth(
        visibleTrail,
        i,
        halfWidth,
        taperEndpointWidth,
      );
      let capOffset = 0;
      if (i === n - 1) {
        capOffset = halfWidth;
      }
      const centerX = visibleTrail[i].x + alongDir.x * capOffset;
      const centerZ = visibleTrail[i].z + alongDir.z * capOffset;
      const sideSign =
        widthDir.x * depthDir.x + widthDir.z * depthDir.z >= 0 ? 1 : -1;
      const edgeX = centerX + widthDir.x * effectiveHalfWidth * sideSign;
      const edgeZ = centerZ + widthDir.z * effectiveHalfWidth * sideSign;

      rimPoints.push({
        x: edgeX,
        z: edgeZ,
        bottomX: edgeX + bottomOffsetX,
        bottomZ: edgeZ + bottomOffsetZ,
      });
    }

    const positions: number[] = [];
    for (let i = 0; i < rimPoints.length - 1; i++) {
      const curr = rimPoints[i];
      const next = rimPoints[i + 1];
      positions.push(
        curr.x,
        topY,
        curr.z,
        next.x,
        topY,
        next.z,
        next.bottomX,
        topY - bottomDrop,
        next.bottomZ,
        curr.x,
        topY,
        curr.z,
        next.bottomX,
        topY - bottomDrop,
        next.bottomZ,
        curr.bottomX,
        topY - bottomDrop,
        curr.bottomZ,
      );
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

  updateTrail(
    id: number,
    trail: Vec2[],
    color: number,
    startTangent: Vec2 | null = null,
    carveTrail: Vec2[] | null = null,
    carveColor?: number,
    carveStartTangent: Vec2 | null = null,
    carveOwnerId?: number,
  ): void {
    const prevLen = this.trailLengths.get(id) ?? 0;
    const prevSourceLen = this.trailSourceLengths.get(id) ?? 0;
    const prevCarveLen = this.trailCarveLengths.get(id) ?? 0;
    const prevCarveSourceLen = this.trailCarveSourceLengths.get(id) ?? 0;
    const visibleTrail = trail;
    const windowStart = 0;
    const n = visibleTrail.length;
    const carvePath = carveTrail ?? [];
    const visibleCarveTrail = carvePath;
    const carveWindowStart = 0;
    const carveVisibleLen = visibleCarveTrail.length;
    const carveEnemyTerritory = carveVisibleLen >= 2;
    if (
      prevLen === n &&
      prevSourceLen === trail.length &&
      prevCarveLen === carveVisibleLen &&
      prevCarveSourceLen === carvePath.length &&
      n > 0
    ) {
      return;
    }
    this.trailLengths.set(id, n);
    this.trailSourceLengths.set(id, trail.length);
    this.trailCarveLengths.set(id, carveVisibleLen);
    this.trailCarveSourceLengths.set(id, carvePath.length);

    let mesh = this.trailMeshes.get(id);
    let carveMesh = this.trailCarveMeshes.get(id);
    let carveEdgeMesh = this.trailCarveEdgeMeshes.get(id);

    if (n < 2) {
      if (mesh) mesh.visible = false;
      if (carveMesh) carveMesh.visible = false;
      if (carveEdgeMesh) carveEdgeMesh.visible = false;
      const boardCarveMeshHide = this.trailBoardCarveMeshes.get(id);
      if (boardCarveMeshHide) boardCarveMeshHide.visible = false;
      const boardCarveMesh2Hide = this.trailBoardCarveMesh2s.get(id);
      if (boardCarveMesh2Hide) boardCarveMesh2Hide.visible = false;
      const enemyListHide = this.trailEnemyBoardCarveMeshList.get(id);
      if (enemyListHide) {
        for (const m of enemyListHide) {
          m.visible = false;
          this.scene.remove(m);
          m.geometry.dispose();
        }
        this.trailEnemyBoardCarveMeshList.delete(id);
      }
      const enemyMaterialListHide = this.trailEnemyBoardCarveMaterials.get(id);
      if (enemyMaterialListHide) {
        for (const mat of enemyMaterialListHide) {
          mat.dispose();
        }
        this.trailEnemyBoardCarveMaterials.delete(id);
      }
      this.trailCarvePathPersisted.delete(id);
      this.trailLastCarveWhenInside.delete(id);
      this.trailSourceLengths.delete(id);
      this.trailCarveLengths.delete(id);
      this.trailCarveSourceLengths.delete(id);
      return;
    }

    const trailHalfWidth = 0.27;
    const carveFloorHalfWidth = 0.42;
    const carveWallHalfWidth = 0.45;
    const carveFloorOffsetX =
      TERRITORY_DEPTH_OFFSET_X * TRAIL_CARVE_FLOOR_DEPTH_T;
    const carveFloorOffsetZ =
      TERRITORY_DEPTH_OFFSET_Z * TRAIL_CARVE_FLOOR_DEPTH_T;
    const carveFloorDrop = TERRITORY_DEPTH_DROP * TRAIL_CARVE_FLOOR_DEPTH_T;
    const entrySegmentLength =
      carvePath.length >= 2
        ? Math.hypot(
            carvePath[1].x - carvePath[0].x,
            carvePath[1].z - carvePath[0].z,
          )
        : null;
    const expectedTaperFloorHalfWidth =
      entrySegmentLength === null
        ? null
        : Math.min(
            carveFloorHalfWidth,
            Math.max(CELL_SIZE * 0.08, entrySegmentLength * 0.5),
          );
    const expectedTaperWallHalfWidth =
      entrySegmentLength === null
        ? null
        : Math.min(
            carveWallHalfWidth,
            Math.max(CELL_SIZE * 0.08, entrySegmentLength * 0.5),
          );

    if (!mesh) {
      let mat = this.trailMaterials.get(id);
      if (!mat) {
        mat = new THREE.MeshLambertMaterial({
          color,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
        });
        this.trailMaterials.set(id, mat);
      }

      mesh = this.createTrailRibbonMesh(mat);
      this.trailMeshes.set(id, mesh);
    }

    if (!carveMesh) {
      let carveMat = this.trailCarveMaterials.get(id);
      if (!carveMat) {
        carveMat = new THREE.MeshLambertMaterial({
          color,
          transparent: true,
          opacity: 0.55,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
        });
        this.trailCarveMaterials.set(id, carveMat);
      }
      carveMesh = this.createTrailRibbonMesh(carveMat);
      this.trailCarveMeshes.set(id, carveMesh);
    }

    if (!carveEdgeMesh) {
      let carveEdgeMat = this.trailCarveEdgeMaterials.get(id);
      if (!carveEdgeMat) {
        carveEdgeMat = new THREE.MeshLambertMaterial({
          color,
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
        });
        this.trailCarveEdgeMaterials.set(id, carveEdgeMat);
      }
      carveEdgeMesh = this.createDynamicTrailMesh(carveEdgeMat);
      this.trailCarveEdgeMeshes.set(id, carveEdgeMesh);
    }

    const material = mesh.material as THREE.MeshLambertMaterial;
    material.color.setHex(color);
    material.transparent = false;
    material.opacity = 1;
    material.depthTest = true;
    material.depthWrite = false;
    mesh.renderOrder = this.territoryRenderOrder + TRAIL_RENDER_ORDER_OFFSET;
    mesh.visible = true;
    this.writeTrailRibbonPositions(
      mesh,
      visibleTrail,
      windowStart,
      prevLen,
      prevSourceLen,
      trail.length,
      startTangent,
      trailHalfWidth,
      TRAIL_Y,
    );
    const carveSourceColor = carveColor ?? color;
    const carveMaterial = carveMesh.material as THREE.MeshLambertMaterial;
    const carveFloorColor = new THREE.Color(carveSourceColor).multiplyScalar(
      0.68,
    );
    carveMaterial.color.copy(carveFloorColor);
    carveMaterial.transparent = false;
    carveMaterial.opacity = 1;
    carveMaterial.depthTest = true;
    carveMaterial.depthWrite = false;
    carveMesh.renderOrder =
      this.territoryRenderOrder + TRAIL_CARVE_RENDER_ORDER;
    // Legacy enemy-entry shadow ribbon disabled. The board-level groove now
    // owns this visual, and keeping both paths active leaves an old artifact
    // at the entrance.
    carveMesh.visible = false;

    const carveEdgeMaterial =
      carveEdgeMesh.material as THREE.MeshLambertMaterial;
    const carveWallColor = new THREE.Color(carveSourceColor).multiplyScalar(
      0.48,
    );
    carveEdgeMaterial.color.copy(carveWallColor);
    carveEdgeMaterial.transparent = false;
    carveEdgeMaterial.opacity = 1;
    carveEdgeMaterial.depthTest = true;
    carveEdgeMaterial.depthWrite = false;
    carveEdgeMesh.renderOrder =
      this.territoryRenderOrder + TRAIL_CARVE_WALL_RENDER_ORDER;
    carveEdgeMesh.visible = false;

    if (carveEdgeMesh.geometry) {
      carveEdgeMesh.geometry.dispose();
      carveEdgeMesh.geometry = new THREE.BufferGeometry();
    }

    // ── Board-level groove ribbons ────────────────────────────────────────────
    // Canvas groove: only the trail segments OUTSIDE enemy territory (thin).
    // Enemy overlay: only the segment INSIDE enemy territory (thick, persistent).
    // So the inside section never gets overwritten by the canvas groove.
    const outsideSegments = this.getTrailOutsideSegments(trail, carvePath);
    const hasCarve = carvePath.length >= 2;
    const segment1 = outsideSegments[0] ?? [];
    const segment2 = outsideSegments[1] ?? null;
    const useFullTrailForSegment1 = !hasCarve && segment1.length > 0;

    let boardCarveMesh = this.trailBoardCarveMeshes.get(id);
    if (!boardCarveMesh) {
      let boardCarveMat = this.trailBoardCarveMaterials.get(id);
      if (!boardCarveMat) {
        boardCarveMat = new THREE.MeshLambertMaterial({
          color: new THREE.Color(BOARD_COLOR).multiplyScalar(0.95),
          transparent: false,
          opacity: 1,
          side: THREE.DoubleSide,
          depthTest: true,
          depthWrite: false,
        });
        this.trailBoardCarveMaterials.set(id, boardCarveMat);
      }
      boardCarveMesh = this.createTrailRibbonMesh(boardCarveMat);
      this.trailBoardCarveMeshes.set(id, boardCarveMesh);
    }

    boardCarveMesh.renderOrder =
      this.territoryRenderOrder + TRAIL_RENDER_ORDER_OFFSET - 0.5;
    if (segment1.length >= 2 || useFullTrailForSegment1) {
      boardCarveMesh.visible = true;
      if (useFullTrailForSegment1) {
        this.writeTrailRibbonPositions(
          boardCarveMesh,
          visibleTrail,
          windowStart,
          prevLen,
          prevSourceLen,
          trail.length,
          startTangent,
          BOARD_CARVE_HALF_WIDTH_CANVAS,
          BOARD_CARVE_FLOOR_Y,
          BOARD_CARVE_OFFSET_X,
          BOARD_CARVE_OFFSET_Z,
          true,
        );
      } else {
        this.writeTrailRibbonPositions(
          boardCarveMesh,
          segment1,
          0,
          0,
          0,
          segment1.length,
          startTangent,
          BOARD_CARVE_HALF_WIDTH_CANVAS,
          BOARD_CARVE_FLOOR_Y,
          BOARD_CARVE_OFFSET_X,
          BOARD_CARVE_OFFSET_Z,
          true,
        );
      }
    } else {
      boardCarveMesh.visible = false;
    }

    let boardCarveMesh2 = this.trailBoardCarveMesh2s.get(id);
    if (!boardCarveMesh2) {
      const mat = this.trailBoardCarveMaterials.get(id)!;
      boardCarveMesh2 = this.createTrailRibbonMesh(mat);
      this.trailBoardCarveMesh2s.set(id, boardCarveMesh2);
    }
    boardCarveMesh2.renderOrder =
      this.territoryRenderOrder + TRAIL_RENDER_ORDER_OFFSET - 0.5;
    if (segment2 && segment2.length >= 2) {
      boardCarveMesh2.visible = true;
      this.writeTrailRibbonPositions(
        boardCarveMesh2,
        segment2,
        0,
        0,
        0,
        segment2.length,
        null,
        BOARD_CARVE_HALF_WIDTH_CANVAS,
        BOARD_CARVE_FLOOR_Y,
        BOARD_CARVE_OFFSET_X,
        BOARD_CARVE_OFFSET_Z,
        true,
      );
    } else {
      boardCarveMesh2.visible = false;
    }

    // ── Enemy board-carve overlay ─────────────────────────────────────────────
    // All segments persist: previous visits stay drawn; re-entry adds a new segment.
    const persistedList = this.trailCarvePathPersisted.get(id) ?? [];
    if (carveEnemyTerritory) {
      this.trailLastCarveWhenInside.set(id, {
        path: [...carvePath],
        color: carveSourceColor,
        territoryOwnerId: carveOwnerId ?? null,
        startTangent: carveStartTangent,
      });
    } else {
      const last = this.trailLastCarveWhenInside.get(id);
      if (last && last.path.length >= 2) {
        persistedList.push({
          path: [...last.path],
          color: last.color,
          territoryOwnerId: last.territoryOwnerId,
          startTangent: last.startTangent,
        });
        this.trailCarvePathPersisted.set(id, persistedList);
        this.trailLastCarveWhenInside.delete(id);
      }
    }
    const activeSegment = carveEnemyTerritory
      ? (this.trailLastCarveWhenInside.get(id) ?? null)
      : null;
    const segmentsToDraw: EnemyBoardCarveSegment[] = activeSegment
      ? [...persistedList, activeSegment]
      : persistedList;

    let meshList = this.trailEnemyBoardCarveMeshList.get(id) ?? [];
    let materialList = this.trailEnemyBoardCarveMaterials.get(id) ?? [];
    while (meshList.length < segmentsToDraw.length) {
      const mat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
        depthTest: true,
        depthWrite: false,
      });
      const mesh = this.createTrailRibbonMesh(mat);
      this.scene.add(mesh);
      meshList.push(mesh);
      materialList.push(mat);
    }
    this.trailEnemyBoardCarveMeshList.set(id, meshList);
    this.trailEnemyBoardCarveMaterials.set(id, materialList);

    const renderOrder =
      this.territoryRenderOrder + TRAIL_RENDER_ORDER_OFFSET - 0.4;
    for (let i = 0; i < meshList.length; i++) {
      const mesh = meshList[i];
      mesh.renderOrder = renderOrder;
      if (i < segmentsToDraw.length) {
        const seg = segmentsToDraw[i];
        const mat = materialList[i];
        mesh.material = mat;
        mat.color.setHex(seg.color).multiplyScalar(0.95);
        if (seg.path.length >= 2) {
          if (id === 0 && i === segmentsToDraw.length - 1 && seg.startTangent) {
            const normalize = (x: number, z: number): Vec2 => {
              const len = Math.sqrt(x * x + z * z) || 1;
              return { x: x / len, z: z / len };
            };
            const p0 = seg.path[0];
            const p1 = seg.path[1];
            const alongDir = normalize(p1.x - p0.x, p1.z - p0.z);
            const trailSide = { x: -alongDir.z, z: alongDir.x };
            let tangent = normalize(seg.startTangent.x, seg.startTangent.z);
            if (tangent.x * trailSide.x + tangent.z * trailSide.z < 0) {
              tangent = { x: -tangent.x, z: -tangent.z };
            }
            const widthDir = normalize(tangent.x, tangent.z);
            const effectiveHalfWidth = this.getTrailEndpointHalfWidth(
              seg.path,
              0,
              BOARD_CARVE_HALF_WIDTH_ENEMY,
              true,
            );
            const territoryVisualOverhang = Math.max(
              0,
              -(
                alongDir.x * TERRITORY_DEPTH_OFFSET_X +
                alongDir.z * TERRITORY_DEPTH_OFFSET_Z
              ),
            );
            const startForwardOffset =
              Math.max(
                0,
                Math.abs(widthDir.x * alongDir.x + widthDir.z * alongDir.z) *
                  effectiveHalfWidth,
              ) + territoryVisualOverhang;
            fetch(
              "http://127.0.0.1:7401/ingest/dc4ad8c8-bd58-49bd-b6f9-2a498299fa8e",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Debug-Session-Id": "304a5f",
                },
                body: JSON.stringify({
                  sessionId: "304a5f",
                  runId: "groove-entry-curve-2",
                  hypothesisId: "H2",
                  location: "Renderer.ts:updateTrail",
                  message: "enemy groove first segment geometry",
                  data: {
                    startPoint: p0,
                    secondPoint: p1,
                    startTangent: seg.startTangent,
                    alongDir,
                    trailSide,
                    widthDir,
                    effectiveHalfWidth,
                    territoryVisualOverhang,
                    startForwardOffset,
                  },
                  timestamp: Date.now(),
                }),
              },
            ).catch(() => {});
          }
          mesh.visible = true;
          this.writeTrailRibbonPositions(
            mesh,
            seg.path,
            0,
            0,
            0,
            seg.path.length,
            seg.startTangent,
            BOARD_CARVE_HALF_WIDTH_ENEMY,
            BOARD_CARVE_FLOOR_Y,
            BOARD_CARVE_OFFSET_X,
            BOARD_CARVE_OFFSET_Z,
            true,
            true,
          );
        } else {
          mesh.visible = false;
        }
      } else {
        mesh.visible = false;
      }
    }
    if (id === 0 && (persistedList.length > 0 || carveEnemyTerritory)) {
      // #region agent log
      fetch(
        "http://127.0.0.1:7401/ingest/dc4ad8c8-bd58-49bd-b6f9-2a498299fa8e",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "304a5f",
          },
          body: JSON.stringify({
            sessionId: "304a5f",
            runId: "groove-entry-curve-1",
            hypothesisId: "H1",
            location: "Renderer.ts:updateTrail",
            message: "enemy groove segment entry tangents",
            data: {
              persistedCount: persistedList.length,
              drawingCount: segmentsToDraw.length,
              carveEnemyTerritory,
              currentCarveColor: carveEnemyTerritory ? carveSourceColor : null,
              meshCount: meshList.length,
              tangentCount: segmentsToDraw.filter((seg) => seg.startTangent)
                .length,
              segmentStarts: segmentsToDraw.map((seg) => seg.path[0] ?? null),
              segmentTangents: segmentsToDraw.map(
                (seg) => seg.startTangent ?? null,
              ),
              segmentColors: segmentsToDraw.map((seg) => seg.color),
              territoryOwnerIds: segmentsToDraw.map(
                (seg) => seg.territoryOwnerId,
              ),
              materialCount: new Set(
                meshList.map((mesh) => {
                  const material = Array.isArray(mesh.material)
                    ? mesh.material[0]
                    : mesh.material;
                  return material.uuid;
                }),
              ).size,
              meshMaterialUuids: meshList.map((mesh) => {
                const material = (
                  Array.isArray(mesh.material)
                    ? mesh.material[0]
                    : mesh.material
                ) as THREE.MeshLambertMaterial;
                return material.uuid;
              }),
              meshColors: meshList.map((mesh) => {
                const material = (
                  Array.isArray(mesh.material)
                    ? mesh.material[0]
                    : mesh.material
                ) as THREE.MeshLambertMaterial;
                return material.color.getHex();
              }),
            },
            timestamp: Date.now(),
          }),
        },
      ).catch(() => {});
      // #endregion
    }
  }

  setCameraTarget(pos: Vec2): void {
    this.cameraTarget.x = pos.x;
    this.cameraTarget.z = pos.z;
    this.camera.position.x = pos.x;
    this.camera.position.y = 20;
    this.camera.position.z = pos.z + CAMERA_Z_OFFSET;
    this.camera.lookAt(pos.x, 0, pos.z);
    this.refreshTerritoryVisibility(true);
  }

  updateCamera(targetPos: Vec2, dt: number): void {
    const lerpFactor = 1 - Math.exp(-4 * dt);
    this.cameraTarget.x += (targetPos.x - this.cameraTarget.x) * lerpFactor;
    this.cameraTarget.z += (targetPos.z - this.cameraTarget.z) * lerpFactor;

    this.camera.position.x = this.cameraTarget.x;
    this.camera.position.y = 20;
    this.camera.position.z = this.cameraTarget.z + CAMERA_Z_OFFSET;
    this.camera.lookAt(this.cameraTarget.x, 0, this.cameraTarget.z);
    this.refreshTerritoryVisibility();
  }

  private isNearCameraXZ(
    x: number,
    z: number,
    radiusSq = EFFECT_UPDATE_CULL_DIST_SQ,
  ): boolean {
    const dx = x - this.cameraTarget.x;
    const dz = z - this.cameraTarget.z;
    return dx * dx + dz * dz <= radiusSq;
  }

  removeTerritory(id: number): void {
    this.clearTerritoryVisuals(id, true);
  }

  getDebugVisualState(id: number): {
    territoryTaggedCount: number;
    trailExists: boolean;
    trailVisible: boolean;
    takeoverCount: number;
  } {
    const trail = this.trailMeshes.get(id);
    let takeoverCount = 0;
    for (const effect of this.territoryTakeovers) {
      if (effect.victimId === id) takeoverCount++;
    }
    return {
      territoryTaggedCount: this.countTaggedTerritorySceneObjects(id),
      trailExists: Boolean(trail),
      trailVisible: Boolean(trail?.visible),
      takeoverCount,
    };
  }

  getTrailDebugState(id: number): {
    exists: boolean;
    visible: boolean;
    renderOrder: number;
    y: number;
    depthTest: boolean;
    depthWrite: boolean;
    sourceLength: number;
    visibleLength: number;
    territoryRenderOrder: number;
  } {
    const trail = this.trailMeshes.get(id);
    const material = trail?.material;
    const meshMaterial = Array.isArray(material) ? material[0] : material;
    return {
      exists: Boolean(trail),
      visible: Boolean(trail?.visible),
      renderOrder: trail?.renderOrder ?? 0,
      y: TRAIL_Y,
      depthTest:
        meshMaterial instanceof THREE.Material ? meshMaterial.depthTest : true,
      depthWrite:
        meshMaterial instanceof THREE.Material ? meshMaterial.depthWrite : true,
      sourceLength: this.trailSourceLengths.get(id) ?? 0,
      visibleLength: this.trailLengths.get(id) ?? 0,
      territoryRenderOrder: this.territoryRenderOrder,
    };
  }

  startTerritoryTakeover(
    victimId: number,
    _killerId: number,
    origin: Vec2,
    killerColor: number,
    _killerSkinId = "",
    bounds: {
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
    } | null = null,
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
    mesh.userData.territoryTakeoverEffect = true;
    mesh.userData.territoryTakeoverVictimId = victimId;
    mesh.renderOrder = victimMesh.renderOrder + 2;
    mesh.position.copy(victimMesh.position);
    mesh.rotation.copy(victimMesh.rotation);
    mesh.scale.copy(victimMesh.scale);
    this.scene.add(mesh);

    const sourceBounds = bounds
      ? bounds
      : (() => {
          const box = new THREE.Box3().setFromObject(mesh);
          return {
            minX: box.min.x,
            maxX: box.max.x,
            minZ: box.min.z,
            maxZ: box.max.z,
          };
        })();
    const corners = [
      new THREE.Vector2(sourceBounds.minX, sourceBounds.minZ),
      new THREE.Vector2(sourceBounds.minX, sourceBounds.maxZ),
      new THREE.Vector2(sourceBounds.maxX, sourceBounds.minZ),
      new THREE.Vector2(sourceBounds.maxX, sourceBounds.maxZ),
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
      origin: uniforms.rippleOrigin.value.clone(),
    });

    this.removeTerritory(victimId);
    this.hideAvatar(victimId);
  }

  startCaptureAssimilation(
    capturedRegion: TerritoryMultiPolygon,
    ownerColor: number,
    origin: Vec2,
  ): void {
    if (!this.isNearCameraXZ(origin.x, origin.z)) return;
    const { shapes } = this.buildShapesFromPolygons(capturedRegion);
    if (shapes.length === 0) return;

    const geometry = new THREE.ShapeGeometry(shapes, EXTRUDE_CURVE_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);
    const startColor = new THREE.Color(ownerColor).lerp(
      new THREE.Color(0xffffff),
      0.45,
    );
    const endColor = new THREE.Color(ownerColor).lerp(
      new THREE.Color(0xffffff),
      0.12,
    );
    const material = new THREE.MeshBasicMaterial({
      color: startColor.clone(),
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = TRAIL_Y + 0.003;
    mesh.renderOrder =
      this.territoryRenderOrder + TRAIL_RENDER_ORDER_OFFSET + 2;
    this.scene.add(mesh);

    this.captureAssimilations.push({
      mesh,
      material,
      startColor,
      endColor,
      startMs: performance.now(),
      durationMs: CAPTURE_ASSIMILATION_DURATION * 1000,
      origin: new THREE.Vector2(origin.x, origin.z),
    });
  }

  startAvatarAbsorbPulse(id: number, color: number, delayMs = 0): void {
    this.avatarAbsorbPulses.push({
      playerId: id,
      color: new THREE.Color(color),
      startMs: performance.now(),
      delayMs,
      durationMs: AVATAR_ABSORB_PULSE_DURATION * 1000,
    });
  }

  render(): void {
    this.processQueuedTerritoryUpdates();
    this.updateDeathSplats();
    this.updateTerritoryTakeovers();
    this.updateCaptureAssimilations();
    this.updateAvatarAbsorbPulses();
    this.renderer.render(this.scene, this.camera);
  }

  prewarmRender(): void {
    this.processQueuedTerritoryUpdates(Number.POSITIVE_INFINITY);
    this.updateDeathSplats();
    this.updateTerritoryTakeovers();
    this.updateCaptureAssimilations();
    this.updateAvatarAbsorbPulses();
    this.renderer.compile(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  hasActiveEffects(): boolean {
    return (
      this.territoryTakeovers.length > 0 ||
      this.deathSplats.length > 0 ||
      this.captureAssimilations.length > 0 ||
      this.avatarAbsorbPulses.length > 0
    );
  }

  private updateTerritoryTakeovers(): void {
    if (this.territoryTakeovers.length === 0) return;
    const now = performance.now();
    this.territoryTakeovers = this.territoryTakeovers.filter((effect) => {
      const t = Math.min(1, (now - effect.startMs) / effect.durationMs);
      if (this.isNearCameraXZ(effect.origin.x, effect.origin.y)) {
        effect.uniforms.rippleRadius.value = effect.maxRadius * t;
      }
      if (t < 1) return true;
      this.scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.material.dispose();
      return false;
    });
  }

  private updateCaptureAssimilations(): void {
    if (this.captureAssimilations.length === 0) return;
    const now = performance.now();
    this.captureAssimilations = this.captureAssimilations.filter((effect) => {
      const t = Math.min(1, (now - effect.startMs) / effect.durationMs);
      if (this.isNearCameraXZ(effect.origin.x, effect.origin.y)) {
        const easeOut = 1 - Math.pow(1 - t, 3);
        const brightness = Math.sin(Math.min(1, t * 1.25) * Math.PI);
        effect.material.color
          .copy(effect.endColor)
          .lerp(effect.startColor, brightness);
        effect.material.opacity = (1 - easeOut) * (0.78 + brightness * 0.18);
        effect.mesh.position.y = TRAIL_Y + 0.003 + brightness * 0.025;
      }
      if (t < 1) return true;
      this.scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.material.dispose();
      return false;
    });
  }

  private updateAvatarAbsorbPulses(): void {
    if (this.avatarAbsorbPulses.length === 0) return;
    const now = performance.now();
    this.avatarAbsorbPulses = this.avatarAbsorbPulses.filter((effect) => {
      const elapsed = now - effect.startMs;
      return elapsed < effect.delayMs + effect.durationMs;
    });
  }

  private getAvatarAbsorbPulse(playerId: number): number {
    const now = performance.now();
    let strongest = 0;
    for (const effect of this.avatarAbsorbPulses) {
      if (effect.playerId !== playerId) continue;
      const elapsed = now - effect.startMs - effect.delayMs;
      if (elapsed < 0 || elapsed > effect.durationMs) continue;
      const t = elapsed / effect.durationMs;
      const pulse = Math.sin(t * Math.PI);
      if (pulse > strongest) strongest = pulse;
    }
    return strongest;
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

  private createDeathSplatGeometry(
    victimId: number,
    color: number,
  ): THREE.ShapeGeometry {
    const pointCount = 18;
    const seed = victimId * 0.83 + color * 0.0000031;
    const points: THREE.Vector2[] = [];
    for (let i = 0; i < pointCount; i++) {
      const t = i / pointCount;
      const angle = t * Math.PI * 2;
      const lobe =
        0.58 +
        Math.sin(angle * 3 + seed) * 0.09 +
        Math.sin(angle * 5 + seed * 1.7) * 0.05;
      const spur = i % 2 === 0 ? 0.22 : 0.08;
      const radius = Math.max(0.42, lobe + spur);
      points.push(
        new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius),
      );
    }

    const shape = new THREE.Shape();
    const first = points[0];
    shape.moveTo(first.x, first.y);
    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const mid = new THREE.Vector2(
        (current.x + next.x) * 0.5,
        (current.y + next.y) * 0.5,
      );
      shape.quadraticCurveTo(current.x, current.y, mid.x, mid.y);
    }
    shape.closePath();

    return new THREE.ShapeGeometry(shape, 18);
  }

  private updateDeathSplats(): void {
    if (this.deathSplats.length === 0) return;
    const now = performance.now();
    this.deathSplats = this.deathSplats.filter((effect) => {
      const elapsed = now - effect.startMs;
      const squashT = Math.min(1, elapsed / effect.squashDurationMs);
      const lifeT = Math.min(1, elapsed / effect.durationMs);
      if (this.isNearCameraXZ(effect.origin.x, effect.origin.y)) {
        const easeOut = 1 - Math.pow(1 - squashT, 3);

        effect.splatMesh.scale.setScalar(0.2 + easeOut * 1.05);
        if (lifeT < 0.72) {
          effect.splatMaterial.opacity = 0.84 * Math.min(1, squashT * 1.4);
        } else {
          const fadeT = (lifeT - 0.72) / 0.28;
          effect.splatMaterial.opacity = 0.84 * Math.max(0, 1 - fadeT);
        }

        if (
          effect.body &&
          effect.baseBodyPosition &&
          effect.baseBodyScale &&
          effect.baseBodyRotation
        ) {
          effect.body.position.x = effect.baseBodyPosition.x;
          effect.body.position.z = effect.baseBodyPosition.z;
          effect.body.position.y =
            effect.baseBodyPosition.y * (1 - 0.92 * easeOut);
          effect.body.rotation.x = effect.baseBodyRotation.x + easeOut * 0.15;
          effect.body.rotation.y = effect.baseBodyRotation.y;
          effect.body.rotation.z = effect.baseBodyRotation.z;
          effect.body.scale.x = effect.baseBodyScale.x * (1 + 0.36 * easeOut);
          effect.body.scale.y =
            effect.baseBodyScale.y * Math.max(0.04, 1 - 0.96 * easeOut);
          effect.body.scale.z = effect.baseBodyScale.z * (1 + 0.3 * easeOut);

          const bodyOpacity =
            lifeT < 0.42 ? 1 : Math.max(0, 1 - (lifeT - 0.42) / 0.2);
          for (const material of effect.bodyMaterials) {
            material.transparent = true;
            material.opacity = bodyOpacity;
            material.depthWrite = false;
          }
        }
      }

      if (lifeT < 1) return true;
      this.scene.remove(effect.group);
      effect.splatMesh.geometry.dispose();
      effect.splatMaterial.dispose();
      for (const material of effect.bodyMaterials) {
        material.dispose();
      }
      return false;
    });
  }

  private cleanupDeathSplatsForVictim(victimId: number): void {
    this.deathSplats = this.deathSplats.filter((effect) => {
      if (victimId >= 0 && effect.victimId !== victimId) return true;
      this.scene.remove(effect.group);
      effect.splatMesh.geometry.dispose();
      effect.splatMaterial.dispose();
      for (const material of effect.bodyMaterials) {
        material.dispose();
      }
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
    this.renderer.setSize(w, h, false);
  }

  cleanupPlayer(id: number): void {
    this.clearCapturedFollowers(id);
    this.avatarFollowHistory.delete(id);
    this.removeTerritory(id);
    this.cleanupTakeoversForVictim(id);
    this.cleanupCaptureAssimilations();
    this.avatarAbsorbPulses = this.avatarAbsorbPulses.filter(
      (effect) => effect.playerId !== id,
    );
    const trail = this.trailMeshes.get(id);
    if (trail) {
      this.scene.remove(trail);
      trail.geometry.dispose();
      this.trailMeshes.delete(id);
    }
    const carveTrail = this.trailCarveMeshes.get(id);
    if (carveTrail) {
      this.scene.remove(carveTrail);
      carveTrail.geometry.dispose();
      this.trailCarveMeshes.delete(id);
    }
    const carveEdgeTrail = this.trailCarveEdgeMeshes.get(id);
    if (carveEdgeTrail) {
      this.scene.remove(carveEdgeTrail);
      carveEdgeTrail.geometry.dispose();
      this.trailCarveEdgeMeshes.delete(id);
    }
    const trailMat = this.trailMaterials.get(id);
    if (trailMat) {
      trailMat.dispose();
      this.trailMaterials.delete(id);
    }
    const carveTrailMat = this.trailCarveMaterials.get(id);
    if (carveTrailMat) {
      carveTrailMat.dispose();
      this.trailCarveMaterials.delete(id);
    }
    const carveEdgeTrailMat = this.trailCarveEdgeMaterials.get(id);
    if (carveEdgeTrailMat) {
      carveEdgeTrailMat.dispose();
      this.trailCarveEdgeMaterials.delete(id);
    }
    const boardCarveTrail = this.trailBoardCarveMeshes.get(id);
    if (boardCarveTrail) {
      this.scene.remove(boardCarveTrail);
      boardCarveTrail.geometry.dispose();
      this.trailBoardCarveMeshes.delete(id);
    }
    const boardCarveTrail2 = this.trailBoardCarveMesh2s.get(id);
    if (boardCarveTrail2) {
      this.scene.remove(boardCarveTrail2);
      boardCarveTrail2.geometry.dispose();
      this.trailBoardCarveMesh2s.delete(id);
    }
    const boardCarveTrailMat = this.trailBoardCarveMaterials.get(id);
    if (boardCarveTrailMat) {
      boardCarveTrailMat.dispose();
      this.trailBoardCarveMaterials.delete(id);
    }
    const enemyBoardCarveListCleanup =
      this.trailEnemyBoardCarveMeshList.get(id);
    if (enemyBoardCarveListCleanup) {
      for (const m of enemyBoardCarveListCleanup) {
        this.scene.remove(m);
        m.geometry.dispose();
      }
      this.trailEnemyBoardCarveMeshList.delete(id);
    }
    const enemyBoardCarveMatCleanup =
      this.trailEnemyBoardCarveMaterials.get(id);
    if (enemyBoardCarveMatCleanup) {
      for (const mat of enemyBoardCarveMatCleanup) {
        mat.dispose();
      }
      this.trailEnemyBoardCarveMaterials.delete(id);
    }
    this.trailCarvePathPersisted.delete(id);
    this.trailLastCarveWhenInside.delete(id);
    this.trailLengths.delete(id);
    this.trailSourceLengths.delete(id);
    this.trailCarveLengths.delete(id);
    this.trailCarveSourceLengths.delete(id);
    this.trailCarvePathPersisted.delete(id);
    this.hideAvatar(id);
  }

  dispose(): void {
    for (const [id] of this.avatars) this.cleanupPlayer(id);
    this.cleanupTakeoversForVictim(-1);
    this.cleanupDeathSplatsForVictim(-1);
    this.cleanupCaptureAssimilations(true);
    this.avatarAbsorbPulses = [];
    for (const tex of this.patternTextures.values()) tex?.dispose();
    this.patternTextures.clear();
    this.renderer.dispose();
  }

  private cleanupCaptureAssimilations(disposeAll = false): void {
    this.captureAssimilations = this.captureAssimilations.filter((effect) => {
      if (!disposeAll) return true;
      this.scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.material.dispose();
      return false;
    });
  }
}
