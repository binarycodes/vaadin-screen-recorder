/*-
 * #%L
 * Screen Recorder
 * %%
 * Copyright (C) 2025 - 2026 binarycodes
 * %%
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * #L%
 */
import "@vaadin/button";
import { LitElement, css, html, unsafeCSS } from "lit";

type ExtendedDisplayMediaStreamOptions = DisplayMediaStreamOptions & {
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
  systemAudio?: "include" | "exclude";
};
import { openCaptureOverlay } from "./screen-recorder-capture-overlay";
import { openRecordingOverlay } from "./screen-recorder-recording-overlay";
import { SCREEN_RECORDER_CSS } from "./screen-recorder-styles";
import { renderRecorderShell, type RecorderStatus } from "./screen-recorder-shell-view";

class ScreenRecorder extends LitElement {
  private status: RecorderStatus = "idle";
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private recordingBlob: Blob | null = null;
  private recordingStartedAtMs: number | null = null;
  private lastRecordingDurationSeconds: number | null = null;
  private lastCompletedAt: Date | null = null;
  private statusResetTimer: number | null = null;

  private dragPointerId: number | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private positionSet = false;

  private previewOverlay: HTMLDivElement | null = null;
  private previewOverlayCleanup: (() => void) | null = null;
  private a11yIdCounter = 0;
  private _recordEnabled = true;
  private _captureEnabled = true;
  private _floatingEnabled = false;
  private _statusVisible = true;

  set recordEnabled(value: unknown) {
    const next = this.toBoolean(value, true);
    if (this._recordEnabled === next) {
      return;
    }
    this._recordEnabled = next;
    this.updateUi();
  }

  get recordEnabled(): boolean {
    return this._recordEnabled;
  }

  set captureEnabled(value: unknown) {
    const next = this.toBoolean(value, true);
    if (this._captureEnabled === next) {
      return;
    }
    this._captureEnabled = next;
    this.updateUi();
  }

  get captureEnabled(): boolean {
    return this._captureEnabled;
  }

  set floatingEnabled(value: unknown) {
    const next = this.toBoolean(value, false);
    if (this._floatingEnabled === next) {
      return;
    }
    this._floatingEnabled = next;
    this.updateUi();
  }

  get floatingEnabled(): boolean {
    return this._floatingEnabled;
  }

  set statusVisible(value: unknown) {
    const next = this.toBoolean(value, true);
    if (this._statusVisible === next) {
      return;
    }
    this._statusVisible = next;
    this.updateUi();
  }

  get statusVisible(): boolean {
    return this._statusVisible;
  }

  private get container(): HTMLDivElement | null {
    const root = this.renderRoot ?? this.shadowRoot;
    if (!root) {
      return null;
    }
    return root.querySelector('[part~="shell"]') as HTMLDivElement | null;
  }


  static override styles = css`${unsafeCSS(SCREEN_RECORDER_CSS)}`;

  constructor() {
    super();
  }
  protected override render() {
    return html`
      ${renderRecorderShell(
        {
          overlayOpen: this.hasAttribute("overlay-open"),
          statusVisible: this.isStatusVisible,
          statusLabel: this.statusLabel(this.status),
          status: this.status,
          recordEnabled: this.isRecordEnabled,
          captureEnabled: this.isCaptureEnabled
        },
        {
          onShellPointerDown: this.onShellPointerDown,
          onRecordToggle: this.onRecordToggle,
          onCaptureClick: this.onCaptureClick
        }
      )}
    `;
  }

  connectedCallback() {
    super.connectedCallback();
    this.upgradeProperty("recordEnabled");
    this.upgradeProperty("captureEnabled");
    this.upgradeProperty("floatingEnabled");
    this.upgradeProperty("statusVisible");
    this.setControlsVisible(true);
    this.updateUi();
  }

  protected override firstUpdated(): void {
    this.updateUi();
  }

  get isRecordEnabled(): boolean {
    return this.recordEnabled !== false;
  }

  get isCaptureEnabled(): boolean {
    return this.captureEnabled !== false;
  }

  get isFloatingEnabled(): boolean {
    return this.floatingEnabled !== false;
  }

  get isStatusVisible(): boolean {
    return this.statusVisible !== false;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("pointermove", this.onDragMove);
    window.removeEventListener("pointerup", this.onDragEnd);
    this.closePreviewOverlay();
    this.clearIdleReset();
    this.recorder = null;
    this.chunks = [];
    this.teardownStream();
  }

  async start() {
    if (!this.isRecordEnabled) {
      return;
    }

    if (this.recorder && this.status === "recording") {
      return;
    }

    try {
      this.setStatus("idle");

      const captureOptions: ExtendedDisplayMediaStreamOptions = {
        video: { frameRate: 30 },
        audio: true,
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        monitorTypeSurfaces: "include",
        systemAudio: "include"
      };

      this.stream = await navigator.mediaDevices.getDisplayMedia(captureOptions);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : "video/webm";

      this.chunks = [];
      this.recordingBlob = null;
      this.lastRecordingDurationSeconds = null;
      this.lastCompletedAt = null;
      this.recorder = new MediaRecorder(this.stream, { mimeType });
      this.recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.recorder.onstop = () => {
        this.recordingBlob = new Blob(this.chunks, { type: "video/webm" });
        if (this.recordingStartedAtMs !== null) {
          const elapsedSeconds = Math.max(0.1, (Date.now() - this.recordingStartedAtMs) / 1000);
          this.lastRecordingDurationSeconds = elapsedSeconds;
          this.recordingStartedAtMs = null;
        }
        this.lastCompletedAt = new Date();
        this.teardownStream();
        this.chunks = [];
        this.recorder = null;
        this.setStatus("ready");
        if (this.recordingBlob && this.lastCompletedAt) {
          void this.openRecordingOverlay(
            this.recordingBlob,
            this.lastCompletedAt,
            this.lastRecordingDurationSeconds ?? 0
          );
        }
      };

      const [videoTrack] = this.stream.getVideoTracks();
      if (videoTrack) {
        videoTrack.addEventListener("ended", () => {
          if (this.recorder && this.recorder.state === "recording") {
            this.stop();
          }
        }, { once: true });
      }

      this.recorder.start(1000);
      this.recordingStartedAtMs = Date.now();
      this.setStatus("recording");
    } catch (error) {
      this.teardownStream();
      this.recorder = null;
      this.chunks = [];
      this.recordingStartedAtMs = null;
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        this.setStatus("denied");
      } else {
        this.setStatus("error");
      }
    }
  }

  stop() {
    if (!this.recorder || this.recorder.state !== "recording") {
      return;
    }

    this.recorder.stop();
  }

  download() {
    if (!this.isRecordEnabled) {
      return;
    }

    if (!this.recordingBlob || !this.lastCompletedAt) {
      return;
    }

    void this.openRecordingOverlay(
      this.recordingBlob,
      this.lastCompletedAt,
      this.lastRecordingDurationSeconds ?? 0
    );
  }

  async captureSelection() {
    if (!this.isCaptureEnabled) {
      return;
    }

    if (this.status === "recording") {
      return;
    }

    let captureStream: MediaStream | null = null;

    try {
      const captureOptions: ExtendedDisplayMediaStreamOptions = {
        video: { frameRate: 30 },
        audio: false,
        selfBrowserSurface: "include",
        surfaceSwitching: "include",
        monitorTypeSurfaces: "include",
        systemAudio: "exclude"
      };

      captureStream = await navigator.mediaDevices.getDisplayMedia(captureOptions);

      const frame = await this.grabFrame(captureStream);
      this.teardownTracks(captureStream);
      await this.openCaptureOverlay(frame);
    } catch (error) {
      this.teardownTracks(captureStream);
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        this.setStatus("denied");
      } else if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.setStatus("error");
      }
    }
  }

  private readonly onRecordToggle = () => {
    if (this.status === "recording") {
      this.stop();
    } else {
      void this.start();
    }
  };

  private readonly onCaptureClick = () => {
    void this.captureSelection();
  };

  private readonly onShellPointerDown = (event: PointerEvent) => {
    if (!this.isFloatingEnabled) {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button, vaadin-button")) {
      return;
    }

    this.onDragStart(event);
  };

  private readonly onDragStart = (event: PointerEvent) => {
    const container = this.container;
    if (!container) {
      return;
    }
    event.preventDefault();
    const rect = container.getBoundingClientRect();
    this.dragPointerId = event.pointerId;
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    container.style.left = `${rect.left}px`;
    container.style.top = `${rect.top}px`;
    container.style.right = "auto";
    container.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", this.onDragMove);
    window.addEventListener("pointerup", this.onDragEnd);
  };

  private readonly onDragMove = (event: PointerEvent) => {
    const container = this.container;
    if (!container) {
      return;
    }
    if (this.dragPointerId !== event.pointerId) {
      return;
    }

    const nextLeft = event.clientX - this.dragOffsetX;
    const nextTop = event.clientY - this.dragOffsetY;
    const maxLeft = Math.max(8, window.innerWidth - container.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - container.offsetHeight - 8);

    container.style.left = `${this.clamp(nextLeft, 8, maxLeft)}px`;
    container.style.top = `${this.clamp(nextTop, 8, maxTop)}px`;
    this.positionSet = true;
  };

  private readonly onDragEnd = (event: PointerEvent) => {
    const container = this.container;
    if (!container) {
      return;
    }
    if (this.dragPointerId !== event.pointerId) {
      return;
    }

    this.dragPointerId = null;
    if (container.hasPointerCapture(event.pointerId)) {
      container.releasePointerCapture(event.pointerId);
    }
    window.removeEventListener("pointermove", this.onDragMove);
    window.removeEventListener("pointerup", this.onDragEnd);
  };

  private updateUi() {
    this.applyFloatingMode();
    this.requestUpdate();

    const container = this.container;
    if (!container) {
      return;
    }

    const indicatorColor = this.status === "recording"
      ? this.cssVar("--screen-recorder-indicator-recording-color", "#ff5f57")
      : this.status === "ready" || this.status === "downloaded"
        ? this.cssVar("--screen-recorder-indicator-ready-color", "#63d18c")
        : this.status === "error" || this.status === "denied"
          ? this.cssVar("--screen-recorder-indicator-error-color", "#ffb54d")
          : this.cssVar("--screen-recorder-indicator-idle-color", "#8ea4bc");
    container.style.setProperty("--indicator-color", indicatorColor);

    if (this.isFloatingEnabled && !this.positionSet) {
      container.style.top = this.cssVar("--screen-recorder-shell-top", "24px");
      container.style.right = this.cssVar("--screen-recorder-shell-right", "24px");
    }
  }

  private setStatus(status: RecorderStatus) {
    this.clearIdleReset();
    this.status = status;
    this.pushStatus(status);
    this.updateUi();
  }

  private teardownStream() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private buildFilename(completedAt: Date): string {
    const parts = [
      completedAt.getFullYear().toString(),
      this.pad(completedAt.getMonth() + 1),
      this.pad(completedAt.getDate())
    ];
    const time = [
      this.pad(completedAt.getHours()),
      this.pad(completedAt.getMinutes()),
      this.pad(completedAt.getSeconds())
    ].join("");
    return `recording-session-${parts.join("")}-${time}.webm`;
  }

  private statusLabel(status: RecorderStatus): string {
    switch (status) {
      case "recording":
        return "Recording";
      case "ready":
        return "Ready";
      case "downloaded":
        return "Downloaded";
      case "denied":
        return "Denied";
      case "error":
        return "Error";
      default:
        return "Idle";
    }
  }

  private pushStatus(status: RecorderStatus) {
    const host = this as unknown as { $server?: { setStatusFromClient?: (status: string) => void } };
    if (host.$server?.setStatusFromClient) {
      host.$server.setStatusFromClient(status);
    } else {
      this.setAttribute("status", status);
    }
  }

  private notifyCaptureCompleted() {
    const host = this as unknown as { $server?: { notifyCaptureCompletedFromClient?: () => void } };
    host.$server?.notifyCaptureCompletedFromClient?.();
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private pad(value: number): string {
    return value.toString().padStart(2, "0");
  }

  private cssVar(name: string, fallback: string): string {
    const value = getComputedStyle(this).getPropertyValue(name).trim();
    return value || fallback;
  }

  private scheduleIdleReset() {
    this.clearIdleReset();
    this.statusResetTimer = window.setTimeout(() => {
      this.statusResetTimer = null;
      this.setStatus("idle");
    }, 5000);
  }

  private clearIdleReset() {
    if (this.statusResetTimer !== null) {
      window.clearTimeout(this.statusResetTimer);
      this.statusResetTimer = null;
    }
  }

  private async grabFrame(stream: MediaStream): Promise<ImageBitmap> {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    try {
      await video.play();
      await new Promise<void>((resolve) => {
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          resolve();
          return;
        }
        video.addEventListener("loadeddata", () => resolve(), { once: true });
      });

      if ("ImageCapture" in window) {
        const [track] = stream.getVideoTracks();
        if (track) {
          try {
            const imageCapture = new ImageCapture(track) as ImageCapture & {
              grabFrame: () => Promise<ImageBitmap>;
            };
            return await imageCapture.grabFrame();
          } catch {
            // Fall back to canvas snapshot below.
          }
        }
      }

      const width = video.videoWidth;
      const height = video.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas context unavailable");
      }
      context.drawImage(video, 0, 0, width, height);
      return await createImageBitmap(canvas);
    } finally {
      video.pause();
      video.srcObject = null;
    }
  }

  private async openCaptureOverlay(frame: ImageBitmap): Promise<void> {
    await openCaptureOverlay(
      {
        clamp: (value, min, max) => this.clamp(value, min, max),
        closePreviewOverlay: () => this.closePreviewOverlay(),
        cssVar: (name, fallback) => this.cssVar(name, fallback),
        nextA11yId: (prefix) => this.nextA11yId(prefix),
        notifyCaptureCompleted: () => this.notifyCaptureCompleted(),
        scheduleIdleReset: () => this.scheduleIdleReset(),
        setPreviewOverlay: (overlay, cleanup) => this.setPreviewOverlay(overlay, cleanup),
        setStatus: (status) => this.setStatus(status),
        setupDialogA11y: (overlay, panel, heading, hint, onEscape, initialFocus) =>
          this.setupDialogA11y(overlay, panel, heading, hint, onEscape, initialFocus),
        timestamp: (value) => this.timestamp(value)
      },
      frame
    );
  }

  private async openRecordingOverlay(blob: Blob, completedAt: Date, estimatedDurationSeconds = 0): Promise<void> {
    await openRecordingOverlay(
      {
        buildFilename: (value) => this.buildFilename(value),
        clamp: (value, min, max) => this.clamp(value, min, max),
        closePreviewOverlay: () => this.closePreviewOverlay(),
        downloadBlob: (outputBlob, filename) => this.downloadBlob(outputBlob, filename),
        formatSeconds: (seconds) => this.formatSeconds(seconds),
        scheduleIdleReset: () => this.scheduleIdleReset(),
        setPreviewOverlay: (overlay, cleanup) => this.setPreviewOverlay(overlay, cleanup),
        setStatus: (status) => this.setStatus(status),
        setupDialogA11y: (overlay, panel, heading, hint, onEscape, initialFocus) =>
          this.setupDialogA11y(overlay, panel, heading, hint, onEscape, initialFocus),
        trimRecordingBlob: (sourceBlob, startSeconds, endSeconds) =>
          this.trimRecordingBlob(sourceBlob, startSeconds, endSeconds),
        trimRecordingFromElement: (sourceVideo, startSeconds, endSeconds, fallbackType) =>
          this.trimRecordingFromElement(sourceVideo, startSeconds, endSeconds, fallbackType)
      },
      blob,
      completedAt,
      estimatedDurationSeconds
    );
  }

  private formatSeconds(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return "0:00";
    }
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    const remainder = whole % 60;
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
  }

  private async trimRecordingBlob(blob: Blob, startSeconds: number, endSeconds: number): Promise<Blob> {
    const sourceUrl = URL.createObjectURL(blob);
    const video = document.createElement("video") as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    };
    video.src = sourceUrl;
    video.preload = "metadata";
    video.playsInline = true;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.style.position = "fixed";
    video.style.left = "-99999px";
    video.style.top = "0";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    document.body.append(video);
    video.load();

    const waitFor = (
      eventName: "loadedmetadata" | "seeked",
      isReady: () => boolean
    ) =>
      new Promise<void>((resolve, reject) => {
        if (isReady()) {
          resolve();
          return;
        }
        const onSuccess = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error(`Video ${eventName} failed`));
        };
        const cleanup = () => {
          video.removeEventListener(eventName, onSuccess);
          video.removeEventListener("error", onError);
        };
        video.addEventListener(eventName, onSuccess, { once: true });
        video.addEventListener("error", onError, { once: true });
      });

    let stream: MediaStream | null = null;
    try {
      await waitFor("loadedmetadata", () => video.readyState >= HTMLMediaElement.HAVE_METADATA);
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      if (duration <= 0) {
        throw new Error("Recording duration unavailable");
      }

      const clipStart = this.clamp(startSeconds, 0, duration);
      const clipEnd = this.clamp(endSeconds, clipStart + 0.05, duration);
      if (clipEnd - clipStart >= duration - 0.05) {
        return blob;
      }

      stream = video.captureStream?.() ?? video.mozCaptureStream?.() ?? null;
      if (!stream) {
        throw new Error("Video capture stream is not supported");
      }

      const mimeType = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm"
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      const chunks: BlobPart[] = [];
      const recordedBlob = new Promise<Blob>((resolve, reject) => {
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        });
        recorder.addEventListener("error", () => {
          reject(new Error("Failed to encode trimmed recording"));
        });
        recorder.addEventListener("stop", () => {
          const outputType = mimeType ?? blob.type ?? "video/webm";
          resolve(new Blob(chunks, { type: outputType }));
        }, { once: true });
      });

      video.currentTime = clipStart;
      await waitFor("seeked", () => Math.abs(video.currentTime - clipStart) < 0.02);
      recorder.start(100);
      try {
        await video.play();
      } catch {
        video.muted = true;
        video.defaultMuted = true;
        await video.play();
      }

      await new Promise<void>((resolve) => {
        const finish = () => {
          cleanup();
          resolve();
        };
        const checkEnd = () => {
          if (video.currentTime >= clipEnd || video.ended) {
            finish();
          } else {
            rafId = window.requestAnimationFrame(checkEnd);
          }
        };
        const onEnded = () => finish();
        const onTimeUpdate = () => {
          if (video.currentTime >= clipEnd) {
            finish();
          }
        };
        const cleanup = () => {
          video.removeEventListener("ended", onEnded);
          video.removeEventListener("timeupdate", onTimeUpdate);
          if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
          }
        };

        let rafId: number | null = window.requestAnimationFrame(checkEnd);
        video.addEventListener("ended", onEnded);
        video.addEventListener("timeupdate", onTimeUpdate);
      });

      video.pause();
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      const trimmed = await recordedBlob;
      if (trimmed.size === 0) {
        throw new Error("Trimmed recording is empty");
      }
      return trimmed;
    } finally {
      video.pause();
      video.src = "";
      video.remove();
      URL.revokeObjectURL(sourceUrl);
      stream?.getTracks().forEach((track) => track.stop());
    }
  }

  private async trimRecordingFromElement(
    sourceVideo: HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream },
    startSeconds: number,
    endSeconds: number,
    fallbackType: string
  ): Promise<Blob> {
    const waitFor = (
      eventName: "loadedmetadata" | "seeked",
      isReady: () => boolean
    ) =>
      new Promise<void>((resolve, reject) => {
        if (isReady()) {
          resolve();
          return;
        }
        const onSuccess = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error(`Video ${eventName} failed`));
        };
        const cleanup = () => {
          sourceVideo.removeEventListener(eventName, onSuccess);
          sourceVideo.removeEventListener("error", onError);
        };
        sourceVideo.addEventListener(eventName, onSuccess, { once: true });
        sourceVideo.addEventListener("error", onError, { once: true });
      });

    await waitFor("loadedmetadata", () => sourceVideo.readyState >= HTMLMediaElement.HAVE_METADATA);
    const duration = Number.isFinite(sourceVideo.duration) && sourceVideo.duration > 0
      ? sourceVideo.duration
      : (sourceVideo.seekable.length > 0 ? sourceVideo.seekable.end(sourceVideo.seekable.length - 1) : 0);
    if (duration <= 0) {
      throw new Error("Recording duration unavailable");
    }

    const clipStart = this.clamp(startSeconds, 0, duration);
    const clipEnd = this.clamp(endSeconds, clipStart + 0.05, duration);
    if (clipEnd - clipStart >= duration - 0.05) {
      throw new Error("Trim range equals full duration");
    }

    const stream = sourceVideo.captureStream?.() ?? sourceVideo.mozCaptureStream?.() ?? null;
    if (!stream) {
      throw new Error("Video capture stream is not supported");
    }

    const mimeType = [
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    const chunks: BlobPart[] = [];
    const recordedBlob = new Promise<Blob>((resolve, reject) => {
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      });
      recorder.addEventListener("error", () => {
        reject(new Error("Failed to encode trimmed recording"));
      });
      recorder.addEventListener("stop", () => {
        const outputType = mimeType ?? fallbackType ?? "video/webm";
        resolve(new Blob(chunks, { type: outputType }));
      }, { once: true });
    });

    const previousMuted = sourceVideo.muted;
    const previousVolume = sourceVideo.volume;
    sourceVideo.muted = true;
    sourceVideo.defaultMuted = true;
    sourceVideo.volume = 0;

    try {
      sourceVideo.currentTime = clipStart;
      await waitFor("seeked", () => Math.abs(sourceVideo.currentTime - clipStart) < 0.02);
      recorder.start(100);
      await sourceVideo.play();

      await new Promise<void>((resolve) => {
        const finish = () => {
          cleanup();
          resolve();
        };
        const checkEnd = () => {
          if (sourceVideo.currentTime >= clipEnd || sourceVideo.ended) {
            finish();
          } else {
            rafId = window.requestAnimationFrame(checkEnd);
          }
        };
        const onEnded = () => finish();
        const onTimeUpdate = () => {
          if (sourceVideo.currentTime >= clipEnd) {
            finish();
          }
        };
        const cleanup = () => {
          sourceVideo.removeEventListener("ended", onEnded);
          sourceVideo.removeEventListener("timeupdate", onTimeUpdate);
          if (rafId !== null) {
            window.cancelAnimationFrame(rafId);
          }
        };

        let rafId: number | null = window.requestAnimationFrame(checkEnd);
        sourceVideo.addEventListener("ended", onEnded);
        sourceVideo.addEventListener("timeupdate", onTimeUpdate);
      });

      sourceVideo.pause();
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      const trimmed = await recordedBlob;
      if (trimmed.size === 0) {
        throw new Error("Trimmed recording is empty");
      }
      return trimmed;
    } finally {
      sourceVideo.pause();
      sourceVideo.muted = previousMuted;
      sourceVideo.volume = previousVolume;
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  private setControlsVisible(visible: boolean) {
    this.toggleAttribute("overlay-open", !visible);
    const container = this.container;
    if (container) {
      container.setAttribute("aria-hidden", visible ? "false" : "true");
    }
    this.requestUpdate();
  }

  private upgradeProperty(propertyName: "recordEnabled" | "captureEnabled" | "floatingEnabled" | "statusVisible") {
    if (!Object.prototype.hasOwnProperty.call(this, propertyName)) {
      return;
    }
    const value = (this as unknown as Record<string, unknown>)[propertyName];
    delete (this as unknown as Record<string, unknown>)[propertyName];
    (this as unknown as Record<string, unknown>)[propertyName] = value;
  }

  private toBoolean(value: unknown, defaultValue: boolean): boolean {
    if (value === undefined || value === null) {
      return defaultValue;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["false", "0", "no", "off"].includes(normalized)) {
        return false;
      }
      if (["true", "1", "yes", "on"].includes(normalized)) {
        return true;
      }
    }
    if (typeof value === "number") {
      return value !== 0;
    }
    return value !== false;
  }

  private applyFloatingMode() {
    const floating = this.isFloatingEnabled;
    this.toggleAttribute("floating-disabled", !floating);
    const container = this.container;
    if (!container) {
      return;
    }
    if (floating) {
      return;
    }
    if (this.dragPointerId !== null) {
      this.dragPointerId = null;
      window.removeEventListener("pointermove", this.onDragMove);
      window.removeEventListener("pointerup", this.onDragEnd);
    }
    this.positionSet = false;
    container.style.left = "";
    container.style.top = "";
    container.style.right = "";
  }

  private nextA11yId(prefix: string): string {
    this.a11yIdCounter += 1;
    return `screen-recorder-${prefix}-${this.a11yIdCounter}`;
  }

  private getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selectors = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "a[href]",
      "[tabindex]:not([tabindex='-1'])",
      "vaadin-button:not([disabled])"
    ];
    const nodes = Array.from(container.querySelectorAll<HTMLElement>(selectors.join(",")));
    return nodes.filter((node) => {
      if (node.hidden || node.getAttribute("aria-hidden") === "true") {
        return false;
      }
      if (node.getClientRects().length === 0) {
        return false;
      }
      return node.tabIndex >= 0 || node.tagName.toLowerCase() === "vaadin-button";
    });
  }

  private setupDialogA11y(
    overlay: HTMLDivElement,
    panel: HTMLElement,
    heading: HTMLElement,
    hint: HTMLElement | null,
    onEscape: () => void,
    initialFocus: HTMLElement
  ): () => void {
    const root = this.renderRoot instanceof ShadowRoot ? this.renderRoot : this.shadowRoot;
    const previousFocus = ((root?.activeElement ?? document.activeElement) as HTMLElement | null);
    const headingId = this.nextA11yId("dialog-heading");
    heading.id = headingId;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", headingId);
    if (hint) {
      const hintId = this.nextA11yId("dialog-description");
      hint.id = hintId;
      panel.setAttribute("aria-describedby", hintId);
    }
    overlay.tabIndex = -1;

    const onOverlayKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusables = this.getFocusableElements(panel);
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = ((root?.activeElement ?? document.activeElement) as HTMLElement | null);
      if (event.shiftKey) {
        if (!active || active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (!active || active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    overlay.addEventListener("keydown", onOverlayKeyDown);
    queueMicrotask(() => initialFocus.focus());

    return () => {
      overlay.removeEventListener("keydown", onOverlayKeyDown);
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }

  private nextA11yId(prefix: string): string {
    this.a11yIdCounter += 1;
    return `screen-recorder-${prefix}-${this.a11yIdCounter}`;
  }

  private getFocusableElements(container: HTMLElement): HTMLElement[] {
    const selectors = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "a[href]",
      "[tabindex]:not([tabindex='-1'])",
      "vaadin-button:not([disabled])"
    ];
    const nodes = Array.from(container.querySelectorAll<HTMLElement>(selectors.join(",")));
    return nodes.filter((node) => {
      if (node.hidden || node.getAttribute("aria-hidden") === "true") {
        return false;
      }
      if (node.getClientRects().length === 0) {
        return false;
      }
      return node.tabIndex >= 0 || node.tagName.toLowerCase() === "vaadin-button";
    });
  }

  private setupDialogA11y(
    overlay: HTMLDivElement,
    panel: HTMLElement,
    heading: HTMLElement,
    hint: HTMLElement | null,
    onEscape: () => void,
    initialFocus: HTMLElement
  ): () => void {
    const root = this.renderRoot instanceof ShadowRoot ? this.renderRoot : this.shadowRoot;
    const previousFocus = ((root?.activeElement ?? document.activeElement) as HTMLElement | null);
    const headingId = this.nextA11yId("dialog-heading");
    heading.id = headingId;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", headingId);
    if (hint) {
      const hintId = this.nextA11yId("dialog-description");
      hint.id = hintId;
      panel.setAttribute("aria-describedby", hintId);
    }
    overlay.tabIndex = -1;

    const onOverlayKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onEscape();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusables = this.getFocusableElements(panel);
      if (focusables.length === 0) {
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = ((root?.activeElement ?? document.activeElement) as HTMLElement | null);
      if (event.shiftKey) {
        if (!active || active === first || !panel.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (!active || active === last || !panel.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    overlay.addEventListener("keydown", onOverlayKeyDown);
    queueMicrotask(() => initialFocus.focus());

    return () => {
      overlay.removeEventListener("keydown", onOverlayKeyDown);
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }

  private setPreviewOverlay(overlay: HTMLDivElement, cleanup: () => void) {
    this.closePreviewOverlay();
    this.setControlsVisible(false);
    const root = this.renderRoot ?? this.shadowRoot ?? this;
    root.append(overlay);
    this.previewOverlay = overlay;

    let cleaned = false;
    this.previewOverlayCleanup = () => {
      if (cleaned) {
        return;
      }
      cleaned = true;
      cleanup();
      overlay.remove();
      if (this.previewOverlay === overlay) {
        this.previewOverlay = null;
      }
      this.previewOverlayCleanup = null;
      this.setControlsVisible(true);
    };
  }

  private closePreviewOverlay() {
    if (this.previewOverlayCleanup) {
      this.previewOverlayCleanup();
      return;
    }

    if (this.previewOverlay) {
      this.previewOverlay.remove();
      this.previewOverlay = null;
    }
    this.setControlsVisible(true);
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  private teardownTracks(stream: MediaStream | null) {
    stream?.getTracks().forEach((track) => track.stop());
  }

  private timestamp(value: Date): string {
    return [
      value.getFullYear().toString(),
      this.pad(value.getMonth() + 1),
      this.pad(value.getDate())
    ].join("") + "-" + [
      this.pad(value.getHours()),
      this.pad(value.getMinutes()),
      this.pad(value.getSeconds())
    ].join("");
  }

}

if (!customElements.get("screen-recorder")) {
  customElements.define("screen-recorder", ScreenRecorder);
}
