/**
 * `frame-capture`: the page's statement that a rendered component may be captured as an image for the agent.
 *
 * When it is on, the hook registers `@memberjunction/ng-realtime-channels`' opt-in DOM rasterizer
 * (`EnableChannelFrameCapture`) BEFORE the session is minted (whether a channel can source a video track is
 * decided at mint). The rasterizer is loaded as its own lazy chunk (`session/frame-capture-chunk-entry.ts`), so
 * `html-to-image` never lands in the shell or in a call that does not want frames.
 *
 * Soft by design: if the rasterizer cannot be loaded or registered, the hook says so ONCE and the call carries on
 * with state-only channels. A host that already registered its own capturer is respected and left alone.
 */
import { ChannelFrameCapture } from '@memberjunction/ng-realtime-channels/dist/lib/channel-frame-capture';

/** Loads and registers the default rasterizer; resolves to the function that removes it. */
export type FrameCaptureEnabler = () => Promise<() => void>;

/**
 * The default enabler: the one dynamic `import()` for the rasterizer. A dynamic import is correct here (MJ allows
 * one for a measured bundle-size deferral): the rasterizer pulls in `html-to-image`, which only a page that opted
 * into frames should pay for. The bundler splits it into its own file.
 */
export const DefaultFrameCaptureEnabler: FrameCaptureEnabler = async () => {
  const chunk = await import('../../session/frame-capture-chunk-entry');
  return chunk.EnableFrameCapture();
};

let warnedUnavailable = false;

/** Forgets that the "no rasterizer" notice was shown (tests). */
export function ResetFrameCaptureHookWarning(): void {
  warnedUnavailable = false;
}

function warnUnavailable(reason: string): void {
  if (!warnedUnavailable) {
    warnedUnavailable = true;
    console.warn(`[mj-realtime-widget] frame-capture is on, but the component rasterizer could not be enabled (${reason}), so the agent receives component state only.`);
  }
}

/** Owns the page's `frame-capture` preference for one widget. */
export class FrameCaptureHook {
  private enabled = false;
  private pending: Promise<boolean> | null = null;
  private dispose: (() => void) | null = null;

  constructor(private readonly enabler: FrameCaptureEnabler = DefaultFrameCaptureEnabler) {}

  /** Applies the page's setting. Cheap and idempotent; turning it on starts the (lazy) enabling. */
  public Apply(enabled: boolean): void {
    if (enabled === this.enabled) {
      return;
    }
    this.enabled = enabled;
    if (enabled) {
      this.pending = this.enable();
    } else {
      void this.disable();
    }
  }

  /**
   * Resolves once the setting has taken effect, so a session is not minted before the rasterizer is registered.
   * Never rejects.
   *
   * @returns Whether a capturer is registered and the preference is on (channels can offer pixels).
   */
  public async Ready(): Promise<boolean> {
    return this.enabled && this.pending ? this.pending : false;
  }

  /** Removes the rasterizer this hook registered. */
  public Dispose(): void {
    this.enabled = false;
    void this.disable();
  }

  private async enable(): Promise<boolean> {
    if (ChannelFrameCapture.Instance.Capturer !== null) {
      return true; // the host registered its own
    }
    try {
      const dispose = await this.enabler();
      if (!this.enabled) {
        dispose(); // turned off again while it was loading
        return false;
      }
      this.dispose = dispose;
      return ChannelFrameCapture.Instance.Capturer !== null;
    } catch (error) {
      warnUnavailable(error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  private async disable(): Promise<void> {
    const pending = this.pending;
    this.pending = null;
    await pending;
    if (!this.enabled && this.dispose) {
      this.dispose();
      this.dispose = null;
    }
  }
}
