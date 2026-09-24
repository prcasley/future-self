// Shared light for both presences (the point bust and the portrait projection).

export type Light = {
  tint: [number, number, number];
  mix: number;
  gain: number;
};

// The Crossing: which side ECHO speaks from. Home keeps the original crystal palette (mix 0).
export const SIDE_LIGHT: Record<string, Light> = {
  home: { tint: [0.2, 0.7, 1.0], mix: 0, gain: 1 },
  dream: { tint: [1.0, 0.84, 0.5], mix: 0.6, gain: 1.1 },
  good: { tint: [0.45, 0.8, 1.0], mix: 0.35, gain: 1.05 },
  neutral: { tint: [0.62, 0.66, 0.74], mix: 0.65, gain: 0.8 },
  bad: { tint: [0.85, 0.35, 0.55], mix: 0.6, gain: 0.8 },
};

export const CROSSING_MS = 1600;

export const AURAS = ["cyan", "violet", "gold"] as const;
export type Aura = (typeof AURAS)[number];

// Home light for each aura the user can pick by voice. Cyan is the original palette.
export const AURA_LIGHT: Record<Aura, Light> = {
  cyan: SIDE_LIGHT.home,
  violet: { tint: [0.72, 0.48, 1.0], mix: 0.55, gain: 1.05 },
  gold: { tint: [1.0, 0.8, 0.45], mix: 0.55, gain: 1.08 },
};

// Aura colour for the portrait's glow, halo, edge light, and particles.
export const AURA_COLOR: Record<Aura, [number, number, number]> = {
  cyan: [0.45, 0.85, 1.0],
  violet: [0.74, 0.47, 1.0],
  gold: [1.0, 0.8, 0.42],
};

export function auraOf(value: string | null | undefined): Aura {
  return (AURAS as readonly string[]).includes(value || "")
    ? (value as Aura)
    : "cyan";
}

export function lerpLight(a: Light, b: Light, t: number): Light {
  const k = Math.min(1, Math.max(0, t));
  const lerp = (x: number, y: number) => x + (y - x) * k;
  return {
    tint: [
      lerp(a.tint[0], b.tint[0]),
      lerp(a.tint[1], b.tint[1]),
      lerp(a.tint[2], b.tint[2]),
    ],
    mix: lerp(a.mix, b.mix),
    gain: lerp(a.gain, b.gain),
  };
}
