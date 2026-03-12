import Matter from "matter-js";
import { SpaceForceSimulation } from "../shared/sim/SpaceForceSimulation.js";
import {
  applySweptShipTunnelingGuards,
  checkSweptProjectileHitShipCollisions,
  type CollisionTelemetryEvent,
  type SimulationCollisionHandlersContext,
  type SweptPose,
} from "../shared/sim/modules/simulationCollisionHandlers.js";
import { Physics } from "../shared/sim/physics/Physics.js";
import {
  shipBodyPositionFromCenter,
  shipCenterFromBodyPosition,
} from "../shared/sim/physics/shipTransform.js";
import type {
  Hooks,
  RuntimePilot,
  RuntimePlayer,
  RuntimeProjectile,
} from "../shared/sim/types.js";
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  PROJECTILE_LIFETIME_MS,
  PROJECTILE_RADIUS,
  PROJECTILE_VISUAL_GLOW_RADIUS,
} from "../shared/sim/constants.js";

interface ScenarioResult {
  name: string;
  passed: boolean;
  details: string;
}

interface CollisionHarness {
  ctx: SimulationCollisionHandlersContext;
  physics: Physics;
  players: Map<string, RuntimePlayer>;
  pilots: Map<string, RuntimePilot>;
  projectileBodies: Map<string, Matter.Body>;
  shipBodies: Map<string, Matter.Body>;
  pilotBodies: Map<string, Matter.Body>;
  telemetry: CollisionTelemetryEvent[];
  shipHits: Array<{ ownerId: string | null; targetId: string }>;
  pilotKills: Array<{ pilotPlayerId: string; killerId: string }>;
}

function log(message: string): void {
  console.log("[CollisionMatrix]", message);
}

function createRuntimePlayer(id: string): RuntimePlayer {
  return {
    id,
    sessionId: id,
    name: id,
    isBot: false,
    botType: null,
    colorIndex: 0,
    kills: 0,
    roundWins: 0,
    score: 0,
    comboStreak: 0,
    comboMultiplier: 1,
    comboExpiresAtMs: 0,
    state: "ACTIVE",
    input: {
      buttonA: false,
      buttonB: false,
      timestamp: 0,
      clientTimeMs: 0,
      inputSequence: 0,
    },
    latestInputSequence: 0,
    lastProcessedInputSequence: 0,
    reportedRttMs: 0,
    dashQueued: false,
    botThinkAtMs: 0,
    botLastDecisionMs: 0,
    botCachedAction: {
      buttonA: false,
      buttonB: false,
      dash: false,
    },
    fireButtonHeld: false,
    fireRequested: false,
    firePressStartMs: 0,
    lastShipDashAtMs: 0,
    dashTimerSec: 0,
    dashVectorX: 0,
    dashVectorY: 0,
    recoilTimerSec: 0,
    angularVelocity: 0,
    endlessRespawnAtMs: null,
    ship: {
      id: "ship_" + id,
      playerId: id,
      x: 0,
      y: 0,
      angle: 0,
      vx: 0,
      vy: 0,
      alive: true,
      invulnerableUntil: 0,
      ammo: 99,
      maxAmmo: 99,
      lastShotTime: 0,
      reloadStartTime: 0,
      isReloading: false,
    },
  };
}

function createRuntimePilot(playerId: string, x: number, y: number): RuntimePilot {
  return {
    id: "pilot_" + playerId,
    playerId,
    x,
    y,
    vx: 0,
    vy: 0,
    angle: 0,
    spawnTime: 0,
    survivalProgress: 0,
    alive: true,
    angularVelocity: 0,
    lastDashAtMs: 0,
    dashInputHeld: false,
    controlMode: "player",
    aiThinkAtMs: 0,
    aiTargetAngle: 0,
    aiShouldDash: false,
  };
}

function getPluginString(body: Matter.Body, key: string): string | null {
  const value = (body.plugin as Record<string, unknown> | undefined)?.[key];
  if (typeof value === "string") return value;
  const parent = body.parent;
  if (parent && parent !== body) {
    const parentValue = (parent.plugin as Record<string, unknown> | undefined)?.[key];
    if (typeof parentValue === "string") return parentValue;
  }
  return null;
}

function createCollisionHarness(): CollisionHarness {
  const physics = new Physics();
  physics.createWalls(ARENA_WIDTH, ARENA_HEIGHT, 120, 1, 0);

  const players = new Map<string, RuntimePlayer>();
  const pilots = new Map<string, RuntimePilot>();
  const projectileBodies = new Map<string, Matter.Body>();
  const shipBodies = new Map<string, Matter.Body>();
  const pilotBodies = new Map<string, Matter.Body>();
  const telemetry: CollisionTelemetryEvent[] = [];
  const shipHits: Array<{ ownerId: string | null; targetId: string }> = [];
  const pilotKills: Array<{ pilotPlayerId: string; killerId: string }> = [];

  const ctx: SimulationCollisionHandlersContext = {
    nowMs: 1000,
    players,
    pilots,
    asteroids: [],
    powerUps: [],
    playerPowerUps: new Map(),
    projectileBodies,
    yellowBlocks: [],
    yellowBlockBodyIndex: new Map(),
    yellowBlockSwordHitCooldown: new Map(),
    laserBeams: [],
    laserBeamWidth: 10,
    physics,
    getCurrentMapId: () => 4,
    getPluginString,
    removeProjectileEntity: (projectileId: string) => {
      const body = projectileBodies.get(projectileId);
      if (body) {
        physics.removeBody(body);
        projectileBodies.delete(projectileId);
      }
    },
    triggerScreenShake: () => {},
    onSound: () => {},
    onShipHit: (owner, target) => {
      target.ship.alive = false;
      target.state = "EJECTED";
      shipHits.push({
        ownerId: owner?.id ?? null,
        targetId: target.id,
      });
    },
    killPilot: (pilotPlayerId, killerId) => {
      const pilot = pilots.get(pilotPlayerId);
      if (pilot) {
        pilot.alive = false;
        pilots.delete(pilotPlayerId);
      }
      const player = players.get(pilotPlayerId);
      if (player) {
        player.state = "SPECTATING";
      }
      pilotKills.push({ pilotPlayerId, killerId });
    },
    hitAsteroid: () => {},
    destroyAsteroid: () => {},
    grantPowerUp: () => {},
    removePowerUpBody: () => {},
    onCollisionTelemetry: (event) => {
      telemetry.push(event);
    },
  };

  return {
    ctx,
    physics,
    players,
    pilots,
    projectileBodies,
    shipBodies,
    pilotBodies,
    telemetry,
    shipHits,
    pilotKills,
  };
}

function createShipBody(
  harness: CollisionHarness,
  playerId: string,
  x: number,
  y: number,
  angle: number,
): Matter.Body {
  const body = harness.physics.createShip(x, y, playerId, {
    frictionAir: 0.02,
    restitution: 0.2,
    friction: 0,
    angularDamping: 0.04,
  });
  Matter.Body.setAngle(body, angle);
  Matter.Body.setPosition(body, shipBodyPositionFromCenter(x, y, angle));
  harness.shipBodies.set(playerId, body);
  return body;
}

function createPilotBody(
  harness: CollisionHarness,
  playerId: string,
  x: number,
  y: number,
): Matter.Body {
  const body = harness.physics.createPilot(x, y, playerId, {
    frictionAir: 0.01,
    angularDamping: 0.02,
    initialAngle: 0,
    initialAngularVelocity: 0,
    vx: 0,
    vy: 0,
  });
  harness.pilotBodies.set(playerId, body);
  return body;
}

function createProjectileBody(
  harness: CollisionHarness,
  projectileId: string,
  ownerId: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
): Matter.Body {
  const body = harness.physics.createProjectile(
    x,
    y,
    vx,
    vy,
    PROJECTILE_RADIUS,
    ownerId,
    projectileId,
  );
  harness.projectileBodies.set(projectileId, body);
  return body;
}

function scenarioProjectileVsShipSweptHit(): ScenarioResult {
  const harness = createCollisionHarness();
  const owner = createRuntimePlayer("A");
  const target = createRuntimePlayer("B");
  harness.players.set(owner.id, owner);
  harness.players.set(target.id, target);
  target.ship.invulnerableUntil = 0;

  createShipBody(harness, "B", 440, 300, 0);
  const projectileBody = createProjectileBody(
    harness,
    "proj_ship",
    "A",
    520,
    300,
    14,
    0,
  );
  const previousProjectilePositions = new Map<string, { x: number; y: number }>();
  previousProjectilePositions.set("proj_ship", { x: 360, y: 300 });
  const previousProjectileVelocities = new Map<string, { x: number; y: number }>();
  previousProjectileVelocities.set("proj_ship", { x: 14, y: 0 });
  const previousShipPoses = new Map<string, SweptPose>();
  previousShipPoses.set("B", { x: 440, y: 300, angle: 0 });

  checkSweptProjectileHitShipCollisions(
    harness.ctx,
    harness.shipBodies,
    previousProjectilePositions,
    previousProjectileVelocities,
    undefined,
    previousShipPoses,
    harness.pilotBodies,
    undefined,
  );

  const hit = harness.shipHits.find((entry) => entry.targetId === "B");
  const removed = !harness.projectileBodies.has("proj_ship");
  const telemetryHit = harness.telemetry.some(
    (entry) =>
      entry.kind === "projectile_ship_swept_hit" &&
      entry.projectileId === "proj_ship" &&
      entry.shipPlayerId === "B",
  );
  const passed = Boolean(hit) && removed && telemetryHit;
  return {
    name: "projectile_vs_ship_swept_hit",
    passed,
    details: passed
      ? "Projectile sweep resolved ship hit and removed projectile."
      : "Expected swept ship hit was not observed.",
  };
}

function scenarioProjectileVsPilotSweptHit(): ScenarioResult {
  const harness = createCollisionHarness();
  const owner = createRuntimePlayer("A");
  const pilotOwner = createRuntimePlayer("B");
  harness.players.set(owner.id, owner);
  harness.players.set(pilotOwner.id, pilotOwner);
  harness.pilots.set("B", createRuntimePilot("B", 440, 300));
  createPilotBody(harness, "B", 440, 300);
  createProjectileBody(harness, "proj_pilot", "A", 520, 300, 14, 0);

  const previousProjectilePositions = new Map<string, { x: number; y: number }>();
  previousProjectilePositions.set("proj_pilot", { x: 360, y: 300 });
  const previousProjectileVelocities = new Map<string, { x: number; y: number }>();
  previousProjectileVelocities.set("proj_pilot", { x: 14, y: 0 });
  const previousPilotPoses = new Map<string, SweptPose>();
  previousPilotPoses.set("B", { x: 440, y: 300, angle: 0 });

  checkSweptProjectileHitShipCollisions(
    harness.ctx,
    harness.shipBodies,
    previousProjectilePositions,
    previousProjectileVelocities,
    undefined,
    undefined,
    harness.pilotBodies,
    previousPilotPoses,
  );

  const killed = harness.pilotKills.find(
    (entry) => entry.pilotPlayerId === "B" && entry.killerId === "A",
  );
  const removed = !harness.projectileBodies.has("proj_pilot");
  const telemetryHit = harness.telemetry.some(
    (entry) =>
      entry.kind === "projectile_pilot_swept_hit" &&
      entry.projectileId === "proj_pilot" &&
      entry.pilotPlayerId === "B",
  );
  const passed = Boolean(killed) && removed && telemetryHit;
  return {
    name: "projectile_vs_pilot_swept_hit",
    passed,
    details: passed
      ? "Projectile sweep resolved pilot hit and removed projectile."
      : "Expected swept pilot hit was not observed.",
  };
}

function scenarioShipVsShipTunnelGuard(): ScenarioResult {
  const harness = createCollisionHarness();
  harness.players.set("A", createRuntimePlayer("A"));
  harness.players.set("B", createRuntimePlayer("B"));
  const shipA = createShipBody(harness, "A", 620, 300, 0);
  const shipB = createShipBody(harness, "B", 380, 300, 0);

  const beforeA = shipCenterFromBodyPosition(
    shipA.position.x,
    shipA.position.y,
    shipA.angle,
  );
  const beforeB = shipCenterFromBodyPosition(
    shipB.position.x,
    shipB.position.y,
    shipB.angle,
  );

  const previousShipPoses = new Map<string, SweptPose>();
  previousShipPoses.set("A", { x: 380, y: 300, angle: 0 });
  previousShipPoses.set("B", { x: 620, y: 300, angle: 0 });

  applySweptShipTunnelingGuards(
    harness.ctx,
    harness.shipBodies,
    harness.pilotBodies,
    previousShipPoses,
    undefined,
  );

  const afterA = shipCenterFromBodyPosition(
    shipA.position.x,
    shipA.position.y,
    shipA.angle,
  );
  const afterB = shipCenterFromBodyPosition(
    shipB.position.x,
    shipB.position.y,
    shipB.angle,
  );
  const moved =
    Math.abs(afterA.x - beforeA.x) > 0.1 || Math.abs(afterB.x - beforeB.x) > 0.1;
  const telemetryHit = harness.telemetry.some(
    (entry) =>
      entry.kind === "ship_ship_tunnel_resolved" &&
      entry.shipPlayerId === "A" &&
      entry.targetPlayerId === "B",
  );
  const passed = moved && telemetryHit;
  return {
    name: "ship_vs_ship_tunnel_guard",
    passed,
    details: passed
      ? "Ship sweep tunnel guard applied corrective separation."
      : "Expected ship tunnel correction did not trigger.",
  };
}

function scenarioShipVsPilotTunnelGuard(): ScenarioResult {
  const harness = createCollisionHarness();
  harness.players.set("A", createRuntimePlayer("A"));
  harness.players.set("B", createRuntimePlayer("B"));
  harness.pilots.set("B", createRuntimePilot("B", 380, 300));
  createShipBody(harness, "A", 620, 300, 0);
  createPilotBody(harness, "B", 380, 300);

  const previousShipPoses = new Map<string, SweptPose>();
  previousShipPoses.set("A", { x: 380, y: 300, angle: 0 });
  const previousPilotPoses = new Map<string, SweptPose>();
  previousPilotPoses.set("B", { x: 620, y: 300, angle: 0 });

  applySweptShipTunnelingGuards(
    harness.ctx,
    harness.shipBodies,
    harness.pilotBodies,
    previousShipPoses,
    previousPilotPoses,
  );

  const killed = harness.pilotKills.find(
    (entry) => entry.pilotPlayerId === "B" && entry.killerId === "A",
  );
  const telemetryHit = harness.telemetry.some(
    (entry) =>
      entry.kind === "ship_pilot_tunnel_resolved" &&
      entry.shipPlayerId === "A" &&
      entry.pilotPlayerId === "B",
  );
  const passed = Boolean(killed) && telemetryHit;
  return {
    name: "ship_vs_pilot_tunnel_guard",
    passed,
    details: passed
      ? "Ship-pilot sweep tunnel guard resolved to pilot kill."
      : "Expected ship-pilot tunnel resolution did not trigger.",
  };
}

function createNoopHooks(): Hooks {
  return {
    onPlayers: () => {},
    onRoomMeta: () => {},
    onPhase: () => {},
    onCountdown: () => {},
    onRoundResult: () => {},
    onSnapshot: () => {},
    onSound: () => {},
    onScreenShake: () => {},
    onDashParticles: () => {},
    onDevMode: () => {},
    onError: () => {},
  };
}

function advanceToPlaying(sim: SpaceForceSimulation): void {
  const maxTicks = 900;
  for (let i = 0; i < maxTicks; i += 1) {
    if (sim.phase === "COUNTDOWN") {
      sim.skipCountdown();
    }
    sim.update(1000 / 60);
    if (sim.phase === "PLAYING") return;
  }
  throw new Error("Failed to reach PLAYING phase");
}

function resetShipForScenario(
  sim: SpaceForceSimulation,
  playerId: string,
  x: number,
  y: number,
  angle: number,
): void {
  const player = sim.players.get(playerId);
  if (!player) {
    throw new Error("Missing player " + playerId);
  }
  player.ship.x = x;
  player.ship.y = y;
  player.ship.vx = 0;
  player.ship.vy = 0;
  player.ship.angle = angle;
  player.ship.alive = true;
  player.ship.invulnerableUntil = 0;
  player.state = "ACTIVE";
  sim.removeShipBody(playerId);
}

function scenarioDeadShooterStillScoresNoComboAdvance(): ScenarioResult {
  const sim = new SpaceForceSimulation("SIM_TEST", 4, 1000 / 60, createNoopHooks(), {
    debugToolsEnabled: true,
  });
  sim.addHuman("p1", "P1");
  sim.addHuman("p2", "P2");
  sim.setMap("p1", 4);

  const advanced = sim.getAdvancedSettingsSync();
  advanced.settings.asteroidDensity = "NONE";
  advanced.settings.startPowerups = false;
  sim.setAdvancedSettings("p1", advanced);

  sim.startMatch("p1");
  advanceToPlaying(sim);

  resetShipForScenario(sim, "p1", 260, 300, 0);
  resetShipForScenario(sim, "p2", 560, 300, Math.PI);
  sim.demoFreezeOthers("p1");

  const shooter = sim.players.get("p1");
  const target = sim.players.get("p2");
  if (!shooter || !target) {
    return {
      name: "dead_shooter_still_scores_no_combo_advance",
      passed: false,
      details: "Missing players in simulation scenario.",
    };
  }

  const projectile: RuntimeProjectile = {
    id: sim.nextEntityId("proj"),
    ownerId: "p1",
    x: 420,
    y: 300,
    vx: 28,
    vy: 0,
    spawnTime: sim.nowMs,
    radius: PROJECTILE_RADIUS,
    visualGlowRadius: PROJECTILE_VISUAL_GLOW_RADIUS,
    lifetimeMs: PROJECTILE_LIFETIME_MS,
  };
  sim.projectiles.push(projectile);

  const shooterScoreBefore = shooter.score;
  sim.onShipHit(target, shooter);
  const deadState = shooter.state;

  let hitResolved = false;
  for (let i = 0; i < 30; i += 1) {
    sim.update(1000 / 60);
    const victim = sim.players.get("p2");
    if (!victim) break;
    if (victim.state !== "ACTIVE") {
      hitResolved = true;
      break;
    }
  }

  const shooterAfter = sim.players.get("p1");
  const targetAfter = sim.players.get("p2");
  const scored = Boolean(shooterAfter && shooterAfter.score > shooterScoreBefore);
  const comboHeld =
    Boolean(shooterAfter) &&
    shooterAfter.comboStreak === 0 &&
    shooterAfter.comboMultiplier <= 1;
  const victimHit = Boolean(targetAfter && targetAfter.state !== "ACTIVE");

  const passed =
    deadState !== "ACTIVE" && hitResolved && victimHit && scored && comboHeld;
  return {
    name: "dead_shooter_still_scores_no_combo_advance",
    passed,
    details: passed
      ? "Post-death hit awarded score while combo chain stayed reset."
      : "Dead-shooter scoring/combo behavior diverged from expected flow.",
  };
}

function runMatrix(): ScenarioResult[] {
  return [
    scenarioProjectileVsShipSweptHit(),
    scenarioProjectileVsPilotSweptHit(),
    scenarioShipVsShipTunnelGuard(),
    scenarioShipVsPilotTunnelGuard(),
    scenarioDeadShooterStillScoresNoComboAdvance(),
  ];
}

function printResults(results: ScenarioResult[]): void {
  for (const result of results) {
    const status = result.passed ? "PASS" : "FAIL";
    log(status + " " + result.name + " -> " + result.details);
  }
  const failed = results.filter((result) => !result.passed).length;
  const passed = results.length - failed;
  log(
    "Summary: " +
      passed.toString() +
      "/" +
      results.length.toString() +
      " passed; " +
      failed.toString() +
      " failed.",
  );
  if (failed > 0) {
    process.exitCode = 1;
  }
}

const results = runMatrix();
printResults(results);
