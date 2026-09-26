import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FACE,
  MESH_POINTS,
  REST,
  buildRig,
  delaunay,
  irisPoints,
  pointInPolygon,
  posePoints,
} from "../src/living/geometry.ts";
import { applyMatte, blurAlpha, personCore } from "../src/living/matte.ts";
import {
  Blinker,
  MIRROR_LIMITS,
  MirrorCalibrator,
  blinkShape,
  composePose,
  hash,
  measure,
  speechOpen,
} from "../src/living/motion.ts";

// A synthetic front-facing face on a 600 x 750 portrait: every index the rig reads sits where a
// real face mesh puts it, and the rest of the 478 points fill the face without landing in the
// eyes or the mouth.
const W = 600;
const H = 750;
const CX = 300;
const CY = 330;

function face({ yaw = 0, pitch = 0, gap = 3 } = {}) {
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

const at = (posed, i) => [posed[i * 2], posed[i * 2 + 1]];

test("delaunay covers a grid with non-overlapping triangles", () => {
  const xs = [],
    ys = [];
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++) {
      xs.push(x * 10 + (y % 2) * 0.01);
      ys.push(y * 10);
    }
  const tris = delaunay(xs, ys);
  assert.equal(tris.length / 3, 32);
  let area = 0;
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    const s =
      Math.abs(
        (xs[b] - xs[a]) * (ys[c] - ys[a]) - (xs[c] - xs[a]) * (ys[b] - ys[a]),
      ) / 2;
    assert.ok(s > 0);
    area += s;
  }
  assert.ok(Math.abs(area - 40 * 40) < 1);
});

test("point in polygon", () => {
  const sq = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];
  assert.ok(pointInPolygon(5, 5, sq));
  assert.ok(!pointInPolygon(15, 5, sq));
});

test("the rig covers the face and the frame, and splits off the inside of the mouth", () => {
  const rig = buildRig(face(), W, H);
  assert.ok(rig.count > MESH_POINTS + 20);
  assert.ok(rig.skin.length / 3 > 800);
  // The opening is a strip from the upper jaw's copy of the lower lip line down to the real lower
  // lip: 9 copies (the corners are shared), 18 triangles.
  const copies = FACE.lowerInnerLip.length - 2;
  const firstCopy = rig.count - copies;
  assert.equal(rig.mouth.length / 3, 2 * (FACE.lowerInnerLip.length - 1) - 2);
  const lower = new Set(FACE.lowerInnerLip);
  for (const v of rig.mouth) assert.ok(lower.has(v) || v >= firstCopy, `${v}`);
  FACE.lowerInnerLip.slice(1, -1).forEach((i, k) => {
    const c = firstCopy + k;
    assert.equal(rig.base[c * 3], rig.base[i * 3]);
    assert.equal(rig.base[c * 3 + 1], rig.base[i * 3 + 1]);
    assert.equal(rig.gap[c], 0);
    assert.equal(rig.gap[i], 1);
  });
  // The photographed inside of the mouth is drawn on the copies, so it stays with the upper jaw.
  const skinUses = new Set(rig.skin);
  for (let c = firstCopy; c < rig.count; c++) assert.ok(skinUses.has(c));
  // Corners of the image are vertices that never move.
  const posed = posePoints(rig, {
    ...REST,
    yaw: 0.3,
    pitch: 0.2,
    open: 1,
    breathe: 1,
  });
  for (let i = MESH_POINTS; i < rig.count; i++) {
    if (rig.follow[i] !== 0) continue;
    assert.ok(Math.abs(posed[i * 2] - rig.base[i * 3]) < 1e-3);
    assert.ok(Math.abs(posed[i * 2 + 1] - rig.base[i * 3 + 1]) < 1e-3);
  }
});

test("at rest the portrait is exactly the photo", () => {
  const rig = buildRig(face(), W, H);
  const posed = posePoints(rig, REST);
  for (let i = 0; i < rig.count; i++) {
    assert.ok(Math.abs(posed[i * 2] - rig.base[i * 3]) < 1e-3);
    assert.ok(Math.abs(posed[i * 2 + 1] - rig.base[i * 3 + 1]) < 1e-3);
  }
  const [[rx, ry]] = irisPoints(rig, posed);
  assert.ok(Math.abs(rx - 240) < 0.01 && Math.abs(ry - 296) < 0.01);
});

test("a blink closes one eye onto its lower lid and leaves the other alone", () => {
  const rig = buildRig(face(), W, H);
  const posed = posePoints(rig, { ...REST, blinkR: 1 });
  const lid = at(posed, 159)[1];
  const lower = at(posed, 145)[1];
  assert.ok(
    lower - lid < rig.eyeWidth * 0.06 && lower - lid >= 0,
    `${lid} ${lower}`,
  );
  assert.equal(at(posed, 386)[1], rig.base[386 * 3 + 1]);
  // Corners stay put, so the eye's width is unchanged.
  assert.equal(at(posed, 33)[0], rig.base[33 * 3]);
  assert.equal(at(posed, 133)[1], rig.base[133 * 3 + 1]);
});

test("opening the mouth drops the jaw and parts the lips", () => {
  const rig = buildRig(face(), W, H);
  const rest = posePoints(rig, REST);
  const open = posePoints(rig, { ...REST, open: 1 });
  const gap = (p) => at(p, 14)[1] - at(p, 13)[1];
  assert.ok(gap(open) - gap(rest) > rig.mouthWidth * 0.25);
  assert.ok(
    at(open, FACE.chin)[1] - at(rest, FACE.chin)[1] > rig.mouthWidth * 0.2,
  );
  // The lower lip drops most in the middle and least at the corners.
  const drop = (i) => at(open, i)[1] - at(rest, i)[1];
  assert.ok(drop(14) > drop(88) && drop(88) > drop(FACE.innerRight));
  // The upper jaw's copy of the lip line barely moves, so the strip between them opens.
  const copy14 =
    rig.count -
    (FACE.lowerInnerLip.length - 2) +
    FACE.lowerInnerLip.slice(1, -1).indexOf(14);
  assert.ok(Math.abs(drop(copy14)) < rig.mouthWidth * 0.03);
  assert.ok(
    Math.abs(at(open, FACE.forehead)[1] - at(rest, FACE.forehead)[1]) < 1e-3,
  );
  assert.ok(
    Math.abs(at(open, FACE.noseTip)[1] - at(rest, FACE.noseTip)[1]) < 1e-3,
  );
});

test("a closed mouth in the photo gets drawn teeth; an open one shows its own", () => {
  assert.equal(buildRig(face({ gap: 3 }), W, H).teeth, 1);
  assert.equal(buildRig(face({ gap: 24 }), W, H).teeth, 0);
});

test("head turns move the nose more than the face edge and never the border", () => {
  const rig = buildRig(face(), W, H);
  const rest = posePoints(rig, REST);
  const right = posePoints(rig, { ...REST, yaw: 0.25 });
  const dn = at(right, FACE.noseTip)[0] - at(rest, FACE.noseTip)[0];
  const de = at(right, FACE.faceRight)[0] - at(rest, FACE.faceRight)[0];
  assert.ok(dn > 0 && dn > de, `${dn} ${de}`);
  const up = posePoints(rig, { ...REST, pitch: 0.2 });
  assert.ok(at(up, FACE.noseTip)[1] < at(rest, FACE.noseTip)[1]);
});

test("blinks come at natural intervals with a quick shape", () => {
  assert.equal(blinkShape(-0.1), 0);
  assert.equal(blinkShape(0.08), 1);
  assert.equal(blinkShape(0.3), 0);
  const b = new Blinker(3);
  let closed = 0;
  let blinks = 0;
  let was = false;
  for (let t = 0; t < 60; t += 1 / 60) {
    const v = b.at(t);
    if (v > 0.5) closed++;
    if (v > 0.5 && !was) blinks++;
    was = v > 0.5;
  }
  assert.ok(blinks >= 8 && blinks <= 30, `${blinks} blinks a minute`);
  assert.ok(closed / 3600 < 0.05);
});

test("speech moves the mouth with pauses", () => {
  const values = [];
  for (let t = 0; t < 10; t += 1 / 60) values.push(speechOpen(t, 2));
  assert.ok(Math.max(...values) > 0.6);
  assert.ok(Math.min(...values) === 0);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  assert.ok(mean > 0.15 && mean < 0.5, `${mean}`);
  const pose = composePose(1.3, "speaking", 0, null, 2);
  assert.equal(pose.open, speechOpen(1.3, 2));
  assert.equal(composePose(1.3, "idle", 0, null, 2).open, 0);
});

test("the camera mirror recovers head turns and mirrors them", () => {
  const aspect = W / H;
  const neutral = measure(face(), aspect);
  assert.ok(Math.abs(neutral.yaw) < 0.05 && Math.abs(neutral.roll) < 0.02);
  const turned = measure(face({ yaw: 0.2 }), aspect);
  assert.ok(Math.abs(turned.yaw - neutral.yaw - 0.2) < 0.06, `${turned.yaw}`);
  const cal = new MirrorCalibrator(3);
  for (let k = 0; k < 3; k++) cal.update(neutral, k / 30);
  let pose;
  for (let k = 3; k < 60; k++) pose = cal.update(turned, k / 30);
  assert.ok(cal.calibrated);
  assert.ok(pose.yaw < -0.1, `mirrored yaw ${pose.yaw}`);
  // A big turn is eased into the limit rather than breaking the photo.
  const far = measure(face({ yaw: 0.7 }), aspect);
  for (let k = 60; k < 120; k++) pose = cal.update(far, k / 30);
  assert.ok(
    pose.yaw < -MIRROR_LIMITS.yaw * 0.9 && pose.yaw >= -MIRROR_LIMITS.yaw,
    `${pose.yaw}`,
  );
  for (let k = 120; k < 180; k++) pose = cal.update(neutral, k / 30);
  // Closing the viewer's left eye closes the portrait's eye on the same side of the screen.
  const winkLeft = { ...neutral, earL: neutral.earL * 0.1 };
  for (let k = 180; k < 210; k++) pose = cal.update(winkLeft, k / 30);
  assert.ok(pose.blinkR > 0.9 && pose.blinkL < 0.05);
});

test("the cut-out tightens the mask and gives its edge the person's colour", () => {
  // One row: the person, two edge pixels where the photo mixes in a light background, background.
  const rgba = (...px) => Uint8ClampedArray.from(px.flat());
  const photo = rgba(
    [40, 30, 20, 255],
    [150, 150, 150, 255],
    [220, 220, 220, 255],
    [240, 240, 240, 255],
  );
  const mask = rgba(
    [0, 0, 0, 255],
    [0, 0, 0, 178],
    [0, 0, 0, 128],
    [0, 0, 0, 51],
  );
  const core = personCore(photo, mask);
  assert.deepEqual(
    [...core],
    [40, 30, 20, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  );
  const spread = rgba(
    [40, 30, 20, 255],
    [40, 30, 20, 255],
    [40, 30, 20, 255],
    [40, 30, 20, 255],
  );
  applyMatte(photo, mask, spread);
  assert.deepEqual([...photo.slice(0, 4)], [40, 30, 20, 255]);
  // Inner edge: mostly solid, mostly the person's colour.
  assert.ok(photo[7] > 120 && photo[7] < 220, `${photo[7]}`);
  assert.ok(photo[4] < 95, `${photo[4]}`);
  // Outer edge: nearly clear, and none of the light background left in it.
  assert.ok(photo[11] < 30, `${photo[11]}`);
  assert.deepEqual([...photo.slice(8, 11)], [40, 30, 20]);
  // Background: gone.
  assert.equal(photo[15], 0);
});

test("the mask blur rounds off a hard step and keeps flat areas flat", () => {
  const w = 20;
  const h = 3;
  const mask = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) mask[(y * w + x) * 4 + 3] = x < 10 ? 255 : 0;
  const soft = blurAlpha(mask, w, h, 2);
  const row = [...Array(w)].map((_, x) => soft[(w + x) * 4 + 3]);
  assert.equal(row[0], 255);
  assert.equal(row[19], 0);
  assert.ok(
    row[9] > 128 && row[9] < 255 && row[10] < 128 && row[10] > 0,
    `${row}`,
  );
  for (let x = 1; x < w; x++) assert.ok(row[x] <= row[x - 1]);
  assert.deepEqual(
    blurAlpha(mask, w, h, 0),
    mask.map((v, i) => (i % 4 === 3 ? v : 0)),
  );
});

test("the mouth opening knows where it runs from corner to corner", () => {
  const rig = buildRig(face(), W, H);
  assert.equal(rig.across[FACE.innerRight], 0);
  assert.equal(rig.across[FACE.innerLeft], 1);
  assert.ok(Math.abs(rig.across[14] - 0.5) < 0.02);
  const firstCopy = rig.count - (FACE.lowerInnerLip.length - 2);
  FACE.lowerInnerLip
    .slice(1, -1)
    .forEach((i, k) => assert.equal(rig.across[firstCopy + k], rig.across[i]));
});
