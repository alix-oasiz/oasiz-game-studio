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

function createCloudTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.clearRect(0, 0, size, size);
  const blobs = [
    { x: 46, y: 66, r: 28 },
    { x: 73, y: 55, r: 26 },
    { x: 86, y: 72, r: 23 },
    { x: 30, y: 78, r: 20 },
  ];
  for (const blob of blobs) {
    const grad = ctx.createRadialGradient(
      blob.x,
      blob.y,
      4,
      blob.x,
      blob.y,
      blob.r,
    );
    grad.addColorStop(0, "rgba(255, 255, 255, 0.96)");
    grad.addColorStop(0.75, "rgba(246, 251, 255, 0.72)");
    grad.addColorStop(1, "rgba(237, 246, 255, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(blob.x, blob.y, blob.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function addCloudBackdrop(input: AddCloudBackdropInput): number {
  if (input.agentDebugHideClouds) {
    return 0;
  }

  const cloudGroup = new THREE.Group();
  const cloudTexture = createCloudTexture();
  const cloudMaterial = new THREE.SpriteMaterial({
    map: cloudTexture,
    color: "#ffffff",
    transparent: true,
    opacity: 0.93,
    depthWrite: false,
    depthTest: true,
    fog: true,
  });

  const cloudTopCapY = input.trackYReference - 4;
  const lowerCloudBaseY = Math.min(input.trackYReference - 64, input.minTrackY - 22);
  const zTop = Math.max(input.cloudZStart, input.cloudZEnd);
  const zBottom = Math.min(input.cloudZStart, input.cloudZEnd);
  const laneSpan = Math.max(1, zTop - zBottom);
  const laneSteps = Math.max(32, Math.floor(laneSpan / 10));

  const tryPlaceCloud = (
    centerX: number,
    centerZ: number,
    scale: number,
    localTrackY: number,
    yBase: number,
    yJitter: number,
    topCapY: number,
  ): void => {
    const sprite = new THREE.Sprite(cloudMaterial);
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
    sprite.position.set(x, y, z);
    sprite.scale.set(scale * 1.3, scale, 1);
    cloudGroup.add(sprite);
  };

  for (let i = 0; i < laneSteps; i += 1) {
    const t = i / Math.max(1, laneSteps - 1);
    const z = THREE.MathUtils.lerp(zTop, zBottom, t);
    const centerX = input.sampleTrackX(z);
    const width = input.getSliceWidthAtZ(z);
    const localTrackY = input.getTrackSurfaceY(z);
    const sideCloudTopCapY = localTrackY + 48;
    const deepSideCloudTopCapY = localTrackY + 36;
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
      input.randomRange(-12, 8),
      sideCloudTopCapY,
    );
    tryPlaceCloud(
      rightWallX,
      z + input.randomRange(-7, 7),
      wallScaleB,
      localTrackY,
      localTrackY + 18,
      input.randomRange(-12, 8),
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
      input.randomRange(-14, 8),
      deepSideCloudTopCapY,
    );
    tryPlaceCloud(
      rightDepthX,
      z + input.randomRange(-10, 10),
      input.randomRange(64, 116),
      localTrackY,
      localTrackY + 8,
      input.randomRange(-14, 8),
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

  input.addLevelObject(cloudGroup);
  const placedCount = cloudGroup.children.length;
  console.log("[AddCloudBackdrop]", "Placed cloud sprites: " + String(placedCount));
  return placedCount;
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
