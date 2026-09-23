import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { createBustGeometry } from "./hologram/bustGeometry";
import { createHologramMaterial } from "./hologram/hologramShader";
import "./Hologram.css";

export type HologramMode = "idle" | "listening" | "thinking" | "speaking";

export interface HologramProps {
  /** Backward-compatible active flag */
  active: boolean;
  /** Optional mode controlling state-driven animations */
  mode?: HologramMode;
}

const MODE_MAP: Record<HologramMode, number> = {
  idle: 0,
  listening: 1,
  thinking: 2,
  speaking: 3,
};

export function Hologram({ active, mode }: HologramProps) {
  const mount = useRef<HTMLDivElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  // Derive target mode: explicit prop takes precedence, otherwise fallback to active
  const currentMode: HologramMode = mode || (active ? "listening" : "idle");

  const modeRef = useRef(currentMode);
  modeRef.current = currentMode;

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
    const camera = new THREE.PerspectiveCamera(
      36,
      host.clientWidth / host.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 0.52, 4.8);
    camera.lookAt(0, 0.52, 0);

    // Create 3D Sculpted Human Bust Geometry (60,000 points)
    const geometry = createBustGeometry(host.clientWidth < 500 ? 32000 : 60000);
    const material = createHologramMaterial();

    const bustMesh = new THREE.Points(geometry, material);
    scene.add(bustMesh);

    // Reduced motion preference
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reducedMotion = mediaQuery.matches;

    const handleMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
      material.uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleMotionChange);
    }

    material.uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;

    // Handle container resizing
    const handleResize = () => {
      if (!host || !renderer) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.position.z = Math.max(4.8, 3.3 / camera.aspect);
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(host);
    handleResize();

    let frameId = 0;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = (currentTime - startTime) / 1000;

      // 2-second materialization transition (0.0 to 1.0)
      const materialize = reducedMotion ? 1 : Math.min(1.0, elapsed / 2.0);

      // Update shader uniforms
      material.uniforms.uTime.value = reducedMotion ? 0 : elapsed;
      material.uniforms.uMaterialize.value = materialize;
      material.uniforms.uMode.value = MODE_MAP[modeRef.current];

      // Micro head motion & gentle sway unless reduced motion is preferred
      if (!reducedMotion) {
        bustMesh.rotation.y = Math.sin(elapsed * 0.35) * 0.12;
        bustMesh.rotation.x = Math.sin(elapsed * 0.25) * 0.03;
        bustMesh.position.y = Math.sin(elapsed * 0.9) * 0.02;

        // Extra dynamic rotation pulse when speaking or thinking
        if (modeRef.current === "thinking") {
          bustMesh.rotation.y += Math.sin(elapsed * 1.5) * 0.015;
        } else if (modeRef.current === "speaking") {
          bustMesh.rotation.x += Math.sin(elapsed * 4.0) * 0.008;
        }
      } else {
        bustMesh.rotation.set(0, 0, 0);
        bustMesh.position.set(0, 0, 0);
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    // GPU Resource Disposal & Event Unbinding
    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleMotionChange);
      }

      geometry.dispose();
      material.dispose();
      renderer.dispose();

      if (renderer.domElement && host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
    };
  }, []);

  if (webglFailed) {
    return (
      <div
        className="hologram hologram-fallback"
        role="img"
        aria-label="ECHO Hologram fallback view"
      >
        <div className="hologram-fallback-bust">
          <div className="fallback-head" />
          <div className="fallback-shoulders" />
        </div>
        <span className="fallback-text">ECHO // WebGL Offline</span>
      </div>
    );
  }

  return (
    <div
      className={`hologram hologram-mode-${currentMode}`}
      ref={mount}
      aria-label={`Sculpted Human Hologram presence for ECHO, status: ${currentMode}`}
      role="img"
    >
      <div className="hologram-overlay-scanlines" />
      <div className={`hologram-mode-badge mode-${currentMode}`}>
        <span className="mode-dot" />
        <span className="mode-name">{currentMode.toUpperCase()}</span>
      </div>
    </div>
  );
}
