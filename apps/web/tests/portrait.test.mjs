import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VIEW,
  bustDistance,
  computeMatte,
  findFace,
  frameFor,
  isSkin,
} from "../src/avatar/portraitFrame.ts";

function image(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = paint((x + 0.5) / width, (y + 0.5) / height);
      data.set([r, g, b, a], (y * width + x) * 4);
    }
  return { data, width, height };
}

test("skin test spans skin tones and rejects walls, greys, and fabric", () => {
  for (const c of [
    [240, 210, 195],
    [224, 172, 150],
    [198, 134, 103],
    [141, 85, 60],
    [92, 56, 40],
  ])
    assert.ok(isSkin(...c), `should be skin: ${c}`);
  for (const c of [
    [190, 185, 180],
    [128, 128, 128],
    [230, 100, 50],
    [40, 60, 160],
    [20, 20, 20],
    [250, 250, 250],
  ])
    assert.ok(!isSkin(...c), `should not be skin: ${c}`);
});

test("finds an off-centre face and frames it at the view anchor", () => {
  const img = image(128, 128, (u, v) => {
    const face = ((u - 0.35) / 0.1) ** 2 + ((v - 0.3) / 0.13) ** 2 < 1;
    const neck = Math.abs(u - 0.35) < 0.045 && v > 0.4 && v < 0.55;
    return face || neck ? [214, 160, 135] : [120, 125, 130];
  });
  const face = findFace(img);
  assert.ok(face, "a face");
  assert.ok(Math.abs(face.cx - 0.35) < 0.03, `cx ${face.cx}`);
  assert.ok(Math.abs(face.w - 0.2) < 0.03, `w ${face.w}`);
  const crop = frameFor(face, 1000, 1000);
  const fx = (face.cx - crop.x) / crop.w;
  const fy = (face.cy - crop.y) / crop.h;
  assert.ok(Math.abs(fx - VIEW.faceX) < 1e-9);
  assert.ok(Math.abs(fy - VIEW.faceY) < 1e-9);
  assert.ok(Math.abs(face.w / crop.w - VIEW.faceWidth) < 1e-9);
});

test("light hair that passes the skin test is not measured as face", () => {
  const img = image(128, 128, (u, v) => {
    const face = ((u - 0.5) / 0.1) ** 2 + ((v - 0.42) / 0.13) ** 2 < 1;
    const hair = ((u - 0.5) / 0.16) ** 2 + ((v - 0.33) / 0.17) ** 2 < 1;
    if (face) return [226, 178, 152];
    if (hair) return [150, 112, 70];
    return [60, 64, 70];
  });
  assert.ok(
    isSkin(150, 112, 70),
    "the hair colour really does pass the chroma test",
  );
  const face = findFace(img);
  assert.ok(face, "a face");
  assert.ok(Math.abs(face.w - 0.2) < 0.03, `w ${face.w}`);
  assert.ok(Math.abs(face.cx - 0.5) < 0.02, `cx ${face.cx}`);
});

test("no face falls back to a centred selfie crop", () => {
  assert.equal(findFace(image(64, 64, () => [40, 90, 160])), null);
  const crop = frameFor(null, 800, 1000);
  assert.ok(crop.w > 0 && crop.h > 0);
  assert.ok(Math.abs((0.5 - crop.x) / crop.w - VIEW.faceX) < 1e-9);
});

test("matte keeps the face, keys the background ring, and clears outside the photo", () => {
  const w = 80;
  const h = 100;
  const view = image(w, h, (u, v) =>
    bustDistance(u, v) < 0.5 ? [210, 160, 140] : [40, 90, 160],
  );
  const alpha = computeMatte(view, { x: 0, y: 0, w: 1, h: 1 });
  const at = (a, u, v) => a[Math.floor(v * h) * w + Math.floor(u * w)];
  assert.ok(at(alpha, 0.5, 0.35) > 0.95, "face kept");
  assert.ok(at(alpha, 0.04, 0.04) < 0.01, "corner cleared");
  assert.ok(
    at(alpha, 0.5 + 0.29 * 0.85, 0.35) < 0.35,
    "background in the head ring keyed",
  );
  const half = computeMatte(view, { x: 0.5, y: 0, w: 1, h: 1 });
  assert.ok(at(half, 0.9, 0.35) < 0.01, "outside the photo is transparent");
});
