class SupportRecorder extends HTMLElement {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: BlobPart[] = [];

  async start() {
    try {
      this.chunks = [];
      const captureOptions: DisplayMediaStreamOptions & {
        selfBrowserSurface?: "include" | "exclude";
        surfaceSwitching?: "include" | "exclude";
        monitorTypeSurfaces?: "include" | "exclude";
        systemAudio?: "include" | "exclude";
      } = {
        video: {
          frameRate: 30
        },
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
        if (event.data && event.data.size > 0) {
          this.chunks.push(event.data);
        }
      };
      this.recorder.start(1000);
      this.pushStatus("recording");
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotAllowedError") {
        this.pushStatus("denied");
      } else {
        this.pushStatus("error");
      }
    }
  }

  stopAndDownload(filename?: string) {
    if (!this.recorder) {
      return;
    }

    this.recorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = this.normalizeFilename(filename);
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.recorder = null;
      this.chunks = [];
      this.pushStatus("downloaded");
    };

    this.recorder.stop();
  }

  private normalizeFilename(filename?: string): string {
    const fallback = "support-session.webm";
    if (!filename || !filename.trim()) {
      return fallback;
    }

    const cleaned = filename.trim();
    return cleaned.endsWith(".webm") ? cleaned : `${cleaned}.webm`;
  }

  private pushStatus(status: string) {
    const host = this as unknown as { $server?: { setStatusFromClient?: (status: string) => void } };
    if (host.$server?.setStatusFromClient) {
      host.$server.setStatusFromClient(status);
    } else {
      this.setAttribute("status", status);
    }
  }
}

customElements.define("support-recorder", SupportRecorder);
