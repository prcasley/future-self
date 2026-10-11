/** Audio amplitude only, not phoneme/viseme prediction. No microphone input. */
export type Envelope = { levels: Float32Array; step: number };

export function audioEnvelope(
  channels: readonly Float32Array[],
  sampleRate: number,
): Envelope {
  const width = Math.max(1, Math.round(sampleRate * 0.01));
  const length = channels[0]?.length || 0;
  const levels = new Float32Array(Math.ceil(length / width));
  for (let frame = 0; frame < levels.length; frame++) {
    const start = frame * width;
    const end = Math.min(length, start + width);
    let square = 0;
    for (const channel of channels)
      for (let i = start; i < end; i++) square += channel[i] ** 2;
    const rms = Math.sqrt(square / ((end - start) * channels.length));
    // Ignore the noise floor and keep full-scale speech from over-opening the jaw.
    levels[frame] = Math.min(1, Math.max(0, (rms - 0.006) / 0.12));
  }
  return { levels, step: width / sampleRate };
}

export function mouthAt(envelope: Envelope, seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return envelope.levels[Math.floor(seconds / envelope.step)] ?? 0;
}

export function smoothMouth(
  previous: number,
  target: number,
  dt: number,
): number {
  const rate = target > previous ? 0.025 : 0.065;
  const value =
    previous + (target - previous) * (1 - Math.exp(-Math.max(0, dt) / rate));
  return value < 0.005 ? 0 : Math.min(1, Math.max(0, value));
}

/** Decode independently of the sound output, so analysis can never mute playback. */
export async function decodeEnvelope(blob: Blob): Promise<Envelope | null> {
  try {
    if (typeof OfflineAudioContext === "undefined") return null;
    const context = new OfflineAudioContext(1, 1, 24000);
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return audioEnvelope(
      Array.from({ length: decoded.numberOfChannels }, (_, i) =>
        decoded.getChannelData(i),
      ),
      decoded.sampleRate,
    );
  } catch {
    return null;
  }
}
