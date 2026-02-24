import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { C, type HapticType } from "./config";
import { $ } from "./utils";

export interface ShipDef {
  id: string;
  name: string;
  model: string;
  price: number;
}

export const SHIPS: ShipDef[] = [
  { id: "fighter_01", name: "Viper",    model: "assets/models/SM_Ship_Fighter_01.fbx", price: 0 },
  { id: "fighter_02", name: "Phantom",  model: "assets/models/SM_Ship_Fighter_02.fbx", price: 50 },
  { id: "fighter_03", name: "Wraith",   model: "assets/models/SM_Ship_Fighter_03.fbx", price: 150 },
  { id: "fighter_04", name: "Spectre",  model: "assets/models/SM_Ship_Fighter_04.fbx", price: 300 },
  { id: "fighter_05", name: "Nemesis",  model: "assets/models/SM_Ship_Fighter_05.fbx", price: 500 },
];

const LS_OWNED = "jetRush_ownedShips";
const LS_SELECTED = "jetRush_selectedShip";

export class Shop {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private currentModel: THREE.Object3D | null = null;
  private loader = new FBXLoader();
  private baseTexture: THREE.Texture;
  private emissiveTexture: THREE.Texture;
  private modelCache = new Map<string, THREE.Object3D>();
  private shipMat: THREE.MeshStandardMaterial | null = null;

  private index = 0;
  private owned: Set<string>;
  private selected: string;
  private animId = 0;
  private open = false;
  private lastPreviewW = 0;
  private lastPreviewH = 0;

  private getOrbs: () => number;
  private setOrbs: (n: number) => void;
  private haptic: (t: HapticType) => void;
  private playFX: () => void;
  private onShipChanged: (modelPath: string) => void;

  constructor(
    getOrbs: () => number,
    setOrbs: (n: number) => void,
    haptic: (t: HapticType) => void,
    playFX: () => void,
    onShipChanged: (modelPath: string) => void,
  ) {
    this.getOrbs = getOrbs;
    this.setOrbs = setOrbs;
    this.haptic = haptic;
    this.playFX = playFX;
    this.onShipChanged = onShipChanged;

    this.owned = this.loadOwned();
    this.selected = this.loadSelected();
    this.index = Math.max(0, SHIPS.findIndex((s) => s.id === this.selected));

    const texLoader = new THREE.TextureLoader();
    this.baseTexture = texLoader.load("assets/textures/PolygonSciFiSpace_Texture_01_A.png");
    this.emissiveTexture = texLoader.load("assets/textures/PolygonSciFiSpace_Emissive_01.png");
    this.baseTexture.colorSpace = THREE.SRGBColorSpace;
    this.baseTexture.flipY = false;
    this.emissiveTexture.flipY = false;

    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    this.camera.position.set(0, 2.5, 8);
    this.camera.lookAt(0, 0.5, 0);

    this.scene.add(new THREE.AmbientLight(0x334466, 1.2));
    const sun = new THREE.DirectionalLight(0x6688bb, 1.8);
    sun.position.set(5, 12, 8);
    this.scene.add(sun);
    const back = new THREE.DirectionalLight(0xff4466, 0.4);
    back.position.set(-4, 6, -5);
    this.scene.add(back);
    this.scene.add(new THREE.HemisphereLight(0x223344, 0x0a0a14, 0.8));

    this.bindUI();
  }

  getSelectedModelPath(): string {
    const ship = SHIPS.find((s) => s.id === this.selected);
    return ship ? ship.model : SHIPS[0].model;
  }

  private bindUI(): void {
    const shopBtn = $("shopBtn");
    const shopModal = $("shopModal");
    const prevBtn = $("shopPrev");
    const nextBtn = $("shopNext");
    const buyBtn = $("shopBuyBtn");
    const closeBtn = $("shopCloseBtn");

    shopBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.show();
    });

    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.hide();
    });

    shopModal.addEventListener("click", (e) => {
      if (e.target === shopModal) this.hide();
    });

    prevBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.navigate(-1);
    });

    nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.navigate(1);
    });

    buyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.handleBuy();
    });
  }

  show(): void {
    this.open = true;
    this.haptic("light");
    this.playFX();

    const modal = $("shopModal");
    modal.classList.remove("hidden");

    if (!this.renderer) {
      const canvas = $("shopCanvas") as HTMLCanvasElement;
      this.renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.0;
    }

    this.updateUI();
    requestAnimationFrame(() => {
      this.resizePreview();
      this.loadShipModel(this.index);
      this.startLoop();
    });
  }

  hide(): void {
    this.open = false;
    this.haptic("light");
    $("shopModal").classList.add("hidden");
    this.stopLoop();
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.currentModel = null;
    }
    this.lastPreviewW = 0;
    this.lastPreviewH = 0;
  }

  isOpen(): boolean {
    return this.open;
  }

  private navigate(dir: number): void {
    this.haptic("light");
    this.playFX();
    this.index = (this.index + dir + SHIPS.length) % SHIPS.length;
    this.loadShipModel(this.index);
    this.updateUI();
  }

  private handleBuy(): void {
    const ship = SHIPS[this.index];

    if (this.owned.has(ship.id)) {
      this.selected = ship.id;
      this.saveSelected();
      this.haptic("success");
      this.playFX();
      this.onShipChanged(ship.model);
      this.updateUI();
      return;
    }

    const orbs = this.getOrbs();
    if (orbs < ship.price) {
      this.haptic("error");
      const btn = $("shopBuyBtn");
      btn.classList.add("shop-btn-shake");
      setTimeout(() => btn.classList.remove("shop-btn-shake"), 400);
      return;
    }

    this.setOrbs(orbs - ship.price);
    this.owned.add(ship.id);
    this.saveOwned();
    this.selected = ship.id;
    this.saveSelected();
    this.haptic("success");
    this.playFX();
    this.onShipChanged(ship.model);
    this.updateUI();
  }

  private updateUI(): void {
    const ship = SHIPS[this.index];
    const isOwned = this.owned.has(ship.id);
    const isSelected = this.selected === ship.id;
    const canAfford = this.getOrbs() >= ship.price;

    $("shopShipName").textContent = ship.name;
    $("shopOrbCount").textContent = String(this.getOrbs());

    const btn = $("shopBuyBtn");
    const btnLabel = $("shopBuyLabel");
    const btnPrice = $("shopBuyPrice");

    if (isSelected) {
      btnLabel.textContent = "Equipped";
      btnPrice.textContent = "";
      btn.className = "shop-action-btn shop-equipped";
    } else if (isOwned) {
      btnLabel.textContent = "Select";
      btnPrice.textContent = "";
      btn.className = "shop-action-btn shop-select";
    } else {
      btnLabel.textContent = "Buy";
      btnPrice.textContent = String(ship.price);
      btn.className = canAfford
        ? "shop-action-btn shop-buy"
        : "shop-action-btn shop-locked";
    }

    const dots = $("shopDots");
    if (dots.children.length !== SHIPS.length) {
      dots.innerHTML = "";
      for (let i = 0; i < SHIPS.length; i++) {
        const dot = document.createElement("span");
        dot.className = "shop-dot";
        dots.appendChild(dot);
      }
    }
    for (let i = 0; i < dots.children.length; i++) {
      const dot = dots.children[i] as HTMLElement;
      if (i === this.index) {
        dot.classList.add("active");
      } else {
        dot.classList.remove("active");
      }
    }
  }

  private ensureShipMat(): THREE.MeshStandardMaterial {
    if (!this.shipMat) {
      this.shipMat = new THREE.MeshStandardMaterial({
        map: this.baseTexture,
        emissiveMap: this.emissiveTexture,
        emissive: 0xffffff,
        emissiveIntensity: 2.0,
        roughness: 0.4,
        metalness: 0.6,
      });
    }
    return this.shipMat;
  }

  private loadShipModel(idx: number): void {
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.currentModel = null;
    }

    if (this.renderer) {
      this.renderer.clear();
    }

    const ship = SHIPS[idx];
    const cached = this.modelCache.get(ship.id);

    if (cached) {
      this.attachModel(cached);
      return;
    }

    this.loader.load(
      ship.model,
      (fbx) => {
        if (!this.open) return;

        const mat = this.ensureShipMat();
        fbx.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = mat;
          }
        });

        fbx.scale.setScalar(C.PLANE_SCALE * 0.6);
        fbx.position.set(0, 0, 0);
        fbx.rotation.y = 0;

        this.modelCache.set(ship.id, fbx);
        this.attachModel(fbx);
      },
      undefined,
      (err) => console.error("[Shop] FBX load error:", err),
    );
  }

  private attachModel(model: THREE.Object3D): void {
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
    }
    model.rotation.y = 0;
    this.scene.add(model);
    this.currentModel = model;
  }

  private resizePreview(): void {
    if (!this.renderer) return;
    const container = $("shopPreviewWrap");
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w < 1 || h < 1) return;
    if (w === this.lastPreviewW && h === this.lastPreviewH) return;
    this.lastPreviewW = w;
    this.lastPreviewH = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private startLoop(): void {
    this.stopLoop();
    const tick = () => {
      if (!this.open) return;
      if (this.currentModel) {
        this.currentModel.rotation.y += 0.012;
      }
      this.resizePreview();
      this.renderer?.render(this.scene, this.camera);
      this.animId = requestAnimationFrame(tick);
    };
    this.animId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = 0;
    }
  }

  private loadOwned(): Set<string> {
    try {
      const raw = localStorage.getItem(LS_OWNED);
      if (raw) return new Set(JSON.parse(raw));
    } catch { /* ignore */ }
    return new Set([SHIPS[0].id]);
  }

  private saveOwned(): void {
    try {
      localStorage.setItem(LS_OWNED, JSON.stringify([...this.owned]));
    } catch { /* ignore */ }
  }

  private loadSelected(): string {
    try {
      return localStorage.getItem(LS_SELECTED) || SHIPS[0].id;
    } catch {
      return SHIPS[0].id;
    }
  }

  private saveSelected(): void {
    try {
      localStorage.setItem(LS_SELECTED, this.selected);
    } catch { /* ignore */ }
  }
}
