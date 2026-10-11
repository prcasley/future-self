import { useEffect, useRef, type CSSProperties } from "react";
import { LivingPortrait, type LivingState } from "../living/LivingPortrait";
import type { Mode } from "../living/motion";
import type { Pose } from "../living/geometry";
import type { MirrorState } from "../living/tracker";
import type { GhostConfig } from "./config";
import { ghostSlots, ghostTransform } from "./layout";
import "./GhostMode.css";

/** Output only: no controls, text, status indicators or fallback artwork. */
export function GhostProjection({
  imageUrl,
  mode,
  config,
  manual,
  onState,
  onMirror,
}: {
  imageUrl: string | null;
  mode: Mode;
  config: GhostConfig;
  manual?: Partial<Pose> | null;
  onState?: (state: LivingState, detail?: string) => void;
  onMirror?: (state: MirrorState) => void;
}) {
  const copies = useRef<(HTMLCanvasElement | null)[]>([]);
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
      className="ghost-projection"
      data-mode={mode}
      style={style}
      aria-label="ECHO ghost portrait"
    >
      <div className="ghost-source" aria-hidden="true">
        <LivingPortrait
          imageUrl={imageUrl}
          mode={mode}
          mirror={config.follow}
          manual={manual}
          cutout
          ghost
          accent={null}
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
