// Living portrait preview page (/living.html): bring any front-facing picture to life, try the
// camera mirror and the talking mouth, and inspect single poses. Everything stays on this device.

import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Pose } from "./geometry";
import { LivingPortrait, type LivingState } from "./LivingPortrait";
import type { Mode } from "./motion";
import type { MirrorState } from "./tracker";
import "./demo.css";

const DEG = Math.PI / 180;
const MODES: [Mode, string][] = [
  ["idle", "Idle"],
  ["listening", "Listening"],
  ["thinking", "Thinking"],
  ["speaking", "Talking"],
];
const LIGHTS: [string, string][] = [
  ["", "Off"],
  ["home", "Home"],
  ["dream", "Dream life"],
  ["good", "Good path"],
  ["neutral", "Drift"],
  ["bad", "Hard road"],
];
const MIRROR_TEXT: Record<MirrorState, string> = {
  off: "Camera off",
  starting: "Starting the camera…",
  calibrating: "Hold still for a moment…",
  on: "Following your head",
  denied: "Camera permission was denied",
  unavailable: "No camera available",
};
const STATE_TEXT: Record<LivingState, string> = {
  loading: "Finding the face…",
  ready: "Live · on this device",
  noface: "No face found. Try a clear, front-facing picture.",
  error: "This picture could not be shown.",
};

type Manual = {
  yaw: number;
  pitch: number;
  roll: number;
  blink: number;
  open: number;
};
const NEUTRAL: Manual = { yaw: 0, pitch: 0, roll: 0, blink: 0, open: 0 };

function App() {
  const [url, setUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("idle");
  const [mirror, setMirror] = useState(false);
  const [mirrorState, setMirrorState] = useState<MirrorState>("off");
  const [cutout, setCutout] = useState(false);
  const [light, setLight] = useState("home");
  const [state, setState] = useState<LivingState | null>(null);
  const [detail, setDetail] = useState("");
  const [fps, setFps] = useState(0);
  const [manualOn, setManualOn] = useState(false);
  const [manual, setManual] = useState<Manual>(NEUTRAL);

  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const pose: Partial<Pose> | null = manualOn
    ? {
        yaw: manual.yaw * DEG,
        pitch: manual.pitch * DEG,
        roll: manual.roll * DEG,
        blinkR: manual.blink,
        blinkL: manual.blink,
        open: manual.open,
      }
    : null;

  const slider = (
    key: keyof Manual,
    label: string,
    min: number,
    max: number,
    step: number,
  ) => (
    <label className="lp-slider">
      <span>
        {label}
        <b>{manual[key].toFixed(step < 1 ? 2 : 0)}</b>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={manual[key]}
        aria-label={label}
        onChange={(e) =>
          setManual({ ...manual, [key]: Number(e.target.value) })
        }
      />
    </label>
  );

  return (
    <div className="lp">
      <header className="lp-head">
        <div className="lp-brand">
          THE OTHER <span>SIDE</span>
        </div>
        <div className="lp-sub">Living portrait · preview</div>
      </header>
      <main className="lp-main">
        <section className="lp-stage" aria-label="Living portrait">
          {url ? (
            <LivingPortrait
              imageUrl={url}
              mode={mode}
              mirror={mirror}
              cutout={cutout}
              accent={light || null}
              manual={pose}
              onState={(s, d) => {
                setState(s);
                setDetail(d || "");
              }}
              onMirror={setMirrorState}
              onFps={setFps}
            />
          ) : (
            <div className="lp-empty">
              <p>Choose a clear, front-facing picture to bring it to life.</p>
              <p className="lp-muted">It stays on this device.</p>
            </div>
          )}
          {url && state && (
            <div className={"lp-chip" + (state === "ready" ? " live" : "")}>
              {state === "error" && detail ? detail : STATE_TEXT[state]}
            </div>
          )}
          {url && state === "ready" && (
            <div className="lp-fps">{Math.round(fps)} fps</div>
          )}
        </section>
        <aside className="lp-panel">
          <div className="lp-group">
            <div className="lp-label">Portrait</div>
            <label className="lp-button primary">
              Choose a picture
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setState(null);
                  setName(file.name);
                  setUrl(URL.createObjectURL(file));
                }}
              />
            </label>
            {name && <div className="lp-muted lp-file">{name}</div>}
          </div>

          <div className="lp-group">
            <div className="lp-label">ECHO is</div>
            <div
              className="lp-segments"
              role="radiogroup"
              aria-label="ECHO state"
            >
              {MODES.map(([value, label]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={mode === value}
                  className={mode === value ? "on" : ""}
                  onClick={() => setMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="lp-group">
            <div className="lp-label">Mirror</div>
            <button
              className={"lp-toggle" + (mirror ? " on" : "")}
              aria-pressed={mirror}
              onClick={() => setMirror(!mirror)}
            >
              <span className="lp-knob" />
              Follow my head (camera)
            </button>
            <div className="lp-muted">
              {MIRROR_TEXT[mirror ? mirrorState : "off"]}
            </div>
          </div>

          <div className="lp-group">
            <div className="lp-label">Look</div>
            <button
              className={"lp-toggle" + (cutout ? " on" : "")}
              aria-pressed={cutout}
              onClick={() => setCutout(!cutout)}
            >
              <span className="lp-knob" />
              Cut out the background
            </button>
            <label className="lp-select">
              <span>Light in the eyes</span>
              <select value={light} onChange={(e) => setLight(e.target.value)}>
                {LIGHTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <details
            className="lp-group"
            onToggle={(e) => setManualOn((e.target as HTMLDetailsElement).open)}
          >
            <summary className="lp-label">Hold a pose</summary>
            {slider("yaw", "Turn (°)", -12, 12, 1)}
            {slider("pitch", "Nod (°)", -8, 8, 1)}
            {slider("roll", "Tilt (°)", -12, 12, 1)}
            {slider("blink", "Blink", 0, 1, 0.01)}
            {slider("open", "Mouth", 0, 1, 0.01)}
            <button className="lp-button" onClick={() => setManual(NEUTRAL)}>
              Reset pose
            </button>
          </details>

          <p className="lp-note">
            Your picture and your camera never leave this device. This is the
            photo itself, moved on a face mesh: no 3D reconstruction, and the
            mouth follows ECHO's speech rhythm, not phonemes.
          </p>
        </aside>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
