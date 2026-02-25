import type { Game } from "../Game";
import type {
  BaseGameMode,
  DebugPhysicsTuningPayload,
  DebugPhysicsTuningSnapshot,
} from "../types";
import type { ShipTrailVisualTuning } from "../systems/rendering/Renderer";
import {
  getActiveConfigFromSettings,
  resolveGlobalValues,
  resolveMaterialValuesFromSettings,
} from "../../shared/sim/modules/simulationPhysicsTuning";

interface SliderField<T extends string> {
  key: T;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}

type ConfigKey = keyof DebugPhysicsTuningSnapshot["config"];
type MaterialKey = keyof DebugPhysicsTuningSnapshot["materials"];
type GlobalKey = keyof DebugPhysicsTuningSnapshot["globals"];
type TrailKey = keyof ShipTrailVisualTuning;

const MODE_OPTIONS: BaseGameMode[] = ["STANDARD", "SANE", "CHAOTIC"];

const CONFIG_FIELDS: ReadonlyArray<SliderField<ConfigKey>> = [
  {
    key: "ROTATION_SPEED",
    label: "Ship Rotation",
    min: 0.5,
    max: 8,
    step: 0.05,
    hint: "Higher: higher sustained spin rate while rotating. Lower: slower top turn rate.",
  },
  {
    key: "SHIP_ROTATION_RESPONSE",
    label: "Rotation Response In",
    min: 1,
    max: 30,
    step: 0.25,
    hint: "Higher: reaches target spin speed faster when rotate is held. Lower: smoother spin-up.",
  },
  {
    key: "SHIP_ROTATION_RELEASE_RESPONSE",
    label: "Rotation Response Out",
    min: 1,
    max: 30,
    step: 0.25,
    hint: "Higher: spin stops quickly when rotate is released. Lower: longer rotational coast-out.",
  },
  {
    key: "SHIP_ROTATION_DRIFT_RESPONSE_FACTOR",
    label: "Rotate Drift Damp",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "Higher: movement snaps down faster while rotating. Lower: momentum hangs longer during turn hold.",
  },
  {
    key: "ROTATION_THRUST_BONUS",
    label: "Rotation Boost",
    min: 0,
    max: 0.0002,
    step: 0.000002,
    hint: "Higher: more forward push while rotating. Lower: cleaner turning with less curve drift.",
  },
  {
    key: "BASE_THRUST",
    label: "Base Thrust",
    min: 0,
    max: 0.0004,
    step: 0.000005,
    hint: "Higher: more constant acceleration in force-based modes. Lower: less drift acceleration.",
  },
  {
    key: "SHIP_TARGET_SPEED",
    label: "Target Speed",
    min: 1,
    max: 10,
    step: 0.05,
    hint: "Higher: faster cruise speed. Lower: slower pacing and safer correction windows.",
  },
  {
    key: "SHIP_SPEED_RESPONSE",
    label: "Speed Response",
    min: 1,
    max: 20,
    step: 0.1,
    hint: "Higher: snaps to desired speed quickly. Lower: floatier acceleration/deceleration.",
  },
  {
    key: "RECOIL_FORCE",
    label: "Recoil Force",
    min: 0,
    max: 0.001,
    step: 0.00001,
    hint: "Higher: firing pushes ship back harder (force modes). Lower: less shot kickback.",
  },
  {
    key: "LASER_RECOIL_MULTIPLIER",
    label: "Laser Recoil Mult",
    min: 1,
    max: 6,
    step: 0.05,
    hint: "Higher: laser kickback stronger than normal shots. 1 means same as bullet recoil.",
  },
  {
    key: "DASH_FORCE",
    label: "Dash Force",
    min: 0,
    max: 0.03,
    step: 0.0002,
    hint: "Higher: stronger dash impulse (force modes). Lower: shorter, softer dashes.",
  },
  {
    key: "SHIP_DASH_BOOST",
    label: "Dash Boost",
    min: 0.5,
    max: 5,
    step: 0.05,
    hint: "Higher: dodge speed multiplier increases. Lower: dodge stays closer to base speed.",
  },
  {
    key: "SHIP_DASH_DURATION",
    label: "Dash Duration",
    min: 0.05,
    max: 0.6,
    step: 0.005,
    hint: "Higher: dodge boost lasts longer. Lower: short burst with quicker recovery.",
  },
  {
    key: "SHIP_RECOIL_SLOWDOWN",
    label: "Recoil Slowdown",
    min: 0,
    max: 2,
    step: 0.02,
    hint: "Higher: firing slows ship more. Lower: shooting keeps momentum better.",
  },
  {
    key: "SHIP_RECOIL_DURATION",
    label: "Recoil Duration",
    min: 0,
    max: 0.6,
    step: 0.005,
    hint: "Higher: post-shot slowdown lasts longer. Lower: recovers faster after firing.",
  },
  {
    key: "PILOT_ROTATION_SPEED",
    label: "Pilot Rotation",
    min: 0.5,
    max: 8,
    step: 0.05,
    hint: "Higher: pilot re-aims faster. Lower: pilot movement is harder to redirect.",
  },
  {
    key: "PILOT_DASH_FORCE",
    label: "Pilot Dash Force",
    min: 0,
    max: 0.03,
    step: 0.0002,
    hint: "Higher: pilot dash lunges further. Lower: smaller pilot reposition bursts.",
  },
];

const MATERIAL_FIELDS: ReadonlyArray<SliderField<MaterialKey>> = [
  {
    key: "SHIP_RESTITUTION",
    label: "Ship Restitution",
    min: 0,
    max: 1.2,
    step: 0.01,
    hint: "Higher: bouncier ship collisions. Lower: collisions absorb more energy.",
  },
  {
    key: "SHIP_FRICTION_AIR",
    label: "Ship Friction Air",
    min: 0,
    max: 0.05,
    step: 0.0005,
    hint: "Higher: stronger movement damping. Lower: longer glide and persistent velocity.",
  },
  {
    key: "SHIP_FRICTION",
    label: "Ship Friction",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "Higher: more drag on contact surfaces. Lower: cleaner slides along collisions.",
  },
  {
    key: "SHIP_ANGULAR_DAMPING",
    label: "Ship Angular Damping",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "Higher: rotational motion settles faster. Lower: spin inertia lasts longer.",
  },
  {
    key: "WALL_RESTITUTION",
    label: "Wall Restitution",
    min: 0,
    max: 1.2,
    step: 0.01,
    hint: "Higher: walls reflect more velocity. Lower: wall hits feel deadened.",
  },
  {
    key: "WALL_FRICTION",
    label: "Wall Friction",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "Higher: walls grab and slow tangential motion. Lower: walls allow smoother glides.",
  },
  {
    key: "PILOT_FRICTION_AIR",
    label: "Pilot Friction Air",
    min: 0,
    max: 0.2,
    step: 0.001,
    hint: "Higher: pilot movement damps quickly. Lower: pilot keeps drift momentum longer.",
  },
  {
    key: "PILOT_ANGULAR_DAMPING",
    label: "Pilot Angular Damping",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "Higher: pilot rotation stabilizes quickly. Lower: rotational inertia is stronger.",
  },
];

const GLOBAL_FIELDS: ReadonlyArray<SliderField<GlobalKey>> = [
  {
    key: "SHIP_DODGE_COOLDOWN_MS",
    label: "Ship Dodge Cooldown",
    min: 50,
    max: 1000,
    step: 5,
    hint: "Higher: longer gap between ship dodges. Lower: more frequent dodging.",
  },
  {
    key: "SHIP_DODGE_ANGLE_DEG",
    label: "Ship Dodge Angle",
    min: 0,
    max: 180,
    step: 1,
    hint: "Higher: dodge turns further from current heading. Lower: dodge stays closer to forward.",
  },
  {
    key: "FIRE_COOLDOWN_MS",
    label: "Fire Cooldown",
    min: 20,
    max: 600,
    step: 5,
    hint: "Higher: slower firing cadence. Lower: faster repeated shots.",
  },
  {
    key: "FIRE_HOLD_REPEAT_DELAY_MS",
    label: "Hold Repeat Delay",
    min: 20,
    max: 800,
    step: 5,
    hint: "Higher: longer delay before hold-repeat starts. Lower: hold fire kicks in sooner.",
  },
  {
    key: "RELOAD_MS",
    label: "Reload Interval",
    min: 100,
    max: 3000,
    step: 25,
    hint: "Higher: ammo refills slower. Lower: ammo refills faster.",
  },
  {
    key: "LASER_CHARGES",
    label: "Laser Charges",
    min: 1,
    max: 10,
    step: 1,
    hint: "Higher: laser can be fired more times per pickup. Lower: laser runs out faster.",
  },
  {
    key: "LASER_COOLDOWN_MS",
    label: "Laser Cooldown",
    min: 50,
    max: 5000,
    step: 25,
    hint: "Higher: longer delay between laser shots. Lower: laser can fire again sooner.",
  },
  {
    key: "LASER_BEAM_DURATION_MS",
    label: "Laser Beam Duration",
    min: 30,
    max: 1000,
    step: 10,
    hint: "Higher: beam stays visible longer. Lower: beam flashes quickly.",
  },
  {
    key: "LASER_BEAM_WIDTH",
    label: "Laser Beam Width",
    min: 1,
    max: 40,
    step: 0.25,
    hint: "Higher: wider laser visuals and hit thickness. Lower: narrower beam.",
  },
  {
    key: "PROJECTILE_LIFETIME_MS",
    label: "Projectile Lifetime",
    min: 100,
    max: 6000,
    step: 25,
    hint: "Higher: bullets persist longer. Lower: bullets expire sooner.",
  },
  {
    key: "PROJECTILE_RADIUS",
    label: "Projectile Radius",
    min: 1,
    max: 20,
    step: 0.25,
    hint: "Higher: larger projectile collider. Lower: tighter projectile hitbox.",
  },
  {
    key: "PROJECTILE_VISUAL_GLOW_RADIUS",
    label: "Projectile Glow Radius",
    min: 1,
    max: 40,
    step: 0.25,
    hint: "Higher: larger glow halo. Lower: tighter glow around projectile.",
  },
  {
    key: "PILOT_DASH_COOLDOWN_MS",
    label: "Pilot Dash Cooldown",
    min: 20,
    max: 1000,
    step: 5,
    hint: "Higher: longer delay between pilot dashes. Lower: pilots can dash more often.",
  },
];

const TRAIL_FIELDS: ReadonlyArray<SliderField<TrailKey>> = [
  {
    key: "outerWidth",
    label: "Trail Outer Width",
    min: 0.1,
    max: 40,
    step: 0.1,
    hint: "Higher: larger soft neon envelope.",
  },
  {
    key: "midWidth",
    label: "Trail Mid Width",
    min: 0,
    max: 40,
    step: 0.1,
    hint: "Higher: thicker mid glow around the core.",
  },
  {
    key: "coreWidth",
    label: "Trail Core Width",
    min: 0,
    max: 20,
    step: 0.1,
    hint: "Higher: thicker bright center streak.",
  },
  {
    key: "outerAlpha",
    label: "Trail Outer Alpha",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "Higher: stronger outer haze intensity.",
  },
  {
    key: "midAlpha",
    label: "Trail Mid Alpha",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "Higher: brighter middle glow layer.",
  },
  {
    key: "coreAlpha",
    label: "Trail Core Alpha",
    min: 0,
    max: 1,
    step: 0.01,
    hint: "Higher: brighter center highlight.",
  },
];

export interface PhysicsLabController {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

interface PhysicsLabControllerOptions {
  onVisibilityChange?: (visible: boolean) => void;
}

export function createPhysicsLabController(
  game: Game,
  options: PhysicsLabControllerOptions = {},
): PhysicsLabController {
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const tapGuardUntilByElement = new WeakMap<EventTarget, number>();
  const shouldHandleTap = (
    target: EventTarget | null,
    guardMs: number = 340,
  ): boolean => {
    if (!isCoarsePointer || !target) return true;
    const now = performance.now();
    const guardUntil = tapGuardUntilByElement.get(target) ?? 0;
    if (now < guardUntil) {
      return false;
    }
    tapGuardUntilByElement.set(target, now + guardMs);
    return true;
  };

  let root: HTMLDivElement | null = null;
  let modeSelect: HTMLSelectElement | null = null;
  let statusEl: HTMLDivElement | null = null;
  let configInputs: Record<ConfigKey, HTMLInputElement> | null = null;
  let materialInputs: Record<MaterialKey, HTMLInputElement> | null = null;
  let globalInputs: Record<GlobalKey, HTMLInputElement> | null = null;
  let trailInputs: Record<TrailKey, HTMLInputElement> | null = null;
  let applyTimeout: number | null = null;
  let suppressApply = false;

  const setStatus = (message: string): void => {
    if (!statusEl) return;
    statusEl.textContent = message;
  };

  const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null;
  };

  const isModeOption = (value: unknown): value is BaseGameMode => {
    return typeof value === "string" && MODE_OPTIONS.includes(value as BaseGameMode);
  };

  const extractPastedTuning = (
    value: unknown,
  ): {
    baseMode?: BaseGameMode;
    tuning?: DebugPhysicsTuningPayload | null;
    trailTuning?: Partial<ShipTrailVisualTuning>;
  } | null => {
    if (!isRecord(value)) return null;

    const baseModeValue = value.baseMode;
    const tuningSource = "tuning" in value ? value.tuning : value;
    const hasRootTuningKey = "tuning" in value;
    const trailSource =
      "trailTuning" in value ? value.trailTuning : undefined;

    let baseMode: BaseGameMode | undefined;
    if (baseModeValue !== undefined) {
      if (!isModeOption(baseModeValue)) {
        return null;
      }
      baseMode = baseModeValue;
    }

    if (tuningSource === null) {
      return {
        baseMode,
        tuning: null,
        trailTuning: isRecord(trailSource)
          ? (trailSource as Partial<ShipTrailVisualTuning>)
          : undefined,
      };
    }
    if (!isRecord(tuningSource)) {
      return null;
    }

    const hasKnownTuningKey =
      "configOverrides" in tuningSource ||
      "materialOverrides" in tuningSource ||
      "globalOverrides" in tuningSource;
    if (!hasKnownTuningKey) {
      const hasTrail = isRecord(trailSource);
      if (!hasRootTuningKey && !hasTrail) {
        return null;
      }
      return {
        baseMode,
        tuning: hasRootTuningKey ? null : undefined,
        trailTuning: hasTrail
          ? (trailSource as Partial<ShipTrailVisualTuning>)
          : undefined,
      };
    }

    return {
      baseMode,
      tuning: tuningSource as DebugPhysicsTuningPayload,
      trailTuning: isRecord(trailSource)
        ? (trailSource as Partial<ShipTrailVisualTuning>)
        : undefined,
    };
  };

  const getSnapshot = (): DebugPhysicsTuningSnapshot | null => {
    const snapshot = game.getDebugPhysicsTuningSnapshot();
    if (!snapshot) {
      setStatus("Physics lab requires local mode with debug tools enabled.");
    }
    return snapshot;
  };

  const buildModeDefaults = (baseMode: BaseGameMode): DebugPhysicsTuningSnapshot => {
    const settings = game.getAdvancedSettings();
    return {
      config: getActiveConfigFromSettings(baseMode, settings, null),
      materials: resolveMaterialValuesFromSettings(settings, null),
      globals: resolveGlobalValues(null),
      overrides: null,
    };
  };

  const queueApply = (): void => {
    if (suppressApply) return;
    if (applyTimeout) {
      window.clearTimeout(applyTimeout);
    }
    applyTimeout = window.setTimeout(() => {
      applyTimeout = null;
      const payload = buildPayloadFromInputs();
      const ok = game.setDebugPhysicsTuning(payload);
      if (!ok) return;
      applyTrailFromInputs();
      setStatus("Applied local lab overrides");
    }, 60);
  };

  const updateValueLabel = (input: HTMLInputElement): void => {
    const outputId = input.getAttribute("data-output-id");
    if (!outputId) return;
    const output = document.getElementById(outputId);
    if (!output) return;
    const num = Number(input.value);
    if (!Number.isFinite(num)) {
      output.textContent = input.value;
      return;
    }
    output.textContent = num.toPrecision(5).replace(/\.?0+$/, "");
  };

  const bindSliderEvents = (
    input: HTMLInputElement,
    onChange: () => void,
  ): void => {
    input.addEventListener("input", () => {
      updateValueLabel(input);
      onChange();
    });
    input.addEventListener("change", () => {
      updateValueLabel(input);
      onChange();
    });
  };

  const writeSnapshotToInputs = (snapshot: DebugPhysicsTuningSnapshot): void => {
    if (!configInputs || !materialInputs || !globalInputs || !trailInputs) return;
    suppressApply = true;
    for (const field of CONFIG_FIELDS) {
      const input = configInputs[field.key];
      input.value = String(snapshot.config[field.key]);
      updateValueLabel(input);
    }
    for (const field of MATERIAL_FIELDS) {
      const input = materialInputs[field.key];
      input.value = String(snapshot.materials[field.key]);
      updateValueLabel(input);
    }
    for (const field of GLOBAL_FIELDS) {
      const input = globalInputs[field.key];
      input.value = String(snapshot.globals[field.key]);
      updateValueLabel(input);
    }
    const trailTuning = game.getShipTrailVisualTuning();
    for (const field of TRAIL_FIELDS) {
      const input = trailInputs[field.key];
      input.value = String(trailTuning[field.key]);
      updateValueLabel(input);
    }
    suppressApply = false;
  };

  const buildTrailTuningFromInputs = (): Partial<ShipTrailVisualTuning> => {
    if (!trailInputs) {
      return game.getShipTrailVisualTuning();
    }
    const current = game.getShipTrailVisualTuning();
    const next: Partial<ShipTrailVisualTuning> = {};
    for (const field of TRAIL_FIELDS) {
      const value = Number(trailInputs[field.key].value);
      next[field.key] = Number.isFinite(value) ? value : current[field.key];
    }
    return next;
  };

  const applyTrailFromInputs = (): void => {
    game.setShipTrailVisualTuning(buildTrailTuningFromInputs());
  };

  const buildPayloadFromInputs = (): DebugPhysicsTuningPayload | null => {
    const baseMode = modeSelect
      ? (modeSelect.value as BaseGameMode)
      : game.getBaseMode();
    const defaults = buildModeDefaults(baseMode);
    const configOverrides: DebugPhysicsTuningPayload["configOverrides"] = {};
    const materialOverrides: DebugPhysicsTuningPayload["materialOverrides"] = {};
    const globalOverrides: DebugPhysicsTuningPayload["globalOverrides"] = {};
    if (configInputs) {
      for (const field of CONFIG_FIELDS) {
        const value = Number(configInputs[field.key].value);
        if (
          Number.isFinite(value) &&
          Math.abs(value - defaults.config[field.key]) > 1e-9
        ) {
          configOverrides[field.key] = value;
        }
      }
    }
    if (materialInputs) {
      for (const field of MATERIAL_FIELDS) {
        const value = Number(materialInputs[field.key].value);
        if (
          Number.isFinite(value) &&
          Math.abs(value - defaults.materials[field.key]) > 1e-9
        ) {
          materialOverrides[field.key] = value;
        }
      }
    }
    if (globalInputs) {
      for (const field of GLOBAL_FIELDS) {
        const value = Number(globalInputs[field.key].value);
        if (
          Number.isFinite(value) &&
          Math.abs(value - defaults.globals[field.key]) > 1e-9
        ) {
          globalOverrides[field.key] = value;
        }
      }
    }

    const hasConfig = Object.keys(configOverrides).length > 0;
    const hasMaterials = Object.keys(materialOverrides).length > 0;
    const hasGlobals = Object.keys(globalOverrides).length > 0;
    if (!hasConfig && !hasMaterials && !hasGlobals) {
      return null;
    }

    return {
      configOverrides: hasConfig ? configOverrides : undefined,
      materialOverrides: hasMaterials ? materialOverrides : undefined,
      globalOverrides: hasGlobals ? globalOverrides : undefined,
    };
  };

  const refreshFromSim = (): void => {
    const trailTuning = game.getShipTrailVisualTuning();
    if (trailInputs) {
      suppressApply = true;
      for (const field of TRAIL_FIELDS) {
        const input = trailInputs[field.key];
        input.value = String(trailTuning[field.key]);
        updateValueLabel(input);
      }
      suppressApply = false;
    }
    const snapshot = getSnapshot();
    if (!snapshot) return;
    writeSnapshotToInputs(snapshot);
    if (modeSelect) {
      modeSelect.value = game.getBaseMode();
    }
    setStatus("Loaded simulation + trail values");
  };

  const handleModeChange = (): void => {
    if (!modeSelect) return;
    const mode = modeSelect.value as BaseGameMode;
    game.setGameMode(mode, "local");
    game.setDebugPhysicsTuning(null);
    window.setTimeout(() => {
      refreshFromSim();
    }, 0);
  };

  const copyPayload = async (): Promise<void> => {
    if (!modeSelect) return;
    const payload = {
      baseMode: modeSelect.value as BaseGameMode,
      tuning: buildPayloadFromInputs(),
      trailTuning: buildTrailTuningFromInputs(),
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied tuning JSON to clipboard");
    } catch {
      setStatus("Clipboard blocked. Copy from popup.");
      window.prompt("Copy physics tuning JSON", text);
    }
  };

  const pastePayload = async (): Promise<void> => {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      setStatus("Clipboard read blocked. Allow clipboard access and try again.");
      return;
    }

    if (!text || text.trim().length === 0) {
      setStatus("Clipboard is empty.");
      return;
    }

    let parsedRaw: unknown;
    try {
      parsedRaw = JSON.parse(text);
    } catch {
      setStatus("Clipboard does not contain valid JSON.");
      return;
    }

    const parsed = extractPastedTuning(parsedRaw);
    if (!parsed) {
      setStatus("JSON shape not recognized. Expected { baseMode, tuning, trailTuning }.");
      return;
    }

    if (parsed.baseMode) {
      game.setGameMode(parsed.baseMode, "local");
      if (modeSelect) {
        modeSelect.value = parsed.baseMode;
      }
    }

    if (parsed.tuning !== undefined) {
      const ok = game.setDebugPhysicsTuning(parsed.tuning);
      if (!ok) return;
    } else if (parsed.baseMode) {
      const ok = game.setDebugPhysicsTuning(null);
      if (!ok) return;
    }
    if (parsed.trailTuning) {
      game.setShipTrailVisualTuning(parsed.trailTuning);
    }

    window.setTimeout(() => {
      refreshFromSim();
    }, 0);
    setStatus("Pasted and applied tuning JSON");
  };

  const ensureMounted = (): void => {
    if (root) return;
    injectStyles();

    root = document.createElement("div");
    root.className = "qa-physics-lab hidden";

    const panel = document.createElement("div");
    panel.className = "qa-physics-lab-panel";

    const header = document.createElement("div");
    header.className = "qa-physics-lab-header";
    header.innerHTML =
      '<h3 class="qa-physics-lab-title">Physics Lab</h3>' +
      '<button type="button" class="qa-physics-lab-close">Close</button>';

    const controls = document.createElement("div");
    controls.className = "qa-physics-lab-controls";

    modeSelect = document.createElement("select");
    modeSelect.className = "qa-physics-lab-select";
    for (const mode of MODE_OPTIONS) {
      const option = document.createElement("option");
      option.value = mode;
      option.textContent = mode;
      modeSelect.appendChild(option);
    }
    modeSelect.addEventListener("change", handleModeChange);

    const reloadBtn = document.createElement("button");
    reloadBtn.type = "button";
    reloadBtn.className = "qa-physics-lab-btn";
    reloadBtn.textContent = "Reload";
    reloadBtn.addEventListener("click", (event) => {
      if (!shouldHandleTap(event.currentTarget)) return;
      refreshFromSim();
    });

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "qa-physics-lab-btn";
    resetBtn.textContent = "Reset";
    resetBtn.addEventListener("click", (event) => {
      if (!shouldHandleTap(event.currentTarget)) return;
      game.resetShipTrailVisualTuning();
      const ok = game.setDebugPhysicsTuning(null);
      if (!ok) return;
      refreshFromSim();
      setStatus("Reset physics + trail to defaults");
    });

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "qa-physics-lab-btn";
    copyBtn.textContent = "Copy JSON";
    copyBtn.addEventListener("click", (event) => {
      if (!shouldHandleTap(event.currentTarget)) return;
      void copyPayload();
    });

    const pasteBtn = document.createElement("button");
    pasteBtn.type = "button";
    pasteBtn.className = "qa-physics-lab-btn";
    pasteBtn.textContent = "Paste JSON";
    pasteBtn.addEventListener("click", (event) => {
      if (!shouldHandleTap(event.currentTarget)) return;
      void pastePayload();
    });

    controls.appendChild(modeSelect);
    controls.appendChild(reloadBtn);
    controls.appendChild(resetBtn);
    controls.appendChild(copyBtn);
    controls.appendChild(pasteBtn);

    const sections = document.createElement("div");
    sections.className = "qa-physics-lab-sections";
    const leftColumn = document.createElement("div");
    leftColumn.className = "qa-physics-lab-column";
    const rightColumn = document.createElement("div");
    rightColumn.className = "qa-physics-lab-column";

    const configSection = document.createElement("section");
    configSection.className = "qa-physics-lab-section";
    configSection.innerHTML = '<h4 class="qa-physics-lab-heading">Config</h4>';

    const configGrid = document.createElement("div");
    configGrid.className = "qa-physics-lab-grid";
    configInputs = {} as Record<ConfigKey, HTMLInputElement>;

    CONFIG_FIELDS.forEach((field) => {
      const row = buildSliderRow(field, "cfg", queueApply);
      configInputs![field.key] = row.input;
      configGrid.appendChild(row.container);
    });

    configSection.appendChild(configGrid);

    const materialsSection = document.createElement("section");
    materialsSection.className = "qa-physics-lab-section";
    materialsSection.innerHTML =
      '<h4 class="qa-physics-lab-heading">Materials</h4>';

    const materialsGrid = document.createElement("div");
    materialsGrid.className = "qa-physics-lab-grid";
    materialInputs = {} as Record<MaterialKey, HTMLInputElement>;

    MATERIAL_FIELDS.forEach((field) => {
      const row = buildSliderRow(field, "mat", queueApply);
      materialInputs![field.key] = row.input;
      materialsGrid.appendChild(row.container);
    });
    materialsSection.appendChild(materialsGrid);

    const globalsSection = document.createElement("section");
    globalsSection.className = "qa-physics-lab-section";
    globalsSection.innerHTML = '<h4 class="qa-physics-lab-heading">Globals</h4>';

    const globalsGrid = document.createElement("div");
    globalsGrid.className = "qa-physics-lab-grid";
    globalInputs = {} as Record<GlobalKey, HTMLInputElement>;

    GLOBAL_FIELDS.forEach((field) => {
      const row = buildSliderRow(field, "glob", queueApply);
      globalInputs![field.key] = row.input;
      globalsGrid.appendChild(row.container);
    });
    globalsSection.appendChild(globalsGrid);

    const trailSection = document.createElement("section");
    trailSection.className = "qa-physics-lab-section";
    trailSection.innerHTML = '<h4 class="qa-physics-lab-heading">Ship Trail (Visual)</h4>';

    const trailGrid = document.createElement("div");
    trailGrid.className = "qa-physics-lab-grid";
    trailInputs = {} as Record<TrailKey, HTMLInputElement>;

    TRAIL_FIELDS.forEach((field) => {
      const row = buildSliderRow(field, "trail", queueApply);
      trailInputs![field.key] = row.input;
      trailGrid.appendChild(row.container);
    });
    trailSection.appendChild(trailGrid);

    leftColumn.appendChild(configSection);
    rightColumn.appendChild(materialsSection);
    rightColumn.appendChild(globalsSection);
    rightColumn.appendChild(trailSection);
    sections.appendChild(leftColumn);
    sections.appendChild(rightColumn);

    statusEl = document.createElement("div");
    statusEl.className = "qa-physics-lab-status";
    statusEl.textContent = "Ready";

    panel.appendChild(header);
    panel.appendChild(controls);
    panel.appendChild(sections);
    panel.appendChild(statusEl);
    root.appendChild(panel);
    document.body.appendChild(root);

    const closeBtn = panel.querySelector(
      ".qa-physics-lab-close",
    ) as HTMLButtonElement | null;
    closeBtn?.addEventListener("click", (event) => {
      if (!shouldHandleTap(event.currentTarget)) return;
      close();
    });
  };

  const open = (): void => {
    ensureMounted();
    if (!root) return;
    const wasHidden = root.classList.contains("hidden");
    root.classList.remove("hidden");
    if (wasHidden) {
      options.onVisibilityChange?.(true);
    }
    refreshFromSim();
  };

  const close = (): void => {
    if (!root || root.classList.contains("hidden")) return;
    root.classList.add("hidden");
    options.onVisibilityChange?.(false);
  };

  const isOpen = (): boolean => {
    return Boolean(root && !root.classList.contains("hidden"));
  };

  return { open, close, isOpen };

  function buildSliderRow<T extends string>(
    field: SliderField<T>,
    prefix: string,
    onChange: () => void,
  ): { container: HTMLDivElement; input: HTMLInputElement } {
    const row = document.createElement("div");
    row.className = "qa-physics-lab-row";

    const label = document.createElement("label");
    label.className = "qa-physics-lab-label";
    label.textContent = field.label;
    label.setAttribute("title", field.hint);

    const output = document.createElement("span");
    output.className = "qa-physics-lab-value";
    const outputId = "qaPhysicsLabValue_" + prefix + "_" + field.key;
    output.id = outputId;
    output.textContent = "0";

    const input = document.createElement("input");
    input.className = "qa-physics-lab-slider";
    input.type = "range";
    input.min = String(field.min);
    input.max = String(field.max);
    input.step = String(field.step);
    input.value = "0";
    input.setAttribute("data-output-id", outputId);
    bindSliderEvents(input, onChange);

    row.appendChild(label);
    row.appendChild(output);
    row.appendChild(input);
    const hint = document.createElement("div");
    hint.className = "qa-physics-lab-hint";
    hint.textContent = field.hint;
    row.appendChild(hint);
    return { container: row, input };
  }
}

function injectStyles(): void {
  if (document.getElementById("qaPhysicsLabStyles")) return;
  const style = document.createElement("style");
  style.id = "qaPhysicsLabStyles";
  style.textContent = `
    .qa-physics-lab.hidden {
      display: none;
    }

    .qa-physics-lab {
      position: fixed;
      right: calc(100% - var(--box-right) + var(--hud-side-gap));
      top: calc(var(--box-top) + var(--hud-top-pad) + 52px);
      z-index: 320;
      pointer-events: none;
    }

    .qa-physics-lab-panel {
      pointer-events: auto;
      width: min(760px, calc(min(var(--box-width), var(--box-height)) - 24px));
      max-width: calc(var(--box-width) - 20px);
      max-height: calc(var(--box-height) - 24px);
      overflow: auto;
      background: rgba(6, 8, 20, 0.96);
      border: 1px solid rgba(255, 180, 0, 0.35);
      border-radius: 14px;
      box-shadow: 0 20px 44px rgba(0, 0, 0, 0.55);
      padding: 14px;
    }

    .qa-physics-lab-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
    }

    .qa-physics-lab-title {
      margin: 0;
      font-family: 'Orbitron', sans-serif;
      font-size: 0.92rem;
      letter-spacing: 0.08em;
      color: #ffcf47;
      text-transform: uppercase;
    }

    .qa-physics-lab-close,
    .qa-physics-lab-btn,
    .qa-physics-lab-select {
      border: 1px solid rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.92);
      border-radius: 8px;
      font-size: 0.72rem;
      font-family: 'Orbitron', sans-serif;
      letter-spacing: 0.05em;
      padding: 6px 8px;
    }

    .qa-physics-lab-controls {
      display: grid;
      grid-template-columns: 1.15fr repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 10px;
    }

    .qa-physics-lab-sections {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      align-items: start;
    }

    .qa-physics-lab-column {
      display: grid;
      gap: 12px;
      align-content: start;
    }

    .qa-physics-lab-section {
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 10px;
      padding: 8px;
      background: rgba(255, 255, 255, 0.02);
      align-self: start;
    }

    .qa-physics-lab-heading {
      margin: 0 0 8px;
      font-family: 'Orbitron', sans-serif;
      font-size: 0.66rem;
      letter-spacing: 0.1em;
      color: rgba(255, 214, 110, 0.86);
      text-transform: uppercase;
    }

    .qa-physics-lab-grid {
      display: grid;
      gap: 8px;
    }

    .qa-physics-lab-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 4px 8px;
      align-items: center;
    }

    .qa-physics-lab-label {
      color: rgba(230, 237, 255, 0.85);
      font-size: 0.64rem;
      letter-spacing: 0.04em;
    }

    .qa-physics-lab-value {
      color: rgba(157, 233, 255, 0.92);
      font-size: 0.62rem;
      font-family: 'Orbitron', sans-serif;
      letter-spacing: 0.05em;
      min-width: 52px;
      text-align: right;
    }

    .qa-physics-lab-slider {
      grid-column: 1 / -1;
      width: 100%;
    }

    .qa-physics-lab-hint {
      grid-column: 1 / -1;
      color: rgba(190, 207, 230, 0.65);
      font-size: 0.56rem;
      line-height: 1.3;
      margin-top: -1px;
    }

    .qa-physics-lab-status {
      margin-top: 10px;
      color: rgba(255, 255, 255, 0.75);
      font-size: 0.64rem;
      line-height: 1.35;
    }

    @media (max-width: 800px) {
      .qa-physics-lab {
        right: calc(100% - var(--box-right) + 8px);
        top: calc(var(--box-top) + 8px);
      }

      .qa-physics-lab-panel {
        width: min(560px, calc(min(var(--box-width), var(--box-height)) - 16px));
        max-width: calc(var(--box-width) - 16px);
        max-height: calc(var(--box-height) - 16px);
      }

      .qa-physics-lab-controls {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .qa-physics-lab-sections {
        grid-template-columns: 1fr;
      }
    }

    @media (pointer: coarse) and (orientation: portrait) {
      .qa-physics-lab {
        left: calc(var(--box-left) + 8px);
        right: auto;
        top: calc(var(--box-top) + 8px);
      }

      .qa-physics-lab-panel {
        width: min(560px, calc(100vw - 16px), calc(var(--box-width) - 12px));
        max-width: calc(100vw - 16px);
        max-height: min(74vh, calc(var(--box-height) - 70px));
        padding: 12px;
      }

      .qa-physics-lab-controls {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .qa-physics-lab-close,
      .qa-physics-lab-btn,
      .qa-physics-lab-select {
        min-height: 40px;
        font-size: 0.74rem;
      }

      .qa-physics-lab-sections {
        grid-template-columns: 1fr;
      }
    }
  `;
  document.head.appendChild(style);
}
