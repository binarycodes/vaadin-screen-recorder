# ScreenRecorder

Floating Vaadin component for screen recording and cropped screen capture.

## Requirements

- Java 21+
- Vaadin 25.0.7

## Usage

Use `create()` to enable both recording and capture:

```java
ScreenRecorder recorder = ScreenRecorder.create();
add(recorder);
```

Use the static factories if you want a smaller surface area:

```java
ScreenRecorder recordOnly = ScreenRecorder.createRecorder();
ScreenRecorder captureOnly = ScreenRecorder.createCapture();
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

- The component renders as a floating draggable control bar
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
- `capture-overlay`
- `preview-panel`
- `capture-panel`
- `preview-toolbar`
- `capture-toolbar`
- `preview-toolbar-button`
- `capture-toolbar-button`
- `preview-crop-button`
- `capture-crop-button`
- `preview-arrow-button`
- `capture-arrow-button`
- `preview-arrow-color-picker`
- `capture-arrow-color-picker`
- `preview-text-button`
- `capture-text-button`
- `preview-text-color-picker`
- `capture-text-color-picker`
- `preview-color-picker`
- `capture-color-picker`
- `preview-color-trigger`
- `capture-color-trigger`
- `preview-color-swatch`
- `capture-color-swatch`
- `preview-color-menu`
- `capture-color-menu`
- `preview-color-option`
- `capture-color-option`
- `preview-text-size-select`
- `capture-text-size-select`
- `preview-undo-button`
- `capture-undo-button`
- `preview-heading`
- `capture-heading`
- `preview-hint`
- `capture-hint`
- `preview-content-wrap`
- `capture-preview-wrap`
- `preview-media`
- `capture-preview`
- `recording-preview`
- `preview-selection`
- `capture-selection`
- `preview-annotations`
- `capture-annotations`
- `preview-arrow`
- `capture-arrow`
- `preview-arrow-head`
- `capture-arrow-head`
- `preview-text`
- `capture-text`
- `preview-text-editor`
- `capture-text-editor`
- `preview-actions`
- `capture-actions`
- `preview-action-button`
- `capture-action-button`
- `preview-cancel-button`
- `capture-cancel-button`
- `preview-save-button`
- `capture-save-button`

`preview-*` parts are the neutral naming scheme used for both capture and recording dialogs. Existing `capture-*` parts are kept as aliases for compatibility.

## Global Theme Properties

For common styling, set CSS custom properties globally (for example on `:root`) and the addon picks them up without `::part`.

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
  --screen-recorder-recording-preview-background: #000;
  --screen-recorder-recording-preview-max-height: 62vh;
}
```

Most useful property groups:

- Typography: `--screen-recorder-font-family`, `--screen-recorder-font-size`, `--screen-recorder-button-font-size`, `--screen-recorder-status-font-size`
- Spacing/sizing: `--screen-recorder-shell-padding`, `--screen-recorder-shell-gap`, `--screen-recorder-button-padding`, `--screen-recorder-panel-padding`
- Colors: `--screen-recorder-shell-background`, `--screen-recorder-text-color`, `--screen-recorder-muted-text-color`, `--screen-recorder-record-background`, `--screen-recorder-capture-background`

## API Note

- `download()` now follows the same preview-first pattern as the UI: it opens the recording preview dialog instead of directly downloading.

## Browser Notes

- Screen and tab capture always require user permission
- Recording and capture must be started from a user action
- Browser chooser behavior is controlled by the browser, not by the component
- Chromium-based browsers are the safest target
