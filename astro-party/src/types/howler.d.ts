declare module "howler" {
  export interface HowlOptions {
    src: string[];
    loop?: boolean;
    volume?: number;
    preload?: boolean;
    onloaderror?: (soundId: number, error: unknown) => void;
    onplayerror?: (soundId: number, error: unknown) => void;
  }

  export class Howl {
    constructor(options: HowlOptions);
    load(): void;
    unload(): void;
    play(soundId?: number): number;
    stop(soundId?: number): this;
    loop(loop?: boolean): boolean;
    loop(loop: boolean, soundId: number): this;
    volume(volume?: number): number;
    volume(volume: number, soundId?: number): this;
    playing(soundId?: number): boolean;
  }
}
