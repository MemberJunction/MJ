/**
 * The host-tool contract between a **full-duplex** realtime model and the room's turn-taking.
 *
 * ## Why host tools
 * Neither GPT-Live nor the Gemini Live 3.8 models expose a protocol-level "I was addressed" or "I am passing
 * the floor" signal, and both listen while they speak. What they DO reliably do is call functions. So the
 * model's own judgement reaches the engine through two cheap, side-effect-free tools:
 *
 * - `i_am_addressed` — "that was meant for me; I am about to answer". Latches the model-side matcher
 *   ({@link import('./turn-taking-policy').ModelSideAddressedMatcher}) and lets the coordinator reserve the
 *   floor before audio starts, so a peer's turn cannot start at the same instant.
 * - `yield_turn` — "I am done / I am handing over". Optionally names the agent who should speak next; the
 *   server package's `MultiAgentRoomCoordinator` reserves the floor for it.
 *
 * The definitions, the prompt framing the model needs to use them well, and the argument parsing live here
 * (platform-agnostic, no I/O) so a host that binds the tools to a session — and the engine that acts on the
 * calls — agree on one contract. Neither tool needs a round trip to anything outside the process.
 */

import type { BridgeChannelToolDefinition } from './channel-plane';

/** Tool name: the model judges the last turn was directed at it. */
export const TURN_TOOL_I_AM_ADDRESSED = 'i_am_addressed';

/** Tool name: the model hands the floor over, optionally to a named agent. */
export const TURN_TOOL_YIELD_TURN = 'yield_turn';

/** The model-visible definitions of the turn-taking host tools. */
export const TURN_TAKING_TOOL_DEFINITIONS: readonly BridgeChannelToolDefinition[] = [
    {
        Name: TURN_TOOL_I_AM_ADDRESSED,
        Description:
            'Call this, then answer, when what you just heard was directed at YOU (by name, by role, or because ' +
            'the conversation clearly turned to you). Do not call it for speech aimed at someone else; stay silent instead.',
        ParametersSchema: { type: 'object', properties: {}, additionalProperties: false },
    },
    {
        Name: TURN_TOOL_YIELD_TURN,
        Description:
            'Call this when you are finished and want to hand the floor over. Pass `to` (an agent\'s name) to ' +
            'hand it to that specific agent; omit `to` to simply give the floor back to the room.',
        ParametersSchema: {
            type: 'object',
            properties: {
                to: { type: 'string', description: "The name of the agent who should speak next. Omit to just release the floor." },
            },
            additionalProperties: false,
        },
    },
];

/**
 * Prompt framing appended to a full-duplex agent's instructions in a shared room. Written as behaviour, not
 * mechanism: it tells the model WHEN to speak, stay silent, acknowledge briefly, and hand over.
 */
export const MODEL_SIDE_TURN_TAKING_FRAMING =
    'You share this room with other agents and people, and you hear all of them while you speak. ' +
    'Speak only when something is directed at you or when you have something the room clearly needs; otherwise stay quiet. ' +
    `When you are addressed, call ${TURN_TOOL_I_AM_ADDRESSED} and then answer. ` +
    'If a person starts talking, stop at once and let them finish. ' +
    'While someone else is speaking you may give a very short acknowledgement ("mm-hm", "right") but never a full reply. ' +
    `When you are done and another agent should continue, call ${TURN_TOOL_YIELD_TURN} with that agent's name. ` +
    'Do not keep an agent-to-agent exchange going once the point is made.';

/** A parsed turn-taking tool call. */
export type ParsedTurnToolCall =
    | { Kind: 'Addressed' }
    | { Kind: 'Yield'; To?: string }
    | { Kind: 'Invalid'; Reason: string };

/**
 * Whether a tool name belongs to the turn-taking contract.
 *
 * @param toolName The tool the model invoked.
 */
export function IsTurnTakingTool(toolName: string): boolean {
    return toolName === TURN_TOOL_I_AM_ADDRESSED || toolName === TURN_TOOL_YIELD_TURN;
}

/**
 * Parses one turn-taking tool call. Tolerant by design — a model that passes junk arguments to a harmless
 * signalling tool must still have its signal honoured, so a malformed `to` degrades to "no target" rather
 * than an error, and only genuinely unreadable JSON is `Invalid`.
 *
 * @param toolName The tool the model invoked.
 * @param argsJson The raw arguments JSON the model emitted (may be empty).
 * @returns The parsed call, or `null` when `toolName` is not a turn-taking tool.
 */
export function ParseTurnTakingToolCall(toolName: string, argsJson: string): ParsedTurnToolCall | null {
    if (toolName === TURN_TOOL_I_AM_ADDRESSED) {
        return { Kind: 'Addressed' };
    }
    if (toolName !== TURN_TOOL_YIELD_TURN) {
        return null;
    }
    const trimmed = argsJson?.trim() ?? '';
    if (trimmed.length === 0) {
        return { Kind: 'Yield' };
    }
    try {
        const parsed: Record<string, unknown> | null = JSON.parse(trimmed);
        const to = parsed && typeof parsed['to'] === 'string' ? parsed['to'].trim() : '';
        return to.length > 0 ? { Kind: 'Yield', To: to } : { Kind: 'Yield' };
    } catch (err) {
        return { Kind: 'Invalid', Reason: `yield_turn arguments are not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
    }
}
