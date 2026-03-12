import { AudioManager } from "./AudioManager";

const AUDIO_PRELOAD_TIMEOUT_MS = 12000;
const IMAGE_PRELOAD_TIMEOUT_MS = 5000;
const STARTUP_IMAGE_IDS = Object.freeze([
  "splashLogoImage",
  "titleSpaceImage",
  "titleForceImage",
]);

let startupPreloadPromise: Promise<void> | null = null;

function getSplashLoaderTextElement(): HTMLElement | null {
  return document.getElementById("splashLoaderText");
}

function getSplashScreenElement(): HTMLElement | null {
  return document.getElementById("splashScreen");
}

export function setStartupLoaderState(
  visible: boolean,
  message: string = "Loading assets...",
): void {
  const splash = getSplashScreenElement();
  if (splash) {
    splash.classList.toggle("preloading", visible);
  }

  const loaderText = getSplashLoaderTextElement();
  if (loaderText) {
    loaderText.textContent = message;
  }
}

function decodeImage(image: HTMLImageElement): Promise<void> {
  if (typeof image.decode !== "function") {
    return Promise.resolve();
  }

  return image.decode().catch((error: unknown) => {
    console.log("[Preload.decodeImage]", "Image decode failed");
    console.log("[Preload.decodeImage]", String(error));
  });
}

function preloadImageById(imageId: string): Promise<void> {
  const imageElement = document.getElementById(imageId);
  if (!(imageElement instanceof HTMLImageElement)) {
    console.log("[Preload.preloadImageById]", "Image not found: " + imageId);
    return Promise.resolve();
  }

  if (imageElement.complete && imageElement.naturalWidth > 0) {
    return decodeImage(imageElement);
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const finalize = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      imageElement.removeEventListener("load", handleLoad);
      imageElement.removeEventListener("error", handleError);
      void decodeImage(imageElement).finally(() => {
        resolve();
      });
    };

    const handleLoad = (): void => {
      finalize();
    };

    const handleError = (): void => {
      console.log("[Preload.preloadImageById]", "Image failed to load: " + imageId);
      finalize();
    };

    timeoutHandle = setTimeout(() => {
      console.log("[Preload.preloadImageById]", "Image preload timeout: " + imageId);
      finalize();
    }, IMAGE_PRELOAD_TIMEOUT_MS);

    imageElement.addEventListener("load", handleLoad);
    imageElement.addEventListener("error", handleError);
  });
}

function preloadStartupImages(): Promise<void> {
  const imagePreloads = STARTUP_IMAGE_IDS.map((imageId) => preloadImageById(imageId));
  return Promise.all(imagePreloads).then(() => undefined);
}

export function preloadStartupAssets(): Promise<void> {
  if (startupPreloadPromise !== null) {
    return startupPreloadPromise;
  }

  startupPreloadPromise = (async () => {
    setStartupLoaderState(true, "Loading startup assets...");
    console.log("[Preload.preloadStartupAssets]", "Starting startup preload");
    const allAudioAssetIds = AudioManager.getConfiguredAssetIds();
    await Promise.all([
      preloadStartupImages(),
      AudioManager.preloadAssets(allAudioAssetIds, AUDIO_PRELOAD_TIMEOUT_MS),
    ]);
    setStartupLoaderState(true, "Starting...");
    console.log("[Preload.preloadStartupAssets]", "Startup preload complete");
  })();

  return startupPreloadPromise;
}
