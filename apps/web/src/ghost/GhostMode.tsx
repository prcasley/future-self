import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LivingState } from "../living/LivingPortrait";
import { GhostProjection } from "./GhostProjection";
import type { GhostConfig } from "./config";
import { useGhostConfig } from "./useGhostConfig";
import type { Pose } from "../living/geometry";
import type { Mode } from "../living/motion";
import type { GhostLayout } from "./layout";
import { demoFaceFile } from "../demoFace";
import "./GhostMode.css";

const atGhost = () => /^\/ghost(?:\/|$)/.test(window.location.pathname);
export function useGhostRoute(): [boolean, (value: boolean) => void] {
  const [ghost, setGhost] = useState(atGhost);
  useEffect(() => {
    const sync = () => setGhost(atGhost());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  return [
    ghost,
    (value) => {
      window.history.pushState(null, "", value ? "/ghost" : "/");
      setGhost(value);
    },
  ];
}

type Props = {
  imageUrl: string | null;
  speechLevel?: { current: number | null };
  config?: GhostConfig;
  onConfig?: (patch: Partial<GhostConfig>) => void;
  onPhoto?: (file: File) => void;
  onControlsChange?: (visible: boolean) => void;
  children?: ReactNode;
  mode?: Mode;
  follow?: boolean;
  manual?: Partial<Pose> | null;
  running?: boolean;
  onSession?: () => void;
  onInterrupt?: () => void;
  status?: string;
  onExit: () => void;
};

export function GhostMode({
  imageUrl,
  speechLevel,
  config: providedConfig,
  onConfig,
  onPhoto,
  onControlsChange,
  children,
  mode = "idle",
  follow = false,
  manual,
  running,
  onSession,
  onInterrupt,
  status,
  onExit,
}: Props) {
  const [localConfig, setLocalConfig] = useGhostConfig(!providedConfig);
  const config = providedConfig || localConfig;
  const update = onConfig || setLocalConfig;
  const { mirrored, layout, size, vertical, follow: tracking } = config;
  const controlsCallback = useRef(onControlsChange);
  controlsCallback.current = onControlsChange;
  useEffect(() => {
    if (!providedConfig) setLocalConfig({ follow });
  }, [follow]);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const takePhotoFile = (file: File) => {
    if (onPhoto) onPhoto(file);
    else setPhoto(URL.createObjectURL(file));
  };
  const applyDemoFace = async () => {
    setLoadingDemo(true);
    try {
      takePhotoFile(await demoFaceFile());
    } finally {
      setLoadingDemo(false);
    }
  };
  const url = photo || imageUrl;
  const [controls, setControls] = useState(true);
  const [camera, setCamera] = useState("off");
  const [state, setState] = useState<LivingState>("loading");
  const [detail, setDetail] = useState("");
  const [screen, setScreen] = useState("");
  const [awake, setAwake] = useState("Screen wake lock pending");

  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo);
    },
    [photo],
  );
  useEffect(() => {
    setState("loading");
  }, [url]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const reveal = (e: KeyboardEvent) => {
      if (e.key === "Escape") setControls(true);
    };
    const fullscreen = () => {
      if (!document.fullscreenElement) setControls(true);
    };
    window.addEventListener("keydown", reveal);
    document.addEventListener("fullscreenchange", fullscreen);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", reveal);
      document.removeEventListener("fullscreenchange", fullscreen);
    };
  }, []);
  useEffect(() => {
    controlsCallback.current?.(controls);
    if (controls) panel.current?.focus();
    else root.current?.focus();
  }, [controls]);

  // Browsers release locks when hidden. Reacquire on return and release on exit.
  useEffect(() => {
    if (!config.keepAwake) {
      setAwake("Keep-awake off");
      return;
    }
    if (!url || state !== "ready") return;
    let disposed = false;
    let pending = false;
    let lock: WakeLockSentinel | undefined;
    const request = async () => {
      if (document.hidden || disposed || pending || (lock && !lock.released))
        return;
      if (!navigator.wakeLock) {
        setAwake("Keep-awake unavailable in this browser");
        return;
      }
      pending = true;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (disposed) {
          await next.release();
          return;
        }
        lock = next;
        setAwake("Screen kept awake");
        next.addEventListener("release", () => {
          if (!disposed)
            setAwake("Wake lock released; check device sleep settings");
        });
      } catch {
        if (!disposed)
          setAwake("Keep-awake denied; check device sleep settings");
      } finally {
        pending = false;
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", request);
      void lock?.release();
    };
  }, [url, state, config.keepAwake]);

  const fullscreen = async () => {
    try {
      if (!document.fullscreenElement) await root.current?.requestFullscreen();
      setScreen("");
      setControls(false);
    } catch {
      setScreen(
        "Fullscreen unavailable. Use the browser's fullscreen command or project in this window.",
      );
    }
  };
  const exit = async () => {
    if (document.fullscreenElement === root.current) {
      try {
        await document.exitFullscreen();
      } catch {
        /* still allow exit */
      }
    }
    onExit();
  };
  return (
    <div
      ref={root}
      tabIndex={-1}
      className={`ghost-mode${controls ? "" : " is-running"}`}
      aria-label="Ghost projection"
      onPointerDown={() => {
        if (!controls) setControls(true);
      }}
    >
      <GhostProjection
        imageUrl={url}
        speechLevel={speechLevel}
        mode={mode}
        config={config}
        manual={manual}
        onMirror={setCamera}
        onState={(next, message) => {
          setState(next);
          setDetail(message || "");
          if (next === "error" || next === "noface") setControls(true);
        }}
      />
      {!controls && running && onSession && (
        // While projecting, the mic's state and its off switch stay on screen, dim so the glass
        // barely shows them. Tapping here stops listening without bringing the controls back.
        <div className="ghost-live" onPointerDown={(e) => e.stopPropagation()}>
          <span className="ghost-live-dot" aria-hidden="true" />
          <span role="status">Listening</span>
          <button type="button" onClick={onSession}>
            Stop listening
          </button>
        </div>
      )}
      {controls && (
        <section
          ref={panel}
          className="ghost-controls"
          tabIndex={-1}
          aria-label="Ghost controls"
        >
          <h1>Ghost mode</h1>
          <p>
            Black disappears in the glass. Project, then tap anywhere or press
            Esc to adjust.
          </p>
          <p role="status">
            {!url
              ? "Use the demo face, or choose a portrait to begin."
              : state === "ready"
                ? "Portrait ready"
                : detail || "Preparing the living portrait…"}
          </p>
          {!url && (
            <button
              type="button"
              disabled={loadingDemo}
              onClick={() => void applyDemoFace()}
            >
              Use the demo face
            </button>
          )}
          <label>
            Photo{" "}
            <input
              aria-label="Ghost photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) takePhotoFile(file);
                e.target.value = "";
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={mirrored}
              onChange={(e) => update({ mirrored: e.target.checked })}
            />
            Mirror reflection
          </label>
          <label>
            Layout{" "}
            <select
              aria-label="Ghost layout"
              value={layout}
              onChange={(e) =>
                update({ layout: e.target.value as GhostLayout })
              }
            >
              <option value="single">Single portrait</option>
              <option value="pyramid">Four-sided pyramid</option>
            </select>
          </label>
          <label>
            Size{" "}
            <input
              aria-label="Portrait size"
              type="range"
              min="40"
              max="140"
              value={size}
              onChange={(e) => update({ size: Number(e.target.value) })}
            />
            <output>{size}%</output>
          </label>
          <label>
            Vertical{" "}
            <input
              aria-label="Vertical position"
              type="range"
              min="-30"
              max="30"
              value={vertical}
              onChange={(e) => update({ vertical: Number(e.target.value) })}
            />
            <output>{vertical}%</output>
          </label>
          <label>
            <input
              type="checkbox"
              checked={tracking}
              onChange={(e) => update({ follow: e.target.checked })}
            />
            Follow my head
          </label>
          <p>Camera: {camera}. Photo and camera frames stay in this browser.</p>
          <p>
            {awake}
            {screen && ` · ${screen}`}
          </p>
          <label>
            Brightness{" "}
            <input
              aria-label="Ghost brightness"
              type="range"
              min="0.8"
              max="1.8"
              step="0.02"
              value={config.brightness}
              onChange={(e) => update({ brightness: Number(e.target.value) })}
            />
          </label>
          <label>
            Contrast{" "}
            <input
              aria-label="Ghost contrast"
              type="range"
              min="0.8"
              max="1.6"
              step="0.02"
              value={config.contrast}
              onChange={(e) => update({ contrast: Number(e.target.value) })}
            />
          </label>
          <label>
            Rim light{" "}
            <input
              aria-label="Rim light"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config.rim}
              onChange={(e) => update({ rim: Number(e.target.value) })}
            />
          </label>
          <label>
            Edge fade{" "}
            <input
              aria-label="Edge fade"
              type="range"
              min="20"
              max="85"
              value={config.feather}
              onChange={(e) => update({ feather: Number(e.target.value) })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={config.keepAwake}
              onChange={(e) => update({ keepAwake: e.target.checked })}
            />
            Keep screen awake
          </label>
          {status && <p role="status">{status}</p>}
          {children}
          <div className="ghost-actions">
            <button
              disabled={!url || state !== "ready"}
              onClick={() => setControls(false)}
            >
              Project
            </button>
            <button
              disabled={!url || state !== "ready"}
              onClick={() => void fullscreen()}
            >
              Fullscreen
            </button>
            {onSession && (
              <button onClick={onSession}>
                {running ? "Stop listening" : "Start session"}
              </button>
            )}
            {running && onInterrupt && (
              <button onClick={onInterrupt}>Interrupt ECHO</button>
            )}
            <button onClick={() => void exit()}>Exit Ghost</button>
          </div>
        </section>
      )}
    </div>
  );
}
