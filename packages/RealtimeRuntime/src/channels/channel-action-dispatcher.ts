/**
 * @fileoverview The **channel action dispatcher** — validates and routes a channel-addressed
 * `ContextTool` call (`{ action, params, target: { channel, instance? } }`).
 *
 * `ContextTool` is deliberately ONE stable provider tool: connect-bound providers cannot re-declare
 * tools mid-session, so anything that must be reachable *after* the call starts — an `on-demand`
 * channel opened mid-call, a verb a channel adds — has to go through it. This is the other half of
 * that bargain: because every verb now arrives through one door, the door can do the checking a
 * dozen native tools never did.
 *
 * What it guarantees, in order, each with a failure the model can read and recover from:
 *
 * 1. the channel exists in this session (`unknown_channel`, listing the ones that do);
 * 2. the instance exists (`unknown_instance`);
 * 3. an unmounted `on-demand` channel is opened before it is used (`channel_not_open`), and `open`
 *    mounts it and seeds it (`open_failed` / `invalid_params`);
 * 4. the verb exists (`unknown_verb`, listing the ones that do);
 * 5. the verb may be invoked by the agent (`not_invokable_by_agent` — a form's `confirm` is the
 *    user's alone), and its result is not one the channel's exposure policy withholds from the agent
 *    (`exposure_restricted`: a verb that returns what the channel holds is refused when the user, the agent's
 *    configuration or a zero-data-retention requirement limits what the model may perceive of it);
 * 6. the parameters satisfy the verb's declared schema (`invalid_params`, listing each violation) —
 *    a malformed call becomes a correctable message instead of a half-applied mutation.
 *
 * Framework-free: the runtime injects how to find and mount channels.
 *
 * @module @memberjunction/realtime-runtime
 */

import type { JSONObject } from '@memberjunction/ai';
import { ValidateJsonAgainstSchemaSubset, type RealtimeChannelDescriptor, type RealtimeChannelVerb } from '@memberjunction/ai-core-plus';
import type { BaseRealtimeChannelClient } from './base-realtime-channel-client';
import { FormatParameterList } from './channel-schema-format';
import type {
    RealtimeChannelVerbResult,
    RealtimeContextActionRequest,
    RealtimeContextActionResult,
    RealtimeContextErrorCode,
} from './channel-contract-types';

/** The reserved action that mounts a channel and seeds it with its open inputs. */
export const CHANNEL_OPEN_ACTION = 'open';

/** A channel the dispatcher can address. */
export interface DispatchableChannel {
    /** The channel plugin. */
    Plugin: BaseRealtimeChannelClient;
    /** Whether the channel is mounted (initialized and live) — `false` for an advertised, unopened `on-demand` channel. */
    IsOpen: boolean;
}

/** How the dispatcher reaches the session's channels. */
export interface ChannelDispatchHost {
    /** Finds a channel in the session by key (case-insensitive), open or not; `null` when it is not in the session. */
    FindChannel(key: string): DispatchableChannel | null;
    /** The keys of every channel in the session, for error messages. */
    ListChannelKeys(): string[];
    /** Mounts an unopened `on-demand` channel (initialize, publish, tab). Resolves when it is live. */
    ActivateChannel(plugin: BaseRealtimeChannelClient): Promise<void>;
}

/** Builds a failure outcome. */
function failure(
    code: RealtimeContextErrorCode,
    message: string,
    extras: { Details?: string[]; Available?: string[] } = {},
): RealtimeContextActionResult {
    return { Success: false, ErrorCode: code, ErrorMessage: message, ...extras };
}

/** Summarizes a verb's call shape for an error message: `name(a:string, b?:number)`. */
function verbSignature(verb: RealtimeChannelVerb): string {
    return `${verb.Name}(${FormatParameterList(verb.ParametersSchema)})`;
}

/**
 * Validates and dispatches channel-addressed `ContextTool` calls.
 */
export class ChannelActionDispatcher {
    constructor(private readonly host: ChannelDispatchHost) {}

    /**
     * Runs one addressed call. Never throws: every refusal and every failure is a structured result.
     *
     * @param request The addressed call.
     */
    public async Dispatch(request: RealtimeContextActionRequest): Promise<RealtimeContextActionResult> {
        const channel = this.host.FindChannel(request.Target.Channel);
        if (!channel) {
            return failure(
                'unknown_channel',
                `There is no channel "${request.Target.Channel}" in this session.`,
                { Available: this.host.ListChannelKeys() },
            );
        }
        const descriptor = channel.Plugin.GetDescriptor();
        const instanceProblem = this.checkInstance(request, channel.Plugin, descriptor);
        if (instanceProblem) {
            return instanceProblem;
        }
        if (request.Action.trim().toLowerCase() === CHANNEL_OPEN_ACTION) {
            return this.openChannel(request, channel, descriptor);
        }
        if (!channel.IsOpen) {
            return failure(
                'channel_not_open',
                `The ${descriptor.DisplayName} channel is available but not open yet. Open it first with action "${CHANNEL_OPEN_ACTION}" and target channel "${descriptor.Key}".`,
            );
        }
        return this.runVerb(request, channel.Plugin, descriptor);
    }

    /** Refuses an instance id the channel does not have. */
    private checkInstance(
        request: RealtimeContextActionRequest,
        plugin: BaseRealtimeChannelClient,
        descriptor: RealtimeChannelDescriptor,
    ): RealtimeContextActionResult | null {
        const instance = request.Target.Instance;
        if (instance === undefined || descriptor.MultiInstance || instance === plugin.InstanceId) {
            return null;
        }
        return failure(
            'unknown_instance',
            `The ${descriptor.DisplayName} channel has no instance "${instance}".`,
            { Available: [plugin.InstanceId] },
        );
    }

    /** Mounts the channel if needed, then opens it with the supplied inputs. */
    private async openChannel(
        request: RealtimeContextActionRequest,
        channel: DispatchableChannel,
        descriptor: RealtimeChannelDescriptor,
    ): Promise<RealtimeContextActionResult> {
        try {
            if (!channel.IsOpen) {
                await this.host.ActivateChannel(channel.Plugin);
            }
            const opened = await channel.Plugin.Open(request.Params);
            if (opened.Success) {
                return { Success: true, Result: opened.Result };
            }
            const code: RealtimeContextErrorCode = opened.ErrorCode === 'invalid_params' ? 'invalid_params' : 'open_failed';
            return failure(code, opened.Error ?? `The ${descriptor.DisplayName} channel could not be opened.`, { Details: opened.Details });
        } catch (error) {
            console.error(`[ChannelActionDispatcher] Opening channel '${descriptor.Key}' failed:`, error);
            return failure('open_failed', `The ${descriptor.DisplayName} channel could not be opened: ${errorMessage(error)}`);
        }
    }

    /** Resolves, authorizes and validates a verb, then runs it. */
    private async runVerb(
        request: RealtimeContextActionRequest,
        plugin: BaseRealtimeChannelClient,
        descriptor: RealtimeChannelDescriptor,
    ): Promise<RealtimeContextActionResult> {
        const wanted = request.Action.trim().toLowerCase();
        const verb = descriptor.Verbs.find((v) => v.Name.toLowerCase() === wanted);
        if (!verb) {
            return failure(
                'unknown_verb',
                `The ${descriptor.DisplayName} channel has no action "${request.Action}".`,
                { Available: descriptor.Verbs.filter((v) => v.InvokableBy !== 'user').map((v) => v.Name) },
            );
        }
        if (verb.InvokableBy === 'user') {
            return failure('not_invokable_by_agent', `"${verb.Name}" can only be done by the user, not by you. Ask them to do it.`);
        }
        const withheld = plugin.RefuseVerbForExposure(verb);
        if (withheld) {
            return failure('exposure_restricted', withheld, { Details: [...plugin.ExposureReasons] });
        }
        const issues = ValidateJsonAgainstSchemaSubset(request.Params, verb.ParametersSchema);
        if (issues.length > 0) {
            return failure(
                'invalid_params',
                `The parameters for ${verb.Name} are invalid. Expected ${verbSignature(verb)}. Fix them and call it again.`,
                { Details: issues },
            );
        }
        return this.invoke(plugin, verb, request.Params, request.Target.Instance);
    }

    /** Runs the verb and maps its structured result. */
    private async invoke(
        plugin: BaseRealtimeChannelClient,
        verb: RealtimeChannelVerb,
        params: JSONObject,
        instance: string | undefined,
    ): Promise<RealtimeContextActionResult> {
        try {
            const result: RealtimeChannelVerbResult = await plugin.ApplyVerb(verb.Name, params, 'agent', instance);
            if (result.Success) {
                return { Success: true, Result: result.Result };
            }
            return failure('verb_failed', result.Error ?? `${verb.Name} could not be performed.`, { Details: result.Details });
        } catch (error) {
            console.error(`[ChannelActionDispatcher] Verb '${verb.Name}' threw:`, error);
            return failure('verb_failed', `${verb.Name} could not be performed: ${errorMessage(error)}`);
        }
    }
}

/** A readable message for a thrown value. */
function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
