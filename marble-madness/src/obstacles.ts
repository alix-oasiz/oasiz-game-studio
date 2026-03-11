import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

const PINBALL_BOUNCER_IMPULSE_MULTIPLIER = 2.35;
const PINBALL_BOUNCER_VISUAL_SCALE_PER_MULTIPLIER = 0.26;
const PINBALL_BOUNCER_HIT_COOLDOWN_SECONDS = 0.2;
const PINBALL_BOUNCER_HIT_DISTANCE_PADDING = 0.34;
const PINBALL_BOUNCER_MIN_OUTWARD_SPEED = 1.2;
const PINBALL_BOUNCER_BLOCKED_OUTWARD_SPEED = 0.55;
const PINBALL_BOUNCER_COLUMN_RADIUS_TOP = 0.34;
const PINBALL_BOUNCER_COLUMN_RADIUS_BOTTOM = 0.48;
const PINBALL_BOUNCER_COLUMN_Y_OFFSET_RATIO = -0.1;
const PINBALL_BOUNCER_CAP_Y_RATIO = 0.24;
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
const OBSTACLE_WALL_CLEARANCE = 0.24;
const ROTATOR_SWEEP_WALL_PADDING = 0.22;
const ROTATOR_ARM_LENGTH_SCALE = 0.82;
const ROTATOR_ARM_THICKNESS_SCALE = 0.84;
const BOUNCY_PAD_LENGTH_SCALE = 0.82;
const BOUNCY_PAD_WIDTH_SCALE = 0.9;
const SWINGING_HAMMER_SWEEP_ABS_RADIANS = Math.PI / 3;
const SWINGING_HAMMER_TAP_MIN_SPEED = 3.8;
const SWINGING_HAMMER_HIT_COOLDOWN_SECONDS = 0.2;
const SWINGING_HAMMER_KNOCKBACK_BASE = 15;
const FALLING_PLATFORM_FALL_DELAY = 2.0;
const FALLING_PLATFORM_FALL_DURATION = 1.5;
const FALLING_PLATFORM_FALL_DISTANCE = 20;
const FALLING_PLATFORM_SHAKE_AMPLITUDE = 0.08;

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

function getSwingingHammerSweepRange(side: "left" | "right"): {
  startYaw: number;
  endYaw: number;
} {
  return side === "left"
    ? {
      startYaw: SWINGING_HAMMER_SWEEP_ABS_RADIANS,
      endYaw: -SWINGING_HAMMER_SWEEP_ABS_RADIANS,
    }
    : {
      startYaw: -SWINGING_HAMMER_SWEEP_ABS_RADIANS,
      endYaw: SWINGING_HAMMER_SWEEP_ABS_RADIANS,
    };
}

function getObstacleFootprintHalfSpanX(obstacle: ObstacleBase): number {
  if (obstacle.kind === "rotator_x") {
    const rotator = obstacle as RotatorXObstacle;
    return rotator.armLength + rotator.armThickness * 0.5 + ROTATOR_SWEEP_WALL_PADDING;
  }
  if (obstacle.kind === "pinball_bouncer") {
    const bouncer = obstacle as PinballBouncerObstacle;
    return bouncer.capRadius * getPinballBouncerBaseScale() + 0.12;
  }
  if (obstacle.kind === "bouncy_pad") {
    const pad = obstacle as BouncyPadObstacle;
    const paddleRadius = Math.max(0.2, pad.paddleWidth * 0.42);
    const paddleBodyLength = Math.max(0.24, pad.paddleLength - paddleRadius * 2);
    const paddleCapsuleHalfLength = paddleBodyLength * 0.5 + paddleRadius;
    const paddleHalfLength = paddleCapsuleHalfLength * BOUNCY_PAD_VISUAL_SCALE_Y * 0.98;
    const paddleReach = pad.paddleLength * BOUNCY_PAD_REACH_RATIO;
    return paddleReach + paddleHalfLength + 0.12;
  }
  if (obstacle.kind === "swinging_hammer") {
    const hammer = obstacle as SwingingHammerObstacle;
    return hammer.hammerLength + 0.2;
  }
  if (obstacle.kind === "falling_platform") {
    const platform = obstacle as FallingPlatformObstacle;
    return platform.platformWidth * 0.5;
  }
  return obstacle.radius;
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
  | "bouncy_pad"
  | "swinging_hammer"
  | "falling_platform";
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

export interface SwingingHammerObstacle extends ObstacleBase {
  kind: "swinging_hammer";
  side: "left" | "right";
  hammerLength: number;
  pivotHeight: number;
  currentAngle: number;
  sweepAmplitude: number;
  sweepSpeed: number;
  phase: number;
  knockbackImpulse: number;
  lastHitAt: number;
}

export interface FallingPlatformObstacle extends ObstacleBase {
  kind: "falling_platform";
  state: "stable" | "warning" | "falling" | "fallen";
  playerStandingStartTime: number;
  fallStartTime: number;
  platformLength: number;
  platformWidth: number;
  currentYOffset: number;
  fallDelay: number;
  fallDuration: number;
  fallDistance: number;
}

export interface ObstacleAnimationHost {
  world: RAPIER.World | null;
  fixedStep: number;
  runTimeSeconds: number;
  rotatorObstacles: RotatorXObstacle[];
  pinballBouncers: PinballBouncerObstacle[];
  bouncyPads: BouncyPadObstacle[];
  swingingHammers: SwingingHammerObstacle[];
  fallingPlatforms: FallingPlatformObstacle[];
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
  swingingHammers: SwingingHammerObstacle[];
  fallingPlatforms: FallingPlatformObstacle[];
  rotatorHitAtById: Map<string, number>;
  rotatorTouchingById: Map<string, boolean>;
  bouncyPadHitAtById: Map<string, number>;
  bouncyPadTouchingById: Map<string, boolean>;
  hammerHitAtById: Map<string, number>;
  hammerTouchingById: Map<string, boolean>;
  horizontalBlockers: TrackPhysicsHorizontalBlocker[];
  blockerHitAtByIndex: Map<number, number>;
  blockerTouchingByIndex: Map<number, boolean>;
  bouncerPulseById: Map<string, number>;
  onRotatorHit?: (impact: number) => void;
  onBouncyPadHit?: (impact: number) => void;
  onHorizontalBlockerHit?: (impact: number) => void;
  onPinballBouncerHit?: () => void;
  onSwingingHammerHit?: (impact: number) => void;
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
  swingingHammerLength: number;
  swingingHammerPivotHeight: number;
  swingingHammerSweepAmplitude: number;
  swingingHammerSweepSpeedBase: number;
  swingingHammerKnockbackImpulse: number;
  fallingPlatformLength: number;
  fallingPlatformWidth: number;
  fallingPlatformFallDelay: number;
  fallingPlatformFallDuration: number;
  fallingPlatformFallDistance: number;
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
  swingingHammers: SwingingHammerObstacle[];
  fallingPlatforms: FallingPlatformObstacle[];
}

export interface WaveObstacleMeshHost {
  rotatorObstacles: RotatorXObstacle[];
  pinballBouncers: PinballBouncerObstacle[];
  bouncyPads: BouncyPadObstacle[];
  swingingHammers: SwingingHammerObstacle[];
  fallingPlatforms: FallingPlatformObstacle[];
  obstacleMeshById: Map<string, THREE.Object3D>;
  bouncyPadPaddleById: Map<string, THREE.Object3D>;
  bouncerCapById: Map<string, THREE.Mesh>;
  bouncerPulseById: Map<string, number>;
  addLevelObject: (object: THREE.Object3D) => void;
}

function getWaveObstacleBudget(
  wave: number,
  growth: number,
  obstacleMaxPerTypeCap: number,
): number {
  let budget = 1;
  if (wave <= 4) {
    budget = wave;
  } else {
    budget = 4 + Math.ceil((wave - 4) / 2);
  }

  const growthBonus = Math.max(0, growth - 1) * Math.floor((wave - 1) / 3);
  const hardCap = Math.max(6, obstacleMaxPerTypeCap);
  return THREE.MathUtils.clamp(budget + growthBonus, 1, hardCap);
}

function getWaveClusterSize(wave: number, remainingBudget: number): number {
  if (remainingBudget <= 1) {
    return 1;
  }
  if (wave <= 2) {
    return 1;
  }
  if (wave <= 4) {
    return Math.min(remainingBudget, Math.random() < 0.7 ? 1 : 2);
  }
  if (wave <= 7) {
    return Math.min(remainingBudget, Math.random() < 0.45 ? 1 : 2);
  }
  return Math.min(remainingBudget, 2 + Math.floor(Math.random() * 2));
}

function getClusterSpacingMultiplierForWave(wave: number): number {
  if (wave <= 2) {
    return 1.45;
  }
  if (wave <= 4) {
    return 1.25;
  }
  if (wave <= 6) {
    return 1.1;
  }
  return 1;
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
  swingingHammers: SwingingHammerObstacle[];
  fallingPlatforms: FallingPlatformObstacle[];
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
    "swinging_hammer",
    // "falling_platform", // Disabled - use falling_tiles platform type instead
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
    | SwingingHammerObstacle
    | FallingPlatformObstacle
    | null = null;
  if (kind === "rotator_x") {
    const side = Math.random() < 0.5 ? "left" : "right";
    const sideSign = side === "left" ? -1 : 1;
    const scaledRotatorArmLength =
      context.rotatorArmLength * ROTATOR_ARM_LENGTH_SCALE;
    const scaledRotatorArmThickness =
      context.rotatorArmThickness * ROTATOR_ARM_THICKNESS_SCALE;
    const rotatorHalfSpanX =
      scaledRotatorArmLength +
      scaledRotatorArmThickness * 0.5 +
      ROTATOR_SWEEP_WALL_PADDING;
    const maxSideOffset = innerHalf - rotatorHalfSpanX - OBSTACLE_WALL_CLEARANCE;
    if (maxSideOffset < 0.9) {
      return null;
    }
    const x =
      centerX +
      sideSign * context.randomRange(0.9, Math.max(0.9, maxSideOffset));
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
      radius: scaledRotatorArmLength + 1.1,
      side,
      armLength: scaledRotatorArmLength,
      armThickness: scaledRotatorArmThickness,
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
        context.bouncerColumnHeight * 0.56 +
        context.bouncerCapRadius * 0.08,
      z: centerZ,
      tilt: context.getTrackTiltAtArcLength(s),
      radius: context.bouncerCapRadius + 1.05,
      columnHeight: context.bouncerColumnHeight,
      capRadius: context.bouncerCapRadius,
      bounceImpulse:
        context.bouncerImpulse * PINBALL_BOUNCER_IMPULSE_MULTIPLIER,
      lastHitAt: -999,
    };
  } else if (kind === "bouncy_pad") {
    const sideSign = Math.random() < 0.5 ? -1 : 1;
    const side: "left" | "right" = sideSign < 0 ? "left" : "right";
    const scaledPadLength = context.bouncyPadLength * BOUNCY_PAD_LENGTH_SCALE;
    const scaledPadWidth = context.bouncyPadWidth * BOUNCY_PAD_WIDTH_SCALE;
    const paddleRadius = Math.max(0.2, scaledPadWidth * 0.42);
    const paddleBodyLength = Math.max(
      0.24,
      scaledPadLength - paddleRadius * 2,
    );
    const paddleCapsuleHalfLength = paddleBodyLength * 0.5 + paddleRadius;
    const paddleHalfLength =
      paddleCapsuleHalfLength * BOUNCY_PAD_VISUAL_SCALE_Y * 0.98;
    const paddleReach = scaledPadLength * BOUNCY_PAD_REACH_RATIO;
    const bouncyPadHalfSpanX = paddleReach + paddleHalfLength + 0.12;
    const maxSideOffset =
      innerHalf - bouncyPadHalfSpanX - OBSTACLE_WALL_CLEARANCE;
    if (maxSideOffset < 0.9) {
      return null;
    }
    const x = centerX + sideSign * context.randomRange(0.9, Math.max(0.9, maxSideOffset));
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
      radius: scaledPadLength * 0.66,
      paddleLength: scaledPadLength,
      paddleWidth: scaledPadWidth,
      sweepAmplitude: context.bouncyPadSweepAmplitude,
      sweepSpeed: context.bouncyPadSweepSpeedBase + context.randomRange(-0.75, 0.75),
      phase: context.randomRange(0, Math.PI * 2),
      sweepAngle: 0,
      launchImpulse: context.bouncyPadLaunchImpulse,
      lastHitAt: -999,
    };
  } else if (kind === "swinging_hammer") {
    const side = Math.random() < 0.5 ? "left" : "right";
    const sideSign = side === "left" ? -1 : 1;
    const hammerHalfSpanX = context.swingingHammerLength + 0.2;
    const maxSideOffset = innerHalf - hammerHalfSpanX - OBSTACLE_WALL_CLEARANCE;
    if (maxSideOffset < 0.9) {
      return null;
    }
    const x =
      centerX +
      sideSign * context.randomRange(0.9, Math.max(0.9, maxSideOffset));
    obstacle = {
      id: context.nextObstacleId(kind),
      kind,
      s,
      x,
      y:
        context.getTrackSurfaceYAtPosition(x, centerZ) +
        context.swingingHammerPivotHeight,
      z: centerZ,
      tilt: context.getTrackTiltAtArcLength(s),
      radius: context.swingingHammerLength + 0.8,
      side,
      hammerLength: context.swingingHammerLength,
      pivotHeight: context.swingingHammerPivotHeight,
      currentAngle: 0,
      sweepAmplitude: context.swingingHammerSweepAmplitude,
      sweepSpeed: context.swingingHammerSweepSpeedBase + context.randomRange(-0.5, 0.5),
      phase: context.randomRange(0, Math.PI * 2),
      knockbackImpulse: context.swingingHammerKnockbackImpulse,
      lastHitAt: -999,
    };
  } else if (kind === "falling_platform") {
    const platformHalfWidth = context.fallingPlatformWidth * 0.5;
    const platformHalfLength = context.fallingPlatformLength * 0.5;
    const maxSideOffset = innerHalf - platformHalfWidth - OBSTACLE_WALL_CLEARANCE;
    if (maxSideOffset < 0.5) {
      return null;
    }
    const sideSign = Math.random() < 0.5 ? -1 : 1;
    const x =
      centerX +
      sideSign * context.randomRange(0.5, Math.max(0.5, maxSideOffset));
    obstacle = {
      id: context.nextObstacleId(kind),
      kind,
      s,
      x,
      y: context.getTrackSurfaceYAtPosition(x, centerZ) + 0.05,
      z: centerZ,
      tilt: context.getTrackTiltAtArcLength(s),
      radius: Math.max(platformHalfWidth, platformHalfLength) + 0.5,
      state: "stable",
      playerStandingStartTime: -999,
      fallStartTime: -999,
      platformLength: context.fallingPlatformLength,
      platformWidth: context.fallingPlatformWidth,
      currentYOffset: 0,
      fallDelay: context.fallingPlatformFallDelay,
      fallDuration: context.fallingPlatformFallDuration,
      fallDistance: context.fallingPlatformFallDistance,
    };
  }

  if (!obstacle) {
    return null;
  }
  if (Math.abs(obstacle.x - centerX) < 0.75) {
    return null;
  }

  const footprintHalfSpanX = getObstacleFootprintHalfSpanX(obstacle);
  if (
    Math.abs(obstacle.x - centerX) + footprintHalfSpanX >
    innerHalf - OBSTACLE_WALL_CLEARANCE
  ) {
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
  const swingingHammers: SwingingHammerObstacle[] = [];
  const fallingPlatforms: FallingPlatformObstacle[] = [];

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
    return { rotatorObstacles, pinballBouncers, bouncyPads, swingingHammers, fallingPlatforms };
  }

  const targetBudget = getWaveObstacleBudget(
    wave,
    context.obstacleWaveLinearGrowth,
    context.obstacleMaxPerTypeCap,
  );
  const clusterSpacing =
    context.obstacleClusterSpacing * getClusterSpacingMultiplierForWave(wave);

  const plannedKinds: WaveObstacleKind[] = [];
  for (let i = 0; i < targetBudget; i += 1) {
    plannedKinds.push(activeKinds[i % activeKinds.length]);
  }
  for (let i = plannedKinds.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = plannedKinds[i];
    plannedKinds[i] = plannedKinds[j];
    plannedKinds[j] = tmp;
  }

  const placed: ObstacleBase[] = [];
  let attempts = 0;
  let planCursor = 0;
  const maxAttempts = Math.max(targetBudget * 80, 120);

  while (placed.length < targetBudget && attempts < maxAttempts) {
    attempts += 1;
    const kind = plannedKinds[planCursor % plannedKinds.length];
    planCursor += 1;

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
    const remainingBudget = targetBudget - placed.length;
    const clusterSize = getWaveClusterSize(wave, remainingBudget);

    for (let i = 0; i < clusterSize; i += 1) {
      if (placed.length >= targetBudget) {
        break;
      }
      const s = anchorS + i * clusterSpacing;
      const obstacle = tryCreateWaveObstacle(context, kind, s, placed);
      if (!obstacle) {
        continue;
      }
      placed.push(obstacle);
      if (kind === "rotator_x") {
        rotatorObstacles.push(obstacle as RotatorXObstacle);
      } else if (kind === "pinball_bouncer") {
        pinballBouncers.push(obstacle as PinballBouncerObstacle);
      } else if (kind === "bouncy_pad") {
        bouncyPads.push(obstacle as BouncyPadObstacle);
      } else if (kind === "swinging_hammer") {
        swingingHammers.push(obstacle as SwingingHammerObstacle);
      } else if (kind === "falling_platform") {
        fallingPlatforms.push(obstacle as FallingPlatformObstacle);
      }
    }
  }

  console.log(
    "[BuildWaveObstacles]",
    "wave=" +
      String(wave) +
      " target=" +
      String(targetBudget) +
      " placed=" +
      String(placed.length) +
      " rotators=" +
      String(rotatorObstacles.length) +
      " bouncers=" +
      String(pinballBouncers.length) +
      " pads=" +
      String(bouncyPads.length) +
      " hammers=" +
      String(swingingHammers.length) +
      " platforms=" +
      String(fallingPlatforms.length),
  );

  return { rotatorObstacles, pinballBouncers, bouncyPads, swingingHammers, fallingPlatforms };
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

  const hammerMaterial = new THREE.MeshStandardMaterial({
    color: "#d87536",
    roughness: 0.5,
    metalness: 0.6,
    emissive: "#4a2010",
    emissiveIntensity: 0.15,
  });

  for (const hammer of host.swingingHammers) {
    const group = new THREE.Group();

    // Create a pivot group that will rotate for the swing
    const swingPivot = new THREE.Group();

    // Pivot mount - horizontal cylinder along Z-axis
    const pivotMount = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.35, 12),
      hammerMaterial,
    );
    pivotMount.rotation.x = Math.PI / 2; // Rotate to align with Z-axis
    pivotMount.position.set(0, 0, 0);

    // Hammer arm - extends downward from pivot
    const armLength = hammer.hammerLength * 0.7;
    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, armLength, 0.15),
      hammerMaterial,
    );
    arm.position.set(0, -armLength * 0.5, 0);

    // Hammer head - at the bottom of the arm (wider for better hits)
    const headSize = hammer.hammerLength * 0.3;
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, headSize, 1.2),
      hammerMaterial,
    );
    head.position.set(0, -(armLength + headSize * 0.5), 0);

    // Pivot cylinder wireframe (along Z-axis)
    const pivotWireframe = createObstaclePhysicsWireframeMesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.35, 12),
    );
    pivotWireframe.rotation.x = Math.PI / 2;
    pivotWireframe.position.set(0, 0, 0);
    group.add(pivotWireframe);

    // Hammer collider wireframe - vertical
    const hammerWireframe = createObstaclePhysicsWireframeMesh(
      new THREE.BoxGeometry(0.2, hammer.hammerLength, 0.2),
    );
    hammerWireframe.position.set(0, -hammer.hammerLength * 0.5, 0);
    swingPivot.add(hammerWireframe);

    swingPivot.add(pivotMount);
    swingPivot.add(arm);
    swingPivot.add(head);

    group.add(swingPivot);
    group.rotation.x = -hammer.tilt;
    group.position.set(hammer.x, hammer.y, hammer.z);
    group.traverse((node) => {
      if (node instanceof THREE.Mesh && !node.userData.obstaclePhysicsWireframe) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    host.addLevelObject(group);
    host.obstacleMeshById.set(hammer.id, group);
    // Store the swing pivot for animation
    group.userData.swingPivot = swingPivot;
  }

  const platformMaterial = new THREE.MeshStandardMaterial({
    color: "#5a4a3a",
    roughness: 0.8,
    metalness: 0.1,
    emissive: "#2a1a0a",
    emissiveIntensity: 0.1,
  });

  for (const platform of host.fallingPlatforms) {
    const group = new THREE.Group();

    // Platform surface
    const surface = new THREE.Mesh(
      new THREE.BoxGeometry(
        platform.platformLength,
        0.15,
        platform.platformWidth,
      ),
      platformMaterial,
    );
    surface.position.set(0, 0, 0);

    // Crack lines (darker material)
    const crackMaterial = new THREE.MeshStandardMaterial({
      color: "#3a2a1a",
      roughness: 0.9,
      metalness: 0.05,
      emissive: "#1a0a00",
      emissiveIntensity: 0.15,
    });

    const crack1 = new THREE.Mesh(
      new THREE.BoxGeometry(platform.platformLength * 0.95, 0.16, 0.05),
      crackMaterial,
    );
    crack1.position.set(0, 0.01, -platform.platformWidth * 0.15);

    const crack2 = new THREE.Mesh(
      new THREE.BoxGeometry(platform.platformLength * 0.95, 0.16, 0.05),
      crackMaterial,
    );
    crack2.position.set(0, 0.01, platform.platformWidth * 0.15);

    // Physics wireframe
    const platformWireframe = createObstaclePhysicsWireframeMesh(
      new THREE.BoxGeometry(
        platform.platformLength,
        0.15,
        platform.platformWidth,
      ),
    );
    platformWireframe.position.set(0, 0, 0);
    group.add(platformWireframe);

    group.add(surface);
    group.add(crack1);
    group.add(crack2);
    group.rotation.x = -platform.tilt;
    group.position.set(platform.x, platform.y, platform.z);
    group.traverse((node) => {
      if (node instanceof THREE.Mesh && !node.userData.obstaclePhysicsWireframe) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
    host.addLevelObject(group);
    host.obstacleMeshById.set(platform.id, group);
  }

  console.log(
    "[AddWaveObstacleMeshes]",
    "Added obstacle meshes total=" +
      String(
        host.rotatorObstacles.length +
          host.pinballBouncers.length +
          host.bouncyPads.length +
          host.swingingHammers.length +
          host.fallingPlatforms.length,
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
    const incomingSpeed = Math.max(0, -outwardSpeed);
    const blockedFactor = clamp01(
      (PINBALL_BOUNCER_BLOCKED_OUTWARD_SPEED - outwardSpeed) /
        (PINBALL_BOUNCER_BLOCKED_OUTWARD_SPEED + PINBALL_BOUNCER_MIN_OUTWARD_SPEED),
    );
    const tangentX = currentVelocity.x - outwardX * outwardSpeed;
    const tangentZ = currentVelocity.z - outwardZ * outwardSpeed;
    const targetOutwardSpeed = Math.max(
      PINBALL_BOUNCER_MIN_OUTWARD_SPEED,
      incomingSpeed * THREE.MathUtils.lerp(0.96, 1.04, blockedFactor),
    );
    host.marbleBody.setLinvel(
      {
        x: tangentX + outwardX * targetOutwardSpeed,
        y: Math.max(currentVelocity.y, 0.8 + incomingSpeed * 0.08),
        z: tangentZ + outwardZ * targetOutwardSpeed,
      },
      true,
    );
    bouncer.lastHitAt = host.runTimeSeconds;
    host.bouncerPulseById.set(bouncer.id, 1.35);
    host.onPinballBouncerHit?.();
  }

  if (marbleSpeed >= SWINGING_HAMMER_TAP_MIN_SPEED) {
    for (const hammer of host.swingingHammers) {
      const wasTouching = host.hammerTouchingById.get(hammer.id) === true;
      const lastHammerHit = host.hammerHitAtById.get(hammer.id) ?? -999;

      // Hammer hangs downward, center offset by half length in -Y direction
      tempCenter.set(hammer.x, hammer.y, hammer.z);
      tempRotation.setFromEuler(tempEuler.set(-hammer.tilt, 0, hammer.currentAngle));

      // Offset the center downward by the rotated hammer position
      const offset = new THREE.Vector3(0, -hammer.hammerLength * 0.5, 0)
        .applyQuaternion(tempRotation);
      tempCenter.add(offset);

      const hitHammer = isPointInsideExpandedOrientedBox(
        tempPoint,
        tempCenter,
        tempRotation,
        0.225,
        hammer.hammerLength * 0.5,
        0.6,
        host.marbleRadius + OBSTACLE_THUD_PADDING,
      );

      if (!hitHammer) {
        if (wasTouching) {
          host.hammerTouchingById.delete(hammer.id);
        }
        continue;
      }

      host.hammerTouchingById.set(hammer.id, true);
      if (wasTouching) {
        continue;
      }
      if (host.runTimeSeconds - lastHammerHit < SWINGING_HAMMER_HIT_COOLDOWN_SECONDS) {
        continue;
      }

      host.hammerHitAtById.set(hammer.id, host.runTimeSeconds);

      // Calculate knockback direction based on hammer swing
      // The hammer face points in X direction when at rest, rotates around Z
      const hammerFaceNormal = new THREE.Vector3(1, 0, 0)
        .applyQuaternion(tempRotation)
        .normalize();

      // Convert any downward force into horizontal force
      // Project onto horizontal plane and add strong upward impulse
      const knockbackMagnitude = hammer.knockbackImpulse;
      const horizontalX = hammerFaceNormal.x;
      const horizontalZ = hammerFaceNormal.z;

      // If hammer has downward component, add that energy to horizontal
      const downwardComponent = Math.min(0, hammerFaceNormal.y);
      const extraHorizontalScale = 1 + Math.abs(downwardComponent);

      host.marbleBody.applyImpulse(
        {
          x: horizontalX * knockbackMagnitude * extraHorizontalScale,
          y: 4.0,
          z: horizontalZ * knockbackMagnitude * extraHorizontalScale,
        },
        true,
      );

      host.onSwingingHammerHit?.(Math.max(3.0, marbleSpeed * 0.95));
    }
  }

  // Falling platform detection (check even at low speeds for grounded detection)
  for (const platform of host.fallingPlatforms) {
    if (platform.state === "falling" || platform.state === "fallen") {
      continue;
    }

    // AABB check
    const halfLength = platform.platformLength * 0.5;
    const halfWidth = platform.platformWidth * 0.5;
    const dx = Math.abs(marblePosition.x - platform.x);
    const dz = Math.abs(marblePosition.z - platform.z);

    const isOnPlatformXZ = dx <= halfLength + host.marbleRadius && dz <= halfWidth + host.marbleRadius;

    // Y-proximity check (marble must be close to platform surface)
    const platformTop = platform.y + 0.075 + platform.currentYOffset;
    const dy = marblePosition.y - platformTop;
    const isOnPlatformY = dy > -host.marbleRadius * 0.5 && dy < host.marbleRadius * 1.5;

    // Grounded check - marble must not be airborne
    const isGrounded = Math.abs(marbleVelocity.y) < 1.5;

    const isStandingOnPlatform = isOnPlatformXZ && isOnPlatformY && isGrounded;

    if (isStandingOnPlatform) {
      if (platform.state === "stable") {
        platform.state = "warning";
        platform.playerStandingStartTime = host.runTimeSeconds;
      }
    } else {
      if (platform.state === "warning") {
        platform.state = "stable";
        platform.playerStandingStartTime = -999;
      }
    }
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

  for (const hammer of context.swingingHammers) {
    const { startYaw } = getSwingingHammerSweepRange(hammer.side);
    hammer.currentAngle = startYaw;
    const hammerRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-hammer.tilt, 0, hammer.currentAngle),
    );
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(hammer.x, hammer.y, hammer.z)
      .setRotation({
        x: hammerRotation.x,
        y: hammerRotation.y,
        z: hammerRotation.z,
        w: hammerRotation.w,
      })
      .setCanSleep(false)
      .setCcdEnabled(true);
    const body = context.world.createRigidBody(bodyDesc);
    context.trackRigidBodies.push(body);

    // Pivot cylinder collider - horizontal along Z-axis
    const pivotRotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2,
    );
    const pivotCollider = RAPIER.ColliderDesc.cylinder(0.175, 0.22)
      .setTranslation(0, 0, 0)
      .setRotation({
        x: pivotRotation.x,
        y: pivotRotation.y,
        z: pivotRotation.z,
        w: pivotRotation.w,
      })
      .setFriction(0.7)
      .setRestitution(0);
    context.world.createCollider(pivotCollider, body);

    // Hammer arm collider - vertical extending downward
    const hammerCollider = RAPIER.ColliderDesc.cuboid(
      0.1,
      hammer.hammerLength * 0.5,
      0.1,
    )
      .setTranslation(0, -hammer.hammerLength * 0.5, 0)
      .setFriction(0.7)
      .setRestitution(0);
    context.world.createCollider(hammerCollider, body);

    context.obstacleBodyById.set(hammer.id, body);
  }

  for (const platform of context.fallingPlatforms) {
    const platformRotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(-platform.tilt, 0, 0),
    );
    const bodyDesc = RAPIER.RigidBodyDesc.fixed()
      .setTranslation(platform.x, platform.y, platform.z)
      .setRotation({
        x: platformRotation.x,
        y: platformRotation.y,
        z: platformRotation.z,
        w: platformRotation.w,
      });
    const body = context.world.createRigidBody(bodyDesc);
    context.trackRigidBodies.push(body);

    const platformCollider = RAPIER.ColliderDesc.cuboid(
      platform.platformLength * 0.5,
      0.075,
      platform.platformWidth * 0.5,
    )
      .setFriction(0.4)
      .setRestitution(0);
    context.world.createCollider(platformCollider, body);

    context.obstacleBodyById.set(platform.id, body);
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

  for (const hammer of host.swingingHammers) {
    const cycle = 0.5 + 0.5 * Math.sin(host.runTimeSeconds * hammer.sweepSpeed + hammer.phase);
    const { startYaw, endYaw } = getSwingingHammerSweepRange(hammer.side);
    const targetAngle = THREE.MathUtils.lerp(startYaw, endYaw, cycle);
    const maxStep = BOUNCY_PAD_MAX_ANGULAR_SPEED * host.fixedStep;
    const angleDelta = THREE.MathUtils.clamp(
      targetAngle - hammer.currentAngle,
      -maxStep,
      maxStep,
    );
    hammer.currentAngle += angleDelta;

    const mesh = host.obstacleMeshById.get(hammer.id);
    if (mesh) {
      mesh.rotation.x = -hammer.tilt;
      // Rotate the swing pivot around Z-axis for pendulum motion
      const swingPivot = mesh.userData.swingPivot;
      if (swingPivot) {
        swingPivot.rotation.z = hammer.currentAngle;
      }
    }

    const body = host.obstacleBodyById.get(hammer.id);
    if (body) {
      // Rotate around Z-axis for pendulum swing
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-hammer.tilt, 0, hammer.currentAngle),
      );
      body.setNextKinematicRotation({
        x: rotation.x,
        y: rotation.y,
        z: rotation.z,
        w: rotation.w,
      });
    }
  }

  for (const platform of host.fallingPlatforms) {
    const mesh = host.obstacleMeshById.get(platform.id);
    const body = host.obstacleBodyById.get(platform.id);

    if (platform.state === "warning") {
      const elapsed = host.runTimeSeconds - platform.playerStandingStartTime;
      const warningProgress = elapsed / platform.fallDelay;

      if (warningProgress >= 1) {
        platform.state = "falling";
        platform.fallStartTime = host.runTimeSeconds;
        // Reset mesh position before starting fall animation
        if (mesh) {
          mesh.position.y = platform.y;
        }
      } else {
        // Shake effect
        const shakeOffset = Math.sin(host.runTimeSeconds * 28) * FALLING_PLATFORM_SHAKE_AMPLITUDE;
        if (mesh) {
          mesh.position.y = platform.y + shakeOffset;
        }

        // Flicker emissive
        const emissiveIntensity = 0.1 + warningProgress * 0.3;
        mesh?.traverse((node) => {
          if (node instanceof THREE.Mesh && !node.userData.obstaclePhysicsWireframe) {
            const material = node.material as THREE.MeshStandardMaterial;
            material.emissiveIntensity = emissiveIntensity;
          }
        });
      }
    } else if (platform.state === "falling") {
      const elapsed = host.runTimeSeconds - platform.fallStartTime;
      const fallT = Math.min(1, elapsed / platform.fallDuration);
      const easeT = fallT * fallT * (3 - 2 * fallT); // smoothstep
      platform.currentYOffset = -easeT * platform.fallDistance;

      if (mesh) {
        mesh.position.y = platform.y + platform.currentYOffset;
      }

      if (fallT >= 1) {
        platform.state = "fallen";
        // Remove physics body
        if (body && host.world && host.obstacleBodyById.has(platform.id)) {
          try {
            host.world.removeRigidBody(body);
          } catch (e) {
            console.error("[FallingPlatform] Error removing body:", e);
          }
          host.obstacleBodyById.delete(platform.id);
        }
        // Hide mesh
        if (mesh) {
          mesh.visible = false;
        }
      }
    } else if (platform.state === "fallen") {
      // Already fallen, nothing to animate
      if (mesh) {
        mesh.visible = false;
      }
    }
  }
}
