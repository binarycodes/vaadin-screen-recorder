# ScreenRecorder

Vaadin component for screen recording and cropped screen capture.

## Why Use This Component

Operating system capture tools are useful for ad-hoc recording, but they are external to your application workflow.  
This component provides an in-app capture flow with:

- Built-in preview, annotation, and trim steps before saving
- Server-side event hooks for recording and capture lifecycle states
- Consistent, themeable UI behavior across users and environments

Use it when screen capture needs to be part of an application process (for example support, QA, onboarding, or incident reporting), not just a standalone file on the user’s machine.

## Requirements

- Java 21+
- Vaadin 25.0.7

## Usage

Use `create()` to enable both recording and capture:

```java
ScreenRecorder recorder = ScreenRecorder.create();
add(recorder);
```

Use `asFloating()` to place the recorder as a draggable floating control:

```java
ScreenRecorder floatingRecorder = ScreenRecorder.create().asFloating();
add(floatingRecorder);
```

Use the static factories if you want a smaller surface area:

```java
ScreenRecorder recordOnly = ScreenRecorder.createRecorder();
ScreenRecorder captureOnly = ScreenRecorder.createCapture();
```

Toggle whether the recorder bar floats over the viewport or renders inline in layout flow:

```java
recorder.setFloating(true);
```

Hide or show the status text badge:

```java
recorder.setStatusVisible(false); // default is true
```

## Events

Listen to explicit component events instead of inspecting raw status values:

```java
recorder.addRecordingStartedListener(event -> {
    Notification.show("Recording started");
});

recorder.addRecordingReadyListener(event -> {
    Notification.show("Recording stopped");
});

recorder.addDownloadCompletedListener(event -> {
    Notification.show("Recording downloaded");
});

recorder.addCaptureCompletedListener(event -> {
    Notification.show("Capture downloaded");
});

recorder.addPermissionDeniedListener(event -> {
    Notification.show("Permission denied");
});

recorder.addErrorListener(event -> {
    Notification.show("Recorder error");
});
```

## Behavior

- The component renders inline in normal layout flow by default
- Floating mode can be enabled to render a draggable control bar
- Stopping a recording opens a preview dialog with playback and a `Save recording` action
- Capturing opens a preview dialog with optional crop mode and a `Save capture` action
- Recording downloads as `recording-session-yyyymmdd-hhmmss.webm`
- Capture downloads as `capture-session-yyyymmdd-hhmmss.png`
- After download, the component shows `Downloaded` for 5 seconds and then returns to `Idle`

## Styling Parts

Style the Shadow DOM via `::part(...)` on `screen-recorder`:

- `shell`
- `handle`
- `status-indicator`
- `status-badge`
- `button`
- `record-button`
- `capture-button`
- `preview-overlay`
- `preview-panel`
- `preview-toolbar`
- `preview-recording-toolbar`
- `preview-toolbar-button`
- `preview-crop-button`
- `preview-arrow-button`
- `preview-arrow-color-picker`
- `preview-text-button`
- `preview-text-color-picker`
- `preview-color-picker`
- `preview-color-trigger`
- `preview-color-swatch`
- `preview-color-menu`
- `preview-color-option`
- `preview-trim-editor`
- `preview-trim-slider-wrap`
- `preview-trim-track`
- `preview-trim-active`
- `preview-trim-handle`
- `preview-trim-start`
- `preview-trim-end`
- `preview-trim-time`
- `preview-trim-start-time`
- `preview-trim-end-time`
- `preview-text-size-select`
- `preview-undo-button`
- `preview-heading`
- `preview-hint`
- `preview-content-wrap`
- `preview-stage`
- `preview-media`
- `recording-preview`
- `preview-selection`
- `preview-annotations`
- `preview-arrow`
- `preview-arrow-head`
- `preview-text`
- `preview-text-editor`
- `preview-actions`
- `preview-action-button`
- `preview-cancel-button`
- `preview-save-button`
- `preview-save-notice`

## Global Theme Properties

For common styling, set CSS custom properties globally (for example on `:root`).

```css
:root {
  --screen-recorder-font-family: var(--lumo-font-family);
  --screen-recorder-font-size: 15px;

  --screen-recorder-shell-padding: 12px 16px;
  --screen-recorder-shell-gap: 12px;
  --screen-recorder-shell-radius: 20px;
  --screen-recorder-shell-background: #1d2733;
  --screen-recorder-text-color: #f4f7fb;
  --screen-recorder-muted-text-color: #b9c7d6;

  --screen-recorder-button-font-size: 14px;
  --screen-recorder-button-padding: 10px 14px;
  --screen-recorder-record-background: #d33b3b;
  --screen-recorder-capture-background: #f7c45b;

  --screen-recorder-indicator-idle-color: #8ea4bc;
  --screen-recorder-indicator-recording-color: #ff5f57;
  --screen-recorder-indicator-ready-color: #63d18c;
  --screen-recorder-indicator-error-color: #ffb54d;
  --screen-recorder-trim-accent-color: #7ec8ff;
  --screen-recorder-trim-track-background: rgba(255, 255, 255, 0.24);
  --screen-recorder-arrow-color: #ff5f57;
  --screen-recorder-arrow-width: 4px;
  --screen-recorder-text-annotation-color: #ffffff;
  --screen-recorder-text-annotation-size: 22px;
  --screen-recorder-text-annotation-font-family: var(--screen-recorder-font-family);
  --screen-recorder-text-annotation-weight: 500;
  --screen-recorder-text-annotation-stroke-color: transparent;
  --screen-recorder-text-annotation-stroke-width: 0px;
  --screen-recorder-text-editor-dark-border: 1px dashed rgba(255, 255, 255, 0.75);
  --screen-recorder-text-editor-dark-background: rgba(7, 14, 22, 0.78);
  --screen-recorder-text-editor-light-border: 1px dashed rgba(7, 14, 22, 0.65);
  --screen-recorder-text-editor-light-background: rgba(255, 255, 255, 0.9);
  --screen-recorder-palette-1: #e53935;
  --screen-recorder-palette-2: #fb8c00;
  --screen-recorder-palette-3: #fdd835;
  --screen-recorder-palette-4: #43a047;
  --screen-recorder-palette-5: #00897b;
  --screen-recorder-palette-6: #00acc1;
  --screen-recorder-palette-7: #1e88e5;
  --screen-recorder-palette-8: #3949ab;
  --screen-recorder-palette-9: #8e24aa;
  --screen-recorder-palette-10: #d81b60;
  --screen-recorder-palette-11: #6d4c41;
  --screen-recorder-palette-12: #757575;
  --screen-recorder-palette-13: #212121;
  --screen-recorder-palette-14: #ffffff;
  --screen-recorder-palette-15: #90a4ae;
  --screen-recorder-palette-16: #ffb300;
  --screen-recorder-save-notice-color: #9edbb4;
  --screen-recorder-recording-preview-background: #000;
  --screen-recorder-recording-preview-max-height: 62vh;
}
```

Most useful property groups:

- Typography: `--screen-recorder-font-family`, `--screen-recorder-font-size`, `--screen-recorder-button-font-size`, `--screen-recorder-status-font-size`
- Spacing/sizing: `--screen-recorder-shell-padding`, `--screen-recorder-shell-gap`, `--screen-recorder-button-padding`, `--screen-recorder-panel-padding`
- Colors: `--screen-recorder-shell-background`, `--screen-recorder-text-color`, `--screen-recorder-muted-text-color`, `--screen-recorder-record-background`, `--screen-recorder-capture-background`, `--screen-recorder-trim-accent-color`, `--screen-recorder-trim-track-background`, `--screen-recorder-save-notice-color`

## API Note

- `download()` now follows the same preview-first pattern as the UI: it opens the recording preview dialog instead of directly downloading.

## Browser Notes

- Screen and tab capture always require user permission
- Recording and capture must be started from a user action
- Browser chooser behavior is controlled by the browser, not by the component
- Chromium-based browsers currently provide the most consistent behavior
