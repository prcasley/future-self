// The four-sided pyramid as four real views of one 3D head: front, both sides and the back, all
// from the same moving model, so a viewer walking round the pyramid walks round ECHO's head.
// One WebGL renderer draws each view and copies it into the slot's canvas.

import * as THREE from "three";
import { FACE, smoothstep } from "../living/geometry";
import { EYE_LIGHT } from "../living/LivingPortrait";
import { Blinker, idleHead, speechOpen, type Mode } from "../living/motion";
import {
  buildHead,
  poseFace,
  shapeSkull,
  PYRAMID_VIEWS,
  type Head,
} from "./head3d";

const VIEW_W = 512;
const VIEW_H = 640;
const DISTANCE = 6.2;

type Rgb = [number, number, number];

/** Average colour of a small patch of the photo around (x, y) in pixels. */
function sample(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
): Rgb {
  const { width, height } = ctx.canvas;
  const x0 = Math.max(0, Math.min(width - 1, Math.round(x - r)));
  const y0 = Math.max(0, Math.min(height - 1, Math.round(y - r)));
  const w = Math.max(1, Math.min(width - x0, Math.round(2 * r)));
  const h = Math.max(1, Math.min(height - y0, Math.round(2 * r)));
  const d = ctx.getImageData(x0, y0, w, h).data;
  let R = 0,
    G = 0,
    B = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    R += d[i];
    G += d[i + 1];
    B += d[i + 2];
    n++;
  }
  return n ? [R / n / 255, G / n / 255, B / n / 255] : [0.25, 0.2, 0.18];
}

export class HeadPyramid {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(22, VIEW_W / VIEW_H, 0.1, 50);
  private rig = new THREE.Group();
  private head: Head | null = null;
  private face: THREE.BufferGeometry | null = null;
  private posed: Float32Array | null = null;
  private disposables: { dispose(): void }[] = [];
  private blinker = new Blinker(3);
  private raf = 0;
  private eyes: THREE.Sprite[] = [];

  constructor(
    private targets: () => (HTMLCanvasElement | null)[],
    private signals: () => {
      mode: Mode;
      level: number | null;
      accent: string | null;
    },
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(VIEW_W, VIEW_H, false);
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(0.4, 1.2, 2);
    this.camera.add(key); // the key light travels with each view, so every side is lit
    this.scene.add(this.camera);
    this.scene.add(this.rig);
  }

  /** Build the head from a photo and its landmarks. Returns false if the face can't be rigged. */
  load(
    image: HTMLImageElement | HTMLCanvasElement,
    landmarks: { x: number; y: number; z: number }[],
    mask: HTMLCanvasElement | null = null,
  ): boolean {
    this.clear();
    const W0 =
      image instanceof HTMLImageElement ? image.naturalWidth : image.width;
    const H0 =
      image instanceof HTMLImageElement ? image.naturalHeight : image.height;
    const scale = Math.min(1, 1600 / Math.max(W0, H0));
    const W = Math.max(2, Math.round(W0 * scale));
    const H = Math.max(2, Math.round(H0 * scale));
    const head = buildHead(landmarks, W, H);
    if (!head) return false;
    this.head = head;

    const photo = document.createElement("canvas");
    photo.width = W;
    photo.height = H;
    const ctx = photo.getContext("2d", { willReadFrequently: true });
    if (!ctx) return false;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, W, H);
    const at = (i: number) => [landmarks[i].x * W, landmarks[i].y * H] as const;
    const unit = Math.hypot(
      at(FACE.faceLeft)[0] - at(FACE.faceRight)[0],
      at(FACE.faceLeft)[1] - at(FACE.faceRight)[1],
    );
    const skin = [50, 280].map((i) =>
      sample(ctx, at(i)[0], at(i)[1], unit * 0.04),
    );
    const skinRgb: Rgb = [0, 1, 2].map(
      (k) => (skin[0][k] + skin[1][k]) / 2,
    ) as Rgb;
    const [fx, fy] = at(FACE.forehead);
    const hairRgb = sample(ctx, fx, fy - unit * 0.2, unit * 0.06);

    const texture = new THREE.CanvasTexture(photo);
    texture.colorSpace = THREE.SRGBColorSpace;
    this.posed = new Float32Array(head.positions);
    const face = new THREE.BufferGeometry();
    face.setAttribute("position", new THREE.BufferAttribute(this.posed, 3));
    face.setAttribute("uv", new THREE.BufferAttribute(head.uvs, 2));
    face.setIndex(new THREE.BufferAttribute(head.index, 1));
    face.computeVertexNormals();
    this.face = face;
    const faceMat = new THREE.MeshLambertMaterial({
      map: texture,
      side: THREE.DoubleSide,
    });
    this.rig.add(new THREE.Mesh(face, faceMat));

    const skinC = new THREE.Color().setRGB(...skinRgb, THREE.SRGBColorSpace);
    // The jaw wears the colour of the jawline (a beard, if there is one).
    const jawRgb = [172, 397].map((i) => {
      const [x, y] = at(i);
      const [cx, cy] = at(FACE.noseTip);
      return sample(
        ctx,
        x + (cx - x) * 0.12,
        y + (cy - y) * 0.12,
        unit * 0.035,
      );
    });
    const jawC = new THREE.Color().setRGB(
      ...(([0, 1, 2] as const).map(
        (k) => (jawRgb[0][k] + jawRgb[1][k]) / 2,
      ) as Rgb),
      THREE.SRGBColorSpace,
    );
    const hairC = new THREE.Color().setRGB(...hairRgb, THREE.SRGBColorSpace);
    // The person mask, so only the person's own pixels (hair, forehead) colour the head.
    let person: Uint8ClampedArray | null = null;
    if (mask) {
      const m = document.createElement("canvas");
      m.width = W;
      m.height = H;
      const mctx = m.getContext("2d", { willReadFrequently: true });
      if (mctx) {
        mctx.drawImage(mask, 0, 0, W, H);
        person = mctx.getImageData(0, 0, W, H).data;
      }
    }
    const pixels = ctx.getImageData(0, 0, W, H).data;
    const photoAt = (x: number, y: number): Rgb | null => {
      if (!person) return null;
      const u = head.photo.x0 + x * head.photo.sx;
      const v = head.photo.y0 - y * head.photo.sy;
      if (u < 0 || u >= 1 || v < 0 || v >= 1) return null;
      const k = (Math.floor(v * H) * W + Math.floor(u * W)) * 4;
      if (person[k + 3] < 200) return null;
      return [pixels[k] / 255, pixels[k + 1] / 255, pixels[k + 2] / 255];
    };
    const skullMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const c = new THREE.Color();
    const seen = new THREE.Color();
    head.parts.forEach((part, partIndex) => {
      const lower = partIndex === 0 ? skinC : jawC;
      const [ox, oy, oz] = part.center;
      const [rx, ry, rz] = part.radii;
      const shape = new THREE.SphereGeometry(1, 128, 96);
      const pos = shape.getAttribute("position") as THREE.BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        const nz = pos.getZ(i);
        const x = ox + pos.getX(i) * rx;
        const y = oy + pos.getY(i) * ry;
        const shaped = shapeSkull(head, x, y, oz + nz * rz, nz > 0);
        pos.setXYZ(i, x, y, shaped.z);
        c.copy(hairC).lerp(lower, shaped.skin);
        // Facing the camera that took the photo: wear the photo's own hair and skin.
        const front = smoothstep(0, 0.35, nz);
        const px = front > 0 ? photoAt(x, y) : null;
        if (px) c.lerp(seen.setRGB(...px, THREE.SRGBColorSpace), front);
        colors.set([c.r, c.g, c.b], i * 3);
      }
      shape.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      shape.computeVertexNormals();
      this.rig.add(new THREE.Mesh(shape, skullMat));
      this.disposables.push(shape);
    });
    const { rx } = head.skull;

    // Ears, so the profile reads as a head.
    const ear = new THREE.SphereGeometry(1, 20, 16);
    const earMat = new THREE.MeshLambertMaterial({
      color: skinC.clone().multiplyScalar(0.92),
    });
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(ear, earMat);
      m.scale.set(0.05, 0.13, 0.09);
      m.position.set(
        side * rx * 0.98,
        (head.skull.nose + head.skull.hairline) / 2 - 0.08,
        -0.02,
      );
      this.rig.add(m);
    }
    // Neck, fading into the feathered bottom of the view.
    const neck = new THREE.CylinderGeometry(0.27, 0.32, 1.1, 40, 1, true);
    const neckMat = new THREE.MeshLambertMaterial({
      color: skinC.clone().multiplyScalar(0.85),
      side: THREE.DoubleSide,
    });
    const neckMesh = new THREE.Mesh(neck, neckMat);
    neckMesh.position.set(0, head.chin - 0.35, -0.12);
    this.rig.add(neckMesh);
    // Inside of the mouth.
    const mouth = new THREE.PlaneGeometry(head.mouth.w, head.mouth.h);
    const mouthMat = new THREE.MeshBasicMaterial({ color: 0x1c0707 });
    const mouthMesh = new THREE.Mesh(mouth, mouthMat);
    mouthMesh.position.set(head.mouth.x, head.mouth.y, head.mouth.z);
    this.rig.add(mouthMesh);
    // The scenario's faint light inside the irises, as on the single portrait.
    const glow = document.createElement("canvas");
    glow.width = glow.height = 64;
    const gctx = glow.getContext("2d");
    if (gctx) {
      const g = gctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      gctx.fillStyle = g;
      gctx.fillRect(0, 0, 64, 64);
    }
    const glowTex = new THREE.CanvasTexture(glow);
    this.eyes = head.irises.map(([x, y, z]) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      );
      sprite.scale.set(0.07, 0.07, 1);
      sprite.position.set(x, y, z + 0.01);
      this.rig.add(sprite);
      this.disposables.push(sprite.material);
      return sprite;
    });

    this.disposables.push(
      glowTex,
      texture,
      face,
      faceMat,
      skullMat,
      ear,
      earMat,
      neck,
      neckMat,
      mouth,
      mouthMat,
    );
    return true;
  }

  start() {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.draw(still ? 0 : (now - t0) / 1000);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private draw(t: number) {
    const head = this.head;
    if (!head || !this.face || !this.posed) return;
    const { mode, level, accent } = this.signals();
    const open = mode === "speaking" ? Math.min(1, level ?? speechOpen(t)) : 0;
    const blink = t ? this.blinker.at(t) : 0;
    poseFace(head, open, blink, this.posed);
    const light = accent ? EYE_LIGHT[accent] || EYE_LIGHT.home : null;
    for (const eye of this.eyes) {
      eye.visible = !!light;
      if (light) {
        eye.material.color.setRGB(...light);
        eye.material.opacity = 0.22 * (1 - blink);
      }
    }
    this.face.getAttribute("position").needsUpdate = true;
    const idle = idleHead(t, 2);
    this.rig.rotation.set(idle.pitch * 1.5, idle.yaw * 2.5, idle.roll);

    const targets = this.targets();
    const lookY = head.chin * 0.35;
    PYRAMID_VIEWS.forEach((deg, slot) => {
      const out = targets[slot];
      if (!out) return;
      const a = (deg * Math.PI) / 180;
      this.camera.position.set(
        Math.sin(a) * DISTANCE,
        lookY + 0.35,
        Math.cos(a) * DISTANCE,
      );
      this.camera.lookAt(0, lookY, 0);
      this.renderer.render(this.scene, this.camera);
      if (out.width !== VIEW_W || out.height !== VIEW_H) {
        out.width = VIEW_W;
        out.height = VIEW_H;
      }
      const ctx = out.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, VIEW_W, VIEW_H);
      ctx.drawImage(this.renderer.domElement, 0, 0);
    });
  }

  private clear() {
    for (const child of [...this.rig.children]) this.rig.remove(child);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.head = null;
    this.eyes = [];
    this.face = null;
    this.posed = null;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.clear();
    this.renderer.dispose();
  }
}
