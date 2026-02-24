import type { Settings, HapticType, GameState } from "./config";
import { AudioManager } from "./audio";
import { $ } from "./utils";

export interface UIElements {
  startScr: HTMLElement;
  overScr: HTMLElement;
  modal: HTMLElement;
  setBtn: HTMLElement;
  hud: HTMLElement;
  scoreTxt: HTMLElement;
  finalTxt: HTMLElement;
  mobCtrl: HTMLElement;
  hudOrbs: HTMLElement;
  orbDisplay: HTMLElement;
  startOrbTotal: HTMLElement;
  finalOrbs: HTMLElement;
}

/** Caches all UI DOM elements. */
export function cacheUI(): UIElements {
  return {
    startScr: $("startScreen"),
    overScr: $("gameOverScreen"),
    modal: $("settingsModal"),
    setBtn: $("settingsBtn"),
    hud: $("hud"),
    scoreTxt: $("scoreDisplay"),
    finalTxt: $("finalScore"),
    mobCtrl: $("mobileControls"),
    hudOrbs: $("hudOrbs"),
    orbDisplay: $("orbDisplay"),
    startOrbTotal: $("startOrbTotal"),
    finalOrbs: $("finalOrbs"),
  };
}

/* ── Settings ── */

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem("jetRush_set");
    if (raw) {
      const p = JSON.parse(raw);
      return {
        music: p.music ?? true,
        fx: p.fx ?? true,
        haptics: p.haptics ?? true,
      };
    }
  } catch (_) {
    console.log("[loadSettings]", "Parse error, using defaults");
  }
  return { music: true, fx: true, haptics: true };
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem("jetRush_set", JSON.stringify(settings));
}

export function applySettingsUI(settings: Settings): void {
  const mTog = $("musicToggle");
  const fTog = $("fxToggle");
  const hTog = $("hapticsToggle");

  mTog.classList.toggle("active", settings.music);
  fTog.classList.toggle("active", settings.fx);
  hTog.classList.toggle("active", settings.haptics);

  $("musicState").textContent = settings.music ? "On" : "Off";
  $("fxState").textContent = settings.fx ? "On" : "Off";
  $("hapticsState").textContent = settings.haptics ? "On" : "Off";
}

/** Binds settings modal open/close and toggle buttons. */
export function bindSettingsUI(
  getState: () => GameState,
  settings: Settings,
  sfx: AudioManager,
  haptic: (type: HapticType) => void,
  playFX: (kind: "ui" | "crash") => void,
  onSettingsOpen?: () => void,
  onSettingsClose?: () => void,
): void {
  const modal = $("settingsModal");
  const setBtn = $("settingsBtn");
  const mTog = $("musicToggle");
  const fTog = $("fxToggle");
  const hTog = $("hapticsToggle");

  setBtn.addEventListener("click", () => {
    if (getState() !== "PLAYING") return;
    onSettingsOpen?.();
    modal.classList.remove("hidden");
    haptic("light");
    playFX("ui");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
      onSettingsClose?.();
    }
  });

  let lastToggle = 0;
  const tog = (cb: () => void) => (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    if (Date.now() - lastToggle < 300) return;
    lastToggle = Date.now();
    haptic("light");
    cb();
  };

  mTog.addEventListener(
    "click",
    tog(() => {
      settings.music = !settings.music;
      saveSettings(settings);
      applySettingsUI(settings);
      playFX("ui");
      if (settings.music && (getState() === "PLAYING" || getState() === "PAUSED")) sfx.musicOn();
      else sfx.musicOff();
    }),
  );

  fTog.addEventListener(
    "click",
    tog(() => {
      settings.fx = !settings.fx;
      saveSettings(settings);
      applySettingsUI(settings);
      playFX("ui");
    }),
  );

  hTog.addEventListener(
    "click",
    tog(() => {
      settings.haptics = !settings.haptics;
      saveSettings(settings);
      applySettingsUI(settings);
      playFX("ui");
    }),
  );
}

/* ── Screen transitions ── */

export function showPlaying(ui: UIElements): void {
  ui.startScr.classList.add("hidden");
  ui.overScr.classList.add("hidden");
  ui.modal.classList.add("hidden");
  ui.setBtn.classList.remove("hidden");
  ui.hud.classList.remove("hidden");
  ui.hudOrbs.classList.remove("hidden");
  ui.scoreTxt.textContent = "0";
  ui.orbDisplay.textContent = "0";
}

export function showGameOver(
  ui: UIElements,
  score: number,
  orbsThisRun: number,
): void {
  ui.setBtn.classList.add("hidden");
  ui.hud.classList.add("hidden");
  ui.hudOrbs.classList.add("hidden");
  ui.mobCtrl.classList.add("hidden");
  ui.modal.classList.add("hidden");
  ui.finalTxt.textContent = String(score);
  ui.finalOrbs.textContent = String(orbsThisRun);
  ui.overScr.classList.remove("hidden");
}

export function updateStartOrbTotal(ui: UIElements, total: number): void {
  ui.startOrbTotal.textContent = String(total)+" Orbs";
}
