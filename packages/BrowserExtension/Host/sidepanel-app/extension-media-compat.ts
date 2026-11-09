/**
 * @fileoverview Chrome Manifest V3 Side Panel Media & AudioWorklet Compatibility Layer.
 *
 * Solves two Chromium Manifest V3 platform constraints for realtime voice inside `sidepanel.html`:
 * 1. **MV3 CSP `AudioWorklet.addModule(blobUrl)` restriction**:
 *    Chromium MV3 enforces `script-src 'self'` on `chrome-extension://` pages and rejects `blob:`
 *    worklet modules with `AbortError: Unable to load a worklet's module.`. When a library (such as
 *    `@memberjunction/ai-realtime-client` `CreatePcmMicCapture` or `RealtimeAudioRecorder`) loads a
 *    `blob:` AudioWorklet, this shim transparently loads the extension-packaged `'self'` module
 *    `mj-audio-worklets.js` instead.
 * 2. **Chrome Side Panel `getUserMedia({ audio: true })` one-time permission prompt**:
 *    Chrome Side Panels have no address bar to anchor the camera/microphone permission bubble, so
 *    an initial `prompt`-state `getUserMedia` inside `sidepanel.html` can fail with
 *    `NotAllowedError: Permission dismissed`. When microphone permission is `'prompt'` (or dismissed),
 *    this shim opens a compact `mic-permission.html` popup window on the same `chrome-extension://`
 *    origin so the user can click "Allow" once, then immediately resumes `getUserMedia` in the Side Panel.
 */

import type {
  ChromeExtensionNamespace,
  ChromeRuntimeMessageListener,
  SidePanelWindowGlobals,
} from './chrome-extension-types';

let installed = false;
let pendingMicPopupPromise: Promise<boolean> | null = null;

export function InstallExtensionMediaCompat(): void {
  if (installed || typeof window === 'undefined') {
    return;
  }
  installed = true;

  if (window.location?.protocol !== 'chrome-extension:') {
    return;
  }

  const win = window as SidePanelWindowGlobals;
  const chromeApi = win.chrome;
  if (!chromeApi?.runtime?.getURL) {
    return;
  }

  installAudioWorkletBlobShim(chromeApi);
  installSidePanelMicrophonePermissionShim(chromeApi);
}

function installAudioWorkletBlobShim(chromeApi: ChromeExtensionNamespace): void {
  if (typeof AudioWorklet === 'undefined' || !AudioWorklet.prototype?.addModule) {
    return;
  }

  const origAddModule = AudioWorklet.prototype.addModule;
  const loadedWorklets = new WeakSet<AudioWorklet>();

  AudioWorklet.prototype.addModule = async function (
    this: AudioWorklet,
    moduleURL: string | URL,
    options?: WorkletOptions
  ): Promise<void> {
    const rawUrl = String(moduleURL);
    if (rawUrl.startsWith('blob:') && chromeApi.runtime?.getURL) {
      if (loadedWorklets.has(this)) {
        return;
      }
      const selfWorkletUrl = chromeApi.runtime.getURL('mj-audio-worklets.js');
      await origAddModule.call(this, selfWorkletUrl, options);
      loadedWorklets.add(this);
      return;
    }
    return origAddModule.call(this, moduleURL, options);
  };
}

function installSidePanelMicrophonePermissionShim(chromeApi: ChromeExtensionNamespace): void {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return;
  }

  const mediaDevices = navigator.mediaDevices;
  const origGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

  mediaDevices.getUserMedia = async (constraints?: MediaStreamConstraints): Promise<MediaStream> => {
    const wantsAudio = Boolean(constraints?.audio);
    if (!wantsAudio) {
      return origGetUserMedia(constraints);
    }

    const permState = await queryMicrophonePermissionState();
    if (permState === 'prompt') {
      await requestMicrophonePermissionViaPopup(chromeApi);
    }

    try {
      return await origGetUserMedia(constraints);
    } catch (err) {
      const isDismissedInSidePanel =
        err instanceof DOMException &&
        err.name === 'NotAllowedError' &&
        (permState === 'prompt' || /dismissed/i.test(err.message));

      if (isDismissedInSidePanel) {
        const granted = await requestMicrophonePermissionViaPopup(chromeApi);
        if (granted) {
          return origGetUserMedia(constraints);
        }
      }
      throw err;
    }
  };
}

async function queryMicrophonePermissionState(): Promise<PermissionState | null> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return null;
  }
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state;
  } catch {
    return null;
  }
}

function requestMicrophonePermissionViaPopup(chromeApi: ChromeExtensionNamespace): Promise<boolean> {
  if (pendingMicPopupPromise) {
    return pendingMicPopupPromise;
  }

  pendingMicPopupPromise = new Promise<boolean>((resolve) => {
    if (!chromeApi.runtime?.getURL || (!chromeApi.windows?.create && !chromeApi.tabs?.create)) {
      resolve(false);
      return;
    }

    const popupUrl = chromeApi.runtime.getURL('mic-permission.html');
    let popupWindowId: number | null = null;
    let settled = false;

    const finish = (granted: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutId);
      if (chromeApi.runtime?.onMessage?.removeListener) {
        chromeApi.runtime.onMessage.removeListener(onMessage);
      }
      if (chromeApi.windows?.onRemoved?.removeListener) {
        chromeApi.windows.onRemoved.removeListener(onWindowRemoved);
      }
      resolve(granted);
    };

    const onMessage: ChromeRuntimeMessageListener = (message, _sender, sendResponse) => {
      if (message?.Type === 'MJ_EXT_MIC_PERMISSION_RESULT') {
        sendResponse({ Received: true });
        finish(Boolean(message.Granted));
      }
    };

    const onWindowRemoved = (closedWindowId: number): void => {
      if (popupWindowId !== null && closedWindowId === popupWindowId) {
        void queryMicrophonePermissionState().then((state) => {
          finish(state === 'granted');
        });
      }
    };

    const timeoutId = setTimeout(() => finish(false), 45000);

    chromeApi.runtime.onMessage?.addListener(onMessage);
    chromeApi.windows?.onRemoved?.addListener(onWindowRemoved);

    if (chromeApi.windows?.create) {
      void chromeApi.windows
        .create({
          url: popupUrl,
          type: 'popup',
          width: 440,
          height: 310,
          focused: true,
        })
        .then((winRes) => {
          popupWindowId = winRes.id ?? null;
        })
        .catch(() => {
          finish(false);
        });
    } else if (chromeApi.tabs?.create) {
      void chromeApi.tabs.create({ url: popupUrl, active: true }).catch(() => {
        finish(false);
      });
    }
  }).finally(() => {
    pendingMicPopupPromise = null;
  });

  return pendingMicPopupPromise;
}
