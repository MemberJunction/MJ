/**
 * @fileoverview A meeting room's screen share through `/media` display capture: the browser's picker (an entire
 * screen, a window, a tab, or one panel of this page), the shared track capped as LiveKit caps its own capture, and
 * the track published to the room as the participant's screen share. Used by {@link LiveKitRoomController}; not part
 * of the package's public API.
 *
 * Sharing through `/media` rather than LiveKit's own `setScreenShareEnabled` is what lets a room share one panel
 * (Element or Region Capture) and say what is shared; LiveKit's own capture asks for a whole surface only.
 *
 * @module @memberjunction/livekit-room-core
 */

import { ScreenSharePresets, Track, type LocalParticipant } from 'livekit-client';
import type {
  DisplayCapture,
  DisplayCaptureOptions,
  DisplayCaptureResult,
  DisplayCaptureSurface,
} from '@memberjunction/ai-realtime-client/media';

/** Opens the browser's share picker; `RequestDisplayCapture` in the browser, a fake in tests. */
export type ScreenShareRequester = (options: DisplayCaptureOptions) => Promise<DisplayCaptureResult>;

/**
 * The cap on a shared track: LiveKit asks its own screen capture for 1080p at 30 fps
 * (`ScreenSharePresets.h1080fps30`), since encoding a larger surface costs bitrate and CPU for little gain.
 */
const SHARE_CAP = ScreenSharePresets.h1080fps30.resolution;

/**
 * The display-capture options for a room's share request: a kind of surface the picker offers first, or the options
 * as given (a surface preference, or one panel to share alone with its name). No request asks with no preference.
 */
export function ToDisplayCaptureOptions(request?: DisplayCaptureSurface | DisplayCaptureOptions): DisplayCaptureOptions {
  if (request === undefined) {
    return {};
  }
  return typeof request === 'string' ? { PreferredSurface: request } : request;
}

/**
 * Caps a shared track at {@link SHARE_CAP} (at most, never upscaling a small panel). A browser that refuses the
 * constraints shares at the surface's own size, as it would have before the cap.
 */
export async function CapScreenShareTrack(track: MediaStreamTrack): Promise<void> {
  try {
    await track.applyConstraints({
      width: { max: SHARE_CAP.width },
      height: { max: SHARE_CAP.height },
      frameRate: { max: SHARE_CAP.frameRate ?? 30 },
    });
  } catch {
    // Unconstrained is how the share would look without the cap; nothing to tell the user.
  }
}

/** How a start ended: shared, nothing (the picker closed, or a stop came first), or failed with the picker's reason. */
export type ScreenShareStartOutcome = { Status: 'shared' } | { Status: 'none' } | { Status: 'failed'; Message: string };

/** A share in progress. */
interface ActiveShare {
  Capture: DisplayCapture;
  StopWatching: () => void;
}

/**
 * One room connection's screen share: at most one at a time. {@link Stop} also cancels a start still waiting for the
 * picker or the publish, so a share the user stopped, or a room they left, never goes out.
 */
export class LiveKitScreenShare {
  private share: ActiveShare | null = null;
  private starting = false;
  /** Bumped by every stop, so a start that resolves after it knows it was cancelled. */
  private generation = 0;

  /**
   * @param requestShare Opens the browser's share picker.
   * @param onEnded Called when a running share ends in the browser ("Stop sharing", or the shared surface closed).
   */
  constructor(
    private readonly requestShare: ScreenShareRequester,
    private readonly onEnded: () => void
  ) {}

  /** The running share's capture, or `null`. */
  public get Capture(): DisplayCapture | null {
    return this.share?.Capture ?? null;
  }

  /**
   * Asks the browser's picker, caps the track and publishes it as `participant`'s screen share. Already sharing or
   * starting, it does nothing. Call it from the user's click: the picker needs one, and it is reached with no wait.
   */
  public async Start(
    participant: LocalParticipant,
    request?: DisplayCaptureSurface | DisplayCaptureOptions
  ): Promise<ScreenShareStartOutcome> {
    if (this.share || this.starting) {
      return { Status: 'none' };
    }
    this.starting = true;
    const generation = this.generation;
    try {
      const result = await this.requestShare(ToDisplayCaptureOptions(request));
      if (result.Status !== 'started') {
        return result.Status === 'failed' ? { Status: 'failed', Message: result.Message } : { Status: 'none' };
      }
      return await this.publish(participant, result.Capture, generation);
    } finally {
      this.starting = false;
    }
  }

  /** Stops the share: unpublished and the capture released; a start under way is cancelled. Safe when not sharing. */
  public async Stop(participant: LocalParticipant | null): Promise<void> {
    this.generation++;
    const share = this.share;
    this.share = null;
    if (!share) {
      return;
    }
    share.StopWatching();
    try {
      await participant?.unpublishTrack(share.Capture.Track);
    } finally {
      share.Capture.Stop();
    }
  }

  /**
   * Caps and publishes a started capture, and keeps it as the running share. A stop that came while the picker was
   * open releases it unpublished; one that came while it was publishing, or a share the browser ended meanwhile (LiveKit
   * saw no end of a track that had already ended), withdraws it.
   */
  private async publish(participant: LocalParticipant, capture: DisplayCapture, generation: number): Promise<ScreenShareStartOutcome> {
    if (generation !== this.generation) {
      capture.Stop();
      return { Status: 'none' };
    }
    await CapScreenShareTrack(capture.Track);
    try {
      await participant.publishTrack(capture.Track, { source: Track.Source.ScreenShare });
    } catch (err) {
      capture.Stop();
      throw err;
    }
    if (generation !== this.generation || capture.Track.readyState === 'ended') {
      await participant.unpublishTrack(capture.Track).finally(() => capture.Stop());
      return { Status: 'none' };
    }
    this.share = { Capture: capture, StopWatching: capture.OnEnded(() => this.ended()) };
    return { Status: 'shared' };
  }

  /**
   * The browser ended the running share ("Stop sharing", or the shared surface closed). LiveKit unpublishes a
   * screen-share track that ends, so the share is only forgotten here. A share stopped from the room stops listening
   * first, so this hears only the browser.
   */
  private ended(): void {
    this.share = null;
    this.onEnded();
  }
}
