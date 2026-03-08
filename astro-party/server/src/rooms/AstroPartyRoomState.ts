import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class RoomPlayerMetaState extends Schema {
  @type("string") id = "";
  @type("string") customName = "";
  @type("string") profileName = "";
  @type("string") botType = "";
  @type("number") colorIndex = 0;
  @type("number") keySlot = -1;
  @type("number") kills = 0;
  @type("number") roundWins = 0;
  @type("number") score = 0;
  @type("string") playerState = "ACTIVE";
  @type("boolean") isBot = false;
}

export class AstroPartyRoomState extends Schema {
  @type(["string"]) playerOrder = new ArraySchema<string>();
  @type({ map: RoomPlayerMetaState })
  players = new MapSchema<RoomPlayerMetaState>();

  @type("string") roomCode = "";
  @type("string") leaderPlayerId = "";
  @type("string") hostId = "";
  @type("string") phase = "LOBBY";
  @type("string") mode = "STANDARD";
  @type("string") baseMode = "STANDARD";
  @type("number") mapId = 0;
  @type("string") settingsJson = "";
  @type("string") roundResultJson = "";
  @type("number") roundResultRevision = 0;
  @type("number") countdown = 0;
  @type("boolean") devModeEnabled = false;
  @type("boolean") debugToolsEnabled = false;
  @type("boolean") debugSessionTainted = false;
}
