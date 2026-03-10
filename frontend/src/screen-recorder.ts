type RecorderStatus = "idle" | "recording" | "ready" | "downloaded" | "denied" | "error";

class ScreenRecorder extends HTMLElement {
  private readonly shadow = this.attachShadow({ mode: "open" });
  private readonly container = document.createElement("div");
  private readonly handle = document.createElement("div");
  private readonly statusBadge = document.createElement("span");
  private readonly recordButton = document.createElement("button");
  private readonly captureButton = document.createElement("button");

  private status: RecorderStatus = "idle";
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private recordingBlob: Blob | null = null;
  private lastCompletedAt: Date | null = null;
  private statusResetTimer: number | null = null;

  private dragPointerId: number | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private positionSet = false;

  private previewOverlay: HTMLDivElement | null = null;
  private previewOverlayCleanup: (() => void) | null = null;

  declare recordEnabled: boolean;
  declare captureEnabled: boolean;

  constructor() {
    super();

    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: fixed;
        inset: auto;
        z-index: 10000;
        font-family: var(--screen-recorder-font-family, var(--lumo-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif));
        font-size: var(--screen-recorder-font-size, 14px);
        color: var(--screen-recorder-text-color, #f4f7fb);
      }

      :host([overlay-open]) [part~="shell"] {
        visibility: hidden;
        pointer-events: none;
      }

      [part~="shell"] {
        position: fixed;
        top: var(--screen-recorder-shell-top, 24px);
        right: var(--screen-recorder-shell-right, 24px);
        display: flex;
        align-items: center;
        gap: var(--screen-recorder-shell-gap, 10px);
        padding: var(--screen-recorder-shell-padding, 10px 12px);
        border-radius: var(--screen-recorder-shell-radius, 18px);
        background: var(--screen-recorder-shell-background, linear-gradient(135deg, rgba(14, 20, 28, 0.96), rgba(32, 42, 57, 0.92)));
        color: var(--screen-recorder-text-color, #f4f7fb);
        box-shadow:
          var(--screen-recorder-shell-shadow-outer, 0 18px 40px rgba(6, 11, 17, 0.26)),
          var(--screen-recorder-shell-shadow-inner, inset 0 1px 0 rgba(255, 255, 255, 0.08));
        border: var(--screen-recorder-shell-border, 1px solid rgba(255, 255, 255, 0.1));
        backdrop-filter: var(--screen-recorder-shell-backdrop-filter, blur(14px));
        user-select: none;
        cursor: grab;
        touch-action: none;
      }

      [part~="shell"]:active {
        cursor: grabbing;
      }

      [part~="handle"] {
        display: flex;
        align-items: center;
        gap: var(--screen-recorder-handle-gap, 8px);
        padding-right: var(--screen-recorder-handle-padding-right, 6px);
      }

      [part~="status-indicator"] {
        width: var(--screen-recorder-indicator-size, 10px);
        height: var(--screen-recorder-indicator-size, 10px);
        border-radius: 999px;
        background: var(--indicator-color, #8ea4bc);
        box-shadow: 0 0 var(--screen-recorder-indicator-glow-size, 12px) color-mix(in srgb, var(--indicator-color, #8ea4bc) 60%, transparent);
      }

      [part~="status-badge"] {
        min-width: 74px;
        font-size: var(--screen-recorder-status-font-size, 11px);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--screen-recorder-muted-text-color, #c8d5e3);
      }

      [part~="button"] {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: var(--screen-recorder-button-padding, 10px 14px);
        font: inherit;
        font-size: var(--screen-recorder-button-font-size, 13px);
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: transform var(--screen-recorder-transition-duration, 140ms) ease, opacity var(--screen-recorder-transition-duration, 140ms) ease, background-color var(--screen-recorder-transition-duration, 140ms) ease;
      }

      [part~="button"]:hover {
        transform: translateY(-1px);
      }

      [part~="button"]:disabled {
        cursor: not-allowed;
        opacity: 0.45;
        transform: none;
      }

      [part~="record-button"] {
        min-width: var(--screen-recorder-record-min-width, 108px);
        background: var(--screen-recorder-record-background, linear-gradient(135deg, #ff6b57, #ff2f54));
        color: var(--screen-recorder-record-color, #fff6f4);
      }

      [part~="capture-button"] {
        background: var(--screen-recorder-capture-background, linear-gradient(135deg, #ffe6a7, #ffbf5e));
        color: var(--screen-recorder-capture-color, #3c2500);
      }

      [part~="capture-overlay"] {
        position: fixed;
        inset: 0;
        z-index: 10001;
        background: var(--screen-recorder-overlay-background, rgba(4, 8, 13, 0.82));
        display: grid;
        place-items: center;
      }

      [part~="capture-panel"] {
        width: min(92vw, 1200px);
        max-height: 92vh;
        padding: var(--screen-recorder-panel-padding, 18px);
        border-radius: var(--screen-recorder-panel-radius, 24px);
        background: var(--screen-recorder-panel-background, #0c1621);
        box-shadow: var(--screen-recorder-panel-shadow, 0 24px 60px rgba(0, 0, 0, 0.45));
        border: var(--screen-recorder-panel-border, 1px solid rgba(255, 255, 255, 0.08));
        color: var(--screen-recorder-panel-text-color, #e7eef7);
        font-family: var(--screen-recorder-font-family, var(--lumo-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif));
      }

      [part~="capture-toolbar"] {
        display: flex;
        justify-content: flex-start;
        gap: 8px;
        padding: var(--screen-recorder-toolbar-padding, 6px 0 10px 0);
        margin-bottom: 8px;
        border-bottom: var(--screen-recorder-toolbar-border-bottom, 1px solid rgba(255, 255, 255, 0.08));
      }

      [part~="capture-toolbar-button"] {
        appearance: none;
        border: var(--screen-recorder-toolbar-button-border, 1px solid rgba(255, 255, 255, 0.15));
        border-radius: var(--screen-recorder-toolbar-button-radius, 8px);
        width: var(--screen-recorder-toolbar-button-size, 32px);
        height: var(--screen-recorder-toolbar-button-size, 32px);
        padding: 0;
        font: inherit;
        font-size: var(--screen-recorder-toolbar-button-font-size, 16px);
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        cursor: pointer;
        background: var(--screen-recorder-toolbar-button-background, #1a2b3d);
        color: var(--screen-recorder-toolbar-button-color, #d9e6f4);
      }

      [part~="capture-toolbar-button"]:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      [part~="capture-text-size-select"] {
        height: var(--screen-recorder-toolbar-button-size, 32px);
        min-width: 78px;
        border: var(--screen-recorder-toolbar-button-border, 1px solid rgba(255, 255, 255, 0.15));
        border-radius: var(--screen-recorder-toolbar-button-radius, 8px);
        background: var(--screen-recorder-toolbar-button-background, #1a2b3d);
        color: var(--screen-recorder-toolbar-button-color, #d9e6f4);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        padding: 0 8px;
      }

      [part~="capture-color-picker"] {
        position: relative;
        display: inline-flex;
      }

      [part~="capture-color-trigger"] {
        height: var(--screen-recorder-toolbar-button-size, 32px);
        min-width: 54px;
        border: var(--screen-recorder-toolbar-button-border, 1px solid rgba(255, 255, 255, 0.15));
        border-radius: var(--screen-recorder-toolbar-button-radius, 8px);
        background: var(--screen-recorder-toolbar-button-background, #1a2b3d);
        color: var(--screen-recorder-toolbar-button-color, #d9e6f4);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 0 8px;
        cursor: pointer;
        font: inherit;
      }

      [part~="capture-color-swatch"] {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        border: 1px solid rgba(255, 255, 255, 0.35);
      }

      [part~="capture-color-menu"] {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        display: grid;
        grid-template-columns: repeat(4, 18px);
        gap: 6px;
        padding: 8px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: #132234;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
        z-index: 3;
      }

      [part~="capture-color-menu"][hidden] {
        display: none !important;
      }

      [part~="capture-color-option"] {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        padding: 0;
        cursor: pointer;
      }

      [part~="capture-color-option"][data-selected="true"] {
        outline: 2px solid #ffffff;
        outline-offset: 1px;
      }

      [part~="capture-toolbar-button"][aria-pressed="true"] {
        background: var(--screen-recorder-toolbar-button-active-background, #355a80);
        color: var(--screen-recorder-toolbar-button-active-color, #f4f9ff);
      }

      [part~="capture-heading"] {
        font-size: var(--screen-recorder-heading-font-size, 16px);
        font-weight: 700;
        margin-bottom: 6px;
      }

      [part~="capture-hint"] {
        font-size: var(--screen-recorder-hint-font-size, 13px);
        color: var(--screen-recorder-hint-color, #9cb2ca);
        margin-bottom: 14px;
      }

      [part~="capture-preview-wrap"] {
        position: relative;
        overflow: auto;
        max-height: calc(92vh - 150px);
        border-radius: var(--screen-recorder-preview-radius, 0px);
        background: var(--screen-recorder-preview-background, #08111a);
      }

      [part~="capture-preview"] {
        display: block;
        width: 100%;
        height: auto;
        cursor: crosshair;
      }

      [part~="recording-preview"] {
        display: block;
        width: 100%;
        height: auto;
        max-height: var(--screen-recorder-recording-preview-max-height, 62vh);
        background: var(--screen-recorder-recording-preview-background, #000);
      }

      [part~="capture-selection"] {
        position: absolute;
        border: var(--screen-recorder-selection-border, 2px solid #7ed0ff);
        background: var(--screen-recorder-selection-background, rgba(126, 208, 255, 0.18));
        pointer-events: none;
        display: none;
      }

      [part~="capture-annotations"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      [part~="capture-arrow"] {
        stroke: var(--screen-recorder-arrow-color, #ff5f57);
        stroke-width: var(--screen-recorder-arrow-width, 4px);
        fill: none;
        stroke-linecap: round;
      }

      [part~="capture-arrow-head"] {
        fill: var(--screen-recorder-arrow-color, #ff5f57);
      }

      [part~="capture-text"] {
        fill: var(--screen-recorder-text-annotation-color, #ffffff);
        font-size: var(--screen-recorder-text-annotation-size, 22px);
        font-family: var(--screen-recorder-text-annotation-font-family, var(--screen-recorder-font-family, var(--lumo-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)));
        font-weight: var(--screen-recorder-text-annotation-weight, 500);
        paint-order: stroke;
        stroke: var(--screen-recorder-text-annotation-stroke-color, transparent);
        stroke-width: var(--screen-recorder-text-annotation-stroke-width, 0px);
        stroke-linejoin: round;
      }

      [part~="capture-text-editor"] {
        position: absolute;
        min-width: 140px;
        min-height: 32px;
        padding: 6px 8px;
        border: var(--screen-recorder-text-editor-dark-border, 1px dashed rgba(255, 255, 255, 0.75));
        border-radius: var(--screen-recorder-text-editor-radius, 6px);
        background: var(--screen-recorder-text-editor-dark-background, rgba(7, 14, 22, 0.78));
        color: var(--screen-recorder-text-annotation-color, #ffffff);
        font-size: var(--screen-recorder-text-annotation-size, 22px);
        font-family: var(--screen-recorder-text-annotation-font-family, var(--screen-recorder-font-family, var(--lumo-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)));
        font-weight: var(--screen-recorder-text-annotation-weight, 500);
        line-height: 1.2;
        resize: both;
        outline: none;
        z-index: 2;
      }

      [part~="capture-actions"] {
        display: flex;
        justify-content: flex-end;
        gap: var(--screen-recorder-actions-gap, 10px);
        margin-top: var(--screen-recorder-actions-margin-top, 14px);
      }

      [part~="capture-action-button"] {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: var(--screen-recorder-button-padding, 10px 14px);
        font: inherit;
        font-size: var(--screen-recorder-button-font-size, 13px);
        font-weight: 700;
        cursor: pointer;
        transition: transform var(--screen-recorder-transition-duration, 140ms) ease, opacity var(--screen-recorder-transition-duration, 140ms) ease, background-color var(--screen-recorder-transition-duration, 140ms) ease;
      }

      [part~="capture-action-button"]:hover {
        transform: translateY(-1px);
      }

      [part~="capture-action-button"]:disabled {
        cursor: not-allowed;
        opacity: 0.45;
        transform: none;
      }

      [part~="capture-cancel-button"] {
        background: var(--screen-recorder-cancel-background, #243445);
        color: var(--screen-recorder-cancel-color, #eef4fb);
      }

      [part~="capture-save-button"] {
        background: var(--screen-recorder-save-background, linear-gradient(135deg, #ffe6a7, #ffbf5e));
        color: var(--screen-recorder-save-color, #3c2500);
      }

      @media (max-width: 640px) {
        [part~="shell"] {
          gap: var(--screen-recorder-shell-gap-mobile, 8px);
          padding: var(--screen-recorder-shell-padding-mobile, 10px);
        }

        [part~="status-badge"] {
          display: none;
        }

        [part~="button"] {
          padding: var(--screen-recorder-button-padding-mobile, 10px 12px);
          font-size: var(--screen-recorder-button-font-size-mobile, 12px);
        }
      }
    `;

    const dot = document.createElement("span");
    dot.setAttribute("part", "status-indicator");
    this.handle.setAttribute("part", "handle");
    this.statusBadge.setAttribute("part", "status-badge");
    this.recordButton.setAttribute("part", "button record-button");
    this.captureButton.setAttribute("part", "button capture-button");

    this.recordButton.type = "button";
    this.captureButton.type = "button";

    this.handle.append(dot, this.statusBadge);
    this.container.setAttribute("part", "shell");
    this.container.append(this.handle, this.recordButton, this.captureButton);
    this.shadow.append(style, this.container);
  }

  connectedCallback() {
    this.setControlsVisible(true);
    this.container.addEventListener("pointerdown", this.onShellPointerDown);
    this.recordButton.addEventListener("click", this.onRecordToggle);
    this.captureButton.addEventListener("click", this.onCaptureClick);
    this.updateUi();
  }

  get isRecordEnabled(): boolean {
    return this.recordEnabled !== false;
  }

  get isCaptureEnabled(): boolean {
    return this.captureEnabled !== false;
  }

  disconnectedCallback() {
    this.container.removeEventListener("pointerdown", this.onShellPointerDown);
    window.removeEventListener("pointermove", this.onDragMove);
    window.removeEventListener("pointerup", this.onDragEnd);
    this.recordButton.removeEventListener("click", this.onRecordToggle);
    this.captureButton.removeEventListener("click", this.onCaptureClick);
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

      const captureOptions: DisplayMediaStreamOptions & {
        selfBrowserSurface?: "include" | "exclude";
        surfaceSwitching?: "include" | "exclude";
        monitorTypeSurfaces?: "include" | "exclude";
        systemAudio?: "include" | "exclude";
      } = {
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
      this.lastCompletedAt = null;
      this.recorder = new MediaRecorder(this.stream, { mimeType });
      this.recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.recorder.onstop = () => {
        this.recordingBlob = new Blob(this.chunks, { type: "video/webm" });
        this.lastCompletedAt = new Date();
        this.teardownStream();
        this.chunks = [];
        this.recorder = null;
        this.setStatus("ready");
        if (this.recordingBlob && this.lastCompletedAt) {
          void this.openRecordingOverlay(this.recordingBlob, this.lastCompletedAt);
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
      this.setStatus("recording");
    } catch (error) {
      this.teardownStream();
      this.recorder = null;
      this.chunks = [];
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

    void this.openRecordingOverlay(this.recordingBlob, this.lastCompletedAt);
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
      const captureOptions: DisplayMediaStreamOptions & {
        selfBrowserSurface?: "include" | "exclude";
        surfaceSwitching?: "include" | "exclude";
        monitorTypeSurfaces?: "include" | "exclude";
        systemAudio?: "include" | "exclude";
      } = {
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
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (target instanceof HTMLElement && target.closest("button")) {
      return;
    }

    this.onDragStart(event);
  };

  private readonly onDragStart = (event: PointerEvent) => {
    event.preventDefault();
    const rect = this.container.getBoundingClientRect();
    this.dragPointerId = event.pointerId;
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    this.container.style.left = `${rect.left}px`;
    this.container.style.top = `${rect.top}px`;
    this.container.style.right = "auto";
    this.container.setPointerCapture(event.pointerId);
    window.addEventListener("pointermove", this.onDragMove);
    window.addEventListener("pointerup", this.onDragEnd);
  };

  private readonly onDragMove = (event: PointerEvent) => {
    if (this.dragPointerId !== event.pointerId) {
      return;
    }

    const nextLeft = event.clientX - this.dragOffsetX;
    const nextTop = event.clientY - this.dragOffsetY;
    const maxLeft = Math.max(8, window.innerWidth - this.container.offsetWidth - 8);
    const maxTop = Math.max(8, window.innerHeight - this.container.offsetHeight - 8);

    this.container.style.left = `${this.clamp(nextLeft, 8, maxLeft)}px`;
    this.container.style.top = `${this.clamp(nextTop, 8, maxTop)}px`;
    this.positionSet = true;
  };

  private readonly onDragEnd = (event: PointerEvent) => {
    if (this.dragPointerId !== event.pointerId) {
      return;
    }

    this.dragPointerId = null;
    if (this.container.hasPointerCapture(event.pointerId)) {
      this.container.releasePointerCapture(event.pointerId);
    }
    window.removeEventListener("pointermove", this.onDragMove);
    window.removeEventListener("pointerup", this.onDragEnd);
  };

  private updateUi() {
    this.statusBadge.textContent = this.statusLabel(this.status);
    this.recordButton.textContent = this.status === "recording" ? "Stop" : "Record";
    this.captureButton.textContent = "Capture";
    this.recordButton.hidden = !this.isRecordEnabled;
    this.captureButton.hidden = !this.isCaptureEnabled;
    this.recordButton.disabled = !this.isRecordEnabled;
    this.captureButton.disabled = !this.isCaptureEnabled || this.status === "recording";

    const indicatorColor = this.status === "recording"
      ? this.cssVar("--screen-recorder-indicator-recording-color", "#ff5f57")
      : this.status === "ready" || this.status === "downloaded"
        ? this.cssVar("--screen-recorder-indicator-ready-color", "#63d18c")
        : this.status === "error" || this.status === "denied"
          ? this.cssVar("--screen-recorder-indicator-error-color", "#ffb54d")
          : this.cssVar("--screen-recorder-indicator-idle-color", "#8ea4bc");
    this.container.style.setProperty("--indicator-color", indicatorColor);

    if (!this.positionSet) {
      this.container.style.top = this.cssVar("--screen-recorder-shell-top", "24px");
      this.container.style.right = this.cssVar("--screen-recorder-shell-right", "24px");
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
    const overlay = document.createElement("div");
    overlay.setAttribute("part", "preview-overlay capture-overlay");

    const panel = document.createElement("div");
    panel.setAttribute("part", "preview-panel capture-panel");

    const toolbar = document.createElement("div");
    toolbar.setAttribute("part", "preview-toolbar capture-toolbar");

    const cropToggle = document.createElement("button");
    cropToggle.type = "button";
    cropToggle.textContent = "✂";
    cropToggle.setAttribute("part", "preview-toolbar-button capture-toolbar-button preview-crop-button capture-crop-button");
    cropToggle.setAttribute("aria-label", "Crop");
    cropToggle.title = "Crop";
    cropToggle.setAttribute("aria-pressed", "false");

    const arrowToggle = document.createElement("button");
    arrowToggle.type = "button";
    arrowToggle.textContent = "➤";
    arrowToggle.setAttribute("part", "preview-toolbar-button capture-toolbar-button preview-arrow-button capture-arrow-button");
    arrowToggle.setAttribute("aria-label", "Arrow");
    arrowToggle.title = "Arrow";
    arrowToggle.setAttribute("aria-pressed", "false");

    const textSizeSelect = document.createElement("select");
    textSizeSelect.setAttribute("part", "preview-text-size-select capture-text-size-select");
    textSizeSelect.setAttribute("aria-label", "Text size");
    for (const size of [14, 18, 22, 28, 36]) {
      const option = document.createElement("option");
      option.value = `${size}`;
      option.textContent = `${size}px`;
      textSizeSelect.append(option);
    }

    const paletteDefaults = [
      "#e53935", "#fb8c00", "#fdd835", "#43a047",
      "#00897b", "#00acc1", "#1e88e5", "#3949ab",
      "#8e24aa", "#d81b60", "#6d4c41", "#757575",
      "#212121", "#ffffff", "#90a4ae", "#ffb300"
    ];
    const paletteColors = paletteDefaults.map((fallback, index) => this.cssVar(`--screen-recorder-palette-${index + 1}`, fallback));
    const colorProbe = document.createElement("span");
    colorProbe.style.display = "none";
    overlay.append(colorProbe);

    let activeArrowColor = this.cssVar("--screen-recorder-arrow-color", "#ff5f57");
    let activeTextColor = this.cssVar("--screen-recorder-text-annotation-color", "#ffffff");

    const resolveRgb = (colorValue: string): { r: number; g: number; b: number } | null => {
      colorProbe.style.color = "";
      colorProbe.style.color = colorValue;
      const resolved = getComputedStyle(colorProbe).color;
      const match = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (!match) {
        return null;
      }
      return {
        r: Number.parseInt(match[1], 10),
        g: Number.parseInt(match[2], 10),
        b: Number.parseInt(match[3], 10)
      };
    };

    const shouldUseLightEditorBackground = (colorValue: string): boolean => {
      const rgb = resolveRgb(colorValue);
      if (!rgb) {
        return false;
      }
      const toLinear = (channel: number) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (0.2126 * toLinear(rgb.r)) + (0.7152 * toLinear(rgb.g)) + (0.0722 * toLinear(rgb.b));
      return luminance < 0.42;
    };

    const syncTextEditorContrast = () => {
      if (!activeTextEditor) {
        return;
      }
      const useLightBackground = shouldUseLightEditorBackground(activeTextColor);
      activeTextEditor.style.color = activeTextColor;
      activeTextEditor.style.background = useLightBackground
        ? this.cssVar("--screen-recorder-text-editor-light-background", "rgba(255, 255, 255, 0.9)")
        : this.cssVar("--screen-recorder-text-editor-dark-background", "rgba(7, 14, 22, 0.78)");
      activeTextEditor.style.border = useLightBackground
        ? this.cssVar("--screen-recorder-text-editor-light-border", "1px dashed rgba(7, 14, 22, 0.65)")
        : this.cssVar("--screen-recorder-text-editor-dark-border", "1px dashed rgba(255, 255, 255, 0.75)");
    };

    const createColorPicker = (
      label: string,
      pickerParts: string,
      getColor: () => string,
      setColor: (value: string) => void
    ) => {
      const normalizeColor = (value: string): string => {
        const probe = document.createElement("span");
        probe.style.color = value;
        return probe.style.color.replace(/\s+/g, "").toLowerCase();
      };

      const wrapper = document.createElement("div");
      wrapper.setAttribute("part", `preview-color-picker capture-color-picker ${pickerParts}`);

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.setAttribute("part", "preview-color-trigger capture-color-trigger");
      trigger.setAttribute("aria-label", `${label} color`);

      const swatch = document.createElement("span");
      swatch.setAttribute("part", "preview-color-swatch capture-color-swatch");
      const caret = document.createElement("span");
      caret.textContent = "▾";
      trigger.append(swatch, caret);

      const menu = document.createElement("div");
      menu.setAttribute("part", "preview-color-menu capture-color-menu");
      menu.hidden = true;

      const options: HTMLButtonElement[] = [];
      for (const color of paletteColors) {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("part", "preview-color-option capture-color-option");
        option.dataset.color = normalizeColor(color);
        option.style.background = color;
        option.addEventListener("click", () => {
          setColor(color);
          sync();
          menu.hidden = true;
        });
        options.push(option);
        menu.append(option);
      }

      const sync = () => {
        const current = normalizeColor(getColor());
        swatch.style.background = getColor();
        for (const option of options) {
          option.dataset.selected = option.dataset.color === current ? "true" : "false";
        }
      };
      sync();

      wrapper.append(trigger, menu);
      return { wrapper, menu, trigger, sync };
    };

    const arrowColorPicker = createColorPicker(
      "Arrow",
      "preview-arrow-color-picker capture-arrow-color-picker",
      () => activeArrowColor,
      (value) => {
        activeArrowColor = value;
      }
    );

    const textColorPicker = createColorPicker(
      "Text",
      "preview-text-color-picker capture-text-color-picker",
      () => activeTextColor,
      (value) => {
        activeTextColor = value;
        syncTextEditorContrast();
      }
    );

    const closeColorMenus = () => {
      arrowColorPicker.menu.hidden = true;
      textColorPicker.menu.hidden = true;
    };

    const onColorTriggerClick = (menu: HTMLDivElement) => {
      const shouldOpen = menu.hidden;
      closeColorMenus();
      if (shouldOpen) {
        menu.hidden = false;
      }
    };

    const onArrowColorTriggerClick = () => onColorTriggerClick(arrowColorPicker.menu);
    const onTextColorTriggerClick = () => onColorTriggerClick(textColorPicker.menu);
    arrowColorPicker.trigger.addEventListener("click", onArrowColorTriggerClick);
    textColorPicker.trigger.addEventListener("click", onTextColorTriggerClick);

    const undoButton = document.createElement("button");
    undoButton.type = "button";
    undoButton.textContent = "↶";
    undoButton.setAttribute("part", "preview-toolbar-button capture-toolbar-button preview-undo-button capture-undo-button");
    undoButton.setAttribute("aria-label", "Undo");
    undoButton.title = "Undo";
    undoButton.disabled = true;

    const textToggle = document.createElement("button");
    textToggle.type = "button";
    textToggle.textContent = "T";
    textToggle.setAttribute("part", "preview-toolbar-button capture-toolbar-button preview-text-button capture-text-button");
    textToggle.setAttribute("aria-label", "Text");
    textToggle.title = "Text";
    textToggle.setAttribute("aria-pressed", "false");
    toolbar.append(
      cropToggle,
      arrowToggle,
      arrowColorPicker.wrapper,
      textToggle,
      textColorPicker.wrapper,
      textSizeSelect,
      undoButton
    );

    const heading = document.createElement("div");
    heading.textContent = "Capture preview";
    heading.setAttribute("part", "preview-heading capture-heading");

    const hint = document.createElement("div");
    hint.textContent = "Use Crop, Arrow, or Text. In Text mode, click to place or drag to size a text box.";
    hint.setAttribute("part", "preview-hint capture-hint");

    const previewWrap = document.createElement("div");
    previewWrap.setAttribute("part", "preview-content-wrap capture-preview-wrap");

    const canvas = document.createElement("canvas");
    const maxWidth = Math.min(window.innerWidth * 0.9, 1160);
    const maxHeight = Math.min(window.innerHeight * 0.64, 720);
    const scale = Math.min(maxWidth / frame.width, maxHeight / frame.height, 1);
    canvas.width = Math.max(1, Math.round(frame.width * scale));
    canvas.height = Math.max(1, Math.round(frame.height * scale));
    canvas.setAttribute("part", "preview-media capture-preview");

    const context = canvas.getContext("2d");
    if (!context) {
      frame.close();
      throw new Error("Canvas context unavailable");
    }
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);

    const selection = document.createElement("div");
    selection.setAttribute("part", "preview-selection capture-selection");

    const annotations = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    annotations.setAttribute("part", "preview-annotations capture-annotations");
    annotations.setAttribute("aria-hidden", "true");
    const arrowsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const textsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    annotations.append(arrowsLayer, textsLayer);

    previewWrap.append(canvas, annotations, selection);

    const actions = document.createElement("div");
    actions.setAttribute("part", "preview-actions capture-actions");

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.setAttribute("part", "preview-action-button capture-action-button preview-cancel-button capture-cancel-button");

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save capture";
    save.setAttribute("part", "preview-action-button capture-action-button preview-save-button capture-save-button");

    actions.append(cancel, save);
    panel.append(heading, toolbar, hint, previewWrap, actions);
    overlay.append(panel);

    type Arrow = { x1: number; y1: number; x2: number; y2: number; color: string };
    type TextAnnotation = { x: number; y: number; text: string; sizePx: number; color: string };
    type EditAction = { type: "arrow" } | { type: "text" } | { type: "crop"; previousRect: { x: number; y: number; width: number; height: number } };
    const rect = { x: 0, y: 0, width: 0, height: 0 };
    const arrows: Arrow[] = [];
    const texts: TextAnnotation[] = [];
    const history: EditAction[] = [];
    let activeTextEditor: HTMLTextAreaElement | null = null;
    let activeTextOrigin: { x: number; y: number } | null = null;
    let textCommitInProgress = false;
    let textPlacing = false;
    let textStartX = 0;
    let textStartY = 0;
    let draftArrow: Arrow | null = null;
    let activeTool: "crop" | "arrow" | "text" | null = null;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let cropStartRect = { x: 0, y: 0, width: 0, height: 0 };
    let activeTextSize = Number.parseFloat(this.cssVar("--screen-recorder-text-annotation-size", "22")) || 22;
    textSizeSelect.value = `${Math.round(activeTextSize)}`;
    if (!textSizeSelect.value) {
      textSizeSelect.value = "22";
      activeTextSize = 22;
    }

    const hasValidCrop = () => rect.width >= 2 && rect.height >= 2;
    const hasVisibleArrow = (arrow: Arrow) => Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1) >= 6;
    const arrowHeadPoints = (arrow: Arrow): string => {
      const angle = Math.atan2(arrow.y2 - arrow.y1, arrow.x2 - arrow.x1);
      const headLength = 18;
      const headWidth = 6;
      const leftX = arrow.x2 - headLength * Math.cos(angle) + headWidth * Math.sin(angle);
      const leftY = arrow.y2 - headLength * Math.sin(angle) - headWidth * Math.cos(angle);
      const rightX = arrow.x2 - headLength * Math.cos(angle) - headWidth * Math.sin(angle);
      const rightY = arrow.y2 - headLength * Math.sin(angle) + headWidth * Math.cos(angle);
      return `${arrow.x2},${arrow.y2} ${leftX},${leftY} ${rightX},${rightY}`;
    };

    const renderArrows = () => {
      const bounds = canvas.getBoundingClientRect();
      annotations.setAttribute("viewBox", `0 0 ${Math.max(bounds.width, 1)} ${Math.max(bounds.height, 1)}`);
      arrowsLayer.replaceChildren();

      for (const arrow of [...arrows, ...(draftArrow ? [draftArrow] : [])]) {
        if (!hasVisibleArrow(arrow)) {
          continue;
        }
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("part", "preview-arrow capture-arrow");
        line.setAttribute("x1", `${arrow.x1}`);
        line.setAttribute("y1", `${arrow.y1}`);
        line.setAttribute("x2", `${arrow.x2}`);
        line.setAttribute("y2", `${arrow.y2}`);
        line.style.stroke = arrow.color;

        const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        head.setAttribute("part", "preview-arrow-head capture-arrow-head");
        head.setAttribute("points", arrowHeadPoints(arrow));
        head.style.fill = arrow.color;

        arrowsLayer.append(line, head);
      }
    };

    const renderTexts = () => {
      textsLayer.replaceChildren();
      for (const annotation of texts) {
        const lineHeight = annotation.sizePx * 1.2;
        const lines = annotation.text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
          const textNode = document.createElementNS("http://www.w3.org/2000/svg", "text");
          textNode.setAttribute("part", "preview-text capture-text");
          textNode.setAttribute("x", `${annotation.x}`);
          textNode.setAttribute("y", `${annotation.y + (i * lineHeight)}`);
          textNode.setAttribute("dominant-baseline", "hanging");
          textNode.setAttribute("style", `font-size:${annotation.sizePx}px;fill:${annotation.color}`);
          textNode.textContent = lines[i] || " ";
          textsLayer.append(textNode);
        }
      }
    };

    const rectEquals = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
      a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

    const updateUndoState = () => {
      undoButton.disabled = history.length === 0;
    };

    const removeTextEditor = () => {
      if (activeTextEditor) {
        activeTextEditor.remove();
      }
      activeTextEditor = null;
      activeTextOrigin = null;
    };

    const commitTextEditor = () => {
      if (!activeTextEditor || !activeTextOrigin || textCommitInProgress) {
        return;
      }
      textCommitInProgress = true;
      const text = activeTextEditor.value.trim();
      const origin = activeTextOrigin;
      if (text) {
        texts.push({ x: origin.x, y: origin.y, text, sizePx: activeTextSize, color: activeTextColor });
        history.push({ type: "text" });
        updateUndoState();
        renderTexts();
      }
      removeTextEditor();
      textCommitInProgress = false;
    };

    const startTextEditor = (x: number, y: number, width = 160, height = 42) => {
      commitTextEditor();
      const editor = document.createElement("textarea");
      editor.setAttribute("part", "preview-text-editor capture-text-editor");
      editor.style.left = `${x}px`;
      editor.style.top = `${y}px`;
      editor.style.width = `${Math.max(140, width)}px`;
      editor.style.height = `${Math.max(32, height)}px`;
      editor.style.fontSize = `${activeTextSize}px`;
      editor.placeholder = "Type text";
      previewWrap.append(editor);
      activeTextEditor = editor;
      activeTextOrigin = { x, y };
      syncTextEditorContrast();

      editor.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          commitTextEditor();
        } else if (event.key === "Escape") {
          event.preventDefault();
          removeTextEditor();
        }
      });
      editor.addEventListener("blur", () => {
        commitTextEditor();
      });
    };

    const setTool = (tool: "crop" | "arrow" | "text" | null) => {
      activeTool = tool;
      cropToggle.setAttribute("aria-pressed", tool === "crop" ? "true" : "false");
      arrowToggle.setAttribute("aria-pressed", tool === "arrow" ? "true" : "false");
      textToggle.setAttribute("aria-pressed", tool === "text" ? "true" : "false");
      canvas.style.cursor = tool === "text" ? "text" : "crosshair";
      if (tool !== "crop") {
        rect.x = 0;
        rect.y = 0;
        rect.width = 0;
        rect.height = 0;
      }
      if (tool !== "arrow") {
        draftArrow = null;
      }
      if (tool !== "text") {
        commitTextEditor();
      }
      redrawSelection();
      renderArrows();
    };

    const redrawSelection = () => {
      if (activeTool !== "crop" || !hasValidCrop()) {
        selection.style.display = "none";
        return;
      }
      selection.style.display = "block";
      selection.style.left = `${rect.x}px`;
      selection.style.top = `${rect.y}px`;
      selection.style.width = `${rect.width}px`;
      selection.style.height = `${rect.height}px`;
    };

    const getPoint = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: this.clamp(event.clientX - bounds.left, 0, bounds.width),
        y: this.clamp(event.clientY - bounds.top, 0, bounds.height)
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      if (!activeTool) {
        return;
      }
      const point = getPoint(event);
      if (activeTool === "crop") {
        dragging = true;
        cropStartRect = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        startX = point.x;
        startY = point.y;
        rect.x = point.x;
        rect.y = point.y;
        rect.width = 0;
        rect.height = 0;
        redrawSelection();
        canvas.setPointerCapture(event.pointerId);
      } else if (activeTool === "arrow") {
        dragging = true;
        draftArrow = { x1: point.x, y1: point.y, x2: point.x, y2: point.y, color: activeArrowColor };
        renderArrows();
        canvas.setPointerCapture(event.pointerId);
      } else {
        dragging = true;
        textPlacing = true;
        textStartX = point.x;
        textStartY = point.y;
        startTextEditor(point.x, point.y, 160, 42);
        canvas.setPointerCapture(event.pointerId);
      }
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!activeTool || !dragging) {
        return;
      }
      const point = getPoint(event);
      if (activeTool === "crop") {
        rect.x = Math.min(startX, point.x);
        rect.y = Math.min(startY, point.y);
        rect.width = Math.abs(point.x - startX);
        rect.height = Math.abs(point.y - startY);
        redrawSelection();
      } else if (activeTool === "arrow" && draftArrow) {
        draftArrow.x2 = point.x;
        draftArrow.y2 = point.y;
        renderArrows();
      } else if (activeTool === "text" && textPlacing && activeTextEditor) {
        const nextLeft = Math.min(textStartX, point.x);
        const nextTop = Math.min(textStartY, point.y);
        const nextWidth = Math.max(140, Math.abs(point.x - textStartX));
        const nextHeight = Math.max(32, Math.abs(point.y - textStartY));
        activeTextEditor.style.left = `${nextLeft}px`;
        activeTextEditor.style.top = `${nextTop}px`;
        activeTextEditor.style.width = `${nextWidth}px`;
        activeTextEditor.style.height = `${nextHeight}px`;
        activeTextOrigin = { x: nextLeft, y: nextTop };
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!activeTool) {
        return;
      }
      dragging = false;
      if (activeTool === "arrow" && draftArrow) {
        if (hasVisibleArrow(draftArrow)) {
          arrows.push({ ...draftArrow });
          history.push({ type: "arrow" });
          updateUndoState();
        }
        draftArrow = null;
        renderArrows();
      } else if (activeTool === "text" && textPlacing) {
        textPlacing = false;
        activeTextEditor?.focus();
      } else if (activeTool === "crop") {
        if (!rectEquals(rect, cropStartRect)) {
          history.push({ type: "crop", previousRect: cropStartRect });
          updateUndoState();
        }
      }
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const onCropToggle = () => {
      setTool(activeTool === "crop" ? null : "crop");
    };

    const onArrowToggle = () => {
      setTool(activeTool === "arrow" ? null : "arrow");
    };

    const onTextToggle = () => {
      setTool(activeTool === "text" ? null : "text");
    };

    const onUndo = () => {
      const action = history.pop();
      if (!action) {
        updateUndoState();
        return;
      }

      if (action.type === "arrow") {
        arrows.pop();
        renderArrows();
      } else if (action.type === "text") {
        texts.pop();
        renderTexts();
      } else {
        rect.x = action.previousRect.x;
        rect.y = action.previousRect.y;
        rect.width = action.previousRect.width;
        rect.height = action.previousRect.height;
        redrawSelection();
      }

      updateUndoState();
    };

    const onTextSizeChange = () => {
      const selected = Number.parseFloat(textSizeSelect.value);
      if (!Number.isFinite(selected) || selected <= 0) {
        return;
      }
      activeTextSize = selected;
      if (activeTextEditor) {
        activeTextEditor.style.fontSize = `${activeTextSize}px`;
      }
    };

    const onOverlayPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        closeColorMenus();
        return;
      }
      if (!arrowColorPicker.wrapper.contains(target) && !textColorPicker.wrapper.contains(target)) {
        closeColorMenus();
      }
    };

    const closeOverlay = () => {
      this.closePreviewOverlay();
    };

    const onCancel = () => {
      closeOverlay();
    };

    const onSave = async () => {
      commitTextEditor();
      const output = document.createElement("canvas");
      const previewBounds = canvas.getBoundingClientRect();
      const ratioX = frame.width / previewBounds.width;
      const ratioY = frame.height / previewBounds.height;
      const useCrop = activeTool === "crop" && hasValidCrop();
      const sourceX = useCrop ? Math.round(rect.x * ratioX) : 0;
      const sourceY = useCrop ? Math.round(rect.y * ratioY) : 0;
      const sourceWidth = useCrop ? Math.max(1, Math.round(rect.width * ratioX)) : frame.width;
      const sourceHeight = useCrop ? Math.max(1, Math.round(rect.height * ratioY)) : frame.height;
      output.width = sourceWidth;
      output.height = sourceHeight;
      const outputContext = output.getContext("2d");
      if (!outputContext) {
        this.setStatus("error");
        closeOverlay();
        return;
      }

      outputContext.drawImage(
        frame,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        0,
        0,
        output.width,
        output.height
      );

      const arrowWidth = Number.parseFloat(this.cssVar("--screen-recorder-arrow-width", "4")) || 4;
      for (const arrow of arrows) {
        const ax1 = Math.round(arrow.x1 * ratioX) - sourceX;
        const ay1 = Math.round(arrow.y1 * ratioY) - sourceY;
        const ax2 = Math.round(arrow.x2 * ratioX) - sourceX;
        const ay2 = Math.round(arrow.y2 * ratioY) - sourceY;
        const lineWidth = Math.max(2, Math.round(arrowWidth * ((ratioX + ratioY) / 2)));
        const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
        const headLength = Math.max(12, lineWidth * 3.4);
        const headWidth = Math.max(4, lineWidth * 1.3);
        const leftX = ax2 - headLength * Math.cos(angle) + headWidth * Math.sin(angle);
        const leftY = ay2 - headLength * Math.sin(angle) - headWidth * Math.cos(angle);
        const rightX = ax2 - headLength * Math.cos(angle) - headWidth * Math.sin(angle);
        const rightY = ay2 - headLength * Math.sin(angle) + headWidth * Math.cos(angle);

        outputContext.save();
        outputContext.strokeStyle = arrow.color;
        outputContext.lineWidth = lineWidth;
        outputContext.lineCap = "round";
        outputContext.beginPath();
        outputContext.moveTo(ax1, ay1);
        outputContext.lineTo(ax2, ay2);
        outputContext.stroke();
        outputContext.fillStyle = arrow.color;
        outputContext.beginPath();
        outputContext.moveTo(ax2, ay2);
        outputContext.lineTo(leftX, leftY);
        outputContext.lineTo(rightX, rightY);
        outputContext.closePath();
        outputContext.fill();
        outputContext.restore();
      }

      const textWeight = this.cssVar("--screen-recorder-text-annotation-weight", "700");
      const textFontFamily = this.cssVar("--screen-recorder-text-annotation-font-family", this.cssVar("--screen-recorder-font-family", "sans-serif"));
      const textStrokeColor = this.cssVar("--screen-recorder-text-annotation-stroke-color", "transparent");
      const parsedTextStrokeWidth = Number.parseFloat(this.cssVar("--screen-recorder-text-annotation-stroke-width", "0"));
      const textStrokeWidth = Number.isFinite(parsedTextStrokeWidth) ? parsedTextStrokeWidth : 0;
      const textLineHeight = 1.2;
      for (const annotation of texts) {
        const lines = annotation.text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
          const tx = Math.round(annotation.x * ratioX) - sourceX;
          const scaledSize = Math.max(10, Math.round(annotation.sizePx * ((ratioX + ratioY) / 2)));
          const ty = Math.round(annotation.y * ratioY) - sourceY + (i * scaledSize * textLineHeight);
          outputContext.save();
          outputContext.font = `${textWeight} ${scaledSize}px ${textFontFamily}`;
          outputContext.textBaseline = "top";
          outputContext.lineJoin = "round";
          outputContext.fillStyle = annotation.color;
          const scaledStrokeWidth = Math.max(0, textStrokeWidth * ((ratioX + ratioY) / 2));
          if (scaledStrokeWidth > 0) {
            outputContext.strokeStyle = textStrokeColor;
            outputContext.lineWidth = scaledStrokeWidth;
            outputContext.strokeText(lines[i] || " ", tx, ty);
          }
          outputContext.fillText(lines[i] || " ", tx, ty);
          outputContext.restore();
        }
      }

      const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
      if (!blob) {
        this.setStatus("error");
        closeOverlay();
        return;
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `capture-session-${this.timestamp(new Date())}.png`;
      anchor.style.display = "none";
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      this.notifyCaptureCompleted();
      this.setStatus("downloaded");
      this.scheduleIdleReset();
      closeOverlay();
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    cropToggle.addEventListener("click", onCropToggle);
    arrowToggle.addEventListener("click", onArrowToggle);
    textToggle.addEventListener("click", onTextToggle);
    textSizeSelect.addEventListener("change", onTextSizeChange);
    undoButton.addEventListener("click", onUndo);
    cancel.addEventListener("click", onCancel);
    save.addEventListener("click", onSave);
    overlay.addEventListener("pointerdown", onOverlayPointerDown);

    this.setPreviewOverlay(overlay, () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      cropToggle.removeEventListener("click", onCropToggle);
      arrowToggle.removeEventListener("click", onArrowToggle);
      textToggle.removeEventListener("click", onTextToggle);
      textSizeSelect.removeEventListener("change", onTextSizeChange);
      arrowColorPicker.trigger.removeEventListener("click", onArrowColorTriggerClick);
      textColorPicker.trigger.removeEventListener("click", onTextColorTriggerClick);
      undoButton.removeEventListener("click", onUndo);
      cancel.removeEventListener("click", onCancel);
      save.removeEventListener("click", onSave);
      overlay.removeEventListener("pointerdown", onOverlayPointerDown);
      removeTextEditor();
      frame.close();
    });
  }

  private async openRecordingOverlay(blob: Blob, completedAt: Date): Promise<void> {
    const overlay = document.createElement("div");
    overlay.setAttribute("part", "preview-overlay capture-overlay");

    const panel = document.createElement("div");
    panel.setAttribute("part", "preview-panel capture-panel");

    const heading = document.createElement("div");
    heading.textContent = "Recording preview";
    heading.setAttribute("part", "preview-heading capture-heading");

    const hint = document.createElement("div");
    hint.textContent = "Review the recording, then save it.";
    hint.setAttribute("part", "preview-hint capture-hint");

    const previewWrap = document.createElement("div");
    previewWrap.setAttribute("part", "preview-content-wrap capture-preview-wrap");

    const video = document.createElement("video");
    video.controls = true;
    video.setAttribute("part", "preview-media recording-preview");
    const url = URL.createObjectURL(blob);
    video.src = url;
    video.preload = "metadata";

    previewWrap.append(video);

    const actions = document.createElement("div");
    actions.setAttribute("part", "preview-actions capture-actions");

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.setAttribute("part", "preview-action-button capture-action-button preview-cancel-button capture-cancel-button");

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save recording";
    save.setAttribute("part", "preview-action-button capture-action-button preview-save-button capture-save-button");

    actions.append(cancel, save);
    panel.append(heading, hint, previewWrap, actions);
    overlay.append(panel);

    const closeOverlay = () => {
      this.closePreviewOverlay();
    };

    const onCancel = () => {
      closeOverlay();
    };

    const onSave = () => {
      this.downloadBlob(blob, this.buildFilename(completedAt));
      this.setStatus("downloaded");
      this.scheduleIdleReset();
      closeOverlay();
    };

    cancel.addEventListener("click", onCancel);
    save.addEventListener("click", onSave);

    this.setPreviewOverlay(overlay, () => {
      cancel.removeEventListener("click", onCancel);
      save.removeEventListener("click", onSave);
      video.pause();
      video.src = "";
      URL.revokeObjectURL(url);
    });

    try {
      await video.play();
    } catch {
      // User gesture policy may block autoplay. Controls remain available.
    }
  }

  private setControlsVisible(visible: boolean) {
    this.toggleAttribute("overlay-open", !visible);
    this.container.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  private setPreviewOverlay(overlay: HTMLDivElement, cleanup: () => void) {
    this.closePreviewOverlay();
    this.setControlsVisible(false);
    this.shadow.append(overlay);
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

customElements.define("screen-recorder", ScreenRecorder);
