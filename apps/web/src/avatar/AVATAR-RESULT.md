# Portrait projection — result

Built by Claude on September 23, 2026, finishing the likeness-avatar spec Codex wrote for Antigravity. Codex's session hit its usage limit and Antigravity was still waiting on a file-permission prompt, so no Antigravity code is in this change.

## What it is

A **portrait projection**: the user's own photo, framed on their face, cut into a head-and-shoulders matte, and shown as a lit 2.5D hologram with parallax, a restrained scanline, a slow sweep, rim light at the matte edge, a bottom-up reveal, and the Crossing's slice dissolve. The face is the photo's own pixels, so skin detail and proportions are preserved. It is **not** reconstructed 3D, not a scan, and not lip-sync. The UI says "portrait projection of your photo".

Wardrobe works like a character creator, by voice only:

| Slot   | Values                                                                                                        | Voice                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| outfit | `casual` (their own clothes), `monarch` (obsidian pauldrons, gorget, breastplate, standing collar, gold trim) | "put on the monarch armor", "suit up", "take off the armor", "go back to casual" |
| aura   | `cyan`, `violet`, `gold` (halo ring, backlight, rim light, rising motes, armor seams and gems)                | "make my aura gold", "purple aura"                                               |

Every piece is drawn procedurally on canvas (`portraitParts.ts`): no downloaded assets, no game assets, no provider logos. The violet/gold palette follows the style reference Prat chose; the shapes are original.

## Props

```ts
<PortraitAvatar
  active={boolean}
  mode?: "idle" | "listening" | "thinking" | "speaking"
  side?: "dream" | "good" | "neutral" | "bad" | null
  portraitUrl?: string | null        // local object URL; never uploaded
  appearance?: { outfit?: string; aura?: string }
  onPrepared?: (ok: boolean) => void // photo framed (true) or unreadable (false)
/>
```

Without `portraitUrl` it shows a neutral bust. Without WebGL it falls back to the photo in a soft oval with scanlines. The stage keeps Codex's point bust whenever no photo is set, and passes the aura to it too, so "make my aura gold" is visible either way.

## Files

- `portraitFrame.ts`: pure pixel logic, unit-tested in Node. It holds the skin-chroma face finder with a hair check (light hair passes the chroma test, so the region is re-measured on its brighter pixels), face-anchored framing, the bust shapes, and the matte (bust shape, background keyed only in the head's outer ring and the body's rim, feathered at the photo's edges, blurred).
- `preparePortrait.ts`: canvas glue that decodes the photo, finds the face at 128 px, cuts the matte at 160×200, and composites the 640×800 RGBA texture. It also downscales a chosen file to a 1280 px JPEG before it is stored.
- `photoStore.ts`: IndexedDB in this browser only. If storage is unavailable, the photo lasts for the page.
- `portraitShader.ts`: the portrait shader (dome-and-nose depth prior on a 96×120 plane) and the shared part shader (equip reveal, aura colouring, bottom fade).
- `PortraitAvatar.tsx` / `.css`: the scene, the layered parts, the motes, pointer parallax, wall-clock equip/reveal, reduced motion, and full disposal.

## Privacy

The photo never reaches the API, the model, or the ledger. Photo commands ("forget my photo", "use my face") are handled in the browser before a turn is sent. The server stores only the two slot values. No raw photo is committed, bundled, or requested over the network.

## Verified (offline)

- 35 backend tests (15 new: parsing, validation, undo, the shortcut without the model, the model tool path). 7 web tests (5 new: skin tones, face framing, the hair check, the fallback crop, the matte). Ruff, Prettier, `tsc`, and the production build all pass.
- Headless Chromium with a scripted speech stub and a public-domain NASA portrait as a stand-in photo:
  - upload through the real Photo button;
  - casual → monarch → violet → gold → armor off → "forget my photo" back to the point bust;
  - a dream-side session crossing home, with the slice dissolve caught mid-flight;
  - reduced motion, where consecutive frames are pixel-identical;
  - a 400 px width with no horizontal scroll.
- Thin horizontal seams visible in some animated headless captures are software-renderer capture tearing. Proof: they vanish when frames are identical (reduced motion). The one real row-dropout bug of that kind (`step(hash, 0)`) was found and fixed.

## Limitations and next

- The face finder is a heuristic. Beige walls sit near the skin boundary, and busy backgrounds can leave a little wall inside the head ring. Pick a photo with a plain background and the face well lit. Next upgrade: an in-browser segmentation model with the model file bundled locally.
- The depth is a prior, not a reconstruction. Next: a face-landmark mesh for real head turns and jaw motion.
- Not yet tuned on Prat's own photo, because it only exists on his computer. That tuning pass belongs to Antigravity locally, after merge.
