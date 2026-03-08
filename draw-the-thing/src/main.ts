import { insertCoin, getRoomCode, myPlayer } from "playroomkit";
import { GameManager } from "./GameManager";
import { oasiz } from "@oasiz/sdk";

// Generate a random 4-character room code
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing chars
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Check URL hash for existing room code
function getRoomCodeFromURL(): string | null {
  const hash = window.location.hash;
  const roomMatch = hash.match(/[#&]r=([A-Z0-9]+)/i);
  return roomMatch ? roomMatch[1].toUpperCase() : null;
}

// UI Elements
const startScreen = document.getElementById("start-screen")!;
const loadingScreen = document.getElementById("loading-screen")!;
const startButtons = document.getElementById("start-buttons")!;
const joinRoomSection = document.getElementById("join-room-section")!;
const joinRoomInput = document.getElementById(
  "join-room-input",
) as HTMLInputElement;
const joinError = document.getElementById("join-error")!;
const createRoomBtn = document.getElementById("create-room-btn")!;
const joinRoomBtn = document.getElementById("join-room-btn")!;
const joinSubmitBtn = document.getElementById("join-submit-btn")!;
const backToStart = document.getElementById("back-to-start")!;
const backBtn = document.getElementById("back-btn")!;

let gameManager: GameManager | null = null;

// Trigger haptic helper
function triggerHaptic(type: string): void {
  oasiz.triggerHaptic(type as any);
}

// Share room code with parent (for friends to join)
function shareRoomCode(roomCode: string | null): void {
  oasiz.shareRoomCode(roomCode);
}

// Update loading text
function setLoadingText(text: string): void {
  const loadingText = document.querySelector(".loading-text");
  if (loadingText) {
    loadingText.textContent = text;
  }
}

// Show loading screen
function showLoading(text: string = "Connecting..."): void {
  setLoadingText(text);
  loadingScreen.classList.remove("hidden");
  startScreen.classList.add("hidden");
}

// Hide loading screen
function hideLoading(): void {
  loadingScreen.classList.add("hidden");
}

// Show start screen
function showStartScreen(): void {
  startScreen.classList.remove("hidden");
  loadingScreen.classList.add("hidden");
  backBtn.style.display = "none";

  // Reset join section
  joinRoomSection.classList.remove("active");
  startButtons.style.display = "flex";
  joinRoomInput.value = "";
  joinError.classList.remove("active");
}

// Connect to room and start game
async function connectToRoom(roomCode: string): Promise<boolean> {
  showLoading("Connecting to room...");

  try {
    await insertCoin({
      skipLobby: true,
      maxPlayersPerRoom: 8,
      roomCode: roomCode,
      defaultPlayerStates: {
        score: 0,
        guessed: false,
      },
    });

    console.log("[Main] Connected! Room code:", getRoomCode());

    // Share room code with parent so friends can join
    shareRoomCode(getRoomCode());

    hideLoading();

    // Hide start screen and show back button
    startScreen.classList.add("hidden");
    backBtn.style.display = "flex";

    // Initialize game manager (will show lobby)
    gameManager = new GameManager();

    return true;
  } catch (error) {
    console.error("[Main] Failed to connect:", error);
    hideLoading();
    return false;
  }
}

// Leave room and go back to start
async function leaveRoom(): Promise<void> {
  triggerHaptic("light");

  // Clear room code so friends know we left
  shareRoomCode(null);

  // Properly disconnect from Playroom room
  try {
    const player = myPlayer();
    if (player) {
      await player.leaveRoom();
    }
  } catch (e) {
    console.log("[Main] Error leaving room:", e);
  }

  // Clean up game manager
  if (gameManager) {
    gameManager.destroy();
    gameManager = null;
  }

  // Hide all game-related screens
  const lobbyScreen = document.getElementById("lobby-screen");
  const gameContainer = document.getElementById("game-container");
  const roundEndOverlay = document.getElementById("round-end-overlay");

  if (lobbyScreen) lobbyScreen.classList.add("hidden");
  if (gameContainer) gameContainer.style.display = "none";
  if (roundEndOverlay) roundEndOverlay.classList.remove("active");

  // Show start screen
  showStartScreen();
}

// Setup UI event listeners
function setupStartScreen(): void {
  // Create Room button
  createRoomBtn.addEventListener("click", async () => {
    triggerHaptic("light");
    const roomCode = generateRoomCode();
    console.log("[Main] Creating room:", roomCode);
    await connectToRoom(roomCode);
  });

  // Join Room button (shows input)
  joinRoomBtn.addEventListener("click", () => {
    triggerHaptic("light");
    startButtons.style.display = "none";
    joinRoomSection.classList.add("active");
    joinRoomInput.focus();
  });

  // Back button (from join input to main)
  backToStart.addEventListener("click", () => {
    triggerHaptic("light");
    joinRoomSection.classList.remove("active");
    startButtons.style.display = "flex";
    joinRoomInput.value = "";
    joinError.classList.remove("active");
  });

  // Back button (from lobby to start screen)
  backBtn.addEventListener("click", () => {
    leaveRoom();
  });

  // Join Room input - auto uppercase
  joinRoomInput.addEventListener("input", () => {
    joinRoomInput.value = joinRoomInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    joinError.classList.remove("active");
  });

  // Join Room submit
  joinSubmitBtn.addEventListener("click", async () => {
    triggerHaptic("light");
    await attemptJoinRoom();
  });

  // Enter key on input
  joinRoomInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await attemptJoinRoom();
    }
  });
}

// Attempt to join a room with the entered code
async function attemptJoinRoom(): Promise<void> {
  const code = joinRoomInput.value.trim().toUpperCase();

  if (code.length < 4) {
    joinError.textContent = "Code must be at least 4 characters";
    joinError.classList.add("active");
    triggerHaptic("error");
    return;
  }

  console.log("[Main] Joining room:", code);
  const success = await connectToRoom(code);

  if (!success) {
    joinError.textContent = "Could not connect to room";
    joinError.classList.add("active");
    startScreen.classList.remove("hidden");
    joinRoomSection.classList.add("active");
    startButtons.style.display = "none";
    triggerHaptic("error");
  }
}

// Initialize
async function init(): Promise<void> {
  // Setup event listeners first
  setupStartScreen();

  // Check for injected room code from webview
  if (oasiz.roomCode) {
    console.log("[Main] Using injected room code:", oasiz.roomCode);
    await connectToRoom(oasiz.roomCode);
    return;
  }

  // Check URL for existing room code (e.g., shared link)
  const urlRoomCode = getRoomCodeFromURL();
  if (urlRoomCode) {
    console.log("[Main] Joining room from URL:", urlRoomCode);
    await connectToRoom(urlRoomCode);
    return;
  }

  // No room code - show start screen
  showStartScreen();
}

// Start initialization
init();
