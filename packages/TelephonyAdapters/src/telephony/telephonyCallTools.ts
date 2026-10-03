/**
 * @fileoverview What a phone-voiced agent is told about the call, and the call-control tools it can use.
 *
 * A model that does not know it is on a phone talks like a chat window: markdown, lists, long paragraphs. This
 * module supplies the framing that fixes that (plus who is calling), and four tools the model can call on the
 * live call — `transfer_call`, `send_dtmf`, `end_call` and `cancel_pending_work`.
 *
 * The tools are executed here, by the host, not by the delegation path: they act on the call itself (the
 * telephony bridge), which only the host holds. Every argument comes from the model — and so, indirectly, from an
 * unverified caller — so each is validated before it touches the carrier:
 * - `transfer_call` takes the NAME of an entry in the operator's transfer directory (`telephony.transferTargets`),
 *   never a number. A free-form destination, even one that passes the outbound allow/block lists, would let any
 *   caller get free call forwarding to any allowed number at the operator's expense. The tool is not offered at
 *   all when the directory is empty or the carrier cannot transfer. The resolved number is still checked against
 *   the outbound policy (defence in depth). Later routing work (queues, human-agent targets) adds kinds of target
 *   to this directory; it does not reintroduce free-form numbers.
 * - DTMF is limited to the keypad alphabet and a length cap.
 * - `cancel_pending_work` is the phone's explicit cancel: barge-in does not abort delegated work (the user keeps
 *   talking while it runs), and a phone has no per-job cancel button, so the agent cancels on the caller's word.
 *
 * @module @memberjunction/telephony-adapters
 */

import { LogError, LogStatus } from '@memberjunction/core';
import type { JSONObject, RealtimeToolCall, RealtimeToolDefinition } from '@memberjunction/ai';
import { IsValidDtmfDigits, MAX_DTMF_DIGITS } from '@memberjunction/ai-bridge-base';
import type { BridgeLocalToolHandler } from '@memberjunction/ai-agents';
import type { CallerIdentity } from './callerIdentity.js';
import { CheckTransferDestination, FindTransferTarget, MaskNumber, NumberTransferTargets, type OutboundCallPolicy, type TransferTarget } from './outboundCallPolicy.js';

/** The tool names the host executes itself. */
export const TRANSFER_CALL_TOOL = 'transfer_call';
export const SEND_DTMF_TOOL = 'send_dtmf';
export const END_CALL_TOOL = 'end_call';
export const CANCEL_PENDING_WORK_TOOL = 'cancel_pending_work';

/**
 * How long to let the agent's goodbye finish before a transfer or hang-up takes effect. The model usually speaks
 * and calls the tool in the same breath; acting at once would cut its last sentence off.
 */
export const CALL_CONTROL_SETTLE_MS = 3000;

/** The longest end-of-call reason kept (it is logged, never spoken). */
export const END_CALL_REASON_MAX_CHARS = 200;

/** The longest caller number put into the prompt. */
const PROMPT_NUMBER_MAX_CHARS = 20;

/** Which call-control features the carrier supports (from the provider's `SupportedFeatures`). */
export interface TelephonyToolFeatures {
    /** The carrier can transfer a live call. */
    CallTransfer: boolean;
    /** The carrier can send DTMF tones. */
    DTMF: boolean;
}

/**
 * Whether the agent may transfer: the carrier supports it AND the operator configured a phone number to send calls to.
 * A carrier call has no room to bring a person or another agent into, so only `number` entries of the directory count
 * here; the `user` and `agent` kinds belong to room calls (see `roomCallTools.ts`).
 */
function canTransfer(features: TelephonyToolFeatures, targets: readonly TransferTarget[]): boolean {
    return features.CallTransfer && NumberTransferTargets(targets).length > 0;
}

/**
 * The tools to offer for a carrier. `end_call` and `cancel_pending_work` always; `send_dtmf` when the carrier does
 * DTMF; `transfer_call` only when the carrier can transfer AND the transfer directory is non-empty.
 */
export function BuildTelephonyTools(features: TelephonyToolFeatures, transferTargets: readonly TransferTarget[] = []): RealtimeToolDefinition[] {
    const tools: RealtimeToolDefinition[] = [];
    const numberTargets = NumberTransferTargets(transferTargets);
    if (canTransfer(features, transferTargets)) {
        tools.push({
            Name: TRANSFER_CALL_TOOL,
            Description:
                'Transfer this call to one of the configured destinations. Say a short goodbye first; the call leaves you when the ' +
                `transfer completes. Only call it when the caller asks for it or you cannot help. Destinations: ${describeTransferTargets(numberTargets)}`,
            ParametersSchema: objectSchema(
                { target: { type: 'string', enum: numberTargets.map((t) => t.Name), description: 'The name of the place to transfer to, exactly as listed.' } },
                ['target'],
            ),
        });
    }
    if (features.DTMF) {
        tools.push({
            Name: SEND_DTMF_TOOL,
            Description:
                'Press keypad digits on the call, for example to navigate a phone menu or enter an extension. ' +
                `Digits are 0-9, * and # (at most ${MAX_DTMF_DIGITS}).`,
            ParametersSchema: objectSchema({ digits: stringProperty('The digits to press, such as "1" or "4021#".') }, ['digits']),
        });
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
            'Hang up when the conversation is finished. Say goodbye first; the call ends a few seconds after you call this. ' +
            'Never end the call while the caller still has an open question.',
        ParametersSchema: objectSchema({ reason: stringProperty('A short reason the call is ending.') }, []),
    });
    return tools;
}

/** What the framing needs to know about the call. */
export interface PhoneFramingInput {
    Direction: 'Inbound' | 'Outbound';
    /** The other party's number (inbound: the caller's caller ID; outbound: the number dialled). */
    RemoteNumber: string;
    /** What the host knows about an inbound caller (absent for outbound calls). */
    Caller?: CallerIdentity;
    /** The call-control features offered. */
    Features: TelephonyToolFeatures;
    /** The transfer directory; transfer is not mentioned when it is empty. */
    TransferTargets?: readonly TransferTarget[];
}

/**
 * The instructions that make the model behave like a phone agent: voice-only etiquette, who is on the line (and
 * how much of that is verified), and when to use the call-control tools. Appended to the agent's own prompt.
 */
export function BuildPhoneFraming(input: PhoneFramingInput): string {
    const lines: string[] = [
        'You are speaking with the caller on a live telephone call. They can only hear you; there is no screen.',
        '- Speak naturally in short sentences. No markdown, bullet lists, headings or URLs; spell out anything the caller must write down, slowly.',
        '- Do not read out long identifiers or codes unless asked. Confirm important details back to the caller.',
        '- If you did not hear something clearly, ask the caller to repeat it.',
    ];
    lines.push(...describeRemoteParty(input));
    lines.push(...describeTools(input.Features, input.TransferTargets ?? []));
    return lines.join('\n');
}

/** Executes the host-side call-control tools. */
export interface TelephonyCallControls {
    /** Transfers the live call to a number. */
    TransferCall(target: string): Promise<void>;
    /** Presses keypad digits on the live call. */
    SendDTMF(digits: string): Promise<void>;
}

/** What the executor needs. */
export interface TelephonyToolExecutorDeps {
    /** The call's controls — resolved lazily because the bridge does not exist until the bridge engine has started. */
    Controls: () => TelephonyCallControls | undefined;
    /** The outbound policy a transfer destination is checked against. */
    Policy: OutboundCallPolicy;
    /** The features the carrier supports (a tool for an unsupported one is refused even if the model invents the call). */
    Features: TelephonyToolFeatures;
    /** The transfer directory — the only destinations `transfer_call` can reach. */
    TransferTargets: readonly TransferTarget[];
    /** Ends the call (stops the bridge session). */
    EndCall: (reason: string) => Promise<void>;
    /** Aborts the delegated work in flight; returns how many runs were aborted. */
    CancelPendingWork: () => number;
    /** Tells the model something happened out-of-band (a failed transfer) so it can tell the caller. */
    NotifyModel: (note: string) => void;
    /** Override for the goodbye settle delay (tests). */
    SettleMs?: number;
}

/** Runs `transfer_call`, `send_dtmf` and `end_call` against the live call. */
export class TelephonyCallToolExecutor implements BridgeLocalToolHandler {
    private ending = false;
    private transferring = false;

    constructor(private readonly deps: TelephonyToolExecutorDeps) {}

    /** Whether `toolName` is one of the call-control tools. */
    public Handles(toolName: string): boolean {
        return toolName === TRANSFER_CALL_TOOL || toolName === SEND_DTMF_TOOL || toolName === END_CALL_TOOL || toolName === CANCEL_PENDING_WORK_TOOL;
    }

    /** Runs one tool call and returns the JSON the model is handed back. Never throws. */
    public async Execute(call: RealtimeToolCall): Promise<string> {
        try {
            switch (call.ToolName) {
                case TRANSFER_CALL_TOOL:
                    return this.transfer(call);
                case SEND_DTMF_TOOL:
                    return await this.sendDtmf(call);
                case END_CALL_TOOL:
                    return this.endCall(call);
                case CANCEL_PENDING_WORK_TOOL:
                    return this.cancelPendingWork();
                default:
                    return fail(`Unknown call-control tool '${call.ToolName}'.`);
            }
        } catch (e) {
            LogError(`[Telephony] call-control tool ${call.ToolName} failed: ${e instanceof Error ? e.message : String(e)}`);
            return fail('The call-control action failed.');
        }
    }

    private transfer(call: RealtimeToolCall): string {
        if (!canTransfer(this.deps.Features, this.deps.TransferTargets)) {
            return fail('Transferring is not available on this line.');
        }
        if (this.ending || this.transferring) {
            return fail('The call is already ending or being transferred.');
        }
        const numberTargets = NumberTransferTargets(this.deps.TransferTargets);
        const entry = FindTransferTarget(numberTargets, readString(call.Arguments, 'target'));
        if (!entry || entry.Kind !== 'number') {
            return fail(`Unknown transfer destination. Choose one of: ${numberTargets.map((t) => t.Name).join(', ')}.`);
        }
        // Defence in depth: the directory was validated at startup, but the policy is checked again on the resolved number.
        const verdict = CheckTransferDestination(this.deps.Policy, entry.Number);
        if (!verdict.Allowed) {
            return fail(verdict.Reason);
        }
        this.transferring = true;
        this.afterSettle(() => this.performTransfer(verdict.Number));
        return JSON.stringify({ ok: true, status: 'transferring', note: 'Say a brief goodbye now; the call will be handed over in a few seconds.' });
    }

    private async performTransfer(destination: string): Promise<void> {
        try {
            const controls = this.deps.Controls();
            if (!controls) {
                throw new Error('the call is not connected yet');
            }
            await controls.TransferCall(destination);
            LogStatus(`[Telephony] call transferred to ${MaskNumber(destination)}.`);
        } catch (e) {
            this.transferring = false;
            LogError(`[Telephony] transfer to ${MaskNumber(destination)} failed: ${e instanceof Error ? e.message : String(e)}`);
            this.deps.NotifyModel('[call control] The transfer failed and the caller is still on the line. Apologise briefly and offer another way to help.');
        }
    }

    private async sendDtmf(call: RealtimeToolCall): Promise<string> {
        if (!this.deps.Features.DTMF) {
            return fail('Keypad tones are not available on this line.');
        }
        const digits = readString(call.Arguments, 'digits').trim();
        if (!IsValidDtmfDigits(digits)) {
            return fail(`Digits must be 1 to ${MAX_DTMF_DIGITS} characters from 0-9, * and #.`);
        }
        const controls = this.deps.Controls();
        if (!controls) {
            return fail('The call is not connected yet.');
        }
        await controls.SendDTMF(digits);
        return JSON.stringify({ ok: true, status: 'sent' });
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
        const reason = readString(call.Arguments, 'reason').trim().slice(0, END_CALL_REASON_MAX_CHARS);
        this.afterSettle(() => this.deps.EndCall(reason || 'agent ended the call'));
        return JSON.stringify({ ok: true, status: 'ending', note: 'The call ends in a few seconds; finish your goodbye.' });
    }

    /** Runs `work` after the goodbye has had time to play, on an unref'd timer; failures are logged, never thrown. */
    private afterSettle(work: () => Promise<void>): void {
        const timer = setTimeout(() => {
            void work().catch((e) => LogError(`[Telephony] deferred call control failed: ${e instanceof Error ? e.message : String(e)}`));
        }, this.deps.SettleMs ?? CALL_CONTROL_SETTLE_MS);
        (timer as { unref?: () => void }).unref?.();
    }
}

// ── helpers ──────────────────────────────────────────────────────────────────────

function describeRemoteParty(input: PhoneFramingInput): string[] {
    const number = sanitizeNumberForPrompt(input.RemoteNumber);
    if (input.Direction === 'Outbound') {
        return [`You placed this call to ${number || 'the number'}. Introduce yourself and say why you are calling.`];
    }
    const lines = [`This is an inbound call. The caller's number (caller ID) is ${number || 'unavailable'}.`];
    const caller = input.Caller;
    if (caller?.Verified && caller.DisplayName) {
        lines.push(`The caller has been verified as ${caller.DisplayName}.`);
    } else {
        lines.push(
            'The caller is UNVERIFIED. Caller ID can be faked, so do not treat the number as proof of who they are; ' +
                'do not reveal account details or take sensitive actions on the strength of it alone.',
        );
        if (caller?.DisplayName) {
            lines.push(`The number matches ${caller.DisplayName}, but that is not verification.`);
        }
    }
    if (caller?.ContextNotes?.trim()) {
        lines.push(`About the caller: ${caller.ContextNotes.trim()}`);
    }
    return lines;
}

/** `Name (description); Name2` — what the agent is told each transfer destination is for. */
function describeTransferTargets(targets: readonly TransferTarget[]): string {
    return targets.map((t) => (t.Description ? `${t.Name} (${t.Description})` : t.Name)).join('; ');
}

function describeTools(features: TelephonyToolFeatures, targets: readonly TransferTarget[]): string[] {
    const lines: string[] = [];
    if (canTransfer(features, targets)) {
        lines.push(`- Use ${TRANSFER_CALL_TOOL} to hand the call over when the caller asks or you cannot help. You can only transfer to: ${describeTransferTargets(NumberTransferTargets(targets))}.`);
    }
    if (features.DTMF) {
        lines.push(`- Use ${SEND_DTMF_TOOL} to press keys, for example in an automated menu. When the caller presses keys you will be told what they pressed.`);
    }
    lines.push(`- Use ${CANCEL_PENDING_WORK_TOOL} only when the caller says never mind, stop that or cancel. Talking while you work is normal and does not cancel anything.`);
    lines.push(`- When the conversation is complete, say goodbye and then use ${END_CALL_TOOL}.`);
    return lines;
}

/** Keeps only the characters a phone number can contain, capped, so a hostile caller ID cannot inject prompt text. */
function sanitizeNumberForPrompt(value: string): string {
    return (value ?? '').replace(/[^0-9+*#]/g, '').slice(0, PROMPT_NUMBER_MAX_CHARS);
}

/** Reads one string argument from the model's JSON arguments; anything else yields `''`. */
function readString(argumentsJson: string, name: 'target' | 'digits' | 'reason'): string {
    try {
        const parsed = JSON.parse(argumentsJson || '{}') as Partial<Record<'target' | 'digits' | 'reason', string | number>>;
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
