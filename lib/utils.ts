export function genRoomCode10(): string {
  // 10 digits, leading zeros allowed
  const n = Math.floor(Math.random() * 10_000_000_000);
  return String(n).padStart(10, "0");
}

export function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}