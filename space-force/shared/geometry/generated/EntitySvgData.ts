// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: shared/assets/entities/*.svg + shared/assets/entities/manifest.json
// Run: bun run generate:entities

export interface ShapePoint {
  x: number;
  y: number;
}

export interface GeneratedEntityTrailMeta {
  anchor: ShapePoint;
  maxAgeSec: number;
  startRadius: number;
  endRadius: number;
  alpha: number;
  blur: number;
  sampleIntervalSec: number;
  minSampleDistance: number;
}

export interface GeneratedEntityHardpointsMeta {
  muzzle?: ShapePoint;
  trail?: ShapePoint;
  joustLeft?: ShapePoint;
  joustRight?: ShapePoint;
  shieldRadii?: ShapePoint;
  pilotDash?: ShapePoint;
  pilotArmLeft?: ShapePoint;
  pilotArmRight?: ShapePoint;
}

export interface GeneratedEntityRenderMeta {
  trail?: GeneratedEntityTrailMeta;
  hardpoints?: GeneratedEntityHardpointsMeta;
}

export interface GeneratedEntitySvgData {
  id: string;
  svgTemplate: string;
  viewBox: { minX: number; minY: number; width: number; height: number };
  colliderPathId: string;
  colliderPath: string;
  colliderVertices: ReadonlyArray<ShapePoint>;
  centerOfGravityLocal: ShapePoint;
  renderMeta?: GeneratedEntityRenderMeta;
  renderScale: number;
  physicsScale: number;
  slotDefaults: Readonly<Record<string, string>>;
}

export const GENERATED_ENTITY_SVG_DATA = [
  {
    "id": "ship",
    "svgTemplate": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-20 -20 40 40\" role=\"img\" aria-label=\"Ship (vertical squash)\">\n  <defs>\n    <style>\n      .slot-secondary { fill: var(--slot-secondary, #ffffff); }\n      .slot-stroke { stroke: var(--slot-stroke, #ffffff); }\n      .stop-primary { stop-color: var(--slot-primary, #00f0ff); }\n      .stop-dark { stop-color: #07121a; }\n    </style>\n\n    <linearGradient id=\"hullGrad\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n      <stop offset=\"0\" class=\"stop-primary\" stop-opacity=\"1\"/>\n      <stop offset=\"0.60\" class=\"stop-primary\" stop-opacity=\"1\"/>\n      <stop offset=\"1\" class=\"stop-dark\" stop-opacity=\"1\"/>\n    </linearGradient>\n\n    <linearGradient id=\"wingGrad\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n      <stop offset=\"0\" class=\"stop-primary\" stop-opacity=\"1\"/>\n      <stop offset=\"1\" class=\"stop-dark\" stop-opacity=\"1\"/>\n    </linearGradient>\n\n    <radialGradient id=\"coreGlow\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n      <stop offset=\"0\" class=\"stop-primary\" stop-opacity=\"1.0\"/>\n      <stop offset=\"45%\" class=\"stop-primary\" stop-opacity=\"0.55\"/>\n      <stop offset=\"100%\" class=\"stop-primary\" stop-opacity=\"0\"/>\n    </radialGradient>\n\n  </defs>\n\n  <metadata id=\"render-meta\">\n{\n  \"trail\": {\n    \"anchor\": { \"x\": -9.2, \"y\": 0.0 },\n    \"maxAgeSec\": 4.0,\n    \"startRadius\": 10.5,\n    \"endRadius\": 2.2,\n    \"alpha\": 0.48,\n    \"blur\": 14.0,\n    \"sampleIntervalSec\": 0.04,\n    \"minSampleDistance\": 0.7\n  }\n}\n  </metadata>\n\n  <!-- Editor-only guide layer. generate-entity-assets strips this from runtime SVG. -->\n  \n\n  <!-- scale(1 0.8) is applied AFTER rotate => squashes screen-vertical -->\n  <g id=\"visual\" transform=\"scale(1 0.8) rotate(90) scale(0.35) translate(-0.25 -4.5)\">\n    <circle cx=\"0\" cy=\"30\" r=\"28\" fill=\"url(#coreGlow)\"/>\n\n    <polygon\n      points=\"-32.9,27.1 -49.9,22.7 -33.6,10.5 -19.2,23.0\"\n      data-role=\"wing-left\"\n      fill=\"url(#wingGrad)\"\n      class=\"slot-stroke\"\n      stroke-width=\"3\"\n      stroke-linejoin=\"round\"\n    />\n    <polygon\n      points=\"36.2,27.1 50.4,23.0 34.3,10.3 19.3,22.4\"\n      data-role=\"wing-right\"\n      fill=\"url(#wingGrad)\"\n      class=\"slot-stroke\"\n      stroke-width=\"3\"\n      stroke-linejoin=\"round\"\n    />\n\n    <polygon\n      points=\"0,-32 37,3 16,18 -16,18 -37,3\"\n      data-role=\"hull-main\"\n      fill=\"url(#hullGrad)\"\n      class=\"slot-stroke\"\n      stroke-width=\"3\"\n      stroke-linejoin=\"round\"\n    />\n\n    <polygon points=\"0,-22 26,4 0,16\" fill=\"#000\" opacity=\"0.18\"/>\n    <polygon points=\"0,-22 -26,4 0,16\" fill=\"#000\" opacity=\"0.10\"/>\n    <polygon points=\"-16,18 0,16 16,18 0,10\" fill=\"#000\" opacity=\"0.12\"/>\n\n    <polygon points=\"0,-24 15,-11 0,-7 -15,-11\" fill=\"#07121a\" opacity=\"0.95\"/>\n    <path class=\"slot-secondary\" d=\"M -16 -14 L 0 -28 L 16 -14 L 12 -10 L 0 -20 L -12 -10 Z\" opacity=\"1\"/>\n\n    <polygon\n      points=\"0,34 13,24 0,14 -13,24\"\n      fill=\"var(--slot-primary, #00f0ff)\"\n      opacity=\"0.78\"\n      class=\"slot-stroke\"\n      stroke-width=\"3\"\n      stroke-linejoin=\"round\"\n    />\n    <polygon\n      points=\"0,31 9,24 0,17 -9,24\"\n      fill=\"var(--slot-primary, #00f0ff)\"\n      opacity=\"0.92\"\n    />\n  </g>\n\n  <path\n    id=\"collider\"\n    d=\"M 12.775 -0.07 L 0.525 10.29 L -6.475 14.042 L -10.325 -0.07 L -6.37 -14.042 L 0.525 -10.43 Z\"\n    fill=\"none\"\n    stroke=\"none\"\n  />\n</svg>",
    "viewBox": {
      "minX": -20,
      "minY": -20,
      "width": 40,
      "height": 40
    },
    "colliderPathId": "collider",
    "colliderPath": "M 12.775 -0.07 L 0.525 10.29 L -6.475 14.042 L -10.325 -0.07 L -6.37 -14.042 L 0.525 -10.43 Z",
    "colliderVertices": [
      {
        "x": 12.775,
        "y": -0.07
      },
      {
        "x": 0.525,
        "y": 10.29
      },
      {
        "x": -6.475,
        "y": 14.042
      },
      {
        "x": -10.325,
        "y": -0.07
      },
      {
        "x": -6.37,
        "y": -14.042
      },
      {
        "x": 0.525,
        "y": -10.43
      }
    ],
    "centerOfGravityLocal": {
      "x": 12.775,
      "y": -0.07
    },
    "renderMeta": {
      "trail": {
        "anchor": {
          "x": -9.2,
          "y": 0
        },
        "maxAgeSec": 4,
        "startRadius": 10.5,
        "endRadius": 2.2,
        "alpha": 0.48,
        "blur": 14,
        "sampleIntervalSec": 0.04,
        "minSampleDistance": 0.7
      },
      "hardpoints": {
        "shieldRadii": {
          "x": 19.2,
          "y": 16.1
        },
        "muzzle": {
          "x": 13.2,
          "y": 0
        },
        "trail": {
          "x": -12.8,
          "y": 0
        },
        "joustLeft": {
          "x": -9.8,
          "y": -13.2
        },
        "joustRight": {
          "x": -9.8,
          "y": 13.2
        }
      }
    },
    "renderScale": 1.5,
    "physicsScale": 1.5,
    "slotDefaults": {
      "slot-primary": "#00f0ff",
      "slot-secondary": "#ffffff",
      "slot-tertiary": "#ff4400",
      "slot-stroke": "#ffffff"
    }
  },
  {
    "id": "pilot",
    "svgTemplate": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-20 -20 40 40\" role=\"img\" aria-label=\"Space Force pilot hi-fi\">\n  <defs>\n    <style>\n      .slot-secondary { fill: var(--slot-secondary, #f5f5f5); }\n      .slot-stroke { stroke: var(--slot-outline, #ffffff); }\n      .stop-primary { stop-color: var(--slot-primary, #00f0ff); }\n      .stop-dark { stop-color: var(--slot-tertiary, #1d2636); }\n    </style>\n\n    <linearGradient id=\"suitGrad\" x1=\"0.05\" y1=\"0.15\" x2=\"0.95\" y2=\"0.85\">\n      <stop offset=\"0\" class=\"stop-primary\" stop-opacity=\"1\"/>\n      <stop offset=\"0.58\" class=\"stop-primary\" stop-opacity=\"1\"/>\n      <stop offset=\"1\" class=\"stop-dark\" stop-opacity=\"1\"/>\n    </linearGradient>\n\n    <linearGradient id=\"panelGrad\" x1=\"0\" y1=\"1\" x2=\"1\" y2=\"0\">\n      <stop offset=\"0\" class=\"stop-dark\" stop-opacity=\"1\"/>\n      <stop offset=\"0.42\" class=\"stop-primary\" stop-opacity=\"0.85\"/>\n      <stop offset=\"1\" class=\"stop-primary\" stop-opacity=\"1\"/>\n    </linearGradient>\n\n  </defs>\n\n  <g id=\"visual\" transform=\"scale(0.62)\">\n    <path\n      d=\"M -16.0 -5.6 L -11.2 -8.6 L -9.0 -2.6 L -9.0 2.6 L -11.2 8.6 L -16.0 5.6 L -17.2 0 Z\"\n      fill=\"var(--slot-tertiary, #1d2636)\"\n      opacity=\"0.94\"\n      class=\"slot-stroke\"\n      stroke-width=\"0.9\"\n      stroke-linejoin=\"round\"\n    />\n\n    <path\n      d=\"M -14.6 -4.5 L -11.4 -6.4 L -10.0 -2.0 L -10.0 2.0 L -11.4 6.4 L -14.6 4.5 L -15.4 0 Z\"\n      fill=\"url(#panelGrad)\"\n      opacity=\"0.9\"\n    />\n\n    <path\n      d=\"M -9.6 -7.2\n         L 2.8 -7.2\n         Q 5.0 -7.2 6.6 -5.6\n         L 8.4 -3.8\n         Q 9.6 -2.6 9.6 -0.8\n         L 9.6 0.8\n         Q 9.6 2.6 8.4 3.8\n         L 6.6 5.6\n         Q 5.0 7.2 2.8 7.2\n         L -8.0 7.2\n         Q -10.2 7.2 -11.2 5.2\n         L -12.6 2.4\n         Q -13.2 1.2 -13.2 0\n         Q -13.2 -1.2 -12.6 -2.4\n         L -11.2 -5.2\n         Q -10.2 -7.2 -9.6 -7.2 Z\"\n      fill=\"url(#suitGrad)\"\n      class=\"slot-stroke\"\n      stroke-width=\"1.05\"\n      stroke-linejoin=\"round\"\n    />\n\n    <path\n      d=\"M -9.1 -6.2\n         L 2.7 -6.2\n         Q 4.6 -6.2 5.9 -4.9\n         L 7.5 -3.3\n         Q 8.5 -2.3 8.5 -0.9\n         L 8.5 0.9\n         Q 8.5 2.3 7.5 3.3\n         L 5.9 4.9\n         Q 4.6 6.2 2.7 6.2\n         L -7.9 6.2\n         Q -9.5 6.2 -10.2 4.8\n         L -11.4 2.4\n         Q -11.9 1.2 -11.9 0\n         Q -11.9 -1.2 -11.4 -2.4\n         L -10.2 -4.8\n         Q -9.5 -6.2 -9.1 -6.2 Z\"\n      fill=\"none\"\n      class=\"slot-stroke\"\n      stroke-width=\"0.45\"\n      opacity=\"0.65\"\n      stroke-linejoin=\"round\"\n    />\n\n    <g opacity=\"0.95\">\n      <polygon points=\"-2.8,-3.0 1.0,0 -2.8,3.0 -6.2,0\" fill=\"var(--slot-primary, #00f0ff)\"/>\n      <polygon points=\"-3.6,-1.8 -1.2,0 -3.6,1.8 -5.6,0\" fill=\"var(--slot-tertiary, #1d2636)\" opacity=\"0.28\"/>\n      <path d=\"M -2.8 -3.0 L 1.0 0 L -2.8 3.0\" fill=\"none\" stroke=\"var(--slot-secondary, #f5f5f5)\" opacity=\"0.26\" stroke-width=\"0.35\"/>\n    </g>\n\n    <!-- Internal body paneling -->\n    <polygon points=\"-0.6,-5.7 5.6,-0.3 -0.6,5.1\" fill=\"#000\" opacity=\"0.16\"/>\n    <polygon points=\"-0.6,-5.7 -6.8,-0.3 -0.6,5.1\" fill=\"#000\" opacity=\"0.16\"/>\n    <polygon points=\"-5.8,4.8 -0.6,4.2 4.6,4.8 -0.6,2.4\" fill=\"#000\" opacity=\"0.12\"/>\n    <path d=\"M -3.8 -3.5 L -0.6 -5.9 L 2.6 -3.5 L 1.8 -2.7 L -0.6 -4.5 L -3.0 -2.7 Z\" fill=\"var(--slot-secondary, #f5f5f5)\" opacity=\"0.42\"/>\n\n    <path d=\"M -7.6 -4.2 L 4.8 -4.2\" stroke=\"var(--slot-tertiary, #1d2636)\" stroke-width=\"0.55\" opacity=\"0.22\"/>\n    <path d=\"M -8.5 4.2 L 4.0 4.2\" stroke=\"var(--slot-tertiary, #1d2636)\" stroke-width=\"0.55\" opacity=\"0.18\"/>\n    <path d=\"M -0.8 -6.8 L -0.8 6.8\" stroke=\"var(--slot-tertiary, #1d2636)\" stroke-width=\"0.45\" opacity=\"0.16\"/>\n\n    <circle\n      cx=\"13.2\"\n      cy=\"0\"\n      r=\"6.5\"\n      fill=\"var(--slot-tertiary, #1d2636)\"\n      opacity=\"0.96\"\n      class=\"slot-stroke\"\n      stroke-width=\"1.05\"\n    />\n\n    <circle\n      cx=\"13.2\"\n      cy=\"0\"\n      r=\"5.6\"\n      fill=\"none\"\n      class=\"slot-stroke\"\n      stroke=\"var(--slot-secondary, #f5f5f5)\"\n      stroke-width=\"0.7\"\n      opacity=\"0.9\"\n    />\n\n    <path\n      d=\"M 9.6 -3.3\n         Q 12.4 -5.2 15.2 -4.0\n         Q 17.8 -2.8 17.8 0\n         Q 17.8 2.8 15.2 4.0\n         Q 12.4 5.2 9.6 3.3\n         Q 10.8 0 9.6 -3.3 Z\"\n      fill=\"var(--slot-primary, #00f0ff)\"\n      opacity=\"0.78\"\n    />\n\n    <path\n      d=\"M 11.0 -2.4\n         Q 13.2 -3.8 15.2 -3.0\n         Q 16.6 -2.4 17.0 -1.0\n         Q 15.4 -1.2 14.0 -0.4\n         Q 12.2 0.6 11.2 2.0\n         Q 11.8 0 11.0 -2.4 Z\"\n      fill=\"var(--slot-secondary, #f5f5f5)\"\n      opacity=\"0.14\"\n    />\n    <circle cx=\"16.0\" cy=\"-1.4\" r=\"0.55\" fill=\"var(--slot-secondary, #f5f5f5)\" opacity=\"0.22\"/>\n    <circle cx=\"15.4\" cy=\"1.6\" r=\"0.40\" fill=\"var(--slot-secondary, #f5f5f5)\" opacity=\"0.18\"/>\n  </g>\n\n  <!-- Editor-only dash FX guide (removed by generate-entity-assets via #editor-hardpoints) -->\n  \n\n  <!-- Keep pilot collider stable for gameplay parity; M/L/Z only for extractor -->\n  <path\n    id=\"collider\"\n    d=\"M -10.664 0 L -9.92 -3.472 L -6.944 -5.332 L -5.952 -4.464 L 1.736 -4.464 L 4.092 -3.472 L 5.208 -2.356 L 5.952 -2.046 L 7.688 -3.224 L 9.424 -2.48 L 11.036 -1.736 L 11.346 0 L 11.036 1.736 L 9.424 2.48 L 7.688 3.224 L 5.952 2.046 L 5.208 2.356 L 4.092 3.472 L 1.736 4.464 L -4.96 4.464 L -6.944 5.332 L -9.92 3.472 Z\"\n    fill=\"none\"\n    stroke=\"none\"\n  />\n</svg>",
    "viewBox": {
      "minX": -20,
      "minY": -20,
      "width": 40,
      "height": 40
    },
    "colliderPathId": "collider",
    "colliderPath": "M -10.664 0 L -9.92 -3.472 L -6.944 -5.332 L -5.952 -4.464 L 1.736 -4.464 L 4.092 -3.472 L 5.208 -2.356 L 5.952 -2.046 L 7.688 -3.224 L 9.424 -2.48 L 11.036 -1.736 L 11.346 0 L 11.036 1.736 L 9.424 2.48 L 7.688 3.224 L 5.952 2.046 L 5.208 2.356 L 4.092 3.472 L 1.736 4.464 L -4.96 4.464 L -6.944 5.332 L -9.92 3.472 Z",
    "colliderVertices": [
      {
        "x": -10.664,
        "y": 0
      },
      {
        "x": -9.92,
        "y": -3.472
      },
      {
        "x": -6.944,
        "y": -5.332
      },
      {
        "x": -5.952,
        "y": -4.464
      },
      {
        "x": 1.736,
        "y": -4.464
      },
      {
        "x": 4.092,
        "y": -3.472
      },
      {
        "x": 5.208,
        "y": -2.356
      },
      {
        "x": 5.952,
        "y": -2.046
      },
      {
        "x": 7.688,
        "y": -3.224
      },
      {
        "x": 9.424,
        "y": -2.48
      },
      {
        "x": 11.036,
        "y": -1.736
      },
      {
        "x": 11.346,
        "y": 0
      },
      {
        "x": 11.036,
        "y": 1.736
      },
      {
        "x": 9.424,
        "y": 2.48
      },
      {
        "x": 7.688,
        "y": 3.224
      },
      {
        "x": 5.952,
        "y": 2.046
      },
      {
        "x": 5.208,
        "y": 2.356
      },
      {
        "x": 4.092,
        "y": 3.472
      },
      {
        "x": 1.736,
        "y": 4.464
      },
      {
        "x": -4.96,
        "y": 4.464
      },
      {
        "x": -6.944,
        "y": 5.332
      },
      {
        "x": -9.92,
        "y": 3.472
      }
    ],
    "centerOfGravityLocal": {
      "x": -10.664,
      "y": 0
    },
    "renderMeta": {
      "hardpoints": {
        "pilotDash": {
          "x": -10.6,
          "y": 0
        },
        "pilotArmLeft": {
          "x": -0.8,
          "y": -5.8
        },
        "pilotArmRight": {
          "x": -0.8,
          "y": 5.8
        }
      }
    },
    "renderScale": 1.6,
    "physicsScale": 1.6,
    "slotDefaults": {
      "slot-primary": "#00f0ff",
      "slot-secondary": "#f5f5f5",
      "slot-tertiary": "#d6d6d6",
      "slot-outline": "#dcdcdc"
    }
  },
  {
    "id": "pilot_death_debris_visor",
    "svgTemplate": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-8 -8 16 16\" role=\"img\" aria-label=\"Pilot death debris visor\">\n  <defs>\n    <style>\n      .slot-stroke { stroke: var(--slot-stroke, #e8f5ff); }\n    </style>\n    <clipPath id=\"visorCrackClip\">\n      <circle cx=\"0\" cy=\"0\" r=\"2.95\"/>\n    </clipPath>\n  </defs>\n\n  <g id=\"visual\">\n    <circle\n      cx=\"0\"\n      cy=\"0\"\n      r=\"3.2\"\n      fill=\"var(--slot-secondary, #0b1120)\"\n      class=\"slot-stroke\"\n      stroke-width=\"0.8\"\n    />\n    <ellipse\n      cx=\"1.2\"\n      cy=\"-0.2\"\n      rx=\"2.3\"\n      ry=\"1.5\"\n      fill=\"var(--slot-primary, #00f0ff)\"\n      opacity=\"0.28\"\n    />\n    <g clip-path=\"url(#visorCrackClip)\" opacity=\"0.62\">\n      <path\n        d=\"M -1.8 -1.6 L -0.6 -0.5 L -0.2 0.5 L 0.7 1.3 L 1.8 1.7\"\n        fill=\"none\"\n        stroke=\"#eaf9ff\"\n        stroke-width=\"0.22\"\n        stroke-linecap=\"round\"\n        stroke-linejoin=\"round\"\n      />\n      <path\n        d=\"M -0.5 -0.4 L -1.1 0.2 L -1.7 0.4\"\n        fill=\"none\"\n        stroke=\"#d6f5ff\"\n        stroke-width=\"0.16\"\n        stroke-linecap=\"round\"\n      />\n      <path\n        d=\"M -0.2 0.5 L 0.4 0.0 L 1.0 -0.1\"\n        fill=\"none\"\n        stroke=\"#d6f5ff\"\n        stroke-width=\"0.16\"\n        stroke-linecap=\"round\"\n      />\n      <path\n        d=\"M 0.6 1.2 L 0.2 1.8\"\n        fill=\"none\"\n        stroke=\"#d6f5ff\"\n        stroke-width=\"0.14\"\n        stroke-linecap=\"round\"\n      />\n    </g>\n    <circle cx=\"1.3\" cy=\"-1.3\" r=\"0.6\" fill=\"#eaf9ff\" opacity=\"0.28\"/>\n  </g>\n\n  <path\n    id=\"collider\"\n    d=\"M 0 -3.4 L 2.4 -2.4 L 3.4 0 L 2.4 2.4 L 0 3.4 L -2.4 2.4 L -3.4 0 L -2.4 -2.4 Z\"\n    fill=\"none\"\n    stroke=\"none\"\n  />\n</svg>",
    "viewBox": {
      "minX": -8,
      "minY": -8,
      "width": 16,
      "height": 16
    },
    "colliderPathId": "collider",
    "colliderPath": "M 0 -3.4 L 2.4 -2.4 L 3.4 0 L 2.4 2.4 L 0 3.4 L -2.4 2.4 L -3.4 0 L -2.4 -2.4 Z",
    "colliderVertices": [
      {
        "x": 0,
        "y": -3.4
      },
      {
        "x": 2.4,
        "y": -2.4
      },
      {
        "x": 3.4,
        "y": 0
      },
      {
        "x": 2.4,
        "y": 2.4
      },
      {
        "x": 0,
        "y": 3.4
      },
      {
        "x": -2.4,
        "y": 2.4
      },
      {
        "x": -3.4,
        "y": 0
      },
      {
        "x": -2.4,
        "y": -2.4
      }
    ],
    "centerOfGravityLocal": {
      "x": 0,
      "y": -3.4
    },
    "renderScale": 1,
    "physicsScale": 1,
    "slotDefaults": {
      "slot-primary": "#00f0ff",
      "slot-secondary": "#0b1120",
      "slot-stroke": "#e8f5ff"
    }
  },
  {
    "id": "pilot_death_debris_shell_left",
    "svgTemplate": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-8 -8 16 16\" role=\"img\" aria-label=\"Pilot death debris shell left\">\n  <defs>\n    <linearGradient id=\"shellBodyGrad\" x1=\"0.12\" y1=\"0.06\" x2=\"0.92\" y2=\"0.94\">\n      <stop offset=\"0\" stop-color=\"var(--slot-primary, #00f0ff)\" stop-opacity=\"0.34\"/>\n      <stop offset=\"0.46\" stop-color=\"var(--slot-secondary, #141d2a)\" stop-opacity=\"1\"/>\n      <stop offset=\"1\" stop-color=\"#030a12\" stop-opacity=\"1\"/>\n    </linearGradient>\n    <linearGradient id=\"panelGlow\" x1=\"0\" y1=\"0.4\" x2=\"1\" y2=\"0.55\">\n      <stop offset=\"0\" stop-color=\"var(--slot-primary, #00f0ff)\" stop-opacity=\"0.30\"/>\n      <stop offset=\"1\" stop-color=\"var(--slot-primary, #00f0ff)\" stop-opacity=\"0.05\"/>\n    </linearGradient>\n  </defs>\n\n  <g id=\"visual\">\n    <path\n      d=\"M -5.8 -4.8 L 4.7 -5.3 L 4.1 -0.3 L 4.8 4.8 L -1.8 5.3 L -4.0 3.6 L -6.1 0.3 L -6.1 -3.5 Z\"\n      fill=\"url(#shellBodyGrad)\"\n      stroke=\"var(--slot-stroke, #cfe8ff)\"\n      stroke-width=\"1.05\"\n      stroke-linejoin=\"round\"\n      stroke-linecap=\"round\"\n    />\n    <path\n      d=\"M -4.8 -3.6 L 3.5 -4.0 L 3.0 -0.5 L 3.5 3.6 L -1.5 3.9 L -3.1 2.8 L -4.7 0.4 L -4.7 -2.3 Z\"\n      fill=\"url(#panelGlow)\"\n      opacity=\"0.85\"\n    />\n    <path\n      d=\"M -2.6 -2.4 L -1.5 -0.9 L -2.1 0.4 L -0.9 1.9 L -1.7 3.2\"\n      fill=\"none\"\n      stroke=\"#02060c\"\n      stroke-width=\"0.35\"\n      stroke-linecap=\"round\"\n      stroke-linejoin=\"round\"\n      opacity=\"0.95\"\n    />\n    <path\n      d=\"M -2.6 -2.4 L -1.5 -0.9 L -2.1 0.4 L -0.9 1.9 L -1.7 3.2\"\n      fill=\"none\"\n      stroke=\"#000000\"\n      stroke-width=\"0.16\"\n      stroke-linecap=\"round\"\n      stroke-linejoin=\"round\"\n      opacity=\"0.88\"\n    />\n  </g>\n\n  <path\n    id=\"collider\"\n    d=\"M -5.8 -4.8 L 4.7 -5.3 L 4.1 -0.3 L 4.8 4.8 L -1.8 5.3 L -4.0 3.6 L -6.1 0.3 L -6.1 -3.5 Z\"\n    fill=\"none\"\n    stroke=\"none\"\n  />\n</svg>",
    "viewBox": {
      "minX": -8,
      "minY": -8,
      "width": 16,
      "height": 16
    },
    "colliderPathId": "collider",
    "colliderPath": "M -5.8 -4.8 L 4.7 -5.3 L 4.1 -0.3 L 4.8 4.8 L -1.8 5.3 L -4.0 3.6 L -6.1 0.3 L -6.1 -3.5 Z",
    "colliderVertices": [
      {
        "x": -5.8,
        "y": -4.8
      },
      {
        "x": 4.7,
        "y": -5.3
      },
      {
        "x": 4.1,
        "y": -0.3
      },
      {
        "x": 4.8,
        "y": 4.8
      },
      {
        "x": -1.8,
        "y": 5.3
      },
      {
        "x": -4,
        "y": 3.6
      },
      {
        "x": -6.1,
        "y": 0.3
      },
      {
        "x": -6.1,
        "y": -3.5
      }
    ],
    "centerOfGravityLocal": {
      "x": -5.8,
      "y": -4.8
    },
    "renderScale": 1,
    "physicsScale": 1,
    "slotDefaults": {
      "slot-primary": "#00f0ff",
      "slot-secondary": "#141d2a",
      "slot-stroke": "#cfe8ff"
    }
  },
  {
    "id": "pilot_death_debris_shell_right",
    "svgTemplate": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-8 -8 16 16\" role=\"img\" aria-label=\"Pilot death debris shell right\">\n  <defs>\n    <linearGradient id=\"shellBodyGrad\" x1=\"0.10\" y1=\"0.08\" x2=\"0.92\" y2=\"0.92\">\n      <stop offset=\"0\" stop-color=\"var(--slot-primary, #00f0ff)\" stop-opacity=\"0.34\"/>\n      <stop offset=\"0.44\" stop-color=\"var(--slot-secondary, #162233)\" stop-opacity=\"1\"/>\n      <stop offset=\"1\" stop-color=\"#030a12\" stop-opacity=\"1\"/>\n    </linearGradient>\n    <linearGradient id=\"panelGlow\" x1=\"0.05\" y1=\"0.35\" x2=\"0.98\" y2=\"0.64\">\n      <stop offset=\"0\" stop-color=\"var(--slot-primary, #00f0ff)\" stop-opacity=\"0.30\"/>\n      <stop offset=\"1\" stop-color=\"var(--slot-primary, #00f0ff)\" stop-opacity=\"0.06\"/>\n    </linearGradient>\n  </defs>\n\n  <g id=\"visual\">\n    <path\n      d=\"M -4.9 -5.2 L 2.0 -5.4 L 4.9 -1.6 L 5.6 1.5 L 3.8 4.1 L 1.2 5.6 L -2.0 5.4 L -4.7 4.9 L -4.2 0.2 L -4.7 -2.1 Z\"\n      fill=\"url(#shellBodyGrad)\"\n      stroke=\"var(--slot-stroke, #cfe8ff)\"\n      stroke-width=\"1.05\"\n      stroke-linejoin=\"round\"\n      stroke-linecap=\"round\"\n    />\n    <path\n      d=\"M -3.9 -3.9 L 1.4 -4.0 L 3.9 -1.0 L 4.5 1.2 L 3.1 3.3 L 1.1 4.4 L -1.4 4.2 L -3.8 3.7 L -3.5 0.3 L -3.8 -1.8 Z\"\n      fill=\"url(#panelGlow)\"\n      opacity=\"0.86\"\n    />\n  </g>\n\n  <path\n    id=\"collider\"\n    d=\"M -4.9 -5.2 L 2.0 -5.4 L 4.9 -1.6 L 5.6 1.5 L 3.8 4.1 L 1.2 5.6 L -2.0 5.4 L -4.7 4.9 L -4.2 0.2 L -4.7 -2.1 Z\"\n    fill=\"none\"\n    stroke=\"none\"\n  />\n</svg>",
    "viewBox": {
      "minX": -8,
      "minY": -8,
      "width": 16,
      "height": 16
    },
    "colliderPathId": "collider",
    "colliderPath": "M -4.9 -5.2 L 2.0 -5.4 L 4.9 -1.6 L 5.6 1.5 L 3.8 4.1 L 1.2 5.6 L -2.0 5.4 L -4.7 4.9 L -4.2 0.2 L -4.7 -2.1 Z",
    "colliderVertices": [
      {
        "x": -4.9,
        "y": -5.2
      },
      {
        "x": 2,
        "y": -5.4
      },
      {
        "x": 4.9,
        "y": -1.6
      },
      {
        "x": 5.6,
        "y": 1.5
      },
      {
        "x": 3.8,
        "y": 4.1
      },
      {
        "x": 1.2,
        "y": 5.6
      },
      {
        "x": -2,
        "y": 5.4
      },
      {
        "x": -4.7,
        "y": 4.9
      },
      {
        "x": -4.2,
        "y": 0.2
      },
      {
        "x": -4.7,
        "y": -2.1
      }
    ],
    "centerOfGravityLocal": {
      "x": -4.9,
      "y": -5.2
    },
    "renderScale": 1,
    "physicsScale": 1,
    "slotDefaults": {
      "slot-primary": "#00f0ff",
      "slot-secondary": "#162233",
      "slot-stroke": "#cfe8ff"
    }
  },
  {
    "id": "pilot_death_debris_core",
    "svgTemplate": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-6 -6 12 12\" role=\"img\" aria-label=\"Pilot death debris core\">\n  <defs>\n    <radialGradient id=\"coreGlow\" cx=\"50%\" cy=\"50%\" r=\"65%\">\n      <stop offset=\"0\" stop-color=\"var(--slot-primary, #00f0ff)\" stop-opacity=\"1\"/>\n      <stop offset=\"1\" stop-color=\"var(--slot-primary, #00f0ff)\" stop-opacity=\"0.58\"/>\n    </radialGradient>\n  </defs>\n\n  <g id=\"visual\">\n    <polygon\n      points=\"0,-2.9 2.8,0 0,2.9 -3.0,0\"\n      fill=\"url(#coreGlow)\"\n      stroke=\"var(--slot-stroke, #e9fcff)\"\n      stroke-width=\"0.8\"\n      stroke-linejoin=\"round\"\n    />\n    <polygon\n      points=\"0,-1.8 1.8,0 0,1.8 -1.9,0\"\n      fill=\"var(--slot-secondary, #05131d)\"\n      opacity=\"0.25\"\n    />\n  </g>\n\n  <path\n    id=\"collider\"\n    d=\"M 0 -2.9 L 2.8 0 L 0 2.9 L -3.0 0 Z\"\n    fill=\"none\"\n    stroke=\"none\"\n  />\n</svg>",
    "viewBox": {
      "minX": -6,
      "minY": -6,
      "width": 12,
      "height": 12
    },
    "colliderPathId": "collider",
    "colliderPath": "M 0 -2.9 L 2.8 0 L 0 2.9 L -3.0 0 Z",
    "colliderVertices": [
      {
        "x": 0,
        "y": -2.9
      },
      {
        "x": 2.8,
        "y": 0
      },
      {
        "x": 0,
        "y": 2.9
      },
      {
        "x": -3,
        "y": 0
      }
    ],
    "centerOfGravityLocal": {
      "x": 0,
      "y": -2.9
    },
    "renderScale": 1,
    "physicsScale": 1,
    "slotDefaults": {
      "slot-primary": "#00f0ff",
      "slot-secondary": "#05131d",
      "slot-stroke": "#e9fcff"
    }
  }
] as const;
