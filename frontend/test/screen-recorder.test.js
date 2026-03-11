import '../src/screen-recorder.ts';

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const nextFrame = () => new Promise((resolve) => {
  requestAnimationFrame(() => resolve());
});

const waitForRender = async (element) => {
  await element.updateComplete;
  await nextFrame();
};

const delay = (ms = 0) => new Promise((resolve) => window.setTimeout(resolve, ms));

const createTrack = () => {
  const listeners = new Map();
  return {
    stopped: false,
    addEventListener(type, cb) {
      listeners.set(type, cb);
    },
    stop() {
      this.stopped = true;
    },
    emit(type) {
      const cb = listeners.get(type);
      if (cb) {
        cb();
      }
    }
  };
};

const createStream = () => {
  const videoTrack = createTrack();
  const audioTrack = createTrack();
  return {
    _videoTrack: videoTrack,
    _audioTrack: audioTrack,
    getTracks() {
      return [videoTrack, audioTrack];
    },
    getVideoTracks() {
      return [videoTrack];
    }
  };
};

class FakeMediaRecorder {
  static instances = [];

  static isTypeSupported() {
    return true;
  }

  constructor(stream, options = {}) {
    this.stream = stream;
    this.options = options;
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
    this._listeners = new Map();
    FakeMediaRecorder.instances.push(this);
  }

  addEventListener(type, cb) {
    const handlers = this._listeners.get(type) || [];
    handlers.push(cb);
    this._listeners.set(type, handlers);
  }

  _emit(type, event = {}) {
    const handlers = this._listeners.get(type) || [];
    for (const handler of handlers) {
      handler(event);
    }
  }

  start() {
    this.state = 'recording';
  }

  stop() {
    if (this.state !== 'recording') {
      return;
    }
    this.state = 'inactive';
    const chunk = new Blob(['chunk'], { type: 'video/webm' });
    if (this.ondataavailable) {
      this.ondataavailable({ data: chunk });
    }
    this._emit('dataavailable', { data: chunk });
    if (this.onstop) {
      this.onstop();
    }
    this._emit('stop');
  }
}

const originalMediaRecorder = window.MediaRecorder;
const originalGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia;
if (!navigator.mediaDevices) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {}
  });
}

const setGetDisplayMedia = (fn) => {
  navigator.mediaDevices.getDisplayMedia = fn;
};

describe('screen-recorder', () => {
  beforeEach(() => {
    window.MediaRecorder = FakeMediaRecorder;
    FakeMediaRecorder.instances = [];
  });

  afterEach(() => {
    document.body.innerHTML = '';
    if (navigator.mediaDevices && originalGetDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
    } else if (navigator.mediaDevices) {
      delete navigator.mediaDevices.getDisplayMedia;
    }
  });

  after(() => {
    window.MediaRecorder = originalMediaRecorder;
    if (navigator.mediaDevices && originalGetDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
    } else if (navigator.mediaDevices) {
      delete navigator.mediaDevices.getDisplayMedia;
    }
  });

  it('handles statusVisible before initial connection', async () => {
    const element = document.createElement('screen-recorder');
    element.statusVisible = false;
    document.body.append(element);

    await waitForRender(element);

    const handle = element.shadowRoot?.querySelector('[part~="handle"]');
    assert(handle instanceof HTMLElement, 'expected handle to render');
    assert(handle.hidden, 'expected handle to be hidden when statusVisible=false');
  });

  it('uses inline mode by default and can switch to floating', async () => {
    const element = document.createElement('screen-recorder');
    document.body.append(element);

    await waitForRender(element);
    assert(element.hasAttribute('floating-disabled'), 'expected inline mode by default');

    element.floatingEnabled = true;
    await waitForRender(element);
    assert(!element.hasAttribute('floating-disabled'), 'expected floating mode when enabled');
  });

  it('applies pre-connect own properties through upgradeProperty on connect', async () => {
    const element = document.createElement('screen-recorder');
    Object.defineProperty(element, 'statusVisible', {
      value: false,
      writable: true,
      configurable: true
    });
    Object.defineProperty(element, 'floatingEnabled', {
      value: true,
      writable: true,
      configurable: true
    });

    document.body.append(element);
    await waitForRender(element);

    const handle = element.shadowRoot?.querySelector('[part~="handle"]');
    assert(handle instanceof HTMLElement, 'expected handle to render');
    assert(handle.hidden, 'statusVisible own prop should be upgraded to false');
    assert(!element.hasAttribute('floating-disabled'), 'floatingEnabled own prop should be upgraded to true');
  });

  it('coerces boolean-like property values from strings and numbers', async () => {
    const element = document.createElement('screen-recorder');
    document.body.append(element);
    await waitForRender(element);

    element.recordEnabled = 'false';
    element.captureEnabled = 0;
    element.floatingEnabled = 'on';
    element.statusVisible = '0';
    await waitForRender(element);

    assert(element.recordEnabled === false, 'recordEnabled should coerce "false" to false');
    assert(element.captureEnabled === false, 'captureEnabled should coerce 0 to false');
    assert(element.floatingEnabled === true, 'floatingEnabled should coerce "on" to true');
    assert(element.statusVisible === false, 'statusVisible should coerce "0" to false');
  });

  it('coerces additional boolean-like string values', async () => {
    const element = document.createElement('screen-recorder');
    document.body.append(element);
    await waitForRender(element);

    element.recordEnabled = ' off ';
    element.captureEnabled = 'NO';
    element.floatingEnabled = ' true ';
    element.statusVisible = 'maybe';
    await waitForRender(element);

    assert(element.recordEnabled === false, 'recordEnabled should coerce "off" to false');
    assert(element.captureEnabled === false, 'captureEnabled should coerce "NO" to false');
    assert(element.floatingEnabled === true, 'floatingEnabled should coerce spaced "true" to true');
    assert(element.statusVisible === true, 'unknown strings should remain truthy');
  });

  it('disables toolbar buttons when corresponding feature is disabled', async () => {
    const element = document.createElement('screen-recorder');
    element.recordEnabled = false;
    element.captureEnabled = false;
    document.body.append(element);
    await waitForRender(element);

    const recordButton = element.shadowRoot?.querySelector('[part~="record-button"]');
    const captureButton = element.shadowRoot?.querySelector('[part~="capture-button"]');
    assert(recordButton && recordButton.disabled, 'record button should be disabled');
    assert(captureButton && captureButton.disabled, 'capture button should be disabled');
  });

  it('setPreviewOverlay/closePreviewOverlay toggles visibility flags and runs cleanup once', async () => {
    const element = document.createElement('screen-recorder');
    document.body.append(element);
    await waitForRender(element);

    let cleanupCalls = 0;
    const overlay = document.createElement('div');
    element.setPreviewOverlay(overlay, () => {
      cleanupCalls += 1;
    });

    assert(element.hasAttribute('overlay-open'), 'overlay-open should be set while preview is active');
    const shell = element.shadowRoot?.querySelector('[part~="shell"]');
    assert(shell?.getAttribute('aria-hidden') === 'true', 'shell should be aria-hidden while overlay is open');
    assert(overlay.isConnected, 'overlay should be attached');

    element.closePreviewOverlay();
    assert(!element.hasAttribute('overlay-open'), 'overlay-open should be cleared after close');
    assert(shell?.getAttribute('aria-hidden') === 'false', 'shell should be visible after close');
    assert(cleanupCalls === 1, 'cleanup should run once');

    element.closePreviewOverlay();
    assert(cleanupCalls === 1, 'cleanup should remain idempotent on repeated close');
  });

  it('toggles status visibility at runtime', async () => {
    const element = document.createElement('screen-recorder');
    document.body.append(element);
    await waitForRender(element);

    const getHandle = () => element.shadowRoot?.querySelector('[part~="handle"]');
    assert(getHandle() instanceof HTMLElement, 'handle should exist');
    assert(!getHandle().hidden, 'handle should be visible by default');

    element.statusVisible = false;
    await waitForRender(element);
    assert(getHandle().hidden, 'handle should be hidden when statusVisible=false');

    element.statusVisible = true;
    await waitForRender(element);
    assert(!getHandle().hidden, 'handle should be visible when statusVisible=true');
  });

  it('publishes status via attribute when no Flow server bridge exists', async () => {
    const stream = createStream();
    setGetDisplayMedia(async () => stream);

    const element = document.createElement('screen-recorder');
    element.openRecordingOverlay = async () => {};
    document.body.append(element);
    await waitForRender(element);

    await element.start();
    assert(element.getAttribute('status') === 'recording', 'status should be pushed via attribute');
  });

  it('publishes status via Flow server bridge when available', async () => {
    const stream = createStream();
    setGetDisplayMedia(async () => stream);

    const statuses = [];
    const element = document.createElement('screen-recorder');
    element.$server = {
      setStatusFromClient(status) {
        statuses.push(status);
      }
    };
    element.openRecordingOverlay = async () => {};
    document.body.append(element);
    await waitForRender(element);

    await element.start();
    assert(statuses.includes('recording'), 'expected recording status callback');

    element.stop();
    await delay(0);
    assert(statuses.includes('ready'), 'expected ready status callback after stop');
  });

  it('starts and stops recording with display media and opens recording preview', async () => {
    const stream = createStream();
    setGetDisplayMedia(async () => stream);

    let overlayOpened = false;
    const element = document.createElement('screen-recorder');
    element.openRecordingOverlay = async () => {
      overlayOpened = true;
    };
    document.body.append(element);
    await waitForRender(element);

    await element.start();
    assert(FakeMediaRecorder.instances.length === 1, 'expected MediaRecorder instance');
    assert(element.getAttribute('status') === 'recording', 'expected recording status');

    element.stop();
    await delay(0);

    assert(overlayOpened, 'expected recording preview overlay to open on stop');
    assert(element.getAttribute('status') === 'ready', 'expected ready status after stop');
    assert(stream._videoTrack.stopped, 'expected stream tracks to be stopped');
  });

  it('does not start recording when recordEnabled is false', async () => {
    let calls = 0;
    setGetDisplayMedia(async () => {
      calls += 1;
      return createStream();
    });

    const element = document.createElement('screen-recorder');
    element.recordEnabled = false;
    document.body.append(element);
    await waitForRender(element);

    await element.start();
    assert(calls === 0, 'start should no-op when recording is disabled');
  });

  it('does not capture when captureEnabled is false', async () => {
    let calls = 0;
    setGetDisplayMedia(async () => {
      calls += 1;
      return createStream();
    });

    const element = document.createElement('screen-recorder');
    element.captureEnabled = false;
    document.body.append(element);
    await waitForRender(element);

    await element.captureSelection();
    assert(calls === 0, 'capture should no-op when capture is disabled');
  });

  it('is idempotent when start() is called while already recording', async () => {
    let calls = 0;
    setGetDisplayMedia(async () => {
      calls += 1;
      return createStream();
    });
    const element = document.createElement('screen-recorder');
    element.openRecordingOverlay = async () => {};
    document.body.append(element);
    await waitForRender(element);

    await element.start();
    await element.start();
    assert(calls === 1, 'getDisplayMedia should be called only once while recording');
  });

  it('auto-stops when captured video track ends', async () => {
    const stream = createStream();
    setGetDisplayMedia(async () => stream);
    let overlayOpened = false;
    const element = document.createElement('screen-recorder');
    element.openRecordingOverlay = async () => {
      overlayOpened = true;
    };
    document.body.append(element);
    await waitForRender(element);

    await element.start();
    assert(element.getAttribute('status') === 'recording', 'expected recording before track end');

    stream._videoTrack.emit('ended');
    await delay(0);

    assert(overlayOpened, 'track end should stop recording and open preview');
    assert(element.getAttribute('status') === 'ready', 'expected ready status after track ended');
  });

  it('maps recording permission denial to denied status', async () => {
    setGetDisplayMedia(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    const element = document.createElement('screen-recorder');
    document.body.append(element);
    await waitForRender(element);

    await element.start();
    assert(element.getAttribute('status') === 'denied', 'expected denied status');
  });

  it('maps recording failures to error status', async () => {
    setGetDisplayMedia(async () => {
      throw new Error('boom');
    });
    const element = document.createElement('screen-recorder');
    document.body.append(element);
    await waitForRender(element);

    await element.start();
    assert(element.getAttribute('status') === 'error', 'expected error status');
  });

  it('does not capture while currently recording', async () => {
    let called = 0;
    setGetDisplayMedia(async () => {
      called += 1;
      return createStream();
    });

    const element = document.createElement('screen-recorder');
    element.status = 'recording';
    document.body.append(element);
    await waitForRender(element);

    await element.captureSelection();
    assert(called === 0, 'capture should be skipped while recording');
  });

  it('opens capture preview when capture succeeds', async () => {
    const stream = createStream();
    setGetDisplayMedia(async () => stream);

    const frame = { close: () => {} };
    let opened = false;
    const element = document.createElement('screen-recorder');
    element.grabFrame = async () => frame;
    element.openCaptureOverlay = async () => {
      opened = true;
    };
    document.body.append(element);
    await waitForRender(element);

    await element.captureSelection();
    assert(opened, 'expected capture overlay open');
    assert(stream._videoTrack.stopped, 'expected capture stream cleanup');
  });

  it('maps capture permission denial to denied status', async () => {
    setGetDisplayMedia(async () => {
      throw new DOMException('denied', 'NotAllowedError');
    });
    const element = document.createElement('screen-recorder');
    document.body.append(element);
    await waitForRender(element);

    await element.captureSelection();
    assert(element.getAttribute('status') === 'denied', 'expected denied status');
  });

  it('ignores capture AbortError without setting error status', async () => {
    setGetDisplayMedia(async () => {
      throw new DOMException('aborted', 'AbortError');
    });
    const element = document.createElement('screen-recorder');
    element.setAttribute('status', 'idle');
    document.body.append(element);
    await waitForRender(element);

    await element.captureSelection();
    assert(element.getAttribute('status') === 'idle', 'AbortError should not flip status to error');
  });

  it('maps non-permission DOMException capture failures to error status', async () => {
    setGetDisplayMedia(async () => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const element = document.createElement('screen-recorder');
    document.body.append(element);
    await waitForRender(element);

    await element.captureSelection();
    assert(element.getAttribute('status') === 'error', 'non-NotAllowed DOMException should map to error');
  });

  it('download() opens recording preview only when a recording is available', async () => {
    const element = document.createElement('screen-recorder');
    let calls = 0;
    element.openRecordingOverlay = async () => {
      calls += 1;
    };
    document.body.append(element);
    await waitForRender(element);

    element.download();
    assert(calls === 0, 'download should no-op without a recording');

    element.recordingBlob = new Blob(['v'], { type: 'video/webm' });
    element.lastCompletedAt = new Date();
    element.lastRecordingDurationSeconds = 12.4;
    element.download();
    assert(calls === 1, 'download should open preview when recording exists');
  });

  it('download() no-ops when recording is disabled', async () => {
    const element = document.createElement('screen-recorder');
    let calls = 0;
    element.openRecordingOverlay = async () => {
      calls += 1;
    };
    document.body.append(element);
    await waitForRender(element);

    element.recordingBlob = new Blob(['v'], { type: 'video/webm' });
    element.lastCompletedAt = new Date();
    element.recordEnabled = false;
    element.download();

    assert(calls === 0, 'download should no-op when recording is disabled');
  });
});
