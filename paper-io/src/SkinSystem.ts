import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

export interface SkinDef {
  id: string;
  name: string;
  type: 'color' | 'texture' | 'model';
  color: number;
  colorStr: string;
  textureUrl?: string;
  modelDir?: string;
  modelFile?: string;
  previewUrl?: string;
  unlockedByDefault: boolean;
  unlockScore: number;
}

const ANIMAL_MODELS: { id: string; name: string; folder: string; file: string; color: number; colorStr: string; unlockScore: number }[] = [
  { id: 'cat', name: 'Cat', folder: 'Cat', file: 'cat.vox', color: 0xFFAA00, colorStr: '#FFAA00', unlockScore: 0 },
  { id: 'dog', name: 'Dog', folder: 'Dog', file: 'dog.vox', color: 0xFF6B35, colorStr: '#FF6B35', unlockScore: 0 },
  { id: 'bunny', name: 'Bunny', folder: 'Bunny', file: 'bunny.vox', color: 0xFF3D71, colorStr: '#FF3D71', unlockScore: 0 },
  { id: 'fox', name: 'Fox', folder: 'Fox', file: 'fox.vox', color: 0xFF8C00, colorStr: '#FF8C00', unlockScore: 0 },
  { id: 'penguin', name: 'Penguin', folder: 'Penguin', file: 'penguin.vox', color: 0x4DD0E1, colorStr: '#4DD0E1', unlockScore: 0 },
  { id: 'chicken', name: 'Chicken', folder: 'Chicken', file: 'chicken.vox', color: 0xFFD700, colorStr: '#FFD700', unlockScore: 0 },
  { id: 'turtle', name: 'Turtle', folder: 'Turtle', file: 'turtle.vox', color: 0x00E096, colorStr: '#00E096', unlockScore: 5 },
  { id: 'frog', name: 'Frog', folder: 'Frog', file: 'frog.vox', color: 0x00E096, colorStr: '#00E096', unlockScore: 8 },
  { id: 'piglet', name: 'Piglet', folder: 'Piglet', file: 'piglet.vox', color: 0xFF9999, colorStr: '#FF9999', unlockScore: 10 },
  { id: 'bear', name: 'Bear', folder: 'Bear', file: 'bear.vox', color: 0x8B5E3C, colorStr: '#8B5E3C', unlockScore: 12 },
  { id: 'monkey', name: 'Monkey', folder: 'Monkey', file: 'monkey.vox', color: 0xA0522D, colorStr: '#A0522D', unlockScore: 15 },
  { id: 'mouse', name: 'Mouse', folder: 'Mouse', file: 'mouse.vox', color: 0xBBBBBB, colorStr: '#BBBBBB', unlockScore: 18 },
  { id: 'cow', name: 'Cow', folder: 'Cow', file: 'cow.vox', color: 0xF5F5DC, colorStr: '#F5F5DC', unlockScore: 20 },
  { id: 'panda', name: 'Panda', folder: 'Panda', file: 'panda.vox', color: 0x333333, colorStr: '#333333', unlockScore: 25 },
  { id: 'elephant', name: 'Elephant', folder: 'Elephant', file: 'elephant.vox', color: 0x999999, colorStr: '#999999', unlockScore: 30 },
  { id: 'parrot', name: 'Parrot', folder: 'Parrot', file: 'parrot.vox', color: 0xFF3D71, colorStr: '#FF3D71', unlockScore: 35 },
  { id: 'crocodile', name: 'Crocodile', folder: 'Crocodile', file: 'crocodile.vox', color: 0x2E8B57, colorStr: '#2E8B57', unlockScore: 40 },
  { id: 'axolotl', name: 'Axolotl', folder: 'Axolotl', file: 'axolotl.vox', color: 0xFFB6C1, colorStr: '#FFB6C1', unlockScore: 45 },
  { id: 'mole', name: 'Mole', folder: 'Mole', file: 'mole.vox', color: 0x5C4033, colorStr: '#5C4033', unlockScore: 50 },
  { id: 'unicorn', name: 'Unicorn', folder: 'Unicorn', file: 'unicorn.vox', color: 0xA259FF, colorStr: '#A259FF', unlockScore: 60 },
];

export const SKINS: SkinDef[] = [
  { id: 'cyan', name: 'Cyan', type: 'color', color: 0x00E5FF, colorStr: '#00E5FF', unlockedByDefault: true, unlockScore: 0 },
  { id: 'pink', name: 'Pink', type: 'color', color: 0xFF3D71, colorStr: '#FF3D71', unlockedByDefault: true, unlockScore: 0 },
  { id: 'orange', name: 'Orange', type: 'color', color: 0xFFAA00, colorStr: '#FFAA00', unlockedByDefault: true, unlockScore: 0 },
  { id: 'green', name: 'Green', type: 'color', color: 0x00E096, colorStr: '#00E096', unlockedByDefault: true, unlockScore: 0 },
  { id: 'purple', name: 'Purple', type: 'color', color: 0xA259FF, colorStr: '#A259FF', unlockedByDefault: true, unlockScore: 0 },
  { id: 'vermillion', name: 'Vermillion', type: 'color', color: 0xFF6B35, colorStr: '#FF6B35', unlockedByDefault: true, unlockScore: 0 },

  ...ANIMAL_MODELS.map(a => ({
    id: a.id,
    name: a.name,
    type: 'model' as const,
    color: a.color,
    colorStr: a.colorStr,
    modelDir: `/assets/Animals/${a.folder}/`,
    modelFile: a.file,
    previewUrl: `/assets/Animals/${a.folder}/${a.file}.png`,
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
  private objLoader = new OBJLoader();
  private mtlLoader = new MTLLoader();

  constructor() {
    this.loadUnlockState();
    this.preloadAssets();
  }

  private loadUnlockState(): void {
    for (const skin of SKINS) {
      if (skin.unlockedByDefault) {
        this.unlockedSkins.add(skin.id);
      }
    }

    let savedUnlocks: string[] = [];
    if (typeof (window as any).loadGameState === 'function') {
      const state = (window as any).loadGameState() ?? {};
      if (Array.isArray(state.unlockedSkins)) {
        savedUnlocks = state.unlockedSkins;
      }
    }

    if (savedUnlocks.length === 0) {
      try {
        const local = localStorage.getItem('paperio-unlocked-skins');
        if (local) savedUnlocks = JSON.parse(local);
      } catch { /* ignore */ }
    }

    for (const id of savedUnlocks) {
      this.unlockedSkins.add(id);
    }
  }

  private saveUnlockState(): void {
    const unlocked = Array.from(this.unlockedSkins);
    if (typeof (window as any).saveGameState === 'function') {
      let currentState: Record<string, unknown> = {};
      if (typeof (window as any).loadGameState === 'function') {
        currentState = (window as any).loadGameState() ?? {};
      }
      (window as any).saveGameState({ ...currentState, unlockedSkins: unlocked });
    }
    try {
      localStorage.setItem('paperio-unlocked-skins', JSON.stringify(unlocked));
    } catch { /* ignore */ }
  }

  private preloadAssets(): void {
    for (const skin of SKINS) {
      if (skin.type === 'texture' && skin.textureUrl) {
        const tex = this.textureLoader.load(skin.textureUrl);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestMipmapLinearFilter;
        tex.colorSpace = THREE.SRGBColorSpace;
        this.textures.set(skin.id, tex);
      }
      if (skin.type === 'model' && skin.modelDir && skin.modelFile) {
        this.loadModel(skin);
      }
    }
  }

  private loadModel(skin: SkinDef): Promise<THREE.Group> {
    const existing = this.modelLoadPromises.get(skin.id);
    if (existing) return existing;

    const promise = new Promise<THREE.Group>((resolve) => {
      const dir = skin.modelDir!;
      const file = skin.modelFile!;

      this.mtlLoader.setPath(dir);
      this.mtlLoader.load(file + '.mtl', (materials) => {
        materials.preload();
        const loader = new OBJLoader();
        loader.setMaterials(materials);
        loader.setPath(dir);
        loader.load(file + '.obj', (obj) => {
          this.normalizeModel(obj);
          this.models.set(skin.id, obj);
          console.log('[SkinSystem] Loaded model:', skin.id);
          resolve(obj);
        }, undefined, () => {
          console.log('[SkinSystem] OBJ load failed, trying without MTL:', skin.id);
          this.loadObjWithTexture(skin, resolve);
        });
      }, undefined, () => {
        console.log('[SkinSystem] MTL load failed, trying OBJ with texture:', skin.id);
        this.loadObjWithTexture(skin, resolve);
      });
    });

    this.modelLoadPromises.set(skin.id, promise);
    return promise;
  }

  private loadObjWithTexture(skin: SkinDef, resolve: (g: THREE.Group) => void): void {
    const dir = skin.modelDir!;
    const file = skin.modelFile!;
    const loader = new OBJLoader();
    loader.setPath(dir);
    loader.load(file + '.obj', (obj) => {
      const tex = this.textureLoader.load(dir + file + '.png');
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
    }, undefined, () => {
      console.log('[SkinSystem] Failed to load model entirely:', skin.id);
      const fallback = new THREE.Group();
      this.models.set(skin.id, fallback);
      resolve(fallback);
    });
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
    return SKINS.find(s => s.id === id);
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
    return this.modelLoadPromises.get(skinId) ?? null;
  }

  isUnlocked(skinId: string): boolean {
    return this.unlockedSkins.has(skinId);
  }

  tryUnlock(scorePercent: number): SkinDef[] {
    const newlyUnlocked: SkinDef[] = [];
    for (const skin of SKINS) {
      if (!this.unlockedSkins.has(skin.id) && scorePercent >= skin.unlockScore) {
        this.unlockedSkins.add(skin.id);
        newlyUnlocked.push(skin);
      }
    }
    if (newlyUnlocked.length > 0) {
      this.saveUnlockState();
    }
    return newlyUnlocked;
  }

  getShuffledBotSkins(excludeId: string, count: number): SkinDef[] {
    const pool = SKINS.filter(s => s.id !== excludeId);
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
    return SKINS.filter(s => s.type === 'color');
  }

  getTextureSkins(): SkinDef[] {
    return SKINS.filter(s => s.type === 'texture');
  }

  getModelSkins(): SkinDef[] {
    return SKINS.filter(s => s.type === 'model');
  }
}
