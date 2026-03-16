package io.binarycodes.vaadin.screenrecorder;

/*-
 * #%L
 * Screen Recorder
 * %%
 * Copyright (C) 2025 - 2026 binarycodes
 * %%
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * #L%
 */

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
        getElement().setProperty("floatingEnabled", false);
        getElement().setProperty("statusVisible", true);
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

    public void setFloating(boolean floating) {
        getElement().setProperty("floatingEnabled", floating);
    }

    public boolean isFloating() {
        return getElement().getProperty("floatingEnabled", false);
    }

    public ScreenRecorder asFloating() {
        setFloating(true);
        return this;
    }

    public void setStatusVisible(boolean visible) {
        getElement().setProperty("statusVisible", visible);
    }

    public boolean isStatusVisible() {
        return getElement().getProperty("statusVisible", true);
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
        try {
            fireStatusEvent(RecorderStatus.fromClientValue(status));
        } catch (IllegalArgumentException e) {
            fireStatusEvent(RecorderStatus.ERROR);
        }
    }

    public RecorderStatus getStatus() {
        final String value = getValue();
        return value != null ? RecorderStatus.fromClientValue(value) : RecorderStatus.IDLE;
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
