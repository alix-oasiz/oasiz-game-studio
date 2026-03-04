export type PlatformType =
  | "start"
  | "flat"
  | "slope_up_steep"
  | "slope_down_soft"
  | "slope_down_steep"
  | "spiral_down_left"
  | "spiral_down_right"
  | "detour_left_short"
  | "detour_right_short"
  | "bottleneck"
  | "gap_short"
  | "finish_straight";

export interface PlatformSection {
  type: PlatformType;
  zStart: number;
  zEnd: number;
  slope: number;
  width: number;
  hasFloor: boolean;
  detourDirection: -1 | 1;
  detourMagnitude: number;
  lateralOffsetStart: number;
  lateralOffsetEnd: number;
}

export interface LevelConfig {
  platformCount: number;
  sections: PlatformSection[];
  fireworkZ: number;
}

export interface TrackSample {
  s: number;
  nominalZ: number;
  z: number;
  x: number;
  y: number;
  tilt: number;
  width: number;
  hasFloor: boolean;
  sectionIndex: number;
}

export interface TrackSlice {
  sStart: number;
  sEnd: number;
  zStart: number;
  zEnd: number;
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  centerZ: number;
  centerX: number;
  centerY: number;
  length: number;
  horizontalLength: number;
  tilt: number;
  yaw: number;
  width: number;
  hasFloor: boolean;
}

interface LevelConfigInput {
  loopsCompleted: number;
  startZ: number;
  finishZ: number;
  trackWidth: number;
  downhillSlopeAngle: number;
  uphillSlopeAngle: number;
  forcedMiddleTypes?: PlatformType[] | null;
  randomRange: (min: number, max: number) => number;
}

interface BuildTrackSlicesInput {
  levelConfig: LevelConfig;
  startZ: number;
  finishZ: number;
  trackCenterY: number;
  trackThickness: number;
  trackWidth: number;
  trackStep: number;
  slopeBlendDistance: number;
  uphillSlopeAngle: number;
  downhillSlopeAngle: number;
  fireworkTriggerZ: number;
  loseY: number;
  loseBoundaryDrop: number;
}

export interface BuildTrackSlicesResult {
  trackSamples: TrackSample[];
  trackSlices: TrackSlice[];
  sectionArcRanges: Array<{ sStart: number; sEnd: number }>;
  trackArcLength: number;
  fireworkTriggerS: number;
  currentLoseY: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth01(t: number): number {
  return t * t * (3 - 2 * t);
}

export function getDefaultDesignerMiddleTypes(): PlatformType[] {
  return [
    "bottleneck",
    "detour_left_short",
    "slope_down_soft",
    "spiral_down_left",
    "flat",
    "detour_right_short",
    "slope_down_steep",
    "bottleneck",
  ];
}

export function getPlatformTypeLabel(type: PlatformType): string {
  if (type === "start") return "Start";
  if (type === "flat") return "Flat";
  if (type === "slope_down_soft") return "Slope Down Soft";
  if (type === "slope_down_steep") return "Slope Down Steep";
  if (type === "slope_up_steep") return "Slope Up Steep";
  if (type === "spiral_down_left") return "Spiral Down Left";
  if (type === "spiral_down_right") return "Spiral Down Right";
  if (type === "detour_left_short") return "Detour Left";
  if (type === "detour_right_short") return "Detour Right";
  if (type === "bottleneck") return "Bottleneck";
  if (type === "gap_short") return "Gap Short";
  if (type === "finish_straight") return "Finish Straight";
  return type;
}

export function isSpiralType(type: PlatformType): boolean {
  return type === "spiral_down_left" || type === "spiral_down_right";
}

export function isDownwardSlopeType(type: PlatformType): boolean {
  return (
    type === "slope_down_soft" ||
    type === "slope_down_steep" ||
    isSpiralType(type)
  );
}

function pickMiddlePlatformType(previousType: PlatformType): PlatformType {
  const canGap = isDownwardSlopeType(previousType);
  const forbidDownward = isDownwardSlopeType(previousType);
  const roll = Math.random();
  if (canGap && roll < 0.12) {
    return "gap_short";
  }
  if (!forbidDownward && roll < 0.24) {
    return "slope_down_soft";
  }
  if (!forbidDownward && roll < 0.38) {
    return "slope_down_steep";
  }
  if (!forbidDownward && roll < 0.5) {
    return Math.random() < 0.5 ? "spiral_down_left" : "spiral_down_right";
  }
  if (roll < 0.62) {
    return "bottleneck";
  }
  return Math.random() < 0.5 ? "detour_left_short" : "detour_right_short";
}

function createPlatformSection(
  type: PlatformType,
  zStart: number,
  zEnd: number,
  settings: Pick<
    LevelConfigInput,
    "trackWidth" | "downhillSlopeAngle" | "uphillSlopeAngle" | "randomRange"
  >,
): PlatformSection {
  if (type === "start" || type === "flat" || type === "finish_straight") {
    return {
      type,
      zStart,
      zEnd,
      slope: 0,
      width: settings.trackWidth,
      hasFloor: true,
      detourDirection: 1,
      detourMagnitude: 0,
      lateralOffsetStart: 0,
      lateralOffsetEnd: 0,
    };
  }
  if (type === "slope_down_soft") {
    return {
      type,
      zStart,
      zEnd,
      slope: settings.downhillSlopeAngle * 0.25,
      width: settings.trackWidth,
      hasFloor: true,
      detourDirection: 1,
      detourMagnitude: 0,
      lateralOffsetStart: 0,
      lateralOffsetEnd: 0,
    };
  }
  if (type === "slope_up_steep") {
    return {
      type,
      zStart,
      zEnd,
      slope: settings.uphillSlopeAngle * 0.5,
      width: settings.trackWidth,
      hasFloor: true,
      detourDirection: 1,
      detourMagnitude: 0,
      lateralOffsetStart: 0,
      lateralOffsetEnd: 0,
    };
  }
  if (type === "slope_down_steep") {
    return {
      type,
      zStart,
      zEnd,
      slope: settings.downhillSlopeAngle * 0.5,
      width: settings.trackWidth,
      hasFloor: true,
      detourDirection: 1,
      detourMagnitude: 0,
      lateralOffsetStart: 0,
      lateralOffsetEnd: 0,
    };
  }
  if (isSpiralType(type)) {
    return {
      type,
      zStart,
      zEnd,
      slope: settings.downhillSlopeAngle * 0.45,
      width: settings.trackWidth * 1.04,
      hasFloor: true,
      detourDirection: type === "spiral_down_left" ? -1 : 1,
      detourMagnitude: settings.randomRange(32, 52),
      lateralOffsetStart: 0,
      lateralOffsetEnd: 0,
    };
  }
  if (type === "bottleneck") {
    return {
      type,
      zStart,
      zEnd,
      slope: 0,
      width: settings.randomRange(5.8, 8.4),
      hasFloor: true,
      detourDirection: 1,
      detourMagnitude: 0,
      lateralOffsetStart: 0,
      lateralOffsetEnd: 0,
    };
  }
  if (type === "gap_short") {
    return {
      type,
      zStart,
      zEnd,
      slope: 0,
      width: settings.trackWidth,
      hasFloor: false,
      detourDirection: 1,
      detourMagnitude: 0,
      lateralOffsetStart: 0,
      lateralOffsetEnd: 0,
    };
  }
  return {
    type,
    zStart,
    zEnd,
    slope: 0,
    width: settings.trackWidth,
    hasFloor: true,
    detourDirection: type === "detour_left_short" ? -1 : 1,
    detourMagnitude: settings.randomRange(2.6, 6.8),
    lateralOffsetStart: 0,
    lateralOffsetEnd: 0,
  };
}

function applySectionLateralOffsets(
  sections: PlatformSection[],
  trackWidth: number,
): void {
  let currentOffset = 0;
  const maxOffset = trackWidth * 3.6;
  for (const section of sections) {
    section.lateralOffsetStart = currentOffset;
    if (
      section.type === "detour_left_short" ||
      section.type === "detour_right_short"
    ) {
      const delta = section.detourDirection * section.detourMagnitude * 0.52;
      currentOffset = clamp(currentOffset + delta, -maxOffset, maxOffset);
    }
    section.lateralOffsetEnd = currentOffset;
  }
}

export function createRandomLevelConfig(input: LevelConfigInput): LevelConfig {
  const customMiddleTypes = (input.forcedMiddleTypes ?? []).slice();
  const useCustomMiddle = customMiddleTypes.length > 0;
  const targetPlatformCount = Math.min(24, 4 + input.loopsCompleted);
  const middleCount = useCustomMiddle
    ? customMiddleTypes.length
    : Math.max(0, targetPlatformCount - 2);
  const platformCount = middleCount + 2;
  const sections: PlatformSection[] = [];

  const startLength = input.randomRange(24, 32);
  const finishLength = input.randomRange(24, 34);
  const usableLength = Math.max(
    40,
    input.startZ - input.finishZ - startLength - finishLength,
  );

  const weights: number[] = [];
  let weightSum = 0;
  for (let i = 0; i < middleCount; i += 1) {
    const weight = input.randomRange(1.15, 2.1);
    weights.push(weight);
    weightSum += weight;
  }

  let currentZ = input.startZ;
  const startSectionEnd = currentZ - startLength;
  sections.push(
    createPlatformSection("start", currentZ, startSectionEnd, input),
  );
  currentZ = startSectionEnd;

  let previousType: PlatformType = "start";
  for (let i = 0; i < middleCount; i += 1) {
    let length = Math.max(
      15,
      (weights[i] / Math.max(0.001, weightSum)) * usableLength,
    );
    let type: PlatformType = useCustomMiddle
      ? customMiddleTypes[i] ?? "flat"
      : pickMiddlePlatformType(previousType);
    if (type === "finish_straight") {
      type = "flat";
    }
    if (
      !useCustomMiddle &&
      isDownwardSlopeType(type) &&
      isDownwardSlopeType(previousType)
    ) {
      type = Math.random() < 0.5 ? "bottleneck" : "flat";
    }
    if (
      !useCustomMiddle &&
      isSpiralType(type) &&
      currentZ - (input.finishZ + finishLength) < 160
    ) {
      type = "bottleneck";
    }
    if (
      !useCustomMiddle &&
      type === "gap_short" &&
      !isDownwardSlopeType(previousType)
    ) {
      type = "slope_down_soft";
    }
    if (isSpiralType(type)) {
      length = input.randomRange(120, 170);
    }
    if (type === "gap_short") {
      length = input.randomRange(10, 15);
      const launchIndex = sections.length - 1;
      if (launchIndex < 1) {
        type = "slope_down_soft";
      } else if (sections[launchIndex].type !== "slope_up_steep") {
        const launchSection = sections[launchIndex];
        sections[launchIndex] = createPlatformSection(
          "slope_up_steep",
          launchSection.zStart,
          launchSection.zEnd,
          input,
        );
      }
    }

    const zEnd = Math.max(input.finishZ + finishLength, currentZ - length);
    sections.push(createPlatformSection(type, currentZ, zEnd, input));
    previousType = type;
    currentZ = zEnd;
  }

  if (!useCustomMiddle && sections.length > 1) {
    const lastMiddleIndex = sections.length - 1;
    const lastMiddle = sections[lastMiddleIndex];
    sections[lastMiddleIndex] = createPlatformSection(
      "flat",
      lastMiddle.zStart,
      lastMiddle.zEnd,
      input,
    );
  }

  sections.push(
    createPlatformSection("finish_straight", currentZ, input.finishZ, input),
  );
  applySectionLateralOffsets(sections, input.trackWidth);

  return {
    platformCount,
    sections,
    fireworkZ: input.finishZ + 12,
  };
}

export function getSectionAtZ(
  levelConfig: LevelConfig,
  finishZ: number,
  startZ: number,
  z: number,
): PlatformSection {
  const clampedZ = clamp(z, finishZ, startZ);
  for (const section of levelConfig.sections) {
    if (clampedZ <= section.zStart && clampedZ >= section.zEnd) {
      return section;
    }
  }
  return levelConfig.sections[levelConfig.sections.length - 1];
}

export function getSectionProgressT(section: PlatformSection, z: number): number {
  const sectionLength = Math.max(0.001, section.zStart - section.zEnd);
  const clampedZ = clamp(z, section.zEnd, section.zStart);
  return clamp((section.zStart - clampedZ) / sectionLength, 0, 1);
}

export function getSpiralRadius(section: PlatformSection): number {
  const sectionLength = Math.max(0.001, section.zStart - section.zEnd);
  const maxStableRadius = (sectionLength / (Math.PI * 2)) * 1.08;
  return Math.max(6, Math.min(section.detourMagnitude, maxStableRadius));
}

export function sampleSpiralProgressT(
  section: PlatformSection,
  z: number,
): number {
  return getSectionProgressT(section, z);
}

export function sampleTrackCenterAtSectionT(
  section: PlatformSection,
  t: number,
  nominalZ: number,
): { x: number; z: number } {
  const smoothT = smooth01(t);
  const baseX = lerp(
    section.lateralOffsetStart,
    section.lateralOffsetEnd,
    smoothT,
  );
  let x = baseX;
  let z = nominalZ;
  if (isSpiralType(section.type)) {
    const direction = section.type === "spiral_down_left" ? -1 : 1;
    const radius = getSpiralRadius(section);
    const spinAngle = Math.PI + Math.PI * 2 * t;
    const axisX = lerp(
      section.lateralOffsetStart,
      section.lateralOffsetEnd,
      smoothT,
    ) + direction * radius;
    const axisZ = (section.zStart + section.zEnd) * 0.5;
    const baseSpiralX = axisX + direction * radius * Math.cos(spinAngle);
    const baseSpiralZ = axisZ + radius * Math.sin(spinAngle);
    const targetZ = lerp(section.zStart, section.zEnd, t);
    const edgeDistance = Math.min(t, 1 - t);
    const edgeWindow = 0.036;
    const edgeBlend = edgeDistance < edgeWindow
      ? smooth01((edgeWindow - edgeDistance) / edgeWindow)
      : 0;
    x = baseSpiralX;
    z = baseSpiralZ + (targetZ - baseSpiralZ) * edgeBlend;
  }
  return { x, z };
}

export function sampleTrackX(
  levelConfig: LevelConfig,
  finishZ: number,
  startZ: number,
  z: number,
): number {
  const section = getSectionAtZ(levelConfig, finishZ, startZ, z);
  const t = sampleSpiralProgressT(section, z);
  return sampleTrackCenterAtSectionT(section, t, z).x;
}

export function sampleTrackSlope(
  levelConfig: LevelConfig,
  finishZ: number,
  startZ: number,
  z: number,
  slopeBlendDistance: number,
  uphillSlopeAngle: number,
  downhillSlopeAngle: number,
): number {
  const sections = levelConfig.sections;
  const clampedZ = clamp(z, finishZ, startZ);
  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i];
    if (!(clampedZ <= section.zStart && clampedZ >= section.zEnd)) {
      continue;
    }

    let slope = section.slope;
    const prevSection = i > 0 ? sections[i - 1] : null;
    const nextSection = i < sections.length - 1 ? sections[i + 1] : null;

    if (prevSection) {
      const toStart = section.zStart - clampedZ;
      if (toStart < slopeBlendDistance) {
        const t = clamp(toStart / Math.max(0.001, slopeBlendDistance), 0, 1);
        slope = lerp(prevSection.slope, section.slope, smooth01(t));
      }
    }

    if (nextSection) {
      const toEnd = clampedZ - section.zEnd;
      if (toEnd < slopeBlendDistance) {
        const t = clamp(toEnd / Math.max(0.001, slopeBlendDistance), 0, 1);
        slope = lerp(nextSection.slope, slope, smooth01(t));
      }
    }

    if (isSpiralType(section.type)) {
      const localT = sampleSpiralProgressT(section, clampedZ);
      const extraDrop = Math.sin(localT * Math.PI) * downhillSlopeAngle * 0.04;
      slope += extraDrop;
    }

    return clamp(slope, uphillSlopeAngle, downhillSlopeAngle);
  }
  return 0;
}

export function sampleTrackWidth(
  levelConfig: LevelConfig,
  finishZ: number,
  startZ: number,
  z: number,
): number {
  return getSectionAtZ(levelConfig, finishZ, startZ, z).width;
}

export function hasFloorAtZ(
  levelConfig: LevelConfig,
  finishZ: number,
  startZ: number,
  z: number,
): boolean {
  return getSectionAtZ(levelConfig, finishZ, startZ, z).hasFloor;
}

function getArcLengthFromNominalZ(
  trackSamples: TrackSample[],
  nominalZ: number,
): number {
  if (trackSamples.length === 0) {
    return 0;
  }
  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let i = 0; i < trackSamples.length; i += 1) {
    const delta = Math.abs(trackSamples[i].nominalZ - nominalZ);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = i;
    }
  }
  return trackSamples[bestIndex].s;
}

export function buildTrackSlices(
  input: BuildTrackSlicesInput,
): BuildTrackSlicesResult {
  const trackSamples: TrackSample[] = [];
  const trackSlices: TrackSlice[] = [];
  const sectionArcRanges: Array<{ sStart: number; sEnd: number }> = [];
  let trackArcLength = 0;

  let currentY = input.trackCenterY + input.trackThickness * 0.5;
  const rangeIndices: Array<{ startIndex: number; endIndex: number }> = [];
  for (
    let sectionIndex = 0;
    sectionIndex < input.levelConfig.sections.length;
    sectionIndex += 1
  ) {
    const section = input.levelConfig.sections[sectionIndex];
    const sectionLength = Math.max(0.001, section.zStart - section.zEnd);
    const sampleCount = Math.max(2, Math.ceil(sectionLength / input.trackStep));
    const startIndex = trackSamples.length > 0 ? trackSamples.length - 1 : 0;

    for (let sampleIndex = 0; sampleIndex <= sampleCount; sampleIndex += 1) {
      if (sectionIndex > 0 && sampleIndex === 0) {
        continue;
      }
      const t = sampleIndex / sampleCount;
      const nominalZ = lerp(section.zStart, section.zEnd, t);
      const tilt = sampleTrackSlope(
        input.levelConfig,
        input.finishZ,
        input.startZ,
        nominalZ,
        input.slopeBlendDistance,
        input.uphillSlopeAngle,
        input.downhillSlopeAngle,
      );
      const center = sampleTrackCenterAtSectionT(section, t, nominalZ);
      if (trackSamples.length > 0) {
        const previous = trackSamples[trackSamples.length - 1];
        const deltaHorizontal = Math.max(
          0.001,
          Math.sqrt(
            (center.x - previous.x) * (center.x - previous.x) +
              (center.z - previous.z) * (center.z - previous.z),
          ),
        );
        const midTilt = lerp(previous.tilt, tilt, 0.5);
        currentY -= Math.tan(midTilt) * deltaHorizontal;
      }
      trackSamples.push({
        s: 0,
        nominalZ,
        z: center.z,
        x: center.x,
        y: currentY,
        tilt,
        width: section.width,
        hasFloor: section.hasFloor,
        sectionIndex,
      });
    }

    rangeIndices.push({
      startIndex,
      endIndex: trackSamples.length - 1,
    });
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const smoothedY: number[] = trackSamples.map((sample) => sample.y);
    for (let i = 1; i < trackSamples.length - 1; i += 1) {
      const prev = trackSamples[i - 1].y;
      const center = trackSamples[i].y;
      const next = trackSamples[i + 1].y;
      smoothedY[i] = (prev + center * 2 + next) * 0.25;
    }
    for (let i = 1; i < trackSamples.length - 1; i += 1) {
      trackSamples[i].y = smoothedY[i];
    }
  }

  if (trackSamples.length > 0) {
    trackSamples[0].s = 0;
    for (let i = 1; i < trackSamples.length; i += 1) {
      const a = trackSamples[i - 1];
      const b = trackSamples[i];
      const segLength = Math.sqrt(
        (b.x - a.x) * (b.x - a.x) +
          (b.y - a.y) * (b.y - a.y) +
          (b.z - a.z) * (b.z - a.z),
      );
      b.s = a.s + segLength;
    }
    trackArcLength = trackSamples[trackSamples.length - 1].s;
    for (let i = 0; i < trackSamples.length - 1; i += 1) {
      const a = trackSamples[i];
      const b = trackSamples[i + 1];
      const horizontal = Math.max(
        0.0001,
        Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)),
      );
      a.tilt = Math.atan2(a.y - b.y, horizontal);
    }
    if (trackSamples.length > 1) {
      trackSamples[trackSamples.length - 1].tilt =
        trackSamples[trackSamples.length - 2].tilt;
    }
  }

  for (const range of rangeIndices) {
    const startSample = trackSamples[range.startIndex];
    const endSample = trackSamples[range.endIndex];
    sectionArcRanges.push({
      sStart: startSample?.s ?? 0,
      sEnd: endSample?.s ?? 0,
    });
  }

  for (let i = 0; i < trackSamples.length - 1; i += 1) {
    const a = trackSamples[i];
    const b = trackSamples[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const horizontalLength = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
    const length = Math.max(0.001, Math.sqrt(dx * dx + dy * dy + dz * dz));
    const tilt = Math.atan2(a.y - b.y, horizontalLength);
    const yaw = Math.atan2(dx, -dz);
    trackSlices.push({
      sStart: a.s,
      sEnd: b.s,
      zStart: a.z,
      zEnd: b.z,
      xStart: a.x,
      xEnd: b.x,
      yStart: a.y,
      yEnd: b.y,
      centerZ: (a.z + b.z) * 0.5,
      centerX: (a.x + b.x) * 0.5,
      centerY: (a.y + b.y) * 0.5 - input.trackThickness * 0.5,
      length,
      horizontalLength,
      tilt,
      yaw,
      width: (a.width + b.width) * 0.5,
      hasFloor: a.hasFloor && b.hasFloor,
    });
  }

  const fireworkTriggerS = getArcLengthFromNominalZ(
    trackSamples,
    input.fireworkTriggerZ,
  );
  const floorSamples = trackSamples.filter((sample) => sample.hasFloor);
  const minFloorY = floorSamples.reduce(
    (minY, sample) => Math.min(minY, sample.y),
    Number.POSITIVE_INFINITY,
  );
  const currentLoseY = Number.isFinite(minFloorY)
    ? Math.min(input.loseY, minFloorY - input.loseBoundaryDrop)
    : input.loseY;

  return {
    trackSamples,
    trackSlices,
    sectionArcRanges,
    trackArcLength,
    fireworkTriggerS,
    currentLoseY,
  };
}
