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

public enum RecorderStatus {
    IDLE("idle"),
    RECORDING("recording"),
    READY("ready"),
    DOWNLOADED("downloaded"),
    DENIED("denied"),
    ERROR("error");

    private final String clientValue;

    RecorderStatus(String clientValue) {
        this.clientValue = clientValue;
    }

    public String toClientValue() {
        return this.clientValue;
    }

    public static RecorderStatus fromClientValue(String value) {
        for (final RecorderStatus status : values()) {
            if (status.clientValue.equals(value)) {
                return status;
            }
        }

        throw new IllegalArgumentException("Unknown recorder status: " + value);
    }

    @Override
    public String toString() {
        return this.clientValue;
    }
}
