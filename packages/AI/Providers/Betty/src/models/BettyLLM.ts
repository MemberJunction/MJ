import {
    AIErrorInfo, BaseLLM, ChatParams, ChatResult, ChatMessageRole, ClassifyParams, ClassifyResult,
    SummarizeParams, SummarizeResult, ModelUsage, ErrorAnalyzer, getTextFromContent,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';
import { HttpPost, HttpRequestConfig, IsHttpError, IsCancellationError } from '@memberjunction/network-utils';
import { BETTY_BASE_URL_VAR, BettyEndpoint, GetBettyBaseURL } from '../config';
import { BettyChatRequest, BettyChatResponse, BettyReference } from '../generic/Betty.types';

/**
 * How long to wait for a Betty turn, in milliseconds.
 *
 * Set explicitly because `HttpRequest` defaults to 30s, which is a TRANSPORT default rather than a
 * generation one. A Betty answer retrieves over the customer's corpus before it writes a word, so
 * 30s cuts off legitimately slow turns — and because the abort produces an `HttpError` with no
 * status, the caller would see it as the host being unreachable rather than as a timeout.
 */
const BETTY_REQUEST_TIMEOUT_MS = 120_000;

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
    // No key field: `BaseLLM` stores the key and exposes it as `protected get apiKey()`. Note it
    // only WARNS on an empty key rather than rejecting it, so an unset
    // `AI_VENDOR_API_KEY__BETTYLLM` reaches Betty as `Authorization: Bearer ` and comes back as a
    // 401 — which `describe()` now reports verbatim.
    private endUserId?: string;

    /**
     * @param apiKey Betty API key, sent as the bearer on every request.
     * @param endUserId Optional caller identifier, forwarded as the `endUserId` request-body field.
     *
     * Betty records it against the conversation so a caller gets its own attribution row and its
     * own rate-limit bucket rather than sharing an anonymous per-IP one — the same problem
     * `BettyBotLLM`'s `userId` argument solves for the legacy service, and named here for the field
     * Betty's own API documents.
     *
     * ATTRIBUTION ONLY, and unverified by design: retrieval scope is pinned server-side from the
     * credential, so this never widens what content the request can reach. Do not use it for
     * authorization.
     *
     * Omitted, the request body is byte-identical to one built without this parameter.
     *
     * Note this is reachable only by constructing the provider directly — `AIPromptRunner`
     * instantiates through `ClassFactory.CreateInstance(BaseLLM, driverClass, apiKey)` and passes
     * the key alone, and `ChatParams` carries no user identity to fall back on. A caller that wants
     * attribution does `new BettyLLM(key, 'izzy')`, exactly as the legacy provider is used from
     * `betty.action.ts`.
     */
    constructor(apiKey: string, endUserId?: string) {
        super(apiKey);
        this.endUserId = endUserId;
    }

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
        // `message` is documented as required and non-empty. A user turn carrying only an image,
        // or an empty string, reaches here with nothing to ask — fail locally and say so rather
        // than spending a round trip to be told the same thing by a 400.
        if (!body.message.trim()) {
            return this.failure(startTime, 'The latest user message has no text for Betty to answer.');
        }

        // Forward the cancellation token so an abort tears down the underlying HTTP socket rather
        // than merely abandoning this promise.
        const config: Omit<HttpRequestConfig, 'Url' | 'Method' | 'Body'> = {
            Headers: { Authorization: `Bearer ${this.apiKey}` },
            Signal: cancellationToken,
            Timeout: BETTY_REQUEST_TIMEOUT_MS,
        };

        try {
            const res = await HttpPost<BettyChatResponse>(BettyEndpoint(baseURL, 'messages'), body, config);
            if (!res?.Data) return this.failure(startTime, 'Betty returned an empty response.');
            // A 200 carrying no answer text would otherwise record a SUCCESSFUL run with empty
            // output — every consumer downstream optional-chains and `|| ''`s it, so nothing
            // crashes and nothing complains. A silent empty success is far harder to diagnose
            // later than a failure here.
            if (typeof res.Data.response !== 'string' || !res.Data.response.trim()) {
                return this.failure(startTime, 'Betty returned a response with no answer text.');
            }
            return this.toChatResult(res.Data, startTime);
        } catch (ex) {
            // A caller-initiated abort (or an AIPromptRunner timeout) is not a Betty failure —
            // report it as a cancellation so no layer retries a request the caller gave up on.
            if (this.isCancellation(ex, cancellationToken)) return this.cancelled(startTime);
            return this.failure(startTime, this.describe(ex), ex);
        }
    }

    /** The latest user message is the turn; every other turn is advisory context. */
    private buildRequest(params: ChatParams): BettyChatRequest | null {
        // The INDEX, not the message: `contextFromHistory` has to split the transcript at the same
        // turn this sends, and the latest user turn is NOT necessarily the last element of the
        // array — `AIPromptRunner` assembles `[system(renderedPrompt), ...conversationMessages]`,
        // and caller-supplied history is not guaranteed to end on a user turn.
        const latestIndex = params.messages.map((m) => m.role).lastIndexOf(ChatMessageRole.user);
        if (latestIndex < 0) return null;

        const context = this.contextFromHistory(params, latestIndex);
        return {
            // Content is `string | ChatMessageContentBlock[]`, and `AIPromptRunner` rewrites the
            // last user message into blocks whenever the prompt carries file inputs. Stringifying
            // that array would post `[object Object]` and Betty would answer a question nobody
            // asked, with no error to show for it.
            message: getTextFromContent(params.messages[latestIndex].content ?? ''),
            ...(context ? { context: { text: context } } : {}),
            // Spread rather than assigned so an absent identifier leaves the key off the body
            // entirely — `endUserId: undefined` would serialize away anyway, but the body is then
            // provably identical to one built without the constructor argument.
            ...(this.endUserId ? { endUserId: this.endUserId } : {}),
        };
    }

    /**
     * Render every turn except the one being sent as a transcript.
     *
     * `context.text` is documented as free-text situational context and is explicitly
     * non-authorizing, which is the correct channel for this: it informs the answer without
     * widening what content the credential can reach.
     *
     * The turn is excluded BY INDEX rather than by dropping the last element. Dropping the tail
     * only lines up when the latest user turn happens to be last; when anything follows it the
     * question ends up both as the message and as a line of its own transcript, and the turn that
     * actually follows it is lost.
     */
    private contextFromHistory(params: ChatParams, latestIndex: number): string | undefined {
        const prior = params.messages
            .filter((m, i) => i !== latestIndex && m.role !== ChatMessageRole.system)
            .map((m) => `${this.speakerFor(m.role)}: ${getTextFromContent(m.content ?? '')}`);

        // EVERY system message, not the first. `.find()` here would be the same first-match defect
        // this class criticises the legacy provider for — and worse, because the filter above
        // removes system turns from `prior`, a second one would appear in neither the preamble nor
        // the transcript and would vanish without trace.
        const system = params.messages
            .filter((m) => m.role === ChatMessageRole.system)
            .map((m) => getTextFromContent(m.content ?? ''))
            .filter((text) => text.length > 0);
        const preamble = system.length
            ? [`Instructions from the calling application: ${system.join('\n\n')}`]
            : [];
        const lines = [...preamble, ...(prior.length ? ['Earlier in this conversation:', ...prior] : [])];

        return lines.length ? lines.join('\n') : undefined;
    }

    /** Who said it. A `tool` turn is not the user, and labelling it `User:` misattributes it. */
    private speakerFor(role: ChatMessageRole): string {
        switch (role) {
            case ChatMessageRole.assistant: return 'Assistant';
            case ChatMessageRole.tool: return 'Tool result';
            default: return 'User';
        }
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
            // `||`, not `??`: `HttpError.StatusText` defaults to '' when there was no response at
            // all (timeout, DNS failure, connection refused), and '' is not nullish — `??` would
            // stop there and discard `ex.message`, the only part that says what actually happened.
            const detail = payload?.error?.message || payload?.message || ex.StatusText || ex.message;
            // A timeout is neither a Betty answer nor an unreachable host, and saying so plainly
            // saves the reader guessing which of the two `Status: 0` meant.
            if (ex.IsTimeout) return `Betty timed out: ${detail}`;
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
        // The ORIGINAL error, not just its message. `AIPromptRunner` does
        // `lastError = result.exception || new Error(result.errorMessage)`, so leaving this unset
        // hands the failover analyzer a synthetic Error built from a string — status, headers and
        // retry-after are gone by the time anything decides whether to retry.
        result.exception = ex ?? null;
        if (ex !== undefined) result.errorInfo = ErrorAnalyzer.analyzeError(this.forAnalyzer(ex), 'Betty');
        return result;
    }

    /**
     * Give `ErrorAnalyzer` a status code it can actually find.
     *
     * `extractHttpStatusCode` probes `status`, `statusCode`, `response.status`, `response.statusCode`
     * and `code`. `@memberjunction/network-utils` exposes PascalCase `Status`, so none of them match
     * and EVERY Betty HTTP failure classifies as `Unknown` → `Transient` → `canFailover: true`. A 429
     * then never reaches the rate-limit backoff and a 401 never stops failover; the key is simply
     * retried against the same endpoint until the attempts run out.
     *
     * The message-text fallback does not rescue it either — it greps for `timeout` while
     * network-utils says `timed out`.
     *
     * A COPY, never a mutation: `ex` is also handed to `result.exception` above and to the caller's
     * own logging, and neither should acquire lower-cased aliases as a side effect of analysis.
     */
    private forAnalyzer(ex: unknown): unknown {
        if (!IsHttpError(ex)) return ex;
        const alias = Object.create(Object.getPrototypeOf(ex) as object) as Record<string, unknown>;
        Object.assign(alias, ex, { status: ex.Status, statusCode: ex.Status, message: ex.message });
        return alias;
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
