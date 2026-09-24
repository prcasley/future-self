import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LM,
  PHI,
  closeness,
  mapFace,
  projectionInput,
} from "../src/scan/goldenRatio.ts";
import {
  NARROW,
  STEP,
  WIDE,
  badges,
  buildCallouts,
  place,
  spiral,
  toStage,
} from "../src/scan/hud.ts";
import { faceFromLandmarks } from "../src/avatar/portraitFrame.ts";
import { blend, futureFace } from "../src/scan/future.ts";

// A synthetic face on an 800 x 1000 photo with known pixel distances.
const W = 800;
const H = 1000;
function face() {
  const p = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (i, xPx, yPx) => (p[i] = { x: xPx / W, y: yPx / H, z: 0 });
  // Irises: 30 px across, pupils 160 px apart.
  set(LM.irisRightA, 320, 400);
  set(LM.irisRightB, 350, 400);
  set(LM.irisLeftA, 480, 400);
  set(LM.irisLeftB, 510, 400);
  set(LM.irisRight, 335, 400);
  set(LM.irisLeft, 495, 400);
  // Face 320 px wide; height 320 * PHI.
  set(LM.faceRight, 240, 450);
  set(LM.faceLeft, 560, 450);
  set(LM.hairline, 400, 200);
  set(LM.noseBridge, 400, 400); // d2 = 200
  set(LM.noseTip, 400, 500);
  set(LM.noseBase, 400, 550); // d3 = 150
  set(LM.chin, 400, 200 + 320 * PHI); // d4 = 167.76
  // Lips: upper 20 px, lower 32 px.
  set(LM.lipTop, 400, 600);
  set(LM.lipUpperInner, 400, 620);
  set(LM.lipLowerInner, 400, 625);
  set(LM.lipBottom, 400, 657);
  // Mouth 128, nose 64, jaw 272, eyes 80.
  set(LM.mouthRight, 336, 630);
  set(LM.mouthLeft, 464, 630);
  set(LM.noseRight, 368, 540);
  set(LM.noseLeft, 432, 540);
  set(LM.jawRight, 264, 680);
  set(LM.jawLeft, 536, 680);
  set(LM.eyeRightOuter, 280, 400);
  set(LM.eyeRightInner, 360, 400);
  set(LM.eyeLeftInner, 440, 400);
  set(LM.eyeLeftOuter, 520, 400);
  return p;
}

const byKey = (mapping) =>
  Object.fromEntries(mapping.ratios.map((r) => [r.key, r]));

test("measures distances with the iris as the ruler", () => {
  const mapping = mapFace(face(), W, H);
  assert.ok(mapping);
  assert.ok(Math.abs(mapping.cmPerPx - 1.17 / 30) < 1e-12);
  const d = mapping.distances;
  assert.equal(d.faceWidth.px, 320);
  assert.equal(d.faceWidth.cm, 12.5); // 320 px * 0.039 cm/px
  assert.equal(d.innerCanthal.cm, 3.1); // 80 px
  assert.equal(d.interpupillary.cm, 6.2); // 160 px
  assert.equal(d.faceHeight.cm, 20.2);
});

test("computes the golden-ratio proportions against their targets", () => {
  const r = byKey(mapFace(face(), W, H));
  assert.equal(r.faceRectangle.value, 1.618);
  assert.equal(r.thirdsUpper.value, 1.333);
  assert.equal(r.thirdsLower.value, 1.118);
  assert.equal(r.lips.value, 1.6);
  assert.equal(r.mouthNose.value, 2);
  assert.equal(r.jawMouth.value, 2.125);
  assert.equal(r.widthIpd.value, 2);
  assert.equal(r.widthIpd.target, 2 * PHI - 1);
  for (const x of Object.values(r))
    assert.ok(x.anchor >= 0 && x.anchor < 478, x.key);
});

test("no ruler, no measurement", () => {
  assert.equal(mapFace(face().slice(0, 468), W, H), null);
  const flat = face();
  flat[LM.irisRightB] = { ...flat[LM.irisRightA] };
  flat[LM.irisLeftB] = { ...flat[LM.irisLeftA] };
  assert.equal(mapFace(flat, W, H), null);
});

test("closeness is a bounded display value", () => {
  assert.equal(closeness(PHI, PHI), 100);
  assert.equal(closeness(PHI * 1.1, PHI), 90);
  assert.equal(closeness(PHI * 0.9, PHI), 90);
  assert.equal(closeness(10, PHI), 0);
  assert.equal(closeness(Number.NaN, PHI), 0);
  assert.equal(closeness(1, 0), 0);
});

test("the projection input is seven ratio numbers and nothing else", () => {
  const input = projectionInput(mapFace(face(), W, H));
  assert.deepEqual(Object.keys(input).sort(), [
    "faceRectangle",
    "jawMouth",
    "lips",
    "mouthNose",
    "thirdsLower",
    "thirdsUpper",
    "widthIpd",
  ]);
  for (const v of Object.values(input)) assert.equal(typeof v, "number");
});

test("landmark framing centres on the nose line", () => {
  const f = faceFromLandmarks(face(), W, H);
  assert.ok(Math.abs(f.w - 0.4) < 1e-9);
  assert.ok(Math.abs(f.cx - 0.5) < 1e-9);
  assert.ok(Math.abs(f.h - (320 * PHI) / H) < 1e-9);
  assert.ok(f.cy > 0.2 && f.cy < 0.72);
});

test("callouts: twelve labeled boxes, six on a phone, every ratio against Φ", () => {
  const mapping = mapFace(face(), W, H);
  const full = buildCallouts(mapping, false);
  const phone = buildCallouts(mapping, true);
  assert.equal(full.length, 12);
  assert.equal(phone.length, 6);
  assert.equal(new Set(full.map((c) => c.key)).size, 12);
  for (const c of full) {
    const bare = c.title.replace(/\(d\d\)/, ""); // chart labels keep d1..d4 lowercase
    assert.equal(bare, bare.toUpperCase(), c.title);
    if (c.ratio) assert.match(c.lines.at(-1), /\d\.\d\d \/ Φ \d\.\d{3}$/);
    else assert.match(c.lines[0], /^\d+\.\d cm$/);
  }
});

test("callout boxes stay inside the view, clear of the face, and never overlap", () => {
  const view = face();
  const mapping = mapFace(view, W, H);
  for (const g of [WIDE, NARROW]) {
    const placed = place(buildCallouts(mapping, !g.wide), view, g);
    const faceX0 = toStage(g, view[LM.faceRight]).x;
    const faceX1 = toStage(g, view[LM.faceLeft]).x;
    for (const c of placed) {
      assert.ok(c.x >= 0 && c.x + c.w <= g.vw, `${c.key} x`);
      assert.ok(c.y >= 0 && c.y + c.h <= g.vh, `${c.key} y ${c.y} ${c.h}`);
      if (g.wide)
        assert.ok(
          c.x + c.w < faceX0 || c.x > faceX1,
          `${c.key} covers the face`,
        );
    }
    for (const side of ["left", "right"]) {
      const col = placed
        .filter((c) => c.side === side)
        .sort((a, b) => a.y - b.y);
      for (let i = 1; i < col.length; i++)
        assert.ok(
          col[i].y >= col[i - 1].y + col[i - 1].h,
          `${col[i].key} overlaps ${col[i - 1].key}`,
        );
    }
    placed.forEach((c, i) => {
      if (i) assert.equal(c.delay - placed[i - 1].delay, STEP);
    });
  }
});

test("the golden spiral fits the face box and shrinks by Φ each quarter turn", () => {
  const box = { x: 300, y: 200, w: 400, h: 560 };
  const d = spiral(box.x, box.y, box.w, box.h);
  assert.match(d, /^M /);
  const arcs = [...d.matchAll(/A ([\d.]+) [\d.]+ 0 0 1 ([\d.]+) ([\d.]+)/g)];
  assert.ok(arcs.length >= 6, `${arcs.length} arcs`);
  const radii = arcs.map((a) => Number(a[1]));
  for (let i = 1; i < 5; i++)
    assert.ok(Math.abs(radii[i - 1] / radii[i] - PHI) < 0.02, `step ${i}`);
  for (const a of arcs) {
    const x = Number(a[2]);
    const y = Number(a[3]);
    assert.ok(x >= box.x - 0.1 && x <= box.x + box.w + 0.1, `x ${x}`);
    assert.ok(y >= box.y - 0.1 && y <= box.y + box.h + 0.1, `y ${y}`);
  }
});

const PROJECTED = {
  faceRectangle: 1.66,
  thirdsUpper: 1.4,
  thirdsLower: 1.18,
  lips: 1.65,
  mouthNose: 1.9,
  jawMouth: 2.05,
  widthIpd: 2.1,
};

function rowsFor(mapping, targets) {
  return mapping.ratios.map((r) => ({
    key: r.key,
    now: r.value,
    future: targets[r.key],
  }));
}

function rotate(points, degrees) {
  const a = (degrees * Math.PI) / 180;
  const cx = 0.5 * W;
  const cy = 0.5 * H;
  return points.map((p) => {
    const x = p.x * W - cx;
    const y = p.y * H - cy;
    return {
      x: (cx + x * Math.cos(a) - y * Math.sin(a)) / W,
      y: (cy + x * Math.sin(a) + y * Math.cos(a)) / H,
      z: 0,
    };
  });
}

for (const tilt of [0, 14]) {
  test(`the future face re-measures to the projected ratios (tilt ${tilt}°)`, () => {
    const now = rotate(face(), tilt);
    const mapping = mapFace(now, W, H);
    const next = futureFace(now, rowsFor(mapping, PROJECTED), W, H);
    const r = byKey(mapFace(next, W, H));
    for (const [key, target] of Object.entries(PROJECTED))
      assert.ok(
        Math.abs(r[key].value - target) / target < 0.015,
        `${key}: ${r[key].value} vs ${target}`,
      );
  });
}

test("no projection, no change; blend eases between the two faces", () => {
  const now = face();
  const same = futureFace(now, [], W, H);
  same.forEach((p, i) => {
    assert.ok(
      Math.abs(p.x - now[i].x) < 1e-9 && Math.abs(p.y - now[i].y) < 1e-9,
    );
  });
  const next = futureFace(now, rowsFor(mapFace(now, W, H), PROJECTED), W, H);
  assert.deepEqual(blend(now, next, 0)[LM.chin], {
    x: now[LM.chin].x,
    y: now[LM.chin].y,
  });
  assert.deepEqual(blend(now, next, 1)[LM.chin], next[LM.chin]);
  const mid = blend(now, next, 0.5)[LM.chin].y;
  assert.ok(Math.abs(mid - (now[LM.chin].y + next[LM.chin].y) / 2) < 1e-9);
});

test("each change is capped, whatever the projection says", () => {
  const now = face();
  const mapping = mapFace(now, W, H);
  const wild = Object.fromEntries(
    mapping.ratios.map((r) => [r.key, r.value * 3]),
  );
  const next = futureFace(now, rowsFor(mapping, wild), W, H);
  const r = byKey(mapFace(next, W, H));
  const before = byKey(mapping);
  for (const key of Object.keys(wild))
    assert.ok(r[key].value / before[key].value < 1.21, key);
});

test("phone badges sit beside the face, below the banner, numbered top to bottom", () => {
  const view = face();
  const marks = badges(
    buildCallouts(mapFace(view, W, H), true),
    view,
    NARROW,
    28,
    244,
  );
  assert.equal(marks.length, 6);
  assert.deepEqual(
    marks.map((b) => b.n),
    [1, 2, 3, 4, 5, 6],
  );
  const faceX0 = toStage(NARROW, view[LM.faceRight]).x;
  const faceX1 = toStage(NARROW, view[LM.faceLeft]).x;
  for (const b of marks) {
    assert.ok(b.y >= 244 + 28, `${b.key} under the banner`);
    assert.ok(b.x - 28 >= 0 && b.x + 28 <= NARROW.vw, `${b.key} x`);
    assert.ok(b.x + 28 <= faceX0 || b.x - 28 >= faceX1, `${b.key} on the face`);
  }
  for (const side of ["left", "right"]) {
    const col = marks.filter((b) => b.side === side);
    for (let i = 1; i < col.length; i++)
      assert.ok(
        col[i].y - col[i - 1].y >= 56,
        `${col[i].key} touches ${col[i - 1].key}`,
      );
  }
  for (let i = 1; i < marks.length; i++)
    assert.ok(marks[i].ay >= marks[i - 1].ay);
});
