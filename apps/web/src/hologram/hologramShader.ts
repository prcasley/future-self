import * as THREE from "three";

export const HologramVertexShader = `
uniform float uTime;
uniform float uMaterialize; // 0.0 to 1.0 (2 second transition)
uniform float uMode;        // 0: idle, 1: listening, 2: thinking, 3: speaking
uniform float uReducedMotion; // 0.0 or 1.0

attribute vec3 aTargetPosition;
attribute vec3 color;
attribute float aFeature;  // 0: body, 1: lips, 2: forehead/brain, 3: eyes, 4: base ring, 5: jaw/cheek
attribute vec3 aNoise;

varying vec3 vWorldPos;
varying vec3 vColor;
varying float vFeature;
varying float vAlpha;

// Pseudo-random noise helper
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vFeature = aFeature;
  vec3 pos = aTargetPosition;
  float t = uTime;

  // 1. Materialization Effect (0.0 to 1.0 transition)
  float matScanY = mix(-1.0, 2.0, uMaterialize);
  float distToScan = pos.y - matScanY;

  if (uMaterialize < 1.0) {
    // Dispersion above the scanline
    float disperse = smoothstep(0.0, 0.6, distToScan);
    pos += aNoise * disperse * 0.4;
  }

  // 2. Base Breathing & Micro sway
  if (uReducedMotion < 0.5) {
    // Subtle vertical breathing on chest/shoulders
    float breath = sin(t * 1.6) * 0.014;
    pos.y += breath * (1.0 - smoothstep(-0.4, 0.7, pos.y));

    // Subtle micro noise jitter for living hologram feel
    pos += aNoise * 0.003 * sin(t * 3.0 + pos.y * 10.0);
  }

  // 3. Mode-Specific State Animations
  if (uReducedMotion < 0.5) {
    // Mode 1: LISTENING - Receptive cyan wave sweeping upward
    if (abs(uMode - 1.0) < 0.1) {
      float wave = sin(pos.y * 7.0 - t * 4.0) * 0.5 + 0.5;
      pos += vec3(0.0, 0.0, wave * 0.02);
    }
    // Mode 2: THINKING - High frequency neural ripples in cranium/forehead
    else if (abs(uMode - 2.0) < 0.1) {
      if (aFeature == 2.0 || pos.y > 1.35) { // Forehead / Brain region
        float neural = sin(pos.x * 25.0 + pos.y * 30.0 + t * 9.0);
        pos.z += neural * 0.025;
        pos.x += sin(t * 12.0 + aNoise.x * 10.0) * 0.01;
      }
    }
    // Mode 3: SPEAKING - Lip & lower jaw dynamic modulation
    else if (abs(uMode - 3.0) < 0.1) {
      if (aFeature == 1.0 || (pos.y >= 0.70 && pos.y <= 0.88 && abs(pos.x) < 0.20)) {
        // Harmonic speech cadence
        float speakCadence = sin(t * 13.0) * 0.5 + sin(t * 19.0) * 0.3 + sin(t * 7.0) * 0.2;

        // Z displacement (speaking motion)
        float mouthDist = length(vec2(pos.x, pos.y - 0.82));
        float lipFactor = (1.0 - smoothstep(0.0, 0.18, mouthDist));
        pos.z += speakCadence * 0.03 * lipFactor;

        // Jaw drop / lip stretch
        pos.y += speakCadence * 0.012 * sign(pos.y - 0.82) * lipFactor;
      }
    }
  }

  // Color & Alpha calculation
  vec3 finalColor = color;
  float alpha = aFeature == 6.0 ? 0.07 : 0.36;

  // Scanline highlight pulse on materialization
  if (uMaterialize < 1.0) {
    float scanGlow = (1.0 - smoothstep(0.0, 0.2, abs(distToScan)));
    finalColor += vec3(0.4, 0.8, 1.0) * scanGlow * 1.5;
    alpha = mix(alpha, 1.0, scanGlow);
  }

  // Mode color accentuation
  if (abs(uMode - 1.0) < 0.1) { // Listening: Cyan ambient glow
    finalColor = mix(finalColor, vec3(0.2, 0.9, 1.0), 0.35);
  } else if (abs(uMode - 2.0) < 0.1) { // Thinking: Bright electric pulse in brain
    if (aFeature == 2.0 || pos.y > 1.35) {
      float pulse = sin(t * 8.0 + pos.y * 15.0) * 0.5 + 0.5;
      finalColor = mix(finalColor, vec3(0.8, 0.95, 1.0), pulse * 0.7);
    }
  } else if (abs(uMode - 3.0) < 0.1) { // Speaking: Luminous lips
    if (aFeature == 1.0) {
      float speakGlow = sin(t * 14.0) * 0.3 + 0.7;
      finalColor = mix(finalColor, vec3(0.9, 1.0, 1.0), speakGlow * 0.6);
    }
  }

  // Base emitter ring glow (aFeature == 4.0)
  if (aFeature == 4.0) {
    float ringPulse = sin(t * 2.5 + pos.x * 5.0) * 0.3 + 0.7;
    finalColor = vec3(0.3, 0.85, 1.0) * ringPulse;
    alpha = 0.12;
  }

  vColor = finalColor;
  vAlpha = alpha * smoothstep(-0.12, 0.08, matScanY - aTargetPosition.y);

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;

  // Particle size calculation with depth attenuation
  float baseSize = 9.0;
  if (aFeature == 1.0 || aFeature == 3.0) baseSize = 9.0; // Lips and eyes sharper
  if (aFeature == 4.0 || aFeature == 6.0) baseSize = 4.0;

  gl_PointSize = baseSize * (1.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const HologramFragmentShader = `
uniform float uTime;
uniform float uMaterialize;

varying vec3 vWorldPos;
varying vec3 vColor;
varying float vFeature;
varying float vAlpha;

void main() {
  // Soft Luminous Round Particle Mask (Gaussian radial fade)
  vec2 coord = gl_PointCoord - vec2(0.5);
  float dist = length(coord);
  if (dist > 0.5) discard;

  // Smooth circular alpha falloff
  float softEdge = (1.0 - smoothstep(0.0, 0.5, dist));
  float coreGlow = (1.0 - smoothstep(0.0, 0.2, dist));

  // Fine horizontal scanline overlay
  float scanline = sin(gl_FragCoord.y * 0.6 - uTime * 3.0) * 0.12 + 0.88;

  // Depth falloff (fade rear particles softly for translucent 3D depth)
  float depthFade = smoothstep(-0.8, 0.6, vWorldPos.z);

  vec3 finalColor = vColor + vec3(0.3, 0.7, 1.0) * coreGlow * 0.6;
  float finalAlpha = vAlpha * softEdge * scanline * (0.12 + 0.88 * depthFade);

  gl_FragColor = vec4(finalColor, finalAlpha);
}
`;

export function createHologramMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: HologramVertexShader,
    fragmentShader: HologramFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uMaterialize: { value: 0 },
      uMode: { value: 0 }, // 0: idle, 1: listening, 2: thinking, 3: speaking
      uReducedMotion: { value: 0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
  });
}
