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
- `download-button`
- `capture-overlay`
- `capture-panel`
- `capture-heading`
- `capture-hint`
- `capture-preview-wrap`
- `capture-preview`
- `capture-selection`
- `capture-actions`
- `capture-action-button`
- `capture-cancel-button`
- `capture-save-button`

## Browser Notes

- Screen and tab capture always require user permission
- Recording and capture must be started from a user action
- Browser chooser behavior is controlled by the browser, not by the component
- Chromium-based browsers are the safest target
