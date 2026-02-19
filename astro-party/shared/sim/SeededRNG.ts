export class SeededRNG {
  private state: Uint32Array;

  constructor(seed: number) {
    this.state = new Uint32Array(4);
    this.setSeed(seed);
  }

  setSeed(seed: number): void {
    let s = seed >>> 0;
    for (let i = 0; i < 4; i++) {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0xc2b2ae35) >>> 0;
      this.state[i] = (z ^ (z >>> 16)) >>> 0;
    }
  }

  nextUint32(): number {
    let s0 = this.state[0];
    let s1 = this.state[1];
    let s2 = this.state[2];
    let s3 = this.state[3];

    const result = Math.imul(s1, 5) >>> 0;
    const rot = ((result << 7) | (result >>> 25)) >>> 0;
    const output = Math.imul(rot, 9) >>> 0;

    const t = (s1 << 9) >>> 0;

    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = ((s3 << 11) | (s3 >>> 21)) >>> 0;

    this.state[0] = s0 >>> 0;
    this.state[1] = s1 >>> 0;
    this.state[2] = s2 >>> 0;
    this.state[3] = s3 >>> 0;

    return output >>> 0;
  }

  next(): number {
    return this.nextUint32() / 0x100000000;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(min + this.next() * (max - min + 1));
  }

  nextRange(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  getState(): Uint32Array {
    return new Uint32Array(this.state);
  }

  setState(state: Uint32Array): void {
    this.state.set(state);
  }
}
