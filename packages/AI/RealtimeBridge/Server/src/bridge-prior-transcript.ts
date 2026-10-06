/**
 * @fileoverview Builds the role-tagged "what was said so far" text a re-opened model session is seeded with.
 *
 * When a call's model connection drops and is re-established, the new session knows nothing about the
 * conversation. The engine keeps a short tail of final transcript lines and hands them to the recovery factory
 * as this text, which the agent layer frames into the new session's prompt as an earlier part of the same call.
 *
 * @module @memberjunction/ai-bridge-server
 */

/** One final transcript turn kept for recovery. */
export interface BridgeTranscriptTurn {
    /** Who spoke: the human (`user`) or the agent (`assistant`). */
    Role: 'user' | 'assistant';
    /** The final text of the turn. */
    Text: string;
}

/** Most turns carried into a recovered session (the oldest are dropped first). */
export const PRIOR_TRANSCRIPT_MAX_TURNS = 30;

/** Most characters carried into a recovered session (the oldest are dropped first). */
export const PRIOR_TRANSCRIPT_MAX_CHARS = 8000;

/** How many turns the engine retains per session — a little over what is ever replayed. */
export const TRANSCRIPT_TAIL_MAX_TURNS = 60;

/**
 * Formats turns as `User: …` / `Assistant: …` lines, newest turns preferred: the result never exceeds
 * {@link PRIOR_TRANSCRIPT_MAX_TURNS} turns or {@link PRIOR_TRANSCRIPT_MAX_CHARS} characters, dropping from the
 * oldest end. Blank turns are skipped. Returns `''` when there is nothing to carry.
 *
 * @param turns The retained turns, oldest first.
 * @returns The transcript text.
 */
export function BuildPriorTranscript(turns: readonly BridgeTranscriptTurn[]): string {
    const lines: string[] = [];
    let chars = 0;
    for (let i = turns.length - 1; i >= 0 && lines.length < PRIOR_TRANSCRIPT_MAX_TURNS; i--) {
        const text = turns[i].Text.trim();
        if (!text) {
            continue;
        }
        const line = `${turns[i].Role === 'user' ? 'User' : 'Assistant'}: ${text}`;
        if (chars + line.length > PRIOR_TRANSCRIPT_MAX_CHARS && lines.length > 0) {
            break;
        }
        lines.unshift(line);
        chars += line.length + 1;
    }
    return lines.join('\n');
}

/**
 * Appends a turn to a retained tail, trimming it to {@link TRANSCRIPT_TAIL_MAX_TURNS}. Blank text is ignored.
 *
 * @param tail The session's retained turns (mutated).
 * @param turn The turn to add.
 */
export function AppendTranscriptTurn(tail: BridgeTranscriptTurn[], turn: BridgeTranscriptTurn): void {
    if (!turn.Text.trim()) {
        return;
    }
    tail.push(turn);
    if (tail.length > TRANSCRIPT_TAIL_MAX_TURNS) {
        tail.splice(0, tail.length - TRANSCRIPT_TAIL_MAX_TURNS);
    }
}
