/**
 * @fileoverview What an agent in a LiveKit ROOM call is told, and the tools it can use to bring someone else in.
 *
 * A carrier call can only be transferred to a phone number: the carrier moves the call and the agent is gone. A room call
 * is different. The caller is a participant in a room the agent is also in, so "transfer" means *bring someone into the
 * room*: a person at an Explorer console (who may accept or decline), a phone number the room dials, or another AI agent.
 * The agent leaves only once the new party is actually there, and the caller never changes rooms.
 *
 * Tools offered (the host executes them; arguments come from the model, so they are validated here):
 * - `transfer_call`: names an entry of the operator's transfer directory plus a `mode` (`warm` or `blind`) and a short
 *   `summary` of the conversation. Never a number, an email or an agent id: the directory is what keeps a caller from
 *   steering the agent to an arbitrary destination.
 * - `finish_handoff`: called after the agent has introduced the new party, so it can leave.
 * - `cancel_pending_work` and `end_call`: the same as on a carrier call.
 *
 * The model is told what happens next through `[handoff]` messages the engine sends (the person accepted, declined, did
 * not answer, has joined), so the instructions here describe those and what to do on each.
 *
 * @module @memberjunction/telephony-adapters
 */

import { LogError, LogStatus } from '@memberjunction/core';
import type { JSONObject, RealtimeToolCall, RealtimeToolDefinition } from '@memberjunction/ai';
import type { BridgeLocalToolHandler } from '@memberjunction/ai-agents';
import { FINISH_HANDOFF_TOOL, MAX_HANDOFF_SUMMARY_CHARS, type HandoffMode, type RoomHandoffAgentContext, type RoomHandoffDeps, type RoomHandoffEngine } from '@memberjunction/livekit-room-server';
import type { CallerIdentity } from './callerIdentity.js';
import { FindTransferTarget, type TransferTarget } from './outboundCallPolicy.js';
import { BuildPhoneFraming, CALL_CONTROL_SETTLE_MS, CANCEL_PENDING_WORK_TOOL, END_CALL_REASON_MAX_CHARS, END_CALL_TOOL, TRANSFER_CALL_TOOL } from './telephonyCallTools.js';
import type { ResolvedDestination } from './handoffDestinations.js';

/** Which kinds of destination this server can actually bring into a room (each needs a different collaborator). */
export interface RoomHandoffCapabilities {
    /** A phone number can be dialed into the room (needs a LiveKit outbound trunk). */
    Number: boolean;
    /** A person can be offered the conversation and watched into the room. */
    User: boolean;
    /** Another AI agent can be started in the room. */
    Agent: boolean;
}

/** Works out what the handoff engine can do from the collaborators it has been given. */
export function ComputeHandoffCapabilities(deps: Readonly<RoomHandoffDeps>): RoomHandoffCapabilities {
    return {
        Number: Boolean(deps.Dialer && deps.Presence),
        User: Boolean(deps.Presence),
        Agent: Boolean(deps.AgentStarter),
    };
}

/** The directory entries this server can act on. An entry whose kind is unsupported is not offered to the model. */
export function SupportedRoomTargets(targets: readonly TransferTarget[], capabilities: RoomHandoffCapabilities): TransferTarget[] {
    return targets.filter((t) => (t.Kind === 'number' ? capabilities.Number : t.Kind === 'user' ? capabilities.User : capabilities.Agent));
}

const HANDOFF_MODES: readonly HandoffMode[] = ['warm', 'blind'];

/**
 * The tools to offer in a room call. `end_call` and `cancel_pending_work` always; `transfer_call` and `finish_handoff` only
 * when there is at least one directory entry the server can act on.
 */
export function BuildRoomCallTools(supportedTargets: readonly TransferTarget[]): RealtimeToolDefinition[] {
    const tools: RealtimeToolDefinition[] = [];
    if (supportedTargets.length > 0) {
        tools.push(buildTransferTool(supportedTargets), buildFinishHandoffTool());
    }
    tools.push({
        Name: CANCEL_PENDING_WORK_TOOL,
        Description:
            'Cancel the lookups or tasks you started on the caller\'s behalf. Use ONLY when the caller says never mind, stop that or cancel. ' +
            'The caller talking, or saying "mm-hm", while you work does not mean cancel.',
        ParametersSchema: objectSchema({}, []),
    });
    tools.push({
        Name: END_CALL_TOOL,
        Description:
            'End the conversation when it is finished. Say goodbye first; it ends a few seconds after you call this. ' +
            'Never end it while the caller still has an open question.',
        ParametersSchema: objectSchema({ reason: stringProperty('A short reason the conversation is ending.') }, []),
    });
    return tools;
}

function buildTransferTool(targets: readonly TransferTarget[]): RealtimeToolDefinition {
    return {
        Name: TRANSFER_CALL_TOOL,
        Description:
            'Bring a person or another assistant into this conversation to take it over. The caller stays on the line with you ' +
            'until they are there, so do NOT say goodbye: tell the caller you are connecting them and keep them company. ' +
            'You will be told what happens (they accept, decline, or do not answer). Only use it when the caller asks for a person or ' +
            `you cannot help. Destinations: ${describeTargets(targets)}`,
        ParametersSchema: objectSchema(
            {
                target: { type: 'string', enum: targets.map((t) => t.Name), description: 'The name of the place to hand over to, exactly as listed.' },
                mode: {
                    type: 'string',
                    enum: [...HANDOFF_MODES],
                    description: '"warm" (default): when they join you introduce them in a sentence or two, then leave. "blind": you leave as soon as they join.',
                },
                summary: stringProperty(
                    `A short summary of the conversation so far (who the caller is, what they need, what you have done), at most ${MAX_HANDOFF_SUMMARY_CHARS} characters. The person sees it before accepting.`,
                ),
            },
            ['target', 'summary'],
        ),
    };
}

function buildFinishHandoffTool(): RealtimeToolDefinition {
    return {
        Name: FINISH_HANDOFF_TOOL,
        Description:
            'Call this after a [handoff] message told you someone has joined AND you have introduced them to the caller. ' +
            'It lets you leave; you will be removed a few seconds later, so finish your last sentence first.',
        ParametersSchema: objectSchema({}, []),
    };
}

/** What the framing needs to know about the call. */
export interface RoomCallFramingInput {
    /** `phone` for a call that arrived through (or was placed through) SIP; `web` for a person who joined the room from a browser. */
    Channel: 'phone' | 'web';
    Direction: 'Inbound' | 'Outbound';
    /** The other party's number (phone calls). */
    RemoteNumber?: string;
    /** What the host knows about an inbound phone caller. */
    Caller?: CallerIdentity;
    /** The directory entries the agent can hand over to (supported ones only). */
    SupportedTargets: readonly TransferTarget[];
    /** Set when this agent is taking a conversation over from another. */
    Takeover?: { PreviousAgentName: string; Brief: string };
}

/**
 * The instructions that make the model behave correctly in a room call: phone etiquette (or web-room etiquette), who is on
 * the other end, how to hand over and what the `[handoff]` messages mean, and, for an agent that is taking over, what it has
 * been told so far. Appended to the agent's own prompt.
 */
export function BuildRoomCallFraming(input: RoomCallFramingInput): string {
    const lines = input.Channel === 'phone' ? phoneLines(input) : webLines();
    if (input.SupportedTargets.length > 0) {
        lines.push(...handoffLines(input.SupportedTargets));
    }
    if (input.Takeover) {
        lines.push(...takeoverLines(input.Takeover));
    }
    return lines.join('\n');
}

function phoneLines(input: RoomCallFramingInput): string[] {
    // The phone framing already carries etiquette, who is calling and what is verified, and the cancel and end-call guidance.
    // Carrier transfer and keypad tones do not exist in a room, so those features are off here.
    return BuildPhoneFraming({
        Direction: input.Direction,
        RemoteNumber: input.RemoteNumber ?? '',
        Caller: input.Caller,
        Features: { CallTransfer: false, DTMF: false },
    }).split('\n');
}

function webLines(): string[] {
    return [
        'You are in a live room with a person who is talking to you by voice. They may also see a chat panel.',
        '- Speak naturally in short sentences. Do not read out markdown, long lists or URLs.',
        `- Use ${CANCEL_PENDING_WORK_TOOL} only when the person says never mind, stop that or cancel. Talking while you work does not cancel anything.`,
        `- When the conversation is complete, say goodbye and then use ${END_CALL_TOOL}.`,
    ];
}

function handoffLines(targets: readonly TransferTarget[]): string[] {
    return [
        `- Use ${TRANSFER_CALL_TOOL} to bring a person or another assistant in when the caller asks or you cannot help. You can only hand over to: ${describeTargets(targets)}.`,
        '  Do not say goodbye when you call it: stay with the caller. You will receive [handoff] messages. If someone has joined, introduce them in one or two ' +
            `sentences, then call ${FINISH_HANDOFF_TOOL}. If nobody is available, tell the caller honestly and carry on helping.`,
    ];
}

function takeoverLines(takeover: { PreviousAgentName: string; Brief: string }): string[] {
    return [
        `You are taking this conversation over from ${takeover.PreviousAgentName}, who is leaving. They said: ${takeover.Brief}`,
        'Introduce yourself in a sentence, then continue helping. Do not make the caller repeat what they already told you.',
    ];
}

/** `Name (description); Name2`: what the agent is told each destination is for. */
function describeTargets(targets: readonly TransferTarget[]): string {
    return targets.map((t) => (t.Description ? `${t.Name} (${t.Description})` : t.Name)).join('; ');
}

/** What the executor needs. */
export interface RoomCallToolExecutorDeps {
    /** The directory entries the agent can hand over to (supported ones only). */
    Targets: readonly TransferTarget[];
    /** The handoff engine (a `Pick` so tests inject a fake). */
    Engine: Pick<RoomHandoffEngine, 'RequestHandoff' | 'AgentReadyToLeave'>;
    /** The agent's room context. Resolved lazily: the bridge session exists only after the agent has started. */
    Agent: () => RoomHandoffAgentContext | undefined;
    /** Resolves a directory entry to a destination, checking everything that can change while the server runs. */
    ResolveDestination: (target: TransferTarget) => Promise<ResolvedDestination>;
    /** Aborts the delegated work in flight; returns how many runs were aborted. */
    CancelPendingWork: () => number;
    /** Ends the conversation (stops this agent and hangs up the phone leg, if any). */
    EndCall: (reason: string) => Promise<void>;
    /** Override for the goodbye settle delay (tests). */
    SettleMs?: number;
}

/** Runs the room-call tools against the live room. */
export class RoomCallToolExecutor implements BridgeLocalToolHandler {
    private ending = false;

    constructor(private readonly deps: RoomCallToolExecutorDeps) {}

    /** Whether `toolName` is one of the room-call tools. */
    public Handles(toolName: string): boolean {
        return toolName === TRANSFER_CALL_TOOL || toolName === FINISH_HANDOFF_TOOL || toolName === CANCEL_PENDING_WORK_TOOL || toolName === END_CALL_TOOL;
    }

    /** Runs one tool call and returns the JSON the model is handed back. Never throws. */
    public async Execute(call: RealtimeToolCall): Promise<string> {
        try {
            switch (call.ToolName) {
                case TRANSFER_CALL_TOOL:
                    return await this.transfer(call);
                case FINISH_HANDOFF_TOOL:
                    return this.finishHandoff();
                case CANCEL_PENDING_WORK_TOOL:
                    return this.cancelPendingWork();
                case END_CALL_TOOL:
                    return this.endCall(call);
                default:
                    return fail(`Unknown call-control tool '${call.ToolName}'.`);
            }
        } catch (e) {
            LogError(`[Telephony] room-call tool ${call.ToolName} failed: ${e instanceof Error ? e.message : String(e)}`);
            return fail('The action failed.');
        }
    }

    private async transfer(call: RealtimeToolCall): Promise<string> {
        const agent = this.deps.Agent();
        if (!agent) {
            return fail('The call is not connected yet.');
        }
        const entry = FindTransferTarget(this.deps.Targets, readArg(call.Arguments, 'target'));
        if (!entry) {
            return fail(`Unknown destination. Choose one of: ${this.deps.Targets.map((t) => t.Name).join(', ')}.`);
        }
        const mode = parseMode(readArg(call.Arguments, 'mode'));
        if (!mode) {
            return fail('mode must be "warm" or "blind".');
        }
        const resolved = await this.deps.ResolveDestination(entry);
        if (!resolved.Ok) {
            return fail(resolved.Error);
        }
        const started = this.deps.Engine.RequestHandoff(agent, { Mode: mode, Destination: resolved.Destination, Summary: readArg(call.Arguments, 'summary') });
        if (!started.Ok) {
            return fail(started.Error);
        }
        return JSON.stringify({ ok: true, status: started.Status, note: noteFor(started.Status, entry.Name) });
    }

    private finishHandoff(): string {
        const agent = this.deps.Agent();
        if (!agent || !this.deps.Engine.AgentReadyToLeave(agent.RoomName)) {
            return fail('No handoff is waiting for you. Keep helping the caller.');
        }
        return JSON.stringify({ ok: true, status: 'leaving', note: 'You will be removed in a few seconds; finish your last sentence.' });
    }

    private cancelPendingWork(): string {
        const cancelled = this.deps.CancelPendingWork();
        LogStatus(`[Telephony] agent cancelled ${cancelled} pending run(s) at the caller's request.`);
        return JSON.stringify({ ok: true, cancelled });
    }

    private endCall(call: RealtimeToolCall): string {
        if (this.ending) {
            return JSON.stringify({ ok: true, status: 'ending' });
        }
        this.ending = true;
        const reason = readArg(call.Arguments, 'reason').trim().slice(0, END_CALL_REASON_MAX_CHARS);
        const timer = setTimeout(() => {
            void this.deps.EndCall(reason || 'agent ended the call').catch((e) => LogError(`[Telephony] ending the room call failed: ${e instanceof Error ? e.message : String(e)}`));
        }, this.deps.SettleMs ?? CALL_CONTROL_SETTLE_MS);
        (timer as { unref?: () => void }).unref?.();
        return JSON.stringify({ ok: true, status: 'ending', note: 'The conversation ends in a few seconds; finish your goodbye.' });
    }
}

/** What the model is told right after a handoff starts, depending on what the engine began doing. */
function noteFor(status: 'offered' | 'dialing' | 'agent-joining', name: string): string {
    switch (status) {
        case 'offered':
            return `${name} has been asked to take this conversation. Keep the caller company and say you are connecting them; you will be told when they answer. Do not say goodbye yet.`;
        case 'dialing':
            return `${name} is being called now. Keep the caller company and say you are connecting them; you will be told when they answer. Do not say goodbye yet.`;
        case 'agent-joining':
            return `${name} is joining now. You will be told when they are in the room. Do not say goodbye yet.`;
    }
}

function parseMode(raw: string): HandoffMode | undefined {
    const value = raw.trim().toLowerCase();
    if (!value) {
        return 'warm';
    }
    return HANDOFF_MODES.find((m) => m === value);
}

/** Reads one string argument from the model's JSON arguments; anything else yields `''`. */
function readArg(argumentsJson: string, name: 'target' | 'mode' | 'summary' | 'reason'): string {
    try {
        const parsed = JSON.parse(argumentsJson || '{}') as Partial<Record<'target' | 'mode' | 'summary' | 'reason', string | number>>;
        const value = parsed?.[name];
        return typeof value === 'string' ? value : '';
    } catch {
        return '';
    }
}

function fail(error: string): string {
    return JSON.stringify({ ok: false, error });
}

function stringProperty(description: string): JSONObject {
    return { type: 'string', description };
}

function objectSchema(properties: Record<string, JSONObject>, required: string[]): JSONObject {
    return { type: 'object', properties, required };
}
