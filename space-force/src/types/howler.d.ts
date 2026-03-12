declare module "howler" {
  export type HowlEvent =
    | "load"
    | "loaderror"
    | "play"
    | "playerror"
    | "stop"
    | "end"
    | "fade";
  export type HowlEventCallback = (...args: unknown[]) => void;

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
    state(): "unloaded" | "loading" | "loaded";
    on(event: HowlEvent, fn: HowlEventCallback, id?: number): this;
    once(event: HowlEvent, fn: HowlEventCallback, id?: number): this;
    off(event: HowlEvent, fn?: HowlEventCallback, id?: number): this;
    play(soundId?: number): number;
    stop(soundId?: number): this;
    seek(): number;
    seek(seek: number): this;
    seek(seek: number, soundId: number): this;
    seek(seek: undefined, soundId: number): number;
    loop(loop?: boolean): boolean;
    loop(loop: boolean, soundId: number): this;
    volume(volume?: number): number;
    volume(volume: number, soundId?: number): this;
    fade(from: number, to: number, duration: number, soundId?: number): this;
    playing(soundId?: number): boolean;
  }
}
