import { useEffect, useState } from "react";
import {
  GHOST_CONFIG_KEY,
  normalizeGhostConfig,
  type GhostConfig,
} from "./config";

export function useGhostConfig(persist = true) {
  const [config, setConfig] = useState<GhostConfig>(() => {
    try {
      return {
        ...normalizeGhostConfig(
          JSON.parse(localStorage.getItem(GHOST_CONFIG_KEY) || "null"),
        ),
        follow: false,
      };
    } catch {
      return normalizeGhostConfig(null);
    }
  });
  useEffect(() => {
    if (!persist) return;
    try {
      localStorage.setItem(
        GHOST_CONFIG_KEY,
        JSON.stringify({ ...config, follow: false }),
      );
    } catch {
      /* Page-local calibration still works when storage is unavailable. */
    }
  }, [config, persist]);
  const update = (patch: Partial<GhostConfig>) =>
    setConfig((current) => normalizeGhostConfig({ ...current, ...patch }));
  return [config, update] as const;
}
