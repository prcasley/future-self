// ECHO as a living photo. The portrait's own pixels are warped on a face mesh so it blinks, breathes,
// talks and turns its head: photoreal because nothing is redrawn, clean because there is no
// hologram shader. With the mirror on, the viewer's head drives it like a Memoji. The photo and
// the camera stay on this device.

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { faceFromLandmarks } from "../avatar/portraitFrame";
import { analyzePhoto } from "../scan/analyze";
import {
  buildRig,
  irisPoints,
  posePoints,
  type Landmark,
  type Pose,
  type Rig,
} from "./geometry";
import { cutOut } from "./matte";
import { Blinker, composePose, type Mode } from "./motion";
import { WebcamMirror, type MirrorState } from "./tracker";
import "./LivingPortrait.css";

export type LivingState = "loading" | "ready" | "noface" | "error";

export interface LivingPortraitProps {
  /** Local object URL, data URL or same-origin URL of the portrait. Never uploaded. */
  imageUrl: string | null;
  mode?: Mode;
  /** Real service audio level; null retains the browser speech rhythm fallback. */
  speechLevel?: { current: number | null };
  /** Follow the viewer's head through the camera (processed on this device only). */
  mirror?: boolean;
  /** Keep only the person (for compositing into a scene) instead of the whole picture. */
  cutout?: boolean;
  /** Crossing side (dream, good, neutral, bad), "home", or null for no light in the eyes. */
  accent?: string | null;
  /** Debug and tests: fixed values that override the live pose. */
  manual?: Partial<Pose> | null;
  onState?: (state: LivingState, detail?: string) => void;
  onMirror?: (state: MirrorState) => void;
  onFps?: (fps: number) => void;
  className?: string;
  /** Ghost requires a person mask; never project a rectangular fallback photo. */
  ghost?: boolean;
  /** Synchronous copy after render, before WebGL clears its drawing buffer. */
  onFrame?: (canvas: HTMLCanvasElement) => void;
}

const EYE_LIGHT: Record<string, [number, number, number]> = {
  home: [0.8, 0.9, 1.0],
  dream: [1.0, 0.82, 0.46],
  good: [0.55, 0.92, 1.0],
  neutral: [0.76, 0.66, 1.0],
  bad: [1.0, 0.56, 0.42],
};
const MAX_SIDE = 1600;

type Source = { canvas: HTMLCanvasElement; landmarks: Landmark[] };

/** Decode, find the face, and frame loose photos to head and shoulders. */
async function prepare(
  url: string,
  cutout: boolean,
  ghost = false,
): Promise<Source | null> {
  const { image, landmarks, mask } = await analyzePhoto(url);
  if (!landmarks) return null;
  if (ghost && !mask)
    throw new Error(
      "Person cut-out unavailable. Try another photo or reload the face models.",
    );
  const W = image.naturalWidth;
  const H = image.naturalHeight;
  const face = faceFromLandmarks(landmarks, W, H);
  let crop = { x: 0, y: 0, w: 1, h: 1 };
  if (face.w < 0.3) {
    const w = Math.min(1, face.w / 0.42);
    const h = Math.min(1, (w * W * 1.25) / H);
    crop = {
      x: Math.min(1 - w, Math.max(0, face.cx - w / 2)),
      y: Math.min(1 - h, Math.max(0, face.cy - 0.42 * h)),
      w,
      h,
    };
  }
  const sw = crop.w * W;
  const sh = crop.h * H;
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(sw * scale));
  canvas.height = Math.max(2, Math.round(sh * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    image,
    crop.x * W,
    crop.y * H,
    sw,
    sh,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  if (cutout && mask) {
    const matte = document.createElement("canvas");
    matte.width = canvas.width;
    matte.height = canvas.height;
    const mctx = matte.getContext("2d");
    if (mctx) {
      mctx.imageSmoothingQuality = "high";
      mctx.drawImage(
        mask,
        crop.x * W,
        crop.y * H,
        sw,
        sh,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      // The person mask comes from a 256-cell grid over the whole picture.
      cutOut(canvas, matte, (1.2 * canvas.width) / (256 * crop.w));
    }
  }
  return {
    canvas,
    landmarks: landmarks.map((p) => ({
      x: (p.x - crop.x) / crop.w,
      y: (p.y - crop.y) / crop.h,
      z: p.z / crop.w,
    })),
  };
}

/** Average brightness around the mouth (0..1), so the drawn inside matches the photo's light. */
function faceLight(canvas: HTMLCanvasElement, rig: Rig): number {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 0.5;
  const size = Math.max(4, Math.round(rig.mouthWidth));
  const x = Math.round(rig.mouthCenter[0] - size / 2);
  const y = Math.round(rig.mouthCenter[1] - size / 2);
  try {
    const { data } = ctx.getImageData(
      Math.max(0, x),
      Math.max(0, y),
      Math.min(size, canvas.width),
      Math.min(size, canvas.height),
    );
    let sum = 0;
    for (let i = 0; i < data.length; i += 4)
      sum +=
        (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    return sum / Math.max(1, data.length / 4);
  } catch {
    return 0.5;
  }
}

const VERTEX = /* glsl */ `
  attribute float aGap;
  attribute float aAcross;
  varying vec2 vUv;
  varying float vGap;
  varying float vAcross;
  void main() {
    vUv = uv;
    vGap = aGap;
    vAcross = aAcross;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Skin: the photo, untouched.
const SKIN = /* glsl */ `
  uniform sampler2D uMap;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uMap, vUv);
  }
`;

// The opening between the upper jaw (vGap 0) and the lower lip (vGap 1), corner to corner
// (vAcross 0..1): the dark of the mouth, shadowed under the upper jaw and warming toward the
// tongue, and upper teeth when the photo showed none. Teeth sit on an arch, so equal steps in
// angle make them narrower toward the corners, where they fade into the dark. Lit like the face.
const MOUTH = /* glsl */ `
  uniform float uTeeth;
  uniform float uTeethFrac;
  uniform float uLight;
  varying float vGap;
  varying float vAcross;
  void main() {
    float v = clamp(vGap, 0.0, 1.0);
    float s = clamp(vAcross * 2.0 - 1.0, -1.0, 1.0);
    float k = abs(asin(s * 0.98)) / 0.31;
    float tooth = floor(k);
    float f = fract(k);
    float edge = abs(2.0 * f - 1.0);
    float len = uTeethFrac * (1.0 - 0.07 * min(tooth, 4.0)) * (1.0 - 0.12 * pow(edge, 4.0));
    float top = uTeeth * len;
    vec3 color = mix(vec3(0.1, 0.035, 0.04), vec3(0.36, 0.14, 0.14), smoothstep(0.4, 1.0, v));
    color *= 1.0 - 0.5 * (1.0 - smoothstep(top, top + 0.3, v));
    float body = uTeeth * (1.0 - smoothstep(len * 0.88, len, v));
    vec3 enamel = vec3(0.95, 0.9, 0.8) * (1.0 - 0.12 * edge * edge);
    enamel *= 0.84 + 0.16 * smoothstep(0.0, len, v);
    enamel *= mix(0.74, 1.0, smoothstep(0.0, 0.07, f) * smoothstep(0.0, 0.07, 1.0 - f));
    enamel *= 1.0 - 0.85 * smoothstep(0.35, 0.97, abs(s));
    color = mix(color, enamel, body);
    gl_FragColor = vec4(color * mix(0.65, 1.1, uLight), 1.0);
  }
`;

const GLOW_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A faint light inside the irises: the "sentient" accent. Additive and small.
const GLOW = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float g = pow(max(0.0, 1.0 - d), 2.2);
    gl_FragColor = vec4(uColor * g * uStrength, 1.0);
  }
`;

export function LivingPortrait({
  imageUrl,
  mode = "idle",
  speechLevel,
  mirror = false,
  cutout = false,
  accent = "home",
  manual = null,
  onState,
  onMirror,
  onFps,
  className,
  ghost = false,
  onFrame,
}: LivingPortraitProps) {
  const host = useRef<HTMLDivElement>(null);
  const modeRef = useRef<Mode>(mode);
  const speechRef = useRef(speechLevel);
  speechRef.current = speechLevel;
  const manualRef = useRef<Partial<Pose> | null>(manual);
  const accentRef = useRef<string | null>(accent);
  const mirrorRef = useRef<WebcamMirror | null>(null);
  const callbacks = useRef({ onState, onMirror, onFps, onFrame });
  modeRef.current = mode;
  manualRef.current = manual;
  accentRef.current = accent;
  callbacks.current = { onState, onMirror, onFps, onFrame };

  // The camera mirror lives apart from the scene, so toggling it never rebuilds the portrait.
  useEffect(() => {
    if (!mirror) return;
    const cam = new WebcamMirror((state) =>
      callbacks.current.onMirror?.(state),
    );
    mirrorRef.current = cam;
    void cam.start();
    return () => {
      cam.stop();
      mirrorRef.current = null;
    };
  }, [mirror]);

  useEffect(() => {
    const el = host.current;
    if (!el || !imageUrl) return;
    let disposed = false;
    let raf = 0;
    const cleanups: (() => void)[] = [];
    callbacks.current.onState?.("loading");

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      callbacks.current.onState?.(
        "error",
        "WebGL is not available on this device.",
      );
      return;
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    cleanups.push(() => {
      renderer.dispose();
      renderer.domElement.remove();
    });

    prepare(imageUrl, cutout, ghost)
      .then((source) => {
        if (disposed) return;
        if (!source) {
          callbacks.current.onState?.(
            "noface",
            "No face found in this picture.",
          );
          return;
        }
        const W = source.canvas.width;
        const H = source.canvas.height;
        const rig = buildRig(source.landmarks, W, H);

        const texture = new THREE.CanvasTexture(source.canvas);
        texture.colorSpace = THREE.NoColorSpace;
        // Premultiplied, so a cut-out's soft edge filters cleanly instead of darkening.
        texture.premultiplyAlpha = true;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.generateMipmaps = true;

        const positions = new Float32Array(rig.count * 3);
        const position = new THREE.BufferAttribute(positions, 3);
        position.setUsage(THREE.DynamicDrawUsage);
        const uv = new THREE.BufferAttribute(rig.uv, 2);
        const gap = new THREE.BufferAttribute(rig.gap, 1);
        const across = new THREE.BufferAttribute(rig.across, 1);
        const geometry = (index: Uint32Array) => {
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", position);
          g.setAttribute("uv", uv);
          g.setAttribute("aGap", gap);
          g.setAttribute("aAcross", across);
          g.setIndex(new THREE.BufferAttribute(index, 1));
          return g;
        };
        const skinMaterial = new THREE.ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: SKIN,
          uniforms: { uMap: { value: texture } },
          transparent: cutout,
          premultipliedAlpha: true,
          side: THREE.DoubleSide,
          depthTest: false,
        });
        const mouthMaterial = new THREE.ShaderMaterial({
          vertexShader: VERTEX,
          fragmentShader: MOUTH,
          uniforms: {
            uTeeth: { value: rig.teeth },
            uTeethFrac: { value: 0.3 },
            uLight: { value: faceLight(source.canvas, rig) },
          },
          transparent: cutout,
          side: THREE.DoubleSide,
          depthTest: false,
        });
        const skin = new THREE.Mesh(geometry(rig.skin), skinMaterial);
        const mouth = new THREE.Mesh(geometry(rig.mouth), mouthMaterial);
        skin.frustumCulled = mouth.frustumCulled = false;
        const scene = new THREE.Scene();
        scene.add(skin, mouth);

        const glowGeometry = new THREE.PlaneGeometry(1, 1);
        const glows = rig.irises.map(() => {
          const material = new THREE.ShaderMaterial({
            vertexShader: GLOW_VERTEX,
            fragmentShader: GLOW,
            uniforms: {
              uColor: { value: new THREE.Color(1, 1, 1) },
              uStrength: { value: 0 },
            },
            transparent: true,
            // Add light to the colour only; never change the picture's transparency.
            blending: THREE.CustomBlending,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
            blendSrcAlpha: THREE.ZeroFactor,
            blendDstAlpha: THREE.OneFactor,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
          });
          const m = new THREE.Mesh(glowGeometry, material);
          m.scale.set(rig.eyeWidth * 0.55, rig.eyeWidth * 0.55, 1);
          m.renderOrder = 2;
          scene.add(m);
          return m;
        });

        const camera = new THREE.OrthographicCamera(0, W, 0, H, -10, 10);
        let drawn = false;
        let size = "";
        const fit = () => {
          const w = Math.max(1, el.clientWidth);
          const h = Math.max(1, el.clientHeight);
          if (`${w}x${h}` === size) return;
          size = `${w}x${h}`;
          renderer.setSize(w, h, false);
          const s = Math.min(w / W, h / H);
          const vw = w / s;
          const vh = h / s;
          camera.left = (W - vw) / 2;
          camera.right = camera.left + vw;
          camera.top = (H - vh) / 2;
          camera.bottom = camera.top + vh;
          camera.updateProjectionMatrix();
          // Resizing clears the canvas after this frame's draw, so draw again rather than flash.
          if (drawn) renderer.render(scene, camera);
        };
        fit();
        const observer = new ResizeObserver(fit);
        observer.observe(el);

        const posed = new Float32Array(rig.count * 2);
        const blinker = new Blinker(7);
        const reduced = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        const start = performance.now();
        let frames = 0;
        let lastFps = start;
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          const t = (now - start) / 1000;
          const mirrorPose = mirrorRef.current?.pose() ?? null;
          let pose = composePose(
            t,
            modeRef.current,
            blinker.at(t),
            mirrorPose,
            7,
            speechRef.current?.current,
          );
          if (reduced && !mirrorPose)
            pose = { ...pose, yaw: 0, pitch: 0, roll: 0, breathe: 0 };
          if (manualRef.current) pose = { ...pose, ...manualRef.current };
          posePoints(rig, pose, posed);
          for (let i = 0; i < rig.count; i++) {
            positions[i * 3] = posed[i * 2];
            positions[i * 3 + 1] = posed[i * 2 + 1];
          }
          position.needsUpdate = true;
          // Drawn teeth show a fixed height, so their share of the opening shrinks as it grows.
          mouthMaterial.uniforms.uTeethFrac.value = Math.min(
            0.6,
            (rig.mouthWidth * 0.09) / Math.max(1e-3, pose.open * rig.drop),
          );
          const light = accentRef.current
            ? EYE_LIGHT[accentRef.current] || EYE_LIGHT.home
            : null;
          irisPoints(rig, posed).forEach(([x, y], k) => {
            const glow = glows[k];
            glow.position.set(x, y, 1);
            const closed = k === 0 ? pose.blinkR : pose.blinkL;
            const material = glow.material as THREE.ShaderMaterial;
            material.uniforms.uStrength.value = light ? 0.22 * (1 - closed) : 0;
            if (light) material.uniforms.uColor.value.setRGB(...light);
          });
          renderer.render(scene, camera);
          callbacks.current.onFrame?.(renderer.domElement);
          drawn = true;
          frames++;
          if (now - lastFps >= 1000) {
            callbacks.current.onFps?.((frames * 1000) / (now - lastFps));
            frames = 0;
            lastFps = now;
          }
        };
        raf = requestAnimationFrame(tick);
        callbacks.current.onState?.("ready");
        cleanups.push(() => {
          observer.disconnect();
          texture.dispose();
          skin.geometry.dispose();
          mouth.geometry.dispose();
          skinMaterial.dispose();
          mouthMaterial.dispose();
          glowGeometry.dispose();
          glows.forEach((g) => (g.material as THREE.Material).dispose());
        });
      })
      .catch((error) => {
        if (!disposed)
          callbacks.current.onState?.(
            "error",
            error instanceof Error
              ? error.message
              : "This picture could not be read.",
          );
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanups.reverse().forEach((fn) => fn());
    };
  }, [imageUrl, cutout, ghost]);

  return <div ref={host} className={"living-portrait " + (className || "")} />;
}
