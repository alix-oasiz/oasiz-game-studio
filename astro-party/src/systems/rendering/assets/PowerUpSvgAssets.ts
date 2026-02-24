import type { PowerUpType } from "../../../types";
import homingMissileSvg from "../../../../shared/assets/powerups/homing-missile.svg?raw";
import joustSvg from "../../../../shared/assets/powerups/joust.svg?raw";
import laserSvg from "../../../../shared/assets/powerups/laser.svg?raw";
import mineSvg from "../../../../shared/assets/powerups/mine.svg?raw";
import reverseSvg from "../../../../shared/assets/powerups/reverse.svg?raw";
import scatterSvg from "../../../../shared/assets/powerups/scatter.svg?raw";
import shieldSvg from "../../../../shared/assets/powerups/shield.svg?raw";

export interface PowerUpSvgAsset {
  svgTemplate: string;
  glowColor: string;
}

export const POWERUP_SVG_ASSETS: Readonly<Record<PowerUpType, PowerUpSvgAsset>> =
  Object.freeze({
    LASER: Object.freeze({
      svgTemplate: laserSvg,
      glowColor: "#ff0066",
    }),
    SHIELD: Object.freeze({
      svgTemplate: shieldSvg,
      glowColor: "#00ccff",
    }),
    SCATTER: Object.freeze({
      svgTemplate: scatterSvg,
      glowColor: "#00cc44",
    }),
    MINE: Object.freeze({
      svgTemplate: mineSvg,
      glowColor: "#ff8800",
    }),
    REVERSE: Object.freeze({
      svgTemplate: reverseSvg,
      glowColor: "#666666",
    }),
    JOUST: Object.freeze({
      svgTemplate: joustSvg,
      glowColor: "#00aa22",
    }),
    HOMING_MISSILE: Object.freeze({
      svgTemplate: homingMissileSvg,
      glowColor: "#888888",
    }),
  });
