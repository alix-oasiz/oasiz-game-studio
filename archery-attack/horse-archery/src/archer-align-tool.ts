interface Point {
  x: number;
  y: number;
}

interface TransformState {
  x: number;
  y: number;
  scale: number;
  rotationDeg: number;
  opacity: number;
}

interface FrameState {
  transform: TransformState;
  arrowTip: Point;
}

const FRAME_COUNT = 30;

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("[Init] No 2D context.");

const horsePresetEl = document.getElementById("horsePreset") as HTMLSelectElement;
const horseFileEl = document.getElementById("horseFile") as HTMLInputElement;
const archerPresetEl = document.getElementById("archerPreset") as HTMLSelectElement;
const archerFileEl = document.getElementById("archerFile") as HTMLInputElement;
const loadHorsePresetBtn = document.getElementById("loadHorsePresetBtn") as HTMLButtonElement;
const loadHorseFileBtn = document.getElementById("loadHorseFileBtn") as HTMLButtonElement;
const loadArcherPresetBtn = document.getElementById("loadArcherPresetBtn") as HTMLButtonElement;
const loadArcherFileBtn = document.getElementById("loadArcherFileBtn") as HTMLButtonElement;

const frameSliderEl = document.getElementById("frameSlider") as HTMLInputElement;
const frameValEl = document.getElementById("frameVal") as HTMLDivElement;
const prevFrameBtn = document.getElementById("prevFrameBtn") as HTMLButtonElement;
const nextFrameBtn = document.getElementById("nextFrameBtn") as HTMLButtonElement;
const copyPrevBtn = document.getElementById("copyPrevBtn") as HTMLButtonElement;
const interpolateBtn = document.getElementById("interpolateBtn") as HTMLButtonElement;

const scaleEl = document.getElementById("scale") as HTMLInputElement;
const rotationEl = document.getElementById("rotation") as HTMLInputElement;
const opacityEl = document.getElementById("opacity") as HTMLInputElement;
const scaleValEl = document.getElementById("scaleVal") as HTMLDivElement;
const rotationValEl = document.getElementById("rotationVal") as HTMLDivElement;
const opacityValEl = document.getElementById("opacityVal") as HTMLDivElement;
const arrowTipValEl = document.getElementById("arrowTipVal") as HTMLDivElement;
const placeArrowTipBtn = document.getElementById("placeArrowTipBtn") as HTMLButtonElement;

const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const centerBtn = document.getElementById("centerBtn") as HTMLButtonElement;
const saveJsonBtn = document.getElementById("saveJsonBtn") as HTMLButtonElement;
const savePngBtn = document.getElementById("savePngBtn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLDivElement;

const horseImage = new Image();
const horseVideo = document.createElement("video");
horseVideo.muted = true;
horseVideo.playsInline = true;
horseVideo.preload = "auto";

const archerImage = new Image();

let horseMode: "none" | "image" | "video" = "none";
let horseLoaded = false;
let archerLoaded = false;
let horseSource = "";
let archerSource = "";

let currentFrame = 0;
let placingArrowTip = false;
let draggingArcher = false;
let draggingArrowTip = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

const defaultTransform = (): TransformState => ({
  x: canvas.width * 0.5,
  y: canvas.height * 0.5,
  scale: 0.48,
  rotationDeg: -45,
  opacity: 1,
});

const defaultArrowTip = (): Point => ({ x: 127, y: 292 });

let previewTransform: TransformState = defaultTransform();
let previewArrowTip: Point = defaultArrowTip();

const frameStates: Array<FrameState | null> = Array.from({ length: FRAME_COUNT }, () => null);
const keyed: boolean[] = Array.from({ length: FRAME_COUNT }, () => false);

function log(functionName: string, message: string): void {
  console.log("[" + functionName + "]", message);
}

function setStatus(message: string): void {
  statusEl.textContent = message;
}

function cloneTransform(t: TransformState): TransformState {
  return { x: t.x, y: t.y, scale: t.scale, rotationDeg: t.rotationDeg, opacity: t.opacity };
}

function clonePoint(p: Point): Point {
  return { x: p.x, y: p.y };
}

function cloneFrameState(s: FrameState): FrameState {
  return { transform: cloneTransform(s.transform), arrowTip: clonePoint(s.arrowTip) };
}

function isVideoSource(src: string, mime = ""): boolean {
  const l = src.toLowerCase();
  if (mime.startsWith("video/")) return true;
  return l.endsWith(".webm") || l.endsWith(".mp4") || l.endsWith(".mov") || l.endsWith(".m4v");
}

function toStagePoint(e: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * sx,
    y: (e.clientY - rect.top) * sy,
  };
}

function setCanvasSize(w: number, h: number): void {
  canvas.width = w;
  canvas.height = h;
}

function updateUiValues(): void {
  scaleValEl.textContent = previewTransform.scale.toFixed(2);
  rotationValEl.textContent = previewTransform.rotationDeg.toString();
  opacityValEl.textContent = previewTransform.opacity.toFixed(2);
  arrowTipValEl.textContent = "x=" + Math.round(previewArrowTip.x) + ", y=" + Math.round(previewArrowTip.y);
  const tag = keyed[currentFrame] ? "KEYED" : "AUTO";
  frameValEl.textContent = currentFrame.toString() + " / " + (FRAME_COUNT - 1).toString() + " (" + tag + ")";
  placeArrowTipBtn.textContent = placingArrowTip ? "Click Canvas..." : "Place Arrow Tip";
  placeArrowTipBtn.style.background = placingArrowTip ? "#3d8a5a" : "#9f6333";
}

function drawHorseLayer(): void {
  if (!horseLoaded) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }
  if (horseMode === "image") {
    ctx.drawImage(horseImage, 0, 0, canvas.width, canvas.height);
    return;
  }
  if (horseMode === "video") {
    ctx.drawImage(horseVideo, 0, 0, canvas.width, canvas.height);
  }
}

function drawArcherLayer(): void {
  if (!archerLoaded) return;
  const w = archerImage.naturalWidth * previewTransform.scale;
  const h = archerImage.naturalHeight * previewTransform.scale;

  ctx.save();
  ctx.translate(previewTransform.x, previewTransform.y);
  ctx.rotate((previewTransform.rotationDeg * Math.PI) / 180);
  ctx.globalAlpha = previewTransform.opacity;
  ctx.drawImage(archerImage, -w * 0.5, -h * 0.62, w, h);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawMarkers(): void {
  // Archer pivot.
  ctx.strokeStyle = "rgba(255, 210, 120, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(previewTransform.x - 10, previewTransform.y);
  ctx.lineTo(previewTransform.x + 10, previewTransform.y);
  ctx.moveTo(previewTransform.x, previewTransform.y - 10);
  ctx.lineTo(previewTransform.x, previewTransform.y + 10);
  ctx.stroke();

  // Arrow tip marker.
  ctx.strokeStyle = "rgba(120, 235, 255, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(previewArrowTip.x - 8, previewArrowTip.y);
  ctx.lineTo(previewArrowTip.x + 8, previewArrowTip.y);
  ctx.moveTo(previewArrowTip.x, previewArrowTip.y - 8);
  ctx.lineTo(previewArrowTip.x, previewArrowTip.y + 8);
  ctx.stroke();
}

function redraw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawHorseLayer();
  drawArcherLayer();
  drawMarkers();
  updateUiValues();
}

function getResolvedFrame(index: number): FrameState {
  const own = frameStates[index];
  if (own) return cloneFrameState(own);

  for (let i = index - 1; i >= 0; i--) {
    if (frameStates[i]) return cloneFrameState(frameStates[i] as FrameState);
  }

  for (let i = index + 1; i < FRAME_COUNT; i++) {
    if (frameStates[i]) return cloneFrameState(frameStates[i] as FrameState);
  }

  return {
    transform: defaultTransform(),
    arrowTip: defaultArrowTip(),
  };
}

function applyFrameToPreview(index: number): void {
  const state = getResolvedFrame(index);
  previewTransform = cloneTransform(state.transform);
  previewArrowTip = clonePoint(state.arrowTip);

  scaleEl.value = previewTransform.scale.toString();
  rotationEl.value = previewTransform.rotationDeg.toString();
  opacityEl.value = previewTransform.opacity.toString();
}

function commitCurrentFrame(key = true): void {
  frameStates[currentFrame] = {
    transform: cloneTransform(previewTransform),
    arrowTip: clonePoint(previewArrowTip),
  };
  if (key) keyed[currentFrame] = true;
}

function setFrame(index: number): void {
  currentFrame = Math.max(0, Math.min(FRAME_COUNT - 1, index));
  frameSliderEl.value = currentFrame.toString();
  applyFrameToPreview(currentFrame);
  syncHorseVideoToCurrentFrame();
  redraw();
}

function syncHorseVideoToCurrentFrame(): void {
  if (horseMode !== "video") return;
  if (!horseLoaded) return;
  const duration = horseVideo.duration;
  if (!Number.isFinite(duration) || duration <= 0) return;
  const t = (currentFrame / (FRAME_COUNT - 1)) * Math.max(0.001, duration - 0.001);
  if (Math.abs(horseVideo.currentTime - t) < 0.001) return;
  horseVideo.currentTime = t;
}

function handleVideoSeeked(): void {
  redraw();
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("bad file result"));
    };
    reader.onerror = () => reject(new Error("file read error"));
    reader.readAsDataURL(file);
  });
}

function loadImageAsset(image: HTMLImageElement, src: string, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    image.onload = () => {
      log("LoadImageAsset", "Loaded " + label + " " + src);
      resolve();
    };
    image.onerror = () => reject(new Error("image load failed"));
    image.src = src;
  });
}

function loadVideoAsset(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onLoadedMeta = (): void => {
      horseVideo.removeEventListener("loadedmetadata", onLoadedMeta);
      horseVideo.removeEventListener("error", onError);
      log("LoadVideoAsset", "Loaded " + src);
      resolve();
    };
    const onError = (): void => {
      horseVideo.removeEventListener("loadedmetadata", onLoadedMeta);
      horseVideo.removeEventListener("error", onError);
      reject(new Error("video load failed"));
    };
    horseVideo.addEventListener("loadedmetadata", onLoadedMeta);
    horseVideo.addEventListener("error", onError);
    horseVideo.src = src;
    horseVideo.load();
  });
}

async function loadHorseSource(src: string, mime = ""): Promise<void> {
  try {
    if (isVideoSource(src, mime)) {
      await loadVideoAsset(src);
      horseMode = "video";
      horseLoaded = true;
      horseSource = src;
      setCanvasSize(horseVideo.videoWidth, horseVideo.videoHeight);
      syncHorseVideoToCurrentFrame();
      setStatus("Loaded horse video.");
      redraw();
      return;
    }

    await loadImageAsset(horseImage, src, "horse");
    horseMode = "image";
    horseLoaded = true;
    horseSource = src;
    setCanvasSize(horseImage.naturalWidth, horseImage.naturalHeight);
    setStatus("Loaded horse image.");
    redraw();
  } catch {
    setStatus("Failed to load horse source.");
  }
}

async function loadArcherSource(src: string): Promise<void> {
  try {
    await loadImageAsset(archerImage, src, "archer");
    archerLoaded = true;
    archerSource = src;
    setStatus("Loaded archer.");
    redraw();
  } catch {
    setStatus("Failed to load archer source.");
  }
}

async function loadHorsePreset(): Promise<void> {
  await loadHorseSource(horsePresetEl.value);
}

async function loadHorseFile(): Promise<void> {
  const file = horseFileEl.files && horseFileEl.files[0];
  if (!file) {
    setStatus("No horse file selected.");
    return;
  }
  try {
    const url = await readFileAsDataUrl(file);
    await loadHorseSource(url, file.type);
  } catch {
    setStatus("Failed to load horse file.");
  }
}

async function loadArcherPreset(): Promise<void> {
  await loadArcherSource(archerPresetEl.value);
}

async function loadArcherFile(): Promise<void> {
  const file = archerFileEl.files && archerFileEl.files[0];
  if (!file) {
    setStatus("No archer file selected.");
    return;
  }
  try {
    const url = await readFileAsDataUrl(file);
    await loadArcherSource(url);
  } catch {
    setStatus("Failed to load archer file.");
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function interpolateFrames(): void {
  const keyedIndices: number[] = [];
  for (let i = 0; i < FRAME_COUNT; i++) if (keyed[i] && frameStates[i]) keyedIndices.push(i);

  if (keyedIndices.length < 2) {
    setStatus("Need at least 2 keyed frames to interpolate.");
    return;
  }

  for (let i = 0; i < keyedIndices.length - 1; i++) {
    const aIdx = keyedIndices[i];
    const bIdx = keyedIndices[i + 1];
    const a = frameStates[aIdx] as FrameState;
    const b = frameStates[bIdx] as FrameState;
    const span = bIdx - aIdx;
    if (span <= 1) continue;

    for (let j = aIdx + 1; j < bIdx; j++) {
      if (keyed[j]) continue;
      const t = (j - aIdx) / span;
      frameStates[j] = {
        transform: {
          x: lerp(a.transform.x, b.transform.x, t),
          y: lerp(a.transform.y, b.transform.y, t),
          scale: lerp(a.transform.scale, b.transform.scale, t),
          rotationDeg: lerp(a.transform.rotationDeg, b.transform.rotationDeg, t),
          opacity: lerp(a.transform.opacity, b.transform.opacity, t),
        },
        arrowTip: {
          x: lerp(a.arrowTip.x, b.arrowTip.x, t),
          y: lerp(a.arrowTip.y, b.arrowTip.y, t),
        },
      };
    }
  }

  setFrame(currentFrame);
  setStatus("Interpolated between keyed frames.");
}

function copyPreviousFrame(): void {
  if (currentFrame <= 0) {
    setStatus("Frame 0 has no previous frame.");
    return;
  }
  const prev = getResolvedFrame(currentFrame - 1);
  previewTransform = cloneTransform(prev.transform);
  previewArrowTip = clonePoint(prev.arrowTip);
  commitCurrentFrame(true);
  setFrame(currentFrame);
  setStatus("Copied previous frame.");
}

function resetCurrentFrame(): void {
  previewTransform = defaultTransform();
  previewArrowTip = defaultArrowTip();
  commitCurrentFrame(true);
  setFrame(currentFrame);
  setStatus("Reset current frame.");
}

function centerCurrentFrame(): void {
  previewTransform.x = canvas.width * 0.5;
  previewTransform.y = canvas.height * 0.5;
  commitCurrentFrame(true);
  setFrame(currentFrame);
}

function saveJson(): void {
  const frames = Array.from({ length: FRAME_COUNT }, (_, i) => {
    const state = getResolvedFrame(i);
    return {
      index: i,
      keyed: keyed[i],
      transform: state.transform,
      arrowTip: state.arrowTip,
    };
  });

  const payload = {
    frameCount: FRAME_COUNT,
    horseSource,
    archerSource,
    canvas: { w: canvas.width, h: canvas.height },
    frames,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "archer_alignment_30frames.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setStatus("Saved archer_alignment_30frames.json");
}

function savePng(): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "archer_alignment_frame_" + currentFrame.toString().padStart(2, "0") + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus("Saved preview for current frame.");
  }, "image/png");
}

function setupPointerHandlers(): void {
  canvas.addEventListener("pointerdown", (e) => {
    const p = toStagePoint(e);

    if (placingArrowTip) {
      previewArrowTip = p;
      placingArrowTip = false;
      commitCurrentFrame(true);
      redraw();
      setStatus("Arrow tip placed on frame " + currentFrame.toString() + ".");
      return;
    }

    const dxTip = p.x - previewArrowTip.x;
    const dyTip = p.y - previewArrowTip.y;
    if (dxTip * dxTip + dyTip * dyTip <= 14 * 14) {
      draggingArrowTip = true;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("dragging");
      return;
    }

    const dx = p.x - previewTransform.x;
    const dy = p.y - previewTransform.y;
    if (dx * dx + dy * dy <= 160 * 160) {
      draggingArcher = true;
      dragOffsetX = p.x - previewTransform.x;
      dragOffsetY = p.y - previewTransform.y;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add("dragging");
    }
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!draggingArcher && !draggingArrowTip) return;
    const p = toStagePoint(e);
    if (draggingArrowTip) {
      previewArrowTip = p;
      commitCurrentFrame(true);
      redraw();
      return;
    }
    previewTransform.x = p.x - dragOffsetX;
    previewTransform.y = p.y - dragOffsetY;
    commitCurrentFrame(true);
    redraw();
  });

  const endDrag = (): void => {
    draggingArcher = false;
    draggingArrowTip = false;
    canvas.classList.remove("dragging");
  };

  canvas.addEventListener("pointerup", (e) => {
    canvas.releasePointerCapture(e.pointerId);
    endDrag();
  });
  canvas.addEventListener("pointercancel", endDrag);
}

function setupUiHandlers(): void {
  loadHorsePresetBtn.addEventListener("click", () => { void loadHorsePreset(); });
  loadHorseFileBtn.addEventListener("click", () => { void loadHorseFile(); });
  loadArcherPresetBtn.addEventListener("click", () => { void loadArcherPreset(); });
  loadArcherFileBtn.addEventListener("click", () => { void loadArcherFile(); });

  frameSliderEl.addEventListener("input", () => {
    setFrame(Number(frameSliderEl.value));
  });
  prevFrameBtn.addEventListener("click", () => setFrame(currentFrame - 1));
  nextFrameBtn.addEventListener("click", () => setFrame(currentFrame + 1));
  copyPrevBtn.addEventListener("click", copyPreviousFrame);
  interpolateBtn.addEventListener("click", interpolateFrames);

  scaleEl.addEventListener("input", () => {
    previewTransform.scale = Number(scaleEl.value);
    commitCurrentFrame(true);
    redraw();
  });

  rotationEl.addEventListener("input", () => {
    previewTransform.rotationDeg = Number(rotationEl.value);
    commitCurrentFrame(true);
    redraw();
  });

  opacityEl.addEventListener("input", () => {
    previewTransform.opacity = Number(opacityEl.value);
    commitCurrentFrame(true);
    redraw();
  });

  placeArrowTipBtn.addEventListener("click", () => {
    placingArrowTip = !placingArrowTip;
    redraw();
  });

  resetBtn.addEventListener("click", resetCurrentFrame);
  centerBtn.addEventListener("click", centerCurrentFrame);
  saveJsonBtn.addEventListener("click", saveJson);
  savePngBtn.addEventListener("click", savePng);

  horseVideo.addEventListener("seeked", handleVideoSeeked);
}

function initFrameData(): void {
  const s = getResolvedFrame(0);
  frameStates[0] = cloneFrameState(s);
  keyed[0] = true;
}

function init(): void {
  setupPointerHandlers();
  setupUiHandlers();
  initFrameData();
  setFrame(0);
  void loadHorsePreset();
  void loadArcherPreset();
  setStatus("Ready. Use 30-frame slider to key poses.");
}

init();
