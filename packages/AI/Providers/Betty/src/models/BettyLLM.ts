import {
    AIErrorInfo, BaseLLM, ChatParams, ChatResult, ChatMessageRole, ClassifyParams, ClassifyResult,
    SummarizeParams, SummarizeResult, ModelUsage, ErrorAnalyzer,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { HttpPost, HttpRequestConfig, IsHttpError, IsCancellationError } from '@memberjunction/network-utils';
import { BETTY_BASE_URL_VAR, BettyEndpoint, GetBettyBaseURL } from '../config';
import { BettyChatRequest, BettyChatResponse, BettyReference } from '../generic/Betty.types';

/**
 * MemberJunction provider for **Betty**, the MJ-native organization-scoped assistant.
 *
 * ## Why this is a separate class from `BettyBotLLM`
 *
 * `@memberjunction/ai-betty-bot` targets a different service with a different wire protocol: it
 * exchanges its key for a JWT at `POST /settings`, then posts `{ input }` to `POST /response`.
 * Betty takes the API key directly as a bearer and posts `{ message, conversationId }` to
 * `POST /messages`. Auth, endpoint, request and response all differ, so `BETTY_BOT_BASE_URL`
 * cannot bridge them.
 *
 * Making this a separate `DriverClass` rather than a mode of the existing one is deliberate:
 *
 *   * `GetAIAPIKey()` is keyed by DRIVER CLASS, so a single class serving both protocols would read
 *     one `AI_VENDOR_API_KEY__BETTYBOTLLM` for two unrelated services — a misconfiguration would
 *     silently send a customer's key to the wrong host. A distinct class gets a distinct variable.
 *   * `@memberjunction/ai-betty-bot` stays byte-identical, so no existing deployment changes and
 *     nobody has to be contacted or given a deadline.
 *   * Both can run in one instance. Migrating is repointing an `AIModelVendor.DriverClass`;
 *     rolling back is repointing it back.
 *
 * ## Conversation history
 *
 * Betty threads conversations server-side via `conversationId`, but `ChatParams` carries no
 * correlation id and a fresh provider instance is constructed for every execution, so there is
 * nothing to thread it through. MJ therefore owns the history: the latest user message is the turn,
 * and everything before it is passed as advisory `context.text`.
 *
 * This is the one thing NOT to copy from the legacy provider, which does
 * `params.messages.find(m => m.role === user)` — `.find` returns the FIRST match, so on a
 * three-turn exchange it sends the opening question and silently discards the follow-up.
 */
@RegisterClass(BaseLLM, 'BettyLLM')
export class BettyLLM extends BaseLLM {
    // No constructor and no key field: `BaseLLM` stores the key, rejects an empty one, and exposes
    // it as `protected get apiKey()`.

    /**
     * The API supports SSE when the request sets `Accept: text/event-stream`, but this provider
     * does not use it yet — wiring it means implementing the three streaming members below against
     * Betty's event shape. Declared false so `BaseLLM` never routes a streaming request here.
     */
    public override get SupportsStreaming(): boolean {
        return false;
    }

    protected async nonStreamingChatCompletion(params: ChatParams): Promise<ChatResult> {
        const startTime = new Date();
        const cancellationToken = params.cancellationToken;

        // Already cancelled before we dial out — don't open a socket at all.
        if (cancellationToken?.aborted) return this.cancelled(startTime);

        const baseURL = GetBettyBaseURL();
        if (!baseURL) {
            return this.failure(startTime, `${BETTY_BASE_URL_VAR} is not set. Point it at the Betty `
                + `Public API root, including the version segment (e.g. https://<host>/betty/v1).`);
        }

        const body = this.buildRequest(params);
        if (!body) return this.failure(startTime, 'No user message was supplied.');

        // Forward the cancellation token so an abort tears down the underlying HTTP socket rather
        // than merely abandoning this promise.
        const config: Omit<HttpRequestConfig, 'Url' | 'Method' | 'Body'> = {
            Headers: { Authorization: `Bearer ${this.apiKey}` },
            Signal: cancellationToken,
        };

        try {
            const res = await HttpPost<BettyChatResponse>(BettyEndpoint(baseURL, 'messages'), body, config);
            if (!res?.Data) return this.failure(startTime, 'Betty returned an empty response.');
            return this.toChatResult(res.Data, startTime);
        } catch (ex) {
            // A caller-initiated abort (or an AIPromptRunner timeout) is not a Betty failure —
            // report it as a cancellation so no layer retries a request the caller gave up on.
            if (this.isCancellation(ex, cancellationToken)) return this.cancelled(startTime);
            return this.failure(startTime, this.describe(ex), ex);
        }
    }

    /** The latest user message is the turn; everything before it is advisory context. */
    private buildRequest(params: ChatParams): BettyChatRequest | null {
        const userTurns = params.messages.filter((m) => m.role === ChatMessageRole.user);
        const latest = userTurns[userTurns.length - 1];
        if (!latest) return null;

        const context = this.contextFromHistory(params);
        return {
            message: String(latest.content ?? ''),
            ...(context ? { context: { text: context } } : {}),
        };
    }

    /**
     * Render everything before the final user turn as a transcript.
     *
     * `context.text` is documented as free-text situational context and is explicitly
     * non-authorizing, which is the correct channel for this: it informs the answer without
     * widening what content the credential can reach.
     */
    private contextFromHistory(params: ChatParams): string | undefined {
        const prior = params.messages.slice(0, -1)
            .filter((m) => m.role !== ChatMessageRole.system)
            .map((m) => `${m.role === ChatMessageRole.assistant ? 'Assistant' : 'User'}: ${String(m.content ?? '')}`);

        const system = params.messages.find((m) => m.role === ChatMessageRole.system);
        const preamble = system ? [`Instructions from the calling application: ${String(system.content ?? '')}`] : [];
        const lines = [...preamble, ...(prior.length ? ['Earlier in this conversation:', ...prior] : [])];

        return lines.length ? lines.join('\n') : undefined;
    }

    private toChatResult(data: BettyChatResponse, startTime: Date): ChatResult {
        const result = new ChatResult(true, startTime, new Date());
        result.statusText = 'OK';
        result.errorMessage = '';
        result.exception = null;
        result.data = {
            choices: [{
                message: { role: ChatMessageRole.assistant, content: data.response },
                finish_reason: '',
                index: 0,
            }],
            // Betty does not report token counts on this endpoint; zeros rather than a guess.
            usage: new ModelUsage(0, 0),
        };
        this.appendReferences(result, data.references ?? []);
        return result;
    }

    /**
     * Citations ride as extra choices, matching `BettyBotLLM` exactly — index 1 formatted for
     * display, index 2 raw JSON. Anything already parsing the legacy provider's output keeps
     * working when a model row is repointed here, which is the point of the migration path.
     */
    private appendReferences(result: ChatResult, references: BettyReference[]): void {
        if (!references.length) return;

        const lines = references.map((r) => `${r.title}${r.url ? `: ${r.url}` : ''}`).join(' \n');
        result.data.choices.push({
            message: {
                role: ChatMessageRole.assistant,
                content: `Here are some additional resources that may help you: \n${lines} \n`,
            },
            finish_reason: '',
            index: 1,
        });
        result.data.choices.push({
            message: { role: ChatMessageRole.assistant, content: JSON.stringify(references) },
            finish_reason: 'references_json',
            index: 2,
        });
    }

    /**
     * Is this a caller-initiated cancellation rather than a genuine API failure? Fetch rejects with
     * an AbortError when the request config carries a signal that aborts.
     */
    private isCancellation(error: unknown, signal?: AbortSignal): boolean {
        if (signal?.aborted) return true;
        if (IsCancellationError(error)) return true;
        return error instanceof Error && error.name === 'AbortError';
    }

    /** Surface the server's own message where it sent one — Betty's errors name the cause. */
    private describe(ex: unknown): string {
        if (IsHttpError(ex)) {
            const payload = ex.Data as { error?: { message?: string }; message?: string } | undefined;
            const detail = payload?.error?.message ?? payload?.message ?? ex.StatusText ?? ex.message;
            return ex.Status ? `Betty returned ${ex.Status}: ${detail}` : `Could not reach Betty: ${detail}`;
        }
        return ex instanceof Error ? ex.message : 'Unknown error calling Betty.';
    }

    /** Marked Fatal / non-failover so no layer retries a request the caller explicitly gave up on. */
    private cancelled(startTime: Date): ChatResult {
        const errorInfo: AIErrorInfo = {
            errorType: 'Unknown',
            severity: 'Fatal',
            canFailover: false,
            providerErrorCode: 'request_cancelled',
            context: { provider: 'Betty', cancelled: true },
        };

        const result = new ChatResult(false, startTime, new Date());
        result.statusText = 'cancelled';
        result.errorMessage = 'Request cancelled via cancellationToken';
        result.exception = null;
        result.errorInfo = errorInfo;
        result.data = { choices: [], usage: new ModelUsage(0, 0) };
        return result;
    }

    private failure(startTime: Date, message: string, ex?: unknown): ChatResult {
        const result = new ChatResult(false, startTime, new Date());
        result.statusText = 'error';
        result.errorMessage = message;
        result.data = { choices: [], usage: new ModelUsage(0, 0) };
        if (ex !== undefined) result.errorInfo = ErrorAnalyzer.analyzeError(ex, 'Betty');
        return result;
    }

    // Streaming is declared unsupported above, so BaseLLM never calls these.
    protected async createStreamingRequest(_params: ChatParams): Promise<never> {
        throw new Error('Betty does not support streaming through this provider yet.');
    }

    protected processStreamingChunk(_chunk: unknown): { content: string; finishReason?: string; usage?: null } {
        throw new Error('Betty does not support streaming through this provider yet.');
    }

    protected finalizeStreamingResponse(
        _accumulatedContent: string | null | undefined,
        _lastChunk: unknown,
        _usage: unknown,
    ): ChatResult {
        throw new Error('Betty does not support streaming through this provider yet.');
    }

    public async SummarizeText(_params: SummarizeParams): Promise<SummarizeResult> {
        throw new Error('Method not implemented.');
    }

    public async ClassifyText(_params: ClassifyParams): Promise<ClassifyResult> {
        throw new Error('Method not implemented.');
    }
}

/** Tree-shaking guard — see the class-registration manifest system. */
export function LoadBettyLLM(): void {
    // Intentionally empty: importing this symbol keeps the @RegisterClass decorator above alive.
}
