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
