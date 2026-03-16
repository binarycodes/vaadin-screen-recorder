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

/**
 * A Vaadin Flow component for in-browser screen recording and screen capture.
 * <p>
 * The component renders a toolbar with Record and Capture buttons. After stopping
 * a recording or completing a capture, it opens a preview dialog that lets the user
 * trim, annotate, and save the result before it is downloaded.
 * <p>
 * Use the static factories to create an instance:
 * <pre>{@code
 * // Both recording and capture enabled
 * ScreenRecorder recorder = ScreenRecorder.create();
 *
 * // Recording only
 * ScreenRecorder recorder = ScreenRecorder.createRecorder();
 *
 * // Capture only
 * ScreenRecorder recorder = ScreenRecorder.createCapture();
 * }</pre>
 *
 * The component can be placed inline in normal layout flow or switched to a
 * draggable floating mode via {@link #asFloating()} or {@link #setFloating(boolean)}.
 */
@Tag("screen-recorder")
@JsModule("./src/screen-recorder.ts")
public class ScreenRecorder extends AbstractSinglePropertyField<ScreenRecorder, String> {

    private boolean captureDownloadPending;

    /**
     * Creates a new {@code ScreenRecorder} with both recording and capture enabled.
     * Equivalent to {@link #create()}.
     */
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

    /**
     * Creates a new {@code ScreenRecorder} with both recording and capture enabled.
     *
     * @return a new recorder instance
     */
    public static ScreenRecorder create() {
        return new ScreenRecorder(true, true);
    }

    /**
     * Creates a new {@code ScreenRecorder} with only the recording feature enabled.
     * The capture button will be hidden.
     *
     * @return a new recorder instance
     */
    public static ScreenRecorder createRecorder() {
        return new ScreenRecorder(true, false);
    }

    /**
     * Creates a new {@code ScreenRecorder} with only the capture feature enabled.
     * The record button will be hidden.
     *
     * @return a new recorder instance
     */
    public static ScreenRecorder createCapture() {
        return new ScreenRecorder(false, true);
    }

    /**
     * Programmatically starts a recording session.
     * Has no effect if recording is already in progress or if recording is disabled.
     */
    public void start() {
        getElement().callJsFunction("start");
    }

    /**
     * Programmatically stops the current recording session and opens the preview dialog.
     * Has no effect if no recording is in progress.
     */
    public void stop() {
        getElement().callJsFunction("stop");
    }

    /**
     * Opens the recording preview dialog for the most recent recording.
     * Has no effect if no recording is available or if recording is disabled.
     */
    public void download() {
        getElement().callJsFunction("download");
    }

    /**
     * Sets whether the component renders as a draggable floating toolbar
     * ({@code true}) or inline in the normal layout flow ({@code false}).
     *
     * @param floating {@code true} to enable floating mode
     */
    public void setFloating(boolean floating) {
        getElement().setProperty("floatingEnabled", floating);
    }

    /**
     * Returns whether the component is currently in floating mode.
     *
     * @return {@code true} if floating mode is enabled
     */
    public boolean isFloating() {
        return getElement().getProperty("floatingEnabled", false);
    }

    /**
     * Enables floating mode on this instance and returns {@code this} for chaining.
     *
     * @return this instance
     */
    public ScreenRecorder asFloating() {
        setFloating(true);
        return this;
    }

    /**
     * Sets whether the status badge is visible in the toolbar.
     *
     * @param visible {@code true} to show the status badge (default), {@code false} to hide it
     */
    public void setStatusVisible(boolean visible) {
        getElement().setProperty("statusVisible", visible);
    }

    /**
     * Returns whether the status badge is currently visible.
     *
     * @return {@code true} if the status badge is visible
     */
    public boolean isStatusVisible() {
        return getElement().getProperty("statusVisible", true);
    }

    /**
     * Adds a listener that is notified when a recording session starts.
     *
     * @param listener the listener to add
     * @return a {@link Registration} that can be used to remove the listener
     */
    public Registration addRecordingStartedListener(ComponentEventListener<RecordingStartedEvent> listener) {
        return addListener(RecordingStartedEvent.class, listener);
    }

    /**
     * Adds a listener that is notified when a recording session stops and the
     * recording is ready to preview or download.
     *
     * @param listener the listener to add
     * @return a {@link Registration} that can be used to remove the listener
     */
    public Registration addRecordingReadyListener(ComponentEventListener<RecordingReadyEvent> listener) {
        return addListener(RecordingReadyEvent.class, listener);
    }

    /**
     * Adds a listener that is notified when a completed recording has been downloaded.
     *
     * @param listener the listener to add
     * @return a {@link Registration} that can be used to remove the listener
     */
    public Registration addDownloadCompletedListener(ComponentEventListener<DownloadCompletedEvent> listener) {
        return addListener(DownloadCompletedEvent.class, listener);
    }

    /**
     * Adds a listener that is notified when a screen capture has been completed and downloaded.
     *
     * @param listener the listener to add
     * @return a {@link Registration} that can be used to remove the listener
     */
    public Registration addCaptureCompletedListener(ComponentEventListener<CaptureCompletedEvent> listener) {
        return addListener(CaptureCompletedEvent.class, listener);
    }

    /**
     * Adds a listener that is notified when the user denies the screen capture permission request.
     *
     * @param listener the listener to add
     * @return a {@link Registration} that can be used to remove the listener
     */
    public Registration addPermissionDeniedListener(ComponentEventListener<PermissionDeniedEvent> listener) {
        return addListener(PermissionDeniedEvent.class, listener);
    }

    /**
     * Adds a listener that is notified when an unexpected error occurs during recording or capture.
     *
     * @param listener the listener to add
     * @return a {@link Registration} that can be used to remove the listener
     */
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

    /**
     * Returns the current recorder status.
     *
     * @return the current {@link RecorderStatus}
     */
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

    /** Fired when a recording session starts. */
    public static class RecordingStartedEvent extends ComponentEvent<ScreenRecorder> {
        public RecordingStartedEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }

    /** Fired when a recording stops and is ready to preview or download. */
    public static class RecordingReadyEvent extends ComponentEvent<ScreenRecorder> {
        public RecordingReadyEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }

    /** Fired when a completed recording has been downloaded by the user. */
    public static class DownloadCompletedEvent extends ComponentEvent<ScreenRecorder> {
        public DownloadCompletedEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }

    /** Fired when a screen capture has been completed and downloaded. */
    public static class CaptureCompletedEvent extends ComponentEvent<ScreenRecorder> {
        public CaptureCompletedEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }

    /** Fired when the user denies the screen capture permission request. */
    public static class PermissionDeniedEvent extends ComponentEvent<ScreenRecorder> {
        public PermissionDeniedEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }

    /** Fired when an unexpected error occurs during recording or capture. */
    public static class RecordingErrorEvent extends ComponentEvent<ScreenRecorder> {
        public RecordingErrorEvent(ScreenRecorder source, boolean fromClient) {
            super(source, fromClient);
        }
    }
}
