/**
 * author.ts — the `authored` arm: an LLM writes, for each round, the finishIf the loop model could
 * have attached to its Actions step.
 *
 * The recorded runs predate `finishIf`, so no round carries one. The author sees what the loop model
 * saw when it asked for the actions (its reasoning and the actions with their params) and the loop
 * agent's own finishIf guidance, verbatim. It never sees the results or the label: its input type has
 * no field for them. Its reply is validated by the same check the loop agent type applies, with at
 * most two retries.
 */
import { ChatMessageRole, type ChatMessage, type JSONValue } from '@memberjunction/ai';
import type { AgentFinishIf } from '@memberjunction/ai-core-plus';
import { IsValidFinishIf } from '@memberjunction/ai-agents';
import { NormalizeId } from './rounds';
import type { AuthoredFinishIf, ReplayRound } from './types';

/** How many times the author is asked again after an invalid reply. */
export const FINISH_IF_AUTHOR_MAX_RETRIES = 2;

/** The template block that holds the loop agent's finishIf guidance. */
const GUIDANCE_OPENING = /\{%-?\s*if\s+__agentTypePromptParams\.includeFinishIfDocs\s*!=\s*false\s*-?%\}/;

/** Any Nunjucks `if` opening or `endif`, for matching the guidance block's own `endif`. */
const IF_TAG_SOURCE = String.raw`\{%-?\s*(if|endif)\b[^%]*%\}`;

/** What the author may see of a round: nothing about the actions' results or the next turn. */
export type AuthorInput = Pick<ReplayRound, 'Reasoning' | 'RequestedActions'>;

/** One reply from the author's chat model. */
export interface AuthorChatReply {
    Success: boolean;
    Text: string;
    Error: string | null;
}

/** The author's chat model. */
export interface AuthorChat {
    Complete(messages: ChatMessage[]): Promise<AuthorChatReply>;
}

/** What authoring one round produced. */
export interface AuthorOutcome {
    /** The validated finishIf, or null when every attempt failed. */
    FinishIf: AgentFinishIf | null;
    Attempts: number;
    /** Why the last attempt failed, when none succeeded. */
    Error: string | null;
}

/** An authored reply, parsed: the finishIf, or why it is not one. */
export type AuthoredParse = { FinishIf: AgentFinishIf; Error: null } | { FinishIf: null; Error: string };

/**
 * The loop agent's finishIf guidance from its system prompt template: the `includeFinishIfDocs`
 * block, and the `AgentFinishIf` interface when the template carries it. Throws when the block is
 * missing, so the author never runs on paraphrased or absent guidance.
 */
export function ExtractFinishIfGuidance(templateText: string): string {
    const opening = GUIDANCE_OPENING.exec(templateText);
    if (!opening) {
        throw new Error('The loop agent system prompt template has no includeFinishIfDocs block');
    }
    const start = opening.index + opening[0].length;
    const end = matchingEndIf(templateText, start);
    const parts = [templateText.slice(start, end).trim()];
    const shape = /interface AgentFinishIf \{[^}]*\}/.exec(templateText);
    if (shape) {
        parts.push(shape[0]);
    }
    return parts.join('\n\n');
}

/** The index of the `endif` that closes an `if` whose body starts at `from`. */
function matchingEndIf(text: string, from: number): number {
    let depth = 1;
    const tags = new RegExp(IF_TAG_SOURCE, 'g');
    tags.lastIndex = from;
    for (let tag = tags.exec(text); tag; tag = tags.exec(text)) {
        depth += tag[1] === 'if' ? 1 : -1;
        if (depth === 0) {
            return tag.index;
        }
    }
    throw new Error('The includeFinishIfDocs block in the loop agent system prompt template is not closed');
}

/** The author's instructions, around the guidance. */
function systemPrompt(guidance: string): string {
    return [
        'You are reconstructing what an AI agent would have written at one step of a past run.',
        'The agent is a loop agent. At this step it asked to run the actions below. It could have attached `finishIf` to that Actions step. Its own instructions for `finishIf` are these, verbatim:',
        '<finishIf-guidance>',
        guidance,
        '</finishIf-guidance>',
        'Write the `finishIf` the agent would have attached if this step should complete the task: one to three yes/no questions that a fast model can answer from the step\'s results, and the final message.',
        'You see only what the agent saw before the actions ran: its reasoning and the actions it requested. You do not know the results.',
        'Reply with a JSON object only, with no other text: {"questions": ["..."], "message": "..."}'
    ].join('\n\n');
}

/** What the agent saw before the actions ran. */
function roundPrompt(input: AuthorInput): string {
    const actions: JSONValue = input.RequestedActions.map(action => ({ name: action.Name, params: action.Params }));
    return [
        'The agent\'s reasoning for this step:',
        `<reasoning>\n${input.Reasoning}\n</reasoning>`,
        'The actions it requested:',
        `<actions>\n${JSON.stringify(actions, null, 2)}\n</actions>`
    ].join('\n\n');
}

/** The messages that ask the author for one round's finishIf. */
export function BuildAuthorMessages(input: AuthorInput, guidance: string): ChatMessage[] {
    return [
        { role: ChatMessageRole.system, content: systemPrompt(guidance) },
        { role: ChatMessageRole.user, content: roundPrompt(input) }
    ];
}

/** The follow-up that asks again after an invalid reply. */
function retryMessages(reply: string, error: string): ChatMessage[] {
    return [
        { role: ChatMessageRole.assistant, content: reply },
        { role: ChatMessageRole.user, content: `That reply is not a valid finishIf: ${error}. Reply with a JSON object only: {"questions": ["..."], "message": "..."}, with one to three non-empty questions and a non-empty message.` }
    ];
}

/** The JSON object in a reply, allowing code fences and text around it. */
function jsonObjectText(text: string): string | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    return start >= 0 && end > start ? text.slice(start, end + 1) : null;
}

/** Parses an authored reply, accepting the finishIf at the top level or under `finishIf`. */
export function ParseAuthoredFinishIf(text: string): AuthoredParse {
    const json = jsonObjectText(text);
    if (!json) {
        return { FinishIf: null, Error: 'it has no JSON object' };
    }
    let parsed: JSONValue;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { FinishIf: null, Error: 'its JSON does not parse' };
    }
    const candidate = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) && 'finishIf' in parsed ? parsed.finishIf : parsed;
    return IsValidFinishIf(candidate)
        ? { FinishIf: { questions: [...candidate.questions], message: candidate.message }, Error: null }
        : { FinishIf: null, Error: 'it needs one to three non-empty string questions and a non-empty string message' };
}

/** Asks the author for one round's finishIf, retrying an invalid or failed reply up to `maxRetries` times. */
export async function AuthorFinishIf(
    input: AuthorInput,
    guidance: string,
    chat: AuthorChat,
    maxRetries: number = FINISH_IF_AUTHOR_MAX_RETRIES
): Promise<AuthorOutcome> {
    const messages = BuildAuthorMessages(input, guidance);
    let error = 'no attempt was made';
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const reply = await chat.Complete(messages);
        if (!reply.Success) {
            error = reply.Error ?? 'the chat call failed';
            continue;
        }
        const parsed = ParseAuthoredFinishIf(reply.Text);
        if (parsed.FinishIf) {
            return { FinishIf: parsed.FinishIf, Attempts: attempt, Error: null };
        }
        error = parsed.Error;
        messages.push(...retryMessages(reply.Text, parsed.Error));
    }
    return { FinishIf: null, Attempts: maxRetries + 1, Error: error };
}

/** One `authored.jsonl` line: `{ roundId, questions, message }`. */
export function SerializeAuthoredLine(entry: AuthoredFinishIf): string {
    return JSON.stringify({ roundId: entry.RoundId, questions: entry.FinishIf.questions, message: entry.FinishIf.message });
}

/** The entries of an `authored.jsonl` file, by round. Lines that are not a valid entry are skipped. */
export function ParseAuthoredCache(text: string): Map<string, AuthoredFinishIf> {
    const entries = new Map<string, AuthoredFinishIf>();
    for (const line of text.split('\n').map(l => l.trim()).filter(l => l.length > 0)) {
        let parsed: JSONValue;
        try {
            parsed = JSON.parse(line);
        } catch {
            continue;
        }
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || typeof parsed.roundId !== 'string') {
            continue;
        }
        const finishIf = { questions: parsed.questions, message: parsed.message };
        if (IsValidFinishIf(finishIf)) {
            entries.set(NormalizeId(parsed.roundId), { RoundId: parsed.roundId, FinishIf: { questions: [...finishIf.questions], message: finishIf.message } });
        }
    }
    return entries;
}
