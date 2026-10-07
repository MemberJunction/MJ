import {
    BaseDecision,
    ChoiceQuestion,
    CreateSystemOneHTTPError,
    DecisionAnswer,
    DecisionParams,
    DecisionQuestion,
    DecisionResult,
    IsSystemOneWireObject,
    ModelUsage,
    NonEmptyString,
    NormalizeDecisionProbabilities,
    ParseSystemOneCredential,
    ReadDecisionConfidence,
    ScoreQuestion,
    SystemOneCredential,
    SystemOneWireObject,
    TrimTrailingSlashes,
} from '@memberjunction/ai';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';

/** The path the Decisions API answers on, appended to a base URL that does not already end with it. */
const DECISIONS_PATH = '/decisions';

/** How much of a non-JSON error body goes into an error message. */
const ERROR_SNIPPET_LENGTH = 500;

/** What replaces the API key if an error body ever echoes it. */
const REDACTED = '[redacted]';

/** The wire `type` of each MJ question kind. */
const WIRE_TYPES: Record<DecisionQuestion['Kind'], string> = {
    Likelihood: 'predicate',
    Choice: 'choice',
    Score: 'score',
};

type MapAnswerResult = { success: true; answer: DecisionAnswer } | { success: false; errorMessage: string };

/**
 * A `BaseDecision` driver for OpenAI's Decisions API (`POST https://api.openai.com/v1/decisions`, public
 * beta since DevDay, September 29, 2026), which serves `gpt-6-luna`. Like the System One models it
 * returns typed answers with probabilities and writes no text, but its wire format is OpenAI's own, so
 * it does not extend `BaseSystemOneDecision`:
 * - **Request.** `{ model, input, questions }`. `questions` is an ordered array; each carries the MJ
 *   question key as its `name`. A Likelihood is a `predicate`, a Choice lists `choices: [{ value,
 *   description }]`, a Score lists `levels: [{ label }]` (MJ's levels carry no description). `input` is
 *   `DecisionParams.State`, as JSON text when it is an object.
 * - **Response.** `{ model, answers, usage }`. Answers come back in question order and carry the
 *   question's `name`; the driver matches them by name, and by position only for an unnamed answer.
 *   Probabilities come as arrays: a Choice's are keyed by option value and a Score's by level label,
 *   then renormalised. A Score's `score` is mapped onto MJ's 0-based level scale through the levels'
 *   numeric `value`s.
 * - **Refusals.** OpenAI may decline any question (`{ type: 'refusal', name }`). The result then fails
 *   with an error that names the question and allows failover, so another candidate can answer.
 *
 * **Credentials.** The API key is read with `ParseSystemOneCredential`, so an AI Credential's values
 * (`{"apiKey":"…"}`) send the key, not the JSON. A missing key fails before any request with a
 * `NoCredentials` error that allows failover.
 *
 * **Endpoint.** The constructor's URL, else the credential's `endpoint`, else
 * `https://api.openai.com/v1/decisions`. A URL that does not end in `/decisions` (such as an OpenAI SDK
 * style base URL ending in `/v1`) gets it appended.
 *
 * **Errors.** A non-2xx response throws an error carrying the HTTP `status`, with OpenAI's
 * `error.message` when the body has one, so `BaseDecision.Decide()` classifies it: a 429 or a 5xx allows
 * failover, a 401 stops it. {@link SendRequest} is the one network call, so a test double overrides only it.
 *
 * MJ sends the state as text; the API's image input is not used yet.
 */
@RegisterClass(BaseDecision, 'OpenAIDecision')
export class OpenAIDecision extends BaseDecision {
    /** The OpenAI Decisions API endpoint. */
    public static readonly DEFAULT_ENDPOINT = 'https://api.openai.com/v1/decisions';

    /** The model used when DecisionParams.Model is empty: the only model the API serves. */
    public static readonly DEFAULT_MODEL = 'gpt-6-luna';

    /** The API's name in error messages. */
    public static readonly SERVICE_NAME = 'OpenAI Decisions API';

    private _credential: SystemOneCredential;
    private _endpointURL: string;

    /**
     * @param apiKey An OpenAI API key, or an AI Credential's values in JSON (`{"apiKey":"…"}`, with an
     * optional `endpoint`).
     * @param endpointURL Overrides the credential's `endpoint` and the default endpoint.
     */
    constructor(apiKey: string, endpointURL?: string) {
        super(apiKey);
        this._credential = ParseSystemOneCredential(apiKey);
        const endpoint = NonEmptyString(endpointURL) ?? this._credential.Endpoint;
        this._endpointURL = endpoint ? ToOpenAIDecisionsURL(endpoint) : OpenAIDecision.DEFAULT_ENDPOINT;
    }

    /** The configured Decisions API endpoint URL. */
    public get EndpointURL(): string {
        return this._endpointURL;
    }

    /** The credential, read from the API key with `ParseSystemOneCredential`. */
    protected get Credential(): SystemOneCredential {
        return this._credential;
    }

    /**
     * Sends the request. This is the driver's only network call; a test double overrides it to stand
     * in for the network.
     * @param url The endpoint, {@link EndpointURL}.
     * @param init The POST: method, headers, JSON body and the caller's cancellation signal.
     */
    protected async SendRequest(url: string, init: RequestInit): Promise<Response> {
        return fetch(url, init);
    }

    /**
     * Sends the questions and maps the typed answers.
     */
    protected async DoDecide(params: DecisionParams): Promise<DecisionResult> {
        const startTime = new Date();
        const configurationError = this.GetConfigurationError();
        if (configurationError) {
            return this.configurationFailure(configurationError, startTime);
        }
        const body = this.BuildRequestBody(this.ResolveModel(params), params);
        const response = await this.postRequest(body, params.CancellationToken);

        const result = new DecisionResult(true, startTime, new Date());
        this.recordTelemetry(result, response);
        const answers = IsSystemOneWireObject(response) ? response['answers'] : undefined;
        if (!Array.isArray(answers)) {
            return this.FailResult(result, `The ${OpenAIDecision.SERVICE_NAME} response has no answers array`);
        }
        const entries = Object.entries(params.Questions);
        for (let i = 0; i < entries.length; i++) {
            const [key, question] = entries[i];
            const mapped = this.mapAnswer(key, question, FindAnswer(answers, key, i));
            if ('errorMessage' in mapped) {
                return this.FailResult(result, mapped.errorMessage);
            }
            result.Answers[key] = mapped.answer;
        }
        return result;
    }

    /** The model to ask: `DecisionParams.Model` trimmed, or {@link DEFAULT_MODEL} when it is empty. */
    protected ResolveModel(params: DecisionParams): string {
        return NonEmptyString(params.Model) ?? OpenAIDecision.DEFAULT_MODEL;
    }

    /** The request body: `{ model, input, questions }`, the questions in `params.Questions` order. */
    protected BuildRequestBody(model: string, params: DecisionParams): SystemOneWireObject {
        const input = typeof params.State === 'string' ? params.State : JSON.stringify(params.State);
        const questions = Object.entries(params.Questions).map(([key, question]) => BuildWireQuestion(key, question));
        return { model, input, questions };
    }

    /**
     * What stops a call before any request: a credential that is not valid JSON, or no API key. Both are
     * `NoCredentials` errors that allow failover, since another candidate may be configured correctly.
     */
    protected GetConfigurationError(): string | undefined {
        if (this.Credential.ParseError) {
            return `${OpenAIDecision.SERVICE_NAME}: ${this.Credential.ParseError}`;
        }
        if (this.Credential.APIKey.trim().length === 0) {
            return `${OpenAIDecision.SERVICE_NAME} has no API key: bind an 'API Key' credential to the OpenAI vendor or the model's row, or set AI_VENDOR_API_KEY__OPENAIDECISION`;
        }
        return undefined;
    }

    /**
     * The message of the error thrown for a non-2xx response: OpenAI's `error.message` when the body has
     * one, otherwise the status and the start of the body. The API key never appears in it.
     * @param status The HTTP status.
     * @param bodyText The response body as text, possibly empty.
     */
    protected DescribeHTTPError(status: number, bodyText: string): string {
        const message = OpenAIErrorMessage(bodyText) || bodyText.slice(0, ERROR_SNIPPET_LENGTH);
        return this.redact(`${OpenAIDecision.SERVICE_NAME} returned HTTP ${status}${message ? `: ${message}` : ''}`);
    }

    /**
     * Marks the result failed because the response could not be mapped, or a question was refused.
     * Another model may still answer, so the failure allows failover (and is not 'Fatal', which would stop
     * the failover loop), as `BaseSystemOneDecision` does.
     */
    protected FailResult(result: DecisionResult, message: string): DecisionResult {
        result.success = false;
        result.errorMessage = message;
        result.errorInfo = { errorType: 'ModelError', severity: 'Retriable', canFailover: true };
        result.Answers = {};
        return result;
    }

    /** A failed result for a configuration problem: `NoCredentials`, Retriable, failover allowed. */
    private configurationFailure(message: string, startTime: Date): DecisionResult {
        const result = new DecisionResult(false, startTime, new Date());
        result.errorMessage = message;
        result.errorInfo = { errorType: 'NoCredentials', severity: 'Retriable', canFailover: true };
        return result;
    }

    /** POSTs the request and returns the parsed body. Throws on a non-2xx status. */
    private async postRequest(body: SystemOneWireObject, signal?: AbortSignal): Promise<unknown> {
        const res = await this.SendRequest(this.EndpointURL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.Credential.APIKey.trim()}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw CreateSystemOneHTTPError(this.DescribeHTTPError(res.status, text), res.status);
        }
        try {
            return await res.json();
        } catch (err: unknown) {
            throw new Error(`The ${OpenAIDecision.SERVICE_NAME} response is not JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Records the served model and the token usage, whenever the response carries them. */
    private recordTelemetry(result: DecisionResult, response: unknown): void {
        if (!IsSystemOneWireObject(response)) {
            return;
        }
        if (typeof response['model'] === 'string') {
            result.ResolvedModel = response['model'];
        }
        const usage = response['usage'];
        if (IsSystemOneWireObject(usage)) {
            // The API bills input tokens only, with no cache charge, so every input token is a prompt
            // token at the input price. The response carries no cost: the run is priced from the cost row.
            result.Usage = new ModelUsage(FiniteOr(usage['input_tokens'], 0), FiniteOr(usage['output_tokens'], 0));
        }
    }

    /** Maps one answer, after checking it is there, is not a refusal, and has the question's wire type. */
    private mapAnswer(key: string, question: DecisionQuestion, answer: unknown): MapAnswerResult {
        if (!IsSystemOneWireObject(answer)) {
            return { success: false, errorMessage: `Question '${key}': the response has no answer for it` };
        }
        const type = answer['type'];
        if (type === 'refusal') {
            return { success: false, errorMessage: `Question '${key}': OpenAI declined to answer it (refusal)` };
        }
        const expected = WIRE_TYPES[question.Kind];
        if (type !== expected) {
            return { success: false, errorMessage: `Question '${key}': expected an answer of type '${expected}', got '${String(type)}'` };
        }
        switch (question.Kind) {
            case 'Likelihood':
                return MapPredicate(key, answer);
            case 'Choice':
                return MapChoice(key, question, answer);
            case 'Score':
                return MapScore(key, question, answer);
        }
    }

    /** The message with the API key, should it appear, replaced. */
    private redact(message: string): string {
        const key = this.Credential.APIKey.trim();
        return key.length > 0 ? message.split(key).join(REDACTED) : message;
    }
}

/**
 * The Decisions URL for a configured URL: trailing slashes removed, then `/decisions` appended unless the
 * URL already ends with it.
 */
export function ToOpenAIDecisionsURL(url: string): string {
    const base = TrimTrailingSlashes(url.trim());
    return base.endsWith(DECISIONS_PATH) ? base : `${base}${DECISIONS_PATH}`;
}

/** One MJ question on the wire, named by its key. */
function BuildWireQuestion(key: string, question: DecisionQuestion): SystemOneWireObject {
    const wire: SystemOneWireObject = { type: WIRE_TYPES[question.Kind], name: key, instructions: question.Instructions };
    switch (question.Kind) {
        case 'Likelihood':
            return wire;
        case 'Choice':
            return { ...wire, choices: question.Options.map(option => ({ value: option.Value, description: option.Description })) };
        case 'Score':
            return { ...wire, levels: question.Levels.map(level => ({ label: level })) };
    }
}

/**
 * The answer for the question at `index` named `key`: the answer carrying that name, else the answer at
 * the same position when it carries no name. An answer named for another question is never used.
 */
function FindAnswer(answers: unknown[], key: string, index: number): unknown {
    const named = answers.find(a => IsSystemOneWireObject(a) && a['name'] === key);
    if (named !== undefined) {
        return named;
    }
    const positional = answers[index];
    const name = IsSystemOneWireObject(positional) ? positional['name'] : undefined;
    return name === undefined || name === null || name === '' ? positional : undefined;
}

function MapPredicate(key: string, answer: SystemOneWireObject): MapAnswerResult {
    const probability = answer['probability'];
    if (typeof probability !== 'number' || !Number.isFinite(probability)) {
        return { success: false, errorMessage: `Question '${key}': the predicate probability is not a finite number` };
    }
    return { success: true, answer: { Kind: 'Likelihood', Probability: Clamp(probability, 0, 1) } };
}

/** A Choice: the chosen value must be one of the options; its probabilities arrive as `[{ value, probability }]`. */
function MapChoice(key: string, question: ChoiceQuestion, answer: SystemOneWireObject): MapAnswerResult {
    const values = question.Options.map(o => o.Value);
    const choice = answer['choice'];
    if (typeof choice !== 'string' || !values.includes(choice)) {
        return { success: false, errorMessage: `Question '${key}': the choice '${String(choice)}' is not one of the options (${values.join(', ')})` };
    }
    // Choice values are typed on the wire: only a string value matches an MJ option.
    const raw = ProbabilitiesBy(answer, 'value');
    const probabilities = NormalizeDecisionProbabilities(values.map(value => [value, raw.get(value)?.Probability]));
    if (!probabilities) {
        return { success: false, errorMessage: `Question '${key}': the Choice probabilities sum to 0` };
    }
    return { success: true, answer: { Kind: 'Choice', Value: choice, Probabilities: probabilities, Confidence: ReadDecisionConfidence(answer, probabilities) } };
}

/**
 * A Score: its probabilities arrive as `[{ label, value, probability }]` and are keyed by level label. The
 * `score` is on the scale of the levels' `value`s, so it is mapped onto MJ's 0-based level positions.
 */
function MapScore(key: string, question: ScoreQuestion, answer: SystemOneWireObject): MapAnswerResult {
    const score = answer['score'];
    if (typeof score !== 'number' || !Number.isFinite(score)) {
        return { success: false, errorMessage: `Question '${key}': the Score value is not a finite number` };
    }
    const raw = ProbabilitiesBy(answer, 'label');
    const probabilities = NormalizeDecisionProbabilities(question.Levels.map(level => [level, raw.get(level)?.Probability]));
    if (!probabilities) {
        return { success: false, errorMessage: `Question '${key}': the Score probabilities sum to 0` };
    }
    const position = ScoreToLevelPosition(score, question.Levels.map(level => raw.get(level)?.Value), probabilities, question.Levels);
    return {
        success: true,
        answer: { Kind: 'Score', Value: Clamp(position, 0, question.Levels.length - 1), Probabilities: probabilities, Confidence: ReadDecisionConfidence(answer, probabilities) },
    };
}

/** One entry of an answer's `probabilities` array. */
interface WireProbability {
    Probability: unknown;
    Value: unknown;
}

/**
 * An answer's `probabilities` array, keyed by the string in `keyField` (`value` for a Choice, `label` for
 * a Score). Entries whose key is not a string are skipped; the first entry for a key wins.
 */
function ProbabilitiesBy(answer: SystemOneWireObject, keyField: 'value' | 'label'): Map<string, WireProbability> {
    const result = new Map<string, WireProbability>();
    const entries = answer['probabilities'];
    if (!Array.isArray(entries)) {
        return result;
    }
    for (const entry of entries) {
        if (IsSystemOneWireObject(entry) && typeof entry[keyField] === 'string' && !result.has(entry[keyField])) {
            result.set(entry[keyField], { Probability: entry['probability'], Value: entry['value'] });
        }
    }
    return result;
}

/**
 * Maps a Score's `score`, on the scale of its levels' numeric `value`s, onto MJ's level positions (0 for
 * the first level, n - 1 for the last), interpolating between neighbouring levels. When the levels'
 * values are missing or not strictly increasing in level order, the position is the expected level under
 * the normalised distribution instead.
 */
function ScoreToLevelPosition(score: number, levelValues: unknown[], probabilities: Record<string, number>, levels: string[]): number {
    const values = levelValues.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    const increasing = values.length === levels.length && values.every((v, i) => i === 0 || v > values[i - 1]);
    if (!increasing) {
        return levels.reduce((sum, level, i) => sum + i * (probabilities[level] ?? 0), 0);
    }
    if (score <= values[0]) {
        return 0;
    }
    for (let i = 1; i < values.length; i++) {
        if (score <= values[i]) {
            return i - 1 + (score - values[i - 1]) / (values[i] - values[i - 1]);
        }
    }
    return values.length - 1;
}

/** OpenAI's `error.message` from an error body, or an empty string. */
function OpenAIErrorMessage(bodyText: string): string {
    const body = SafeJSONParse<unknown>(bodyText);
    if (!IsSystemOneWireObject(body)) {
        return '';
    }
    const error = body['error'];
    if (IsSystemOneWireObject(error) && typeof error['message'] === 'string') {
        return error['message'].trim();
    }
    return typeof error === 'string' ? error.trim() : '';
}

function Clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function FiniteOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
