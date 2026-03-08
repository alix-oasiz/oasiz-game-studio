const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const codeToRoomId = new Map<string, string>();
const roomIdToCode = new Map<string, string>();

function randomCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * ALPHABET.length);
    code += ALPHABET[idx];
  }
  return code;
}

export function generateUniqueRoomCode(length: number): string {
  for (let i = 0; i < 1000; i++) {
    const code = randomCode(length);
    if (!codeToRoomId.has(code)) {
      return code;
    }
  }
  throw new Error("Could not allocate unique room code");
}

export function registerRoomCode(roomId: string, roomCode: string): void {
  codeToRoomId.set(roomCode, roomId);
  roomIdToCode.set(roomId, roomCode);
}

export function unregisterRoomCodeByRoomId(roomId: string): void {
  const code = roomIdToCode.get(roomId);
  if (!code) return;
  roomIdToCode.delete(roomId);
  codeToRoomId.delete(code);
}

export function getRoomIdByCode(roomCode: string): string | null {
  return codeToRoomId.get(roomCode) ?? null;
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

