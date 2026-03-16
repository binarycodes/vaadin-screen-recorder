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

/**
 * Represents the lifecycle states of a {@link ScreenRecorder} component.
 * <p>
 * Status transitions follow the recording or capture flow:
 * {@code IDLE} &rarr; {@code RECORDING} &rarr; {@code READY} &rarr; {@code DOWNLOADED},
 * or {@code IDLE} &rarr; {@code DENIED} / {@code ERROR} on failure.
 */
public enum RecorderStatus {

    /** The component is idle and ready to start a new recording or capture. */
    IDLE("idle"),

    /** A screen recording is currently in progress. */
    RECORDING("recording"),

    /** A recording has been stopped and is ready to preview and download. */
    READY("ready"),

    /** The recording or capture has been downloaded by the user. */
    DOWNLOADED("downloaded"),

    /** The user denied the screen capture permission request. */
    DENIED("denied"),

    /** An unexpected error occurred during recording or capture. */
    ERROR("error");

    private final String clientValue;

    RecorderStatus(String clientValue) {
        this.clientValue = clientValue;
    }

    /**
     * Returns the string value used to represent this status on the client side.
     *
     * @return the client-side status string
     */
    public String toClientValue() {
        return this.clientValue;
    }

    /**
     * Returns the {@code RecorderStatus} that corresponds to the given client-side value.
     *
     * @param value the client-side status string
     * @return the matching {@code RecorderStatus}
     * @throws IllegalArgumentException if no status matches the given value
     */
    public static RecorderStatus fromClientValue(String value) {
        for (final RecorderStatus status : values()) {
            if (status.clientValue.equals(value)) {
                return status;
            }
        }

        throw new IllegalArgumentException("Unknown recorder status: " + value);
    }

    /**
     * Returns the client-side string value of this status.
     *
     * @return the client-side status string
     */
    @Override
    public String toString() {
        return this.clientValue;
    }
}
