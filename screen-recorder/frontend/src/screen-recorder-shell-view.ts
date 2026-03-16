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
import { html, type TemplateResult } from "lit";

export type RecorderStatus = "idle" | "recording" | "ready" | "downloaded" | "denied" | "error";

export type RecorderShellState = {
  overlayOpen: boolean;
  statusVisible: boolean;
  statusLabel: string;
  status: RecorderStatus;
  recordEnabled: boolean;
  captureEnabled: boolean;
};

export type RecorderShellHandlers = {
  onShellPointerDown: (event: PointerEvent) => void;
  onRecordToggle: () => void;
  onCaptureClick: () => void;
};

export const renderRecorderShell = (
  state: RecorderShellState,
  handlers: RecorderShellHandlers
): TemplateResult => html`
  <div
    part="shell"
    aria-hidden=${state.overlayOpen ? "true" : "false"}
    @pointerdown=${handlers.onShellPointerDown}
  >
    <div part="handle" ?hidden=${!state.statusVisible}>
      <span part="status-indicator"></span>
      <span part="status-badge" role="status" aria-live="polite" aria-atomic="true">
        ${state.statusLabel}
      </span>
    </div>
    <vaadin-button
      part="button record-button"
      ?hidden=${!state.recordEnabled}
      ?disabled=${!state.recordEnabled}
      @click=${handlers.onRecordToggle}
    >
      ${state.status === "recording" ? "Stop" : "Record"}
    </vaadin-button>
    <vaadin-button
      part="button capture-button"
      ?hidden=${!state.captureEnabled}
      ?disabled=${!state.captureEnabled || state.status === "recording"}
      @click=${handlers.onCaptureClick}
    >
      Capture
    </vaadin-button>
  </div>
`;
