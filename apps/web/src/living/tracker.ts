// The camera mirror: the viewer's head drives the portrait like a Memoji. Frames go through the same
// on-device face engine as the scan; no frame ever leaves this browser, and nothing is recorded.

import { readFace } from "../scan/faceEngine";
import type { Pose } from "./geometry";
import { MirrorCalibrator, measure } from "./motion";

export type MirrorState =
  "off" | "starting" | "calibrating" | "on" | "denied" | "unavailable";

const FRAME_WIDTH = 320;
const FRAME_GAP_MS = 30;

export class WebcamMirror {
  state: MirrorState = "off";
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas = document.createElement("canvas");
  private running = false;
  private calibrator: MirrorCalibrator;
  private current: Pose | null = null;
  private listener: (state: MirrorState) => void;

  constructor(listener: (state: MirrorState) => void, mirrorMouth = false) {
    this.listener = listener;
    this.calibrator = new MirrorCalibrator(12, mirrorMouth);
  }

  private set(state: MirrorState) {
    this.state = state;
    this.listener(state);
  }

  /** Latest smoothed, mirrored pose, or null until the viewer's neutral pose is known. */
  pose(): Pose | null {
    return this.current;
  }

  async start() {
    if (this.running) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.set("unavailable");
      return;
    }
    this.set("starting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: "user",
        },
        audio: false,
      });
    } catch {
      this.set("denied");
      return;
    }
    const video = document.createElement("video");
    video.playsInline = true;
    video.muted = true;
    video.srcObject = this.stream;
    try {
      await video.play();
    } catch {
      this.stop();
      this.set("unavailable");
      return;
    }
    this.video = video;
    this.running = true;
    this.calibrator.reset();
    this.set("calibrating");
    void this.loop();
  }

  private async loop() {
    const ctx = this.canvas.getContext("2d", { willReadFrequently: false });
    while (this.running && this.video && ctx) {
      const video = this.video;
      if (video.videoWidth && video.readyState >= 2) {
        const w = FRAME_WIDTH;
        const h = Math.round(
          (FRAME_WIDTH * video.videoHeight) / video.videoWidth,
        );
        if (this.canvas.width !== w) this.canvas.width = w;
        if (this.canvas.height !== h) this.canvas.height = h;
        ctx.drawImage(video, 0, 0, w, h);
        const landmarks = await readFace(this.canvas).catch(() => null);
        if (!this.running) break;
        if (landmarks) {
          const pose = this.calibrator.update(
            measure(landmarks, w / h),
            performance.now() / 1000,
          );
          if (this.calibrator.calibrated) {
            this.current = pose;
            if (this.state !== "on") this.set("on");
          }
        }
      }
      await new Promise((resolve) => setTimeout(resolve, FRAME_GAP_MS));
    }
  }

  stop() {
    this.running = false;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.current = null;
    if (this.state !== "denied" && this.state !== "unavailable")
      this.set("off");
  }
}
