import { ColyseusTransport } from "./ColyseusTransport";
import { LocalSharedSimTransport } from "./LocalSharedSimTransport";
import type { NetworkTransport } from "./NetworkTransport";

export type TransportMode = "online" | "local";

export function createTransport(
  mode: TransportMode = "online",
): NetworkTransport {
  if (mode === "local") {
    return new LocalSharedSimTransport();
  }
  return new ColyseusTransport();
}
