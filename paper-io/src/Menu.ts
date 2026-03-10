import * as THREE from "three";
import { type Difficulty } from "./constants.ts";
import { SkinSystem, type SkinDef } from "./SkinSystem.ts";

export interface MenuConfig {
  botCount: number;
  difficulty: Difficulty;
  playerSkinId: string;
}

export class Menu {
  private menuScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private pauseOverlay: HTMLElement;
  private shopModal: HTMLElement;
  private skinSystem: SkinSystem;
  private onPlay: ((config: MenuConfig) => void) | null = null;
  private onPlayAgain: (() => void) | null = null;
  private onMainMenu: (() => void) | null = null;
  private config: MenuConfig = {
    botCount: 5,
    difficulty: "medium",
    playerSkinId: "cyan",
  };
  private previewRenderer: THREE.WebGLRenderer | null = null;
  private previewScene: THREE.Scene | null = null;
  private previewCamera: THREE.PerspectiveCamera | null = null;
  private previewCache: Map<string, string> = new Map();
  private previewRendererUnavailable = false;
  private lastTapAt = 0;

  constructor(skinSystem: SkinSystem) {
    this.skinSystem = skinSystem;
    this.menuScreen = document.getElementById("menu-screen")!;
    this.gameOverScreen = document.getElementById("game-over")!;
    this.pauseOverlay = document.getElementById("pause-overlay")!;
    this.shopModal = document.getElementById("shop-modal")!;

    this.setupMenu();
  }

  private setupMenu(): void {
    this.buildShop();

    document.getElementById("play-btn")!.addEventListener(
      "click",
      this.guardMenuTap("play", () => this.onPlay?.(this.config)),
    );

    document.getElementById("how-to-toggle")!.addEventListener("click", () => {
      document.getElementById("how-to-content")!.classList.toggle("show");
    });

    document.getElementById("go-play-again")!.addEventListener(
      "click",
      this.guardMenuTap("play-again", () => {
        this.hideGameOver();
        this.onPlayAgain?.();
      }),
    );
    document.getElementById("go-main-menu")!.addEventListener(
      "click",
      this.guardMenuTap("main-menu", () => {
        this.hideGameOver();
        this.onMainMenu?.();
      }),
    );
  }

  private guardMenuTap(
    action: string,
    cb: () => void,
  ): (event: MouseEvent) => void {
    return (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      if (now - this.lastTapAt < 300) return;
      this.lastTapAt = now;
      cb();
    };
  }

  private buildShop(): void {
    const openBtn = document.getElementById("shop-open-btn");
    const closeBtn = document.getElementById("shop-close-btn");

    openBtn?.addEventListener("click", () => {
      this.refreshShop();
      this.shopModal.classList.add("visible");
    });

    closeBtn?.addEventListener("click", () => {
      this.shopModal.classList.remove("visible");
    });

    this.shopModal.addEventListener("click", (e) => {
      if (e.target === this.shopModal) {
        this.shopModal.classList.remove("visible");
      }
    });

    this.refreshShop();
    this.updatePreview();
    this.skinSystem.whenAssetsReady().then(() => {
      this.previewCache.clear();
      this.refreshShop();
      this.updatePreview();
    });
  }

  private initPreviewRenderer(): void {
    if (this.previewRenderer || this.previewRendererUnavailable) return;

    const size = 128;
    try {
      // Mobile browsers can return blank toDataURL snapshots unless drawing buffer is preserved.
      this.previewRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: "low-power",
      });
      this.previewRenderer.setSize(size, size);
      this.previewRenderer.setPixelRatio(
        Math.min(2, window.devicePixelRatio || 1),
      );
      this.previewRenderer.setClearColor(0x000000, 0);

      this.previewScene = new THREE.Scene();
      const ambient = new THREE.AmbientLight(0xffffff, 0.8);
      this.previewScene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(2, 4, 3);
      this.previewScene.add(dir);

      this.previewCamera = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
      this.previewCamera.position.set(1.2, 1.0, 1.2);
      this.previewCamera.lookAt(0, 0.2, 0);
    } catch {
      this.previewRendererUnavailable = true;
      this.previewRenderer = null;
      this.previewScene = null;
      this.previewCamera = null;
    }
  }

  private renderModelPreview(model: THREE.Group): string {
    this.initPreviewRenderer();
    if (!this.previewRenderer || !this.previewScene || !this.previewCamera) {
      return "";
    }
    const scene = this.previewScene!;
    const camera = this.previewCamera!;
    const renderer = this.previewRenderer!;

    const clone = model.clone(true);
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        child.material = (child.material as THREE.Material).clone();
      }
    });
    scene.add(clone);

    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");

    scene.remove(clone);
    return dataUrl;
  }

  private getModelPreviewUrl(skin: SkinDef): string | null {
    const cached = this.previewCache.get(skin.id);
    if (cached) return cached;

    const model = this.skinSystem.getModel(skin.id);
    if (model && model.children.length > 0) {
      const url = this.renderModelPreview(model);
      if (url) {
        this.previewCache.set(skin.id, url);
        return url;
      }
    }

    return null;
  }

  refreshShop(): void {
    const colorsContainer = document.getElementById("shop-colors")!;
    const skinsContainer = document.getElementById("shop-skins")!;

    colorsContainer.innerHTML = "";
    skinsContainer.innerHTML = "";

    for (const skin of this.skinSystem.getColorSkins()) {
      const btn = document.createElement("button");
      btn.className =
        "shop-color-btn" +
        (skin.id === this.config.playerSkinId ? " selected" : "");
      btn.dataset.skinId = skin.id;
      btn.setAttribute("aria-label", skin.name);

      const swatch = document.createElement("span");
      swatch.className = "shop-swatch";
      swatch.style.background = skin.colorStr;
      btn.appendChild(swatch);

      btn.addEventListener("click", () => this.selectSkin(skin.id));
      colorsContainer.appendChild(btn);
    }

    const allModelAndTexture = [
      ...this.skinSystem.getModelSkins(),
      ...this.skinSystem.getTextureSkins(),
    ];

    for (const skin of allModelAndTexture) {
      const btn = document.createElement("button");
      const isUnlocked = this.skinSystem.isUnlocked(skin.id);
      const isSelected = skin.id === this.config.playerSkinId;
      btn.className =
        "shop-skin-btn" +
        (isSelected ? " selected" : "") +
        (!isUnlocked ? " locked" : "");
      btn.dataset.skinId = skin.id;
      btn.setAttribute("aria-label", skin.name);

      if (skin.type === "model") {
        const previewUrl = this.getModelPreviewUrl(skin);
        if (previewUrl) {
          const img = document.createElement("img");
          img.className = "skin-preview model-preview";
          img.src = previewUrl;
          img.alt = skin.name;
          img.onerror = () => {
            const fallback = document.createElement("div");
            fallback.className = "skin-preview model-preview-placeholder";
            fallback.style.background = skin.colorStr;
            img.replaceWith(fallback);
          };
          btn.appendChild(img);
        } else {
          const placeholder = document.createElement("div");
          placeholder.className = "skin-preview model-preview-placeholder";
          placeholder.style.background = skin.colorStr;
          btn.appendChild(placeholder);

          const modelPromise = this.skinSystem.getModelAsync(skin.id);
          if (modelPromise) {
            modelPromise.then((model) => {
              if (model.children.length === 0) return;
              const url = this.renderModelPreview(model);
              if (url) {
                this.previewCache.set(skin.id, url);
                const img = document.createElement("img");
                img.className = "skin-preview model-preview";
                img.src = url;
                img.alt = skin.name;
                placeholder.replaceWith(img);
              }
            });
          }
        }
      } else {
        const img = document.createElement("img");
        img.className = "skin-preview";
        img.src = this.skinSystem.getTextureUrl(skin) ?? "";
        img.alt = skin.name;
        img.onerror = () => {
          img.remove();
        };
        btn.appendChild(img);
      }

      const nameEl = document.createElement("span");
      nameEl.className = "skin-name";
      nameEl.textContent = skin.name;
      btn.appendChild(nameEl);

      if (!isUnlocked) {
        const overlay = document.createElement("div");
        overlay.className = "skin-lock-overlay";
        overlay.innerHTML =
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="white">' +
          '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>' +
          "</svg>" +
          "<span>" +
          skin.unlockScore +
          "% territory</span>";
        btn.appendChild(overlay);
      }

      if (isUnlocked) {
        btn.addEventListener("click", () => this.selectSkin(skin.id));
      }

      skinsContainer.appendChild(btn);
    }
  }

  private selectSkin(skinId: string): void {
    this.config.playerSkinId = skinId;

    document
      .querySelectorAll(".shop-color-btn, .shop-skin-btn")
      .forEach((btn) => {
        btn.classList.toggle(
          "selected",
          (btn as HTMLElement).dataset.skinId === skinId,
        );
      });

    this.updatePreview();
  }

  private updatePreview(): void {
    const preview = document.getElementById(
      "shop-preview",
    ) as HTMLElement | null;
    if (!preview) return;

    const skin = this.skinSystem.getSkin(this.config.playerSkinId);
    if (!skin) return;

    if (skin.type === "model") {
      const url = this.getModelPreviewUrl(skin);
      if (url) {
        preview.style.background = "url(" + url + ") center/cover";
        preview.style.borderRadius = "6px";
      } else {
        preview.style.background = skin.colorStr;
        preview.style.borderRadius = "6px";
        // Only wait for the model if it hasn't loaded yet
        if (!this.skinSystem.getModel(skin.id)) {
          const modelPromise = this.skinSystem.getModelAsync(skin.id);
          if (modelPromise) {
            modelPromise.then(() => this.updatePreview());
          }
        }
      }
    } else if (skin.type === "texture" && skin.textureUrl) {
      const textureUrl = this.skinSystem.getTextureUrl(skin);
      if (textureUrl) {
        preview.style.background = "url(" + textureUrl + ") center/cover";
      } else {
        preview.style.background = skin.colorStr;
      }
      preview.style.borderRadius = "6px";
    } else {
      preview.style.background = skin.colorStr;
      preview.style.borderRadius = "999px";
    }
  }

  setCallbacks(
    onPlay: (config: MenuConfig) => void,
    onPlayAgain: () => void,
    onMainMenu: () => void,
  ): void {
    this.onPlay = onPlay;
    this.onPlayAgain = onPlayAgain;
    this.onMainMenu = onMainMenu;
  }

  showMenu(): void {
    this.menuScreen.style.display = "flex";
    this.refreshShop();
    this.updatePreview();
  }

  hideMenu(): void {
    this.menuScreen.style.display = "none";
  }

  showGameOver(
    score: string,
    rank: string,
    time: string,
    unlockedSkins?: SkinDef[],
  ): void {
    document.getElementById("go-score")!.textContent = score;
    document.getElementById("go-rank")!.textContent = rank;
    document.getElementById("go-time")!.textContent = time;

    const unlockEl = document.getElementById("go-unlocks");
    if (unlockEl) {
      if (unlockedSkins && unlockedSkins.length > 0) {
        const names = unlockedSkins.map((s) => s.name).join(", ");
        unlockEl.innerHTML =
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="#E8736C" style="vertical-align:middle;margin-right:4px">' +
          '<path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/>' +
          "</svg>" +
          'Unlocked: <span style="font-weight:700;color:#E8736C">' +
          names +
          "</span>";
        unlockEl.style.display = "block";
      } else {
        unlockEl.style.display = "none";
      }
    }

    this.gameOverScreen.classList.add("visible");
  }

  hideGameOver(): void {
    this.gameOverScreen.classList.remove("visible");
  }

  showPause(): void {
    this.pauseOverlay.classList.add("visible");
  }

  hidePause(): void {
    this.pauseOverlay.classList.remove("visible");
  }

  get currentConfig(): MenuConfig {
    return this.config;
  }
}
