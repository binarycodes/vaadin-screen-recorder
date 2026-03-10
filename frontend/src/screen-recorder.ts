type RecorderStatus = "idle" | "recording" | "ready" | "downloaded" | "denied" | "error";

class ScreenRecorder extends HTMLElement {
  private readonly shadow = this.attachShadow({ mode: "open" });
  private readonly container = document.createElement("div");
  private readonly handle = document.createElement("div");
  private readonly statusBadge = document.createElement("span");
  private readonly recordButton = document.createElement("button");
  private readonly captureButton = document.createElement("button");
  private readonly downloadButton = document.createElement("button");

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

  private selectionOverlay: HTMLDivElement | null = null;

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
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      [part~="shell"] {
        position: fixed;
        top: 24px;
        right: 24px;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 18px;
        background:
          linear-gradient(135deg, rgba(14, 20, 28, 0.96), rgba(32, 42, 57, 0.92));
        color: #f4f7fb;
        box-shadow:
          0 18px 40px rgba(6, 11, 17, 0.26),
          inset 0 1px 0 rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(14px);
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
        gap: 8px;
        padding-right: 6px;
      }

      [part~="status-indicator"] {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--indicator-color, #8ea4bc);
        box-shadow: 0 0 12px color-mix(in srgb, var(--indicator-color, #8ea4bc) 60%, transparent);
      }

      [part~="status-badge"] {
        min-width: 74px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #c8d5e3;
      }

      [part~="button"] {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: transform 140ms ease, opacity 140ms ease, background-color 140ms ease;
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
        min-width: 108px;
        background: linear-gradient(135deg, #ff6b57, #ff2f54);
        color: #fff6f4;
      }

      [part~="capture-button"] {
        background: linear-gradient(135deg, #ffe6a7, #ffbf5e);
        color: #3c2500;
      }

      [part~="download-button"] {
        background: linear-gradient(135deg, #d7e8ff, #a8c9ff);
        color: #10223a;
      }

      [part~="capture-overlay"] {
        position: fixed;
        inset: 0;
        z-index: 10001;
        background: rgba(4, 8, 13, 0.82);
        display: grid;
        place-items: center;
      }

      [part~="capture-panel"] {
        width: min(92vw, 1200px);
        max-height: 92vh;
        padding: 18px;
        border-radius: 24px;
        background: #0c1621;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #e7eef7;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      [part~="capture-heading"] {
        font-size: 16px;
        font-weight: 700;
        margin-bottom: 6px;
      }

      [part~="capture-hint"] {
        font-size: 13px;
        color: #9cb2ca;
        margin-bottom: 14px;
      }

      [part~="capture-preview-wrap"] {
        position: relative;
        overflow: auto;
        max-height: calc(92vh - 150px);
        border-radius: 16px;
        background: #08111a;
      }

      [part~="capture-preview"] {
        display: block;
        cursor: crosshair;
      }

      [part~="capture-selection"] {
        position: absolute;
        border: 2px solid #7ed0ff;
        background: rgba(126, 208, 255, 0.18);
        pointer-events: none;
        display: none;
      }

      [part~="capture-actions"] {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: 14px;
      }

      [part~="capture-action-button"] {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 10px 14px;
        font: inherit;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 140ms ease, opacity 140ms ease, background-color 140ms ease;
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
        background: #243445;
        color: #eef4fb;
      }

      [part~="capture-save-button"] {
        background: linear-gradient(135deg, #ffe6a7, #ffbf5e);
        color: #3c2500;
      }

      @media (max-width: 640px) {
        [part~="shell"] {
          gap: 8px;
          padding: 10px;
        }

        [part~="status-badge"] {
          display: none;
        }

        [part~="button"] {
          padding: 10px 12px;
          font-size: 12px;
        }
      }
    `;

    const dot = document.createElement("span");
    dot.setAttribute("part", "status-indicator");
    this.handle.setAttribute("part", "handle");
    this.statusBadge.setAttribute("part", "status-badge");
    this.recordButton.setAttribute("part", "button record-button");
    this.captureButton.setAttribute("part", "button capture-button");
    this.downloadButton.setAttribute("part", "button download-button");

    this.recordButton.type = "button";
    this.captureButton.type = "button";
    this.downloadButton.type = "button";

    this.handle.append(dot, this.statusBadge);
    this.container.setAttribute("part", "shell");
    this.container.append(this.handle, this.recordButton, this.captureButton, this.downloadButton);
    this.shadow.append(style, this.container);
  }

  connectedCallback() {
    this.container.addEventListener("pointerdown", this.onShellPointerDown);
    this.recordButton.addEventListener("click", this.onRecordToggle);
    this.captureButton.addEventListener("click", this.onCaptureClick);
    this.downloadButton.addEventListener("click", this.onDownloadClick);
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
    this.downloadButton.removeEventListener("click", this.onDownloadClick);
    this.selectionOverlay?.remove();
    this.selectionOverlay = null;
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

    const url = URL.createObjectURL(this.recordingBlob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = this.buildFilename(this.lastCompletedAt);
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    this.setStatus("downloaded");
    this.scheduleIdleReset();
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
      await this.openCropOverlay(frame);
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

  private readonly onDownloadClick = () => {
    this.download();
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
    this.downloadButton.hidden = !this.isRecordEnabled;
    this.recordButton.disabled = !this.isRecordEnabled;
    this.captureButton.disabled = !this.isCaptureEnabled || this.status === "recording";
    this.downloadButton.textContent = "Download";
    this.downloadButton.disabled = !this.isRecordEnabled || !this.recordingBlob || !this.lastCompletedAt || this.status === "recording";

    const indicatorColor = this.status === "recording"
      ? "#ff5f57"
      : this.status === "ready" || this.status === "downloaded"
        ? "#63d18c"
        : this.status === "error" || this.status === "denied"
          ? "#ffb54d"
          : "#8ea4bc";
    this.container.style.setProperty("--indicator-color", indicatorColor);

    if (!this.positionSet) {
      this.container.style.top = "24px";
      this.container.style.right = "24px";
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

  private async openCropOverlay(frame: ImageBitmap): Promise<void> {
    if (this.selectionOverlay) {
      this.selectionOverlay.remove();
      this.selectionOverlay = null;
    }

    const overlay = document.createElement("div");
    overlay.setAttribute("part", "capture-overlay");

    const panel = document.createElement("div");
    panel.setAttribute("part", "capture-panel");

    const heading = document.createElement("div");
    heading.textContent = "Select area to capture";
    heading.setAttribute("part", "capture-heading");

    const hint = document.createElement("div");
    hint.textContent = "Drag over the preview, then save the cropped image.";
    hint.setAttribute("part", "capture-hint");

    const previewWrap = document.createElement("div");
    previewWrap.setAttribute("part", "capture-preview-wrap");

    const canvas = document.createElement("canvas");
    const maxWidth = Math.min(window.innerWidth * 0.88, 1100);
    const maxHeight = Math.min(window.innerHeight * 0.64, 720);
    const scale = Math.min(maxWidth / frame.width, maxHeight / frame.height, 1);
    canvas.width = Math.max(1, Math.round(frame.width * scale));
    canvas.height = Math.max(1, Math.round(frame.height * scale));
    canvas.setAttribute("part", "capture-preview");

    const context = canvas.getContext("2d");
    if (!context) {
      frame.close();
      throw new Error("Canvas context unavailable");
    }
    context.drawImage(frame, 0, 0, canvas.width, canvas.height);

    const selection = document.createElement("div");
    selection.setAttribute("part", "capture-selection");

    previewWrap.append(canvas, selection);

    const actions = document.createElement("div");
    actions.setAttribute("part", "capture-actions");

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.setAttribute("part", "capture-action-button capture-cancel-button");

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save capture";
    save.disabled = true;
    save.setAttribute("part", "capture-action-button capture-save-button");

    actions.append(cancel, save);
    panel.append(heading, hint, previewWrap, actions);
    overlay.append(panel);
    this.shadow.append(overlay);
    this.selectionOverlay = overlay;

    const rect = { x: 0, y: 0, width: 0, height: 0 };
    let dragging = false;
    let startX = 0;
    let startY = 0;

    const redrawSelection = () => {
      if (rect.width < 2 || rect.height < 2) {
        selection.style.display = "none";
        save.disabled = true;
        return;
      }
      selection.style.display = "block";
      selection.style.left = `${rect.x}px`;
      selection.style.top = `${rect.y}px`;
      selection.style.width = `${rect.width}px`;
      selection.style.height = `${rect.height}px`;
      save.disabled = false;
    };

    const getPoint = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return {
        x: this.clamp(event.clientX - bounds.left, 0, bounds.width),
        y: this.clamp(event.clientY - bounds.top, 0, bounds.height)
      };
    };

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      const point = getPoint(event);
      startX = point.x;
      startY = point.y;
      rect.x = point.x;
      rect.y = point.y;
      rect.width = 0;
      rect.height = 0;
      redrawSelection();
      canvas.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }
      const point = getPoint(event);
      rect.x = Math.min(startX, point.x);
      rect.y = Math.min(startY, point.y);
      rect.width = Math.abs(point.x - startX);
      rect.height = Math.abs(point.y - startY);
      redrawSelection();
    };

    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    };

    const closeOverlay = () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      cancel.removeEventListener("click", onCancel);
      save.removeEventListener("click", onSave);
      overlay.remove();
      this.selectionOverlay = null;
      frame.close();
    };

    const onCancel = () => {
      closeOverlay();
    };

    const onSave = async () => {
      if (rect.width < 2 || rect.height < 2) {
        return;
      }

      const output = document.createElement("canvas");
      const ratioX = frame.width / canvas.width;
      const ratioY = frame.height / canvas.height;
      output.width = Math.max(1, Math.round(rect.width * ratioX));
      output.height = Math.max(1, Math.round(rect.height * ratioY));
      const outputContext = output.getContext("2d");
      if (!outputContext) {
        this.setStatus("error");
        closeOverlay();
        return;
      }

      outputContext.drawImage(
        frame,
        Math.round(rect.x * ratioX),
        Math.round(rect.y * ratioY),
        Math.round(rect.width * ratioX),
        Math.round(rect.height * ratioY),
        0,
        0,
        output.width,
        output.height
      );

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
    cancel.addEventListener("click", onCancel);
    save.addEventListener("click", onSave);
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
