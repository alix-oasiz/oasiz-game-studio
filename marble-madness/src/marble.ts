import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";

type GameState = "start" | "playing" | "gameOver";

interface TrackSampleLike {
  x: number;
  y: number;
  z: number;
}

export interface PhysicsDebugSnapshot {
  airborne: boolean;
  horizontalSpeed: number;
  verticalVelocity: number;
  verticalDelta: number;
}

export interface MarbleVisualHost {
  gameState: GameState;
  marbleBody: RAPIER.RigidBody | null;
  marbleMesh: THREE.Mesh;
}

export interface MarbleVisualConfig {
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
  marbleRadius: number;
  groundedProbePadding: number;
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

export class MarbleVisualController {
  private trailRibbonMesh: THREE.Mesh | null = null;
  private trailRibbonGeometry: THREE.BufferGeometry | null = null;
  private trailPoints: THREE.Vector3[] = [];
  private trailSpawnSeconds = 0;
  private readonly emptyTrailPositions = [0, 0, 0, 0, 0, 0];

  public constructor(
    private readonly scene: THREE.Scene,
    private readonly config: MarbleVisualConfig,
  ) {
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

  const velocityBeforeStep = host.marbleBody.linvel();
  host.world.step();

  const position = host.marbleBody.translation();
  const velocity = host.marbleBody.linvel();
  const horizontalSpeed = Math.sqrt(
    velocity.x * velocity.x + velocity.z * velocity.z,
  );
  host.setPhysicsDebug({
    airborne: isAirborne(host, position),
    horizontalSpeed,
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
