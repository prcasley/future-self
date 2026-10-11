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
