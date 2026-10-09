import { BehaviorSubject, type Observable } from 'rxjs';
import type { JSONObject } from '@memberjunction/ai';
import type { CapturedDisplaySurface, MediaParticipant, MediaVideoSource } from '@memberjunction/ai-realtime-client/media';
import type { RealtimeCaptureKind, RealtimeCaptureState } from '@memberjunction/realtime-runtime';

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
  /** Whether the agent sees the capture now: it is on and the channel lets the agent see pixels. */
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
      AgentCanSee: capture.Status === 'on' && this.agentCanSee,
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
