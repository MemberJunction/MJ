import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { LLMToolCall } from './assemblyAILLMGateway';

type ConversationItem =
    | { Kind: 'user' | 'assistant' | 'note'; Text: string }
    | {
          Kind: 'toolCalls';
          Text: string;
          Calls: LLMToolCall[];
          Results: Map<string, string>;
          /** Whether a reply has been asked for since a result came. */
          ResultsRead: boolean;
      };

/** The most items kept. Roughly an hour of talk; past it the oldest turns go. */
const DEFAULT_MAX_ITEMS = 200;

/** The longest single entry, in characters (a tool result, usually). */
const MAX_ENTRY_CHARS = 50_000;

/** The most text kept, in characters: about 100,000 tokens, all of which the LLM reads for every reply. */
const MAX_TOTAL_CHARS = 400_000;

/** The longest one-off instruction, in characters. */
const MAX_INSTRUCTION_CHARS = 8_000;

const RUNNING_PLACEHOLDER = '{"status":"still running; the result will follow in a later message"}';

/**
 * What has been said and done in a call, rendered as chat messages. Every tool call is always followed by an answer, so
 * the history is valid whenever the model is asked: a placeholder while the call runs, then its result.
 *
 * Notes, instructions and late results use the user role, marked as not the user's words. Models behind the gateway
 * ignore a system message late in the conversation (Gemma calls the tool again instead of reading its late result).
 */
export class VoiceConversation {
    private items: ConversationItem[] = [];
    /** What came since the reply in progress began: it does not know of it. */
    private readonly sinceReplyBegan = new Set<ConversationItem>();

    constructor(private readonly maxItems: number = DEFAULT_MAX_ITEMS) {}

    public AddUser(text: string): void {
        this.add({ Kind: 'user', Text: text });
    }

    public AddAssistant(text: string): void {
        this.add({ Kind: 'assistant', Text: text });
    }

    /** The agent begins a reply, from what has been said and done so far. Its words follow in {@link AddReply}. */
    public BeginReply(): void {
        this.sinceReplyBegan.clear();
        for (const item of this.items) {
            if (item.Kind === 'toolCalls' && item.Results.size > 0) {
                item.ResultsRead = true;
            }
        }
    }

    /**
     * The words heard of the reply begun last. They go before what came meanwhile, so a result that came during a reply
     * is still what the next one answers.
     */
    public AddReply(text: string): void {
        const index = this.items.findIndex((item) => this.sinceReplyBegan.has(item));
        const next = this.items[index];
        this.sinceReplyBegan.clear();
        if (!next || text.trim().length === 0) {
            this.AddAssistant(text);
        } else if (next.Kind === 'toolCalls') {
            next.Text = cut(joinWords(next.Text, text)); // a separate turn would put two of the agent's in a row
        } else {
            this.items.splice(index, 0, { Kind: 'assistant', Text: cut(text) });
            this.trim();
        }
    }

    /** Background the model should know, which is not part of the conversation. */
    public AddNote(text: string): void {
        this.add({ Kind: 'note', Text: text });
    }

    /** Tool calls the model made, with whatever it said before them. */
    public AddToolCalls(text: string, calls: LLMToolCall[]): void {
        this.items.push({ Kind: 'toolCalls', Text: cut(text), Calls: calls, Results: new Map(), ResultsRead: false });
        this.trim();
    }

    /** Takes a tool result: in its place, or at the end when the conversation has moved on since the call. */
    public AddToolResult(callID: string, output: string): void {
        const index = this.items.findIndex((item) => item.Kind === 'toolCalls' && item.Calls.some((call) => call.CallID === callID));
        const item = this.items[index];
        if (item?.Kind !== 'toolCalls') {
            this.AddNote(`A tool returned: ${output}`);
            return;
        }
        if (item.Results.has(callID)) {
            return;
        }
        const after = this.items.slice(index + 1);
        if (!item.ResultsRead && after.every((later) => later.Kind === 'note' || later.Kind === 'assistant')) {
            item.Results.set(callID, cut(output));
            // Notes and words since the call are progress reports on it: the result comes after them.
            item.Text = cut(after.reduce((text, later) => (later.Kind === 'assistant' ? joinWords(text, later.Text) : text), item.Text));
            this.items = [...this.items.slice(0, index), ...after.filter((later) => later.Kind === 'note'), item];
            this.sinceReplyBegan.add(item);
            this.trim();
            return;
        }
        const name = item.Calls.find((call) => call.CallID === callID)?.Name ?? 'the tool';
        item.Results.set(callID, RUNNING_PLACEHOLDER);
        this.AddNote(`The ${name} call that was still running has finished. It returned: ${output}`);
    }

    /** The chat messages for the next reply. `instruction` applies to that reply only. */
    public Messages(systemPrompt: string, instruction?: string): ChatCompletionMessageParam[] {
        const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: systemPrompt }, ...this.items.flatMap(render)];
        if (instruction && instruction.trim().length > 0) {
            messages.push({ role: 'user', content: `[Instruction from the application, not said by the user] ${cut(instruction, MAX_INSTRUCTION_CHARS)}` });
        }
        return messages;
    }

    private add(item: { Kind: 'user' | 'assistant' | 'note'; Text: string }): void {
        if (item.Text.trim().length === 0) {
            return;
        }
        const added = { ...item, Text: cut(item.Text) };
        this.items.push(added);
        this.sinceReplyBegan.add(added);
        this.trim();
    }

    /** Drops the oldest entries past either cap, then up to a user turn, so the history starts at one when it can. */
    private trim(): void {
        let total = 0;
        let first = this.items.length;
        while (first > 0 && this.items.length - first < this.maxItems && total + size(this.items[first - 1]) <= MAX_TOTAL_CHARS) {
            first--;
            total += size(this.items[first]);
        }
        if (first === 0) {
            return;
        }
        const kept = this.items.slice(first);
        const firstUser = kept.findIndex((item) => item.Kind === 'user');
        const dropped = this.items.slice(0, first + Math.max(firstUser, 0));
        this.items = this.items.slice(dropped.length);
        dropped.forEach((item) => this.sinceReplyBegan.delete(item));
    }
}

function joinWords(first: string, second: string): string {
    return first.trim().length > 0 ? `${first} ${second}` : second;
}

function cut(text: string, limit: number = MAX_ENTRY_CHARS): string {
    return text.length > limit ? `${text.slice(0, limit)} [truncated]` : text;
}

function size(item: ConversationItem): number {
    if (item.Kind !== 'toolCalls') {
        return item.Text.length;
    }
    const calls = item.Calls.reduce((sum, call) => sum + call.Arguments.length, 0);
    return item.Text.length + calls + [...item.Results.values()].reduce((sum, result) => sum + result.length, 0);
}

function render(item: ConversationItem): ChatCompletionMessageParam[] {
    switch (item.Kind) {
        case 'note':
            return [{ role: 'user', content: `[Note from the application, not said by the user] ${item.Text}` }];
        case 'toolCalls':
            return [
                {
                    role: 'assistant',
                    content: item.Text,
                    tool_calls: item.Calls.map((call) => ({ id: call.CallID, type: 'function', function: { name: call.Name, arguments: call.Arguments } })),
                },
                ...item.Calls.map((call): ChatCompletionMessageParam => ({
                    role: 'tool',
                    tool_call_id: call.CallID,
                    content: item.Results.get(call.CallID) ?? RUNNING_PLACEHOLDER,
                })),
            ];
        default:
            return [{ role: item.Kind, content: item.Text }];
    }
}
