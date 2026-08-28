/** Hues for agent light, in the arcs the country accent bands leave free. */
export const WEATHER_HUES: readonly number[] = [335, 185, 55, 275, 130, 305, 160, 245];

export function hashOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A session's hue: its hashed slot, or the next one no live session holds. */
export function hueFor(sessionId: string, taken: ReadonlySet<number>): number {
  const start = hashOf(sessionId) % WEATHER_HUES.length;
  for (let i = 0; i < WEATHER_HUES.length; i++) {
    const hue = WEATHER_HUES[(start + i) % WEATHER_HUES.length];
    if (hue !== undefined && !taken.has(hue)) return hue;
  }
  return WEATHER_HUES[start] ?? 0;
}
