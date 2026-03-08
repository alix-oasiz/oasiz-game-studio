import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

type GameState = "start" | "playing" | "gameOver";

interface TrackSampleLike {
  x: number;
  y: number;
  z: number;
}

export interface PhysicsDebugSnapshot {
  inputAxis: number;
  targetSteeringAngle: number;
  steeringAngle: number;
  steeringLerp: number;
  controlScale: number;
  airborne: boolean;
  steerImpulse: number;
  driveImpulse: number;
  horizontalSpeed: number;
  horizontalSpeedCap: number;
  verticalVelocity: number;
  verticalDelta: number;
}

export interface MarbleVisualHost {
  gameState: GameState;
  marbleBody: RAPIER.RigidBody | null;
  marbleMesh: THREE.Mesh;
  steeringAngle: number;
  getTrackForwardDirectionAtPosition(x: number, z: number): THREE.Vector3;
}

export interface MarbleVisualConfig {
  steeringArrowGap: number;
  steeringArrowLength: number;
  steeringArrowHeadLength: number;
  steeringArrowShaftWidth: number;
  steeringArrowHeadWidth: number;
  trailSpawnInterval: number;
  trailMaxPoints: number;
}

export interface PhysicsHost {
  world: RAPIER.World | null;
  marbleBody: RAPIER.RigidBody | null;
  marbleMesh: THREE.Mesh;
  gameState: GameState;
  runTimeSeconds: number;
  maxRunSeconds: number;
  finishZ: number;
  endlessMode: boolean;
  currentLoseY: number;
  inputLeft: boolean;
  inputRight: boolean;
  steeringAngle: number;
  maxSteeringAngle: number;
  steeringTurnRate: number;
  steeringReturnRate: number;
  steeringImpulseScale: number;
  arrowDriveImpulseScale: number;
  nudgeImpulse: number;
  speedMultiplier: number;
  airControlMultiplier: number;
  startMomentumRatio: number;
  maxHorizontalSpeed: number;
  speedRampSeconds: number;
  marbleRadius: number;
  groundedProbePadding: number;
  getTrackForwardDirectionAtPosition(x: number, z: number): THREE.Vector3;
  getTrackSurfaceYAtPosition(x: number, z: number): number;
  isInsideFinishFrame(position: RAPIER.Vector): boolean;
  setPhysicsDebug(snapshot: PhysicsDebugSnapshot): void;
  advanceToNextRandomLevel(): void;
  endRun(completed: boolean): void;
}

function isAirborne(host: PhysicsHost, position: RAPIER.Vector): boolean {
  const surfaceY = host.getTrackSurfaceYAtPosition(position.x, position.z);
  return position.y > surfaceY + host.marbleRadius + host.groundedProbePadding;
}

export function createPhysicsWorld(
  fixedStep: number,
  gravityY: number = -9.81,
): RAPIER.World {
  const world = new RAPIER.World({ x: 0, y: gravityY, z: 0 });
  world.integrationParameters.dt = fixedStep;
  return world;
}

const ULTRA_FAST_TONE_DOWN_SCALE = 0.28;
const LOW_SPEED_ACCEL_BOOST_MAX = 2.0;
const STEER_TO_DRIVE_RATIO_BASE = 1.5;
const BASE_STEERING_IMPULSE_SCALE = 0.26;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function createSteeringArrowGeometry(
  shaftLength: number,
  headLength: number,
  shaftWidth: number,
  headWidth: number,
): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-shaftWidth * 0.5, 0);
  shape.lineTo(-shaftWidth * 0.5, shaftLength);
  shape.lineTo(-headWidth * 0.5, shaftLength);
  shape.lineTo(0, shaftLength + headLength);
  shape.lineTo(headWidth * 0.5, shaftLength);
  shape.lineTo(shaftWidth * 0.5, shaftLength);
  shape.lineTo(shaftWidth * 0.5, 0);
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: shaftWidth,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI * 0.5);
  geometry.translate(0, -shaftWidth * 0.5, 0);
  geometry.computeVertexNormals();
  return geometry;
}

export class MarbleVisualController {
  private readonly steeringArrow: THREE.Mesh;
  private trailRibbonMesh: THREE.Mesh | null = null;
  private trailRibbonGeometry: THREE.BufferGeometry | null = null;
  private trailPoints: THREE.Vector3[] = [];
  private trailSpawnSeconds = 0;
  private readonly emptyTrailPositions = [0, 0, 0, 0, 0, 0];

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly config: MarbleVisualConfig,
  ) {
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: "#59d86f" });
    const shaftLength = Math.max(
      0.2,
      (this.config.steeringArrowLength - this.config.steeringArrowHeadLength) *
        0.5,
    );
    this.steeringArrow = new THREE.Mesh(
      createSteeringArrowGeometry(
        shaftLength,
        this.config.steeringArrowHeadLength,
        this.config.steeringArrowShaftWidth,
        this.config.steeringArrowHeadWidth,
      ),
      arrowMaterial,
    );
    this.steeringArrow.castShadow = false;
    this.steeringArrow.receiveShadow = false;
    this.steeringArrow.visible = false;
    this.scene.add(this.steeringArrow);
    this.ensureTrailRibbon();
  }

  public resetTrail(): void {
    this.trailPoints = [];
    this.trailSpawnSeconds = 0;
    if (this.trailRibbonMesh) {
      this.trailRibbonMesh.visible = false;
    }
    if (this.trailRibbonGeometry) {
      this.trailRibbonGeometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(this.emptyTrailPositions, 3),
      );
      this.trailRibbonGeometry.setIndex([0, 1, 2, 1, 3, 2]);
      this.trailRibbonGeometry.computeVertexNormals();
    }
  }

  public update(host: MarbleVisualHost, delta: number): void {
    this.updateSteeringArrowVisual(host);
    this.updateTrail(host, delta);
  }

  private ensureTrailRibbon(): void {
    if (this.trailRibbonMesh && this.trailRibbonGeometry) {
      return;
    }
    this.trailRibbonGeometry = new THREE.BufferGeometry();
    this.trailRibbonGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.emptyTrailPositions, 3),
    );
    this.trailRibbonGeometry.setIndex([0, 1, 2, 1, 3, 2]);
    const trailRibbonMaterial = new THREE.MeshBasicMaterial({
      color: "#7af0f8",
      transparent: true,
      opacity: 0.34,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.trailRibbonMesh = new THREE.Mesh(
      this.trailRibbonGeometry,
      trailRibbonMaterial,
    );
    this.trailRibbonMesh.frustumCulled = false;
    this.trailRibbonMesh.visible = false;
    this.scene.add(this.trailRibbonMesh);
  }

  private appendTrailPoint(position: THREE.Vector3): void {
    const point = position.clone().add(new THREE.Vector3(0, 0.18, 0));
    this.trailPoints.push(point);
    if (this.trailPoints.length > this.config.trailMaxPoints) {
      this.trailPoints.shift();
    }
    this.refreshRibbonTrail();
  }

  private refreshRibbonTrail(): void {
    this.ensureTrailRibbon();
    if (!this.trailRibbonGeometry || !this.trailRibbonMesh) {
      return;
    }
    const points = this.trailPoints;
    if (points.length < 2) {
      this.trailRibbonMesh.visible = false;
      return;
    }

    const widthBase = 0.74;
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      const current = points[i];
      const next = points[Math.min(points.length - 1, i + 1)];
      const prev = points[Math.max(0, i - 1)];
      const tangent = next.clone().sub(prev);
      if (tangent.lengthSq() < 0.00001) {
        tangent.set(0, 0, -1);
      } else {
        tangent.normalize();
      }
      const right = new THREE.Vector3()
        .crossVectors(tangent, new THREE.Vector3(0, 1, 0))
        .normalize();
      const age = i / Math.max(1, points.length - 1);
      const width = THREE.MathUtils.lerp(widthBase, 0.08, age);
      const leftPoint = current.clone().add(right.clone().multiplyScalar(width * 0.5));
      const rightPoint = current.clone().add(right.multiplyScalar(-width * 0.5));
      positions.push(leftPoint.x, leftPoint.y, leftPoint.z);
      positions.push(rightPoint.x, rightPoint.y, rightPoint.z);
      if (i > 0) {
        const a = (i - 1) * 2;
        const b = a + 1;
        const c = i * 2;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }

    this.trailRibbonGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    this.trailRibbonGeometry.setIndex(indices);
    this.trailRibbonGeometry.computeVertexNormals();
    this.trailRibbonGeometry.computeBoundingSphere();
    this.trailRibbonMesh.visible = true;
  }

  private updateTrail(host: MarbleVisualHost, delta: number): void {
    if (host.gameState === "playing") {
      this.trailSpawnSeconds += delta;
      if (this.trailSpawnSeconds >= this.config.trailSpawnInterval) {
        this.trailSpawnSeconds = 0;
        this.appendTrailPoint(host.marbleMesh.position.clone());
      }
    }
  }

  private updateSteeringArrowVisual(host: MarbleVisualHost): void {
    if (!host.marbleBody || host.gameState !== "playing") {
      this.steeringArrow.visible = false;
      return;
    }

    const marblePosition = host.marbleBody.translation();
    const forwardDirection = host.getTrackForwardDirectionAtPosition(
      marblePosition.x,
      marblePosition.z,
    );
    const arrowDirection = forwardDirection
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), host.steeringAngle)
      .normalize();
    const arrowOrigin = host.marbleMesh.position
      .clone()
      .add(new THREE.Vector3(0, 0.65, 0))
      .add(arrowDirection.clone().multiplyScalar(this.config.steeringArrowGap));

    this.steeringArrow.visible = true;
    this.steeringArrow.position.copy(arrowOrigin);
    this.steeringArrow.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, -1),
      arrowDirection,
    );
  }
}

export function createMarbleBody(
  world: RAPIER.World,
  startSample: TrackSampleLike,
  marbleRadius: number,
): RAPIER.RigidBody {
  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(startSample.x, startSample.y + marbleRadius + 0.8, startSample.z)
    .setLinearDamping(0.07)
    .setAngularDamping(0.05)
    .setCanSleep(false)
    .setCcdEnabled(true);

  const body = world.createRigidBody(bodyDesc);
  const collider = RAPIER.ColliderDesc.ball(marbleRadius)
    .setFriction(0.85)
    .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
    .setRestitution(0)
    .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min)
    .setDensity(3.4);
  world.createCollider(collider, body);
  return body;
}

export function resetMarbleBody(
  body: RAPIER.RigidBody,
  startPosition: TrackSampleLike,
  marbleRadius: number,
  getTrackSurfaceYAtArcLength: (s: number) => number,
  spawnS: number,
): void {
  const startX = startPosition.x;
  const startZ = startPosition.z;
  const startY = getTrackSurfaceYAtArcLength(spawnS) + marbleRadius + 0.8;
  body.setTranslation({ x: startX, y: startY, z: startZ }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  body.wakeUp();
}

export function stepPhysicsTick(host: PhysicsHost, stepSeconds: number): void {
  if (!host.world || !host.marbleBody) {
    return;
  }
  if (host.gameState !== "playing") {
    return;
  }

  host.runTimeSeconds += stepSeconds;

  const positionBeforeStep = host.marbleBody.translation();
  const velocityBeforeStep = host.marbleBody.linvel();
  const inputAxis = Number(host.inputRight) - Number(host.inputLeft);
  const targetSteeringAngle = -inputAxis * host.maxSteeringAngle;
  const steeringLerp = Math.min(
    1,
    stepSeconds *
      (inputAxis === 0 ? host.steeringReturnRate : host.steeringTurnRate),
  );
  host.steeringAngle = THREE.MathUtils.lerp(
    host.steeringAngle,
    targetSteeringAngle,
    steeringLerp,
  );

  const forward = host.getTrackForwardDirectionAtPosition(
    positionBeforeStep.x,
    positionBeforeStep.z,
  );
  const horizontalSpeedBefore = Math.sqrt(
    velocityBeforeStep.x * velocityBeforeStep.x +
      velocityBeforeStep.z * velocityBeforeStep.z,
  );
  const startCap = host.maxHorizontalSpeed * host.startMomentumRatio;
  const rampT = clamp01(host.runTimeSeconds / Math.max(0.001, host.speedRampSeconds));
  const horizontalSpeedCap =
    startCap + (host.maxHorizontalSpeed - startCap) * rampT;
  const speedRatio = horizontalSpeedBefore / Math.max(0.001, horizontalSpeedCap);
  const accelRecoveryBoost =
    1 + (LOW_SPEED_ACCEL_BOOST_MAX - 1) * (1 - clamp01(speedRatio));
  const steerDirection = forward
    .clone()
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), host.steeringAngle)
    .normalize();
  const rightDirection = new THREE.Vector3()
    .crossVectors(forward, new THREE.Vector3(0, 1, 0))
    .normalize();
  const airborne = isAirborne(host, positionBeforeStep);
  const controlScale = airborne ? host.airControlMultiplier : 1;
  const driveImpulse =
    host.nudgeImpulse *
    host.speedMultiplier *
    host.arrowDriveImpulseScale *
    controlScale *
    ULTRA_FAST_TONE_DOWN_SCALE *
    accelRecoveryBoost;
  const steerRatioScale =
    host.steeringImpulseScale / Math.max(0.001, BASE_STEERING_IMPULSE_SCALE);
  const steerImpulse = driveImpulse * STEER_TO_DRIVE_RATIO_BASE * steerRatioScale;
  if (inputAxis !== 0) {
    host.marbleBody.applyImpulse(
      {
        x: rightDirection.x * inputAxis * steerImpulse,
        y: 0,
        z: rightDirection.z * inputAxis * steerImpulse,
      },
      true,
    );
  }
  host.marbleBody.applyImpulse(
    {
      x: forward.x * driveImpulse,
      y: 0,
      z: forward.z * driveImpulse,
    },
    true,
  );

  host.world.step();

  const position = host.marbleBody.translation();
  let velocity = host.marbleBody.linvel();
  let horizontalSpeed = Math.sqrt(
    velocity.x * velocity.x + velocity.z * velocity.z,
  );
  if (horizontalSpeed > horizontalSpeedCap) {
    const scale = horizontalSpeedCap / Math.max(0.001, horizontalSpeed);
    host.marbleBody.setLinvel(
      { x: velocity.x * scale, y: velocity.y, z: velocity.z * scale },
      true,
    );
    velocity = host.marbleBody.linvel();
    horizontalSpeed = Math.sqrt(
      velocity.x * velocity.x + velocity.z * velocity.z,
    );
  }
  host.setPhysicsDebug({
    inputAxis,
    targetSteeringAngle,
    steeringAngle: host.steeringAngle,
    steeringLerp,
    controlScale,
    airborne,
    steerImpulse,
    driveImpulse,
    horizontalSpeed,
    horizontalSpeedCap,
    verticalVelocity: velocity.y,
    verticalDelta: velocity.y - velocityBeforeStep.y,
  });
  const rotation = host.marbleBody.rotation();
  host.marbleMesh.position.set(position.x, position.y, position.z);
  host.marbleMesh.quaternion.set(
    rotation.x,
    rotation.y,
    rotation.z,
    rotation.w,
  );

  if (position.z <= host.finishZ) {
    if (!host.isInsideFinishFrame(position)) {
      host.endRun(false);
      return;
    }
    if (host.endlessMode) {
      host.advanceToNextRandomLevel();
      return;
    }
    host.endRun(true);
    return;
  }

  if (
    position.y < host.currentLoseY ||
    (!host.endlessMode && host.runTimeSeconds >= host.maxRunSeconds)
  ) {
    host.endRun(false);
  }
}
