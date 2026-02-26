import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server, matchMaker } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import type { RequestHandler } from "express";
import { AstroPartyRoom } from "./rooms/AstroPartyRoom.js";
import { opsStats } from "./monitoring/OpsStats.js";
import {
  generateUniqueRoomCode,
  getRoomIdByCode,
  normalizeRoomCode,
  registerRoomCode,
} from "./http/roomCodeRegistry.js";

const port = Number.parseInt(process.env.PORT ?? "2567", 10);
const corsOrigin = process.env.CORS_ORIGIN ?? "*";
const maxPlayers = Number.parseInt(process.env.MAX_PLAYERS ?? "4", 10);
const simTickHz = Number.parseInt(process.env.SIM_TICK_HZ ?? "60", 10);
const wsMaxPayloadBytes = Number.parseInt(
  process.env.WS_MAX_PAYLOAD_BYTES ?? "262144",
  10,
);
const roomCodeLength = Number.parseInt(process.env.ROOM_CODE_LENGTH ?? "4", 10);
const monitorEnabledDefault = process.env.NODE_ENV !== "production";
let monitorEnabled = parseBooleanEnv(
  process.env.COLYSEUS_MONITOR_ENABLED,
  monitorEnabledDefault,
);
const monitorPath = normalizeMonitorPath(process.env.COLYSEUS_MONITOR_PATH);
const monitorUsername = readOptionalEnv(process.env.COLYSEUS_MONITOR_USERNAME);
const monitorPassword = readOptionalEnv(process.env.COLYSEUS_MONITOR_PASSWORD);
const opsStatsEnabled = parseBooleanEnv(process.env.OPS_STATS_ENABLED, true);
const opsStatsPath = normalizeOpsPath(process.env.OPS_STATS_PATH);
const opsStatsToken = readOptionalEnv(process.env.OPS_STATS_TOKEN);

if (
  monitorEnabled &&
  ((monitorUsername && !monitorPassword) ||
    (!monitorUsername && monitorPassword))
) {
  monitorEnabled = false;
  console.warn(
    "[Server]",
    "COLYSEUS_MONITOR_USERNAME and COLYSEUS_MONITOR_PASSWORD must both be set. Monitor disabled for safety.",
  );
}

function parseBooleanEnv(rawValue: string | undefined, fallback: boolean): boolean {
  if (rawValue === undefined) return fallback;
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function readOptionalEnv(rawValue: string | undefined): string | null {
  if (typeof rawValue !== "string") return null;
  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMonitorPath(rawValue: string | undefined): string {
  if (typeof rawValue !== "string") return "/colyseus";
  const trimmed = rawValue.trim();
  if (trimmed.length <= 0) return "/colyseus";
  if (trimmed.startsWith("/")) return trimmed;
  return "/" + trimmed;
}

function normalizeOpsPath(rawValue: string | undefined): string {
  if (typeof rawValue !== "string") return "/ops/stats";
  const trimmed = rawValue.trim();
  if (trimmed.length <= 0) return "/ops/stats";
  if (trimmed.startsWith("/")) return trimmed;
  return "/" + trimmed;
}

function createBasicAuthMiddleware(
  username: string,
  password: string,
): RequestHandler {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Basic ")) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Colyseus Monitor"');
      res.status(401).send("Authentication required");
      return;
    }

    let decoded = "";
    try {
      decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    } catch (_error) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Colyseus Monitor"');
      res.status(401).send("Invalid authorization header");
      return;
    }

    const separatorIndex = decoded.indexOf(":");
    const providedUsername =
      separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : decoded;
    const providedPassword =
      separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : "";

    if (providedUsername !== username || providedPassword !== password) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Colyseus Monitor"');
      res.status(401).send("Unauthorized");
      return;
    }

    next();
  };
}

function createOpsTokenMiddleware(token: string | null): RequestHandler {
  return (req, res, next) => {
    if (!token) {
      next();
      return;
    }
    const provided = req.headers["x-ops-token"];
    const providedValue =
      typeof provided === "string"
        ? provided
        : Array.isArray(provided)
          ? provided[0]
          : null;
    if (providedValue === token) {
      next();
      return;
    }
    res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Missing or invalid x-ops-token",
    });
  };
}

process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[Server] Uncaught exception", error);
});

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

const httpServer = createServer(app);
httpServer.on("connection", (socket) => {
  socket.setNoDelay(true);
});

const gameServer = new Server({
  transport: new WebSocketTransport({
    server: httpServer,
    perMessageDeflate: false,
    maxPayload: wsMaxPayloadBytes,
  }),
});

gameServer.define("astro_party", AstroPartyRoom);

if (monitorEnabled) {
  const monitorMiddleware = monitor();
  if (monitorUsername && monitorPassword) {
    app.use(
      monitorPath,
      createBasicAuthMiddleware(monitorUsername, monitorPassword),
      monitorMiddleware,
    );
    console.log(
      "[Server]",
      "Colyseus monitor enabled at " + monitorPath + " with basic auth",
    );
  } else {
    app.use(monitorPath, monitorMiddleware);
    console.log(
      "[Server]",
      "Colyseus monitor enabled at " + monitorPath + " without auth",
    );
  }
}

if (opsStatsEnabled) {
  app.get(opsStatsPath, createOpsTokenMiddleware(opsStatsToken), async (_req, res) => {
    try {
      const listings = await matchMaker.query({ name: "astro_party" });
      const roomCount = listings.length;
      const lockedRoomCount = listings.reduce(
        (acc, listing) => acc + (listing.locked ? 1 : 0),
        0,
      );
      const clientsConnected = listings.reduce(
        (acc, listing) =>
          acc + (Number.isFinite(listing.clients) ? (listing.clients as number) : 0),
        0,
      );
      const maxClientsTotal = listings.reduce(
        (acc, listing) =>
          acc +
          (Number.isFinite(listing.maxClients)
            ? (listing.maxClients as number)
            : 0),
        0,
      );

      res.json({
        ...opsStats.snapshot(),
        matchMaker: {
          astroPartyRoomCount: roomCount,
          astroPartyLockedRoomCount: lockedRoomCount,
          astroPartyClientsConnected: clientsConnected,
          astroPartyMaxClientsTotal: maxClientsTotal,
        },
      });
    } catch (error) {
      console.error("[Server] Failed to build ops stats", error);
      res.status(500).json({
        error: "OPS_STATS_FAILED",
        message: "Failed to build ops stats",
      });
    }
  });
  console.log(
    "[Server]",
    "Ops stats endpoint enabled at " +
      opsStatsPath +
      (opsStatsToken ? " with token auth" : " without auth"),
  );
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/match/create", async (req, res) => {
  try {
    const playerName =
      typeof req.body?.playerName === "string" ? req.body.playerName : undefined;
    const roomCode = generateUniqueRoomCode(roomCodeLength);
    const room = await matchMaker.createRoom("astro_party", {
      roomCode,
      maxPlayers,
      simTickHz,
    });
    registerRoomCode(room.roomId, roomCode);
    const seatReservation = await matchMaker.joinById(room.roomId, {
      playerName,
    });

    res.json({
      roomCode,
      roomId: room.roomId,
      seatReservation,
    });
  } catch (error) {
    console.error("[Server] Failed to create match", error);
    res.status(500).json({
      error: "CREATE_FAILED",
      message: "Failed to create room",
    });
  }
});

app.post("/match/join", async (req, res) => {
  try {
    const code =
      typeof req.body?.roomCode === "string"
        ? normalizeRoomCode(req.body.roomCode)
        : "";
    if (code.length < roomCodeLength) {
      res.json({
        ok: false,
        error: "INVALID_CODE",
        message: "Room code is invalid",
      });
      return;
    }

    const roomId = getRoomIdByCode(code);
    if (!roomId) {
      res.json({
        ok: false,
        error: "NOT_FOUND",
        message: "Room not found",
      });
      return;
    }

    const listing = (await matchMaker.query({ roomId }))[0];
    if (!listing) {
      res.json({
        ok: false,
        error: "NOT_FOUND",
        message: "Room not found",
      });
      return;
    }
    if (listing.locked) {
      res.json({
        ok: false,
        error: "MATCH_IN_PROGRESS",
        message: "Match already started",
      });
      return;
    }

    const playerName =
      typeof req.body?.playerName === "string" ? req.body.playerName : undefined;
    const seatReservation = await matchMaker.joinById(roomId, {
      playerName,
    });

    res.json({
      ok: true,
      roomCode: code,
      roomId,
      seatReservation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("is locked")) {
      res.json({
        ok: false,
        error: "MATCH_IN_PROGRESS",
        message: "Match already started",
      });
      return;
    }
    console.error("[Server] Failed to join match", error);
    res.status(409).json({
      error: "JOIN_FAILED",
      message: "Could not join room",
    });
  }
});

httpServer.listen(port, () => {
  console.log("[Server] Astro Party Colyseus server listening on port", port);
});

