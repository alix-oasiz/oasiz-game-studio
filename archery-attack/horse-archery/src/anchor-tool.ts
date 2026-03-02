type MarkerId = "saddle" | "stirrup" | "bowHand" | "seatBox";

interface Point {
  x: number;
  y: number;
}

interface AnchorState {
  saddle: Point;
  stirrup: Point;
  bowHand: Point;
  seatBox: Point;
}

const canvas = document.getElementById("editorCanvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d");
const presetSelect = document.getElementById("presetSelect") as HTMLSelectElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const loadPresetBtn = document.getElementById("loadPresetBtn") as HTMLButtonElement;
const loadFileBtn = document.getElementById("loadFileBtn") as HTMLButtonElement;
const saveJsonBtn = document.getElementById("saveJsonBtn") as HTMLButtonElement;
const savePngBtn = document.getElementById("savePngBtn") as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const statusText = document.getElementById("statusText") as HTMLParagraphElement;
const markerButtons = Array.from(document.querySelectorAll(".marker-btn")) as HTMLButtonElement[];

if (!ctx) {
  throw new Error("Canvas 2D context unavailable");
}

const markerColors: Record<MarkerId, string> = {
  saddle: "#ff4d4d",
  stirrup: "#33ccff",
  bowHand: "#99ff66",
  seatBox: "#ffd74d",
};

const defaultAnchors: AnchorState = {
  saddle: { x: 387, y: 236 },
  stirrup: { x: 415, y: 302 },
  bowHand: { x: 513, y: 172 },
  seatBox: { x: 387, y: 236 },
};

let anchors: AnchorState = JSON.parse(JSON.stringify(defaultAnchors)) as AnchorState;
let selectedMarker: MarkerId = "saddle";
let dragging = false;
let image = new Image();
let imageLoaded = false;
let sourceName = "rider_fit_horse_frame";

function log(functionName: string, message: string): void {
  console.log("[" + functionName + "]", message);
}

function setStatus(message: string): void {
  statusText.textContent = message;
}

function setSelectedMarker(markerId: MarkerId): void {
  selectedMarker = markerId;
  markerButtons.forEach((button) => {
    const id = button.dataset.marker as MarkerId;
    button.style.outline = id === markerId ? "2px solid #ffffff" : "none";
    button.style.background = id === markerId ? "#3a425c" : "#24293a";
  });
}

function clampPoint(p: Point): Point {
  return {
    x: Math.max(0, Math.min(canvas.width, p.x)),
    y: Math.max(0, Math.min(canvas.height, p.y)),
  };
}

function toCanvasPoint(event: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  return clampPoint({
    x: (event.clientX - rect.left) * sx,
    y: (event.clientY - rect.top) * sy,
  });
}

function drawCross(point: Point, color: string): void {
  const size = 14;
  const half = size / 2;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(point.x - half, point.y);
  ctx.lineTo(point.x + half, point.y);
  ctx.moveTo(point.x, point.y - half);
  ctx.lineTo(point.x, point.y + half);
  ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawSeatBox(center: Point): void {
  const w = 95;
  const h = 70;
  const x = center.x - w / 2;
  const y = center.y - h / 2;
  ctx.strokeStyle = markerColors.seatBox;
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
}

function redraw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (imageLoaded) {
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawSeatBox(anchors.seatBox);
  drawCross(anchors.saddle, markerColors.saddle);
  drawCross(anchors.stirrup, markerColors.stirrup);
  drawCross(anchors.bowHand, markerColors.bowHand);

  updateCoordinateLabels();
}

function updateCoordinateLabels(): void {
  const ids: MarkerId[] = ["saddle", "stirrup", "bowHand", "seatBox"];
  ids.forEach((id) => {
    const el = document.getElementById("coords-" + id);
    if (!el) return;
    const p = anchors[id];
    const nx = p.x / canvas.width;
    const ny = p.y / canvas.height;
    el.textContent =
      "x=" + Math.round(p.x) +
      ", y=" + Math.round(p.y) +
      " | nx=" + nx.toFixed(4) +
      ", ny=" + ny.toFixed(4);
  });
}

function loadImageFromUrl(url: string, nameHint: string): void {
  image = new Image();
  image.onload = () => {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    imageLoaded = true;
    sourceName = nameHint;
    redraw();
    setStatus("Loaded: " + nameHint + " (" + canvas.width + "x" + canvas.height + ")");
    log("loadImageFromUrl", "Loaded " + url);
  };
  image.onerror = () => {
    setStatus("Could not load image. Try PNG or JPG.");
    log("loadImageFromUrl", "Could not load " + url);
  };
  image.src = url;
}

function loadImageFromFile(file: File): void {
  const base = file.name.replace(/\.[^/.]+$/, "");
  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    if (typeof result !== "string") {
      setStatus("Could not read selected file.");
      return;
    }
    loadImageFromUrl(result, base || "frame");
  };
  reader.onerror = () => {
    setStatus("File read failed on this browser.");
  };
  reader.readAsDataURL(file);
}

function handlePointerDown(event: PointerEvent): void {
  dragging = true;
  canvas.setPointerCapture(event.pointerId);
  const p = toCanvasPoint(event);
  anchors[selectedMarker] = p;
  redraw();
}

function handlePointerMove(event: PointerEvent): void {
  if (!dragging) return;
  const p = toCanvasPoint(event);
  anchors[selectedMarker] = p;
  redraw();
}

function handlePointerUp(event: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  canvas.releasePointerCapture(event.pointerId);
}

function downloadBlob(filename: string, blob: Blob): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function saveJson(): void {
  const payload = {
    sourceImage: sourceName,
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    anchors,
    normalized: {
      saddle: { x: anchors.saddle.x / canvas.width, y: anchors.saddle.y / canvas.height },
      stirrup: { x: anchors.stirrup.x / canvas.width, y: anchors.stirrup.y / canvas.height },
      bowHand: { x: anchors.bowHand.x / canvas.width, y: anchors.bowHand.y / canvas.height },
      seatBox: { x: anchors.seatBox.x / canvas.width, y: anchors.seatBox.y / canvas.height },
    },
    seatBoxSize: { w: 95, h: 70 },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(sourceName + "_anchors.json", blob);
  log("saveJson", "Saved anchors JSON");
}

function savePng(): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    downloadBlob(sourceName + "_template.png", blob);
    log("savePng", "Saved template PNG");
  }, "image/png");
}

function resetAnchors(): void {
  anchors = JSON.parse(JSON.stringify(defaultAnchors)) as AnchorState;
  redraw();
  log("resetAnchors", "Reset anchors to defaults");
}

function setup(): void {
  setSelectedMarker("saddle");

  markerButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.marker as MarkerId;
      setSelectedMarker(id);
    });
  });

  const loadPreset = (): void => {
    const url = presetSelect.value;
    const base = url.split("/").pop() || "frame";
    const name = base.replace(/\.[^/.]+$/, "");
    setStatus("Loading preset: " + name);
    loadImageFromUrl(url, name);
  };

  presetSelect.addEventListener("change", loadPreset);
  loadPresetBtn.addEventListener("click", loadPreset);

  const loadSelectedFile = (): void => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      setStatus("No file selected.");
      return;
    }
    setStatus("Loading: " + file.name);
    loadImageFromFile(file);
  };

  fileInput.addEventListener("change", loadSelectedFile);
  loadFileBtn.addEventListener("click", loadSelectedFile);
  fileInput.addEventListener("click", () => {
    fileInput.value = "";
  });

  saveJsonBtn.addEventListener("click", saveJson);
  savePngBtn.addEventListener("click", savePng);
  resetBtn.addEventListener("click", resetAnchors);

  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);

  loadImageFromUrl("/rider_fit_horse_frame.png", "rider_fit_horse_frame");
  window.setTimeout(() => {
    if (!imageLoaded) {
      setStatus("Default frame failed. Click Load Preset.");
    }
  }, 1500);
}

setup();
