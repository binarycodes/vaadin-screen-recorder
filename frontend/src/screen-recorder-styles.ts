export const SCREEN_RECORDER_CSS = String.raw`
      :host {
        position: fixed;
        inset: auto;
        z-index: 10000;
        font-family: var(--screen-recorder-font-family, var(--lumo-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif));
        font-size: var(--screen-recorder-font-size, 14px);
        color: var(--screen-recorder-text-color, #f4f7fb);
      }

      :host([floating-disabled]) {
        position: static;
        inset: auto;
        z-index: auto;
        display: inline-block;
      }

      :host([overlay-open]) [part~="shell"] {
        visibility: hidden;
        pointer-events: none;
      }

      [part~="shell"] {
        position: fixed;
        top: var(--screen-recorder-shell-top, 24px);
        right: var(--screen-recorder-shell-right, 24px);
        display: flex;
        align-items: center;
        gap: var(--screen-recorder-shell-gap, 10px);
        padding: var(--screen-recorder-shell-padding, 10px 12px);
        border-radius: var(--screen-recorder-shell-radius, 18px);
        background: var(--screen-recorder-shell-background, linear-gradient(135deg, rgba(14, 20, 28, 0.96), rgba(32, 42, 57, 0.92)));
        color: var(--screen-recorder-text-color, #f4f7fb);
        box-shadow:
          var(--screen-recorder-shell-shadow-outer, 0 18px 40px rgba(6, 11, 17, 0.26)),
          var(--screen-recorder-shell-shadow-inner, inset 0 1px 0 rgba(255, 255, 255, 0.08));
        border: var(--screen-recorder-shell-border, 1px solid rgba(255, 255, 255, 0.1));
        backdrop-filter: var(--screen-recorder-shell-backdrop-filter, blur(14px));
        user-select: none;
        cursor: grab;
        touch-action: none;
      }

      :host([floating-disabled]) [part~="shell"] {
        position: relative;
        top: auto;
        right: auto;
        left: auto;
        border-radius: 0;
        box-shadow: none;
        cursor: default;
        touch-action: auto;
      }

      [part~="shell"]:active {
        cursor: grabbing;
      }

      :host([floating-disabled]) [part~="shell"]:active {
        cursor: default;
      }

      [part~="handle"] {
        display: flex;
        align-items: center;
        gap: var(--screen-recorder-handle-gap, 8px);
        padding-right: var(--screen-recorder-handle-padding-right, 6px);
      }

      [part~="status-indicator"] {
        width: var(--screen-recorder-indicator-size, 10px);
        height: var(--screen-recorder-indicator-size, 10px);
        border-radius: 999px;
        background: var(--indicator-color, #8ea4bc);
        box-shadow: 0 0 var(--screen-recorder-indicator-glow-size, 12px) color-mix(in srgb, var(--indicator-color, #8ea4bc) 60%, transparent);
      }

      [part~="status-badge"] {
        min-width: 74px;
        font-size: var(--screen-recorder-status-font-size, 11px);
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--screen-recorder-muted-text-color, #c8d5e3);
      }

      [part~="button"] {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: var(--screen-recorder-button-padding, 10px 14px);
        font: inherit;
        font-size: var(--screen-recorder-button-font-size, 13px);
        font-weight: 700;
        letter-spacing: 0.02em;
        cursor: pointer;
        transition: transform var(--screen-recorder-transition-duration, 140ms) ease, opacity var(--screen-recorder-transition-duration, 140ms) ease, background-color var(--screen-recorder-transition-duration, 140ms) ease;
      }

      vaadin-button[part~="button"]::part(button) {
        border: 0;
        border-radius: 999px;
        padding: var(--screen-recorder-button-padding, 10px 14px);
        font: inherit;
        font-size: var(--screen-recorder-button-font-size, 13px);
        font-weight: 700;
        letter-spacing: 0.02em;
        min-width: 0;
        margin: 0;
        line-height: 1.1;
      }

      vaadin-button[part~="button"]::part(label) {
        margin: 0;
      }

      [part~="button"]:hover {
        transform: translateY(-1px);
      }

      [part~="button"]:disabled {
        cursor: not-allowed;
        opacity: 0.45;
        transform: none;
      }

      [part~="record-button"] {
        min-width: var(--screen-recorder-record-min-width, 108px);
        background: var(--screen-recorder-record-background, linear-gradient(135deg, #ff6b57, #ff2f54));
        color: var(--screen-recorder-record-color, #fff6f4);
      }

      [part~="capture-button"] {
        background: var(--screen-recorder-capture-background, linear-gradient(135deg, #ffe6a7, #ffbf5e));
        color: var(--screen-recorder-capture-color, #3c2500);
      }

      [part~="preview-overlay"] {
        position: fixed;
        inset: 0;
        z-index: 10001;
        background: var(--screen-recorder-overlay-background, rgba(4, 8, 13, 0.82));
        display: grid;
        place-items: center;
      }

      [part~="preview-panel"] {
        width: min(92vw, 1200px);
        max-height: 92vh;
        padding: var(--screen-recorder-panel-padding, 18px);
        border-radius: var(--screen-recorder-panel-radius, 24px);
        background: var(--screen-recorder-panel-background, #0c1621);
        box-shadow: var(--screen-recorder-panel-shadow, 0 24px 60px rgba(0, 0, 0, 0.45));
        border: var(--screen-recorder-panel-border, 1px solid rgba(255, 255, 255, 0.08));
        color: var(--screen-recorder-panel-text-color, #e7eef7);
        font-family: var(--screen-recorder-font-family, var(--lumo-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif));
      }

      [part~="preview-toolbar"] {
        display: flex;
        justify-content: flex-start;
        gap: 8px;
        padding: var(--screen-recorder-toolbar-padding, 6px 0 10px 0);
        margin-bottom: 8px;
        border-bottom: var(--screen-recorder-toolbar-border-bottom, 1px solid rgba(255, 255, 255, 0.08));
      }

      [part~="preview-toolbar-button"] {
        appearance: none;
        border: var(--screen-recorder-toolbar-button-border, 1px solid rgba(255, 255, 255, 0.15));
        border-radius: var(--screen-recorder-toolbar-button-radius, 8px);
        width: var(--screen-recorder-toolbar-button-size, 32px);
        height: var(--screen-recorder-toolbar-button-size, 32px);
        padding: 0;
        font: inherit;
        font-size: var(--screen-recorder-toolbar-button-font-size, 16px);
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        cursor: pointer;
        background: var(--screen-recorder-toolbar-button-background, #1a2b3d);
        color: var(--screen-recorder-toolbar-button-color, #d9e6f4);
      }

      vaadin-button[part~="preview-toolbar-button"]::part(button) {
        border: var(--screen-recorder-toolbar-button-border, 1px solid rgba(255, 255, 255, 0.15));
        border-radius: var(--screen-recorder-toolbar-button-radius, 8px);
        width: var(--screen-recorder-toolbar-button-size, 32px);
        min-width: var(--screen-recorder-toolbar-button-size, 32px);
        height: var(--screen-recorder-toolbar-button-size, 32px);
        padding: 0;
        margin: 0;
        font: inherit;
        font-size: var(--screen-recorder-toolbar-button-font-size, 16px);
        font-weight: 700;
        line-height: 1;
        background: var(--screen-recorder-toolbar-button-background, #1a2b3d);
        color: var(--screen-recorder-toolbar-button-color, #d9e6f4);
      }

      vaadin-button[part~="preview-toolbar-button"]::part(label) {
        margin: 0;
      }

      [part~="preview-toolbar-button"]:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }

      [part~="preview-text-size-select"] {
        height: var(--screen-recorder-toolbar-button-size, 32px);
        min-width: 78px;
        border: var(--screen-recorder-toolbar-button-border, 1px solid rgba(255, 255, 255, 0.15));
        border-radius: var(--screen-recorder-toolbar-button-radius, 8px);
        background: var(--screen-recorder-toolbar-button-background, #1a2b3d);
        color: var(--screen-recorder-toolbar-button-color, #d9e6f4);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        padding: 0 8px;
      }

      [part~="preview-color-picker"] {
        position: relative;
        display: inline-flex;
      }

      [part~="preview-color-trigger"] {
        height: var(--screen-recorder-toolbar-button-size, 32px);
        min-width: 54px;
        border: var(--screen-recorder-toolbar-button-border, 1px solid rgba(255, 255, 255, 0.15));
        border-radius: var(--screen-recorder-toolbar-button-radius, 8px);
        background: var(--screen-recorder-toolbar-button-background, #1a2b3d);
        color: var(--screen-recorder-toolbar-button-color, #d9e6f4);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 0 8px;
        cursor: pointer;
        font: inherit;
      }

      vaadin-button[part~="preview-color-trigger"]::part(button) {
        height: var(--screen-recorder-toolbar-button-size, 32px);
        min-width: 54px;
        border: var(--screen-recorder-toolbar-button-border, 1px solid rgba(255, 255, 255, 0.15));
        border-radius: var(--screen-recorder-toolbar-button-radius, 8px);
        background: var(--screen-recorder-toolbar-button-background, #1a2b3d);
        color: var(--screen-recorder-toolbar-button-color, #d9e6f4);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 0 8px;
        margin: 0;
        font: inherit;
        min-height: 0;
      }

      vaadin-button[part~="preview-color-trigger"]::part(label) {
        margin: 0;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      [part~="preview-color-swatch"] {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        border: 1px solid rgba(255, 255, 255, 0.35);
      }

      [part~="preview-color-menu"] {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        display: grid;
        grid-template-columns: repeat(4, 18px);
        gap: 6px;
        padding: 8px;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: #132234;
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
        z-index: 3;
      }

      [part~="preview-color-menu"][hidden] {
        display: none !important;
      }

      [part~="preview-color-option"] {
        width: 18px;
        height: 18px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.35);
        padding: 0;
        cursor: pointer;
      }

      [part~="preview-color-option"][data-selected="true"] {
        outline: 2px solid #ffffff;
        outline-offset: 1px;
      }

      [part~="preview-trim-editor"] {
        display: flex;
        align-items: center;
        gap: 10px;
        flex: 1 1 auto;
        min-width: 0;
      }

      [part~="preview-trim-slider-wrap"] {
        position: relative;
        height: 28px;
        flex: 1 1 auto;
        min-width: 160px;
      }

      [part~="preview-trim-track"] {
        position: absolute;
        left: 0;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        height: 4px;
        border-radius: 999px;
        background: var(--screen-recorder-trim-track-background, rgba(255, 255, 255, 0.24));
      }

      [part~="preview-trim-active"] {
        position: absolute;
        top: 50%;
        transform: translateY(-50%);
        height: 4px;
        border-radius: 999px;
        background: var(--screen-recorder-trim-accent-color, #7ec8ff);
      }

      [part~="preview-trim-handle"] {
        position: absolute;
        top: 50%;
        width: 14px;
        height: 14px;
        transform: translate(-50%, -50%);
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.75);
        background: #eef6ff;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
        padding: 0;
        cursor: ew-resize;
        z-index: 4;
      }

      [part~="preview-trim-handle"]:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      [part~="preview-trim-time"] {
        width: 52px;
        text-align: right;
        font-size: 12px;
        color: var(--screen-recorder-panel-text-color, #e7eef7);
        font-variant-numeric: tabular-nums;
      }

      [part~="preview-toolbar-button"][aria-pressed="true"] {
        background: var(--screen-recorder-toolbar-button-active-background, #355a80);
        color: var(--screen-recorder-toolbar-button-active-color, #f4f9ff);
      }

      [part~="preview-heading"] {
        font-size: var(--screen-recorder-heading-font-size, 16px);
        font-weight: 700;
        margin-bottom: 6px;
      }

      [part~="preview-hint"] {
        font-size: var(--screen-recorder-hint-font-size, 13px);
        color: var(--screen-recorder-hint-color, #9cb2ca);
        margin-bottom: 14px;
      }

      [part~="preview-save-notice"] {
        display: none;
        margin-top: 8px;
        font-size: 12px;
        color: var(--screen-recorder-save-notice-color, #9edbb4);
      }

      [part~="preview-content-wrap"] {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        overflow: auto;
        max-height: calc(92vh - 150px);
        border-radius: var(--screen-recorder-preview-radius, 0px);
        background: var(--screen-recorder-preview-background, #08111a);
      }

      [part~="preview-stage"] {
        position: relative;
        flex: 0 0 auto;
      }

      [part~="preview-media"] {
        display: block;
        width: auto;
        max-width: 100%;
        height: auto;
        cursor: default;
      }

      [part~="recording-preview"] {
        display: block;
        width: 100%;
        height: auto;
        max-height: var(--screen-recorder-recording-preview-max-height, 62vh);
        background: var(--screen-recorder-recording-preview-background, #000);
      }

      [part~="preview-selection"] {
        position: absolute;
        border: var(--screen-recorder-selection-border, 2px solid #7ed0ff);
        background: var(--screen-recorder-selection-background, rgba(126, 208, 255, 0.18));
        pointer-events: none;
        display: none;
      }

      [part~="preview-annotations"] {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      [part~="preview-arrow"] {
        stroke: var(--screen-recorder-arrow-color, #ff5f57);
        stroke-width: var(--screen-recorder-arrow-width, 4px);
        fill: none;
        stroke-linecap: round;
      }

      [part~="preview-arrow-head"] {
        fill: var(--screen-recorder-arrow-color, #ff5f57);
      }

      [part~="preview-text"] {
        fill: var(--screen-recorder-text-annotation-color, #ffffff);
        font-size: var(--screen-recorder-text-annotation-size, 22px);
        font-family: var(--screen-recorder-text-annotation-font-family, var(--screen-recorder-font-family, var(--lumo-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)));
        font-weight: var(--screen-recorder-text-annotation-weight, 500);
        paint-order: stroke;
        stroke: var(--screen-recorder-text-annotation-stroke-color, transparent);
        stroke-width: var(--screen-recorder-text-annotation-stroke-width, 0px);
        stroke-linejoin: round;
      }

      [part~="preview-text-editor"] {
        position: absolute;
        min-width: 140px;
        min-height: 32px;
        padding: 6px 8px;
        border: var(--screen-recorder-text-editor-dark-border, 1px dashed rgba(255, 255, 255, 0.75));
        border-radius: var(--screen-recorder-text-editor-radius, 6px);
        background: var(--screen-recorder-text-editor-dark-background, rgba(7, 14, 22, 0.78));
        color: var(--screen-recorder-text-annotation-color, #ffffff);
        font-size: var(--screen-recorder-text-annotation-size, 22px);
        font-family: var(--screen-recorder-text-annotation-font-family, var(--screen-recorder-font-family, var(--lumo-font-family, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)));
        font-weight: var(--screen-recorder-text-annotation-weight, 500);
        line-height: 1.2;
        resize: both;
        outline: none;
        z-index: 2;
      }

      [part~="preview-actions"] {
        display: flex;
        justify-content: flex-end;
        gap: var(--screen-recorder-actions-gap, 10px);
        margin-top: var(--screen-recorder-actions-margin-top, 14px);
      }

      [part~="preview-action-button"] {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: var(--screen-recorder-button-padding, 10px 14px);
        font: inherit;
        font-size: var(--screen-recorder-button-font-size, 13px);
        font-weight: 700;
        cursor: pointer;
        transition: transform var(--screen-recorder-transition-duration, 140ms) ease, opacity var(--screen-recorder-transition-duration, 140ms) ease, background-color var(--screen-recorder-transition-duration, 140ms) ease;
      }

      vaadin-button[part~="preview-action-button"]::part(button) {
        border: 0;
        border-radius: 999px;
        padding: var(--screen-recorder-button-padding, 10px 14px);
        margin: 0;
        min-width: 0;
        font: inherit;
        font-size: var(--screen-recorder-button-font-size, 13px);
        font-weight: 700;
        line-height: 1.1;
      }

      vaadin-button[part~="preview-action-button"]::part(label) {
        margin: 0;
      }

      [part~="preview-action-button"]:hover {
        transform: translateY(-1px);
      }

      [part~="preview-action-button"]:disabled {
        cursor: not-allowed;
        opacity: 0.45;
        transform: none;
      }

      [part~="preview-cancel-button"] {
        background: var(--screen-recorder-cancel-background, #243445);
        color: var(--screen-recorder-cancel-color, #eef4fb);
      }

      [part~="preview-save-button"] {
        background: var(--screen-recorder-save-background, linear-gradient(135deg, #ffe6a7, #ffbf5e));
        color: var(--screen-recorder-save-color, #3c2500);
      }

      @media (max-width: 640px) {
        [part~="shell"] {
          gap: var(--screen-recorder-shell-gap-mobile, 8px);
          padding: var(--screen-recorder-shell-padding-mobile, 10px);
        }

        [part~="status-badge"] {
          display: none;
        }

        [part~="button"] {
          padding: var(--screen-recorder-button-padding-mobile, 10px 12px);
          font-size: var(--screen-recorder-button-font-size-mobile, 12px);
        }
      }
`;
