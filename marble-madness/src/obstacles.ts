import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

const PINBALL_BOUNCER_IMPULSE_MULTIPLIER = 2;
const PINBALL_BOUNCER_VISUAL_SCALE_PER_MULTIPLIER = 0.2;
const PINBALL_BOUNCER_HIT_COOLDOWN_SECONDS = 0.2;
const PINBALL_BOUNCER_HIT_DISTANCE_PADDING = 0.34;
const PINBALL_BOUNCER_MIN_OUTWARD_SPEED = 1.2;
const PINBALL_BOUNCER_BLOCKED_OUTWARD_SPEED = 0.55;
const PINBALL_BOUNCER_COLUMN_RADIUS_TOP = 0.22;
const PINBALL_BOUNCER_COLUMN_RADIUS_BOTTOM = 0.3;
const PINBALL_BOUNCER_COLUMN_Y_OFFSET_RATIO = -0.28;
const PINBALL_BOUNCER_CAP_Y_RATIO = 0.46;
const BOUNCY_PAD_MAX_ANGULAR_SPEED = Math.PI * 3.2;
const BOUNCY_PAD_WALL_INSET = 0.42;
const BOUNCY_PAD_REACH_RATIO = 0.46;
const BOUNCY_PAD_VISUAL_SCALE_X = 2;
const BOUNCY_PAD_VISUAL_SCALE_Y = 1.8;
const BOUNCY_PAD_VISUAL_SCALE_Z = 0.62;
const BOUNCY_PAD_PIVOT_Y = 0.1;
const BOUNCY_PAD_PADDLE_Y_BASE = 0.24;
const BOUNCY_PAD_COLLIDER_DEPTH_MULTIPLIER = 1.14;
const BOUNCY_PAD_SWEEP_ABS_RADIANS = THREE.MathUtils.degToRad(45);
const OBSTACLE_PHYSICS_WIREFRAME_COLOR = "#4dc8ff";
const OBSTACLE_THUD_MIN_SPEED = 2.1;
const OBSTACLE_THUD_COOLDOWN_SECONDS = 0.18;
const OBSTACLE_THUD_PADDING = 0.08;
const OBSTACLE_ROTATOR_TAP_MIN_SPEED = 4.6;
const OBSTACLE_BOUNCY_PAD_TAP_MIN_SPEED = 4.2;
const OBSTACLE_BLOCKER_TAP_MIN_SPEED = 4.8;
const OBSTACLE_BLOCKER_TAP_MIN_FORWARD_SPEED = 3.2;
const OBSTACLE_SECTION_ENTRY_SAFE_DISTANCE_MIN = 6;
const OBSTACLE_SECTION_ENTRY_SAFE_RATIO = 0.24;

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const tempPoint = new THREE.Vector3();
const tempLocal = new THREE.Vector3();
const tempCenter = new THREE.Vector3();
const tempRotation = new THREE.Quaternion();
const tempInverseRotation = new THREE.Quaternion();
const tempEuler = new THREE.Euler();
const tempVelocityLocal = new THREE.Vector3();

function getPinballBouncerBaseScale(): number {
  return (
    1 +
    (PINBALL_BOUNCER_IMPULSE_MULTIPLIER - 1) *
      PINBALL_BOUNCER_VISUAL_SCALE_PER_MULTIPLIER
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getBouncyPadSweepRange(side: "left" | "right"): {
  startYaw: number;
  endYaw: number;
} {
  return side === "left"
    ? {
      startYaw: BOUNCY_PAD_SWEEP_ABS_RADIANS,
      endYaw: -BOUNCY_PAD_SWEEP_ABS_RADIANS,
    }
    : {
      startYaw: -BOUNCY_PAD_SWEEP_ABS_RADIANS,
      endYaw: BOUNCY_PAD_SWEEP_ABS_RADIANS,
    };
}

function isObstaclePhysicsWireframeEnabled(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  const button = document.getElementById("debug-physics-wire-toggle");
  if (!button) {
    return false;
  }
  return button.dataset.enabled === "true";
}

function createObstaclePhysicsWireframeMesh(
  geometry: THREE.BufferGeometry,
): THREE.Mesh {
  const wireframe = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      color: OBSTACLE_PHYSICS_WIREFRAME_COLOR,
      wireframe: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  wireframe.userData.obstaclePhysicsWireframe = true;
  wireframe.visible = isObstaclePhysicsWireframeEnabled();
  wireframe.castShadow = false;
  wireframe.receiveShadow = false;
  return wireframe;
}

function isPointInsideExpandedOrientedBox(
  point: THREE.Vector3,
  center: THREE.Vector3,
  rotation: THREE.Quaternion,
  halfX: number,
  halfY: number,
  halfZ: number,
  padding: number,
): boolean {
  tempInverseRotation.copy(rotation).invert();
  tempLocal.copy(point).sub(center).applyQuaternion(tempInverseRotation);
  const px = halfX + padding;
  const py = halfY + padding;
  const pz = halfZ + padding;
  return (
    Math.abs(tempLocal.x) <= px &&
    Math.abs(tempLocal.y) <= py &&
    Math.abs(tempLocal.z) <= pz
  );
}

function updateObstacleWireframeVisibility(
  obstacleMeshById: Map<string, THREE.Object3D>,
): void {
  const visible = isObstaclePhysicsWireframeEnabled();
  for (const mesh of obstacleMeshById.values()) {
    mesh.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) {
        return;
      }
      if (node.userData.obstaclePhysicsWireframe === true) {
        node.visible = visible;
      }
    });
  }
}

export type ObstacleKind =
  | "horizontal_blocker"
  | "rotator_x"
  | "pinball_bouncer"
  | "bouncy_pad";
export type WaveObstacleKind = Exclude<ObstacleKind, "horizontal_blocker">;

export interface ObstacleBase {
  id: string;
  kind: ObstacleKind;
  s: number;
  x: number;
  y: number;
  z: number;
  tilt: number;
  radius: number;
}

export interface RotatorXObstacle extends ObstacleBase {
  kind: "rotator_x";
  side: "left" | "right";
  armLength: number;
  armThickness: number;
  height: number;
  spinSpeed: number;
  spinDir: 1 | -1;
  angle: number;
  lastHitAt: number;
}

export interface PinballBouncerObstacle extends ObstacleBase {
  kind: "pinball_bouncer";
  columnHeight: number;
  capRadius: number;
  bounceImpulse: number;
  lastHitAt: number;
}

export interface BouncyPadObstacle extends ObstacleBase {
  kind: "bouncy_pad";
  side: "left" | "right";
  paddleLength: number;
  paddleWidth: number;
  sweepAmplitude: number;
  sweepSpeed: number;
  phase: number;
  sweepAngle: number;
  launchImpulse: number;
  lastHitAt: number;
}

export interface ObstacleAnimationHost {
  fixedStep: number;
  runTimeSeconds: number;
  rotatorObstacles: RotatorXObstacle[];
  pinballBouncers: PinballBouncerObstacle[];
  bouncyPads: BouncyPadObstacle[];
  obstacleMeshById: Map<string, THREE.Object3D>;
  bouncyPadPaddleById: Map<string, THREE.Object3D>;
  bouncerCapById: Map<string, THREE.Mesh>;
  bouncerPulseById: Map<string, number>;
  obstacleBodyById: Map<string, RAPIER.RigidBody>;
  bouncyPadJointById: Map<string, RAPIER.RevoluteImpulseJoint>;
}

export interface ObstacleInteractionHost {
  runTimeSeconds: number;
  marbleRadius: number;
  marbleBody: RAPIER.RigidBody | null;
  rotatorObstacles: RotatorXObstacle[];
  bouncyPads: BouncyPadObstacle[];
  pinballBouncers: PinballBouncerObstacle[];
  rotatorHitAtById: Map<string, number>;
  rotatorTouchingById: Map<string, boolean>;
  bouncyPadHitAtById: Map<string, number>;
  bouncyPadTouchingById: Map<string, boolean>;
  horizontalBlockers: TrackPhysicsHorizontalBlocker[];
  blockerHitAtByIndex: Map<number, number>;
  blockerTouchingByIndex: Map<number, boolean>;
  bouncerPulseById: Map<string, number>;
  onRotatorHit?: (impact: number) => void;
  onBouncyPadHit?: (impact: number) => void;
  onHorizontalBlockerHit?: (impact: number) => void;
  onPinballBouncerHit?: () => void;
}

export interface WaveObstacleSection {
  hasFloor: boolean;
  type: string;
  zStart: number;
  zEnd: number;
}

export interface WaveObstacleArcRange {
  sStart: number;
  sEnd: number;
}

export interface WaveObstacleTrackSample {
  x: number;
  z: number;
  width: number;
}

export interface WaveObstacleHorizontalBlocker {
  x: number;
  z: number;
  length: number;
  depth: number;
}

export interface WaveObstacleBuildContext {
  loopsCompleted: number;
  runObstacleOrder: WaveObstacleKind[];
  levelSections: WaveObstacleSection[];
  sectionArcRanges: WaveObstacleArcRange[];
  fireworkTriggerS: number;
  obstacleStartSafeDistance: number;
  obstacleFinishSafeDistance: number;
  trackArcLength: number;
  wallThickness: number;
  obstacleMaxPerTypeCap: number;
  obstacleWaveLinearGrowth: number;
  obstacleClusterSpacing: number;
  obstacleMinDistance: number;
  rotatorArmLength: number;
  rotatorArmThickness: number;
  rotatorHeight: number;
  rotatorSpinSpeedBase: number;
  bouncerColumnHeight: number;
  bouncerCapRadius: number;
  bouncerImpulse: number;
  bouncyPadLength: number;
  bouncyPadWidth: number;
  bouncyPadSweepAmplitude: number;
  bouncyPadSweepSpeedBase: number;
  bouncyPadLaunchImpulse: number;
  marbleRadius: number;
  horizontalBlockers: WaveObstacleHorizontalBlocker[];
  hasFloorAtArcLength: (s: number) => boolean;
  getTrackTiltAtArcLength: (s: number) => number;
  getTrackSampleAtArcLength: (s: number) => WaveObstacleTrackSample;
  getTrackSurfaceYAtPosition: (x: number, z: number) => number;
  randomRange: (min: number, max: number) => number;
  nextObstacleId: (kind: WaveObstacleKind) => string;
}

export interface WaveObstacleBuildResult {
  rotatorObstacles: RotatorXObstacle[];
  pinballBouncers: PinballBouncerObstacle[];
  bouncyPads: BouncyPadObstacle[];
}

export interface WaveObstacleMeshHost {
  rotatorObstacles: RotatorXObstacle[];
  pinballBouncers: PinballBouncerObstacle[];
  bouncyPads: BouncyPadObstacle[];
  obstacleMeshById: Map<string, THREE.Object3D>;
  bouncyPadPaddleById: Map<string, THREE.Object3D>;
  bouncerCapById: Map<string, THREE.Mesh>;
  bouncerPulseById: Map<string, number>;
  addLevelObject: (object: THREE.Object3D) => void;
}

export interface ObstacleVisualStateHost {
  obstacleMeshById: Map<string, THREE.Object3D>;
  bouncyPadPaddleById: Map<string, THREE.Object3D>;
  bouncerCapById: Map<string, THREE.Mesh>;
  bouncerPulseById: Map<string, number>;
}

interface TrackSlicePhysicsLike {
  centerX: number;
  centerY: number;
  centerZ: number;
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  zStart: number;
  zEnd: number;
  width: number;
  length: number;
}

interface TrackRunPhysicsPoint {
  x: number;
  y: number;
  z: number;
  width: number;
}

export interface TrackPhysicsHorizontalBlocker {
  x: number;
  y: number;
  z: number;
  tilt: number;
  length: number;
  height: number;
  depth: number;
}

export interface TrackPhysicsContext {
  world: RAPIER.World | null;
  trackRigidBodies: RAPIER.RigidBody[];
  obstacleBodyById: Map<string, RAPIER.RigidBody>;
  bouncyPadJointById: Map<string, RAPIER.RevoluteImpulseJoint>;
  halfPipePhysicsSegments: number;
  trackThickness: number;
  horizontalBlockers: TrackPhysicsHorizontalBlocker[];
  rotatorObstacles: RotatorXObstacle[];
  pinballBouncers: PinballBouncerObstacle[];
  bouncyPads: BouncyPadObstacle[];
  buildPhysicsRuns(): TrackRunPhysicsPoint[][];
  getHalfPipeHeightAtOffset(xOffsetAbs: number, width: number): number;
}

export function createRunObstacleOrder(
  randomFn: () => number = Math.random,
): ObstacleKind[] {
  const order: ObstacleKind[] = [
    "horizontal_blocker",
    "rotator_x",
    "pinball_bouncer",
    "bouncy_pad",
  ];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

function tryCreateWaveObstacle(
  context: WaveObstacleBuildContext,
  kind: WaveObstacleKind,
  s: number,
  existing: ObstacleBase[],
): ObstacleBase | null {
  if (Math.abs(s - context.fireworkTriggerS) < 12) {
    return null;
  }
  if (s < context.obstacleStartSafeDistance) {
    return null;
  }
  if (context.trackArcLength - s < context.obstacleFinishSafeDistance) {
    return null;
  }
  if (!context.hasFloorAtArcLength(s)) {
    return null;
  }
  if (Math.abs(context.getTrackTiltAtArcLength(s)) > 0.08) {
    return null;
  }

  const sample = context.getTrackSampleAtArcLength(s);
  const centerX = sample.x;
  const centerZ = sample.z;
  const width = sample.width;
  const innerHalf = width * 0.5 - context.wallThickness - 0.8;
  if (innerHalf < 2.2) {
    return null;
  }

  let obstacle:
    | RotatorXObstacle
    | PinballBouncerObstacle
    | BouncyPadObstacle
    | null = null;
  if (kind === "rotator_x") {
    const side = Math.random() < 0.5 ? "left" : "right";
    const sideSign = side === "left" ? -1 : 1;
    const x =
      centerX +
      sideSign * Math.max(2.1, innerHalf - (context.rotatorArmLength * 0.55 + 0.65));
    obstacle = {
      id: context.nextObstacleId(kind),
      kind,
      s,
      x,
      y:
        context.getTrackSurfaceYAtPosition(x, centerZ) +
        context.rotatorHeight * 0.5 +
        0.12,
      z: centerZ,
      tilt: context.getTrackTiltAtArcLength(s),
      radius: context.rotatorArmLength + 1.1,
      side,
      armLength: context.rotatorArmLength,
      armThickness: context.rotatorArmThickness,
      height: context.rotatorHeight,
      spinSpeed: context.rotatorSpinSpeedBase + context.randomRange(-0.45, 0.55),
      spinDir: Math.random() < 0.5 ? 1 : -1,
      angle: context.randomRange(0, Math.PI * 2),
      lastHitAt: -999,
    };
  } else if (kind === "pinball_bouncer") {
    const sideSign = Math.random() < 0.5 ? -1 : 1;
    const x =
      centerX + sideSign * context.randomRange(innerHalf * 0.28, innerHalf * 0.62);
    obstacle = {
      id: context.nextObstacleId(kind),
      kind,
      s,
      x,
      y:
        context.getTrackSurfaceYAtPosition(x, centerZ) +
        context.bouncerColumnHeight +
        context.bouncerCapRadius * 0.45,
      z: centerZ,
      tilt: context.getTrackTiltAtArcLength(s),
      radius: context.bouncerCapRadius + 0.72,
      columnHeight: context.bouncerColumnHeight,
      capRadius: context.bouncerCapRadius,
      bounceImpulse:
        context.bouncerImpulse * PINBALL_BOUNCER_IMPULSE_MULTIPLIER,
      lastHitAt: -999,
    };
  } else {
    const sideSign = Math.random() < 0.5 ? -1 : 1;
    const side: "left" | "right" = sideSign < 0 ? "left" : "right";
    const x = centerX + sideSign * Math.max(2.1, innerHalf - BOUNCY_PAD_WALL_INSET);
    obstacle = {
      id: context.nextObstacleId(kind),
      kind,
      s,
      side,
      x,
      y:
        context.getTrackSurfaceYAtPosition(x, centerZ) +
        context.marbleRadius * 0.75,
      z: centerZ,
      tilt: context.getTrackTiltAtArcLength(s),
      radius: context.bouncyPadLength * 0.66,
      paddleLength: context.bouncyPadLength,
      paddleWidth: context.bouncyPadWidth,
      sweepAmplitude: context.bouncyPadSweepAmplitude,
      sweepSpeed: context.bouncyPadSweepSpeedBase + context.randomRange(-0.75, 0.75),
      phase: context.randomRange(0, Math.PI * 2),
      sweepAngle: 0,
      launchImpulse: context.bouncyPadLaunchImpulse,
      lastHitAt: -999,
    };
  }

  if (!obstacle) {
    return null;
  }
  if (Math.abs(obstacle.x - centerX) < 1.7) {
    return null;
  }

  for (const blocker of context.horizontalBlockers) {
    const xClearance = blocker.length * 0.5 + obstacle.radius + 0.75;
    const zClearance = blocker.depth * 0.5 + obstacle.radius + 0.75;
    if (
      Math.abs(obstacle.x - blocker.x) < xClearance &&
      Math.abs(obstacle.z - blocker.z) < zClearance
    ) {
      return null;
    }
  }

  for (const other of existing) {
    const dx = obstacle.x - other.x;
    const dz = obstacle.z - other.z;
    const minDistance = obstacle.radius + other.radius + context.obstacleMinDistance;
    if (dx * dx + dz * dz < minDistance * minDistance) {
      return null;
    }
  }

  return obstacle;
}

export function buildWaveObstacles(
  context: WaveObstacleBuildContext,
): WaveObstacleBuildResult {
  const rotatorObstacles: RotatorXObstacle[] = [];
  const pinballBouncers: PinballBouncerObstacle[] = [];
  const bouncyPads: BouncyPadObstacle[] = [];

  const wave = context.loopsCompleted + 1;
  const activeTypeCount = THREE.MathUtils.clamp(wave, 1, 3);
  const activeKinds = context.runObstacleOrder.slice(0, activeTypeCount);
  const candidateSections = context.levelSections
    .map((section, index) => ({ section, index }))
    .filter(
      ({ section }) =>
        section.hasFloor &&
        section.type !== "start" &&
        section.type !== "end" &&
        section.type !== "bottleneck" &&
        section.type !== "jump" &&
        section.type !== "slope_down_soft" &&
        section.type !== "slope_down_steep" &&
        section.type !== "spiral_down_left" &&
        section.type !== "spiral_down_right" &&
        section.zStart - section.zEnd > 10,
    );

  if (candidateSections.length === 0 || activeKinds.length === 0) {
    console.log("[BuildWaveObstacles]", "No valid sections for obstacle wave");
    return { rotatorObstacles, pinballBouncers, bouncyPads };
  }

  const placed: ObstacleBase[] = [];
  for (let kindIndex = 0; kindIndex < activeKinds.length; kindIndex += 1) {
    const kind = activeKinds[kindIndex];
    const targetCount = Math.min(
      context.obstacleMaxPerTypeCap,
      2 + context.loopsCompleted * context.obstacleWaveLinearGrowth + kindIndex,
    );

    let placedCount = 0;
    let attempts = 0;
    while (placedCount < targetCount && attempts < targetCount * 40) {
      attempts += 1;
      const section =
        candidateSections[Math.floor(Math.random() * candidateSections.length)];
      const arcRange = context.sectionArcRanges[section.index];
      if (!arcRange) {
        continue;
      }
      const sectionSpan = Math.max(0, arcRange.sEnd - arcRange.sStart);
      const sectionEntrySafeDistance = Math.max(
        OBSTACLE_SECTION_ENTRY_SAFE_DISTANCE_MIN,
        sectionSpan * OBSTACLE_SECTION_ENTRY_SAFE_RATIO,
      );
      const sMin = Math.max(
        arcRange.sStart + sectionEntrySafeDistance,
        context.obstacleStartSafeDistance,
      );
      const sMax = Math.min(
        arcRange.sEnd - 3,
        context.trackArcLength - context.obstacleFinishSafeDistance,
      );
      if (sMax <= sMin) {
        continue;
      }
      const anchorS = context.randomRange(sMin, sMax);
      const clusterSize = Math.min(
        targetCount - placedCount,
        3 + Math.floor(Math.random() * 3),
      );
      let clusterPlaced = 0;

      for (let i = 0; i < clusterSize; i += 1) {
        const s = anchorS + i * context.obstacleClusterSpacing;
        const obstacle = tryCreateWaveObstacle(context, kind, s, placed);
        if (!obstacle) {
          continue;
        }
        placed.push(obstacle);
        clusterPlaced += 1;
        if (kind === "rotator_x") {
          rotatorObstacles.push(obstacle as RotatorXObstacle);
        } else if (kind === "pinball_bouncer") {
          pinballBouncers.push(obstacle as PinballBouncerObstacle);
        } else {
          bouncyPads.push(obstacle as BouncyPadObstacle);
        }
      }
      placedCount += clusterPlaced;
    }
  }

  console.log(
    "[BuildWaveObstacles]",
    "wave=" +
      String(wave) +
      " rotators=" +
      String(rotatorObstacles.length) +
      " bouncers=" +
      String(pinballBouncers.length) +
      " pads=" +
      String(bouncyPads.length),
  );

  return { rotatorObstacles, pinballBouncers, bouncyPads };
}

export function addWaveObstacleMeshes(host: WaveObstacleMeshHost): void {
  const rotatorMaterial = new THREE.MeshStandardMaterial({
    color: "#5a7d94",
    roughness: 0.4,
    metalness: 0.5,
    emissive: "#1f3344",
    emissiveIntensity: 0.22,
  });
  const bouncerMaterial = new THREE.MeshStandardMaterial({
    color: "#8f5edb",
    roughness: 0.35,
    metalness: 0.18,
    emissive: "#301860",
    emissiveIntensity: 0.18,
  });
  const padMaterial = new THREE.MeshStandardMaterial({
    color: "#21b483",
    roughness: 0.44,
    metalness: 0.12,
    emissive: "#0e4032",
    emissiveIntensity: 0.2,
  });

  for (const rotator of host.rotatorObstacles) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.28, 0.28, 10),
      rotatorMaterial,
    );
    base.position.y = -rotator.height * 0.43;
    group.add(base);

    const paddleHeight = rotator.height * 0.96;
    const paddleLength = rotator.armLength * 2;
    for (let i = 0; i < 4; i += 1) {
      const angle = Math.PI * 0.25 + (i / 4) * Math.PI * 2;
      const paddle = new THREE.Mesh(
        new THREE.BoxGeometry(
          paddleLength,
          paddleHeight,
          rotator.armThickness,
        ),
        rotatorMaterial,
      );
      paddle.position.set(0, 0, 0);
      paddle.rotation.y = angle;
      group.add(paddle);
    }
    const hubWireframe = createObstaclePhysicsWireframeMesh(
      new THREE.BoxGeometry(0.52, 0.28, 0.52),
    );
    hubWireframe.position.y = -rotator.height * 0.43;
    group.add(hubWireframe);
    for (let i = 0; i < 4; i += 1) {
      const localAngle = Math.PI * 0.25 + (i / 4) * Math.PI * 2;
      const armWireframe = createObstaclePhysicsWireframeMesh(
        new THREE.BoxGeometry(
          rotator.armLength * 2,
          rotator.height * 0.96,
          rotator.armThickness,
        ),
      );
      armWireframe.rotation.y = localAngle;
      group.add(armWireframe);
    }
    group.rotation.y = rotator.angle;
    group.rotation.x = -rotator.tilt;
    group.position.set(rotator.x, rotator.y, rotator.z);
    group.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    host.addLevelObject(group);
    host.obstacleMeshById.set(rotator.id, group);
  }

  for (const bouncer of host.pinballBouncers) {
    const group = new THREE.Group();
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(
        PINBALL_BOUNCER_COLUMN_RADIUS_TOP,
        PINBALL_BOUNCER_COLUMN_RADIUS_BOTTOM,
        bouncer.columnHeight,
        12,
      ),
      bouncerMaterial,
    );
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(
        bouncer.capRadius,
        18,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI * 0.5,
      ),
      bouncerMaterial,
    );
    column.position.y =
      bouncer.capRadius * PINBALL_BOUNCER_COLUMN_Y_OFFSET_RATIO;
    cap.position.y = bouncer.columnHeight * PINBALL_BOUNCER_CAP_Y_RATIO;
    const bouncerBaseScale = getPinballBouncerBaseScale();
    cap.scale.setScalar(bouncerBaseScale);
    group.add(column);
    group.add(cap);
    const columnHalfExtent = Math.max(
      PINBALL_BOUNCER_COLUMN_RADIUS_TOP,
      PINBALL_BOUNCER_COLUMN_RADIUS_BOTTOM,
    );
    const columnWireframe = createObstaclePhysicsWireframeMesh(
      new THREE.BoxGeometry(
        columnHalfExtent * 2,
        bouncer.columnHeight,
        columnHalfExtent * 2,
      ),
    );
    columnWireframe.position.y =
      bouncer.capRadius * PINBALL_BOUNCER_COLUMN_Y_OFFSET_RATIO;
    const capWireframe = createObstaclePhysicsWireframeMesh(
      new THREE.SphereGeometry(
        bouncer.capRadius * bouncerBaseScale,
        14,
        10,
      ),
    );
    capWireframe.position.y = bouncer.columnHeight * PINBALL_BOUNCER_CAP_Y_RATIO;
    group.add(columnWireframe);
    group.add(capWireframe);
    host.bouncerCapById.set(bouncer.id, cap);
    host.bouncerPulseById.set(bouncer.id, 0);
    group.rotation.x = -bouncer.tilt;
    group.position.set(bouncer.x, bouncer.y, bouncer.z);
    group.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    host.addLevelObject(group);
    host.obstacleMeshById.set(bouncer.id, group);
  }

  for (const pad of host.bouncyPads) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), padMaterial);
    const anchorStem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.56, 14),
      padMaterial,
    );
    const anchorCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.22, 0.12, 14),
      padMaterial,
    );
    const pivot = new THREE.Group();
    const paddleRadius = Math.max(0.2, pad.paddleWidth * 0.42);
    const paddleBodyLength = Math.max(0.24, pad.paddleLength - paddleRadius * 2);
    const paddle = new THREE.Mesh(
      new THREE.CapsuleGeometry(paddleRadius, paddleBodyLength, 8, 18),
      padMaterial,
    );
    base.position.y = -0.08;
    pivot.position.y = BOUNCY_PAD_PIVOT_Y;
    const sideSign = pad.side === "left" ? 1 : -1;
    const addedHeightUnderOffset = paddleRadius * (BOUNCY_PAD_VISUAL_SCALE_X - 1);
    // Rotate the capsule to align with swing direction, then stretch vertically
    // so it reads as an upright paddle blade rather than a flat plank.
    paddle.rotation.z = Math.PI * 0.5;
    paddle.scale.set(
      BOUNCY_PAD_VISUAL_SCALE_X,
      BOUNCY_PAD_VISUAL_SCALE_Y,
      BOUNCY_PAD_VISUAL_SCALE_Z,
    );
    const paddleReach = pad.paddleLength * BOUNCY_PAD_REACH_RATIO;
    paddle.position.set(
      sideSign * paddleReach,
      BOUNCY_PAD_PADDLE_Y_BASE - addedHeightUnderOffset,
      0,
    );
    anchorStem.position.set(0, -0.26, 0);
    anchorCap.position.set(0, 0.02, 0);
    const colliderPaddleHalfLength =
      (paddleBodyLength * 0.5 + paddleRadius) * BOUNCY_PAD_VISUAL_SCALE_Y * 0.98;
    const colliderPaddleHalfHeight =
      paddleRadius * BOUNCY_PAD_VISUAL_SCALE_X * 0.94;
    const colliderPaddleHalfDepth =
      paddleRadius * BOUNCY_PAD_VISUAL_SCALE_Z * 1.08;
    const colliderPaddleCenterY =
      BOUNCY_PAD_PIVOT_Y +
      BOUNCY_PAD_PADDLE_Y_BASE -
      paddleRadius * (BOUNCY_PAD_VISUAL_SCALE_X - 1);
    const baseWireframe = createObstaclePhysicsWireframeMesh(
      new THREE.BoxGeometry(0.35, 0.4, 0.35),
    );
    baseWireframe.position.y = -0.08;
    group.add(baseWireframe);
    const paddleWireframe = createObstaclePhysicsWireframeMesh(
      new THREE.BoxGeometry(
        colliderPaddleHalfLength * 2,
        colliderPaddleHalfHeight * 2,
        colliderPaddleHalfDepth * 2,
      ),
    );
    paddleWireframe.position.set(
      sideSign * paddleReach,
      colliderPaddleCenterY - BOUNCY_PAD_PIVOT_Y,
      0,
    );
    pivot.add(paddleWireframe);
    const guardWireframe = createObstaclePhysicsWireframeMesh(
      new THREE.BoxGeometry(0.48, 0.4, 0.48),
    );
    guardWireframe.position.set(0, -0.04, 0);
    group.add(guardWireframe);
    const { startYaw } = getBouncyPadSweepRange(pad.side);
    pivot.rotation.y = startYaw;
    group.add(base);
    group.add(anchorStem);
    group.add(anchorCap);
    pivot.add(paddle);
    group.add(pivot);
    group.rotation.x = -pad.tilt;
    group.position.set(pad.x, pad.y, pad.z);
    group.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    host.addLevelObject(group);
    host.obstacleMeshById.set(pad.id, group);
    host.bouncyPadPaddleById.set(pad.id, pivot);
  }

  console.log(
    "[AddWaveObstacleMeshes]",
    "Added obstacle meshes total=" +
      String(
        host.rotatorObstacles.length +
          host.pinballBouncers.length +
          host.bouncyPads.length,
      ),
  );
}

export function clearObstacleVisualState(host: ObstacleVisualStateHost): void {
  host.obstacleMeshById.clear();
  host.bouncyPadPaddleById.clear();
  host.bouncerCapById.clear();
  host.bouncerPulseById.clear();
}

export function clearTrackPhysicsBodies(
  world: RAPIER.World | null,
  trackRigidBodies: RAPIER.RigidBody[],
  obstacleBodyById: Map<string, RAPIER.RigidBody>,
  bouncyPadJointById: Map<string, RAPIER.RevoluteImpulseJoint>,
): void {
  if (!world) {
    return;
  }
  for (const body of trackRigidBodies) {
    world.removeRigidBody(body);
  }
  trackRigidBodies.length = 0;
  obstacleBodyById.clear();
  bouncyPadJointById.clear();
}

export function applyObstacleInteractions(host: ObstacleInteractionHost): void {
  if (!host.marbleBody) {
    return;
  }

  const marblePosition = host.marbleBody.translation();
  tempPoint.set(marblePosition.x, marblePosition.y, marblePosition.z);
  const marbleVelocity = host.marbleBody.linvel();
  const marbleSpeed = Math.sqrt(
    marbleVelocity.x * marbleVelocity.x +
      marbleVelocity.y * marbleVelocity.y +
      marbleVelocity.z * marbleVelocity.z,
  );

  if (marbleSpeed >= OBSTACLE_THUD_MIN_SPEED) {
    for (const rotator of host.rotatorObstacles) {
      const wasTouching = host.rotatorTouchingById.get(rotator.id) === true;
      const lastRotatorHit = host.rotatorHitAtById.get(rotator.id) ?? -999;
      tempCenter.set(rotator.x, rotator.y, rotator.z);
      tempRotation.setFromEuler(tempEuler.set(-rotator.tilt, rotator.angle, 0));
      let hitRotator = false;
      for (let i = 0; i < 4; i += 1) {
        const localAngle = Math.PI * 0.25 + (i / 4) * Math.PI * 2;
        const armRotation = new THREE.Quaternion()
          .setFromAxisAngle(UP_AXIS, localAngle)
          .premultiply(tempRotation);
        const hitArm = isPointInsideExpandedOrientedBox(
          tempPoint,
          tempCenter,
          armRotation,
          rotator.armLength,
          rotator.height * 0.48,
          rotator.armThickness * 0.5,
          host.marbleRadius + OBSTACLE_THUD_PADDING,
        );
        if (hitArm) {
          hitRotator = true;
          break;
        }
      }
      if (!hitRotator) {
        if (wasTouching) {
          host.rotatorTouchingById.delete(rotator.id);
        }
        continue;
      }
      host.rotatorTouchingById.set(rotator.id, true);
      if (wasTouching) {
        continue;
      }
      if (host.runTimeSeconds - lastRotatorHit < OBSTACLE_THUD_COOLDOWN_SECONDS) {
        continue;
      }
      if (marbleSpeed < OBSTACLE_ROTATOR_TAP_MIN_SPEED) {
        continue;
      }
      host.rotatorHitAtById.set(rotator.id, host.runTimeSeconds);
      host.onRotatorHit?.(Math.max(2.8, marbleSpeed * 0.92));
    }

    for (const pad of host.bouncyPads) {
      const wasTouching = host.bouncyPadTouchingById.get(pad.id) === true;
      const lastPadHit = host.bouncyPadHitAtById.get(pad.id) ?? -999;
      const sideSign = pad.side === "left" ? 1 : -1;
      const paddleRadius = Math.max(0.2, pad.paddleWidth * 0.42);
      const paddleBodyLength = Math.max(0.24, pad.paddleLength - paddleRadius * 2);
      const paddleCapsuleHalfLength = paddleBodyLength * 0.5 + paddleRadius;
      const paddleHalfLength = paddleCapsuleHalfLength * BOUNCY_PAD_VISUAL_SCALE_Y * 0.98;
      const paddleHalfHeight = paddleRadius * BOUNCY_PAD_VISUAL_SCALE_X * 0.94;
      const paddleHalfDepth =
        paddleRadius * BOUNCY_PAD_VISUAL_SCALE_Z * 1.08 * BOUNCY_PAD_COLLIDER_DEPTH_MULTIPLIER;
      const paddleCenterY =
        BOUNCY_PAD_PIVOT_Y +
        BOUNCY_PAD_PADDLE_Y_BASE -
        paddleRadius * (BOUNCY_PAD_VISUAL_SCALE_X - 1);
      const paddleReach = pad.paddleLength * BOUNCY_PAD_REACH_RATIO;
      tempRotation.setFromEuler(tempEuler.set(-pad.tilt, pad.sweepAngle, 0));
      tempCenter
        .set(sideSign * paddleReach, paddleCenterY, 0)
        .applyQuaternion(tempRotation);
      tempCenter.x += pad.x;
      tempCenter.y += pad.y;
      tempCenter.z += pad.z;
      const hitPad = isPointInsideExpandedOrientedBox(
        tempPoint,
        tempCenter,
        tempRotation,
        paddleHalfLength,
        paddleHalfHeight,
        paddleHalfDepth,
        host.marbleRadius + OBSTACLE_THUD_PADDING,
      );
      if (!hitPad) {
        if (wasTouching) {
          host.bouncyPadTouchingById.delete(pad.id);
        }
        continue;
      }
      host.bouncyPadTouchingById.set(pad.id, true);
      if (wasTouching) {
        continue;
      }
      if (host.runTimeSeconds - lastPadHit < OBSTACLE_THUD_COOLDOWN_SECONDS) {
        continue;
      }
      if (marbleSpeed < OBSTACLE_BOUNCY_PAD_TAP_MIN_SPEED) {
        continue;
      }
      host.bouncyPadHitAtById.set(pad.id, host.runTimeSeconds);
      host.onBouncyPadHit?.(Math.max(2.6, marbleSpeed * 0.84));
    }

    for (let blockerIndex = 0; blockerIndex < host.horizontalBlockers.length; blockerIndex += 1) {
      const blocker = host.horizontalBlockers[blockerIndex];
      const wasTouching = host.blockerTouchingByIndex.get(blockerIndex) === true;
      const lastBlockerHit = host.blockerHitAtByIndex.get(blockerIndex) ?? -999;
      if (host.runTimeSeconds - lastBlockerHit < OBSTACLE_THUD_COOLDOWN_SECONDS) {
        continue;
      }
      tempCenter.set(blocker.x, blocker.y, blocker.z);
      tempRotation.setFromEuler(tempEuler.set(-blocker.tilt, 0, 0));
      const hitBlocker = isPointInsideExpandedOrientedBox(
        tempPoint,
        tempCenter,
        tempRotation,
        blocker.length * 0.5,
        blocker.height * 0.5,
        blocker.depth * 0.5,
        host.marbleRadius + OBSTACLE_THUD_PADDING,
      );
      if (!hitBlocker) {
        if (wasTouching) {
          host.blockerTouchingByIndex.delete(blockerIndex);
        }
        continue;
      }
      host.blockerTouchingByIndex.set(blockerIndex, true);
      if (wasTouching) {
        continue;
      }
      if (marbleSpeed < OBSTACLE_BLOCKER_TAP_MIN_SPEED) {
        continue;
      }
      tempInverseRotation.copy(tempRotation).invert();
      tempVelocityLocal
        .set(marbleVelocity.x, marbleVelocity.y, marbleVelocity.z)
        .applyQuaternion(tempInverseRotation);
      const forwardImpactSpeed = Math.abs(tempVelocityLocal.z);
      const lateralImpactSpeed = Math.abs(tempVelocityLocal.x);
      const verticalImpactSpeed = Math.abs(tempVelocityLocal.y);
      const strongestImpactSpeed = Math.max(
        forwardImpactSpeed,
        lateralImpactSpeed,
        verticalImpactSpeed * 0.65,
      );
      if (
        strongestImpactSpeed < OBSTACLE_BLOCKER_TAP_MIN_SPEED ||
        forwardImpactSpeed < OBSTACLE_BLOCKER_TAP_MIN_FORWARD_SPEED
      ) {
        continue;
      }
      host.blockerHitAtByIndex.set(blockerIndex, host.runTimeSeconds);
      host.onHorizontalBlockerHit?.(Math.max(2.4, marbleSpeed * 0.8));
      break;
    }
  }

  for (const bouncer of host.pinballBouncers) {
    if (
      host.runTimeSeconds - bouncer.lastHitAt <
      PINBALL_BOUNCER_HIT_COOLDOWN_SECONDS
    ) {
      continue;
    }

    const capCenterY = bouncer.y + bouncer.columnHeight * PINBALL_BOUNCER_CAP_Y_RATIO;
    const dx = marblePosition.x - bouncer.x;
    const dy = marblePosition.y - capCenterY;
    const dz = marblePosition.z - bouncer.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    const contactDistance =
      bouncer.capRadius * getPinballBouncerBaseScale() +
      host.marbleRadius +
      PINBALL_BOUNCER_HIT_DISTANCE_PADDING;
    if (distanceSq > contactDistance * contactDistance) {
      continue;
    }

    const distance = Math.sqrt(Math.max(distanceSq, 0.000001));
    let outwardX = dx / distance;
    let outwardZ = dz / distance;
    const horizontalLen = Math.sqrt(outwardX * outwardX + outwardZ * outwardZ);
    if (horizontalLen < 0.001) {
      const velocity = host.marbleBody.linvel();
      const fallbackLen = Math.sqrt(
        velocity.x * velocity.x + velocity.z * velocity.z,
      );
      if (fallbackLen > 0.01) {
        outwardX = -velocity.x / fallbackLen;
        outwardZ = -velocity.z / fallbackLen;
      } else {
        outwardX = 0;
        outwardZ = 1;
      }
    } else {
      outwardX /= horizontalLen;
      outwardZ /= horizontalLen;
    }

    const currentVelocity = host.marbleBody.linvel();
    const outwardSpeed =
      currentVelocity.x * outwardX + currentVelocity.z * outwardZ;
    const blockedFactor = clamp01(
      (PINBALL_BOUNCER_BLOCKED_OUTWARD_SPEED - outwardSpeed) /
        (PINBALL_BOUNCER_BLOCKED_OUTWARD_SPEED + PINBALL_BOUNCER_MIN_OUTWARD_SPEED),
    );
    const horizontalWeight = THREE.MathUtils.lerp(0.9, 0.52, blockedFactor);
    const verticalWeight = THREE.MathUtils.lerp(0.32, 0.88, blockedFactor);
    const impulseMagnitude =
      bouncer.bounceImpulse * THREE.MathUtils.lerp(1, 1.18, blockedFactor);
    const bounceDir = new THREE.Vector3(
      outwardX * horizontalWeight,
      verticalWeight,
      outwardZ * horizontalWeight,
    ).normalize();
    host.marbleBody.applyImpulse(
      {
        x: bounceDir.x * impulseMagnitude,
        y: bounceDir.y * impulseMagnitude,
        z: bounceDir.z * impulseMagnitude,
      },
      true,
    );
    const minOutwardSpeed = THREE.MathUtils.lerp(
      PINBALL_BOUNCER_MIN_OUTWARD_SPEED,
      PINBALL_BOUNCER_BLOCKED_OUTWARD_SPEED,
      blockedFactor,
    );
    const postImpulseVelocity = host.marbleBody.linvel();
    const postOutwardSpeed =
      postImpulseVelocity.x * outwardX + postImpulseVelocity.z * outwardZ;
    const outwardSpeedFix = Math.max(0, minOutwardSpeed - postOutwardSpeed);
    host.marbleBody.setLinvel(
      {
        x: postImpulseVelocity.x + outwardX * outwardSpeedFix,
        y: Math.max(
          postImpulseVelocity.y,
          bouncer.bounceImpulse * THREE.MathUtils.lerp(0.28, 0.62, blockedFactor),
        ),
        z: postImpulseVelocity.z + outwardZ * outwardSpeedFix,
      },
      true,
    );
    bouncer.lastHitAt = host.runTimeSeconds;
    host.bouncerPulseById.set(bouncer.id, 1.35);
    host.onPinballBouncerHit?.();
  }
}

function appendRingVertices(
  outVertices: number[],
  position: THREE.Vector3,
  tangent: THREE.Vector3,
  width: number,
  crossSegments: number,
  getHalfPipeHeightAtOffset: (xOffsetAbs: number, width: number) => number,
): void {
  const worldUp = new THREE.Vector3(0, 1, 0);
  const tangentDir = tangent.lengthSq() < 0.0001
    ? new THREE.Vector3(0, 0, -1)
    : tangent.clone().normalize();
  let right = new THREE.Vector3().crossVectors(tangentDir, worldUp);
  if (right.lengthSq() < 0.0001) {
    right = new THREE.Vector3(1, 0, 0);
  } else {
    right.normalize();
  }
  const up = new THREE.Vector3().crossVectors(right, tangentDir).normalize();

  for (let stripIndex = 0; stripIndex <= crossSegments; stripIndex += 1) {
    const u = stripIndex / crossSegments;
    const localX = (u - 0.5) * width;
    const localY = getHalfPipeHeightAtOffset(Math.abs(localX), width);
    const point = position
      .clone()
      .addScaledVector(right, localX)
      .addScaledVector(up, localY);
    outVertices.push(point.x, point.y, point.z);
  }
}

function buildRunTangents(run: TrackRunPhysicsPoint[]): THREE.Vector3[] {
  const tangents: THREE.Vector3[] = [];
  for (let i = 0; i < run.length; i += 1) {
    const prev = run[Math.max(0, i - 1)];
    const next = run[Math.min(run.length - 1, i + 1)];
    const tangent = new THREE.Vector3(next.x - prev.x, 0, next.z - prev.z);
    if (tangent.lengthSq() < 0.0001) {
      tangent.set(0, 0, -1);
    } else {
      tangent.normalize();
    }
    tangents.push(tangent);
  }
  return tangents;
}

export function createTrackPhysicsBodies(context: TrackPhysicsContext): void {
  if (!context.world) {
    return;
  }

  const floorRuns = context.buildPhysicsRuns();
  for (const run of floorRuns) {
    if (run.length < 2) {
      continue;
    }

    const tangents = buildRunTangents(run);
    const crossSegments = Math.max(2, context.halfPipePhysicsSegments);
    const ringVertexCount = crossSegments + 1;
    const vertices: number[] = [];
    const indices: number[] = [];

    for (let i = 0; i < run.length; i += 1) {
      const sample = run[i];
      appendRingVertices(
        vertices,
        new THREE.Vector3(sample.x, sample.y, sample.z),
        tangents[i],
        sample.width,
        crossSegments,
        context.getHalfPipeHeightAtOffset,
      );
    }

    for (let ringIndex = 0; ringIndex < run.length - 1; ringIndex += 1) {
      const rowStartA = ringIndex * ringVertexCount;
      const rowStartB = (ringIndex + 1) * ringVertexCount;
      for (let stripIndex = 0; stripIndex < crossSegments; stripIndex += 1) {
        const a = rowStartA + stripIndex;
        const b = rowStartA + stripIndex + 1;
        const c = rowStartB + stripIndex;
        const d = rowStartB + stripIndex + 1;
        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    if (vertices.length < 9 || indices.length < 3) {
      continue;
    }

    const floorBodyDesc = RAPIER.RigidBodyDesc.fixed();
    const floorBody = context.world.createRigidBody(floorBodyDesc);
    context.trackRigidBodies.push(floorBody);
    const floorCollider = RAPIER.ColliderDesc.trimesh(
      new Float32Array(vertices),
      new Uint32Array(indices),
    )
      .setFriction(0.4)
      .setRestitution(0);
    context.world.createCollider(floorCollider, floorBody);
  }

  if (floorRuns.length === 0) {
    console.log("[CreateTrackPhysicsBodies]", "No floor runs found");
  } else {
    console.log(
      "[CreateTrackPhysicsBodies]",
      "Created floor trimesh runs=" + String(floorRuns.length),
    );
  }

  for (const blocker of context.horizontalBlockers) {
    const blockerRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-blocker.tilt, 0, 0),
    );
    const blockerBodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(blocker.x, blocker.y, blocker.z)
      .setRotation({
        x: blockerRotation.x,
        y: blockerRotation.y,
        z: blockerRotation.z,
        w: blockerRotation.w,
      });
    const blockerBody = context.world.createRigidBody(blockerBodyDesc);
    context.trackRigidBodies.push(blockerBody);
    const blockerCollider = RAPIER.ColliderDesc.cuboid(
      blocker.length * 0.5,
      blocker.height * 0.5,
      blocker.depth * 0.5,
    )
      .setFriction(0.95)
      .setRestitution(0);
    context.world.createCollider(blockerCollider, blockerBody);
  }

  for (const rotator of context.rotatorObstacles) {
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-rotator.tilt, rotator.angle, 0),
    );
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(rotator.x, rotator.y, rotator.z)
      .setRotation({
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w,
      });
    const body = context.world.createRigidBody(bodyDesc);
    context.trackRigidBodies.push(body);
    const hubCollider = RAPIER.ColliderDesc.cuboid(0.26, 0.14, 0.26)
      .setTranslation(0, -rotator.height * 0.43, 0)
      .setFriction(0.72)
      .setRestitution(0);
    context.world.createCollider(hubCollider, body);
    for (let i = 0; i < 4; i += 1) {
      const localAngle = Math.PI * 0.25 + (i / 4) * Math.PI * 2;
      const localRot = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        localAngle,
      );
      const collider = RAPIER.ColliderDesc.cuboid(
        rotator.armLength,
        rotator.height * 0.48,
        rotator.armThickness * 0.5,
      )
        .setTranslation(0, 0, 0)
        .setRotation({
          x: localRot.x,
          y: localRot.y,
          z: localRot.z,
          w: localRot.w,
        })
        .setFriction(0.72)
        .setRestitution(0);
      context.world.createCollider(collider, body);
    }
    context.obstacleBodyById.set(rotator.id, body);
  }

  for (const bouncer of context.pinballBouncers) {
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-bouncer.tilt, 0, 0),
    );
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(bouncer.x, bouncer.y, bouncer.z)
      .setRotation({
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w,
      });
    const body = context.world.createRigidBody(bodyDesc);
    context.trackRigidBodies.push(body);
    const columnCollider = RAPIER.ColliderDesc.cuboid(
      Math.max(PINBALL_BOUNCER_COLUMN_RADIUS_TOP, PINBALL_BOUNCER_COLUMN_RADIUS_BOTTOM),
      bouncer.columnHeight * 0.5,
      Math.max(PINBALL_BOUNCER_COLUMN_RADIUS_TOP, PINBALL_BOUNCER_COLUMN_RADIUS_BOTTOM),
    )
      .setTranslation(
        0,
        bouncer.capRadius * PINBALL_BOUNCER_COLUMN_Y_OFFSET_RATIO,
        0,
      )
      .setFriction(0.6)
      .setRestitution(0);
    const capCollider = RAPIER.ColliderDesc.ball(
      bouncer.capRadius * getPinballBouncerBaseScale(),
    )
      .setTranslation(0, bouncer.columnHeight * PINBALL_BOUNCER_CAP_Y_RATIO, 0)
      .setFriction(0.55)
      .setRestitution(0);
    context.world.createCollider(columnCollider, body);
    context.world.createCollider(capCollider, body);
    context.obstacleBodyById.set(bouncer.id, body);
  }

  for (const pad of context.bouncyPads) {
    const { startYaw } = getBouncyPadSweepRange(pad.side);
    pad.sweepAngle = startYaw;
    const padRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-pad.tilt, pad.sweepAngle, 0),
    );
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pad.x, pad.y, pad.z)
      .setRotation({
        x: padRotation.x,
        y: padRotation.y,
        z: padRotation.z,
        w: padRotation.w,
      })
      .setCanSleep(false)
      .setCcdEnabled(true);
    const body = context.world.createRigidBody(bodyDesc);
    body.setAdditionalMass(20, true);
    context.trackRigidBodies.push(body);
    const baseCollider = RAPIER.ColliderDesc.cuboid(0.175, 0.2, 0.175)
      .setTranslation(0, -0.08, 0)
      .setFriction(0.64)
      .setRestitution(0);
    const sideSign = pad.side === "left" ? 1 : -1;
    const paddleRadius = Math.max(0.2, pad.paddleWidth * 0.42);
    const paddleBodyLength = Math.max(0.24, pad.paddleLength - paddleRadius * 2);
    const paddleCapsuleHalfLength = paddleBodyLength * 0.5 + paddleRadius;
    const paddleHalfLength = paddleCapsuleHalfLength * BOUNCY_PAD_VISUAL_SCALE_Y * 0.98;
    const paddleHalfHeight = paddleRadius * BOUNCY_PAD_VISUAL_SCALE_X * 0.94;
    const paddleHalfDepth =
      paddleRadius * BOUNCY_PAD_VISUAL_SCALE_Z * 1.08 * BOUNCY_PAD_COLLIDER_DEPTH_MULTIPLIER;
    const paddleCenterY =
      BOUNCY_PAD_PIVOT_Y +
      BOUNCY_PAD_PADDLE_Y_BASE -
      paddleRadius * (BOUNCY_PAD_VISUAL_SCALE_X - 1);
    const paddleReach = pad.paddleLength * BOUNCY_PAD_REACH_RATIO;
    const edgeRadius = Math.min(paddleHalfHeight, paddleHalfDepth) * 0.34;
    const paddleCollider = RAPIER.ColliderDesc.roundCuboid(
      paddleHalfLength,
      paddleHalfHeight,
      paddleHalfDepth,
      edgeRadius,
    )
      .setTranslation(sideSign * paddleReach, paddleCenterY, 0)
      .setFriction(0.68)
      .setRestitution(0);
    const guardCollider = RAPIER.ColliderDesc.cuboid(0.24, 0.2, 0.24)
      .setTranslation(0, -0.04, 0)
      .setFriction(0.66)
      .setRestitution(0);
    context.world.createCollider(baseCollider, body);
    context.world.createCollider(paddleCollider, body);
    context.world.createCollider(guardCollider, body);
    context.obstacleBodyById.set(pad.id, body);
  }
}

export function updateWaveObstacleAnimation(host: ObstacleAnimationHost): void {
  updateObstacleWireframeVisibility(host.obstacleMeshById);

  for (const rotator of host.rotatorObstacles) {
    rotator.angle += rotator.spinSpeed * rotator.spinDir * host.fixedStep;
    if (rotator.angle > Math.PI * 2) {
      rotator.angle -= Math.PI * 2;
    } else if (rotator.angle < -Math.PI * 2) {
      rotator.angle += Math.PI * 2;
    }
    const mesh = host.obstacleMeshById.get(rotator.id);
    if (mesh) {
      mesh.rotation.x = -rotator.tilt;
      mesh.rotation.y = rotator.angle;
    }
    const body = host.obstacleBodyById.get(rotator.id);
    if (body) {
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-rotator.tilt, rotator.angle, 0),
      );
      body.setNextKinematicRotation({
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w,
      });
    }
  }

  for (const pad of host.bouncyPads) {
    const cycle = 0.5 + 0.5 * Math.sin(host.runTimeSeconds * pad.sweepSpeed + pad.phase);
    const { startYaw, endYaw } = getBouncyPadSweepRange(pad.side);
    const targetSweepAngle = THREE.MathUtils.lerp(startYaw, endYaw, cycle);
    const maxStep = BOUNCY_PAD_MAX_ANGULAR_SPEED * host.fixedStep;
    const angleDelta = THREE.MathUtils.clamp(
      targetSweepAngle - pad.sweepAngle,
      -maxStep,
      maxStep,
    );
    pad.sweepAngle += angleDelta;
    const paddle = host.bouncyPadPaddleById.get(pad.id);
    if (paddle) {
      paddle.rotation.y = pad.sweepAngle;
    }
    const body = host.obstacleBodyById.get(pad.id);
    if (body) {
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-pad.tilt, pad.sweepAngle, 0),
      );
      body.setNextKinematicRotation({
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w,
      });
    }
  }

  for (const bouncer of host.pinballBouncers) {
    const cap = host.bouncerCapById.get(bouncer.id);
    if (!cap) {
      continue;
    }
    const currentPulse = host.bouncerPulseById.get(bouncer.id) ?? 0;
    const nextPulse = Math.max(0, currentPulse - host.fixedStep * 5.2);
    host.bouncerPulseById.set(bouncer.id, nextPulse);
    const bouncerBaseScale = getPinballBouncerBaseScale();
    const pulseScaleBoost =
      0.3 + (PINBALL_BOUNCER_IMPULSE_MULTIPLIER - 1) * 0.06;
    const targetScale = bouncerBaseScale + nextPulse * pulseScaleBoost;
    const lerpFactor = Math.min(1, host.fixedStep * 16);
    const nextScale = THREE.MathUtils.lerp(
      cap.scale.x,
      targetScale,
      lerpFactor,
    );
    cap.scale.setScalar(nextScale);
  }
}
