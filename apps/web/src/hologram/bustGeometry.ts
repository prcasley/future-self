import * as THREE from "three";

/**
 * Generates an original sculpted human bust geometry with high feature density.
 * Includes connected head, neck, shoulders, visible facial contours (brow, nose,
 * cheekbones, lips, jawline, ears), and base holographic emitter rings.
 */
export function createBustGeometry(
  totalParticles = 60000,
): THREE.BufferGeometry {
  const positions = new Float32Array(totalParticles * 3);
  const colors = new Float32Array(totalParticles * 3);
  const features = new Float32Array(totalParticles);
  const noiseSeed = new Float32Array(totalParticles * 3);
  const targetPositions = new Float32Array(totalParticles * 3);

  let ptr = 0;

  // Helper to add a particle
  const addPoint = (
    x: number,
    y: number,
    z: number,
    featureId: number, // 0: body/neck/chest, 1: lips, 2: forehead/neural, 3: eyes/brow, 4: base ring, 5: cheek/jaw contour
    colorRGB: [number, number, number] = [0.2, 0.7, 1.0],
  ) => {
    if (ptr >= totalParticles) return;

    const idx = ptr * 3;
    positions[idx] = x;
    positions[idx + 1] = y;
    positions[idx + 2] = z;

    targetPositions[idx] = x;
    targetPositions[idx + 1] = y;
    targetPositions[idx + 2] = z;

    colors[idx] = colorRGB[0];
    colors[idx + 1] = colorRGB[1];
    colors[idx + 2] = colorRGB[2];

    features[ptr] = featureId;

    noiseSeed[idx] = (Math.random() - 0.5) * 2.0;
    noiseSeed[idx + 1] = (Math.random() - 0.5) * 2.0;
    noiseSeed[idx + 2] = (Math.random() - 0.5) * 2.0;

    ptr++;
  };

  // Smooth original skull and jaw silhouette, avoiding seams at profile bands.
  const profile = (y: number, samples: [number, number][]) => {
    for (let i = 1; i < samples.length; i++) {
      if (y <= samples[i][0]) {
        const [a, av] = samples[i - 1];
        const [b, bv] = samples[i];
        const t = Math.max(0, Math.min(1, (y - a) / (b - a)));
        return av + (bv - av) * t * t * (3 - 2 * t);
      }
    }
    return samples[samples.length - 1][1];
  };
  const getFaceProfileZ = (y: number) =>
    profile(y, [
      [0.58, 0.22],
      [0.69, 0.38],
      [0.82, 0.4],
      [1.02, 0.39],
      [1.3, 0.36],
      [1.48, 0.4],
      [1.62, 0.31],
      [1.74, 0.025],
    ]);
  const getFaceWidthX = (y: number) =>
    profile(y, [
      [0.58, 0.08],
      [0.68, 0.22],
      [0.84, 0.34],
      [1.12, 0.43],
      [1.38, 0.41],
      [1.52, 0.39],
      [1.63, 0.3],
      [1.74, 0.025],
    ]);

  // --- 1. FACIAL SURFACE & CONTOURS (High density ~25,000 points) ---
  const facePointsCount = Math.floor(totalParticles * 0.42);
  for (let i = 0; i < facePointsCount; i++) {
    const y = 0.6 + Math.random() * 1.14; // 0.62 to 1.57
    const hw = getFaceWidthX(y);
    const u = (Math.random() - 0.5) * 2.0; // -1 to +1
    const x = u * hw;

    const profileZ = getFaceProfileZ(y);
    // Depth curve from front (+z) to back (-z)
    const normX = x / (hw + 0.001);
    const zCurve = Math.sqrt(Math.max(0, 1 - normX * normX));

    // Front half of face vs back of head
    const isFront = Math.random() > 0.28;
    let z = isFront
      ? profileZ * zCurve + (Math.random() - 0.5) * 0.04
      : -0.42 * zCurve + (Math.random() - 0.5) * 0.05;

    let featureId = 0;
    let colorRGB: [number, number, number] = [0.25, 0.75, 1.0];

    // Sculpting specific features:
    // A. Forehead / Neural region (y > 1.38)
    if (y > 1.38 && isFront) {
      featureId = 2; // Forehead/Neural
      colorRGB = [0.35, 0.85, 1.0];
    }

    // B. Eye Sockets & Brows (y: 1.24..1.36, |x|: 0.08..0.30)
    if (
      y >= 1.24 &&
      y <= 1.36 &&
      Math.abs(x) >= 0.08 &&
      Math.abs(x) <= 0.3 &&
      isFront
    ) {
      featureId = 3; // Eyes/Brow
      const eyeDx = (Math.abs(x) - 0.19) / 0.09;
      const eyeDy = (y - 1.3) / 0.05;
      const distSq = eyeDx * eyeDx + eyeDy * eyeDy;
      if (distSq < 1.0) {
        // Socket indentation
        z -= 0.06 * (1.0 - distSq);
        colorRGB = [0.08, 0.2, 0.3]; // Recessed socket shadow
      }
    }

    // C. Nose Bridge & Tip (y: 0.90..1.32, |x| < 0.12, isFront)
    if (y >= 0.9 && y <= 1.32 && Math.abs(x) <= 0.12 && isFront) {
      const noseWidth = 0.03 + 0.06 * ((1.32 - y) / 0.42);
      if (Math.abs(x) <= noseWidth) {
        z +=
          (0.09 + 0.1 * ((1.32 - y) / 0.42)) * (1.0 - Math.abs(x) / noseWidth);
        colorRGB = [0.5, 0.9, 1.0];
      }
    }

    // D. Lips & Philtrum (y: 0.76..0.89, |x| < 0.16, isFront)
    if (y >= 0.76 && y <= 0.89 && Math.abs(x) <= 0.16 && isFront) {
      featureId = 1; // Lips
      colorRGB = [0.55, 0.95, 1.0]; // Luminous cyan/white
      // Cupid's bow contouring
      if (y >= 0.83 && y <= 0.87) {
        const bow = Math.cos(x * 35.0) * 0.015;
        z += bow;
      }
    }

    // E. Jawline & Cheekbones (Highlight edges)
    if (isFront && Math.abs(normX) > 0.72) {
      featureId = 5; // Cheek/Jaw contour
      colorRGB = [0.3, 0.8, 1.0];
    }

    addPoint(x, y, z, featureId, colorRGB);
  }

  // --- 2. DETAILED FACIAL FEATURE RIMS & CONTOURS (~8,000 points) ---
  const contourPointsCount = Math.floor(totalParticles * 0.14);
  for (let i = 0; i < contourPointsCount; i++) {
    const choice = Math.random();

    if (choice < 0.25) {
      // Lips contour ring
      const t = Math.random() * Math.PI * 2;
      const rx = 0.14 * Math.cos(t);
      const ry = 0.016 * Math.sin(t);
      const x = rx;
      const y = 0.82 + ry + Math.sin(rx * 20.0) * 0.008;
      const z = 0.47 + Math.cos(t) * 0.03;
      addPoint(x, y, z, 6, [0.7, 0.98, 1.0]);
    } else if (choice < 0.5) {
      // Left/Right Eye outline rings
      const side = Math.random() > 0.5 ? 1 : -1;
      const t = Math.random() * Math.PI * 2;
      const x = side * 0.19 + 0.08 * Math.cos(t);
      const y = 1.3 + 0.045 * Math.sin(t);
      const z = 0.36 + Math.cos(t) * 0.015;
      addPoint(x, y, z, 6, [0.8, 0.98, 1.0]);
    } else if (choice < 0.75) {
      // Jawline arc from ear down to chin
      const side = Math.random() > 0.5 ? 1 : -1;
      const t = Math.random(); // 0 at ear, 1 at chin
      const x = side * (0.4 * (1 - t) + 0.08 * t);
      const y = 1.05 * (1 - t) + 0.65 * t;
      const z = -0.05 * (1 - t) + 0.45 * t;
      addPoint(x, y, z, 6, [0.4, 0.85, 1.0]);
    } else {
      // Eyebrow arches
      const side = Math.random() > 0.5 ? 1 : -1;
      const t = Math.random();
      const x = side * (0.06 + 0.22 * t);
      const y = 1.36 + 0.025 * Math.sin(t * Math.PI);
      const z = 0.4 + 0.03 * (1 - t);
      addPoint(x, y, z, 6, [0.7, 0.95, 1.0]);
    }
  }

  // --- 3. EARS (~3,000 points) ---
  const earPointsCount = Math.floor(totalParticles * 0.05);
  for (let i = 0; i < earPointsCount; i++) {
    const side = Math.random() > 0.5 ? 1 : -1;
    const t = Math.random(); // 0 to 1 along ear helix
    const angle = t * Math.PI * 1.3 - 0.3;
    const ex = side * (0.45 + 0.07 * Math.sin(angle));
    const ey = 1.2 + 0.14 * Math.cos(angle);
    const ez = -0.02 + 0.09 * Math.sin(angle * 0.8);
    addPoint(ex, ey, ez, 6, [0.3, 0.75, 0.95]);
  }

  // --- 4. CONNECTED NECK & THROAT (~10,000 points) ---
  const neckPointsCount = Math.floor(totalParticles * 0.16);
  for (let i = 0; i < neckPointsCount; i++) {
    const y = 0.1 + Math.random() * 0.55; // 0.10 to 0.65
    const t = Math.random() * Math.PI * 2;

    // Neck cylinder tapering slightly up to jaw base
    const neckRadius = 0.25 - 0.055 * ((y - 0.1) / 0.55);
    let x = Math.cos(t) * neckRadius;
    let z = Math.sin(t) * neckRadius * 0.88;

    // Sternocleidomastoid muscle ridges on front diagonal
    if (z > 0.0 && Math.abs(x) > 0.08 && Math.abs(x) < 0.24) {
      z += 0.035 * Math.sin(((y - 0.1) / 0.55) * Math.PI);
    }
    // Adam's apple bump front center
    if (z > 0.15 && Math.abs(x) < 0.08 && y > 0.32 && y < 0.44) {
      z += 0.04 * (1.0 - Math.abs(y - 0.38) / 0.06);
    }

    addPoint(x, y, z, 0, [0.2, 0.65, 0.9]);
  }

  // --- 5. SHOULDERS & UPPER CHEST (~11,000 points) ---
  const shoulderPointsCount = Math.floor(totalParticles * 0.18);
  for (let i = 0; i < shoulderPointsCount; i++) {
    const y = -0.55 + Math.random() * 0.68; // -0.55 to 0.13
    const u = (Math.random() - 0.5) * 2.0;

    // Shoulder sweep width
    const tNorm = (y - -0.55) / 0.68; // 0 at base, 1 at collar
    const maxW = 1.35 * Math.pow(1 - tNorm, 0.6) + 0.32 * tNorm;
    const x = u * maxW;

    // Chest protrusion (+z) vs back (-z)
    const isFront = Math.random() > 0.4;
    const depthScale = Math.sqrt(Math.max(0, 1 - Math.pow(x / maxW, 2)));
    let z = isFront
      ? (0.38 - 0.15 * Math.abs(y)) * depthScale + (Math.random() - 0.5) * 0.04
      : (-0.32 + 0.1 * y) * depthScale + (Math.random() - 0.5) * 0.04;

    // Clavicle (Collarbone) prominent line (y ~ 0.05..0.10, front)
    if (isFront && y >= 0.04 && y <= 0.11 && Math.abs(x) < 0.85) {
      z += 0.035 * Math.sin((Math.abs(x) / 0.85) * Math.PI);
    }

    addPoint(x, y, z, 0, [0.18, 0.55, 0.85]);
  }

  // --- 6. HOLOGRAPHIC EMITTER RINGS & BASE ORBITALS (~3,000 points) ---
  const remainingPoints = totalParticles - ptr;
  for (let i = 0; i < remainingPoints; i++) {
    const isRing = Math.random() > 0.3;
    if (isRing) {
      // Concentric projector rings at base (y = -0.62 and -0.52)
      const ringRadius = Math.random() > 0.5 ? 1.25 : 0.85;
      const angle = Math.random() * Math.PI * 2;
      const y = ringRadius > 1.0 ? -0.62 : -0.52;
      const x = Math.cos(angle) * ringRadius;
      const z = Math.sin(angle) * ringRadius * 0.6;
      addPoint(x, y, z, 4, [0.4, 0.9, 1.0]);
    } else {
      // Orbital ambient aura particles surrounding bust
      const angle = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 1.1;
      const y = -0.5 + Math.random() * 2.1;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      addPoint(x, y, z, 4, [0.3, 0.8, 1.0]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute(
    "aTargetPosition",
    new THREE.BufferAttribute(targetPositions, 3),
  );
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aFeature", new THREE.BufferAttribute(features, 1));
  geometry.setAttribute("aNoise", new THREE.BufferAttribute(noiseSeed, 3));

  return geometry;
}
