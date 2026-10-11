import type { GhostLayout } from "./layout";

/** One portable display configuration. Contains no photo, identity or camera frames. */
export type GhostConfig = {
  version: 1;
  mirrored: boolean;
  layout: GhostLayout;
  size: number;
  vertical: number;
  follow: boolean;
  brightness: number;
  contrast: number;
  rim: number;
  feather: number;
  keepAwake: boolean;
};
export const DEFAULT_GHOST_CONFIG: GhostConfig = {
  version: 1,
  mirrored: true,
  layout: "single",
  size: 100,
  vertical: 0,
  follow: false,
  brightness: 1.28,
  contrast: 1.16,
  rim: 0.53,
  feather: 62,
  keepAwake: true,
};
export const GHOST_CONFIG_KEY = "echo-ghost-config-v1";
export function normalizeGhostConfig(value: unknown): GhostConfig {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const number = (key: keyof GhostConfig, min: number, max: number) =>
    typeof v[key] === "number" && Number.isFinite(v[key])
      ? Math.min(max, Math.max(min, v[key] as number))
      : (DEFAULT_GHOST_CONFIG[key] as number);
  return {
    version: 1,
    mirrored: typeof v.mirrored === "boolean" ? v.mirrored : true,
    layout: v.layout === "pyramid" ? "pyramid" : "single",
    size: number("size", 40, 140),
    vertical: number("vertical", -30, 30),
    // Loading saved display calibration never grants camera permission.
    follow: typeof v.follow === "boolean" ? v.follow : false,
    brightness: number("brightness", 0.8, 1.8),
    contrast: number("contrast", 0.8, 1.6),
    rim: number("rim", 0, 1),
    feather: number("feather", 20, 85),
    keepAwake: typeof v.keepAwake === "boolean" ? v.keepAwake : true,
  };
}
