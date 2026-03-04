import * as THREE from "three";

export interface FireworkRow {
  activationZ: number;
  burstPoints: THREE.Vector3[];
  triggered: boolean;
}

interface AddCloudBackdropInput {
  agentDebugHideClouds: boolean;
  minTrackY: number;
  randomRange: (min: number, max: number) => number;
  isCloudPlacementBlocked: (x: number, z: number, cloudRadius: number) => boolean;
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

export function addCloudBackdrop(input: AddCloudBackdropInput): void {
  if (input.agentDebugHideClouds) {
    return;
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

  const cloudCeilingY = input.minTrackY - 12;
  const baseCloudY = input.minTrackY - 52;
  const cloudClusters = [
    { x: -240, yOffset: 8, z: -30, count: 2, spreadX: 90, spreadY: 12, spreadZ: 70 },
    { x: 246, yOffset: 12, z: -88, count: 2, spreadX: 94, spreadY: 12, spreadZ: 72 },
    { x: -236, yOffset: 4, z: -170, count: 2, spreadX: 96, spreadY: 13, spreadZ: 78 },
    { x: 238, yOffset: 10, z: -236, count: 2, spreadX: 92, spreadY: 12, spreadZ: 74 },
    { x: 0, yOffset: -10, z: -140, count: 3, spreadX: 230, spreadY: 14, spreadZ: 210 },
  ];

  for (const cluster of cloudClusters) {
    for (let i = 0; i < cluster.count; i += 1) {
      const sprite = new THREE.Sprite(cloudMaterial);
      const scale = input.randomRange(200, 360);
      // Keep the full billboard below the track, not just its center point.
      const maxCenterY = cloudCeilingY - scale * 0.5;
      const candidateY =
        baseCloudY +
        cluster.yOffset +
        input.randomRange(-cluster.spreadY, cluster.spreadY);
      const cloudRadius = scale * 0.7;
      let posX = cluster.x + input.randomRange(-cluster.spreadX, cluster.spreadX);
      let posZ = cluster.z + input.randomRange(-cluster.spreadZ, cluster.spreadZ);
      let placed = !input.isCloudPlacementBlocked(posX, posZ, cloudRadius);
      for (let attempt = 0; attempt < 10 && !placed; attempt += 1) {
        posX = cluster.x + input.randomRange(-cluster.spreadX, cluster.spreadX);
        posZ = cluster.z + input.randomRange(-cluster.spreadZ, cluster.spreadZ);
        placed = !input.isCloudPlacementBlocked(posX, posZ, cloudRadius);
      }
      if (!placed) {
        continue;
      }
      sprite.position.set(
        posX,
        Math.min(candidateY, maxCenterY),
        posZ,
      );
      sprite.scale.set(scale * 1.35, scale, 1);
      cloudGroup.add(sprite);
    }
  }

  input.addLevelObject(cloudGroup);
  console.log("[AddCloudBackdrop]", "Placed sprite cloud backdrop clusters");
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
