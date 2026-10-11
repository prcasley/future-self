import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  LivingPortrait,
  currentLivingPresentation,
  type LivingState,
} from "../living/LivingPortrait";
import type { Pose } from "../living/geometry";
import type { Mode } from "../living/motion";
import { ghostSlots, ghostTransform, type GhostLayout } from "./layout";
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
  resumeLiving?: boolean;
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
  resumeLiving = false,
  mode = "idle",
  follow = false,
  manual,
  running,
  onSession,
  onInterrupt,
  status,
  onExit,
}: Props) {
  const [presentation] = useState(() =>
    resumeLiving ? currentLivingPresentation() : null,
  );
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const copies = useRef<(HTMLCanvasElement | null)[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const url = photo || presentation?.imageUrl || imageUrl;
  const [controls, setControls] = useState(true);
  const [mirrored, setMirrored] = useState(true);
  const [layout, setLayout] = useState<GhostLayout>("single");
  const [size, setSize] = useState(100);
  const [vertical, setVertical] = useState(0);
  const [tracking, setTracking] = useState(presentation?.follow ?? follow);
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
    setControls(true);
    copies.current.forEach((c) =>
      c?.getContext("2d")?.clearRect(0, 0, c.width, c.height),
    );
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
    if (controls) panel.current?.focus();
    else root.current?.focus();
  }, [controls]);

  // Browsers release locks when hidden. Reacquire on return and release on exit.
  useEffect(() => {
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
  }, [url, state]);

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
  const frame = (source: HTMLCanvasElement) => {
    for (const canvas of copies.current) {
      if (!canvas) continue;
      if (canvas.width !== source.width || canvas.height !== source.height) {
        canvas.width = source.width;
        canvas.height = source.height;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(source, 0, 0);
    }
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
      <div className="ghost-source" aria-hidden="true">
        <LivingPortrait
          imageUrl={url}
          mode={mode}
          mirror={tracking}
          manual={manual}
          cutout
          ghost
          accent={null}
          onFrame={frame}
          onMirror={setCamera}
          onState={(next, message) => {
            setState(next);
            setDetail(message || "");
            if (next === "error" || next === "noface") setControls(true);
          }}
        />
      </div>
      <div
        className={`ghost-field ${layout}`}
        style={{ transform: `translateY(${vertical}vh)` }}
        aria-hidden="true"
      >
        {ghostSlots(layout).map((slot, i) => {
          const style: CSSProperties = {
            left: `${slot.x}%`,
            top: `${slot.y}%`,
            width:
              layout === "single"
                ? `min(${size * 0.8}vw, ${size * 0.7}vh)`
                : `${size * 0.27}%`,
            height:
              layout === "single" ? `${size * 0.85}vh` : `${size * 0.32}%`,
            transform: ghostTransform(slot.rotation, mirrored),
          };
          return (
            <div
              className="ghost-copy"
              data-slot={slot.name}
              key={slot.name}
              style={style}
            >
              <div className="ghost-feather">
                <canvas
                  ref={(el) => {
                    copies.current[i] = el;
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
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
              ? "Choose a portrait to begin."
              : state === "ready"
                ? "Portrait ready"
                : detail || "Preparing the living portrait…"}
          </p>
          <label>
            Photo{" "}
            <input
              aria-label="Ghost photo"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setPhoto(URL.createObjectURL(file));
                e.target.value = "";
              }}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={mirrored}
              onChange={(e) => setMirrored(e.target.checked)}
            />
            Mirror reflection
          </label>
          <label>
            Layout{" "}
            <select
              aria-label="Ghost layout"
              value={layout}
              onChange={(e) => setLayout(e.target.value as GhostLayout)}
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
              onChange={(e) => setSize(Number(e.target.value))}
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
              onChange={(e) => setVertical(Number(e.target.value))}
            />
            <output>{vertical}%</output>
          </label>
          <label>
            <input
              type="checkbox"
              checked={tracking}
              onChange={(e) => setTracking(e.target.checked)}
            />
            Follow my head
          </label>
          <p>Camera: {camera}. Photo and camera frames stay in this browser.</p>
          <p>
            {awake}
            {screen && ` · ${screen}`}
          </p>
          {status && <p>{status}</p>}
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
                {running ? "End session" : "Start session"}
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
