const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * ALPHABET.length);
    code += ALPHABET[idx];
  }
  return code;
}

export function generateUniqueRoomCode(length: number, activeCodes: Set<string> = new Set()): string {
  for (let i = 0; i < 100; i++) {
    const code = randomCode(length);
    if (!activeCodes.has(code)) return code;
  }
  throw new Error("Could not allocate unique room code");
}

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}
