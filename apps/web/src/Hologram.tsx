import { useEffect, useRef } from "react";
import * as THREE from "three";

export function Hologram({ active }: { active: boolean }) {
  const mount = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const host = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    } catch {
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.z = 7;
    const count = 24000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    // Abstract presence, deliberately not a fabricated portrait of the user.
    for (let i = 0; i < count; i++) {
      const u = i / count;
      const theta = i * 2.399963;
      const y = 1 - 2 * Math.min(i / (count * 0.68), 1);
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const scale = 0.72 + 0.08 * Math.sin(i * 1.3);
      positions[i * 3] = Math.cos(theta) * radius * scale;
      positions[i * 3 + 1] = y * 1.05 + 0.48;
      positions[i * 3 + 2] = Math.sin(theta) * radius * scale * 0.8;
      if (i > count * 0.68) {
        const t = (i - count * 0.68) / (count * 0.32);
        positions[i * 3] = Math.cos(theta) * (1.35 - 0.45 * t);
        positions[i * 3 + 1] = -0.5 - t * 1.2;
        positions[i * 3 + 2] = Math.sin(theta) * 0.48;
      }
      colors[i * 3] = 0.45 + u * 0.4;
      colors[i * 3 + 1] = 0.72 + u * 0.2;
      colors[i * 3 + 2] = 1;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.013,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cloud = new THREE.Points(geometry, material);
    scene.add(cloud);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const draw = (time: number) => {
      if (!reduced) {
        cloud.rotation.y = Math.sin(time * 0.0002) * 0.18;
        cloud.position.y = Math.sin(time * 0.001) * 0.025;
        const s = activeRef.current ? 1 + Math.sin(time * 0.007) * 0.012 : 1;
        cloud.scale.setScalar(s);
      }
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      host.removeChild(renderer.domElement);
    };
  }, []);
  return (
    <div
      className="hologram"
      ref={mount}
      aria-label="Abstract particle presence for ECHO"
      role="img"
    />
  );
}
