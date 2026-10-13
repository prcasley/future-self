export type GhostLayout = "single" | "pyramid";
export const mirrorScale = (mirrored = true): 1 | -1 => (mirrored ? -1 : 1);

/** Clockwise screen coordinates. The top of each head points away from the centre. */
export function ghostSlots(layout: GhostLayout) {
  return layout === "pyramid"
    ? [
        { name: "top", x: 50, y: 19, rotation: 0 },
        { name: "right", x: 81, y: 50, rotation: 90 },
        { name: "bottom", x: 50, y: 81, rotation: 180 },
        { name: "left", x: 19, y: 50, rotation: 270 },
      ]
    : [{ name: "centre", x: 50, y: 50, rotation: 0 }];
}

/** Mirroring is local to the face, before its outward rotation. */
export function ghostTransform(rotation: number, mirrored = true) {
  return `translate(-50%, -50%) rotate(${rotation}deg) scaleX(${mirrorScale(mirrored)})`;
}

/**
 * Extra rim glow for what ECHO is doing (0 to about 0.75), added to the calibrated rim. Speaking
 * follows the loudness of Reneė's real audio (0 to 1); thinking breathes on a 2.4 s cycle; listening
 * holds steady. Pass t = 0 for reduced motion, which stills the breathing.
 */
export function liveGlow(mode: string, level: number, t: number): number {
  if (mode === "speaking") return 0.15 + 0.6 * Math.min(1, Math.max(0, level));
  if (mode === "thinking") return 0.12 + 0.12 * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / 2.4));
  if (mode === "listening") return 0.12;
  return 0;
}
