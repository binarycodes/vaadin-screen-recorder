type RecorderStatus = "idle" | "recording" | "ready" | "downloaded" | "denied" | "error";

class FloatingSupportRecorder extends HTMLElement {
  private readonly shadow = this.attachShadow({ mode: "open" });
  private readonly container = document.createElement("div");
  private readonly handle = document.createElement("div");
  private readonly statusBadge = document.createElement("span");
  private readonly recordButton = document.createElement("button");
  private readonly downloadButton = document.createElement("button");

  private status: RecorderStatus = "idle";
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];
  private recordingBlob: Blob | null = null;
  private lastCompletedAt: Date | null = null;

  private dragPointerId: number | null = null;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private positionSet = false;

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

      .shell {
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
      }

      .handle {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-right: 6px;
        cursor: grab;
        touch-action: none;
      }

      .handle:active {
        cursor: grabbing;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: var(--indicator-color, #8ea4bc);
        box-shadow: 0 0 12px color-mix(in srgb, var(--indicator-color, #8ea4bc) 60%, transparent);
      }

      .status {
        min-width: 74px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #c8d5e3;
      }

      button {
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

      button:hover {
        transform: translateY(-1px);
      }

      button:disabled {
        cursor: not-allowed;
        opacity: 0.45;
        transform: none;
      }

      .record {
        min-width: 108px;
        background: linear-gradient(135deg, #ff6b57, #ff2f54);
        color: #fff6f4;
      }

      .download {
        background: linear-gradient(135deg, #d7e8ff, #a8c9ff);
        color: #10223a;
      }

      @media (max-width: 640px) {
        .shell {
          gap: 8px;
          padding: 10px;
        }

        .status {
          display: none;
        }

        button {
          padding: 10px 12px;
          font-size: 12px;
        }
      }
    `;

    const dot = document.createElement("span");
    dot.className = "dot";
    this.handle.className = "handle";
    this.statusBadge.className = "status";
    this.recordButton.className = "record";
    this.downloadButton.className = "download";

    this.recordButton.type = "button";
    this.downloadButton.type = "button";

    this.handle.append(dot, this.statusBadge);
    this.container.className = "shell";
    this.container.append(this.handle, this.recordButton, this.downloadButton);
    this.shadow.append(style, this.container);
  }

  connectedCallback() {
    this.handle.addEventListener("pointerdown", this.onDragStart);
    this.recordButton.addEventListener("click", this.onRecordToggle);
    this.downloadButton.addEventListener("click", this.onDownloadClick);
    this.updateUi();
  }

  disconnectedCallback() {
    this.handle.removeEventListener("pointerdown", this.onDragStart);
    window.removeEventListener("pointermove", this.onDragMove);
    window.removeEventListener("pointerup", this.onDragEnd);
    this.recordButton.removeEventListener("click", this.onRecordToggle);
    this.downloadButton.removeEventListener("click", this.onDownloadClick);
  }

  async start() {
    if (this.recorder && this.status === "recording") {
      return;
    }

    try {
      this.chunks = [];
      this.recordingBlob = null;
      this.lastCompletedAt = null;
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

  private readonly onDragStart = (event: PointerEvent) => {
    const rect = this.container.getBoundingClientRect();
    this.dragPointerId = event.pointerId;
    this.dragOffsetX = event.clientX - rect.left;
    this.dragOffsetY = event.clientY - rect.top;
    this.handle.setPointerCapture(event.pointerId);
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
    this.container.style.right = "auto";
    this.positionSet = true;
  };

  private readonly onDragEnd = (event: PointerEvent) => {
    if (this.dragPointerId !== event.pointerId) {
      return;
    }

    this.dragPointerId = null;
    this.handle.releasePointerCapture(event.pointerId);
    window.removeEventListener("pointermove", this.onDragMove);
    window.removeEventListener("pointerup", this.onDragEnd);
  };

  private updateUi() {
    this.statusBadge.textContent = this.statusLabel(this.status);
    this.recordButton.textContent = this.status === "recording" ? "Stop" : "Record";
    this.downloadButton.textContent = "Download";
    this.downloadButton.disabled = !this.recordingBlob || !this.lastCompletedAt || this.status === "recording";

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

  private clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
  }

  private pad(value: number): string {
    return value.toString().padStart(2, "0");
  }
}

customElements.define("floating-support-recorder", FloatingSupportRecorder);
