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

interface LobbyfillConfig {
  usersPerRoom: number;
  requestTimeoutMs: number;
  waitForGroupMs: number;
  startDelayMs: number;
  startFallbackMs: number;
  durationMs: number;
  autoExitOnComplete: boolean;
  summaryIntervalMs: number;
  defaultInputDebounceMs: number;
}

interface Placement {
  groupId: number;
  indexInGroup: number;
  isLeader: boolean;
  expectedHumans: number;
}

interface GroupRoomContext {
  roomId: string;
  roomCode: string;
  expectedHumans: number;
  leaderClientId: number;
  leaderRoom: LoadtestRoom;
}

interface MetricsState {
  startedAtMs: number;
  attemptedClients: number;
  joinedClients: Set<number>;
  activeClients: Set<number>;
  disconnectedClients: Set<number>;
  failedClients: Set<number>;
  disconnectCodes: Map<number, number>;
  roomErrors: Map<string, number>;
  failureReasons: Map<string, number>;
  createdRooms: number;
  startCommandsSent: number;
  inputsSent: number;
  snapshotsReadDuringPlaying: number;
  serverDisconnects: number;
  summaryInterval: ReturnType<typeof setInterval> | null;
  expectedClients: number;
  autoExitOnComplete: boolean;
  exitRequested: boolean;
  finalSummaryPrinted: boolean;
  initialized: boolean;
}

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const RUN_ROOM_CODE_SALT = (Date.now() ^ process.pid) >>> 0;

const GROUPS = new Map<number, Promise<GroupRoomContext>>();

const METRICS: MetricsState = {
  startedAtMs: Date.now(),
  attemptedClients: 0,
  joinedClients: new Set<number>(),
  activeClients: new Set<number>(),
  disconnectedClients: new Set<number>(),
  failedClients: new Set<number>(),
  disconnectCodes: new Map<number, number>(),
  roomErrors: new Map<string, number>(),
  failureReasons: new Map<string, number>(),
  createdRooms: 0,
  startCommandsSent: 0,
  inputsSent: 0,
  snapshotsReadDuringPlaying: 0,
  serverDisconnects: 0,
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
    "ts=" +
    new Date().toISOString() +
    " uptime=" +
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
    " roomsCreated=" +
    METRICS.createdRooms +
    " matchStarts=" +
    METRICS.startCommandsSent +
    " serverDisconnects=" +
    METRICS.serverDisconnects +
    " snapshotsPlaying=" +
    METRICS.snapshotsReadDuringPlaying +
    " inputsSent=" +
    METRICS.inputsSent
  );
}

function runOutcomeLine(): string {
  const expected = Math.max(METRICS.expectedClients, METRICS.attemptedClients);
  const topDisconnectCodes = [...METRICS.disconnectCodes.entries()]
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
    " topDisconnectCodes=" +
    (topDisconnectCodes.length > 0 ? topDisconnectCodes : "none") +
    " topLeaveCodes=" +
    (topDisconnectCodes.length > 0 ? topDisconnectCodes : "none")
  );
}

function printFinalSummary(): void {
  if (METRICS.finalSummaryPrinted) return;
  METRICS.finalSummaryPrinted = true;

  console.log("[LoadTest.lobbyfill.summary]", summaryLine());
  console.log("[LoadTest.lobbyfill.result]", runOutcomeLine());

  if (METRICS.failureReasons.size > 0) {
    const reasons = [...METRICS.failureReasons.entries()]
      .map(([reason, count]) => reason + ":" + count)
      .join(", ");
    console.log("[LoadTest.lobbyfill.summary]", "failureReasons=" + reasons);
  }

  if (METRICS.disconnectCodes.size > 0) {
    const disconnectCodes = [...METRICS.disconnectCodes.entries()]
      .map(([code, count]) => code.toString() + ":" + count.toString())
      .join(", ");
    console.log(
      "[LoadTest.lobbyfill.summary]",
      "disconnectCodes=" + disconnectCodes,
    );
    console.log("[LoadTest.lobbyfill.summary]", "leaveCodes=" + disconnectCodes);
  }

  if (METRICS.roomErrors.size > 0) {
    const roomErrors = [...METRICS.roomErrors.entries()]
      .map(([code, count]) => code + ":" + count)
      .join(", ");
    console.log("[LoadTest.lobbyfill.summary]", "roomErrors=" + roomErrors);
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
    "[LoadTest.lobbyfill.summary]",
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

function resolveLobbyfillConfig(options: LoadtestOptions): LobbyfillConfig {
  const usersPerRoomRaw =
    readNumberFromOptions(options, "usersPerRoom") ??
    readNumberFromEnv("LOADTEST_USERS_PER_ROOM") ??
    4;
  const usersPerRoom = Math.max(1, Math.floor(usersPerRoomRaw));

  const requestTimeoutMsRaw =
    readNumberFromOptions(options, "requestTimeoutMs") ??
    readNumberFromEnv("LOADTEST_REQUEST_TIMEOUT_MS") ??
    15000;
  const requestTimeoutMs = Math.max(1000, Math.floor(requestTimeoutMsRaw));

  const waitForGroupMsRaw =
    readNumberFromOptions(options, "waitForGroupMs") ??
    readNumberFromEnv("LOADTEST_WAIT_FOR_GROUP_MS") ??
    30000;
  const waitForGroupMs = Math.max(1000, Math.floor(waitForGroupMsRaw));

  const startDelayMsRaw =
    readNumberFromOptions(options, "startDelayMs") ??
    readNumberFromEnv("LOADTEST_START_DELAY_MS") ??
    500;
  const startDelayMs = Math.max(0, Math.floor(startDelayMsRaw));

  const startFallbackMsRaw =
    readNumberFromOptions(options, "startFallbackMs") ??
    readNumberFromEnv("LOADTEST_START_FALLBACK_MS") ??
    12000;
  const startFallbackMs = Math.max(1000, Math.floor(startFallbackMsRaw));

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

  const autoExitOnComplete =
    readBooleanFromOptions(options, "autoExitOnComplete") ??
    readBooleanFromEnv("LOADTEST_AUTO_EXIT_ON_COMPLETE") ??
    (durationMs > 0);

  const summaryIntervalMsRaw =
    readNumberFromOptions(options, "summaryIntervalMs") ??
    readNumberFromEnv("LOADTEST_SUMMARY_INTERVAL_MS") ??
    5000;
  const summaryIntervalMs = Math.max(1000, Math.floor(summaryIntervalMsRaw));

  const defaultInputDebounceMsRaw =
    readNumberFromOptions(options, "inputDebounceMs") ??
    readNumberFromEnv("LOADTEST_INPUT_DEBOUNCE_MS") ??
    1000 / 60;
  const defaultInputDebounceMs = Math.max(1, defaultInputDebounceMsRaw);

  return {
    usersPerRoom,
    requestTimeoutMs,
    waitForGroupMs,
    startDelayMs,
    startFallbackMs,
    durationMs,
    autoExitOnComplete,
    summaryIntervalMs,
    defaultInputDebounceMs,
  };
}

function setupMetrics(options: LoadtestOptions, config: LobbyfillConfig): void {
  if (METRICS.initialized) return;
  METRICS.initialized = true;
  METRICS.startedAtMs = Date.now();
  METRICS.expectedClients = Math.max(1, Math.floor(options.numClients));
  METRICS.autoExitOnComplete = config.autoExitOnComplete;
  METRICS.exitRequested = false;

  METRICS.summaryInterval = setInterval(() => {
    console.log("[LoadTest.lobbyfill.summary]", summaryLine());
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

function readStatePlayerCount(state: unknown): number {
  const view = state as { playerOrder?: { length?: unknown } };
  const lengthValue = view.playerOrder?.length;
  return typeof lengthValue === "number" && Number.isFinite(lengthValue)
    ? lengthValue
    : 0;
}

function readSnapshotTickDurationMs(payload: unknown): number | null {
  const view = payload as { tickDurationMs?: unknown };
  if (typeof view.tickDurationMs !== "number") return null;
  if (!Number.isFinite(view.tickDurationMs)) return null;
  if (view.tickDurationMs <= 0) return null;
  return view.tickDurationMs;
}

function isServerDisconnectCode(code: number): boolean {
  return code === 1006 || (code >= 4000 && code <= 4999);
}

function resolvePlacement(
  clientId: number,
  numClients: number,
  usersPerRoom: number,
): Placement {
  const groupId = Math.floor(clientId / usersPerRoom);
  const indexInGroup = clientId % usersPerRoom;
  const remaining = Math.max(0, numClients - groupId * usersPerRoom);
  const expectedHumans = Math.max(1, Math.min(usersPerRoom, remaining));
  return {
    groupId,
    indexInGroup,
    isLeader: indexInGroup === 0,
    expectedHumans,
  };
}

function buildRoomCode(groupId: number): string {
  let seed = (((groupId + 1) * 7919) ^ RUN_ROOM_CODE_SALT) >>> 0;
  let code = "";
  while (code.length < 4) {
    seed = (seed * 31 + code.length * 17) >>> 0;
    const index = seed % ROOM_CODE_ALPHABET.length;
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

async function waitForGroup(
  groupId: number,
  timeoutMs: number,
): Promise<GroupRoomContext> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const promise = GROUPS.get(groupId);
    if (promise) {
      const remainingMs = Math.max(1, deadline - Date.now());
      return await withTimeout(
        promise,
        remainingMs,
        "waiting for group " + groupId,
      );
    }
    await sleep(25);
  }
  throw new Error("Timed out waiting for group " + groupId);
}

function attachInputLoop(
  room: LoadtestRoom,
  config: LobbyfillConfig,
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

  const requestGracefulLeave = (reason: string, consented: boolean): void => {
    if (closed) return;
    if (leaveRequested) return;
    leaveRequested = true;
    void room.leave(consented).catch((error: unknown) => {
      console.log(
        "[LoadTest.lobbyfill.attachInputLoop]",
        "Client " +
          clientId +
          " leave after " +
          reason +
          " consented=" +
          consented +
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
      // Planned stop for test lifecycle: mark as consented.
      requestGracefulLeave("duration", true);
    }, config.durationMs);
  }

  room.onLeave((code) => {
    closed = true;
    stopSpamLoop();
    if (leaveTimeout) clearTimeout(leaveTimeout);

    METRICS.activeClients.delete(clientId);
    METRICS.disconnectedClients.add(clientId);
    if (isServerDisconnectCode(code)) {
      METRICS.serverDisconnects += 1;
    }
    incrementMapCounter(METRICS.disconnectCodes, code);

    console.log(
      "[LoadTest.lobbyfill.attachInputLoop]",
      "ts=" +
        new Date().toISOString() +
        " client=" +
        clientId +
        " roomId=" +
        room.roomId +
        " leaveCode=" +
        code +
        " phase=" +
        phase +
        " inputSequence=" +
        inputSequence +
        " isServerDisconnect=" +
        isServerDisconnectCode(code),
    );
    maybeExitWhenRunIsComplete();
  });

  room.onError((code, message) => {
    incrementMapCounter(METRICS.roomErrors, code.toString());
    console.log(
      "[LoadTest.lobbyfill.attachInputLoop]",
      "ts=" +
        new Date().toISOString() +
        " client=" +
        clientId +
        " roomId=" +
        room.roomId +
        " roomErrorCode=" +
        code +
        " message=" +
        (message ?? ""),
    );
    // Preserve anomaly signal for room/server error path.
    requestGracefulLeave("room_error_" + code.toString(), false);
  });
}

function attachLeaderStartControls(
  room: LoadtestRoom,
  config: LobbyfillConfig,
  placement: Placement,
  clientId: number,
): void {
  let phase = "LOBBY";
  let playerCount = 1;
  let closed = false;
  let startSent = false;

  const requiredPlayersForStart = Math.max(2, placement.expectedHumans);

  const sendStart = (reason: string): void => {
    if (closed) return;
    if (phase !== "LOBBY") return;
    if (startSent) return;
    startSent = true;
    room.send("cmd:start_match", {});
    METRICS.startCommandsSent += 1;
    console.log(
      "[LoadTest.lobbyfill.attachLeaderStartControls]",
      "Leader " +
        clientId +
        " sent cmd:start_match reason=" +
        reason +
        " players=" +
        playerCount,
    );
  };

  const maybeStart = (): void => {
    if (closed) return;
    if (phase !== "LOBBY") return;
    if (startSent) return;
    if (playerCount < requiredPlayersForStart) return;
    setTimeout(() => {
      sendStart("lobby_full");
    }, config.startDelayMs);
  };

  room.onStateChange((state) => {
    phase = readStatePhase(state);
    playerCount = readStatePlayerCount(state);
    maybeStart();
  });

  const fallbackStart = setTimeout(() => {
    if (closed) return;
    if (phase !== "LOBBY") return;
    if (startSent) return;
    if (playerCount < 2) return;
    sendStart("fallback");
  }, config.startFallbackMs);

  room.onLeave(() => {
    closed = true;
    clearTimeout(fallbackStart);
  });
}

export default async function main(options: LoadtestOptions): Promise<void> {
  const config = resolveLobbyfillConfig(options);
  setupMetrics(options, config);
  METRICS.attemptedClients += 1;

  const client = new Client(options.endpoint);
  const placement = resolvePlacement(
    options.clientId,
    options.numClients,
    config.usersPerRoom,
  );
  const playerName = "lt-lobbyfill-" + options.clientId;

  try {
    let room: LoadtestRoom;
    if (placement.isLeader) {
      const existing = GROUPS.get(placement.groupId);
      if (!existing) {
        const createPromise = (async () => {
          const roomCode = buildRoomCode(placement.groupId);
          const createdRoom = (await withTimeout(
            client.create(options.roomName, {
              playerName,
              roomCode,
              maxPlayers: placement.expectedHumans,
            }),
            config.requestTimeoutMs,
            "creating room for client " + options.clientId,
          )) as LoadtestRoom;

          const roomId =
            typeof createdRoom.roomId === "string" ? createdRoom.roomId : "";
          if (roomId.length <= 0) {
            throw new Error("Room creation did not return roomId");
          }

          METRICS.createdRooms += 1;
          console.log(
            "[LoadTest.lobbyfill.main]",
            "Leader client " +
              options.clientId +
              " created room " +
              roomId +
              " roomCode=" +
              roomCode +
              " group=" +
              placement.groupId +
              " expectedHumans=" +
              placement.expectedHumans,
          );

          return {
            roomId,
            roomCode,
            expectedHumans: placement.expectedHumans,
            leaderClientId: options.clientId,
            leaderRoom: createdRoom as LoadtestRoom,
          } satisfies GroupRoomContext;
        })();
        GROUPS.set(placement.groupId, createPromise);
      }

      const context = await waitForGroup(placement.groupId, config.waitForGroupMs);
      room = context.leaderRoom;
    } else {
      const context = await waitForGroup(placement.groupId, config.waitForGroupMs);
      room = (await withTimeout(
        client.joinById(context.roomId, { playerName }),
        config.requestTimeoutMs,
        "joining roomId for client " + options.clientId,
      )) as LoadtestRoom;

      console.log(
        "[LoadTest.lobbyfill.main]",
        "Client " +
          options.clientId +
          " joined room " +
          room.roomId +
          " roomCode=" +
          context.roomCode +
          " group=" +
          placement.groupId,
      );
    }

    METRICS.joinedClients.add(options.clientId);
    METRICS.activeClients.add(options.clientId);
    attachInputLoop(room, config, options.clientId);

    if (placement.isLeader) {
      attachLeaderStartControls(room, config, placement, options.clientId);
    }
  } catch (error) {
    const reason =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error);
    recordFailure(options.clientId, reason);
    console.log(
      "[LoadTest.lobbyfill.main]",
      "Client " + options.clientId + " failed: " + reason,
    );
    throw error;
  }
}
