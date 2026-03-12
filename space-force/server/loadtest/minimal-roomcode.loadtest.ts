import { Client } from "colyseus.js";

interface LoadtestOptions {
  endpoint: string;
  roomName: string;
  clientId: number;
  numClients: number;
  [key: string]: unknown;
}

interface LoadtestRoom {
  roomId: string;
  sessionId: string;
  send: (type: string, payload: Record<string, unknown>) => void;
  leave: (consented?: boolean) => Promise<void>;
  onStateChange: (callback: (state: unknown) => void) => void;
  onMessage: (type: string, callback: (payload: unknown) => void) => void;
  onLeave: (callback: (code: number) => void) => void;
  onError: (callback: (code: number, message?: string) => void) => void;
}

interface MinimalConfig {
  roomCode: string;
  requestTimeoutMs: number;
  durationMs: number;
  summaryIntervalMs: number;
  autoExitOnComplete: boolean;
  defaultInputDebounceMs: number;
}

interface MetricsState {
  startedAtMs: number;
  attemptedClients: number;
  joinedClients: Set<number>;
  activeClients: Set<number>;
  disconnectedClients: Set<number>;
  failedClients: Set<number>;
  leaveCodes: Map<number, number>;
  roomErrors: Map<string, number>;
  failureReasons: Map<string, number>;
  inputsSent: number;
  snapshotsReadDuringPlaying: number;
  abnormalDisconnects: number;
  consentedLeaves: number;
  summaryInterval: ReturnType<typeof setInterval> | null;
  expectedClients: number;
  autoExitOnComplete: boolean;
  exitRequested: boolean;
  finalSummaryPrinted: boolean;
  initialized: boolean;
}

interface JoinSeatSuccess {
  ok?: true;
  roomCode?: string;
  roomId?: string;
  seatReservation?: unknown;
}

interface JoinSeatError {
  ok: false;
  error?: string;
  message?: string;
}

const METRICS: MetricsState = {
  startedAtMs: Date.now(),
  attemptedClients: 0,
  joinedClients: new Set<number>(),
  activeClients: new Set<number>(),
  disconnectedClients: new Set<number>(),
  failedClients: new Set<number>(),
  leaveCodes: new Map<number, number>(),
  roomErrors: new Map<string, number>(),
  failureReasons: new Map<string, number>(),
  inputsSent: 0,
  snapshotsReadDuringPlaying: 0,
  abnormalDisconnects: 0,
  consentedLeaves: 0,
  summaryInterval: null,
  expectedClients: 0,
  autoExitOnComplete: false,
  exitRequested: false,
  finalSummaryPrinted: false,
  initialized: false,
};

function incrementMapCounter<K>(target: Map<K, number>, key: K): void {
  const current = target.get(key) ?? 0;
  target.set(key, current + 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(
          "Timed out after " + timeoutMs.toString() + "ms while " + label,
        ),
      );
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return minutes.toString() + "m " + seconds.toString() + "s";
}

function summaryLine(): string {
  return (
    "uptime=" +
    formatDuration(Date.now() - METRICS.startedAtMs) +
    " attempted=" +
    METRICS.attemptedClients +
    " joined=" +
    METRICS.joinedClients.size +
    " active=" +
    METRICS.activeClients.size +
    " failed=" +
    METRICS.failedClients.size +
    " disconnected=" +
    METRICS.disconnectedClients.size +
    " abnormalDisconnects=" +
    METRICS.abnormalDisconnects +
    " consentedLeaves=" +
    METRICS.consentedLeaves +
    " snapshotsPlaying=" +
    METRICS.snapshotsReadDuringPlaying +
    " inputsSent=" +
    METRICS.inputsSent
  );
}

function runOutcomeLine(): string {
  const expected = Math.max(METRICS.expectedClients, METRICS.attemptedClients);
  const topLeaveCodes = [...METRICS.leaveCodes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([code, count]) => code.toString() + ":" + count.toString())
    .join(", ");

  return (
    "joined=" +
    METRICS.joinedClients.size +
    "/" +
    expected +
    " failedJoins=" +
    METRICS.failedClients.size +
    " disconnected=" +
    METRICS.disconnectedClients.size +
    " topLeaveCodes=" +
    (topLeaveCodes.length > 0 ? topLeaveCodes : "none")
  );
}

function printFinalSummary(): void {
  if (METRICS.finalSummaryPrinted) return;
  METRICS.finalSummaryPrinted = true;

  console.log("[LoadTest.minimal.summary]", summaryLine());
  console.log("[LoadTest.minimal.result]", runOutcomeLine());

  if (METRICS.failureReasons.size > 0) {
    const reasons = [...METRICS.failureReasons.entries()]
      .map(([reason, count]) => reason + ":" + count)
      .join(", ");
    console.log("[LoadTest.minimal.summary]", "failureReasons=" + reasons);
  }

  if (METRICS.leaveCodes.size > 0) {
    const leaveCodes = [...METRICS.leaveCodes.entries()]
      .map(([code, count]) => code.toString() + ":" + count.toString())
      .join(", ");
    console.log("[LoadTest.minimal.summary]", "leaveCodes=" + leaveCodes);
  }

  if (METRICS.roomErrors.size > 0) {
    const roomErrors = [...METRICS.roomErrors.entries()]
      .map(([code, count]) => code + ":" + count)
      .join(", ");
    console.log("[LoadTest.minimal.summary]", "roomErrors=" + roomErrors);
  }
}

function maybeExitWhenRunIsComplete(): void {
  if (!METRICS.autoExitOnComplete) return;
  if (METRICS.exitRequested) return;
  if (METRICS.expectedClients <= 0) return;
  if (METRICS.attemptedClients < METRICS.expectedClients) return;

  const terminalClientCount =
    METRICS.disconnectedClients.size + METRICS.failedClients.size;
  if (terminalClientCount < METRICS.expectedClients) return;

  METRICS.exitRequested = true;
  printFinalSummary();
  console.log(
    "[LoadTest.minimal.summary]",
    "All clients reached terminal state. Exiting loadtest process.",
  );

  setTimeout(() => {
    process.emit("SIGINT");
  }, 50);
}

function recordFailure(clientId: number, reason: string): void {
  METRICS.failedClients.add(clientId);
  incrementMapCounter(METRICS.failureReasons, reason);
  maybeExitWhenRunIsComplete();
}

function readStringFromOptions(
  options: LoadtestOptions,
  key: string,
): string | null {
  const value = options[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function readNumberFromOptions(
  options: LoadtestOptions,
  key: string,
): number | null {
  const raw = options[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readBooleanFromOptions(
  options: LoadtestOptions,
  key: string,
): boolean | null {
  const raw = options[key];
  if (typeof raw === "boolean") return raw;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function readStringFromEnv(key: string): string | null {
  const value = process.env[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readNumberFromEnv(key: string): number | null {
  const raw = process.env[key];
  if (typeof raw !== "string") return null;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readBooleanFromEnv(key: string): boolean | null {
  const raw = process.env[key];
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

function resolveMinimalConfig(options: LoadtestOptions): MinimalConfig {
  const roomCodeRaw =
    readStringFromOptions(options, "roomCode") ??
    readStringFromEnv("LOADTEST_ROOM_CODE");
  if (!roomCodeRaw) {
    throw new Error("Missing room code. Pass --roomCode or set LOADTEST_ROOM_CODE.");
  }
  const roomCode = roomCodeRaw.toUpperCase();

  const requestTimeoutMsRaw =
    readNumberFromOptions(options, "requestTimeoutMs") ??
    readNumberFromEnv("LOADTEST_REQUEST_TIMEOUT_MS") ??
    15000;
  const requestTimeoutMs = Math.max(1000, Math.floor(requestTimeoutMsRaw));

  const durationMsDirect =
    readNumberFromOptions(options, "durationMs") ??
    readNumberFromEnv("LOADTEST_DURATION_MS");
  const durationSec =
    readNumberFromOptions(options, "durationSec") ??
    readNumberFromEnv("LOADTEST_DURATION_SEC");
  const durationMs =
    durationMsDirect !== null
      ? Math.max(0, Math.floor(durationMsDirect))
      : durationSec !== null
        ? Math.max(0, Math.floor(durationSec * 1000))
        : 0;

  const summaryIntervalMsRaw =
    readNumberFromOptions(options, "summaryIntervalMs") ??
    readNumberFromEnv("LOADTEST_SUMMARY_INTERVAL_MS") ??
    5000;
  const summaryIntervalMs = Math.max(1000, Math.floor(summaryIntervalMsRaw));

  const autoExitOnComplete =
    readBooleanFromOptions(options, "autoExitOnComplete") ??
    readBooleanFromEnv("LOADTEST_AUTO_EXIT_ON_COMPLETE") ??
    (durationMs > 0);

  const defaultInputDebounceMsRaw =
    readNumberFromOptions(options, "inputDebounceMs") ??
    readNumberFromEnv("LOADTEST_INPUT_DEBOUNCE_MS") ??
    1000 / 60;
  const defaultInputDebounceMs = Math.max(1, defaultInputDebounceMsRaw);

  return {
    roomCode,
    requestTimeoutMs,
    durationMs,
    summaryIntervalMs,
    autoExitOnComplete,
    defaultInputDebounceMs,
  };
}

function setupMetrics(options: LoadtestOptions, config: MinimalConfig): void {
  if (METRICS.initialized) return;
  METRICS.initialized = true;
  METRICS.startedAtMs = Date.now();
  METRICS.expectedClients = Math.max(1, Math.floor(options.numClients));
  METRICS.autoExitOnComplete = config.autoExitOnComplete;
  METRICS.exitRequested = false;

  METRICS.summaryInterval = setInterval(() => {
    console.log("[LoadTest.minimal.summary]", summaryLine());
    maybeExitWhenRunIsComplete();
  }, config.summaryIntervalMs);

  process.on("exit", () => {
    printFinalSummary();
  });
}

function readStatePhase(state: unknown): string {
  const view = state as { phase?: unknown };
  return typeof view.phase === "string" ? view.phase : "LOBBY";
}

function readSnapshotTickDurationMs(payload: unknown): number | null {
  const view = payload as { tickDurationMs?: unknown };
  if (typeof view.tickDurationMs !== "number") return null;
  if (!Number.isFinite(view.tickDurationMs)) return null;
  if (view.tickDurationMs <= 0) return null;
  return view.tickDurationMs;
}

function isAbnormalDisconnectCode(code: number): boolean {
  return code === 1005 || code === 1006;
}

function isConsentedLeaveCode(code: number): boolean {
  return code === 4000;
}

function resolveHttpJoinEndpoint(wsEndpoint: string): string {
  try {
    const url = new URL(wsEndpoint);
    if (url.protocol === "ws:") {
      url.protocol = "http:";
    } else if (url.protocol === "wss:") {
      url.protocol = "https:";
    } else if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("Unsupported endpoint protocol");
    }
    url.pathname = "/match/join";
    url.search = "";
    return url.toString();
  } catch (_error) {
    throw new Error("Invalid endpoint: " + wsEndpoint);
  }
}

async function requestSeatReservation(
  wsEndpoint: string,
  roomCode: string,
  playerName: string,
): Promise<{ seatReservation: unknown; roomId: string | null }> {
  const endpoint = resolveHttpJoinEndpoint(wsEndpoint);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      roomCode,
      playerName,
    }),
  });

  const bodyText = await response.text();
  const parsedBody =
    bodyText.length > 0 ? (JSON.parse(bodyText) as unknown) : null;

  if (!response.ok) {
    const view = parsedBody as { error?: unknown; message?: unknown };
    const code =
      typeof view?.error === "string"
        ? view.error
        : "HTTP_" + response.status.toString();
    const message =
      typeof view?.message === "string"
        ? view.message
        : response.statusText || "join request failed";
    throw new Error(code + ": " + message);
  }

  if (!parsedBody || typeof parsedBody !== "object") {
    throw new Error("Join response was empty");
  }

  const view = parsedBody as JoinSeatSuccess | JoinSeatError;
  if ("ok" in view && view.ok === false) {
    throw new Error((view.error ?? "JOIN_FAILED") + ": " + (view.message ?? ""));
  }

  if (!("seatReservation" in view) || view.seatReservation === undefined) {
    throw new Error("Join response did not include seatReservation");
  }

  return {
    seatReservation: view.seatReservation,
    roomId: typeof view.roomId === "string" ? view.roomId : null,
  };
}

function attachMinimalGameplayLoop(
  room: LoadtestRoom,
  config: MinimalConfig,
  clientId: number,
): void {
  let phase = "LOBBY";
  let inputSequence = 0;
  let buttonA = false;
  let buttonB = false;
  let closed = false;
  let leaveRequested = false;
  let spamRunning = false;

  let effectiveIntervalMs = config.defaultInputDebounceMs;
  let inputInterval: ReturnType<typeof setInterval> | null = null;

  const sendInput = (): void => {
    if (closed) return;
    if (phase !== "PLAYING") return;
    inputSequence += 1;
    buttonA = !buttonA;
    buttonB = !buttonB;
    room.send("cmd:input", {
      buttonA,
      buttonB,
      clientTimeMs: Date.now(),
      inputSequence,
    });
    METRICS.inputsSent += 1;
  };

  const restartInputInterval = (intervalMs: number): void => {
    if (inputInterval) clearInterval(inputInterval);
    inputInterval = setInterval(sendInput, Math.max(1, Math.floor(intervalMs)));
  };

  const stopSpamLoop = (): void => {
    if (inputInterval) {
      clearInterval(inputInterval);
      inputInterval = null;
    }
    spamRunning = false;
  };

  const startSpamLoop = (): void => {
    restartInputInterval(effectiveIntervalMs);
    spamRunning = true;
  };

  const syncSpamLoopForPhase = (): void => {
    const shouldRun = !closed && phase === "PLAYING";
    if (shouldRun && !spamRunning) {
      startSpamLoop();
      return;
    }
    if (!shouldRun && spamRunning) {
      stopSpamLoop();
    }
  };

  const requestGracefulLeave = (reason: string): void => {
    if (closed) return;
    if (leaveRequested) return;
    leaveRequested = true;
    void room.leave(false).catch((error: unknown) => {
      console.log(
        "[LoadTest.minimal.attachLoop]",
        "Client " +
          clientId +
          " leave after " +
          reason +
          " failed: " +
          String(error),
      );
    });
  };

  room.onStateChange((state) => {
    phase = readStatePhase(state);
    syncSpamLoopForPhase();
  });

  syncSpamLoopForPhase();

  room.onMessage("evt:snapshot", (payload) => {
    const tickDurationMs = readSnapshotTickDurationMs(payload);
    if (tickDurationMs !== null) {
      const nextIntervalMs = Math.max(
        config.defaultInputDebounceMs,
        tickDurationMs,
      );
      if (Math.abs(nextIntervalMs - effectiveIntervalMs) > 0.5) {
        effectiveIntervalMs = nextIntervalMs;
        if (spamRunning) {
          restartInputInterval(effectiveIntervalMs);
        }
      }
    }

    // Intentionally read snapshots and discard payload after counting.
    if (phase === "PLAYING") {
      METRICS.snapshotsReadDuringPlaying += 1;
    }
  });

  room.onMessage("evt:asteroid_colliders", (_payload) => {});
  room.onMessage("evt:sound", (_payload) => {});
  room.onMessage("evt:screen_shake", (_payload) => {});
  room.onMessage("evt:dash_particles", (_payload) => {});
  room.onMessage("evt:player_removed", (_payload) => {});
  room.onMessage("evt:rng_seed", (_payload) => {});

  let leaveTimeout: ReturnType<typeof setTimeout> | null = null;
  if (config.durationMs > 0) {
    leaveTimeout = setTimeout(() => {
      requestGracefulLeave("duration");
    }, config.durationMs);
  }

  room.onLeave((code) => {
    closed = true;
    stopSpamLoop();
    if (leaveTimeout) clearTimeout(leaveTimeout);

    METRICS.activeClients.delete(clientId);
    METRICS.disconnectedClients.add(clientId);
    if (isAbnormalDisconnectCode(code)) {
      METRICS.abnormalDisconnects += 1;
    }
    if (isConsentedLeaveCode(code)) {
      METRICS.consentedLeaves += 1;
    }
    incrementMapCounter(METRICS.leaveCodes, code);

    console.log(
      "[LoadTest.minimal.attachLoop]",
      "Client " +
        clientId +
        " left with code " +
        code +
        " isAbnormalDisconnect=" +
        isAbnormalDisconnectCode(code) +
        " isConsentedLeave=" +
        isConsentedLeaveCode(code),
    );
    maybeExitWhenRunIsComplete();
  });

  room.onError((code, message) => {
    incrementMapCounter(METRICS.roomErrors, code.toString());
    console.log(
      "[LoadTest.minimal.attachLoop]",
      "Client " +
        clientId +
        " room error " +
        code +
        " message " +
        (message ?? ""),
    );
    requestGracefulLeave("room_error_" + code.toString());
  });
}

export default async function main(options: LoadtestOptions): Promise<void> {
  const config = resolveMinimalConfig(options);
  setupMetrics(options, config);
  METRICS.attemptedClients += 1;

  const client = new Client(options.endpoint);
  const playerName = "lt-roomcode-" + options.clientId;

  try {
    const seat = await withTimeout(
      requestSeatReservation(options.endpoint, config.roomCode, playerName),
      config.requestTimeoutMs,
      "requesting seat reservation for client " + options.clientId,
    );

    // Stagger slightly so consume calls stay spread when many join at once.
    await sleep(options.clientId % 4 === 0 ? 8 : 0);

    const room = (await withTimeout(
      client.consumeSeatReservation(
        seat.seatReservation as Parameters<Client["consumeSeatReservation"]>[0],
      ),
      config.requestTimeoutMs,
      "consuming seat reservation for client " + options.clientId,
    )) as LoadtestRoom;

    METRICS.joinedClients.add(options.clientId);
    METRICS.activeClients.add(options.clientId);

    console.log(
      "[LoadTest.minimal.main]",
      "Client " +
        options.clientId +
        " joined roomCode=" +
        config.roomCode +
        " roomId=" +
        (seat.roomId ?? room.roomId),
    );

    attachMinimalGameplayLoop(room, config, options.clientId);
  } catch (error) {
    const reason =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error);
    recordFailure(options.clientId, reason);
    console.log(
      "[LoadTest.minimal.main]",
      "Client " + options.clientId + " failed: " + reason,
    );
    throw error;
  }
}
