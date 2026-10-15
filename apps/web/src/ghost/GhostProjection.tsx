import { useEffect, useRef, type CSSProperties } from "react";
import { LivingPortrait, type LivingState } from "../living/LivingPortrait";
import type { Mode } from "../living/motion";
import type { Pose } from "../living/geometry";
import type { MirrorState } from "../living/tracker";
import type { GhostConfig } from "./config";
import { ghostSlots, ghostTransform, liveGlow } from "./layout";
import "./GhostMode.css";

/** Output only: no controls, text, status indicators or fallback artwork. */
export function GhostProjection({
  imageUrl,
  speechLevel,
  mode,
  config,
  manual,
  accent = null,
  onState,
  onMirror,
}: {
  imageUrl: string | null;
  speechLevel?: { current: number | null };
  mode: Mode;
  config: GhostConfig;
  manual?: Partial<Pose> | null;
  /** The scenario's light in the eyes (home, dream, good, neutral, bad). */
  accent?: string | null;
  onState?: (state: LivingState, detail?: string) => void;
  onMirror?: (state: MirrorState) => void;
}) {
  const copies = useRef<(HTMLCanvasElement | null)[]>([]);
  const stage = useRef<HTMLDivElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // The rim glow shows what ECHO is doing, from real state only: it swells with the loudness of
  // Reneė's actual audio, breathes slowly while thinking, and holds steady while listening.
  useEffect(() => {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let shown = 0;
    let last = 0;
    let written = "";
    const tick = (now: number) => {
      // Reduced motion: no breathing, and speech holds one steady level instead of following audio.
      const level = still ? 0.5 : (speechLevel?.current ?? 0);
      const target = liveGlow(modeRef.current, level, still ? 0 : now / 1000);
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      shown += (target - shown) * Math.min(1, dt * 12); // smooth at any refresh rate, no flicker
      const value = shown.toFixed(3);
      if (value !== written) stage.current?.style.setProperty("--ghost-live", (written = value));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [speechLevel]);
  useEffect(() => {
    copies.current.forEach((c) =>
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height),
    );
  }, [imageUrl]);
  const frame = (source: HTMLCanvasElement) => {
    for (const canvas of copies.current) {
      if (!canvas) continue;
      if (canvas.width !== source.width || canvas.height !== source.height) {
        canvas.width = source.width;
        canvas.height = source.height;
      }
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      ctx?.drawImage(source, 0, 0);
    }
  };
  const style = {
    "--ghost-brightness": config.brightness,
    "--ghost-contrast": config.contrast,
    "--ghost-rim": config.rim,
    "--ghost-feather": `${config.feather}%`,
  } as CSSProperties;
  return (
    <div
      ref={stage}
      className="ghost-projection"
      data-mode={mode}
      style={style}
      aria-label="ECHO ghost portrait"
    >
      <div className="ghost-source" aria-hidden="true">
        <LivingPortrait
          imageUrl={imageUrl}
          speechLevel={speechLevel}
          mode={mode}
          mirror={config.follow}
          manual={manual}
          cutout
          ghost
          accent={accent}
          onFrame={frame}
          onState={onState}
          onMirror={onMirror}
        />
      </div>
      <div
        className={`ghost-field ${config.layout}`}
        style={{ transform: `translateY(${config.vertical}cqh)` }}
        aria-hidden="true"
      >
        {ghostSlots(config.layout).map((slot, i) => (
          <div
            className="ghost-copy"
            data-slot={slot.name}
            key={slot.name}
            style={{
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              width:
                config.layout === "single"
                  ? `min(${config.size * 0.8}cqw, ${config.size * 0.7}cqh)`
                  : `${config.size * 0.27}%`,
              height:
                config.layout === "single"
                  ? `${config.size * 0.85}cqh`
                  : `${config.size * 0.32}%`,
              transform: ghostTransform(slot.rotation, config.mirrored),
            }}
          >
            <div className="ghost-feather">
              <canvas
                ref={(el) => {
                  copies.current[i] = el;
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
