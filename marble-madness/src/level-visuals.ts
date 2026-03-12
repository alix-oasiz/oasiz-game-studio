import * as THREE from "three";

export interface FireworkRow {
  activationZ: number;
  burstPoints: THREE.Vector3[];
  triggered: boolean;
}

interface AddCloudBackdropInput {
  agentDebugHideClouds: boolean;
  minTrackY: number;
  trackYReference: number;
  cloudZStart: number;
  cloudZEnd: number;
  randomRange: (min: number, max: number) => number;
  isCloudPlacementBlocked: (x: number, z: number, cloudRadius: number) => boolean;
  sampleTrackX: (z: number) => number;
  getSliceWidthAtZ: (z: number) => number;
  getTrackSurfaceY: (z: number) => number;
  addLevelObject: (object: THREE.Object3D) => void;
}

interface AddFinishTriggerCubesInput {
  trackMaterial: THREE.MeshStandardMaterial;
  fireworkTriggerZ: number;
  wallThickness: number;
  getSliceWidthAtZ: (z: number) => number;
  sampleTrackX: (z: number) => number;
  getTrackSurfaceY: (z: number) => number;
  addLevelObject: (object: THREE.Object3D) => void;
}

// Relative offsets within a cloud cluster: [relX, relY, relZ, scaleMult]
// Multiple overlapping puffs per cloud create soft volumetric depth illusion.
const PUFF_TEMPLATES: [number, number, number, number][] = [
  [0.0,   0.0,  0.0, 1.0],   // main center puff
  [-0.18, -0.06, 0.0, 0.78], // lower-left puff
  [0.18,  -0.06, 0.0, 0.74], // lower-right puff
  [0.04,   0.18, 0.0, 0.62], // top accent puff
];

// Billboarding vertex shader: expands each plane toward camera-right/camera-up
// using the instance's world position and scale from instanceMatrix.
const CLOUD_VERT = `
varying vec2 vUv;
varying float vFogDepth;

void main() {
  vec3 instancePos = vec3(
    instanceMatrix[3][0],
    instanceMatrix[3][1],
    instanceMatrix[3][2]
  );
  float scaleX = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
  float scaleY = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));

  // Billboard: orient quad toward camera by expanding along view-space axes.
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

  vec3 worldPos = instancePos
    + camRight * position.x * scaleX
    + camUp    * position.y * scaleY;

  vec4 mvPosition = viewMatrix * vec4(worldPos, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  vFogDepth = -mvPosition.z;
}
`;

// Fragment shader: samples the puff texture and applies linear fog.
// fogColor/fogNear/fogFar are automatically updated by Three.js when fog: true.
const CLOUD_FRAG = `
uniform sampler2D map;
uniform float opacity;
uniform vec3 fogColor;
uniform float fogNear;
uniform float fogFar;

varying vec2 vUv;
varying float vFogDepth;

void main() {
  vec4 texColor = texture2D(map, vUv);
  float alpha = texColor.a * opacity;
  if (alpha < 0.04) discard;
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  vec3 color = mix(texColor.rgb, fogColor, fogFactor);
  gl_FragColor = vec4(color, alpha);
}
`;

function createPuffTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.clearRect(0, 0, size, size);

  const cx = 64;
  const cy = 64;

  // Main puff body: bright white core fading to soft blue-grey edge.
  // Focal point offset upward gives a top-lit appearance without real-time lighting.
  // Pure white throughout — no colour tinting in any stop.
  // Coloured semi-transparent outer regions accumulate visibly across hundreds
  // of overlapping puffs and create dark arc halos. Pure white accumulation
  // just adds brightness, which reads naturally as denser cloud.
  // Top-lit appearance comes from the focal-point offset alone.
  const bodyGrad = ctx.createRadialGradient(cx, cy - 10, 2, cx, cy, 46);
  bodyGrad.addColorStop(0.0,  "rgba(255, 255, 255, 0.97)");
  bodyGrad.addColorStop(0.30, "rgba(255, 255, 255, 0.88)");
  bodyGrad.addColorStop(0.55, "rgba(255, 255, 255, 0.55)");
  bodyGrad.addColorStop(0.75, "rgba(255, 255, 255, 0.14)");
  bodyGrad.addColorStop(0.90, "rgba(255, 255, 255, 0.02)");
  bodyGrad.addColorStop(1.0,  "rgba(255, 255, 255, 0.00)");
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 46, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Disable mipmaps: mipmap generation bleeds opaque color into transparent
  // corner pixels, producing faint rectangular fringing at close range.
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

export function addCloudBackdrop(input: AddCloudBackdropInput): number {
  if (input.agentDebugHideClouds) {
    return 0;
  }

  const puffTexture = createPuffTexture();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: puffTexture },
      opacity: { value: 0.93 },
      fogColor: { value: new THREE.Color(0xffffff) },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
    },
    vertexShader: CLOUD_VERT,
    fragmentShader: CLOUD_FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
  });

  const cloudTopCapY = input.trackYReference - 4;
  const lowerCloudBaseY = Math.min(input.trackYReference - 64, input.minTrackY - 22);
  const zTop = Math.max(input.cloudZStart, input.cloudZEnd);
  const zBottom = Math.min(input.cloudZStart, input.cloudZEnd);
  const laneSpan = Math.max(1, zTop - zBottom);
  const laneSteps = Math.max(32, Math.floor(laneSpan / 10));

  interface PuffData {
    x: number;
    y: number;
    z: number;
    scaleX: number;
    scaleY: number;
  }
  const puffs: PuffData[] = [];

  const tryPlaceCloud = (
    centerX: number,
    centerZ: number,
    scale: number,
    localTrackY: number,
    yBase: number,
    yJitter: number,
    topCapY: number,
  ): void => {
    const maxCenterY = topCapY - scale * 0.5;
    const y = THREE.MathUtils.clamp(
      yBase + yJitter,
      localTrackY - 80,
      maxCenterY,
    );
    const cloudRadius = scale * 0.42;
    let x = centerX;
    let z = centerZ;
    let placed = !input.isCloudPlacementBlocked(x, z, cloudRadius);
    for (let attempt = 0; attempt < 8 && !placed; attempt += 1) {
      x = centerX + input.randomRange(-18, 18);
      z = centerZ + input.randomRange(-10, 10);
      placed = !input.isCloudPlacementBlocked(x, z, cloudRadius);
    }
    if (!placed) {
      return;
    }
    for (const [rx, ry, rz, sm] of PUFF_TEMPLATES) {
      puffs.push({
        x: x + rx * scale,
        y: y + ry * scale,
        z: z + rz * scale * 0.25,
        scaleX: scale * sm * 1.3,
        scaleY: scale * sm,
      });
    }
  };

  for (let i = 0; i < laneSteps; i += 1) {
    const t = i / Math.max(1, laneSteps - 1);
    const z = THREE.MathUtils.lerp(zTop, zBottom, t);
    const centerX = input.sampleTrackX(z);
    const width = input.getSliceWidthAtZ(z);
    const localTrackY = input.getTrackSurfaceY(z);
    const sideCloudTopCapY = localTrackY + 72;
    const deepSideCloudTopCapY = localTrackY + 58;
    const valleyCloudTopCapY = localTrackY - 6;
    const valleyHalfWidth = width * 0.5 + 18;

    const leftWallX =
      centerX - valleyHalfWidth - input.randomRange(8, 30);
    const rightWallX =
      centerX + valleyHalfWidth + input.randomRange(8, 30);
    const wallScaleA = input.randomRange(48, 92);
    const wallScaleB = input.randomRange(48, 92);

    tryPlaceCloud(
      leftWallX,
      z + input.randomRange(-7, 7),
      wallScaleA,
      localTrackY,
      localTrackY + 18,
      input.randomRange(-22, 28),
      sideCloudTopCapY,
    );
    tryPlaceCloud(
      rightWallX,
      z + input.randomRange(-7, 7),
      wallScaleB,
      localTrackY,
      localTrackY + 18,
      input.randomRange(-22, 28),
      sideCloudTopCapY,
    );

    // Depth fill behind side walls to avoid big empty gaps.
    const leftDepthX =
      centerX - valleyHalfWidth - input.randomRange(52, 132);
    const rightDepthX =
      centerX + valleyHalfWidth + input.randomRange(52, 132);
    tryPlaceCloud(
      leftDepthX,
      z + input.randomRange(-10, 10),
      input.randomRange(64, 116),
      localTrackY,
      localTrackY + 8,
      input.randomRange(-20, 24),
      deepSideCloudTopCapY,
    );
    tryPlaceCloud(
      rightDepthX,
      z + input.randomRange(-10, 10),
      input.randomRange(64, 116),
      localTrackY,
      localTrackY + 8,
      input.randomRange(-20, 24),
      deepSideCloudTopCapY,
    );

    // Lower valley bed clouds to keep some volume below the play lane.
    if (i % 2 === 0) {
      const floorX = centerX + input.randomRange(-42, 42);
      tryPlaceCloud(
        floorX,
        z + input.randomRange(-9, 9),
        input.randomRange(96, 156),
        localTrackY,
        Math.min(lowerCloudBaseY, localTrackY - 42),
        input.randomRange(-12, 10),
        Math.min(cloudTopCapY, valleyCloudTopCapY),
      );
    }
  }

  if (puffs.length === 0) {
    return 0;
  }

  // All puffs rendered as one InstancedMesh — single draw call regardless of count.
  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, material, puffs.length);
  // Disable frustum culling: clouds span the entire level, so Three.js's
  // bounding-box check would incorrectly cull them from some camera angles.
  mesh.frustumCulled = false;

  const dummy = new THREE.Object3D();
  for (let i = 0; i < puffs.length; i += 1) {
    const p = puffs[i];
    dummy.position.set(p.x, p.y, p.z);
    dummy.scale.set(p.scaleX, p.scaleY, 1);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  input.addLevelObject(mesh);
  const cloudCount = Math.floor(puffs.length / PUFF_TEMPLATES.length);
  console.log(
    "[AddCloudBackdrop]",
    `Placed ${String(cloudCount)} clouds (${String(puffs.length)} puffs, 1 draw call)`,
  );
  return cloudCount;
}

export function addFinishTriggerCubes(
  input: AddFinishTriggerCubesInput,
): FireworkRow[] {
  const cubeMaterial = input.trackMaterial.clone();
  cubeMaterial.emissive = new THREE.Color("#29456a");
  cubeMaterial.emissiveIntensity = 0.22;
  cubeMaterial.roughness = 0.62;
  cubeMaterial.metalness = 0.04;
  const platformWidth = input.getSliceWidthAtZ(input.fireworkTriggerZ);
  const cubeOffsetX = platformWidth * 0.5 + input.wallThickness + 1.4;
  const columnHeight = 4.0;
  const rowOffsets = [10, 0, -10];
  const rows: FireworkRow[] = [];

  for (const rowOffset of rowOffsets) {
    const z = input.fireworkTriggerZ + rowOffset;
    const centerX = input.sampleTrackX(z);
    const y = input.getTrackSurfaceY(z) + columnHeight * 0.5;
    const rowBurstPoints: THREE.Vector3[] = [];
    const leftColumn = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, columnHeight, 1.6),
      cubeMaterial,
    );
    leftColumn.position.set(centerX - cubeOffsetX, y, z);
    input.addLevelObject(leftColumn);
    rowBurstPoints.push(
      new THREE.Vector3(centerX - cubeOffsetX, y + columnHeight * 0.52, z),
    );

    const rightColumn = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, columnHeight, 1.6),
      cubeMaterial,
    );
    rightColumn.position.set(centerX + cubeOffsetX, y, z);
    input.addLevelObject(rightColumn);
    rowBurstPoints.push(
      new THREE.Vector3(centerX + cubeOffsetX, y + columnHeight * 0.52, z),
    );

    const plankWidth = cubeOffsetX * 2 + 2.0;
    const plankHeight = 0.7;
    const plankDepth = 2.0;
    const plank = new THREE.Mesh(
      new THREE.BoxGeometry(plankWidth, plankHeight, plankDepth),
      cubeMaterial,
    );
    plank.position.set(
      centerX,
      input.getTrackSurfaceY(z) - (plankHeight * 0.5 + 0.45),
      z,
    );
    input.addLevelObject(plank);

    rows.push({
      activationZ: z,
      burstPoints: rowBurstPoints,
      triggered: false,
    });
  }

  console.log(
    "[AddFinishTriggerCubes]",
    "Added 3-row edge columns for confetti triggers",
  );
  return rows;
}
