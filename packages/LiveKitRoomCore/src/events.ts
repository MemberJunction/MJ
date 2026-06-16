/**
 * @fileoverview The LiveKit room **event architecture** — a typed, framework-agnostic event bus with
 * **cancelable Before-events** (mirroring the MemberJunction conversations stack, where a handler sets
 * `event.Cancel = true` to veto an action) plus informational notification events.
 *
 * Living in the core (not the Angular layer) means every consumer — the Angular widget, a future React
 * binding, or a headless test harness — gets the same cancelable hooks. The Angular component simply
 * re-surfaces these as `@Output()` `EventEmitter`s.
 *
 * **Cancellation contract:** Before-event handlers run **synchronously** in registration order. Any
 * handler may set `event.Cancel = true`; the controller checks the flag immediately after dispatch and
 * aborts the action when set. Before-events may also *mutate* documented payload fields (e.g.
 * {@link LiveKitBeforeSendDataEvent.Text}) to transform the action before it proceeds.
 *
 * @module @memberjunction/livekit-room-core
 */

import type {
  LiveKitBackgroundEffect,
  LiveKitDataMessage,
  LiveKitDevice,
  LiveKitDisconnectReason,
  LiveKitLocalMediaState,
  LiveKitParticipantView,
  LiveKitRoomConnectOptions,
  LiveKitRoomError,
  LiveKitRoomState,
} from './types';

/** Base shape for every cancelable Before-event. Set {@link Cancel} to `true` to veto the action. */
export interface LiveKitCancelableEvent {
  /** Set to `true` in a handler to cancel the pending action. Defaults to `false`. */
  Cancel: boolean;
}

/** Fired before the client connects. Cancelable. */
export interface LiveKitBeforeConnectEvent extends LiveKitCancelableEvent {
  /** The server URL about to be connected to. */
  ServerUrl: string;
  /** The connect options about to be applied (mutable — a handler may adjust them). */
  Options: LiveKitRoomConnectOptions;
}

/** Fired before the client disconnects/leaves the room. Cancelable (e.g. "leave call?" confirmation). */
export interface LiveKitBeforeDisconnectEvent extends LiveKitCancelableEvent {
  /** Whether this disconnect was initiated by the user (vs. an internal reconnect cycle). */
  UserInitiated: boolean;
}

/** Fired before a local-media track is toggled. Cancelable. */
export interface LiveKitBeforeMediaToggleEvent extends LiveKitCancelableEvent {
  /** Which local-media kind is being toggled. */
  Kind: 'microphone' | 'camera' | 'screen';
  /** The target enabled state. */
  Enabled: boolean;
}

/** Fired before a data-channel message is sent. Cancelable; {@link Text} is mutable for transformation. */
export interface LiveKitBeforeSendDataEvent extends LiveKitCancelableEvent {
  /** The message text — a handler MAY rewrite this to transform the outgoing message. */
  Text: string;
  /** The optional topic. */
  Topic?: string;
}

/** Fired before the active input/output device is switched. Cancelable. */
export interface LiveKitBeforeDeviceSwitchEvent extends LiveKitCancelableEvent {
  /** The device kind being switched. */
  Kind: LiveKitDevice['Kind'];
  /** The target device id. */
  DeviceId: string;
}

/** Fired when a participant joins the room. */
export interface LiveKitParticipantJoinedEvent {
  /** The participant that joined. */
  Participant: LiveKitParticipantView;
}

/** Fired when a participant leaves the room. */
export interface LiveKitParticipantLeftEvent {
  /** The identity of the participant that left. */
  Identity: string;
  /** The participant's last-known view, when available. */
  Participant?: LiveKitParticipantView;
}

/** Fired when the active-speaker set changes. */
export interface LiveKitActiveSpeakersEvent {
  /** Identities currently flagged as active speakers, most-recent first. */
  Identities: string[];
  /** The active-speaker participant views. */
  Speakers: LiveKitParticipantView[];
}

/** Fired when the room disconnects. */
export interface LiveKitDisconnectedEvent {
  /** The normalized disconnect reason. */
  Reason: LiveKitDisconnectReason;
}

/**
 * The full event map: event name → payload type. Names use the `before*` prefix for cancelable events
 * and a past-tense / noun form for notifications, matching the conversations-stack vocabulary.
 */
export interface LiveKitRoomEventMap {
  // Cancelable Before-events
  beforeConnect: LiveKitBeforeConnectEvent;
  beforeDisconnect: LiveKitBeforeDisconnectEvent;
  beforeMediaToggle: LiveKitBeforeMediaToggleEvent;
  beforeSendData: LiveKitBeforeSendDataEvent;
  beforeDeviceSwitch: LiveKitBeforeDeviceSwitchEvent;

  // Informational notifications
  connected: { State: LiveKitRoomState };
  disconnected: LiveKitDisconnectedEvent;
  reconnecting: Record<string, never>;
  reconnected: { State: LiveKitRoomState };
  participantJoined: LiveKitParticipantJoinedEvent;
  participantLeft: LiveKitParticipantLeftEvent;
  activeSpeakersChanged: LiveKitActiveSpeakersEvent;
  dataReceived: LiveKitDataMessage;
  localMediaChanged: LiveKitLocalMediaState;
  stateChanged: LiveKitRoomState;
  error: LiveKitRoomError;
  /** Browser autoplay policy changed whether remote audio can play (prompt the user to enable sound). */
  audioPlaybackChanged: { CanPlayback: boolean };
  /** The Krisp noise filter was toggled on the local microphone. */
  noiseFilterChanged: { Enabled: boolean };
  /** The camera background effect changed. */
  backgroundEffectChanged: { Effect: LiveKitBackgroundEffect };
}

/** A handler for a given event type. */
export type LiveKitEventHandler<K extends keyof LiveKitRoomEventMap> = (event: LiveKitRoomEventMap[K]) => void;

/**
 * A typed, synchronous event bus for LiveKit room events. Handlers fire in registration order; a thrown
 * handler error is isolated (logged to `console.error`) so one bad subscriber cannot break the room or
 * suppress later handlers.
 */
export class LiveKitRoomEventBus {
  private readonly handlers = new Map<keyof LiveKitRoomEventMap, Set<LiveKitEventHandler<keyof LiveKitRoomEventMap>>>();

  /**
   * Subscribes to an event.
   *
   * @param type The event name.
   * @param handler The handler to invoke.
   * @returns An unsubscribe function.
   */
  public On<K extends keyof LiveKitRoomEventMap>(type: K, handler: LiveKitEventHandler<K>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as LiveKitEventHandler<keyof LiveKitRoomEventMap>);
    return () => this.Off(type, handler);
  }

  /**
   * Subscribes to an event for a single emission, then auto-unsubscribes.
   *
   * @param type The event name.
   * @param handler The handler to invoke once.
   * @returns An unsubscribe function (in case you want to cancel before it fires).
   */
  public Once<K extends keyof LiveKitRoomEventMap>(type: K, handler: LiveKitEventHandler<K>): () => void {
    const off = this.On(type, (event) => {
      off();
      handler(event);
    });
    return off;
  }

  /**
   * Unsubscribes a handler from an event.
   *
   * @param type The event name.
   * @param handler The handler to remove.
   */
  public Off<K extends keyof LiveKitRoomEventMap>(type: K, handler: LiveKitEventHandler<K>): void {
    this.handlers.get(type)?.delete(handler as LiveKitEventHandler<keyof LiveKitRoomEventMap>);
  }

  /**
   * Emits an event to all subscribers synchronously and returns the (possibly mutated) event — so the
   * caller can read `Cancel` and any handler-applied transformations.
   *
   * @param type The event name.
   * @param event The event payload.
   * @returns The same event object after all handlers have run.
   */
  public Emit<K extends keyof LiveKitRoomEventMap>(type: K, event: LiveKitRoomEventMap[K]): LiveKitRoomEventMap[K] {
    const set = this.handlers.get(type);
    if (set) {
      for (const handler of set) {
        try {
          (handler as LiveKitEventHandler<K>)(event);
        } catch (err) {
          // Isolate subscriber failures — never let one handler break the room or skip others.
          console.error(`[LiveKitRoomEventBus] handler for "${String(type)}" threw:`, err);
        }
      }
    }
    return event;
  }

  /** Removes all handlers. Called on controller dispose. */
  public Clear(): void {
    this.handlers.clear();
  }
}
