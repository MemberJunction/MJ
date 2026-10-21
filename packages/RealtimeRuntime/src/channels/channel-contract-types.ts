/**
 * @fileoverview The runtime-side types of the channel contract v2: what a channel emits
 * (events, outputs), what a verb returns, and how the `ContextTool` proxy addresses a channel.
 *
 * The *descriptor* types — the declarative half of the contract — live in
 * `@memberjunction/ai-core-plus` (`RealtimeChannelDescriptor` and friends) because the server needs
 * them too. These are the runtime half: shapes that only exist while a session is live.
 *
 * @module @memberjunction/realtime-runtime
 */

import type { JSONObject, JSONValue } from '@memberjunction/ai';

/**
 * The result of running a channel verb (or opening a channel).
 *
 * Structured on purpose: the dispatcher turns a failure into a model-recoverable message, which it
 * can only do well when it knows *why* the call failed ({@link ErrorCode}) rather than having to
 * parse prose out of a JSON string.
 */
export interface RealtimeChannelVerbResult {
    /** Whether the verb did what was asked. */
    Success: boolean;
    /** The verb's result, when it has one. */
    Result?: JSONValue;
    /** A stable machine-readable failure code (e.g. `'invalid_params'`). Present only on failure. */
    ErrorCode?: string;
    /** A message the model can read and act on. Present only on failure. */
    Error?: string;
    /** Specifics of the failure (e.g. each schema violation). */
    Details?: string[];
    /**
     * The instance a successful open created (or acted on), for a {@link RealtimeChannelDescriptor.MultiInstance}
     * channel. Returned from `OnOpen` so the opened note, the `opened` event and the open result name the
     * instance that was just created rather than the channel's primary one. Ignored by single-instance channels.
     */
    Instance?: string;
}

/** One event a channel emitted on {@link BaseRealtimeChannelClient.Events$}. */
export interface RealtimeChannelEvent {
    /** The emitting channel's key. */
    Channel: string;
    /** The emitting instance's id (see {@link BaseRealtimeChannelClient.InstanceId}). */
    Instance: string;
    /** The event name (e.g. `'state_changed'`, `'opened'`, `'frame_pushed'`). */
    Name: string;
    /** The event payload. */
    Payload: JSONObject;
    /**
     * The change id of the state change this event relates to, when it relates to one. A
     * `'state_changed'` event carries the id the change was assigned; a `'frame_pushed'` event
     * carries the id of the state its frame was captured at — so a consumer can check that the
     * pixels and the state they are describing agree.
     */
    ChangeId?: number;
    /** When the event was emitted (epoch ms). */
    OccurredAt: number;
}

/** What a channel handed back when it completed, emitted on {@link BaseRealtimeChannelClient.Output$}. */
export interface RealtimeChannelOutput {
    /** The completing channel's key. */
    Channel: string;
    /** The completing instance's id. */
    Instance: string;
    /** The output (validated against the descriptor's `Output` schema in development builds). */
    Output: JSONObject;
    /** When the channel completed (epoch ms). */
    OccurredAt: number;
}

/**
 * How the `ContextTool` proxy addresses a channel. With no target the proxy runs an app client tool
 * by name; with one it runs a verb of that channel.
 */
export interface RealtimeChannelTarget {
    /** The channel's key (case-insensitive). */
    Channel: string;
    /** Which instance of a multi-instance channel; omit for the channel's primary instance. */
    Instance?: string;
}

/** A targeted `ContextTool` call, handed from the proxy to the runtime for validation and dispatch. */
export interface RealtimeContextActionRequest {
    /** The channel (and instance) being addressed. */
    Target: RealtimeChannelTarget;
    /** The verb to run — or `'open'`, which mounts the channel (and seeds it with `Params`). */
    Action: string;
    /** The verb's parameters (for `'open'`, the channel's open inputs). */
    Params: JSONObject;
}

/**
 * Why a targeted `ContextTool` call was refused. Each code maps to a message that tells the model
 * how to recover, so it can correct itself conversationally instead of going quiet.
 */
export type RealtimeContextErrorCode =
    | 'unknown_channel'
    | 'channel_not_open'
    | 'unknown_instance'
    | 'unknown_verb'
    | 'not_invokable_by_agent'
    | 'invalid_params'
    | 'open_failed'
    | 'exposure_restricted'
    | 'verb_failed';

/** The outcome of a targeted `ContextTool` call. */
export interface RealtimeContextActionResult {
    /** Whether the action ran and succeeded. */
    Success: boolean;
    /** The verb's result (success only). */
    Result?: JSONValue;
    /** Why the call was refused or failed (failure only). */
    ErrorCode?: RealtimeContextErrorCode;
    /** A message the model can read and act on (failure only). */
    ErrorMessage?: string;
    /** Specifics — e.g. each schema violation for `'invalid_params'`. */
    Details?: string[];
    /** What WOULD have been valid (channel keys, instance ids or verb names), so the model can retry. */
    Available?: string[];
}
