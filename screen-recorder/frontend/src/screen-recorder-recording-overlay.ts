import type { RecorderStatus } from "./screen-recorder-shell-view";

type VaadinButtonElement = HTMLElement & { disabled: boolean };

export type RecordingOverlayHost = {
  buildFilename: (completedAt: Date) => string;
  clamp: (value: number, min: number, max: number) => number;
  closePreviewOverlay: () => void;
  downloadBlob: (blob: Blob, filename: string) => void;
  formatSeconds: (seconds: number) => string;
  scheduleIdleReset: () => void;
  setPreviewOverlay: (overlay: HTMLDivElement, cleanup: () => void) => void;
  setStatus: (status: RecorderStatus) => void;
  setupDialogA11y: (
    overlay: HTMLDivElement,
    panel: HTMLElement,
    heading: HTMLElement,
    hint: HTMLElement | null,
    onEscape: () => void,
    initialFocus: HTMLElement
  ) => () => void;
  trimRecordingBlob: (blob: Blob, startSeconds: number, endSeconds: number) => Promise<Blob>;
  trimRecordingFromElement: (
    sourceVideo: HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream },
    startSeconds: number,
    endSeconds: number,
    fallbackType: string
  ) => Promise<Blob>;
};

export async function openRecordingOverlay(
  host: RecordingOverlayHost,
  blob: Blob,
  completedAt: Date,
  estimatedDurationSeconds = 0
): Promise<void> {
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
  let saveCloseTimer: number | null = null;

  const updateTrimUi = () => {
    startTime.textContent = host.formatSeconds(trimStart);
    endTime.textContent = host.formatSeconds(trimEnd);
    const startPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
    const endPercent = duration > 0 ? (trimEnd / duration) * 100 : 100;
    sliderActive.style.left = `${startPercent}%`;
    sliderActive.style.width = `${Math.max(0, endPercent - startPercent)}%`;
    startHandle.style.left = `${startPercent}%`;
    endHandle.style.left = `${endPercent}%`;
    const hasClip = metadataReady && trimEnd - trimStart < duration - minTrimSpanSeconds;
    hint.textContent = hasClip
      ? `Trimmed range: ${host.formatSeconds(trimStart)} - ${host.formatSeconds(trimEnd)}`
      : "Review the recording, then save it.";
  };

  const closeOverlay = () => {
    if (saveCloseTimer !== null) {
      window.clearTimeout(saveCloseTimer);
      saveCloseTimer = null;
    }
    host.closePreviewOverlay();
  };
  const dialogCleanup = host.setupDialogA11y(overlay, panel, heading, hint, () => closeOverlay(), cancel);

  const trimAtClientX = (clientX: number, side: "start" | "end") => {
    if (!metadataReady || duration <= 0) {
      return;
    }
    const bounds = sliderWrap.getBoundingClientRect();
    const ratio = bounds.width > 0 ? host.clamp((clientX - bounds.left) / bounds.width, 0, 1) : 0;
    const next = ratio * duration;
    if (side === "start") {
      trimStart = host.clamp(next, 0, Math.max(0, trimEnd - minTrimSpanSeconds));
      video.currentTime = trimStart;
    } else {
      trimEnd = host.clamp(next, Math.min(duration, trimStart + minTrimSpanSeconds), duration);
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
      trimStart = host.clamp(trimStart, 0, Math.max(0, duration - minTrimSpanSeconds));
      trimEnd = host.clamp(trimEnd, Math.min(duration, trimStart + minTrimSpanSeconds), duration);
      committedTrimStart = host.clamp(committedTrimStart, 0, Math.max(0, duration - minTrimSpanSeconds));
      committedTrimEnd = host.clamp(committedTrimEnd, Math.min(duration, committedTrimStart + minTrimSpanSeconds), duration);
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
        outputBlob = await host.trimRecordingFromElement(video, trimStart, trimEnd, blob.type || "video/webm");
      } catch (e) {
        console.warn("trimRecordingFromElement failed, trying fallback:", e);
        try {
          outputBlob = await host.trimRecordingBlob(blob, trimStart, trimEnd);
        } catch (e2) {
          console.warn("trimRecordingBlob also failed, saving full recording:", e2);
          outputBlob = blob;
          savedFullFallback = true;
        }
      }
    }
    host.downloadBlob(outputBlob, host.buildFilename(completedAt));

    host.setStatus("downloaded");
    host.scheduleIdleReset();
    if (savedFullFallback) {
      saveNotice.textContent = "Trim unavailable in this browser. Saved full recording.";
      saveNotice.style.display = "block";
      saveCloseTimer = window.setTimeout(() => {
        saveCloseTimer = null;
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
    const x = host.clamp(event.clientX - bounds.left, 0, bounds.width);
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

  host.setPreviewOverlay(overlay, () => {
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
    dialogCleanup();
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
