/**
 * @fileoverview The realtime **channel descriptor** — the self-describing contract of an
 * interactive realtime channel (Whiteboard, Remote Browser, Media, an Open App's own widget, …).
 *
 * A channel is a plugin that gives a realtime agent something to *look at* and *act on* next to
 * the voice conversation. Until now an agent learned what a channel was from prose baked into a
 * server prompt, and a new channel needed a prompt change to be usable. The descriptor moves that
 * knowledge onto the channel itself: **a channel an agent has never seen is operable from its
 * declaration alone** — what it is, the things it holds ({@link RealtimeChannelNoun}), the actions
 * it accepts ({@link RealtimeChannelVerb}), what it streams back ({@link RealtimeChannelEventSpec}),
 * and how it behaves in a session (display, availability, data exposure).
 *
 * Everything here is **pure data, JSON-serializable, and framework-neutral** so the same shapes
 * travel unchanged between the browser runtime (`@memberjunction/realtime-runtime`), server code
 * (`@memberjunction/ai-agents`, `@memberjunction/server`) and non-Angular hosts. The descriptor is
 * what reaches the agent, so every string in it is written *for the model*.
 *
 * @module @memberjunction/ai-core-plus
 */

import type { JSONObject } from '@memberjunction/ai';

/**
 * The contract version a channel written against THIS module implements. Bumped when the
 * descriptor's meaning changes incompatibly (never for additive optional members).
 */
export const REALTIME_CHANNEL_CONTRACT_VERSION = '2.0.0';

/**
 * The version stamped on a descriptor the runtime *synthesized* for a channel that implements
 * only the original (v1) members — tools, tab chrome, state of record. It lets a reader (a log
 * line, a test, the catalog note) tell an authored descriptor from a derived one at a glance.
 */
export const REALTIME_CHANNEL_LEGACY_CONTRACT_VERSION = '1.0.0';

/**
 * A JSON Schema (draft-07 subset) describing a verb's parameters, a noun's state, an event
 * payload, a channel's open inputs or its output.
 *
 * This is deliberately the SAME type as `RealtimeToolDefinition.ParametersSchema` in
 * `@memberjunction/ai` — the schema a channel already writes for a native tool is reusable as
 * a verb schema unchanged. Validation (see {@link ValidateJsonAgainstSchemaSubset}) enforces the
 * common keywords and ignores the rest, so a richer schema degrades to "less checked", never to
 * "rejected".
 */
export type RealtimeChannelSchema = JSONObject;

/**
 * Who may invoke a verb. The agent can fill a form from the conversation, but only the user can
 * confirm it — `InvokableBy` is how a channel states that, and the dispatcher enforces it
 * (an agent attempting a `'user'`-only verb gets a structured, model-recoverable refusal).
 */
export type RealtimeChannelInvoker = 'agent' | 'user' | 'both';

/** Who is acting when a verb runs. */
export type RealtimeChannelActor = 'agent' | 'user';

/**
 * How a channel appears in a session:
 *
 * - `'open-on-start'` — mounted with the session; its native tools are declared to the model at
 *   mint (typed native tools beat a proxy call when they are known up front).
 * - `'on-demand'` — advertised to the agent (with its descriptor) but NOT mounted until the agent
 *   (or user) opens it; its verbs are reached through the `ContextTool` proxy.
 * - `'headless'` — never rendered; a wire, not a panel (e.g. the client-context channel).
 */
export type RealtimeChannelDisplayPolicy = 'open-on-start' | 'on-demand' | 'headless';

/**
 * Whether a channel is in a session by default:
 *
 * - `'all-sessions'` — present unless a scope layer removes it. Every channel that existed before
 *   this contract is `'all-sessions'`, so today's behavior is preserved exactly.
 * - `'opt-in'` — present only when an agent, an app or the host asks for it. New channels default
 *   to this so shipping one never silently changes every session in a database.
 */
export type RealtimeChannelAvailability = 'all-sessions' | 'opt-in';

/**
 * The most a channel can expose to the model, ordered `none` < `state` < `pixels`:
 *
 * - `'none'` — nothing flows to the model (a pure action surface).
 * - `'state'` — structured state (nouns) may be described to the model.
 * - `'pixels'` — rendered frames may additionally be sent to a video-capable model.
 *
 * A channel declares the ceiling it *can* reach; policy (agent config, the user) may only lower it.
 */
export type RealtimeChannelExposure = 'none' | 'state' | 'pixels';

/** A thing the channel holds (a board, a form, a document) and the schema of its state. */
export interface RealtimeChannelNoun {
    /** Stable name of the noun, referenced from verbs and state snapshots (e.g. `'board'`). */
    Name: string;
    /** What this thing is, for the model. */
    Description: string;
    /** JSON Schema of this noun's state as it appears in the channel's state snapshot. */
    Schema: RealtimeChannelSchema;
}

/** An action the channel accepts. */
export interface RealtimeChannelVerb {
    /** Verb name as the agent addresses it (e.g. `'AddNote'`). Matched case-insensitively. */
    Name: string;
    /** What the verb does and when to use it, for the model. */
    Description: string;
    /** JSON Schema of the verb's parameters; the dispatcher validates calls against it. */
    ParametersSchema: RealtimeChannelSchema;
    /** Who may invoke it. */
    InvokableBy: RealtimeChannelInvoker;
    /** Conditions that must hold for the verb to succeed, in plain language for the model. */
    Preconditions?: string[];
    /**
     * The native provider tool this verb is ALSO exposed as, when the channel is mounted at
     * session start (e.g. `'Whiteboard_AddNote'`). Present so prompts and transcripts that
     * already know the tool name stay valid, and so the dispatcher can route a proxy call to the
     * same executor a native call uses.
     */
    NativeToolName?: string;
}

/** An event a channel streams back (state changes, user actions). */
export interface RealtimeChannelEventSpec {
    /** Event name (e.g. `'state_changed'`, `'cell_filled'`). */
    Name: string;
    /** When it fires and what it means, for the model. */
    Description: string;
    /** JSON Schema of the event payload. */
    PayloadSchema?: RealtimeChannelSchema;
}

/**
 * The complete, self-describing contract of one realtime channel. Returned by
 * `BaseRealtimeChannelClient.GetDescriptor()`; goes to the agent verbatim (as a catalog entry)
 * and drives scoping, dispatch and validation.
 */
export interface RealtimeChannelDescriptor {
    /** Stable channel key (e.g. `'Whiteboard'`, `'InteractiveComponent'`); the `target.channel` an agent addresses. */
    Key: string;
    /** Semver of the channel contract this plugin implements (see {@link REALTIME_CHANNEL_CONTRACT_VERSION}). */
    Version: string;
    /** Human-readable name. */
    DisplayName: string;
    /** The npm package that owns the channel (e.g. `'@mj-biz-apps/forms-ng'`). */
    OwningPackage?: string;
    /** Natural language for the agent: what the channel is, how to use it, rules of etiquette. */
    Instructions: string;
    /** The things the channel holds and the schema of their state. */
    Nouns: RealtimeChannelNoun[];
    /** The actions the channel accepts. */
    Verbs: RealtimeChannelVerb[];
    /** What the agent may pass when opening the channel (seed data). */
    Inputs?: RealtimeChannelSchema;
    /** What the channel streams back. */
    Events?: RealtimeChannelEventSpec[];
    /** What the channel hands back when it completes. */
    Output?: RealtimeChannelSchema;
    /** How the channel appears in a session. */
    DisplayPolicy: RealtimeChannelDisplayPolicy;
    /** Whether the channel is in a session by default. */
    DefaultAvailability: RealtimeChannelAvailability;
    /** The most the channel can expose to the model; policy may only lower it. */
    MaxExposure: RealtimeChannelExposure;
    /** Whether the agent may hold more than one live instance (e.g. two components). */
    MultiInstance?: boolean;
}
