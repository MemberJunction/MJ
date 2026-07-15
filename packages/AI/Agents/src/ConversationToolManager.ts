/**
 * @fileoverview Conversation-history retrieval tools (RLM-style addressable paging).
 *
 * The cross-turn summary (see ConversationCompactionManager) is deliberately lossy — a
 * compact handle over history that has left the context window. These tools are the
 * other half of the design (plans/agent-conversation-compaction.md §5): the full
 * history stays in an addressable external store (ConversationDetail rows keyed by the
 * persisted per-conversation `Sequence`), and the agent pages exact slices back in on
 * demand instead of trusting the summary. Zero turn cost — calls ride the
 * `conversationToolCalls` inline response field, mirroring `artifactToolCalls`.
 *
 * All reads are served from `ConversationEngine`'s per-conversation cache (one query on
 * a cold miss, in-memory afterward).
 *
 * @module @memberjunction/ai-agents
 */

import { UserInfo } from '@memberjunction/core';
import { ConversationEngine, MJConversationDetailEntity } from '@memberjunction/core-entities';
import { FormatSequencedHistoryLine } from './conversation-history-format';

/** Tool names available on `conversationToolCalls`. */
export type ConversationToolName = 'getMessageBySequence' | 'getMessagesByRange' | 'searchConversation' | 'summarizeRange';

/**
 * The seam through which `summarizeRange` runs its recursive LLM sub-call. Implemented by
 * BaseAgent (which owns prompt execution and run-step observability) so this manager stays
 * free of prompt-runner dependencies and trivially testable.
 */
export interface ConversationToolSummaryHost {
    /**
     * Runs the range-summary prompt over the rendered slice.
     * @param rangeText - The `[seq N] Role: text` rendering of the requested range
     * @param lens - The task-specific focus the summary must serve
     * @returns The summary text plus the AIPromptRun ID of the sub-call (for lineage)
     */
    RunSummaryPrompt(rangeText: string, lens: string): Promise<{ text: string; promptRunId?: string }>;
}

/**
 * One conversation-tool invocation from the LLM. A single input shape with per-tool
 * validation (mirrors the artifact tools' generic `input` while staying typed).
 */
export interface ConversationToolCall {
    tool: ConversationToolName;
    input: {
        /** getMessageBySequence: the exact Sequence to fetch */
        sequence?: number;
        /** getMessagesByRange / searchConversation: inclusive range start */
        startSequence?: number;
        /** getMessagesByRange / searchConversation: inclusive range end */
        endSequence?: number;
        /** searchConversation: keyword (default) or regex pattern */
        query?: string;
        /** searchConversation: treat `query` as a regular expression */
        isRegex?: boolean;
        /** searchConversation: restrict to a role ('User' | 'AI') */
        role?: string;
        /** searchConversation: result cap (default 20, max 50) */
        maxResults?: number;
        /** summarizeRange: the task-specific focus the summary must serve */
        lens?: string;
    };
}

/** A message as returned by the paging tools. */
export interface ConversationToolMessage {
    sequence: number;
    role: string;
    /** Responding agent's name when the row was produced by an agent */
    agent: string | null;
    message: string;
}

/** One search hit: enough to decide whether to page the full message in. */
export interface ConversationSearchHit {
    sequence: number;
    role: string;
    agent: string | null;
    snippet: string;
    matchType: 'keyword' | 'regex';
}

/** Execution record for one tool call (step OutputData + next-turn result message). */
export interface ConversationToolExecutionResult {
    tool: ConversationToolName;
    input: ConversationToolCall['input'];
    result: {
        success: boolean;
        data?: unknown;
        errorMessage?: string;
    };
    durationMs: number;
    /** summarizeRange only: the AIPromptRun of the recursive sub-call (step TargetLogID lineage) */
    promptRunId?: string;
}

/** Hard cap on messages returned by getMessagesByRange. */
const MAX_RANGE_MESSAGES = 50;
/** Hard cap on the span a single summarizeRange sub-call may cover. */
const MAX_SUMMARIZE_RANGE_MESSAGES = 500;
/** Character budget for the rendered slice fed to the summarizeRange sub-call. */
const MAX_SUMMARIZE_INPUT_CHARS = 100_000;
/** Total character budget for a range result — beyond it, messages are dropped with a note. */
const MAX_RANGE_TOTAL_CHARS = 32_000;
/** searchConversation result caps. */
const DEFAULT_SEARCH_RESULTS = 20;
const MAX_SEARCH_RESULTS = 50;
/** Snippet length around a search match. */
const SNIPPET_CHARS = 300;

/**
 * Per-run manager for conversation-history retrieval tools. Initialized with the run's
 * conversationId (the availability gate — no conversation, no tools) and serving all
 * reads from the ConversationEngine cache.
 */
export class ConversationToolManager {
    private conversationId: string | null = null;
    private contextUser: UserInfo | null = null;
    private summaryHost: ConversationToolSummaryHost | null = null;

    /** Arms the manager for a run. Pass null conversationId to disable (programmatic runs). */
    public Initialize(conversationId: string | null, contextUser: UserInfo): void {
        this.conversationId = conversationId;
        this.contextUser = contextUser;
    }

    /** Wires the recursive-sub-call seam (BaseAgent owns prompt execution). */
    public SetSummaryHost(host: ConversationToolSummaryHost | null): void {
        this.summaryHost = host;
    }

    /** Disarms the manager (per-run reset). */
    public Clear(): void {
        this.conversationId = null;
        this.contextUser = null;
        this.summaryHost = null;
    }

    /** True when the run has a conversation to page against. */
    public get IsAvailable(): boolean {
        return !!this.conversationId && !!this.contextUser;
    }

    /** Executes one tool call with timing + full error containment. */
    public async ExecuteSingleToolCall(call: ConversationToolCall): Promise<ConversationToolExecutionResult> {
        const start = Date.now();
        try {
            const { data, promptRunId } = await this.dispatch(call);
            return { tool: call.tool, input: call.input, result: { success: true, data }, durationMs: Date.now() - start, promptRunId };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { tool: call.tool, input: call.input, result: { success: false, errorMessage }, durationMs: Date.now() - start };
        }
    }

    /**
     * Markdown tool documentation injected into the system prompt (the
     * `{{ _CONVERSATION_TOOLS }}` template block), rendered only when the run has a
     * conversation.
     */
    public GetToolDocumentation(): string {
        return [
            '## Conversation History Tools',
            'Older parts of this conversation may have been replaced by a summary. The FULL history remains stored, addressable by the `[seq N]` sequence numbers the summary references. Page exact messages back in with `conversationToolCalls` in your response — results arrive as a conversation message on your next turn. Prefer paging in exact messages over trusting the summary for precise wording, identifiers, numbers, or decisions.',
            '',
            '| tool | input | returns |',
            '|---|---|---|',
            '| `getMessageBySequence` | `{ "sequence": 42 }` | the exact message at that sequence |',
            `| \`getMessagesByRange\` | \`{ "startSequence": 10, "endSequence": 20 }\` | the messages in the inclusive range (max ${MAX_RANGE_MESSAGES}) |`,
            `| \`searchConversation\` | \`{ "query": "text or regex", "isRegex"?: true, "role"?: "User"\\|"AI", "startSequence"?, "endSequence"?, "maxResults"? }\` | matching hits as \`{sequence, role, agent, snippet}\` (default ${DEFAULT_SEARCH_RESULTS}) — then page the hits you need |`,
            `| \`summarizeRange\` | \`{ "startSequence": 1, "endSequence": 120, "lens": "what the summary should focus on" }\` | a focused summary of the range through YOUR lens (max ${MAX_SUMMARIZE_RANGE_MESSAGES} messages) — use when a range is too big to page in raw |`,
            '',
            'Example: `"conversationToolCalls": [{ "tool": "searchConversation", "input": { "query": "budget approval" } }]`'
        ].join('\n');
    }

    /** Routes a call to its tool implementation. */
    private async dispatch(call: ConversationToolCall): Promise<{ data: unknown; promptRunId?: string }> {
        const details = await this.loadOrderedDetails();
        switch (call.tool) {
            case 'getMessageBySequence':
                return { data: this.getMessageBySequence(details, call.input) };
            case 'getMessagesByRange':
                return { data: this.getMessagesByRange(details, call.input) };
            case 'searchConversation':
                return { data: this.searchConversation(details, call.input) };
            case 'summarizeRange':
                return this.summarizeRange(details, call.input);
            default:
                throw new Error(`Unknown conversation tool '${call.tool as string}'`);
        }
    }

    /**
     * The recursive sub-call (RLM pattern): renders the requested slice and hands it to
     * the host's summary prompt with the caller's lens. The agent is not limited to the
     * one baseline summary's framing — any window can be re-summarized however the
     * current task needs, on a cheap sub-call model.
     */
    private async summarizeRange(
        details: MJConversationDetailEntity[],
        input: ConversationToolCall['input']
    ): Promise<{ data: unknown; promptRunId?: string }> {
        if (!this.summaryHost) {
            throw new Error('summarizeRange is unavailable: no summary host is wired for this run');
        }
        const { startSequence, endSequence } = input;
        if (typeof startSequence !== 'number' || typeof endSequence !== 'number' || startSequence > endSequence) {
            throw new Error(`summarizeRange requires numeric 'startSequence' <= 'endSequence'`);
        }
        if (!input.lens || input.lens.trim().length === 0) {
            throw new Error(`summarizeRange requires a 'lens' describing what the summary should focus on`);
        }
        if (endSequence - startSequence + 1 > MAX_SUMMARIZE_RANGE_MESSAGES) {
            throw new Error(`Range spans ${endSequence - startSequence + 1} messages — max ${MAX_SUMMARIZE_RANGE_MESSAGES} per summarizeRange call`);
        }
        const inRange = details.filter(d => d.Sequence >= startSequence && d.Sequence <= endSequence);
        if (inRange.length === 0) {
            throw new Error(`No messages found in sequence range ${startSequence}..${endSequence}`);
        }

        const rangeText = this.renderRangeForSummary(inRange);
        const summary = await this.summaryHost.RunSummaryPrompt(rangeText, input.lens.trim());
        return {
            data: {
                lens: input.lens.trim(),
                startSequence,
                endSequence,
                messageCount: inRange.length,
                summary: summary.text
            },
            promptRunId: summary.promptRunId
        };
    }

    /** `[seq N] Role: text` rendering (shared shape) with a total input budget for the sub-call model. */
    private renderRangeForSummary(details: MJConversationDetailEntity[]): string {
        const lines: string[] = [];
        let usedChars = 0;
        for (const detail of details) {
            const line = FormatSequencedHistoryLine(detail.Sequence, detail.Role, detail.Message || '');
            usedChars += line.length;
            if (usedChars > MAX_SUMMARIZE_INPUT_CHARS && lines.length > 0) {
                lines.push(`[input capped at ~${MAX_SUMMARIZE_INPUT_CHARS.toLocaleString()} characters — messages from sequence ${detail.Sequence} onward omitted; summarize a narrower range to cover them]`);
                break;
            }
            lines.push(line);
        }
        return lines.join('\n');
    }

    /** Full conversation history, ordered by Sequence, from the engine cache. */
    private async loadOrderedDetails(): Promise<MJConversationDetailEntity[]> {
        if (!this.conversationId || !this.contextUser) {
            throw new Error('Conversation tools are unavailable: no conversation is associated with this run');
        }
        const cache = await ConversationEngine.Instance.LoadConversationDetails(this.conversationId, this.contextUser);
        return [...cache.Details].sort((a, b) => a.Sequence - b.Sequence);
    }

    private getMessageBySequence(details: MJConversationDetailEntity[], input: ConversationToolCall['input']): ConversationToolMessage {
        if (typeof input.sequence !== 'number') {
            throw new Error(`getMessageBySequence requires a numeric 'sequence' input`);
        }
        const detail = details.find(d => d.Sequence === input.sequence);
        if (!detail) {
            throw new Error(`No message found at sequence ${input.sequence} (valid range: 1..${details.length > 0 ? details[details.length - 1].Sequence : 0})`);
        }
        return this.toToolMessage(detail);
    }

    private getMessagesByRange(details: MJConversationDetailEntity[], input: ConversationToolCall['input']): { messages: ConversationToolMessage[]; truncated?: string } {
        const { startSequence, endSequence } = input;
        if (typeof startSequence !== 'number' || typeof endSequence !== 'number' || startSequence > endSequence) {
            throw new Error(`getMessagesByRange requires numeric 'startSequence' <= 'endSequence'`);
        }
        if (endSequence - startSequence + 1 > MAX_RANGE_MESSAGES) {
            throw new Error(`Range spans ${endSequence - startSequence + 1} messages — max ${MAX_RANGE_MESSAGES} per call. Narrow the range or make multiple calls.`);
        }
        const inRange = details.filter(d => d.Sequence >= startSequence && d.Sequence <= endSequence);

        // Enforce the total-character budget so one range call can't blow the context.
        const messages: ConversationToolMessage[] = [];
        let usedChars = 0;
        for (const detail of inRange) {
            const message = this.toToolMessage(detail);
            usedChars += message.message.length;
            if (usedChars > MAX_RANGE_TOTAL_CHARS && messages.length > 0) {
                return {
                    messages,
                    truncated: `Result capped at ~${MAX_RANGE_TOTAL_CHARS.toLocaleString()} characters — ${inRange.length - messages.length} message(s) from sequence ${message.sequence} onward omitted. Request a narrower range to read them.`
                };
            }
            messages.push(message);
        }
        return { messages };
    }

    private searchConversation(details: MJConversationDetailEntity[], input: ConversationToolCall['input']): { hits: ConversationSearchHit[]; totalMatches: number } {
        if (!input.query || input.query.trim().length === 0) {
            throw new Error(`searchConversation requires a non-empty 'query'`);
        }
        const maxResults = Math.min(input.maxResults || DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS);
        const matchType: ConversationSearchHit['matchType'] = input.isRegex ? 'regex' : 'keyword';
        const regex = this.compileSearchRegex(input.query, input.isRegex);
        const needle = input.query.toLowerCase();

        const hits: ConversationSearchHit[] = [];
        let totalMatches = 0;
        for (const detail of details) {
            if (!this.passesSearchFilters(detail, input)) continue;

            const text = detail.Message || '';
            // `??` (not the usual `||` fallback) — a match at index 0 is a valid hit
            const matchIndex = regex ? (text.match(regex)?.index ?? -1) : text.toLowerCase().indexOf(needle);
            if (matchIndex < 0) continue;

            totalMatches++;
            if (hits.length < maxResults) {
                hits.push({
                    sequence: detail.Sequence,
                    role: detail.Role || '',
                    agent: detail.Agent || null,
                    snippet: this.buildSnippet(text, matchIndex),
                    matchType
                });
            }
        }
        return { hits, totalMatches };
    }

    /** Compiles the query as a case-insensitive regex in regex mode; null in keyword mode. */
    private compileSearchRegex(query: string, isRegex: boolean | undefined): RegExp | null {
        if (!isRegex) {
            return null;
        }
        try {
            return new RegExp(query, 'i');
        } catch (error) {
            throw new Error(`Invalid regular expression '${query}': ${error instanceof Error ? error.message : error}`);
        }
    }

    /** Role and sequence-range filters applied to every candidate message in a search. */
    private passesSearchFilters(detail: MJConversationDetailEntity, input: ConversationToolCall['input']): boolean {
        const roleFilter = input.role?.toLowerCase();
        if (roleFilter && (detail.Role || '').toLowerCase() !== roleFilter) return false;
        if (typeof input.startSequence === 'number' && detail.Sequence < input.startSequence) return false;
        if (typeof input.endSequence === 'number' && detail.Sequence > input.endSequence) return false;
        return true;
    }

    /** A ~300-char window centered on the match, with ellipses at cut edges. */
    private buildSnippet(text: string, matchIndex: number): string {
        const half = Math.floor(SNIPPET_CHARS / 2);
        const start = Math.max(0, matchIndex - half);
        const end = Math.min(text.length, start + SNIPPET_CHARS);
        const prefix = start > 0 ? '…' : '';
        const suffix = end < text.length ? '…' : '';
        return `${prefix}${text.slice(start, end)}${suffix}`;
    }

    private toToolMessage(detail: MJConversationDetailEntity): ConversationToolMessage {
        return {
            sequence: detail.Sequence,
            role: detail.Role || '',
            agent: detail.Agent || null,
            message: detail.Message || ''
        };
    }
}
