// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: shared/assets/entities/*.svg + shared/geometry/entityAssets.manifest.json
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

export interface GeneratedEntityRenderMeta {
  trail?: GeneratedEntityTrailMeta;
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
    "svgTemplate": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-20 -20 40 40\" role=\"img\" aria-label=\"Ship (vertical squash)\">\n  <defs>\n    <style>\n      .slot-secondary { fill: var(--slot-secondary, #ffffff); }\n      .slot-stroke { stroke: var(--slot-stroke, #ffffff); }\n      .stop-primary { stop-color: var(--slot-primary, #00f0ff); }\n      .stop-dark { stop-color: #07121a; }\n    </style>\n\n    <linearGradient id=\"hullGrad\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n      <stop offset=\"0\" class=\"stop-primary\" stop-opacity=\"0.95\"/>\n      <stop offset=\"0.60\" class=\"stop-primary\" stop-opacity=\"0.60\"/>\n      <stop offset=\"1\" class=\"stop-dark\" stop-opacity=\"0.95\"/>\n    </linearGradient>\n\n    <linearGradient id=\"wingGrad\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">\n      <stop offset=\"0\" class=\"stop-primary\" stop-opacity=\"0.85\"/>\n      <stop offset=\"1\" class=\"stop-dark\" stop-opacity=\"0.95\"/>\n    </linearGradient>\n\n    <radialGradient id=\"coreGlow\" cx=\"50%\" cy=\"50%\" r=\"50%\">\n      <stop offset=\"0\" class=\"stop-primary\" stop-opacity=\"1.0\"/>\n      <stop offset=\"45%\" class=\"stop-primary\" stop-opacity=\"0.55\"/>\n      <stop offset=\"100%\" class=\"stop-primary\" stop-opacity=\"0\"/>\n    </radialGradient>\n\n    <filter id=\"softGlow\" x=\"-50%\" y=\"-50%\" width=\"200%\" height=\"200%\">\n      <feGaussianBlur stdDeviation=\"1.25\" result=\"b\"/>\n      <feMerge>\n        <feMergeNode in=\"b\"/>\n        <feMergeNode in=\"SourceGraphic\"/>\n      </feMerge>\n    </filter>\n  </defs>\n\n  <metadata id=\"render-meta\">\n{\n  \"trail\": {\n    \"anchor\": { \"x\": -9.2, \"y\": 0.0 },\n    \"maxAgeSec\": 4.0,\n    \"startRadius\": 10.5,\n    \"endRadius\": 2.2,\n    \"alpha\": 0.48,\n    \"blur\": 14.0,\n    \"sampleIntervalSec\": 0.04,\n    \"minSampleDistance\": 0.7\n  }\n}\n  </metadata>\n\n  <!-- scale(1 0.8) is applied AFTER rotate => squashes screen-vertical -->\n  <g id=\"visual\" filter=\"url(#softGlow)\" transform=\"scale(1 0.8) rotate(90) scale(0.35) translate(-0.25 -4.5)\">\n    <circle cx=\"0\" cy=\"30\" r=\"28\" fill=\"url(#coreGlow)\"/>\n\n    <polygon\n      points=\"-32.9,27.1 -49.9,22.7 -33.6,10.5 -19.2,23.0\"\n      fill=\"url(#wingGrad)\"\n      class=\"slot-stroke\"\n      stroke-width=\"3\"\n      stroke-linejoin=\"round\"\n    />\n    <polygon\n      points=\"36.2,27.1 50.4,23.0 34.3,10.3 19.3,22.4\"\n      fill=\"url(#wingGrad)\"\n      class=\"slot-stroke\"\n      stroke-width=\"3\"\n      stroke-linejoin=\"round\"\n    />\n\n    <polygon\n      points=\"0,-32 37,3 16,18 -16,18 -37,3\"\n      fill=\"url(#hullGrad)\"\n      class=\"slot-stroke\"\n      stroke-width=\"3\"\n      stroke-linejoin=\"round\"\n    />\n\n    <polygon points=\"0,-22 26,4 0,16\" fill=\"#000\" opacity=\"0.18\"/>\n    <polygon points=\"0,-22 -26,4 0,16\" fill=\"#000\" opacity=\"0.10\"/>\n    <polygon points=\"-16,18 0,16 16,18 0,10\" fill=\"#000\" opacity=\"0.12\"/>\n\n    <polygon points=\"0,-24 15,-11 0,-7 -15,-11\" fill=\"#07121a\" opacity=\"0.85\"/>\n    <path class=\"slot-secondary\" d=\"M -16 -14 L 0 -28 L 16 -14 L 12 -10 L 0 -20 L -12 -10 Z\" opacity=\"0.95\"/>\n\n    <polygon\n      points=\"0,34 13,24 0,14 -13,24\"\n      fill=\"var(--slot-primary, #00f0ff)\"\n      opacity=\"0.35\"\n      class=\"slot-stroke\"\n      stroke-width=\"3\"\n      stroke-linejoin=\"round\"\n    />\n    <polygon\n      points=\"0,31 9,24 0,17 -9,24\"\n      fill=\"var(--slot-primary, #00f0ff)\"\n      opacity=\"0.55\"\n    />\n  </g>\n\n  <path\n    id=\"collider\"\n    d=\"M 12.775 -0.07 L 0.525 10.29 L -6.475 14.042 L -10.325 -0.07 L -6.37 -14.042 L 0.525 -10.43 Z\"\n    fill=\"none\"\n    stroke=\"none\"\n  />\n</svg>",
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
      }
    },
    "renderScale": 1,
    "physicsScale": 1,
    "slotDefaults": {
      "slot-primary": "#00f0ff",
      "slot-secondary": "#ffffff",
      "slot-tertiary": "#ff4400",
      "slot-stroke": "#ffffff"
    }
  },
  {
    "id": "pilot",
    "svgTemplate": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-18 -18 36 36\" role=\"img\" aria-label=\"Astro Party pilot\">\n  <defs>\n    <style>\n      .slot-primary { fill: var(--slot-primary, #00f0ff); }\n      .slot-secondary { fill: var(--slot-secondary, #f5f5f5); }\n      .slot-tertiary { fill: var(--slot-tertiary, #d6d6d6); }\n      .slot-outline { fill: var(--slot-outline, #ffffff); }\n    </style>\n  </defs>\n\n  <g id=\"visual\" transform=\"translate(0 0)\">\n    <!-- Backpack -->\n    <rect class=\"slot-tertiary\" x=\"-12.4\" y=\"-3.8\" width=\"4.2\" height=\"7.6\" rx=\"1.2\" ry=\"1.2\" />\n\n    <!-- Suit body -->\n    <path\n      class=\"slot-primary\"\n      d=\"M -10 -4.8 L 2.8 -4.8 Q 3.9 -4.8 4.6 -3.9 L 5.4 -2.6 L 5.4 2.6 L 4.6 3.9 Q 3.9 4.8 2.8 4.8 L -10 4.8 Q -11.2 4.8 -11.2 3.6 L -11.2 -3.6 Q -11.2 -4.8 -10 -4.8 Z\"\n    />\n\n    <!-- Helmet -->\n    <circle class=\"slot-secondary\" cx=\"7.6\" cy=\"0\" r=\"4.8\" />\n\n    <!-- Bright front visor marker for direction -->\n    <path class=\"slot-outline\" d=\"M 6 -2.2 L 9.6 0 L 6 2.2 Z\" />\n\n    <!-- Suit seam -->\n    <rect class=\"slot-tertiary\" x=\"-3.2\" y=\"-3.4\" width=\"1.8\" height=\"6.8\" rx=\"0.8\" ry=\"0.8\" />\n  </g>\n\n  <!-- Canonical collider path for extractor tooling -->\n  <path\n    id=\"collider\"\n    d=\"M -12.4 -3.8 L -11.2 -4.8 L 2.8 -4.8 L 4.8 -4.4 L 7.6 -4.8 L 10.2 -4 L 12 -2.2 L 12.4 0 L 12 2.2 L 10.2 4 L 7.6 4.8 L 4.8 4.4 L 2.8 4.8 L -11.2 4.8 L -12.4 3.8 Z\"\n    fill=\"none\"\n    stroke=\"none\"\n  />\n</svg>",
    "viewBox": {
      "minX": -18,
      "minY": -18,
      "width": 36,
      "height": 36
    },
    "colliderPathId": "collider",
    "colliderPath": "M -12.4 -3.8 L -11.2 -4.8 L 2.8 -4.8 L 4.8 -4.4 L 7.6 -4.8 L 10.2 -4 L 12 -2.2 L 12.4 0 L 12 2.2 L 10.2 4 L 7.6 4.8 L 4.8 4.4 L 2.8 4.8 L -11.2 4.8 L -12.4 3.8 Z",
    "colliderVertices": [
      {
        "x": -12.4,
        "y": -3.8
      },
      {
        "x": -11.2,
        "y": -4.8
      },
      {
        "x": 2.8,
        "y": -4.8
      },
      {
        "x": 4.8,
        "y": -4.4
      },
      {
        "x": 7.6,
        "y": -4.8
      },
      {
        "x": 10.2,
        "y": -4
      },
      {
        "x": 12,
        "y": -2.2
      },
      {
        "x": 12.4,
        "y": 0
      },
      {
        "x": 12,
        "y": 2.2
      },
      {
        "x": 10.2,
        "y": 4
      },
      {
        "x": 7.6,
        "y": 4.8
      },
      {
        "x": 4.8,
        "y": 4.4
      },
      {
        "x": 2.8,
        "y": 4.8
      },
      {
        "x": -11.2,
        "y": 4.8
      },
      {
        "x": -12.4,
        "y": 3.8
      }
    ],
    "centerOfGravityLocal": {
      "x": -12.4,
      "y": -3.8
    },
    "renderScale": 1,
    "physicsScale": 1,
    "slotDefaults": {
      "slot-primary": "#00f0ff",
      "slot-secondary": "#f5f5f5",
      "slot-tertiary": "#d6d6d6",
      "slot-outline": "#dcdcdc"
    }
  }
] as const;
