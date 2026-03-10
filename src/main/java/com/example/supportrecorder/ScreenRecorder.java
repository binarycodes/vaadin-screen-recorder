package com.example.supportrecorder;

import com.vaadin.flow.component.AbstractSinglePropertyField;
import com.vaadin.flow.component.ClientCallable;
import com.vaadin.flow.component.ComponentEvent;
import com.vaadin.flow.component.ComponentEventListener;
import com.vaadin.flow.component.Tag;
import com.vaadin.flow.component.dependency.JsModule;
import com.vaadin.flow.shared.Registration;

@Tag("screen-recorder")
@JsModule("./src/screen-recorder.ts")
public class ScreenRecorder extends AbstractSinglePropertyField<ScreenRecorder, String> {

    private boolean captureDownloadPending;

    public ScreenRecorder() {
        this(true, true);
    }

    private ScreenRecorder(boolean recordEnabled, boolean captureEnabled) {
        super("status", RecorderStatus.IDLE.toClientValue(), false);
        getElement().setProperty("recordEnabled", recordEnabled);
        getElement().setProperty("captureEnabled", captureEnabled);
    }

    public static ScreenRecorder create() {
        return new ScreenRecorder(true, true);
    }

    public static ScreenRecorder createRecorder() {
        return new ScreenRecorder(true, false);
    }

    public static ScreenRecorder createCapture() {
        return new ScreenRecorder(false, true);
    }

    public void start() {
        getElement().callJsFunction("start");
    }

    public void stop() {
        getElement().callJsFunction("stop");
    }

    public void download() {
        getElement().callJsFunction("download");
    }

    public Registration addRecordingStartedListener(ComponentEventListener<RecordingStartedEvent> listener) {
        return addListener(RecordingStartedEvent.class, listener);
    }

    public Registration addRecordingReadyListener(ComponentEventListener<RecordingReadyEvent> listener) {
        return addListener(RecordingReadyEvent.class, listener);
    }

    public Registration addDownloadCompletedListener(ComponentEventListener<DownloadCompletedEvent> listener) {
        return addListener(DownloadCompletedEvent.class, listener);
    }

    public Registration addCaptureCompletedListener(ComponentEventListener<CaptureCompletedEvent> listener) {
        return addListener(CaptureCompletedEvent.class, listener);
    }

    public Registration addPermissionDeniedListener(ComponentEventListener<PermissionDeniedEvent> listener) {
        return addListener(PermissionDeniedEvent.class, listener);
    }

    public Registration addErrorListener(ComponentEventListener<RecordingErrorEvent> listener) {
        return addListener(RecordingErrorEvent.class, listener);
    }

    @ClientCallable
    private void setStatusFromClient(String status) {
        setModelValue(status, true);
        final RecorderStatus recorderStatus = RecorderStatus.fromClientValue(status);
        fireStatusEvent(recorderStatus);
    }

    public RecorderStatus getStatus() {
        return RecorderStatus.fromClientValue(getValue());
    }

    private void fireStatusEvent(RecorderStatus status) {
        switch (status) {
            case RECORDING -> fireEvent(new RecordingStartedEvent(this, true));
            case READY -> fireEvent(new RecordingReadyEvent(this, true));
            case DOWNLOADED -> {
                if (captureDownloadPending) {
                    captureDownloadPending = false;
                } else {
                    fireEvent(new DownloadCompletedEvent(this, true));
                }
            }
            case DENIED -> fireEvent(new PermissionDeniedEvent(this, true));
            case ERROR -> fireEvent(new RecordingErrorEvent(this, true));
            case IDLE -> {
                // no-op
            }
        }
    }

    @ClientCallable
    private void notifyCaptureCompletedFromClient() {
        captureDownloadPending = true;
        fireEvent(new CaptureCompletedEvent(this, true));
    }

    public static class RecordingStartedEvent extends ComponentEvent<ScreenRecorder> {
        public RecordingStartedEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }

    public static class RecordingReadyEvent extends ComponentEvent<ScreenRecorder> {
        public RecordingReadyEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }

    public static class DownloadCompletedEvent extends ComponentEvent<ScreenRecorder> {
        public DownloadCompletedEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }

    public static class CaptureCompletedEvent extends ComponentEvent<ScreenRecorder> {
        public CaptureCompletedEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }

    public static class PermissionDeniedEvent extends ComponentEvent<ScreenRecorder> {
        public PermissionDeniedEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }

    public static class RecordingErrorEvent extends ComponentEvent<ScreenRecorder> {
        public RecordingErrorEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }
}
