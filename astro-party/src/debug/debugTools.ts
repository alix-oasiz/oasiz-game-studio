const env = (
  import.meta as ImportMeta & {
    env?: Record<string, string | boolean | undefined>;
  }
).env;
const QA_DEBUG_FLAG = String(env?.VITE_QA_DEBUG_TOOLS ?? "").toLowerCase();
const IS_DEV = env?.DEV === true || env?.DEV === "true";

export const CLIENT_DEBUG_BUILD_ENABLED =
  IS_DEV || QA_DEBUG_FLAG === "1" || QA_DEBUG_FLAG === "true";

export function isClientDebugToolsRequested(): boolean {
  return CLIENT_DEBUG_BUILD_ENABLED;
}
