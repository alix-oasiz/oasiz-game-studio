import { SeededRNG } from "../../shared/sim/SeededRNG";

export interface RNGState {
  asteroid: Uint32Array;
  powerUp: Uint32Array;
  ai: Uint32Array;
}

export class DeterministicRNGManager {
  private asteroidRng: SeededRNG;
  private powerUpRng: SeededRNG;
  private aiRng: SeededRNG;
  private idRng: SeededRNG;
  private visualRng: SeededRNG;

  constructor() {
    this.asteroidRng = new SeededRNG(0);
    this.powerUpRng = new SeededRNG(0);
    this.aiRng = new SeededRNG(0);
    this.idRng = new SeededRNG(0);
    this.visualRng = new SeededRNG(Date.now() >>> 0);
  }

  initializeFromSeed(baseSeed: number): void {
    const tempRng = new SeededRNG(baseSeed);
    this.asteroidRng.setSeed(tempRng.nextUint32());
    this.powerUpRng.setSeed(tempRng.nextUint32());
    this.aiRng.setSeed(tempRng.nextUint32());
    this.idRng.setSeed(tempRng.nextUint32());
    this.visualRng.setSeed(tempRng.nextUint32());
  }

  getAsteroidRng(): SeededRNG {
    return this.asteroidRng;
  }

  getPowerUpRng(): SeededRNG {
    return this.powerUpRng;
  }

  getAIRng(): SeededRNG {
    return this.aiRng;
  }

  getIdRng(): SeededRNG {
    return this.idRng;
  }

  getVisualRng(): SeededRNG {
    return this.visualRng;
  }

  captureState(): RNGState {
    return {
      asteroid: this.asteroidRng.getState(),
      powerUp: this.powerUpRng.getState(),
      ai: this.aiRng.getState(),
    };
  }

  restoreState(state: RNGState): void {
    this.asteroidRng.setState(state.asteroid);
    this.powerUpRng.setState(state.powerUp);
    this.aiRng.setState(state.ai);
  }
}
