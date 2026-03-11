import type { RecorderStatus } from "./screen-recorder-shell-view";

type VaadinButtonElement = HTMLElement & { disabled: boolean };

export type CaptureOverlayHost = {
  clamp: (value: number, min: number, max: number) => number;
  closePreviewOverlay: () => void;
  cssVar: (name: string, fallback: string) => string;
  nextA11yId: (prefix: string) => string;
  notifyCaptureCompleted: () => void;
  scheduleIdleReset: () => void;
  setPreviewOverlay: (overlay: HTMLDivElement, cleanup: () => void) => void;
  setStatus: (status: RecorderStatus) => void;
  setupDialogA11y: (
    overlay: HTMLDivElement,
    panel: HTMLElement,
    heading: HTMLElement,
    hint: HTMLElement | null,
    onEscape: () => void,
    initialFocus: HTMLElement
  ) => () => void;
  timestamp: (value: Date) => string;
};

export async function openCaptureOverlay(host: CaptureOverlayHost, frame: ImageBitmap): Promise<void> {
  const overlay = document.createElement("div");
  overlay.setAttribute("part", "preview-overlay");

  const panel = document.createElement("div");
  panel.setAttribute("part", "preview-panel");

  const toolbar = document.createElement("div");
  toolbar.setAttribute("part", "preview-toolbar");

  const cropToggle = document.createElement("vaadin-button") as VaadinButtonElement;
  cropToggle.textContent = "✂";
  cropToggle.setAttribute("part", "preview-toolbar-button preview-crop-button");
  cropToggle.setAttribute("aria-label", "Crop");
  cropToggle.title = "Crop";
  cropToggle.setAttribute("aria-pressed", "false");

  const arrowToggle = document.createElement("vaadin-button") as VaadinButtonElement;
  arrowToggle.textContent = "➤";
  arrowToggle.setAttribute("part", "preview-toolbar-button preview-arrow-button");
  arrowToggle.setAttribute("aria-label", "Arrow");
  arrowToggle.title = "Arrow";
  arrowToggle.setAttribute("aria-pressed", "false");

  const textSizeSelect = document.createElement("select");
  textSizeSelect.setAttribute("part", "preview-text-size-select");
  textSizeSelect.setAttribute("aria-label", "Text size");
  for (const size of [14, 18, 22, 28, 36]) {
    const option = document.createElement("option");
    option.value = `${size}`;
    option.textContent = `${size}px`;
    textSizeSelect.append(option);
  }

  const paletteDefaults = [
    "#e53935", "#fb8c00", "#fdd835", "#43a047",
    "#00897b", "#00acc1", "#1e88e5", "#3949ab",
    "#8e24aa", "#d81b60", "#6d4c41", "#757575",
    "#212121", "#ffffff", "#90a4ae", "#ffb300"
  ];
  const paletteColors = paletteDefaults.map((fallback, index) => host.cssVar(`--screen-recorder-palette-${index + 1}`, fallback));
  const colorProbe = document.createElement("span");
  colorProbe.style.display = "none";
  overlay.append(colorProbe);

  let activeArrowColor = host.cssVar("--screen-recorder-arrow-color", "#ff5f57");
  let activeTextColor = host.cssVar("--screen-recorder-text-annotation-color", "#ffffff");

  const resolveRgb = (colorValue: string): { r: number; g: number; b: number } | null => {
    colorProbe.style.color = "";
    colorProbe.style.color = colorValue;
    const resolved = getComputedStyle(colorProbe).color;
    const match = resolved.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) {
      return null;
    }
    return {
      r: Number.parseInt(match[1], 10),
      g: Number.parseInt(match[2], 10),
      b: Number.parseInt(match[3], 10)
    };
  };

  const shouldUseLightEditorBackground = (colorValue: string): boolean => {
    const rgb = resolveRgb(colorValue);
    if (!rgb) {
      return false;
    }
    const toLinear = (channel: number) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (0.2126 * toLinear(rgb.r)) + (0.7152 * toLinear(rgb.g)) + (0.0722 * toLinear(rgb.b));
    return luminance < 0.42;
  };

  let activeTextEditor: HTMLTextAreaElement | null = null;
  let activeTextOrigin: { x: number; y: number } | null = null;

  const syncTextEditorContrast = () => {
    if (!activeTextEditor) {
      return;
    }
    const useLightBackground = shouldUseLightEditorBackground(activeTextColor);
    activeTextEditor.style.color = activeTextColor;
    activeTextEditor.style.background = useLightBackground
      ? host.cssVar("--screen-recorder-text-editor-light-background", "rgba(255, 255, 255, 0.9)")
      : host.cssVar("--screen-recorder-text-editor-dark-background", "rgba(7, 14, 22, 0.78)");
    activeTextEditor.style.border = useLightBackground
      ? host.cssVar("--screen-recorder-text-editor-light-border", "1px dashed rgba(7, 14, 22, 0.65)")
      : host.cssVar("--screen-recorder-text-editor-dark-border", "1px dashed rgba(255, 255, 255, 0.75)");
  };

  const createColorPicker = (
    label: string,
    pickerParts: string,
    getColor: () => string,
    setColor: (value: string) => void
  ) => {
    const normalizeColor = (value: string): string => {
      const probe = document.createElement("span");
      probe.style.color = value;
      return probe.style.color.replace(/\s+/g, "").toLowerCase();
    };

    const wrapper = document.createElement("div");
    wrapper.setAttribute("part", `preview-color-picker ${pickerParts}`);

    const trigger = document.createElement("vaadin-button") as VaadinButtonElement;
    trigger.setAttribute("part", "preview-color-trigger");
    trigger.setAttribute("aria-label", `${label} color`);
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const swatch = document.createElement("span");
    swatch.setAttribute("part", "preview-color-swatch");
    const caret = document.createElement("span");
    caret.textContent = "▾";
    trigger.append(swatch, caret);

    const menu = document.createElement("div");
    menu.setAttribute("part", "preview-color-menu");
    menu.setAttribute("role", "listbox");
    menu.setAttribute("aria-label", `${label} color options`);
    const menuId = host.nextA11yId("color-menu");
    menu.id = menuId;
    trigger.setAttribute("aria-controls", menuId);
    menu.hidden = true;

    const options: HTMLButtonElement[] = [];
    for (const color of paletteColors) {
      const option = document.createElement("button");
      option.type = "button";
      option.setAttribute("part", "preview-color-option");
      option.setAttribute("role", "option");
      option.dataset.color = normalizeColor(color);
      option.style.background = color;
      option.setAttribute("aria-label", `${label} ${color}`);
      option.addEventListener("click", () => {
        setColor(color);
        sync();
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      });
      options.push(option);
      menu.append(option);
    }

    const sync = () => {
      const current = normalizeColor(getColor());
      swatch.style.background = getColor();
      for (const option of options) {
        option.dataset.selected = option.dataset.color === current ? "true" : "false";
        option.setAttribute("aria-selected", option.dataset.selected);
      }
    };
    sync();

    wrapper.append(trigger, menu);
    return { wrapper, menu, trigger, sync };
  };

  const arrowColorPicker = createColorPicker(
    "Arrow",
    "preview-arrow-color-picker",
    () => activeArrowColor,
    (value) => {
      activeArrowColor = value;
    }
  );

  const textColorPicker = createColorPicker(
    "Text",
    "preview-text-color-picker",
    () => activeTextColor,
    (value) => {
      activeTextColor = value;
      syncTextEditorContrast();
    }
  );

  const closeColorMenus = () => {
    arrowColorPicker.menu.hidden = true;
    textColorPicker.menu.hidden = true;
    arrowColorPicker.trigger.setAttribute("aria-expanded", "false");
    textColorPicker.trigger.setAttribute("aria-expanded", "false");
  };

  const onColorTriggerClick = (menu: HTMLDivElement) => {
    const shouldOpen = menu.hidden;
    closeColorMenus();
    if (shouldOpen) {
      menu.hidden = false;
      if (menu === arrowColorPicker.menu) {
        arrowColorPicker.trigger.setAttribute("aria-expanded", "true");
      } else if (menu === textColorPicker.menu) {
        textColorPicker.trigger.setAttribute("aria-expanded", "true");
      }
    }
  };

  const onArrowColorTriggerClick = () => onColorTriggerClick(arrowColorPicker.menu);
  const onTextColorTriggerClick = () => onColorTriggerClick(textColorPicker.menu);
  arrowColorPicker.trigger.addEventListener("click", onArrowColorTriggerClick);
  textColorPicker.trigger.addEventListener("click", onTextColorTriggerClick);

  const undoButton = document.createElement("vaadin-button") as VaadinButtonElement;
  undoButton.textContent = "↶";
  undoButton.setAttribute("part", "preview-toolbar-button preview-undo-button");
  undoButton.setAttribute("aria-label", "Undo");
  undoButton.title = "Undo";
  undoButton.disabled = true;

  const textToggle = document.createElement("vaadin-button") as VaadinButtonElement;
  textToggle.textContent = "T";
  textToggle.setAttribute("part", "preview-toolbar-button preview-text-button");
  textToggle.setAttribute("aria-label", "Text");
  textToggle.title = "Text";
  textToggle.setAttribute("aria-pressed", "false");
  toolbar.append(
    cropToggle,
    arrowToggle,
    arrowColorPicker.wrapper,
    textToggle,
    textColorPicker.wrapper,
    textSizeSelect,
    undoButton
  );

  const heading = document.createElement("div");
  heading.textContent = "Capture preview";
  heading.setAttribute("part", "preview-heading");

  const hint = document.createElement("div");
  hint.textContent = "Use Crop, Arrow, or Text. In Text mode, click to place or drag to size a text box.";
  hint.setAttribute("part", "preview-hint");

  const previewWrap = document.createElement("div");
  previewWrap.setAttribute("part", "preview-content-wrap");

  const canvas = document.createElement("canvas");
  const maxWidth = Math.min(window.innerWidth * 0.9, 1160);
  const maxHeight = Math.min(window.innerHeight * 0.64, 720);
  const scale = Math.min(maxWidth / frame.width, maxHeight / frame.height, 1);
  canvas.width = Math.max(1, Math.round(frame.width * scale));
  canvas.height = Math.max(1, Math.round(frame.height * scale));
  canvas.setAttribute("part", "preview-media");

  const context = canvas.getContext("2d");
  if (!context) {
    frame.close();
    throw new Error("Canvas context unavailable");
  }
  context.drawImage(frame, 0, 0, canvas.width, canvas.height);

  const selection = document.createElement("div");
  selection.setAttribute("part", "preview-selection");

  const annotations = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  annotations.setAttribute("part", "preview-annotations");
  annotations.setAttribute("aria-hidden", "true");
  const arrowsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const textsLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  annotations.append(arrowsLayer, textsLayer);

  const previewStage = document.createElement("div");
  previewStage.setAttribute("part", "preview-stage");
  previewStage.append(canvas, annotations, selection);

  previewWrap.append(previewStage);

  const actions = document.createElement("div");
  actions.setAttribute("part", "preview-actions");

  const cancel = document.createElement("vaadin-button") as VaadinButtonElement;
  cancel.textContent = "Cancel";
  cancel.setAttribute("part", "preview-action-button preview-cancel-button");

  const save = document.createElement("vaadin-button") as VaadinButtonElement;
  save.textContent = "Save capture";
  save.setAttribute("part", "preview-action-button preview-save-button");

  actions.append(cancel, save);
  panel.append(heading, toolbar, hint, previewWrap, actions);
  overlay.append(panel);

  type Arrow = { x1: number; y1: number; x2: number; y2: number; color: string };
  type TextAnnotation = { x: number; y: number; text: string; sizePx: number; color: string };
  type PreviewSnapshot = {
    imageData: ImageData;
    arrows: Arrow[];
    texts: TextAnnotation[];
  };
  type EditAction = { type: "arrow" } | { type: "text" } | { type: "crop-preview"; snapshot: PreviewSnapshot };
  const rect = { x: 0, y: 0, width: 0, height: 0 };
  const arrows: Arrow[] = [];
  const texts: TextAnnotation[] = [];
  const history: EditAction[] = [];
  let textCommitInProgress = false;
  let textPlacing = false;
  let textStartX = 0;
  let textStartY = 0;
  let draftArrow: Arrow | null = null;
  let activeTool: "crop" | "arrow" | "text" | null = null;
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let activeTextSize = Number.parseFloat(host.cssVar("--screen-recorder-text-annotation-size", "22")) || 22;
  textSizeSelect.value = `${Math.round(activeTextSize)}`;
  if (!textSizeSelect.value) {
    textSizeSelect.value = "22";
    activeTextSize = 22;
  }

  const hasValidCrop = () => rect.width >= 2 && rect.height >= 2;
  const pointInRect = (x: number, y: number, targetRect: { x: number; y: number; width: number; height: number }) =>
    x >= targetRect.x && x <= targetRect.x + targetRect.width && y >= targetRect.y && y <= targetRect.y + targetRect.height;
  const hasVisibleArrow = (arrow: Arrow) => Math.hypot(arrow.x2 - arrow.x1, arrow.y2 - arrow.y1) >= 6;
  const arrowHeadPoints = (arrow: Arrow): string => {
    const angle = Math.atan2(arrow.y2 - arrow.y1, arrow.x2 - arrow.x1);
    const headLength = 18;
    const headWidth = 6;
    const leftX = arrow.x2 - headLength * Math.cos(angle) + headWidth * Math.sin(angle);
    const leftY = arrow.y2 - headLength * Math.sin(angle) - headWidth * Math.cos(angle);
    const rightX = arrow.x2 - headLength * Math.cos(angle) - headWidth * Math.sin(angle);
    const rightY = arrow.y2 - headLength * Math.sin(angle) + headWidth * Math.cos(angle);
    return `${arrow.x2},${arrow.y2} ${leftX},${leftY} ${rightX},${rightY}`;
  };

  const renderArrows = () => {
    const bounds = canvas.getBoundingClientRect();
    annotations.setAttribute("viewBox", `0 0 ${Math.max(bounds.width, 1)} ${Math.max(bounds.height, 1)}`);
    arrowsLayer.replaceChildren();

    for (const arrow of [...arrows, ...(draftArrow ? [draftArrow] : [])]) {
      if (!hasVisibleArrow(arrow)) {
        continue;
      }
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("part", "preview-arrow");
      line.setAttribute("x1", `${arrow.x1}`);
      line.setAttribute("y1", `${arrow.y1}`);
      line.setAttribute("x2", `${arrow.x2}`);
      line.setAttribute("y2", `${arrow.y2}`);
      line.style.stroke = arrow.color;

      const head = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      head.setAttribute("part", "preview-arrow-head");
      head.setAttribute("points", arrowHeadPoints(arrow));
      head.style.fill = arrow.color;

      arrowsLayer.append(line, head);
    }
  };

  const renderTexts = () => {
    textsLayer.replaceChildren();
    for (const annotation of texts) {
      const lineHeight = annotation.sizePx * 1.2;
      const lines = annotation.text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const textNode = document.createElementNS("http://www.w3.org/2000/svg", "text");
        textNode.setAttribute("part", "preview-text");
        textNode.setAttribute("x", `${annotation.x}`);
        textNode.setAttribute("y", `${annotation.y + (i * lineHeight)}`);
        textNode.setAttribute("dominant-baseline", "hanging");
        textNode.setAttribute("style", `font-size:${annotation.sizePx}px;fill:${annotation.color}`);
        textNode.textContent = lines[i] || " ";
        textsLayer.append(textNode);
      }
    }
  };

  const updateUndoState = () => {
    undoButton.disabled = history.length === 0;
  };

  const snapshotPreview = (): PreviewSnapshot => {
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return {
      imageData: new ImageData(new Uint8ClampedArray(imageData.data), imageData.width, imageData.height),
      arrows: arrows.map((arrow) => ({ ...arrow })),
      texts: texts.map((annotation) => ({ ...annotation }))
    };
  };

  const restorePreview = (snapshot: PreviewSnapshot) => {
    canvas.width = snapshot.imageData.width;
    canvas.height = snapshot.imageData.height;
    context.putImageData(snapshot.imageData, 0, 0);
    arrows.splice(0, arrows.length, ...snapshot.arrows.map((arrow) => ({ ...arrow })));
    texts.splice(0, texts.length, ...snapshot.texts.map((annotation) => ({ ...annotation })));
    rect.x = 0;
    rect.y = 0;
    rect.width = 0;
    rect.height = 0;
    redrawSelection();
    renderArrows();
    renderTexts();
  };

  const applyCropPreview = () => {
    if (activeTool !== "crop" || !hasValidCrop()) {
      return false;
    }
    const bounds = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(bounds.width, 1);
    const scaleY = canvas.height / Math.max(bounds.height, 1);
    const sourceX = Math.max(0, Math.round(rect.x * scaleX));
    const sourceY = Math.max(0, Math.round(rect.y * scaleY));
    const sourceWidth = Math.max(1, Math.round(rect.width * scaleX));
    const sourceHeight = Math.max(1, Math.round(rect.height * scaleY));
    const maxSourceX = Math.max(0, canvas.width - 1);
    const maxSourceY = Math.max(0, canvas.height - 1);
    const safeSourceX = Math.min(sourceX, maxSourceX);
    const safeSourceY = Math.min(sourceY, maxSourceY);
    const safeSourceWidth = Math.min(sourceWidth, canvas.width - safeSourceX);
    const safeSourceHeight = Math.min(sourceHeight, canvas.height - safeSourceY);
    if (safeSourceWidth < 1 || safeSourceHeight < 1) {
      return false;
    }

    const snapshot = snapshotPreview();
    const cropped = document.createElement("canvas");
    cropped.width = safeSourceWidth;
    cropped.height = safeSourceHeight;
    const croppedContext = cropped.getContext("2d");
    if (!croppedContext) {
      return false;
    }
    croppedContext.drawImage(
      canvas,
      safeSourceX,
      safeSourceY,
      safeSourceWidth,
      safeSourceHeight,
      0,
      0,
      safeSourceWidth,
      safeSourceHeight
    );

    canvas.width = safeSourceWidth;
    canvas.height = safeSourceHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(cropped, 0, 0);

    for (const arrow of arrows) {
      arrow.x1 -= rect.x;
      arrow.y1 -= rect.y;
      arrow.x2 -= rect.x;
      arrow.y2 -= rect.y;
    }
    for (const annotation of texts) {
      annotation.x -= rect.x;
      annotation.y -= rect.y;
    }

    rect.x = 0;
    rect.y = 0;
    rect.width = 0;
    rect.height = 0;
    history.push({ type: "crop-preview", snapshot });
    updateUndoState();
    redrawSelection();
    renderArrows();
    renderTexts();
    return true;
  };

  const removeTextEditor = () => {
    if (activeTextEditor) {
      activeTextEditor.remove();
    }
    activeTextEditor = null;
    activeTextOrigin = null;
  };

  const commitTextEditor = () => {
    if (!activeTextEditor || !activeTextOrigin || textCommitInProgress) {
      return;
    }
    textCommitInProgress = true;
    const text = activeTextEditor.value.trim();
    const origin = activeTextOrigin;
    if (text) {
      texts.push({ x: origin.x, y: origin.y, text, sizePx: activeTextSize, color: activeTextColor });
      history.push({ type: "text" });
      updateUndoState();
      renderTexts();
    }
    removeTextEditor();
    textCommitInProgress = false;
  };

  const startTextEditor = (x: number, y: number, width = 160, height = 42) => {
    commitTextEditor();
    const editor = document.createElement("textarea");
    editor.setAttribute("part", "preview-text-editor");
    editor.style.left = `${x}px`;
    editor.style.top = `${y}px`;
    editor.style.width = `${Math.max(140, width)}px`;
    editor.style.height = `${Math.max(32, height)}px`;
    editor.style.fontSize = `${activeTextSize}px`;
    editor.placeholder = "Type text";
    previewStage.append(editor);
    activeTextEditor = editor;
    activeTextOrigin = { x, y };
    syncTextEditorContrast();

    editor.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        commitTextEditor();
      } else if (event.key === "Escape") {
        event.preventDefault();
        removeTextEditor();
      }
    });
    editor.addEventListener("blur", () => {
      commitTextEditor();
    });
  };

  const setTool = (tool: "crop" | "arrow" | "text" | null) => {
    activeTool = tool;
    cropToggle.setAttribute("aria-pressed", tool === "crop" ? "true" : "false");
    arrowToggle.setAttribute("aria-pressed", tool === "arrow" ? "true" : "false");
    textToggle.setAttribute("aria-pressed", tool === "text" ? "true" : "false");
    canvas.style.cursor = tool === "text" ? "text" : tool ? "crosshair" : "default";
    if (tool !== "crop") {
      rect.x = 0;
      rect.y = 0;
      rect.width = 0;
      rect.height = 0;
    }
    if (tool !== "arrow") {
      draftArrow = null;
    }
    if (tool !== "text") {
      commitTextEditor();
    }
    redrawSelection();
    renderArrows();
  };

  const redrawSelection = () => {
    if (activeTool !== "crop" || !hasValidCrop()) {
      selection.style.display = "none";
      return;
    }
    selection.style.display = "block";
    selection.style.left = `${rect.x}px`;
    selection.style.top = `${rect.y}px`;
    selection.style.width = `${rect.width}px`;
    selection.style.height = `${rect.height}px`;
  };

  const getPoint = (event: PointerEvent) => {
    const bounds = canvas.getBoundingClientRect();
    return {
      x: host.clamp(event.clientX - bounds.left, 0, bounds.width),
      y: host.clamp(event.clientY - bounds.top, 0, bounds.height)
    };
  };

  const onPointerDown = (event: PointerEvent) => {
    if (!activeTool) {
      return;
    }
    const point = getPoint(event);
    if (activeTool === "crop") {
      if (hasValidCrop() && !pointInRect(point.x, point.y, rect)) {
        applyCropPreview();
        return;
      }
      dragging = true;
      startX = point.x;
      startY = point.y;
      rect.x = point.x;
      rect.y = point.y;
      rect.width = 0;
      rect.height = 0;
      redrawSelection();
      canvas.setPointerCapture(event.pointerId);
    } else if (activeTool === "arrow") {
      dragging = true;
      draftArrow = { x1: point.x, y1: point.y, x2: point.x, y2: point.y, color: activeArrowColor };
      renderArrows();
      canvas.setPointerCapture(event.pointerId);
    } else {
      dragging = true;
      textPlacing = true;
      textStartX = point.x;
      textStartY = point.y;
      startTextEditor(point.x, point.y, 160, 42);
      canvas.setPointerCapture(event.pointerId);
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!activeTool || !dragging) {
      return;
    }
    const point = getPoint(event);
    if (activeTool === "crop") {
      rect.x = Math.min(startX, point.x);
      rect.y = Math.min(startY, point.y);
      rect.width = Math.abs(point.x - startX);
      rect.height = Math.abs(point.y - startY);
      redrawSelection();
    } else if (activeTool === "arrow" && draftArrow) {
      draftArrow.x2 = point.x;
      draftArrow.y2 = point.y;
      renderArrows();
    } else if (activeTool === "text" && textPlacing && activeTextEditor) {
      const nextLeft = Math.min(textStartX, point.x);
      const nextTop = Math.min(textStartY, point.y);
      const nextWidth = Math.max(140, Math.abs(point.x - textStartX));
      const nextHeight = Math.max(32, Math.abs(point.y - textStartY));
      activeTextEditor.style.left = `${nextLeft}px`;
      activeTextEditor.style.top = `${nextTop}px`;
      activeTextEditor.style.width = `${nextWidth}px`;
      activeTextEditor.style.height = `${nextHeight}px`;
      activeTextOrigin = { x: nextLeft, y: nextTop };
    }
  };

  const onPointerUp = (event: PointerEvent) => {
    if (!activeTool) {
      return;
    }
    dragging = false;
    if (activeTool === "arrow" && draftArrow) {
      if (hasVisibleArrow(draftArrow)) {
        arrows.push({ ...draftArrow });
        history.push({ type: "arrow" });
        updateUndoState();
      }
      draftArrow = null;
      renderArrows();
    } else if (activeTool === "text" && textPlacing) {
      textPlacing = false;
      activeTextEditor?.focus();
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };

  const onCropToggle = () => {
    setTool(activeTool === "crop" ? null : "crop");
  };

  const onArrowToggle = () => {
    setTool(activeTool === "arrow" ? null : "arrow");
  };

  const onTextToggle = () => {
    setTool(activeTool === "text" ? null : "text");
  };

  const onUndo = () => {
    const action = history.pop();
    if (!action) {
      updateUndoState();
      return;
    }

    if (action.type === "arrow") {
      arrows.pop();
      renderArrows();
    } else if (action.type === "text") {
      texts.pop();
      renderTexts();
    } else {
      restorePreview(action.snapshot);
    }

    updateUndoState();
  };

  const onTextSizeChange = () => {
    const selected = Number.parseFloat(textSizeSelect.value);
    if (!Number.isFinite(selected) || selected <= 0) {
      return;
    }
    activeTextSize = selected;
    if (activeTextEditor) {
      activeTextEditor.style.fontSize = `${activeTextSize}px`;
    }
  };

  const onOverlayPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      closeColorMenus();
      return;
    }
    if (!arrowColorPicker.wrapper.contains(target) && !textColorPicker.wrapper.contains(target)) {
      closeColorMenus();
    }
    if (activeTool === "crop" && hasValidCrop() && !canvas.contains(target) && !selection.contains(target)) {
      applyCropPreview();
    }
  };

  const closeOverlay = () => {
    host.closePreviewOverlay();
  };
  const dialogCleanup = host.setupDialogA11y(overlay, panel, heading, hint, () => closeOverlay(), cancel);

  const onCancel = () => {
    closeOverlay();
  };

  const onSave = async () => {
    commitTextEditor();
    const output = document.createElement("canvas");
    const previewBounds = canvas.getBoundingClientRect();
    const ratioX = canvas.width / Math.max(previewBounds.width, 1);
    const ratioY = canvas.height / Math.max(previewBounds.height, 1);
    output.width = canvas.width;
    output.height = canvas.height;
    const outputContext = output.getContext("2d");
    if (!outputContext) {
      host.setStatus("error");
      closeOverlay();
      return;
    }

    outputContext.drawImage(canvas, 0, 0);

    const arrowWidth = Number.parseFloat(host.cssVar("--screen-recorder-arrow-width", "4")) || 4;
    for (const arrow of arrows) {
      const ax1 = Math.round(arrow.x1 * ratioX);
      const ay1 = Math.round(arrow.y1 * ratioY);
      const ax2 = Math.round(arrow.x2 * ratioX);
      const ay2 = Math.round(arrow.y2 * ratioY);
      const lineWidth = Math.max(2, Math.round(arrowWidth * ((ratioX + ratioY) / 2)));
      const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
      const headLength = Math.max(12, lineWidth * 3.4);
      const headWidth = Math.max(4, lineWidth * 1.3);
      const leftX = ax2 - headLength * Math.cos(angle) + headWidth * Math.sin(angle);
      const leftY = ay2 - headLength * Math.sin(angle) - headWidth * Math.cos(angle);
      const rightX = ax2 - headLength * Math.cos(angle) - headWidth * Math.sin(angle);
      const rightY = ay2 - headLength * Math.sin(angle) + headWidth * Math.cos(angle);

      outputContext.save();
      outputContext.strokeStyle = arrow.color;
      outputContext.lineWidth = lineWidth;
      outputContext.lineCap = "round";
      outputContext.beginPath();
      outputContext.moveTo(ax1, ay1);
      outputContext.lineTo(ax2, ay2);
      outputContext.stroke();
      outputContext.fillStyle = arrow.color;
      outputContext.beginPath();
      outputContext.moveTo(ax2, ay2);
      outputContext.lineTo(leftX, leftY);
      outputContext.lineTo(rightX, rightY);
      outputContext.closePath();
      outputContext.fill();
      outputContext.restore();
    }

    const textWeight = host.cssVar("--screen-recorder-text-annotation-weight", "700");
    const textFontFamily = host.cssVar("--screen-recorder-text-annotation-font-family", host.cssVar("--screen-recorder-font-family", "sans-serif"));
    const textStrokeColor = host.cssVar("--screen-recorder-text-annotation-stroke-color", "transparent");
    const parsedTextStrokeWidth = Number.parseFloat(host.cssVar("--screen-recorder-text-annotation-stroke-width", "0"));
    const textStrokeWidth = Number.isFinite(parsedTextStrokeWidth) ? parsedTextStrokeWidth : 0;
    const textLineHeight = 1.2;
    for (const annotation of texts) {
      const lines = annotation.text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i += 1) {
        const tx = Math.round(annotation.x * ratioX);
        const scaledSize = Math.max(10, Math.round(annotation.sizePx * ((ratioX + ratioY) / 2)));
        const ty = Math.round(annotation.y * ratioY) + (i * scaledSize * textLineHeight);
        outputContext.save();
        outputContext.font = `${textWeight} ${scaledSize}px ${textFontFamily}`;
        outputContext.textBaseline = "top";
        outputContext.lineJoin = "round";
        outputContext.fillStyle = annotation.color;
        const scaledStrokeWidth = Math.max(0, textStrokeWidth * ((ratioX + ratioY) / 2));
        if (scaledStrokeWidth > 0) {
          outputContext.strokeStyle = textStrokeColor;
          outputContext.lineWidth = scaledStrokeWidth;
          outputContext.strokeText(lines[i] || " ", tx, ty);
        }
        outputContext.fillText(lines[i] || " ", tx, ty);
        outputContext.restore();
      }
    }

    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, "image/png"));
    if (!blob) {
      host.setStatus("error");
      closeOverlay();
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `capture-session-${host.timestamp(new Date())}.png`;
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    host.notifyCaptureCompleted();
    host.setStatus("downloaded");
    host.scheduleIdleReset();
    closeOverlay();
  };

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  cropToggle.addEventListener("click", onCropToggle);
  arrowToggle.addEventListener("click", onArrowToggle);
  textToggle.addEventListener("click", onTextToggle);
  textSizeSelect.addEventListener("change", onTextSizeChange);
  undoButton.addEventListener("click", onUndo);
  cancel.addEventListener("click", onCancel);
  save.addEventListener("click", onSave);
  overlay.addEventListener("pointerdown", onOverlayPointerDown);

  host.setPreviewOverlay(overlay, () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    cropToggle.removeEventListener("click", onCropToggle);
    arrowToggle.removeEventListener("click", onArrowToggle);
    textToggle.removeEventListener("click", onTextToggle);
    textSizeSelect.removeEventListener("change", onTextSizeChange);
    arrowColorPicker.trigger.removeEventListener("click", onArrowColorTriggerClick);
    textColorPicker.trigger.removeEventListener("click", onTextColorTriggerClick);
    undoButton.removeEventListener("click", onUndo);
    cancel.removeEventListener("click", onCancel);
    save.removeEventListener("click", onSave);
    overlay.removeEventListener("pointerdown", onOverlayPointerDown);
    dialogCleanup();
    removeTextEditor();
    frame.close();
  });
}
