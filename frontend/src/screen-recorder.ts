import "@vaadin/button";

type RecorderStatus = "idle" | "recording" | "ready" | "downloaded" | "denied" | "error";
type VaadinButtonElement = HTMLElement & { disabled: boolean };

class ScreenRecorder extends HTMLElement {
  private readonly shadow = this.attachShadow({ mode: "open" });
  private readonly container = document.createElement("div");
  private readonly handle = document.createElement("div");
  private readonly statusBadge = document.createElement("span");
  private readonly recordButton = document.createElement("vaadin-button") as VaadinButtonElement;
  private readonly captureButton = document.createElement("vaadin-button") as VaadinButtonElement;

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

      vaadin-button[part~="button"]::part(button) {
        border: 0;
        border-radius: 999px;
        padding: var(--screen-recorder-button-padding, 10px 14px);
        font: inherit;
        font-size: var(--screen-recorder-button-font-size, 13px);
        font-weight: 700;
        letter-spacing: 0.02em;
        min-width: 0;
        margin: 0;
        line-height: 1.1;
      }

      vaadin-button[part~="button"]::part(label) {
        margin: 0;
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

      [part~="preview-overlay"] {
        position: fixed;
        inset: 0;
        z-index: 10001;
        background: var(--screen-recorder-overlay-background, rgba(4, 8, 13, 0.82));
        display: grid;
        place-items: center;
      }

      [part~="preview-panel"] {
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

      [part~="preview-toolbar"] {
        display: flex;
        justify-content: flex-start;
        gap: 8px;
        padding: var(--screen-recorder-toolbar-padding, 6px 0 10px 0);
        margin-bottom: 8px;
        border-bottom: var(--screen-recorder-toolbar-border-bottom, 1px solid rgba(255, 255, 255, 0.08));
      }

      [part~="preview-toolbar-button"] {
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

      vaadin-button[part~="capture-toolbar-button"]::part(button) {
        border: var(--screen-recorder-toolbar-button-border, 1px solid rgba(255, 255, 255, 0.15));
        border-radius: var(--screen-recorder-toolbar-button-radius, 8px);
        width: var(--screen-recorder-toolbar-button-size, 32px);
        min-width: var(--screen-recorder-toolbar-button-size, 32px);
        height: var(--screen-recorder-toolbar-button-size, 32px);
        padding: 0;
        margin: 0;
        font: inherit;
        font-size: var(--screen-recorder-toolbar-button-font-size, 16px);
        font-weight: 700;
        line-height: 1;
        background: var(--screen-recorder-toolbar-button-background, #1a2b3d);
        color: var(--screen-recorder-toolbar-button-color, #d9e6f4);
      }

      vaadin-button[part~="capture-toolbar-button"]::part(label) {
        margin: 0;
      }

      [part~="capture-toolbar-button"]:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      [part~="preview-text-size-select"] {
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

      [part~="preview-color-picker"] {
        position: relative;
        display: inline-flex;
      }

      [part~="preview-color-trigger"] {
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

      vaadin-button[part~="preview-color-trigger"]::part(button) {
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
        margin: 0;
        font: inherit;
        min-height: 0;
      }

      vaadin-button[part~="preview-color-trigger"]::part(label) {
        margin: 0;
      }

      [part~="preview-color-swatch"] {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        border: 1px solid rgba(255, 255, 255, 0.35);
      }

      [part~="preview-color-menu"] {
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

      [part~="preview-color-menu"][hidden] {
        display: none !important;
      }

      [part~="preview-color-option"] {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        padding: 0;
        cursor: pointer;
      }

      [part~="preview-color-option"][data-selected="true"] {
        outline: 2px solid #ffffff;
        outline-offset: 1px;
      }

      [part~="preview-trim-editor"] {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1 1 auto;
        min-width: 0;
      }

      [part~="preview-trim-slider-wrap"] {
        position: relative;
        height: 28px;
        flex: 1 1 auto;
        min-width: 160px;
      }

      [part~="preview-trim-track"] {
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        height: 4px;
        border-radius: 999px;
        background: var(--screen-recorder-trim-track-background, rgba(255, 255, 255, 0.24));
      }

      [part~="preview-trim-active"] {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        height: 4px;
        border-radius: 999px;
        background: var(--screen-recorder-trim-accent-color, #7ec8ff);
      }

      [part~="preview-trim-handle"] {
        position: absolute;
        top: 50%;
        width: 14px;
        height: 14px;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.75);
        background: #eef6ff;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
        padding: 0;
        cursor: ew-resize;
        z-index: 4;
      }

      [part~="preview-trim-handle"]:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      [part~="capture-trim-time"] {
        width: 52px;
        text-align: right;
        font-size: 12px;
        color: var(--screen-recorder-panel-text-color, #e7eef7);
        font-variant-numeric: tabular-nums;
      }

      [part~="preview-toolbar-button"][aria-pressed="true"] {
        background: var(--screen-recorder-toolbar-button-active-background, #355a80);
        color: var(--screen-recorder-toolbar-button-active-color, #f4f9ff);
      }

      [part~="preview-heading"] {
        font-size: var(--screen-recorder-heading-font-size, 16px);
        font-weight: 700;
        margin-bottom: 6px;
      }

      [part~="preview-hint"] {
        font-size: var(--screen-recorder-hint-font-size, 13px);
        color: var(--screen-recorder-hint-color, #9cb2ca);
        margin-bottom: 14px;
      }

      [part~="preview-save-notice"] {
        display: none;
        margin-top: 8px;
        font-size: 12px;
        color: var(--screen-recorder-save-notice-color, #9edbb4);
      }

      [part~="preview-content-wrap"] {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        overflow: auto;
        max-height: calc(92vh - 150px);
        border-radius: var(--screen-recorder-preview-radius, 0px);
        background: var(--screen-recorder-preview-background, #08111a);
      }

      [part~="preview-stage"] {
        position: relative;
        flex: 0 0 auto;
      }

      [part~="preview-media"] {
        display: block;
        width: auto;
        max-width: 100%;
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

      [part~="preview-selection"] {
        position: absolute;
        border: var(--screen-recorder-selection-border, 2px solid #7ed0ff);
        background: var(--screen-recorder-selection-background, rgba(126, 208, 255, 0.18));
        pointer-events: none;
        display: none;
      }

      [part~="preview-annotations"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      [part~="preview-arrow"] {
        stroke: var(--screen-recorder-arrow-color, #ff5f57);
        stroke-width: var(--screen-recorder-arrow-width, 4px);
        fill: none;
        stroke-linecap: round;
      }

      [part~="preview-arrow-head"] {
        fill: var(--screen-recorder-arrow-color, #ff5f57);
      }

      [part~="preview-text"] {
        fill: var(--screen-recorder-text-annotation-color, #ffffff);
        font-size: var(--screen-recorder-text-annotation-size, 22px);
        font-family: var(--screen-recorder-text-annotation-font-family, var(--screen-recorder-font-family, var(--lumo-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)));
        font-weight: var(--screen-recorder-text-annotation-weight, 500);
        paint-order: stroke;
        stroke: var(--screen-recorder-text-annotation-stroke-color, transparent);
        stroke-width: var(--screen-recorder-text-annotation-stroke-width, 0px);
        stroke-linejoin: round;
      }

      [part~="preview-text-editor"] {
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

      [part~="preview-actions"] {
        display: flex;
        justify-content: flex-end;
        gap: var(--screen-recorder-actions-gap, 10px);
        margin-top: var(--screen-recorder-actions-margin-top, 14px);
      }

      [part~="preview-action-button"] {
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

      vaadin-button[part~="capture-action-button"]::part(button) {
        border: 0;
        border-radius: 999px;
        padding: var(--screen-recorder-button-padding, 10px 14px);
        margin: 0;
        min-width: 0;
        font: inherit;
        font-size: var(--screen-recorder-button-font-size, 13px);
        font-weight: 700;
        line-height: 1.1;
      }

      vaadin-button[part~="capture-action-button"]::part(label) {
        margin: 0;
      }

      [part~="capture-action-button"]:hover {
        transform: translateY(-1px);
      }

      [part~="preview-action-button"]:disabled {
        cursor: not-allowed;
        opacity: 0.45;
        transform: none;
      }

      [part~="preview-cancel-button"] {
        background: var(--screen-recorder-cancel-background, #243445);
        color: var(--screen-recorder-cancel-color, #eef4fb);
      }

      [part~="preview-save-button"] {
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
    if (target instanceof HTMLElement && target.closest("button, vaadin-button")) {
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
    overlay.setAttribute("part", "preview-overlay");

    const panel = document.createElement("div");
    panel.setAttribute("part", "preview-panel");

    const toolbar = document.createElement("div");
    toolbar.setAttribute("part", "preview-toolbar");

    const cropToggle = document.createElement("vaadin-button") as VaadinButtonElement;
    cropToggle.textContent = "✂";
    cropToggle.setAttribute("part", "preview-toolbar-button preview-crop-button");
    cropToggle.setAttribute("aria-label", "Crop");
    cropToggle.title = "Crop";
    cropToggle.setAttribute("aria-pressed", "false");

    const arrowToggle = document.createElement("vaadin-button") as VaadinButtonElement;
    arrowToggle.textContent = "➤";
    arrowToggle.setAttribute("part", "preview-toolbar-button preview-arrow-button");
    arrowToggle.setAttribute("aria-label", "Arrow");
    arrowToggle.title = "Arrow";
    arrowToggle.setAttribute("aria-pressed", "false");

    const textSizeSelect = document.createElement("select");
    textSizeSelect.setAttribute("part", "preview-text-size-select");
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
      wrapper.setAttribute("part", `preview-color-picker ${pickerParts}`);

      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.setAttribute("part", "preview-color-trigger");
      trigger.setAttribute("aria-label", `${label} color`);

      const swatch = document.createElement("span");
      swatch.setAttribute("part", "preview-color-swatch");
      const caret = document.createElement("span");
      caret.textContent = "▾";
      trigger.append(swatch, caret);

      const menu = document.createElement("div");
      menu.setAttribute("part", "preview-color-menu");
      menu.hidden = true;

      const options: HTMLButtonElement[] = [];
      for (const color of paletteColors) {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("part", "preview-color-option");
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
      "preview-arrow-color-picker",
      () => activeArrowColor,
      (value) => {
        activeArrowColor = value;
      }
    );

    const textColorPicker = createColorPicker(
      "Text",
      "preview-text-color-picker",
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

    const undoButton = document.createElement("vaadin-button") as VaadinButtonElement;
    undoButton.textContent = "↶";
    undoButton.setAttribute("part", "preview-toolbar-button preview-undo-button");
    undoButton.setAttribute("aria-label", "Undo");
    undoButton.title = "Undo";
    undoButton.disabled = true;

    const textToggle = document.createElement("vaadin-button") as VaadinButtonElement;
    textToggle.textContent = "T";
    textToggle.setAttribute("part", "preview-toolbar-button preview-text-button");
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
    heading.setAttribute("part", "preview-heading");

    const hint = document.createElement("div");
    hint.textContent = "Use Crop, Arrow, or Text. In Text mode, click to place or drag to size a text box.";
    hint.setAttribute("part", "preview-hint");

    const previewWrap = document.createElement("div");
    previewWrap.setAttribute("part", "preview-content-wrap");

    const canvas = document.createElement("canvas");
    const maxWidth = Math.min(window.innerWidth * 0.9, 1160);
    const maxHeight = Math.min(window.innerHeight * 0.64, 720);
    const scale = Math.min(maxWidth / frame.width, maxHeight / frame.height, 1);
    canvas.width = Math.max(1, Math.round(frame.width * scale));
    canvas.height = Math.max(1, Math.round(frame.height * scale));
    canvas.setAttribute("part", "preview-media");

    const context = canvas.getContext("2d");
    if (!context) {
      frame.close();
      throw new Error("Canvas context unavailable");
    }
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);

    const selection = document.createElement("div");
    selection.setAttribute("part", "preview-selection");

    const annotations = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    annotations.setAttribute("part", "preview-annotations");
    annotations.setAttribute("aria-hidden", "true");
    const arrowsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const textsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    annotations.append(arrowsLayer, textsLayer);

    const previewStage = document.createElement("div");
    previewStage.setAttribute("part", "preview-stage");
    previewStage.append(canvas, annotations, selection);

    previewWrap.append(previewStage);

    const actions = document.createElement("div");
    actions.setAttribute("part", "preview-actions");

    const cancel = document.createElement("vaadin-button") as VaadinButtonElement;
    cancel.textContent = "Cancel";
    cancel.setAttribute("part", "preview-action-button preview-cancel-button");

    const save = document.createElement("vaadin-button") as VaadinButtonElement;
    save.textContent = "Save capture";
    save.setAttribute("part", "preview-action-button preview-save-button");

    actions.append(cancel, save);
    panel.append(heading, toolbar, hint, previewWrap, actions);
    overlay.append(panel);

    type Arrow = { x1: number; y1: number; x2: number; y2: number; color: string };
    type TextAnnotation = { x: number; y: number; text: string; sizePx: number; color: string };
    type PreviewSnapshot = {
      imageData: ImageData;
      arrows: Arrow[];
      texts: TextAnnotation[];
    };
    type EditAction = { type: "arrow" } | { type: "text" } | { type: "crop-preview"; snapshot: PreviewSnapshot };
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
    let activeTextSize = Number.parseFloat(this.cssVar("--screen-recorder-text-annotation-size", "22")) || 22;
    textSizeSelect.value = `${Math.round(activeTextSize)}`;
    if (!textSizeSelect.value) {
      textSizeSelect.value = "22";
      activeTextSize = 22;
    }

    const hasValidCrop = () => rect.width >= 2 && rect.height >= 2;
    const pointInRect = (x: number, y: number, targetRect: { x: number; y: number; width: number; height: number }) =>
      x >= targetRect.x && x <= targetRect.x + targetRect.width && y >= targetRect.y && y <= targetRect.y + targetRect.height;
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
        line.setAttribute("part", "preview-arrow");
        line.setAttribute("x1", `${arrow.x1}`);
        line.setAttribute("y1", `${arrow.y1}`);
        line.setAttribute("x2", `${arrow.x2}`);
        line.setAttribute("y2", `${arrow.y2}`);
        line.style.stroke = arrow.color;

        const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        head.setAttribute("part", "preview-arrow-head");
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
          textNode.setAttribute("part", "preview-text");
          textNode.setAttribute("x", `${annotation.x}`);
          textNode.setAttribute("y", `${annotation.y + (i * lineHeight)}`);
          textNode.setAttribute("dominant-baseline", "hanging");
          textNode.setAttribute("style", `font-size:${annotation.sizePx}px;fill:${annotation.color}`);
          textNode.textContent = lines[i] || " ";
          textsLayer.append(textNode);
        }
      }
    };

    const updateUndoState = () => {
      undoButton.disabled = history.length === 0;
    };

    const snapshotPreview = (): PreviewSnapshot => {
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      return {
        imageData: new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height),
        arrows: arrows.map((arrow) => ({ ...arrow })),
        texts: texts.map((annotation) => ({ ...annotation }))
      };
    };

    const restorePreview = (snapshot: PreviewSnapshot) => {
      canvas.width = snapshot.imageData.width;
      canvas.height = snapshot.imageData.height;
      context.putImageData(snapshot.imageData, 0, 0);
      arrows.splice(0, arrows.length, ...snapshot.arrows.map((arrow) => ({ ...arrow })));
      texts.splice(0, texts.length, ...snapshot.texts.map((annotation) => ({ ...annotation })));
      rect.x = 0;
      rect.y = 0;
      rect.width = 0;
      rect.height = 0;
      redrawSelection();
      renderArrows();
      renderTexts();
    };

    const applyCropPreview = () => {
      if (activeTool !== "crop" || !hasValidCrop()) {
        return false;
      }
      const bounds = canvas.getBoundingClientRect();
      const scaleX = canvas.width / Math.max(bounds.width, 1);
      const scaleY = canvas.height / Math.max(bounds.height, 1);
      const sourceX = Math.max(0, Math.round(rect.x * scaleX));
      const sourceY = Math.max(0, Math.round(rect.y * scaleY));
      const sourceWidth = Math.max(1, Math.round(rect.width * scaleX));
      const sourceHeight = Math.max(1, Math.round(rect.height * scaleY));
      const maxSourceX = Math.max(0, canvas.width - 1);
      const maxSourceY = Math.max(0, canvas.height - 1);
      const safeSourceX = Math.min(sourceX, maxSourceX);
      const safeSourceY = Math.min(sourceY, maxSourceY);
      const safeSourceWidth = Math.min(sourceWidth, canvas.width - safeSourceX);
      const safeSourceHeight = Math.min(sourceHeight, canvas.height - safeSourceY);
      if (safeSourceWidth < 1 || safeSourceHeight < 1) {
        return false;
      }

      const snapshot = snapshotPreview();
      const cropped = document.createElement("canvas");
      cropped.width = safeSourceWidth;
      cropped.height = safeSourceHeight;
      const croppedContext = cropped.getContext("2d");
      if (!croppedContext) {
        return false;
      }
      croppedContext.drawImage(
        canvas,
        safeSourceX,
        safeSourceY,
        safeSourceWidth,
        safeSourceHeight,
        0,
        0,
        safeSourceWidth,
        safeSourceHeight
      );

      canvas.width = safeSourceWidth;
      canvas.height = safeSourceHeight;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(cropped, 0, 0);

      for (const arrow of arrows) {
        arrow.x1 -= rect.x;
        arrow.y1 -= rect.y;
        arrow.x2 -= rect.x;
        arrow.y2 -= rect.y;
      }
      for (const annotation of texts) {
        annotation.x -= rect.x;
        annotation.y -= rect.y;
      }

      rect.x = 0;
      rect.y = 0;
      rect.width = 0;
      rect.height = 0;
      history.push({ type: "crop-preview", snapshot });
      updateUndoState();
      redrawSelection();
      renderArrows();
      renderTexts();
      return true;
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
      editor.setAttribute("part", "preview-text-editor");
      editor.style.left = `${x}px`;
      editor.style.top = `${y}px`;
      editor.style.width = `${Math.max(140, width)}px`;
      editor.style.height = `${Math.max(32, height)}px`;
      editor.style.fontSize = `${activeTextSize}px`;
      editor.placeholder = "Type text";
      previewStage.append(editor);
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
        if (hasValidCrop() && !pointInRect(point.x, point.y, rect)) {
          applyCropPreview();
          return;
        }
        dragging = true;
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
        restorePreview(action.snapshot);
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
      if (activeTool === "crop" && hasValidCrop() && !canvas.contains(target) && !selection.contains(target)) {
        applyCropPreview();
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
      const ratioX = canvas.width / Math.max(previewBounds.width, 1);
      const ratioY = canvas.height / Math.max(previewBounds.height, 1);
      output.width = canvas.width;
      output.height = canvas.height;
      const outputContext = output.getContext("2d");
      if (!outputContext) {
        this.setStatus("error");
        closeOverlay();
        return;
      }

      outputContext.drawImage(canvas, 0, 0);

      const arrowWidth = Number.parseFloat(this.cssVar("--screen-recorder-arrow-width", "4")) || 4;
      for (const arrow of arrows) {
        const ax1 = Math.round(arrow.x1 * ratioX);
        const ay1 = Math.round(arrow.y1 * ratioY);
        const ax2 = Math.round(arrow.x2 * ratioX);
        const ay2 = Math.round(arrow.y2 * ratioY);
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
          const tx = Math.round(annotation.x * ratioX);
          const scaledSize = Math.max(10, Math.round(annotation.sizePx * ((ratioX + ratioY) / 2)));
          const ty = Math.round(annotation.y * ratioY) + (i * scaledSize * textLineHeight);
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

  private async openRecordingOverlay(blob: Blob, completedAt: Date, estimatedDurationSeconds = 0): Promise<void> {
    const overlay = document.createElement("div");
    overlay.setAttribute("part", "preview-overlay");

    const panel = document.createElement("div");
    panel.setAttribute("part", "preview-panel");

    const heading = document.createElement("div");
    heading.textContent = "Recording preview";
    heading.setAttribute("part", "preview-heading");

    const toolbar = document.createElement("div");
    toolbar.setAttribute("part", "preview-toolbar preview-recording-toolbar");

    const trimEditor = document.createElement("div");
    trimEditor.setAttribute("part", "preview-trim-editor");

    const startHandle = document.createElement("button");
    startHandle.type = "button";
    startHandle.disabled = true;
    startHandle.setAttribute("part", "preview-trim-handle preview-trim-start");
    startHandle.setAttribute("aria-label", "Trim start");

    const startTime = document.createElement("span");
    startTime.textContent = "0:00";
    startTime.setAttribute("part", "preview-trim-time preview-trim-start-time");

    const endHandle = document.createElement("button");
    endHandle.type = "button";
    endHandle.disabled = true;
    endHandle.setAttribute("part", "preview-trim-handle preview-trim-end");
    endHandle.setAttribute("aria-label", "Trim end");

    const endTime = document.createElement("span");
    endTime.textContent = "0:00";
    endTime.setAttribute("part", "preview-trim-time preview-trim-end-time");

    const sliderWrap = document.createElement("div");
    sliderWrap.setAttribute("part", "preview-trim-slider-wrap");
    const sliderTrack = document.createElement("div");
    sliderTrack.setAttribute("part", "preview-trim-track");
    const sliderActive = document.createElement("div");
    sliderActive.setAttribute("part", "preview-trim-active");
    sliderActive.hidden = true;
    sliderWrap.append(sliderTrack, sliderActive, startHandle, endHandle);

    trimEditor.append(startTime, sliderWrap, endTime);
    toolbar.append(trimEditor);

    const hint = document.createElement("div");
    hint.textContent = "Review the recording, then save it.";
    hint.setAttribute("part", "preview-hint");

    const saveNotice = document.createElement("div");
    saveNotice.setAttribute("part", "preview-save-notice");

    const previewWrap = document.createElement("div");
    previewWrap.setAttribute("part", "preview-content-wrap");

    const video = document.createElement("video");
    video.controls = true;
    video.setAttribute("part", "preview-media recording-preview");
    const url = URL.createObjectURL(blob);
    video.src = url;
    video.preload = "metadata";

    previewWrap.append(video);

    const actions = document.createElement("div");
    actions.setAttribute("part", "preview-actions");

    const cancel = document.createElement("vaadin-button") as VaadinButtonElement;
    cancel.textContent = "Cancel";
    cancel.setAttribute("part", "preview-action-button preview-cancel-button");

    const save = document.createElement("vaadin-button") as VaadinButtonElement;
    save.textContent = "Save recording";
    save.disabled = true;
    save.setAttribute("part", "preview-action-button preview-save-button");

    actions.append(cancel, save);
    panel.append(heading, toolbar, hint, saveNotice, previewWrap, actions);
    overlay.append(panel);

    const minTrimSpanSeconds = 0.05;
    let duration = 0;
    let trimStart = 0;
    let trimEnd = 0;
    let committedTrimStart = 0;
    let committedTrimEnd = 0;
    let metadataReady = false;
    let saving = false;
    let activeTrimHandle: "start" | "end" | null = null;
    let adjustingTrim = false;
    let trimLoopRaf: number | null = null;
    const trimEpsilon = 0.02;
    let trimInitialized = false;

    const updateTrimUi = () => {
      startTime.textContent = this.formatSeconds(trimStart);
      endTime.textContent = this.formatSeconds(trimEnd);
      const startPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
      const endPercent = duration > 0 ? (trimEnd / duration) * 100 : 100;
      sliderActive.style.left = `${startPercent}%`;
      sliderActive.style.width = `${Math.max(0, endPercent - startPercent)}%`;
      startHandle.style.left = `${startPercent}%`;
      endHandle.style.left = `${endPercent}%`;
      const hasClip = metadataReady && trimEnd - trimStart < duration - minTrimSpanSeconds;
      hint.textContent = hasClip
        ? `Trimmed range: ${this.formatSeconds(trimStart)} - ${this.formatSeconds(trimEnd)}`
        : "Review the recording, then save it.";
    };

    const closeOverlay = () => {
      this.closePreviewOverlay();
    };

    const trimAtClientX = (clientX: number, side: "start" | "end") => {
      if (!metadataReady || duration <= 0) {
        return;
      }
      const bounds = sliderWrap.getBoundingClientRect();
      const ratio = bounds.width > 0 ? this.clamp((clientX - bounds.left) / bounds.width, 0, 1) : 0;
      const next = ratio * duration;
      if (side === "start") {
        trimStart = this.clamp(next, 0, Math.max(0, trimEnd - minTrimSpanSeconds));
        video.currentTime = trimStart;
      } else {
        trimEnd = this.clamp(next, Math.min(duration, trimStart + minTrimSpanSeconds), duration);
        video.currentTime = Math.max(trimStart, trimEnd - (trimEpsilon * 2));
      }
      updateTrimUi();
    };

    const applyDurationToTrim = (nextDuration: number) => {
      if (!Number.isFinite(nextDuration) || nextDuration <= 0) {
        return;
      }
      const hadMetadata = metadataReady;
      const videoDuration = Number.isFinite(video.duration) && video.duration > 0
        ? video.duration
        : 0;
      const seekableDuration = video.seekable.length > 0
        ? video.seekable.end(video.seekable.length - 1)
        : 0;
      duration = Math.max(nextDuration, videoDuration, seekableDuration, estimatedDurationSeconds, 0);
      metadataReady = duration > 0;
      if (!metadataReady) {
        return;
      }
      if (!trimInitialized || !hadMetadata) {
        trimStart = 0;
        trimEnd = duration;
        committedTrimStart = trimStart;
        committedTrimEnd = trimEnd;
        trimInitialized = true;
      } else {
        trimStart = this.clamp(trimStart, 0, Math.max(0, duration - minTrimSpanSeconds));
        trimEnd = this.clamp(trimEnd, Math.min(duration, trimStart + minTrimSpanSeconds), duration);
        committedTrimStart = this.clamp(committedTrimStart, 0, Math.max(0, duration - minTrimSpanSeconds));
        committedTrimEnd = this.clamp(committedTrimEnd, Math.min(duration, committedTrimStart + minTrimSpanSeconds), duration);
      }
      startHandle.disabled = !metadataReady;
      endHandle.disabled = !metadataReady;
      save.disabled = !metadataReady;
      sliderActive.hidden = !metadataReady;
      updateTrimUi();
    };

    const onLoadedMetadata = () => {
      const videoDuration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const seekableDuration = video.seekable.length > 0
        ? video.seekable.end(video.seekable.length - 1)
        : 0;
      applyDurationToTrim(Math.max(videoDuration, seekableDuration, estimatedDurationSeconds, 0));
    };

    const clampCurrentToTrim = (mode: "seek" | "playback"): boolean => {
      if (!metadataReady || saving) {
        return false;
      }
      if (video.currentTime < trimStart) {
        video.currentTime = trimStart;
        return true;
      }
      if (video.currentTime > trimEnd + trimEpsilon) {
        video.currentTime = mode === "playback" ? trimStart : trimEnd;
        return true;
      }
      if (mode === "playback" && video.currentTime >= trimEnd - trimEpsilon) {
        video.currentTime = trimStart;
        return true;
      }
      return false;
    };

    const stopTrimLoop = () => {
      if (trimLoopRaf !== null) {
        window.cancelAnimationFrame(trimLoopRaf);
        trimLoopRaf = null;
      }
    };

    const runTrimLoop = () => {
      if (video.paused || video.ended || saving) {
        stopTrimLoop();
        return;
      }
      clampCurrentToTrim("playback");
      trimLoopRaf = window.requestAnimationFrame(runTrimLoop);
    };

    const startTrimLoop = () => {
      stopTrimLoop();
      trimLoopRaf = window.requestAnimationFrame(runTrimLoop);
    };

    const onTimeUpdate = () => {
      if (!metadataReady) {
        const runtimeDurationGuess = Math.max(
          estimatedDurationSeconds,
          video.currentTime + 0.5,
          video.seekable.length > 0 ? video.seekable.end(video.seekable.length - 1) : 0
        );
        applyDurationToTrim(runtimeDurationGuess);
      }
      if (!metadataReady || saving || adjustingTrim) {
        return;
      }
      if (video.paused) {
        clampCurrentToTrim("seek");
      } else {
        clampCurrentToTrim("playback");
      }
    };

    const onVideoSeeking = () => {
      if (adjustingTrim) {
        return;
      }
      clampCurrentToTrim("seek");
    };

    const onVideoPlay = () => {
      if (adjustingTrim) {
        video.pause();
        return;
      }
      if (video.currentTime >= trimEnd - trimEpsilon || video.currentTime < trimStart) {
        video.currentTime = trimStart;
      } else {
        clampCurrentToTrim("seek");
      }
      startTrimLoop();
    };

    const onVideoPauseOrEnded = () => {
      stopTrimLoop();
    };

    const commitTrimChange = () => {
      if (!metadataReady || saving) {
        return;
      }
      const changed = Math.abs(trimStart - committedTrimStart) >= 0.001 || Math.abs(trimEnd - committedTrimEnd) >= 0.001;
      if (!changed) {
        return;
      }
      committedTrimStart = trimStart;
      committedTrimEnd = trimEnd;
    };

    const onCancel = () => {
      closeOverlay();
    };

    const onSave = async () => {
      if (!metadataReady || saving) {
        return;
      }
      saving = true;
      save.disabled = true;
      cancel.disabled = true;
      startHandle.disabled = true;
      endHandle.disabled = true;
      saveNotice.style.display = "none";
      saveNotice.textContent = "";
      save.textContent = "Saving...";
      video.pause();

      let outputBlob: Blob = blob;
      let savedFullFallback = false;
      const requiresTrim = trimStart > minTrimSpanSeconds || trimEnd < duration - minTrimSpanSeconds;
      if (requiresTrim) {
        try {
          outputBlob = await this.trimRecordingFromElement(video, trimStart, trimEnd, blob.type || "video/webm");
        } catch {
          try {
            outputBlob = await this.trimRecordingBlob(blob, trimStart, trimEnd);
          } catch {
            outputBlob = blob;
            savedFullFallback = true;
          }
        }
      }
      this.downloadBlob(outputBlob, this.buildFilename(completedAt));

      this.setStatus("downloaded");
      this.scheduleIdleReset();
      if (savedFullFallback) {
        saveNotice.textContent = "Trim unavailable in this browser. Saved full recording.";
        saveNotice.style.display = "block";
        window.setTimeout(() => {
          closeOverlay();
        }, 950);
      } else {
        closeOverlay();
      }
    };

    const onStartHandlePointerDown = (event: PointerEvent) => {
      if (!metadataReady || saving) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      adjustingTrim = true;
      video.pause();
      stopTrimLoop();
      activeTrimHandle = "start";
      window.addEventListener("pointermove", onSliderPointerMove);
      window.addEventListener("pointerup", onSliderPointerUp);
      window.addEventListener("pointercancel", onSliderPointerUp);
    };

    const onEndHandlePointerDown = (event: PointerEvent) => {
      if (!metadataReady || saving) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      adjustingTrim = true;
      video.pause();
      stopTrimLoop();
      activeTrimHandle = "end";
      window.addEventListener("pointermove", onSliderPointerMove);
      window.addEventListener("pointerup", onSliderPointerUp);
      window.addEventListener("pointercancel", onSliderPointerUp);
    };

    const onSliderPointerDown = (event: PointerEvent) => {
      if (!metadataReady || saving) {
        return;
      }
      const bounds = sliderWrap.getBoundingClientRect();
      const x = this.clamp(event.clientX - bounds.left, 0, bounds.width);
      const startX = duration > 0 ? (trimStart / duration) * bounds.width : 0;
      const endX = duration > 0 ? (trimEnd / duration) * bounds.width : bounds.width;
      activeTrimHandle = Math.abs(x - startX) <= Math.abs(x - endX) ? "start" : "end";
      adjustingTrim = true;
      video.pause();
      stopTrimLoop();
      trimAtClientX(event.clientX, activeTrimHandle);
      window.addEventListener("pointermove", onSliderPointerMove);
      window.addEventListener("pointerup", onSliderPointerUp);
      window.addEventListener("pointercancel", onSliderPointerUp);
    };

    const onSliderPointerMove = (event: PointerEvent) => {
      if (!activeTrimHandle) {
        return;
      }
      trimAtClientX(event.clientX, activeTrimHandle);
    };

    const onSliderPointerUp = () => {
      if (!activeTrimHandle) {
        return;
      }
      activeTrimHandle = null;
      adjustingTrim = false;
      window.removeEventListener("pointermove", onSliderPointerMove);
      window.removeEventListener("pointerup", onSliderPointerUp);
      window.removeEventListener("pointercancel", onSliderPointerUp);
      commitTrimChange();
    };

    video.addEventListener("loadedmetadata", onLoadedMetadata);
    video.addEventListener("durationchange", onLoadedMetadata);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("seeking", onVideoSeeking);
    video.addEventListener("play", onVideoPlay);
    video.addEventListener("pause", onVideoPauseOrEnded);
    video.addEventListener("ended", onVideoPauseOrEnded);
    startHandle.addEventListener("pointerdown", onStartHandlePointerDown);
    endHandle.addEventListener("pointerdown", onEndHandlePointerDown);
    sliderWrap.addEventListener("pointerdown", onSliderPointerDown);
    cancel.addEventListener("click", onCancel);
    save.addEventListener("click", onSave);

    this.setPreviewOverlay(overlay, () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("durationchange", onLoadedMetadata);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("seeking", onVideoSeeking);
      video.removeEventListener("play", onVideoPlay);
      video.removeEventListener("pause", onVideoPauseOrEnded);
      video.removeEventListener("ended", onVideoPauseOrEnded);
      stopTrimLoop();
      startHandle.removeEventListener("pointerdown", onStartHandlePointerDown);
      endHandle.removeEventListener("pointerdown", onEndHandlePointerDown);
      sliderWrap.removeEventListener("pointerdown", onSliderPointerDown);
      window.removeEventListener("pointermove", onSliderPointerMove);
      window.removeEventListener("pointerup", onSliderPointerUp);
      window.removeEventListener("pointercancel", onSliderPointerUp);
      cancel.removeEventListener("click", onCancel);
      save.removeEventListener("click", onSave);
      video.pause();
      video.src = "";
      URL.revokeObjectURL(url);
    });

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onLoadedMetadata();
    }
    if (!metadataReady && estimatedDurationSeconds > 0) {
      applyDurationToTrim(estimatedDurationSeconds);
    }

    try {
      await video.play();
    } catch {
      // User gesture policy may block autoplay. Controls remain available.
    }
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
