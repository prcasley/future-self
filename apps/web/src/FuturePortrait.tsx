import { useEffect, useRef, useState } from "react";
import { LivingPortrait, type LivingState } from "./living/LivingPortrait";

type Config = { backend: string; accepts_photo: boolean; ready: boolean };
type Result = {
  brief: Record<string, string>;
  image_b64: string | null;
  mime_type: string | null;
  identity_requested: boolean;
};

/** Deliberately separate from the device-only photo and scan flows. */
function toBlob(b64: string, mime: string): Blob {
  const bytes = atob(b64);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes.charCodeAt(i);
  return new Blob([out], { type: mime });
}

export function FuturePortrait({
  session,
  onUse,
}: {
  session: string;
  /** Keep a generated portrait as the face ECHO wears on that side (device only). */
  onUse?: (side: string, blob: Blob) => void;
}) {
  const [config, setConfig] = useState<Config | null>(null);
  const [side, setSide] = useState("dream");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [message, setMessage] = useState("");
  const [living, setLiving] = useState<LivingState | null>(null);
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/future/portrait/config", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setConfig(await response.json());
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage("Connect the local API to prepare a future portrait.");
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
  }, []);

  function clear() {
    request.current?.abort();
    request.current = null;
    setPending(false);
    setResult(null);
    setLiving(null);
    setFile(null);
    setConsent(false);
    setMessage("");
    if (input.current) input.current.value = "";
  }

  async function generate() {
    if (
      !config?.ready ||
      pending ||
      (config.accepts_photo && (!file || !consent))
    )
      return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setResult(null);
    setLiving(null);
    setMessage("Preparing your possible future…");
    setConsent(false);
    try {
      let image_b64: string | undefined;
      if (config.accepts_photo && file) {
        if (
          file.size > 6_000_000 ||
          !["image/png", "image/jpeg", "image/webp"].includes(file.type)
        )
          throw new Error("Choose a PNG, JPG or WebP photo smaller than 6 MB.");
        image_b64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1]);
          reader.onerror = () =>
            reject(new Error("This photo could not be read."));
          reader.readAsDataURL(file);
        });
      }
      if (controller.signal.aborted) return;
      const response = await fetch("/api/future/portrait", {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: session,
          side,
          consent: config.accepts_photo,
          ...(image_b64 ? { image_b64 } : {}),
        }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Today's generation budget is used up. Please try tomorrow."
            : "The portrait could not be generated. Check the image service and try again.",
        );
      const next: Result = await response.json();
      if (controller.signal.aborted) return;
      if (
        next.image_b64 &&
        !["image/png", "image/jpeg", "image/webp"].includes(
          next.mime_type || "",
        )
      )
        throw new Error("The image service returned an unsupported picture.");
      setResult(next);
      setMessage(
        next.image_b64
          ? "Portrait ready. It comes alive here, on this device."
          : "Your styling brief is ready. Image generation is not enabled in this mode.",
      );
    } catch (error) {
      if (!controller.signal.aborted)
        setMessage(
          error instanceof Error ? error.message : "Portrait unavailable.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
        setFile(null);
        if (input.current) input.current.value = "";
      }
    }
  }

  return (
    <details className="future-portrait">
      <summary>Preview your future self</summary>
      <p>
        Start with one possible future. This is imagined styling, not a
        prediction.
      </p>
      <label>
        Future
        <select
          value={side}
          disabled={pending}
          onChange={(e) => {
            setSide(e.target.value);
            setResult(null);
            setConsent(false);
            setMessage("");
          }}
        >
          <option value="dream">Dream</option>
          <option value="good">Good</option>
          <option value="neutral">Drift</option>
          <option value="bad">Hard road</option>
        </select>
      </label>
      {config?.accepts_photo ? (
        <>
          <label>
            Photo for this request
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={pending}
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setConsent(false);
                setResult(null);
              }}
            />
          </label>
          <label className="portrait-consent">
            <input
              type="checkbox"
              checked={consent}
              disabled={pending || !file}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Send this photo to the configured image service for this one
            generation. The app does not save it. Only proceed with a service
            whose photo-retention policy you trust.
          </label>
        </>
      ) : (
        <p>
          {config?.backend === "tokenfactory"
            ? "Concept portrait only: this mode does not use your face."
            : "Styling preview: no photo is uploaded."}
        </p>
      )}
      {config && !config.ready && (
        <p>
          The image service needs configuration before generation is available.
        </p>
      )}
      <div className="portrait-actions">
        <button
          disabled={
            !config?.ready ||
            pending ||
            (config.accepts_photo && (!file || !consent))
          }
          onClick={() => void generate()}
        >
          {pending
            ? "Preparing…"
            : config?.backend === "local"
              ? "Preview styling"
              : "Generate portrait"}
        </button>
        <button onClick={clear}>Clear preview</button>
      </div>
      <p role="status">{message}</p>
      {result && (
        <div className="portrait-result">
          {result.image_b64 &&
            (living === "noface" || living === "error" ? (
              <img
                src={`data:${result.mime_type};base64,${result.image_b64}`}
                alt={`Illustrative ${side} future portrait`}
              />
            ) : (
              <div
                className="portrait-living"
                role="img"
                aria-label={`Illustrative ${side} future portrait, animated`}
              >
                <LivingPortrait
                  imageUrl={`data:${result.mime_type};base64,${result.image_b64}`}
                  accent={side}
                  onState={setLiving}
                />
              </div>
            ))}
          {result.image_b64 && onUse && (
            <div className="portrait-actions">
              <button
                onClick={() =>
                  onUse(
                    side,
                    toBlob(result.image_b64!, result.mime_type || "image/png"),
                  )
                }
              >
                Use as my {side === "neutral" ? "drift" : side} face
              </button>
            </div>
          )}
          {result.image_b64 && (
            <p>
              {result.identity_requested
                ? "Reference-guided portrait. Check that the likeness feels right."
                : "Concept art, not your likeness."}
            </p>
          )}
          <dl>
            {Object.entries(result.brief).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </details>
  );
}
