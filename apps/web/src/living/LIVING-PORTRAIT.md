# Living portrait

ECHO as a living photo. One still portrait (a selfie, or a generated future self) is brought to
life in the browser: it blinks, breathes, talks and turns its head, and with the camera mirror on
it follows the viewer's head like a Memoji. It stays photoreal because nothing is redrawn: the
photo's own pixels are moved on a face mesh.

Try it at `/living.html` (dev server `npm run dev`, then http://127.0.0.1:5186/living.html).

## How it works

1. **Find the face.** The same on-device MediaPipe engine as the scan finds 478 face landmarks
   and a person mask. Loose photos are framed to head and shoulders.
2. **Rig it.** `geometry.ts` triangulates the landmarks plus three rings around the head and the
   pinned image border. Blinks, the jaw and breathing are offsets per vertex; head turns rotate
   the mesh about a pivot behind the face, fading out toward the border.
3. **The mouth.** The photographed inside of the mouth stays with the upper jaw, and a strip
   opens between it and the lower lip as the jaw drops. The strip is shaded as the inside of a
   mouth, lit like the face around it, with drawn upper teeth when the photo's mouth is closed.
4. **Motion.** `motion.ts`: natural blink timing, idle head motion, breathing, a speech rhythm
   for the mouth while ECHO talks, and the camera mirror (calibrated to the viewer's neutral
   head, mirrored, smoothed, eased into limits a photo can hold: 12° turn, 8° nod, 12° tilt).
5. **Cut-out.** `matte.ts` tightens the person mask and pulls the edge colours in from the
   person, so a cut-out ECHO can sit in a scene without a light fringe.

## Use it

```tsx
import { LivingPortrait } from "./living/LivingPortrait";

<LivingPortrait
  imageUrl={url} // object URL, data URL or same-origin URL; never uploaded
  mode={echoMode} // "idle" | "listening" | "thinking" | "speaking"
  accent={side} // "dream" | "good" | "neutral" | "bad" | "home" | null: light in the eyes
  mirror={false} // true: follow the viewer's head through the camera
  cutout={false} // true: keep only the person, for compositing into a scene
/>;
```

The component fills its parent, so give the parent a size (for example `aspect-ratio: 4 / 5`).
`FuturePortrait` already animates a generated future portrait this way.

## Privacy

The photo and the camera frames are processed in this browser and never sent anywhere. Nothing is
recorded or stored.

## Limits

- It is a 2D warp, so it cannot show what a real turn would reveal. Head moves are kept small.
- Reneė service playback drives the mouth from decoded audio energy at the actual playback
  position, with a short attack/release envelope. This follows volume and pauses, not phonemes.
  Browser speech (or a browser without audio decoding) retains the synthetic speech rhythm
  because browser speech exposes no audio samples. Fetching and interrupted service audio
  hold the mouth closed; head-follow and blinking continue.
- Hair and shoulders move with the head as one piece.
