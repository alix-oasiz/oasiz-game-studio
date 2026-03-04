import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";

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
  private trailLine: Line2 | null = null;
  private trailLineGeometry: LineGeometry | null = null;
  private trailLineMaterial: LineMaterial | null = null;
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
    this.ensureTrailLine();
  }

  public resetTrail(): void {
    this.trailPoints = [];
    this.trailSpawnSeconds = 0;
    if (!this.trailLine) {
      return;
    }
    this.trailLine.visible = false;
    this.trailLineGeometry?.setPositions(this.emptyTrailPositions);
  }

  public update(host: MarbleVisualHost, delta: number): void {
    this.updateSteeringArrowVisual(host);
    this.updateTrail(host, delta);
  }

  private ensureTrailLine(): void {
    if (this.trailLine && this.trailLineGeometry && this.trailLineMaterial) {
      return;
    }
    this.trailLineGeometry = new LineGeometry();
    this.trailLineMaterial = new LineMaterial({
      color: "#d8f3ff",
      linewidth: 0.28,
      worldUnits: true,
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.trailLineMaterial.resolution.set(window.innerWidth, window.innerHeight);
    this.trailLine = new Line2(this.trailLineGeometry, this.trailLineMaterial);
    this.trailLine.frustumCulled = false;
    this.trailLine.visible = false;
    this.scene.add(this.trailLine);
  }

  private appendTrailPoint(position: THREE.Vector3): void {
    this.ensureTrailLine();
    this.trailPoints.push(position.clone().add(new THREE.Vector3(0, 0.18, 0)));
    if (this.trailPoints.length > this.config.trailMaxPoints) {
      this.trailPoints.shift();
    }
    if (!this.trailLine || !this.trailLineGeometry) {
      return;
    }
    const points = this.trailPoints;
    if (points.length < 2) {
      this.trailLine.visible = false;
      return;
    }
    const positions: number[] = [];
    for (let i = 0; i < points.length; i += 1) {
      positions.push(points[i].x, points[i].y, points[i].z);
    }
    this.trailLineGeometry.setPositions(positions);
    this.trailLine.computeLineDistances();
    this.trailLine.visible = points.length >= 2;
  }

  private updateTrail(host: MarbleVisualHost, delta: number): void {
    if (!this.trailLine) {
      this.ensureTrailLine();
    }
    this.trailLineMaterial?.resolution.set(window.innerWidth, window.innerHeight);

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
  const airborne = isAirborne(host, positionBeforeStep);
  const controlScale = airborne ? host.airControlMultiplier : 1;
  const steerImpulse =
    host.nudgeImpulse *
    host.speedMultiplier *
    host.steeringImpulseScale *
    controlScale *
    ULTRA_FAST_TONE_DOWN_SCALE *
    accelRecoveryBoost;
  if (inputAxis !== 0) {
    host.marbleBody.applyImpulse(
      {
        x: steerDirection.x * steerImpulse,
        y: 0,
        z: steerDirection.z * steerImpulse,
      },
      true,
    );
  }
  const driveImpulse =
    host.nudgeImpulse *
    host.speedMultiplier *
    host.arrowDriveImpulseScale *
    controlScale *
    ULTRA_FAST_TONE_DOWN_SCALE *
    accelRecoveryBoost;
  host.marbleBody.applyImpulse(
    {
      x: steerDirection.x * driveImpulse,
      y: 0,
      z: steerDirection.z * driveImpulse,
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
