import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { HologramMode } from "../Hologram";
import {
  AURA_COLOR,
  CROSSING_MS,
  SIDE_LIGHT,
  auraOf,
  lerpLight,
  type Aura,
} from "../sideLight";
import {
  blankTexture,
  createPartMaterial,
  createPortraitMaterial,
} from "./portraitShader";
import {
  OUTFIT_PARTS,
  PARTS,
  drawSprite,
  outfitOf,
  paintPart,
  type Outfit,
} from "./portraitParts";
import { neutralPortrait, preparePortrait } from "./preparePortrait";
import "../Hologram.css";
import "./PortraitAvatar.css";

export type Appearance = { outfit?: string | null; aura?: string | null };

export interface PortraitAvatarProps {
  active: boolean;
  mode?: HologramMode;
  /** The Crossing: which side ECHO is speaking from (null = home). */
  side?: string | null;
  /** Local object URL of the user's photo. Never uploaded. */
  portraitUrl?: string | null;
  /** Voice-picked wardrobe slots. */
  appearance?: Appearance;
  /** Called once the photo is framed (true) or could not be read (false). */
  onPrepared?: (ok: boolean) => void;
}

const MODE_INDEX: Record<HologramMode, number> = {
  idle: 0,
  listening: 1,
  thinking: 2,
  speaking: 3,
};
const REVEAL_MS = 1800;
const EQUIP_MS = 750;
const EQUIPPABLE = ["mantle", "armor", "armorGlow"];
const RENDER_ORDER: Record<string, number> = {
  glow: 0,
  beam: 1,
  halo: 2,
  mantle: 3,
  motesBack: 4,
  portrait: 5,
  armor: 6,
  armorGlow: 7,
  motesFront: 8,
};
// How each aura moves: data motes, violet flame, slow gold embers.
const AURA_MOTION: Record<
  Aura,
  { speed: number; size: number; bright: number; flicker: number; halo: number }
> = {
  cyan: { speed: 1, size: 0.035, bright: 0.55, flicker: 0.15, halo: 0.5 },
  violet: { speed: 1.7, size: 0.05, bright: 0.85, flicker: 0.45, halo: 0.8 },
  gold: { speed: 0.7, size: 0.042, bright: 0.8, flicker: 0.25, halo: 0.95 },
};

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

type Motes = {
  points: THREE.Points;
  positions: Float32Array;
  colors: Float32Array;
  seeds: Float32Array;
  front: boolean;
};

export function PortraitAvatar({
  active,
  mode,
  side,
  portraitUrl,
  appearance,
  onPrepared,
}: PortraitAvatarProps) {
  const mount = useRef<HTMLDivElement>(null);
  const api = useRef<{
    setPortrait: (
      source: HTMLCanvasElement | null,
      mesh?: HTMLCanvasElement | null,
    ) => void;
  } | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const currentMode: HologramMode = mode || (active ? "listening" : "idle");
  const modeRef = useRef(currentMode);
  modeRef.current = currentMode;
  const outfit: Outfit = outfitOf(appearance?.outfit);
  const aura: Aura = auraOf(appearance?.aura);
  const outfitRef = useRef(outfit);
  outfitRef.current = outfit;
  const auraRef = useRef(aura);
  auraRef.current = aura;
  const preparedRef = useRef(onPrepared);
  preparedRef.current = onPrepared;

  const sideKey = side && SIDE_LIGHT[side] ? side : "home";
  const sideRef = useRef(sideKey);
  const crossing = useRef({ from: sideKey, to: sideKey, start: -Infinity });
  useEffect(() => {
    if (sideKey !== sideRef.current) {
      crossing.current = {
        from: sideRef.current,
        to: sideKey,
        start: performance.now(),
      };
      sideRef.current = sideKey;
    }
  }, [sideKey]);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    const rig = new THREE.Group();
    scene.add(rig);
    const owned: { dispose(): void }[] = [];
    const own = <T extends { dispose(): void }>(x: T) => {
      owned.push(x);
      return x;
    };

    // Wardrobe and aura parts: every piece its own plane, layered for parallax.
    const parts: Record<
      string,
      THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>
    > = {};
    for (const [name, spec] of Object.entries(PARTS)) {
      const texture = own(new THREE.CanvasTexture(paintPart(spec)));
      const material = own(
        createPartMaterial(
          texture,
          spec.colour === "tint",
          spec.blend === "additive",
          spec.fade,
        ),
      );
      const mesh = new THREE.Mesh(
        own(new THREE.PlaneGeometry(spec.size[0], spec.size[1])),
        material,
      );
      mesh.position.set(...spec.center);
      mesh.renderOrder = RENDER_ORDER[name] ?? 1;
      (name === "glow" || name === "beam" ? scene : rig).add(mesh);
      parts[name] = mesh;
    }
    // Equip/unequip runs on wall-clock time, like the reveal, so slow frames don't stretch it.
    const equip: Record<
      string,
      { value: number; from: number; goal: number; start: number }
    > = Object.fromEntries(
      EQUIPPABLE.map((name) => [
        name,
        { value: 0, from: 0, goal: 0, start: -Infinity },
      ]),
    );

    // The portrait: a displaced plane, so the face has depth when the rig sways.
    const neutral = own(new THREE.CanvasTexture(neutralPortrait()));
    let photo: THREE.CanvasTexture | null = null;
    let wire: THREE.CanvasTexture | null = null;
    const portraitMaterial = own(createPortraitMaterial(neutral));
    const portrait = new THREE.Mesh(
      own(new THREE.PlaneGeometry(1.6, 2.0, 96, 120)),
      portraitMaterial,
    );
    portrait.renderOrder = RENDER_ORDER.portrait;
    rig.add(portrait);
    let revealStart = performance.now();
    api.current = {
      setPortrait(source, mesh) {
        const next = source ? new THREE.CanvasTexture(source) : null;
        const nextWire = mesh ? new THREE.CanvasTexture(mesh) : null;
        photo?.dispose();
        wire?.dispose();
        photo = next;
        wire = nextWire;
        portraitMaterial.uniforms.uMap.value = next ?? neutral;
        portraitMaterial.uniforms.uMesh.value = nextWire ?? blankTexture();
        revealStart = performance.now();
        for (const name of EQUIPPABLE)
          equip[name] = { value: 0, from: 0, goal: 0, start: -Infinity };
      },
    };

    // Motes that rise around the silhouette, behind and (sparser) in front.
    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spriteCanvas.height = 64;
    const sctx = spriteCanvas.getContext("2d");
    if (sctx) drawSprite(sctx, 64);
    const sprite = own(new THREE.CanvasTexture(spriteCanvas));
    const respawn = (m: Motes, i: number, anywhere: boolean) => {
      const sign = Math.random() < 0.5 ? -1 : 1;
      const spread = m.front
        ? 0.5 + 0.55 * Math.random()
        : 0.22 + 0.85 * Math.pow(Math.random(), 0.8);
      m.seeds[i * 4] = sign * spread;
      m.seeds[i * 4 + 1] = 0.05 + Math.random() * 0.1;
      m.seeds[i * 4 + 2] = Math.random() * Math.PI * 2;
      m.positions[i * 3] = m.seeds[i * 4];
      m.positions[i * 3 + 1] = anywhere
        ? -1.2 + Math.random() * 2.2
        : -1.25 + Math.random() * 0.2;
      m.positions[i * 3 + 2] = m.front
        ? 0.22 + Math.random() * 0.2
        : -0.36 + Math.random() * 0.3;
    };
    const makeMotes = (count: number, front: boolean): Motes => {
      const geometry = own(new THREE.BufferGeometry());
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions, 3),
      );
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const material = own(
        new THREE.PointsMaterial({
          size: 0.04,
          map: sprite,
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      const points = new THREE.Points(geometry, material);
      points.renderOrder = front
        ? RENDER_ORDER.motesFront
        : RENDER_ORDER.motesBack;
      rig.add(points);
      const motes: Motes = {
        points,
        positions,
        colors,
        seeds: new Float32Array(count * 4),
        front,
      };
      for (let i = 0; i < count; i++) respawn(motes, i, true);
      return motes;
    };
    const motes = [makeMotes(170, false), makeMotes(50, true)];

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduced = media.matches;
    const onMotion = (e: MediaQueryListEvent) => {
      reduced = e.matches;
    };
    media.addEventListener?.("change", onMotion);

    const fit = () => {
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      // Frame y -1.45..1.21: the head clears the stage label, the bust clears the footer.
      const byHeight = 1.33 / tanHalf;
      const byWidth = 1.16 / (tanHalf * camera.aspect);
      camera.position.set(0, -0.12, Math.max(byHeight, byWidth));
      camera.lookAt(0, -0.12, 0);
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(host);
    fit();

    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    };
    const onLeave = () => {
      pointer.tx = 0;
      pointer.ty = 0;
    };
    host.addEventListener("pointermove", onPointer);
    host.addEventListener("pointerleave", onLeave);

    const auraColour = new THREE.Vector3(...AURA_COLOR[auraRef.current]);
    const target = new THREE.Vector3();
    const start = performance.now();
    let last = start;
    let frameId = 0;

    const animate = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const t = (now - start) / 1000;
      const m = modeRef.current;
      const motion = AURA_MOTION[auraRef.current];

      target.set(...AURA_COLOR[auraRef.current]);
      auraColour.lerp(target, reduced ? 1 : 1 - Math.exp(-dt * 4));
      const cross = crossing.current;
      const k = clamp01((now - cross.start) / CROSSING_MS);
      const light = lerpLight(SIDE_LIGHT[cross.from], SIDE_LIGHT[cross.to], k);
      const crossAmount = reduced ? 0 : Math.sin(Math.PI * k);
      const speak =
        m === "speaking" && !reduced
          ? 0.5 + 0.5 * Math.sin(t * 9) * Math.sin(t * 3.3)
          : 0;
      const gain = light.gain * (m === "idle" ? 0.93 : 1);
      const time = reduced ? 0 : t;

      const u = portraitMaterial.uniforms;
      u.uTime.value = time;
      u.uMode.value = MODE_INDEX[m];
      u.uMaterialize.value = reduced
        ? 1
        : clamp01((now - revealStart) / REVEAL_MS);
      u.uCross.value = crossAmount;
      u.uReduced.value = reduced ? 1 : 0;
      u.uGain.value = gain;
      u.uTintMix.value = light.mix;
      u.uTint.value.set(...light.tint);
      u.uSpeak.value = speak;
      u.uAura.value.copy(auraColour);
      const wireIn = clamp01((now - revealStart - REVEAL_MS * 0.6) / 900);
      u.uMeshAmount.value =
        wireIn *
        (m === "thinking" && !reduced ? 0.55 + 0.35 * Math.sin(t * 6) : 0.6);

      const wearing = OUTFIT_PARTS[outfitRef.current];
      const revealed = u.uMaterialize.value > 0.55;
      for (const [name, mesh] of Object.entries(parts)) {
        const pu = mesh.material.uniforms;
        pu.uTime.value = time;
        pu.uCross.value = crossAmount;
        pu.uReduced.value = u.uReduced.value;
        pu.uGain.value = gain;
        pu.uTint.value.set(...light.tint);
        pu.uTintMix.value = light.mix;
        pu.uColour.value.copy(auraColour);
        const piece = equip[name];
        if (piece) {
          const goal = wearing.includes(name) && revealed ? 1 : 0;
          if (goal !== piece.goal) {
            piece.from = piece.value;
            piece.goal = goal;
            piece.start = now;
          }
          const k = reduced ? 1 : clamp01((now - piece.start) / EQUIP_MS);
          piece.value = piece.from + (piece.goal - piece.from) * k;
          pu.uReveal.value = piece.value;
          mesh.visible = piece.value > 0.001;
        }
      }
      const listening = m === "listening" ? 1 : 0;
      parts.glow.material.uniforms.uOpacity.value =
        0.26 + 0.06 * listening + 0.14 * speak;
      parts.halo.material.uniforms.uOpacity.value =
        motion.halo * (0.75 + 0.25 * Math.sin(t * 1.3) * (reduced ? 0 : 1)) +
        0.2 * speak;
      parts.beam.material.uniforms.uOpacity.value = 0.2 + 0.08 * listening;
      parts.halo.rotation.z = reduced
        ? 0
        : t * (m === "thinking" ? 0.45 : 0.05);

      const ease = 1 - Math.exp(-dt * 3);
      pointer.x += (pointer.tx - pointer.x) * ease;
      pointer.y += (pointer.ty - pointer.y) * ease;
      if (!reduced) {
        rig.rotation.y = Math.sin(t * 0.32) * 0.07 + pointer.x * 0.16;
        rig.rotation.x = Math.sin(t * 0.23) * 0.025 + pointer.y * 0.06;
        rig.position.y = Math.sin(t * 0.9) * 0.012;
      } else {
        rig.rotation.set(0, 0, 0);
        rig.position.set(0, 0, 0);
      }

      const pace =
        motion.speed *
        (m === "thinking"
          ? 1.8
          : m === "speaking"
            ? 1.3
            : m === "listening"
              ? 1.15
              : 1);
      for (const group of motes) {
        const material = group.points.material as THREE.PointsMaterial;
        material.size = motion.size * (group.front ? 1.2 : 1);
        const count = group.positions.length / 3;
        for (let i = 0; i < count; i++) {
          const phase = group.seeds[i * 4 + 2];
          if (!reduced) {
            group.positions[i * 3 + 1] += group.seeds[i * 4 + 1] * pace * dt;
            group.positions[i * 3] =
              group.seeds[i * 4] + Math.sin(t * 0.7 + phase) * 0.03;
            if (group.positions[i * 3 + 1] > 1.05) respawn(group, i, false);
          }
          const life = clamp01((group.positions[i * 3 + 1] + 1.25) / 2.3);
          const flicker =
            1 - motion.flicker + motion.flicker * Math.sin(t * 7 + phase * 3);
          const b =
            Math.sin(Math.PI * life) *
            flicker *
            motion.bright *
            (group.front ? 0.7 : 1) *
            (1 + 0.6 * speak) *
            (reduced ? 0.5 : 1);
          group.colors[i * 3] = auraColour.x * b;
          group.colors[i * 3 + 1] = auraColour.y * b;
          group.colors[i * 3 + 2] = auraColour.z * b;
        }
        group.points.geometry.attributes.position.needsUpdate = true;
        group.points.geometry.attributes.color.needsUpdate = true;
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      media.removeEventListener?.("change", onMotion);
      host.removeEventListener("pointermove", onPointer);
      host.removeEventListener("pointerleave", onLeave);
      api.current = null;
      photo?.dispose();
      wire?.dispose();
      for (const x of owned) x.dispose();
      renderer.dispose();
      if (host.contains(renderer.domElement))
        host.removeChild(renderer.domElement);
    };
  }, []);

  // Frame and matte the photo whenever it changes; the neutral bust shows until it is ready.
  useEffect(() => {
    let cancelled = false;
    if (!portraitUrl) {
      api.current?.setPortrait(null);
      return;
    }
    preparePortrait(portraitUrl)
      .then((prepared) => {
        if (cancelled) return;
        api.current?.setPortrait(prepared.canvas, prepared.mesh);
        preparedRef.current?.(true);
      })
      .catch(() => {
        if (!cancelled) preparedRef.current?.(false);
      });
    return () => {
      cancelled = true;
    };
  }, [portraitUrl, webglFailed]);

  const label = `Portrait projection${portraitUrl ? " of your photo" : ""}, status: ${currentMode}, ${outfit === "monarch" ? "wearing monarch armor" : "casual"}, ${aura} aura${sideKey !== "home" ? `, speaking from the ${sideKey} side` : ""}`;

  if (webglFailed)
    return (
      <div
        className="hologram portrait-avatar portrait-fallback"
        role="img"
        aria-label={label}
      >
        {portraitUrl ? (
          <img
            className={`portrait-fallback-photo aura-${aura}`}
            src={portraitUrl}
            alt=""
          />
        ) : (
          <div className="hologram-fallback-bust">
            <div className="fallback-head" />
            <div className="fallback-shoulders" />
          </div>
        )}
        <div className="hologram-overlay-scanlines" />
      </div>
    );

  return (
    <div
      className={`hologram portrait-avatar hologram-mode-${currentMode}`}
      ref={mount}
      role="img"
      aria-label={label}
    >
      <div className="hologram-overlay-scanlines" />
      <div className={`hologram-mode-badge mode-${currentMode}`}>
        <span className="mode-dot" />
        <span className="mode-name">{currentMode.toUpperCase()}</span>
      </div>
    </div>
  );
}
