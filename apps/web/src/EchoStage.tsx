import { useState, type ChangeEvent } from "react";
import { GhostProjection } from "./ghost/GhostProjection";
import type { GhostConfig } from "./ghost/config";
import type { Mode } from "./living/motion";
import type { LivingState } from "./living/LivingPortrait";
import type { MirrorState } from "./living/tracker";
import { demoFaceFile } from "./demoFace";
import "./EchoStage.css";

/** The main stage uses exactly the display renderer used by /ghost. */
export function EchoStage({
  imageUrl,
  speechLevel,
  mode,
  config,
  onConfig,
  onPhoto,
  onProject,
}: {
  imageUrl: string | null;
  speechLevel?: { current: number | null };
  mode: Mode;
  config: GhostConfig;
  onConfig: (patch: Partial<GhostConfig>) => void;
  onPhoto: (file: File) => void;
  onProject: () => void;
}) {
  const [state, setState] = useState<LivingState>("loading");
  const [detail, setDetail] = useState("");
  const [camera, setCamera] = useState<MirrorState>("off");
  const [loadingDemo, setLoadingDemo] = useState(false);
  const applyDemoFace = async () => {
    setLoadingDemo(true);
    try {
      onPhoto(await demoFaceFile());
    } finally {
      setLoadingDemo(false);
    }
  };
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onPhoto(file);
  };
  return (
    <div className="echo-stage">
      <div className="echo-output">
        <GhostProjection
          imageUrl={imageUrl}
          speechLevel={speechLevel}
          mode={mode}
          config={config}
          onState={(next, message) => {
            setState(next);
            setDetail(message || "");
          }}
          onMirror={setCamera}
        />
      </div>
      <div className="echo-tools">
        {!imageUrl && (
          <button type="button" disabled={loadingDemo} onClick={() => void applyDemoFace()}>
            Use the demo face
          </button>
        )}
        <button type="button" onClick={onProject}>
          Ghost mode
        </button>
        <button
          type="button"
          aria-pressed={config.follow}
          onClick={() => onConfig({ follow: !config.follow })}
        >
          {config.follow ? `Camera: ${camera}` : "Follow my head"}
        </button>
        <label className="echo-photo">
          {imageUrl ? "Change this face" : "Choose a face"}
          <input
            aria-label="Stage photo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={choose}
          />
        </label>
        <span role="status">
          {!imageUrl
            ? "Use the demo face, or choose your own portrait. Your photo stays on this device."
            : state === "ready"
              ? `ECHO · ${mode}`
              : detail || "Preparing portrait…"}
        </span>
      </div>
    </div>
  );
}
