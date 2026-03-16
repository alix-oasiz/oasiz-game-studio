import * as THREE from "three";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { oasiz } from "@oasiz/sdk";

export interface SkinDef {
  id: string;
  name: string;
  type: "color" | "texture" | "model";
  color: number;
  colorStr: string;
  textureUrl?: string;
  modelDir?: string;
  modelFile?: string;
  modelObj?: string;
  modelMtl?: string;
  modelTex?: string;
  previewUrl?: string;
  unlockedByDefault: boolean;
  unlockScore: number;
}

const ANIMAL_MODELS: {
  id: string;
  name: string;
  dir: string;
  file: string;
  obj: string;
  mtl: string;
  tex: string;
  color: number;
  colorStr: string;
  unlockScore: number;
}[] = [
  {
    id: "cat",
    name: "Cat",
    dir: "assets/Animals/Cat/",
    file: "cat.vox",
    obj: "assets/Animals/Cat/cat.vox.obj",
    mtl: "assets/Animals/Cat/cat.vox.mtl",
    tex: "assets/Animals/Cat/cat.vox.png",
    color: 0xffaa00,
    colorStr: "#FFAA00",
    unlockScore: 0,
  },
  {
    id: "dog",
    name: "Dog",
    dir: "assets/Animals/Dog/",
    file: "dog.vox",
    obj: "assets/Animals/Dog/dog.vox.obj",
    mtl: "assets/Animals/Dog/dog.vox.mtl",
    tex: "assets/Animals/Dog/dog.vox.png",
    color: 0xff6b35,
    colorStr: "#FF6B35",
    unlockScore: 0,
  },
  {
    id: "bunny",
    name: "Bunny",
    dir: "assets/Animals/Bunny/",
    file: "bunny.vox",
    obj: "assets/Animals/Bunny/bunny.vox.obj",
    mtl: "assets/Animals/Bunny/bunny.vox.mtl",
    tex: "assets/Animals/Bunny/bunny.vox.png",
    color: 0xff3d71,
    colorStr: "#FF3D71",
    unlockScore: 0,
  },
  {
    id: "fox",
    name: "Fox",
    dir: "assets/Animals/Fox/",
    file: "fox.vox",
    obj: "assets/Animals/Fox/fox.vox.obj",
    mtl: "assets/Animals/Fox/fox.vox.mtl",
    tex: "assets/Animals/Fox/fox.vox.png",
    color: 0xff8c00,
    colorStr: "#FF8C00",
    unlockScore: 0,
  },
  {
    id: "penguin",
    name: "Penguin",
    dir: "assets/Animals/Penguin/",
    file: "penguin.vox",
    obj: "assets/Animals/Penguin/penguin.vox.obj",
    mtl: "assets/Animals/Penguin/penguin.vox.mtl",
    tex: "assets/Animals/Penguin/penguin.vox.png",
    color: 0x4dd0e1,
    colorStr: "#4DD0E1",
    unlockScore: 0,
  },
  {
    id: "chicken",
    name: "Chicken",
    dir: "assets/Animals/Chicken/",
    file: "chicken.vox",
    obj: "assets/Animals/Chicken/chicken.vox.obj",
    mtl: "assets/Animals/Chicken/chicken.vox.mtl",
    tex: "assets/Animals/Chicken/chicken.vox.png",
    color: 0xffd700,
    colorStr: "#FFD700",
    unlockScore: 0,
  },
  {
    id: "turtle",
    name: "Turtle",
    dir: "assets/Animals/Turtle/",
    file: "turtle.vox",
    obj: "assets/Animals/Turtle/turtle.vox.obj",
    mtl: "assets/Animals/Turtle/turtle.vox.mtl",
    tex: "assets/Animals/Turtle/turtle.vox.png",
    color: 0x00e096,
    colorStr: "#00E096",
    unlockScore: 5,
  },
  {
    id: "frog",
    name: "Frog",
    dir: "assets/Animals/Frog/",
    file: "frog.vox",
    obj: "assets/Animals/Frog/frog.vox.obj",
    mtl: "assets/Animals/Frog/frog.vox.mtl",
    tex: "assets/Animals/Frog/frog.vox.png",
    color: 0x00e096,
    colorStr: "#00E096",
    unlockScore: 8,
  },
  {
    id: "piglet",
    name: "Piglet",
    dir: "assets/Animals/Piglet/",
    file: "piglet.vox",
    obj: "assets/Animals/Piglet/piglet.vox.obj",
    mtl: "assets/Animals/Piglet/piglet.vox.mtl",
    tex: "assets/Animals/Piglet/piglet.vox.png",
    color: 0xff9999,
    colorStr: "#FF9999",
    unlockScore: 10,
  },
  {
    id: "bear",
    name: "Bear",
    dir: "assets/Animals/Bear/",
    file: "bear.vox",
    obj: "assets/Animals/Bear/bear.vox.obj",
    mtl: "assets/Animals/Bear/bear.vox.mtl",
    tex: "assets/Animals/Bear/bear.vox.png",
    color: 0x8b5e3c,
    colorStr: "#8B5E3C",
    unlockScore: 12,
  },
  {
    id: "monkey",
    name: "Monkey",
    dir: "assets/Animals/Monkey/",
    file: "monkey.vox",
    obj: "assets/Animals/Monkey/monkey.vox.obj",
    mtl: "assets/Animals/Monkey/monkey.vox.mtl",
    tex: "assets/Animals/Monkey/monkey.vox.png",
    color: 0xa0522d,
    colorStr: "#A0522D",
    unlockScore: 15,
  },
  {
    id: "mouse",
    name: "Mouse",
    dir: "assets/Animals/Mouse/",
    file: "mouse.vox",
    obj: "assets/Animals/Mouse/mouse.vox.obj",
    mtl: "assets/Animals/Mouse/mouse.vox.mtl",
    tex: "assets/Animals/Mouse/mouse.vox.png",
    color: 0xbbbbbb,
    colorStr: "#BBBBBB",
    unlockScore: 18,
  },
  {
    id: "cow",
    name: "Cow",
    dir: "assets/Animals/Cow/",
    file: "cow.vox",
    obj: "assets/Animals/Cow/cow.vox.obj",
    mtl: "assets/Animals/Cow/cow.vox.mtl",
    tex: "assets/Animals/Cow/cow.vox.png",
    color: 0xf5f5dc,
    colorStr: "#F5F5DC",
    unlockScore: 20,
  },
  {
    id: "panda",
    name: "Panda",
    dir: "assets/Animals/Panda/",
    file: "panda.vox",
    obj: "assets/Animals/Panda/panda.vox.obj",
    mtl: "assets/Animals/Panda/panda.vox.mtl",
    tex: "assets/Animals/Panda/panda.vox.png",
    color: 0x333333,
    colorStr: "#333333",
    unlockScore: 25,
  },
  {
    id: "elephant",
    name: "Elephant",
    dir: "assets/Animals/Elephant/",
    file: "elephant.vox",
    obj: "assets/Animals/Elephant/elephant.vox.obj",
    mtl: "assets/Animals/Elephant/elephant.vox.mtl",
    tex: "assets/Animals/Elephant/elephant.vox.png",
    color: 0x999999,
    colorStr: "#999999",
    unlockScore: 30,
  },
  {
    id: "parrot",
    name: "Parrot",
    dir: "assets/Animals/Parrot/",
    file: "parrot.vox",
    obj: "assets/Animals/Parrot/parrot.vox.obj",
    mtl: "assets/Animals/Parrot/parrot.vox.mtl",
    tex: "assets/Animals/Parrot/parrot.vox.png",
    color: 0xff3d71,
    colorStr: "#FF3D71",
    unlockScore: 35,
  },
  {
    id: "crocodile",
    name: "Crocodile",
    dir: "assets/Animals/Crocodile/",
    file: "crocodile.vox",
    obj: "assets/Animals/Crocodile/crocodile.vox.obj",
    mtl: "assets/Animals/Crocodile/crocodile.vox.mtl",
    tex: "assets/Animals/Crocodile/crocodile.vox.png",
    color: 0x2e8b57,
    colorStr: "#2E8B57",
    unlockScore: 40,
  },
  {
    id: "axolotl",
    name: "Axolotl",
    dir: "assets/Animals/Axolotl/",
    file: "axolotl.vox",
    obj: "assets/Animals/Axolotl/axolotl.vox.obj",
    mtl: "assets/Animals/Axolotl/axolotl.vox.mtl",
    tex: "assets/Animals/Axolotl/axolotl.vox.png",
    color: 0xffb6c1,
    colorStr: "#FFB6C1",
    unlockScore: 45,
  },
  {
    id: "mole",
    name: "Mole",
    dir: "assets/Animals/Mole/",
    file: "mole.vox",
    obj: "assets/Animals/Mole/mole.vox.obj",
    mtl: "assets/Animals/Mole/mole.vox.mtl",
    tex: "assets/Animals/Mole/mole.vox.png",
    color: 0x5c4033,
    colorStr: "#5C4033",
    unlockScore: 50,
  },
  {
    id: "unicorn",
    name: "Unicorn",
    dir: "assets/Animals/Unicorn/",
    file: "unicorn.vox",
    obj: "assets/Animals/Unicorn/unicorn.vox.obj",
    mtl: "assets/Animals/Unicorn/unicorn.vox.mtl",
    tex: "assets/Animals/Unicorn/unicorn.vox.png",
    color: 0xa259ff,
    colorStr: "#A259FF",
    unlockScore: 60,
  },
];

export const SKINS: SkinDef[] = [
  {
    id: "cyan",
    name: "Cyan",
    type: "color",
    color: 0x00e5ff,
    colorStr: "#00E5FF",
    unlockedByDefault: true,
    unlockScore: 0,
  },
  {
    id: "pink",
    name: "Pink",
    type: "color",
    color: 0xff3d71,
    colorStr: "#FF3D71",
    unlockedByDefault: true,
    unlockScore: 0,
  },
  {
    id: "orange",
    name: "Orange",
    type: "color",
    color: 0xffaa00,
    colorStr: "#FFAA00",
    unlockedByDefault: true,
    unlockScore: 0,
  },
  {
    id: "green",
    name: "Green",
    type: "color",
    color: 0x00e096,
    colorStr: "#00E096",
    unlockedByDefault: true,
    unlockScore: 0,
  },
  {
    id: "purple",
    name: "Purple",
    type: "color",
    color: 0xa259ff,
    colorStr: "#A259FF",
    unlockedByDefault: true,
    unlockScore: 0,
  },
  {
    id: "vermillion",
    name: "Vermillion",
    type: "color",
    color: 0xff6b35,
    colorStr: "#FF6B35",
    unlockedByDefault: true,
    unlockScore: 0,
  },

  ...ANIMAL_MODELS.map((a) => ({
    id: a.id,
    name: a.name,
    type: "model" as const,
    color: a.color,
    colorStr: a.colorStr,
    modelDir: a.dir,
    modelFile: a.file,
    modelObj: a.obj,
    modelMtl: a.mtl,
    modelTex: a.tex,
    previewUrl: a.tex,
    unlockedByDefault: a.unlockScore === 0,
    unlockScore: a.unlockScore,
  })),
];

export class SkinSystem {
  private textures: Map<string, THREE.Texture> = new Map();
  private models: Map<string, THREE.Group> = new Map();
  private modelLoadPromises: Map<string, Promise<THREE.Group>> = new Map();
  private unlockedSkins: Set<string> = new Set();
  private textureLoader = new THREE.TextureLoader();
  private highestPct = 0;

  constructor() {
    this.loadUnlockState();
    this.preloadAssets();
  }

  private loadUnlockState(): void {
    const state = oasiz.loadGameState();
    const savedHighestPct =
      typeof state.highestPct === "number" && Number.isFinite(state.highestPct)
        ? Math.max(0, state.highestPct)
        : 0;
    this.highestPct = savedHighestPct;
    this.rebuildUnlockedSkins();
  }

  private saveHighestPct(): void {
    oasiz.saveGameState({ highestPct: this.highestPct });
    oasiz.flushGameState();
  }

  private rebuildUnlockedSkins(): void {
    this.unlockedSkins.clear();
    for (const skin of SKINS) {
      if (skin.unlockedByDefault || this.highestPct >= skin.unlockScore) {
        this.unlockedSkins.add(skin.id);
      }
    }
  }

  private preloadAssets(): void {
    for (const skin of SKINS) {
      if (skin.type === "texture" && skin.textureUrl) {
        const tex = this.textureLoader.load(skin.textureUrl);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestMipmapLinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        this.textures.set(skin.id, tex);
      }
      if (skin.type === "model" && skin.modelObj) {
        this.loadModel(skin);
      }
    }
  }

  private loadModel(skin: SkinDef): Promise<THREE.Group> {
    const existing = this.modelLoadPromises.get(skin.id);
    if (existing) return existing;

    const promise = new Promise<THREE.Group>((resolve) => {
      const objUrl = skin.modelObj!;
      const mtlUrl = skin.modelMtl!;
      // Derive the resource path from the (potentially CDN-rewritten) OBJ URL
      // so texture references inside the MTL resolve correctly.
      const resourceDir = objUrl.substring(0, objUrl.lastIndexOf("/") + 1);

      let loadedObj: THREE.Group | null = null;
      const manager = new THREE.LoadingManager();
      manager.onLoad = () => {
        if (loadedObj) {
          this.normalizeModel(loadedObj);
          this.models.set(skin.id, loadedObj);
          resolve(loadedObj);
        }
      };

      const mtlLoader = new MTLLoader(manager);
      mtlLoader.setResourcePath(resourceDir);
      mtlLoader.load(
        mtlUrl,
        (materials) => {
          materials.preload();
          const loader = new OBJLoader(manager);
          loader.setMaterials(materials);
          loader.load(
            objUrl,
            (obj) => {
              loadedObj = obj;
            },
            undefined,
            () => {
              this.loadObjWithTexture(skin, resolve);
            },
          );
        },
        undefined,
        () => {
          this.loadObjWithTexture(skin, resolve);
        },
      );
    });

    this.modelLoadPromises.set(skin.id, promise);
    return promise;
  }

  private loadObjWithTexture(
    skin: SkinDef,
    resolve: (g: THREE.Group) => void,
  ): void {
    const objUrl = skin.modelObj!;
    const texUrl = skin.modelTex!;
    const loader = new OBJLoader();
    loader.load(
      objUrl,
      (obj) => {
        const tex = this.textureLoader.load(texUrl);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestMipmapLinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = mat;
          }
        });
        this.normalizeModel(obj);
        this.models.set(skin.id, obj);
        resolve(obj);
      },
      undefined,
      () => {
        const fallback = new THREE.Group();
        this.models.set(skin.id, fallback);
        resolve(fallback);
      },
    );
  }

  private normalizeModel(obj: THREE.Group): void {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim === 0) return;

    const targetSize = 0.8;
    const scale = targetSize / maxDim;
    obj.scale.multiplyScalar(scale);

    box.setFromObject(obj);
    box.getCenter(center);
    obj.position.sub(center);

    box.setFromObject(obj);
    obj.position.y -= box.min.y;
  }

  getSkin(id: string): SkinDef | undefined {
    return SKINS.find((s) => s.id === id);
  }

  getDefaultSkin(): SkinDef {
    return SKINS[0];
  }

  getTexture(skinId: string): THREE.Texture | null {
    return this.textures.get(skinId) ?? null;
  }

  getModel(skinId: string): THREE.Group | null {
    return this.models.get(skinId) ?? null;
  }

  getModelAsync(skinId: string): Promise<THREE.Group> | null {
    const existing = this.modelLoadPromises.get(skinId);
    if (existing) return existing;
    const skin = this.getSkin(skinId);
    if (skin && skin.type === "model") {
      return this.loadModel(skin);
    }
    return null;
  }

  isUnlocked(skinId: string): boolean {
    return this.unlockedSkins.has(skinId);
  }

  tryUnlock(scorePercent: number): SkinDef[] {
    const previousUnlocked = new Set(this.unlockedSkins);
    const nextHighestPct = Math.max(this.highestPct, scorePercent);
    if (nextHighestPct !== this.highestPct) {
      this.highestPct = nextHighestPct;
      this.rebuildUnlockedSkins();
      this.saveHighestPct();
    }

    const newlyUnlocked: SkinDef[] = [];
    for (const skin of SKINS) {
      if (!previousUnlocked.has(skin.id) && this.unlockedSkins.has(skin.id)) {
        newlyUnlocked.push(skin);
      }
    }
    return newlyUnlocked;
  }

  getShuffledBotSkins(excludeId: string, count: number): SkinDef[] {
    const pool = SKINS.filter((s) => s.id !== excludeId);
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const result: SkinDef[] = [];
    for (let i = 0; i < count; i++) {
      result.push(shuffled[i % shuffled.length]);
    }
    return result;
  }

  getColorSkins(): SkinDef[] {
    return SKINS.filter((s) => s.type === "color");
  }

  getTextureSkins(): SkinDef[] {
    return SKINS.filter((s) => s.type === "texture");
  }

  getModelSkins(): SkinDef[] {
    return SKINS.filter((s) => s.type === "model");
  }

  getPreviewUrl(skin: SkinDef): string | null {
    return skin.previewUrl ?? null;
  }

  getTextureUrl(skin: SkinDef): string | null {
    return skin.textureUrl ?? null;
  }

  whenAssetsReady(): Promise<void> {
    return Promise.resolve();
  }
}
