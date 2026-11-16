import {
    AIErrorType,
    BaseDecision,
    BaseHostedSystemOneDecision,
    CreateSystemOneHTTPError,
    DecisionParams,
    IsSystemOneWireObject,
    NonEmptyString,
    RedactSecret,
    SystemOneWireObject,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * A `BaseDecision` driver for Google's Gemini Decisions API
 * (`POST https://generativelanguage.googleapis.com/v1beta/decisions`), served by Gemini Decision 1
 * (`gemini-decision-1`). The model scores closed-set questions in one forward pass instead of
 * generating text, so a call bills input tokens only.
 *
 * Gemini's wire is the System One format with three differences, which this class handles; the
 * answer mapping, renormalisation and the endpoint, key and error handling come from
 * {@link BaseHostedSystemOneDecision}:
 * - **Authentication** is the `x-goog-api-key` header, not a bearer token.
 * - **The shared state is `input`**, not `state`. It takes text or `Content` blocks (text, image, audio,
 *   video, PDF); MJ sends text, with an object state as JSON, because `DecisionParams` has no media yet.
 * - **Usage** is `total_input_tokens` / `total_output_tokens`, mapped here onto the System One names.
 *   No `model` or `cost` field is returned on Google's `200` wire response (`ResolvedModel` stays
 *   `undefined` unless a proxy or later revision includes `model`); MJ prices the call from the model's
 *   cost rows.
 *
 * Questions go out as System One questions keyed by name: a Likelihood as `noul`, a Choice's options as
 * `criteria: { value: description }`, a Score's levels as `criteria: [...]`, lowest first. Answers come
 * back keyed the same way, with Choice probabilities keyed by option value and Score probabilities by
 * 0-based level index (`"0"`..`"254"`), exactly as the System One mapping reads them. A Score answer's
 * `legend` is ignored: MJ already holds the level names.
 *
 * Google answers a request it rejects, and a key it does not accept, with gateway `400 INVALID_ARGUMENT`,
 * service `400 invalid_request`, or `403 PERMISSION_DENIED`; {@link GetHTTPErrorType} keeps all of them
 * failover-eligible.
 *
 * When Gemini's input filter blocks the request (`prompt_feedback.block_reason`), the response has no
 * answers; this driver fails the call with the block reason, as a failover-eligible error, since
 * another decision model may answer.
 */
@RegisterClass(BaseDecision, 'GeminiDecision')
export class GeminiDecision extends BaseHostedSystemOneDecision {
    /** The Gemini Decisions API endpoint (Gemini API, v1beta). */
    public static readonly DEFAULT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/decisions';

    /** The model used when DecisionParams.Model is empty (Google accepts bare `gemini-decision-1` and `models/gemini-decision-1`). */
    public static readonly DEFAULT_MODEL = 'gemini-decision-1';

    protected get ServiceName(): string {
        return 'Gemini Decisions API';
    }

    protected get DefaultModel(): string {
        return GeminiDecision.DEFAULT_MODEL;
    }

    protected get DefaultEndpoint(): string {
        return GeminiDecision.DEFAULT_ENDPOINT;
    }

    protected get APIKeyDescription(): string {
        return 'a Gemini API key from Google AI Studio';
    }

    protected get LegacyKeyVariable(): string {
        return 'AI_VENDOR_API_KEY__GEMINIDECISION';
    }

    /** Google's API-key header, which the Gemini API takes in place of a bearer token. */
    protected override GetRequestHeaders(_model: string): Record<string, string> {
        return { 'x-goog-api-key': this.Credential.APIKey, 'Content-Type': 'application/json' };
    }

    /**
     * The request body: `{ model, input, questions }`. The System One body with its `state` sent as
     * `input`, which takes a string or `Content` blocks; an object state goes as JSON text.
     */
    protected override BuildRequestBody(model: string, params: DecisionParams): SystemOneWireObject {
        const systemOneBody = super.BuildRequestBody(model, params);
        const input = typeof params.State === 'string' ? params.State : JSON.stringify(params.State);
        return { model: systemOneBody['model'], input, questions: systemOneBody['questions'] };
    }

    /**
     * Fixes two statuses whose `ErrorAnalyzer` reading is wrong for this API. `Default Decision` reaches
     * Gemini Decision 1 as a power-matched fallback, and a `Fatal` error there would end its failover
     * loop before the candidates behind it:
     * - `400` — both Google's gateway `INVALID_ARGUMENT` (an invalid or expired API key) and the
     *   decisions service's `invalid_request` (`"* CreateDecisionRequest...: must have ..."`, which
     *   `ErrorAnalyzer` would classify as `VendorValidationError` or `InvalidRequest`) — is `ModelError`,
     *   since another model may answer. The message still names the cause.
     * - `403` (`PERMISSION_DENIED`: missing key, restricted key, or API disabled for its project) reads
     *   as `Authentication` when the message names a permission; it is `ModelError` too.
     *
     * Not `Authentication` or `VendorValidationError`: on those the runner drops the vendor's other
     * candidates, and the index it continues from then skips the next candidate (`BaseModelRunner`).
     * `ErrorAnalyzer` keeps the rest: `401` stays a fatal `Authentication` error, `404` (`not_found` for
     * an unknown model) reads as `ModelError`, and `429` (`RESOURCE_EXHAUSTED`) and `5xx` allow failover.
     */
    protected override GetHTTPErrorType(status: number): AIErrorType | undefined {
        return status === 400 || status === 403 ? 'ModelError' : undefined;
    }

    /**
     * Turns Gemini's `{ answers, usage, prompt_feedback }` into the System One `{ model, answers, usage }`,
     * and throws when the input filter blocked the request.
     */
    protected override UnwrapResponse(body: unknown, status: number): unknown {
        if (!IsSystemOneWireObject(body)) {
            return body;
        }
        const blockReason = readBlockReason(body['prompt_feedback']);
        if (blockReason) {
            const safeReason = RedactSecret(blockReason, this.Credential.APIKey);
            throw CreateSystemOneHTTPError(`${this.ServiceName} blocked the input: ${safeReason}`, status, 'ModelError');
        }
        return { model: body['model'], answers: body['answers'], usage: toSystemOneUsage(body['usage']) };
    }
}

/** The block reason and its message from `prompt_feedback`, or undefined when the input was not blocked. */
function readBlockReason(feedback: unknown): string | undefined {
    if (!IsSystemOneWireObject(feedback)) {
        return undefined;
    }
    const reason = NonEmptyString(feedback['block_reason']);
    if (!reason || reason.toUpperCase() === 'BLOCK_REASON_UNSPECIFIED') {
        return undefined;
    }
    const message = NonEmptyString(feedback['block_reason_message']);
    return message ? `${reason} (${message})` : reason;
}

/** Maps Gemini's `{ total_input_tokens, total_output_tokens }` onto the System One `{ input_tokens, output_tokens }`. */
function toSystemOneUsage(usage: unknown): SystemOneWireObject | undefined {
    if (!IsSystemOneWireObject(usage)) {
        return undefined;
    }
    return { input_tokens: usage['total_input_tokens'], output_tokens: usage['total_output_tokens'] ?? 0 };
}
