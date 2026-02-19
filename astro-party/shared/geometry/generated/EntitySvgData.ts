// AUTO-GENERATED FILE. DO NOT EDIT.
// Source: shared/assets/entities/*.svg + shared/geometry/entityAssets.manifest.json
// Run: bun run generate:entities

export interface ShapePoint {
  x: number;
  y: number;
}

export interface GeneratedEntitySvgData {
  id: string;
  svgTemplate: string;
  viewBox: { minX: number; minY: number; width: number; height: number };
  colliderPathId: string;
  colliderPath: string;
  colliderVertices: ReadonlyArray<ShapePoint>;
  renderScale: number;
  physicsScale: number;
  slotDefaults: Readonly<Record<string, string>>;
}

export const GENERATED_ENTITY_SVG_DATA = [
  {
    "id": "ship",
    "svgTemplate": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-20 -20 40 40\" role=\"img\" aria-label=\"Astro Party ship\">\r\n  <defs>\r\n    <style>\r\n      .slot-primary { fill: var(--slot-primary, #00f0ff); }\r\n      .slot-secondary { fill: var(--slot-secondary, #ffffff); }\r\n      .slot-tertiary { fill: var(--slot-tertiary, #ff4400); }\r\n      .slot-stroke { stroke: var(--slot-stroke, #ffffff); }\r\n    </style>\r\n  </defs>\r\n\r\n  <g id=\"visual\" transform=\"translate(0 0)\">\r\n    <!-- Engine flame -->\r\n    <path class=\"slot-tertiary\" d=\"M -6 0 L -10 -4 L -15 0 L -10 4 Z\" />\r\n\r\n    <!-- Ship hull (matches current rendered physics hull) -->\r\n    <path\r\n      class=\"slot-primary slot-stroke\"\r\n      d=\"M 17 0 L -8.5 9 L -8.5 -9 Z\"\r\n      stroke-width=\"1.8\"\r\n      stroke-linejoin=\"round\"\r\n    />\r\n\r\n    <!-- Cockpit -->\r\n    <circle class=\"slot-secondary\" cx=\"3\" cy=\"0\" r=\"3.4\" />\r\n  </g>\r\n\r\n  <!-- Canonical collider path for extractor tooling -->\r\n  <path id=\"collider\" d=\"M 17 0 L -8.5 9 L -8.5 -9 Z\" fill=\"none\" stroke=\"none\" />\r\n</svg>",
    "viewBox": {
      "minX": -20,
      "minY": -20,
      "width": 40,
      "height": 40
    },
    "colliderPathId": "collider",
    "colliderPath": "M 17 0 L -8.5 9 L -8.5 -9 Z",
    "colliderVertices": [
      {
        "x": 17,
        "y": 0
      },
      {
        "x": -8.5,
        "y": 9
      },
      {
        "x": -8.5,
        "y": -9
      }
    ],
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
    "svgTemplate": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"-18 -18 36 36\" role=\"img\" aria-label=\"Astro Party pilot\">\r\n  <defs>\r\n    <style>\r\n      .slot-primary { fill: var(--slot-primary, #00f0ff); }\r\n      .slot-secondary { fill: var(--slot-secondary, #f5f5f5); }\r\n      .slot-tertiary { fill: var(--slot-tertiary, #d6d6d6); }\r\n      .slot-outline { fill: var(--slot-outline, #ffffff); }\r\n    </style>\r\n  </defs>\r\n\r\n  <g id=\"visual\" transform=\"translate(0 0)\">\r\n    <!-- Backpack -->\r\n    <rect class=\"slot-tertiary\" x=\"-12.4\" y=\"-3.8\" width=\"4.2\" height=\"7.6\" rx=\"1.2\" ry=\"1.2\" />\r\n\r\n    <!-- Suit body -->\r\n    <path\r\n      class=\"slot-primary\"\r\n      d=\"M -10 -4.8 L 2.8 -4.8 Q 3.9 -4.8 4.6 -3.9 L 5.4 -2.6 L 5.4 2.6 L 4.6 3.9 Q 3.9 4.8 2.8 4.8 L -10 4.8 Q -11.2 4.8 -11.2 3.6 L -11.2 -3.6 Q -11.2 -4.8 -10 -4.8 Z\"\r\n    />\r\n\r\n    <!-- Helmet -->\r\n    <circle class=\"slot-secondary\" cx=\"7.6\" cy=\"0\" r=\"4.8\" />\r\n\r\n    <!-- Bright front visor marker for direction -->\r\n    <path class=\"slot-outline\" d=\"M 6 -2.2 L 9.6 0 L 6 2.2 Z\" />\r\n\r\n    <!-- Suit seam -->\r\n    <rect class=\"slot-tertiary\" x=\"-3.2\" y=\"-3.4\" width=\"1.8\" height=\"6.8\" rx=\"0.8\" ry=\"0.8\" />\r\n  </g>\r\n\r\n  <!-- Canonical collider path for extractor tooling -->\r\n  <path\r\n    id=\"collider\"\r\n    d=\"M -12.4 -3.8 L -11.2 -4.8 L 2.8 -4.8 L 4.8 -4.4 L 7.6 -4.8 L 10.2 -4 L 12 -2.2 L 12.4 0 L 12 2.2 L 10.2 4 L 7.6 4.8 L 4.8 4.4 L 2.8 4.8 L -11.2 4.8 L -12.4 3.8 Z\"\r\n    fill=\"none\"\r\n    stroke=\"none\"\r\n  />\r\n</svg>",
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
