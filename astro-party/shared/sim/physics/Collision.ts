import Matter from "matter-js";
import { Physics } from "./Physics.js";

export interface CollisionCallbacks {
  onProjectileHitShip: (projectileBody: Matter.Body, shipBody: Matter.Body) => void;
  onProjectileHitPilot: (projectileBody: Matter.Body, pilotBody: Matter.Body) => void;
  onShipHitPilot: (shipBody: Matter.Body, pilotBody: Matter.Body) => void;
  onProjectileHitWall: (projectileBody: Matter.Body) => void;
  onProjectileHitYellowBlock: (projectileBody: Matter.Body, blockBody: Matter.Body) => void;
  onProjectileHitAsteroid: (projectileBody: Matter.Body, asteroidBody: Matter.Body) => void;
  onShipHitAsteroid: (shipBody: Matter.Body, asteroidBody: Matter.Body) => void;
  onPilotHitAsteroid: (pilotBody: Matter.Body, asteroidBody: Matter.Body) => void;
  onShipHitPowerUp: (shipBody: Matter.Body, powerUpBody: Matter.Body) => void;
}

export function setupCollisions(
  physics: Physics,
  callbacks: CollisionCallbacks,
): void {
  physics.onCollision((event) => {
    const processedPairs = new Set<string>();
    const normalizeBody = (body: Matter.Body): Matter.Body => body.parent ?? body;

    for (const pair of event.pairs) {
      const bodyA = normalizeBody(pair.bodyA);
      const bodyB = normalizeBody(pair.bodyB);

      const pairKey =
        bodyA.id < bodyB.id
          ? bodyA.id.toString() + ":" + bodyB.id.toString()
          : bodyB.id.toString() + ":" + bodyA.id.toString();
      if (processedPairs.has(pairKey)) continue;
      processedPairs.add(pairKey);

      const labelA = bodyA.label;
      const labelB = bodyB.label;

      const getBody = (label: string): Matter.Body | null => {
        if (labelA === label) return bodyA;
        if (labelB === label) return bodyB;
        return null;
      };

      if (
        (labelA === "projectile" && labelB === "ship") ||
        (labelA === "ship" && labelB === "projectile")
      ) {
        callbacks.onProjectileHitShip(getBody("projectile")!, getBody("ship")!);
      }

      if (
        (labelA === "projectile" && labelB === "pilot") ||
        (labelA === "pilot" && labelB === "projectile")
      ) {
        callbacks.onProjectileHitPilot(getBody("projectile")!, getBody("pilot")!);
      }

      if (
        (labelA === "ship" && labelB === "pilot") ||
        (labelA === "pilot" && labelB === "ship")
      ) {
        callbacks.onShipHitPilot(getBody("ship")!, getBody("pilot")!);
      }

      if (
        (labelA === "projectile" && labelB === "wall") ||
        (labelA === "wall" && labelB === "projectile")
      ) {
        callbacks.onProjectileHitWall(getBody("projectile")!);
      }

      if (
        (labelA === "projectile" && labelB === "yellowBlock") ||
        (labelA === "yellowBlock" && labelB === "projectile")
      ) {
        callbacks.onProjectileHitYellowBlock(
          getBody("projectile")!,
          getBody("yellowBlock")!,
        );
      }

      if (
        (labelA === "projectile" && labelB === "asteroid") ||
        (labelA === "asteroid" && labelB === "projectile")
      ) {
        callbacks.onProjectileHitAsteroid(getBody("projectile")!, getBody("asteroid")!);
      }

      if (
        (labelA === "ship" && labelB === "asteroid") ||
        (labelA === "asteroid" && labelB === "ship")
      ) {
        callbacks.onShipHitAsteroid(getBody("ship")!, getBody("asteroid")!);
      }

      if (
        (labelA === "pilot" && labelB === "asteroid") ||
        (labelA === "asteroid" && labelB === "pilot")
      ) {
        callbacks.onPilotHitAsteroid(getBody("pilot")!, getBody("asteroid")!);
      }

      if (
        (labelA === "ship" && labelB === "powerup") ||
        (labelA === "powerup" && labelB === "ship")
      ) {
        callbacks.onShipHitPowerUp(getBody("ship")!, getBody("powerup")!);
      }
    }
  });
}
