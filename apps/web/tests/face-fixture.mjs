// The synthetic front-facing face from living.test.mjs, shared with the 3D head tests.
import { FACE } from "../src/living/geometry.ts";
import { hash } from "../src/living/motion.ts";

// A synthetic front-facing face on a 600 x 750 portrait: every index the rig reads sits where a
// real face mesh puts it, and the rest of the 478 points fill the face without landing in the
// eyes or the mouth.
export const W = 600;
export const H = 750;
const CX = 300;
const CY = 330;

export function face({ yaw = 0, pitch = 0, gap = 3 } = {}) {
  const pts = new Array(478);
  const set = (i, x, y, z = 0) => (pts[i] = { x, y, z });
  FACE.oval.forEach((i, k) => {
    const a = ((-90 + k * 10) * Math.PI) / 180;
    set(i, CX + 150 * Math.cos(a), CY + 195 * Math.sin(a), 20);
  });
  const arc = (list, x0, x1, y, h) =>
    list.forEach((i, k) => {
      const t = list.length === 1 ? 0.5 : k / (list.length - 1);
      set(i, x0 + (x1 - x0) * t, y + h * Math.sin(Math.PI * t), -10);
    });
  // Subject's right eye (image left), outer corner 33 at x = 210.
  arc(FACE.rightEye.lower, 210, 270, 300, 8);
  arc(FACE.rightEye.upper, 216, 264, 300, -12);
  arc(FACE.rightEye.crease, 214, 266, 290, -12);
  arc(FACE.rightEye.brow, 205, 275, 272, -8);
  // Subject's left eye (image right), outer corner 263 at x = 390.
  arc(FACE.leftEye.lower, 390, 330, 300, 8);
  arc(FACE.leftEye.upper, 384, 336, 300, -12);
  arc(FACE.leftEye.crease, 386, 334, 290, -12);
  arc(FACE.leftEye.brow, 395, 325, 272, -8);
  set(FACE.irisRight, 240, 296, -12);
  set(FACE.irisLeft, 360, 296, -12);
  [469, 470, 471, 472].forEach((i, k) =>
    set(i, 240 + 8 * Math.cos(k * 1.57), 296 + 8 * Math.sin(k * 1.57), -12),
  );
  [474, 475, 476, 477].forEach((i, k) =>
    set(i, 360 + 8 * Math.cos(k * 1.57), 296 + 8 * Math.sin(k * 1.57), -12),
  );
  // Lips around a mouth centred at (300, 440).
  arc(FACE.upperOuterLip, 255, 345, 440, -14);
  arc(FACE.lowerOuterLip, 255, 345, 440, 16);
  arc(FACE.upperInnerLip, 262, 338, 440, -gap / 2);
  arc(FACE.lowerInnerLip, 262, 338, 440, gap / 2);
  set(FACE.noseTip, 300, 370, -60);
  // Fill the rest of the face deterministically, away from the eyes and mouth.
  let seed = 7;
  const avoid = (x, y) =>
    (x > 200 && x < 280 && y > 262 && y < 318) ||
    (x > 320 && x < 400 && y > 262 && y < 318) ||
    (x > 245 && x < 355 && y > 420 && y < 462);
  for (let i = 0; i < 478; i++) {
    if (pts[i]) continue;
    for (;;) {
      seed++;
      const a = hash(seed, 3) * Math.PI * 2;
      const r = Math.sqrt(hash(seed, 5)) * 0.88;
      const x = CX + 150 * r * Math.cos(a);
      const y = CY + 195 * r * Math.sin(a);
      if (avoid(x, y)) continue;
      if (pts.some((p) => p && Math.hypot(p.x - x, p.y - y) < 6)) continue;
      set(i, x, y, -30 * (1 - r * r));
      break;
    }
  }
  // Optional head turn for the camera tests: rotate about the head centre.
  const cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch);
  return pts.map((p) => {
    const dx = p.x - CX,
      dy = p.y - CY,
      dz = p.z - 90;
    const x1 = dx * cy - dz * sy;
    const z1 = dx * sy + dz * cy;
    const y2 = dy * cp + z1 * sp;
    const z2 = -dy * sp + z1 * cp;
    return { x: (CX + x1) / W, y: (CY + y2) / H, z: (z2 + 90) / W };
  });
}
