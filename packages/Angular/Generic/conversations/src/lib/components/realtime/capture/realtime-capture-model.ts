import { BehaviorSubject, type Observable } from 'rxjs';
import type { JSONObject } from '@memberjunction/ai';
import type { CapturedDisplaySurface, MediaParticipant, MediaVideoSource, VideoSourceState } from '@memberjunction/ai-realtime-client/media';
import { REALTIME_CAPTURE_SOURCE_IDS, type RealtimeCaptureKind, type RealtimeCaptureState } from '@memberjunction/realtime-runtime';

/** Where a capture channel stands, as the agent reads it (its `status` noun) and its surface shows it. */
export type RealtimeCaptureStatus = 'off' | 'asked' | 'starting' | 'on' | 'failed';

/** What the capture surface shows. */
export interface RealtimeCaptureView {
  Kind: RealtimeCaptureKind;
  Status: RealtimeCaptureStatus;
  /** The agent's reason for asking, while its request stands. */
  Reason: string | null;
  /** Why the last start failed, while it stands. */
  Problem: string | null;
  /** The user's camera as `mj-self-view` takes it: while the camera is on, the same object for one stream. */
  Participant: MediaParticipant | null;
  /** The shared surface as `mj-share-preview` takes it: while a share is on, the same object for one stream. */
  Source: MediaVideoSource | null;
  /** What a share shows. */
  Surface: CapturedDisplaySurface;
  /** The shared panel's name, while the user shares one panel of the page; `null` otherwise. */
  PanelLabel: string | null;
  /**
   * Whether the agent sees the capture now: it is on, the channel lets the agent see pixels, and the model is being sent
   * its frames (its source among the session's video sources is on and active, which is what the "Agent can see" chip
   * reads). On a model that takes one video stream, a screen share started after the camera is the one sent, so the camera
   * is not seen until the user picks it again.
   */
  AgentCanSee: boolean;
}

/** The events a capture channel streams, by name. */
export type RealtimeCaptureEventName = 'asked' | 'declined' | 'started' | 'stopped' | 'failed';

/** One change: the event to stream, if the change is one. */
export interface RealtimeCaptureChange {
  Event: { Name: RealtimeCaptureEventName; Payload: JSONObject } | null;
}

/**
 * The state of one capture channel (the Camera or the Screen Share channel): the agent's request, the runtime's capture,
 * and whether the agent sees it. Framework-free: the channel feeds it and streams its changes; the surface shows its
 * {@link View$}. It decides nothing about policy: the runtime refuses a capture its channel's policy does not allow, and
 * reports that as a failed capture.
 */
export class RealtimeCaptureModel {
  private reason: string | null = null;
  private capture: RealtimeCaptureState = { Status: 'off' };
  private agentCanSee = false;
  /**
   * Whether the model is being sent this capture's frames: its source is on and active. `null` until the host reports the
   * session's sources ({@link FollowVideoSources}); a host that never does leaves the channel's exposure alone to decide.
   */
  private framesSent: boolean | null = null;
  private onStream: { Stream: MediaStream; Participant: MediaParticipant | null; Source: MediaVideoSource | null } | null = null;
  private readonly view: BehaviorSubject<RealtimeCaptureView>;
  private changeHandler: ((change: RealtimeCaptureChange) => void) | null = null;

  constructor(public readonly Kind: RealtimeCaptureKind) {
    this.view = new BehaviorSubject<RealtimeCaptureView>(this.buildView());
  }

  /** What the surface shows now. */
  public get View(): RealtimeCaptureView {
    return this.view.value;
  }

  /** What the surface shows, now and on every change. */
  public get View$(): Observable<RealtimeCaptureView> {
    return this.view.asObservable();
  }

  /** Receives every change (one handler; `null` removes it). */
  public OnChange(handler: ((change: RealtimeCaptureChange) => void) | null): void {
    this.changeHandler = handler;
  }

  /**
   * The agent asks to see the capture. A request while the capture is starting or on changes nothing.
   *
   * @returns Whether the request stands (the user now sees it).
   */
  public Ask(reason: string | null): boolean {
    if (this.capture.Status === 'starting' || this.capture.Status === 'on') {
      return false;
    }
    this.reason = reason?.trim() ?? '';
    this.publish({ Name: 'asked', Payload: this.reason ? { reason: this.reason } : {} });
    return true;
  }

  /** The user said "Not now" to the agent's request. Nothing to decline without one. */
  public Decline(): void {
    if (this.reason === null) {
      return;
    }
    this.reason = null;
    this.publish({ Name: 'declined', Payload: {} });
  }

  /**
   * The runtime's capture changed. Turning on answers the agent's request, and so does a camera check that ends with the
   * camera off: the user said not now.
   */
  public FollowCapture(capture: RealtimeCaptureState): void {
    const was = this.capture;
    this.capture = capture;
    if (capture.Status === 'on') {
      this.reason = null;
    }
    if (was.Checking && capture.Status === 'off' && this.reason !== null) {
      this.reason = null;
      this.publish({ Name: 'declined', Payload: {} });
      return;
    }
    this.publish(this.eventFor(was.Status, capture));
  }

  /** Whether the channel lets the agent see pixels (its exposure). */
  public SetAgentCanSee(visible: boolean): void {
    if (visible !== this.agentCanSee) {
      this.agentCanSee = visible;
      this.publish(null);
    }
  }

  /**
   * The session's video sources changed (the runtime's `VideoSources$`). The model is sent this capture's frames only while
   * its source (`REALTIME_CAPTURE_SOURCE_IDS`) is on and active; a capture with no source yet, or none any more, is not
   * sent. Only the view changes: the channel's state is the same, so the change handler hears nothing and the agent is
   * told nothing (the arbiter tells the model what it now sees).
   */
  public FollowVideoSources(sources: readonly VideoSourceState[]): void {
    const sourceId = REALTIME_CAPTURE_SOURCE_IDS[this.Kind];
    const source = sources.find((s) => s.SourceID === sourceId);
    const sent = source !== undefined && source.Enabled && source.Active;
    if (sent !== this.framesSent) {
      this.framesSent = sent;
      this.view.next(this.buildView());
    }
  }

  /** The channel's state as the agent reads it. */
  public ToState(): JSONObject {
    const view = this.View;
    const state: JSONObject = { status: view.Status, reason: view.Reason ?? '', problem: view.Problem ?? '' };
    if (this.Kind === 'screen') {
      state['surface'] = view.Surface;
    }
    return state;
  }

  /** The event a capture change is, if it is one: started, stopped or failed. */
  private eventFor(was: RealtimeCaptureState['Status'], capture: RealtimeCaptureState): RealtimeCaptureChange['Event'] {
    if (capture.Status === 'on' && was !== 'on') {
      return { Name: 'started', Payload: this.Kind === 'screen' ? { surface: capture.Surface ?? 'unknown' } : {} };
    }
    if (capture.Status === 'off' && was === 'on') {
      return { Name: 'stopped', Payload: {} };
    }
    if (capture.Status === 'failed' && was !== 'failed') {
      return { Name: 'failed', Payload: { failure: capture.Failure ?? 'error', message: capture.Message ?? '' } };
    }
    return null;
  }

  private publish(event: RealtimeCaptureChange['Event']): void {
    this.view.next(this.buildView());
    this.changeHandler?.({ Event: event });
  }

  private buildView(): RealtimeCaptureView {
    const capture = this.capture;
    const shown = this.shownStream(capture);
    return {
      Kind: this.Kind,
      Status: this.statusOf(capture),
      Reason: this.reason,
      Problem: capture.Status === 'failed' ? (capture.Message ?? 'The capture could not start.') : null,
      Participant: shown?.Participant ?? null,
      Source: shown?.Source ?? null,
      Surface: capture.Surface ?? 'unknown',
      PanelLabel: capture.PanelLabel ?? null,
      AgentCanSee: capture.Status === 'on' && this.agentCanSee && (this.framesSent ?? true),
    };
  }

  private statusOf(capture: RealtimeCaptureState): RealtimeCaptureStatus {
    if (capture.Status === 'off') {
      return this.reason !== null ? 'asked' : 'off';
    }
    return capture.Status;
  }

  /** The stream as the surface shows it, built once per stream so a re-render keeps the same objects. */
  private shownStream(capture: RealtimeCaptureState): RealtimeCaptureModel['onStream'] {
    if (capture.Status !== 'on' || !capture.Stream) {
      this.onStream = null;
      return null;
    }
    if (this.onStream?.Stream !== capture.Stream) {
      const video: MediaVideoSource = { Kind: 'stream', Stream: capture.Stream };
      this.onStream =
        this.Kind === 'camera'
          ? { Stream: capture.Stream, Participant: { Identity: 'self', DisplayName: 'You', Role: 'self', IsSpeaking: false, Video: { camera: video } }, Source: null }
          : { Stream: capture.Stream, Participant: null, Source: video };
    }
    return this.onStream;
  }
}
