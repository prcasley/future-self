import * as THREE from "three";
import { BUST } from "./portraitFrame";

// Likeness first: the photo's own colour and skin detail carry the face. The hologram is in
// the edges (matte rim light), a restrained scanline, a slow sweep, and the reveal/crossing.

const COMMON = `
uniform float uTime;
uniform float uCross;       // 0 -> 1 -> 0 while crossing sides
uniform float uReduced;     // prefers-reduced-motion
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;

const PORTRAIT_VERTEX = `
${COMMON}
uniform sampler2D uMap;
uniform float uDepth;
varying vec2 vUv;
varying float vRelief;

float dome(vec2 q, vec2 c, vec2 r) {
  vec2 d = (q - c) / r;
  float s = max(0.0, 1.0 - dot(d, d));
  return mix(s, sqrt(s), 0.55);
}

void main() {
  vUv = uv;
  vec2 q = vec2(uv.x, 1.0 - uv.y); // view coordinates, y down (matches portraitFrame BUST)
  float head = dome(q, vec2(${BUST.head.cx.toFixed(3)}, ${BUST.head.cy.toFixed(3)}), vec2(${(BUST.head.rx * 0.92).toFixed(3)}, ${(BUST.head.ry * 0.95).toFixed(3)}));
  float nose = exp(-(pow(q.x - 0.5, 2.0) / 0.0016 + pow(q.y - 0.4, 2.0) / 0.006)) * head;
  float torso = dome(q, vec2(${BUST.torso.cx.toFixed(3)}, ${BUST.torso.cy.toFixed(3)}), vec2(${BUST.torso.rx.toFixed(3)}, ${BUST.torso.ry.toFixed(3)}));
  float lum = dot(texture2D(uMap, uv).rgb, vec3(0.299, 0.587, 0.114));
  float z = uDepth * (0.24 * head + 0.05 * nose + 0.1 * torso + 0.025 * (lum - 0.5) * head);
  vec3 pos = position;
  pos.z += z;
  float slice = floor(q.y * 56.0);
  pos.x += (hash(vec2(slice, 3.1)) - 0.5) * 0.32 * uCross;
  pos.z += (hash(vec2(slice, 7.7)) - 0.5) * 0.9 * uCross;
  vRelief = head;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const PORTRAIT_FRAGMENT = `
${COMMON}
uniform sampler2D uMap;
uniform float uMode;        // 0 idle, 1 listening, 2 thinking, 3 speaking
uniform float uMaterialize; // 0 -> 1 reveal, bottom to top
uniform float uGain;
uniform float uTintMix;
uniform float uSpeak;
uniform vec3 uTint;
uniform vec3 uAura;
uniform sampler2D uMesh;    // face-mesh wireframe (white on transparent), same view as uMap
uniform float uMeshAmount;
uniform float uDuo;         // 1 = scan look (luminance through the aura colour), 0 = natural colour
varying vec2 vUv;
varying float vRelief;

void main() {
  vec2 uv = vUv;
  float row = floor((1.0 - uv.y) * 150.0);
  float thinking = step(1.5, uMode) * step(uMode, 2.5);
  float motion = 1.0 - uReduced;
  float glitch = step(0.94, hash(vec2(floor(uTime * 7.0), floor(row / 9.0))));
  uv.x += (hash(vec2(row, floor(uTime * 16.0))) - 0.5) * (0.012 * thinking * glitch + 0.09 * uCross) * motion;
  vec4 tex = texture2D(uMap, uv);
  if (tex.a < 0.004) discard;

  vec3 c = tex.rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // Natural grade keeps skin detail: slight chroma pull, shadows lifted into the aura colour.
  vec3 g = mix(vec3(l), c, 0.88);
  g += uAura * 0.08 * (1.0 - l);
  // Scan look: the photo's own luminance mapped through the aura colour, so every detail stays.
  float k = smoothstep(0.03, 0.97, l);
  vec3 duo = mix(uAura * 0.05, uAura * 0.64, smoothstep(0.0, 0.55, k));
  duo = mix(duo, mix(uAura, vec3(1.0), 0.72), smoothstep(0.5, 1.0, k));
  g = mix(g, duo, uDuo);
  g = mix(g, g * (0.5 + uTint), uTintMix * 0.32);

  float flicker = 0.985 + 0.015 * hash(vec2(floor(uTime * 12.0), 1.0)) * motion;
  float depth = mix(0.06, 0.13, uDuo);
  float scan = 1.0 - depth + depth * sin(gl_FragCoord.y * 1.35 + uTime * 1.6 * motion);
  float speed = uMode > 2.5 ? 0.16 : (thinking > 0.5 ? 0.42 : (uMode > 0.5 ? 0.14 : 0.09));
  float sweepY = fract(uTime * speed);
  float band = (1.0 - smoothstep(0.0, 0.03, abs((1.0 - vUv.y) - sweepY))) * motion;
  // Rim light lives only in the matte's thin outer band, so soft hair is not lit like glass.
  float edge = smoothstep(0.02, 0.2, tex.a) * (1.0 - smoothstep(0.2, 0.6, tex.a));

  vec3 col = g * scan * flicker * uGain * (1.0 + 0.08 * uSpeak);
  col += uAura * (edge * 0.55 + band * 0.18 + 0.05 * uSpeak * vRelief);
  float wire = texture2D(uMesh, uv).a * uMeshAmount;
  col += mix(uAura, vec3(1.0), 0.35) * wire * (0.75 + 0.25 * band);

  // Reveal: bottom-up, with a bright leading line.
  float rev = uMaterialize * 1.12 - 0.04;
  float shown = 1.0 - smoothstep(rev - 0.012, rev + 0.012, vUv.y);
  float line = (1.0 - smoothstep(0.0, 0.02, abs(vUv.y - rev))) * (1.0 - step(0.999, uMaterialize));
  col += uAura * line * 2.2;

  // Strict comparison: a sin-hash lands on exactly 0 often enough to drop rows at rest.
  float drop = hash(vec2(row, floor(uTime * 24.0))) < uCross * 0.5 ? 1.0 : 0.0;
  float alpha = tex.a * max(shown, line) * (1.0 - drop);
  alpha *= mix(1.0, 0.86, edge);
  alpha *= smoothstep(0.0, 0.16, vUv.y); // the bust fades into the beam instead of a hard cut
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

const PART_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PART_FRAGMENT = `
${COMMON}
uniform sampler2D uMap;
uniform vec3 uColour;
uniform float uTinted;      // 1: texture is white, colour it with uColour
uniform float uOpacity;
uniform float uReveal;      // 0 -> 1 equip, bottom to top
uniform float uGain;
uniform vec3 uTint;
uniform float uTintMix;
uniform float uFade;        // 1: lower edge fades into the projector beam
varying vec2 vUv;

void main() {
  vec4 tex = texture2D(uMap, vUv);
  if (tex.a < 0.003) discard;
  vec3 c = mix(tex.rgb, tex.rgb * uColour, uTinted);
  c = mix(c, c * (0.5 + uTint), uTintMix * 0.3) * uGain;
  float scan = 0.9 + 0.1 * sin(gl_FragCoord.y * 1.35 + uTime * 1.6 * (1.0 - uReduced));
  float rev = uReveal * 1.1 - 0.05;
  float shown = 1.0 - smoothstep(rev - 0.02, rev + 0.02, vUv.y);
  float line = (1.0 - smoothstep(0.0, 0.03, abs(vUv.y - rev))) * step(0.001, uReveal) * (1.0 - step(0.999, uReveal));
  float row = floor((1.0 - vUv.y) * 48.0);
  float drop = hash(vec2(row, floor(uTime * 20.0))) < uCross * 0.55 ? 1.0 : 0.0;
  c += uColour * line * 1.6;
  float alpha = tex.a * uOpacity * max(shown, line * 0.8) * (1.0 - drop) * scan;
  alpha *= mix(1.0, smoothstep(0.0, 0.26, vUv.y), uFade);
  gl_FragColor = vec4(c, clamp(alpha, 0.0, 1.0));
}
`;

export function createPortraitMaterial(
  map: THREE.Texture,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PORTRAIT_VERTEX,
    fragmentShader: PORTRAIT_FRAGMENT,
    uniforms: {
      uMap: { value: map },
      uTime: { value: 0 },
      uMode: { value: 0 },
      uMaterialize: { value: 0 },
      uCross: { value: 0 },
      uReduced: { value: 0 },
      uDepth: { value: 1 },
      uGain: { value: 1 },
      uTintMix: { value: 0 },
      uSpeak: { value: 0 },
      uTint: { value: new THREE.Vector3(0.2, 0.7, 1.0) },
      uAura: { value: new THREE.Vector3(0.45, 0.85, 1.0) },
      uMesh: { value: blankTexture() },
      uMeshAmount: { value: 0 },
      uDuo: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
}

let blank: THREE.DataTexture | null = null;
/** 1x1 transparent texture for an empty mesh layer. */
export function blankTexture(): THREE.DataTexture {
  if (!blank) {
    blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    blank.needsUpdate = true;
  }
  return blank;
}

export function createPartMaterial(
  map: THREE.Texture,
  tinted: boolean,
  additive: boolean,
  fade = false,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: PART_VERTEX,
    fragmentShader: PART_FRAGMENT,
    uniforms: {
      uMap: { value: map },
      uColour: { value: new THREE.Vector3(1, 1, 1) },
      uTinted: { value: tinted ? 1 : 0 },
      uOpacity: { value: 1 },
      uReveal: { value: 1 },
      uGain: { value: 1 },
      uTint: { value: new THREE.Vector3(0.2, 0.7, 1.0) },
      uTintMix: { value: 0 },
      uFade: { value: fade ? 1 : 0 },
      uTime: { value: 0 },
      uCross: { value: 0 },
      uReduced: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}
