import { GAME_CONFIG } from "../../types";

export const NETWORK_GAME_FEEL_TUNING = {
  remoteSmoothing: {
    extrapolationCapBaseMs: 32,
    snapshotIntervalTargetMs: GAME_CONFIG.SYNC_INTERVAL,
  },
  selfPrediction: {
    enabled: false,
    inputSendIntervalMs: 1000 / 60,
  },
  predictedLocalActionCosmetics: {
    fire: true,
    dash: true,
  },
  localAuthoritativeSoundSuppressionMs: {
    fire: 260,
    dash: 320,
  },
} as const;
