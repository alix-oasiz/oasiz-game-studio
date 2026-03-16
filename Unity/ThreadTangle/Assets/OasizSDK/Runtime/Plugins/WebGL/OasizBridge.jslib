var OasizBridge = {
  OasizSubmitScore: function(score) {
    if (typeof window.submitScore === "function") {
      window.submitScore(score);
    } else {
      console.warn("[OasizSDK] submitScore bridge is unavailable.");
    }
  },

  OasizEmitScoreConfig: function(configJsonPtr) {
    var json = UTF8ToString(configJsonPtr);
    try {
      var config = JSON.parse(json);
      if (typeof window.emitScoreConfig === "function") {
        window.emitScoreConfig(config);
      } else {
        console.warn("[OasizSDK] emitScoreConfig bridge is unavailable.");
      }
    } catch (e) {
      console.error("[OasizSDK] emitScoreConfig failed to parse config JSON:", e);
    }
  },

  OasizTriggerHaptic: function(typePtr) {
    var type = UTF8ToString(typePtr);
    if (typeof window.triggerHaptic === "function") {
      window.triggerHaptic(type);
    } else {
      console.warn("[OasizSDK] triggerHaptic bridge is unavailable.");
    }
  },

  OasizLoadGameState: function() {
    var result = "{}";
    if (typeof window.loadGameState === "function") {
      try {
        var state = window.loadGameState();
        result = JSON.stringify(state && typeof state === "object" ? state : {});
      } catch (e) {
        console.error("[OasizSDK] loadGameState failed:", e);
      }
    } else {
      console.warn("[OasizSDK] loadGameState bridge is unavailable.");
    }
    var bufferSize = lengthBytesUTF8(result) + 1;
    var buffer = _malloc(bufferSize);
    stringToUTF8(result, buffer, bufferSize);
    return buffer;
  },

  OasizSaveGameState: function(stateJsonPtr) {
    var json = UTF8ToString(stateJsonPtr);
    try {
      var state = JSON.parse(json);
      if (typeof window.saveGameState === "function") {
        window.saveGameState(state);
      } else {
        console.warn("[OasizSDK] saveGameState bridge is unavailable.");
      }
    } catch (e) {
      console.error("[OasizSDK] saveGameState failed to parse state JSON:", e);
    }
  },

  OasizFlushGameState: function() {
    if (typeof window.flushGameState === "function") {
      window.flushGameState();
    } else {
      console.warn("[OasizSDK] flushGameState bridge is unavailable.");
    }
  },

  OasizLeaveGame: function() {
    if (typeof window.__oasizLeaveGame === "function") {
      window.__oasizLeaveGame();
    } else {
      console.warn("[OasizSDK] __oasizLeaveGame bridge is unavailable.");
    }
  },

  OasizSetBackOverride: function(active) {
    if (typeof window.__oasizSetBackOverride === "function") {
      window.__oasizSetBackOverride(active !== 0);
    } else {
      console.warn("[OasizSDK] __oasizSetBackOverride bridge is unavailable.");
    }
  },

  OasizShareRoomCode: function(roomCodePtr) {
    var roomCode = roomCodePtr ? UTF8ToString(roomCodePtr) : null;
    if (roomCode === "") roomCode = null;
    if (typeof window.shareRoomCode === "function") {
      window.shareRoomCode(roomCode);
    } else {
      console.warn("[OasizSDK] shareRoomCode bridge is unavailable.");
    }
  },

  OasizGetGameId: function() {
    var val = window.__GAME_ID__ != null ? String(window.__GAME_ID__) : "";
    var bufferSize = lengthBytesUTF8(val) + 1;
    var buffer = _malloc(bufferSize);
    stringToUTF8(val, buffer, bufferSize);
    return buffer;
  },

  OasizGetRoomCode: function() {
    var val = window.__ROOM_CODE__ != null ? String(window.__ROOM_CODE__) : "";
    var bufferSize = lengthBytesUTF8(val) + 1;
    var buffer = _malloc(bufferSize);
    stringToUTF8(val, buffer, bufferSize);
    return buffer;
  },

  OasizGetPlayerName: function() {
    var val = window.__PLAYER_NAME__ != null ? String(window.__PLAYER_NAME__) : "";
    var bufferSize = lengthBytesUTF8(val) + 1;
    var buffer = _malloc(bufferSize);
    stringToUTF8(val, buffer, bufferSize);
    return buffer;
  },

  OasizGetPlayerAvatar: function() {
    var val = window.__PLAYER_AVATAR__ != null ? String(window.__PLAYER_AVATAR__) : "";
    var bufferSize = lengthBytesUTF8(val) + 1;
    var buffer = _malloc(bufferSize);
    stringToUTF8(val, buffer, bufferSize);
    return buffer;
  },

  OasizRegisterEventListeners: function(gameObjectNamePtr) {
    var gameObjectName = UTF8ToString(gameObjectNamePtr);

    window.addEventListener("oasiz:pause", function() {
      SendMessage(gameObjectName, "_OnPauseFromJS");
    });

    window.addEventListener("oasiz:resume", function() {
      SendMessage(gameObjectName, "_OnResumeFromJS");
    });

    window.addEventListener("oasiz:back", function() {
      SendMessage(gameObjectName, "_OnBackButtonFromJS");
    });

    window.addEventListener("oasiz:leave", function() {
      SendMessage(gameObjectName, "_OnLeaveGameFromJS");
    });
  },
};

mergeInto(LibraryManager.library, OasizBridge);
