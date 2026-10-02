/**
 * @fileoverview Base class for decision drivers that speak the System One decisions wire format.
 *
 * TypeSafe's Jev (through OpenRouter's Decisions API) and Cloudflare's Clef models (through Workers AI)
 * take the same request (`{ model, state, questions }`) and return the same typed answers
 * (`{ model, answers, usage }`). This class owns that mapping; a subclass supplies only where the
 * request goes, how it is authenticated, and how its vendor wraps the response.
 *
 * @module @memberjunction/ai
 */

import { BaseDecision } from './baseDecision';
import { ModelUsage } from './baseModel';
import {
    ChoiceQuestion,
    DecisionAnswer,
    DecisionParams,
    DecisionQuestion,
    DecisionResult,
    ScoreQuestion,
} from './decision.types';

/**
 * The System One name for a Likelihood question. It is both the wire `type` of the question and the
 * property that carries the answer's probability. The vendor's word stays at this boundary.
 */
const WIRE_LIKELIHOOD = 'noul';

/** How much of a non-JSON error body goes into an error message. */
const ERROR_SNIPPET_LENGTH = 500;

/** A parsed JSON object from a System One API, narrowed with {@link IsSystemOneWireObject} before use. */
export type SystemOneWireObject = Record<string, unknown>;

/** An error carrying the HTTP status, which `ErrorAnalyzer` reads to classify it. */
export type SystemOneHTTPError = Error & {
    status: number;  // case-violation-ok-legacy-back-compat: ErrorAnalyzer reads the lowercase `status` that HTTP client errors carry
};

type MapAnswerResult = { success: true; answer: DecisionAnswer } | { success: false; errorMessage: string };

/**
 * Whether a parsed JSON value is a plain object (not null, not an array).
 */
export function IsSystemOneWireObject(value: unknown): value is SystemOneWireObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Creates an error that carries the HTTP status, so `BaseDecision.Decide()` classifies it through
 * `ErrorAnalyzer`: a 429 or 5xx then allows failover to another decision model.
 */
export function CreateSystemOneHTTPError(message: string, status: number): SystemOneHTTPError {
    return Object.assign(new Error(message), { status });
}

/**
 * A `BaseDecision` driver for an API that speaks the System One decisions wire format. It maps MJ's
 * questions onto the wire (a Likelihood as `noul`, a Choice's options as `{ value: description }`, a
 * Score's levels as an array), maps the typed answers back, and records the dated model and usage.
 * Choice and Score distributions are renormalised, because these APIs round each probability.
 *
 * A subclass supplies, through protected hooks:
 * - {@link ServiceName} and {@link DefaultModel}, and {@link GetEndpointURL} for the URL;
 * - optionally {@link GetRequestHeaders} (default: a bearer API key), {@link GetWireModelName}
 *   (default: the model unchanged), {@link UnwrapResponse} (default: the body as sent) and
 *   {@link DescribeHTTPError} (default: the status and the start of the body).
 *
 * {@link SendRequest} is the one network call, so a test double overrides only it.
 *
 * An HTTP or network error is thrown, carrying the HTTP `status`, so `Decide()` classifies it and
 * rate limits and server errors allow failover. A 2xx response that cannot be mapped fails the
 * result with a failover-eligible error (see {@link FailResult}).
 */
export abstract class BaseSystemOneDecision extends BaseDecision {
    /**
     * Creates the driver.
     * @param apiKey The vendor credential. The default {@link GetRequestHeaders} sends it as a bearer token.
     */
    constructor(apiKey: string) {
        super(apiKey);
    }

    /** The API's name in error messages, such as `'OpenRouter Decisions API'`. */
    protected abstract get ServiceName(): string;

    /** The model used when `DecisionParams.Model` is empty. */
    protected abstract get DefaultModel(): string;

    /**
     * The URL the request is POSTed to.
     * @param model The model being asked: `DecisionParams.Model`, or {@link DefaultModel} when that is empty.
     */
    protected abstract GetEndpointURL(model: string): string;

    /**
     * The request headers. Defaults to the API key as a bearer token and a JSON content type.
     * @param _model The model being asked.
     */
    protected GetRequestHeaders(_model: string): Record<string, string> {
        return { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' };
    }

    /**
     * The request body's `model` field. Defaults to the model unchanged.
     * @param model The model being asked.
     */
    protected GetWireModelName(model: string): string {
        return model;
    }

    /**
     * Returns the System One response (`{ model, answers, usage }`) from a parsed 2xx body. Defaults to
     * the body itself. A vendor that wraps the response in an envelope unwraps it here, and throws
     * (with {@link CreateSystemOneHTTPError}) when the envelope reports a failure.
     * @param body The parsed JSON body.
     * @param _status The HTTP status, for an error thrown from here.
     */
    protected UnwrapResponse(body: unknown, _status: number): unknown {
        return body;
    }

    /**
     * The message of the error thrown for a non-2xx response. Defaults to the status and the first 500
     * characters of the body.
     * @param status The HTTP status.
     * @param bodyText The response body as text, possibly empty.
     */
    protected DescribeHTTPError(status: number, bodyText: string): string {
        const snippet = bodyText.slice(0, ERROR_SNIPPET_LENGTH);
        return `${this.ServiceName} returned HTTP ${status}${snippet ? `: ${snippet}` : ''}`;
    }

    /**
     * Sends the request. This is the driver's only network call; a test double overrides it to stand
     * in for the network.
     * @param url The endpoint from {@link GetEndpointURL}.
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
        const model = this.ResolveModel(params);
        const response = await this.postRequest(model, this.BuildRequestBody(model, params), params.CancellationToken);

        const result = new DecisionResult(true, startTime, new Date());
        this.recordTelemetry(result, response);
        const answers = IsSystemOneWireObject(response) ? response['answers'] : undefined;
        if (!IsSystemOneWireObject(answers)) {
            return this.FailResult(result, `The ${this.ServiceName} response has no answers object`);
        }
        for (const [key, question] of Object.entries(params.Questions)) {
            const mapped = this.mapAnswer(key, question, answers);
            if ('errorMessage' in mapped) {
                return this.FailResult(result, mapped.errorMessage);
            }
            result.Answers[key] = mapped.answer;
        }
        return result;
    }

    /** The model to ask: `DecisionParams.Model` trimmed, or {@link DefaultModel} when it is empty. */
    protected ResolveModel(params: DecisionParams): string {
        return params.Model && params.Model.trim().length > 0 ? params.Model.trim() : this.DefaultModel;
    }

    /** The request body: `{ model, state, questions }`. */
    protected BuildRequestBody(model: string, params: DecisionParams): SystemOneWireObject {
        const questions: SystemOneWireObject = {};
        for (const [key, question] of Object.entries(params.Questions)) {
            questions[key] = this.buildQuestion(question);
        }
        return { model: this.GetWireModelName(model), state: params.State, questions };
    }

    /**
     * Marks the result failed because the response could not be mapped. Another model may still
     * answer, so the failure allows failover (and is not 'Fatal', which would stop the failover loop).
     */
    protected FailResult(result: DecisionResult, message: string): DecisionResult {
        result.success = false;
        result.errorMessage = message;
        result.errorInfo = { errorType: 'ModelError', severity: 'Retriable', canFailover: true };
        result.Answers = {};
        return result;
    }

    /** POSTs the request and returns the unwrapped System One response. Throws on a non-2xx status. */
    private async postRequest(model: string, body: SystemOneWireObject, signal?: AbortSignal): Promise<unknown> {
        const res = await this.SendRequest(this.GetEndpointURL(model), {
            method: 'POST',
            headers: this.GetRequestHeaders(model),
            body: JSON.stringify(body),
            signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw CreateSystemOneHTTPError(this.DescribeHTTPError(res.status, text), res.status);
        }
        let parsed: unknown;
        try {
            parsed = await res.json();
        } catch (err: unknown) {
            throw new Error(`The ${this.ServiceName} response is not JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
        return this.UnwrapResponse(parsed, res.status);
    }

    /** Records the dated model version and usage, whenever the response carries them. */
    private recordTelemetry(result: DecisionResult, response: unknown): void {
        if (!IsSystemOneWireObject(response)) {
            return;
        }
        if (typeof response['model'] === 'string') {
            result.ResolvedModel = response['model'];
        }
        const usage = response['usage'];
        if (IsSystemOneWireObject(usage)) {
            result.Usage = new ModelUsage(
                finiteOr(usage['input_tokens'], 0),
                finiteOr(usage['output_tokens'], 0),
                typeof usage['cost'] === 'number' ? usage['cost'] : undefined,
                'USD'
            );
        }
    }

    /** Maps one question onto the wire: a Choice's options as `{ value: description }`, a Score's levels as an array. */
    private buildQuestion(question: DecisionQuestion): SystemOneWireObject {
        switch (question.Kind) {
            case 'Likelihood':
                return { type: WIRE_LIKELIHOOD, instructions: question.Instructions };
            case 'Choice': {
                const criteria: Record<string, string> = {};
                for (const option of question.Options) {
                    criteria[option.Value] = option.Description;
                }
                return { type: 'choice', instructions: question.Instructions, criteria };
            }
            case 'Score':
                return { type: 'score', instructions: question.Instructions, criteria: [...question.Levels] };
        }
    }

    private mapAnswer(key: string, question: DecisionQuestion, answers: SystemOneWireObject): MapAnswerResult {
        const answer = Object.prototype.hasOwnProperty.call(answers, key) ? answers[key] : undefined;
        if (!IsSystemOneWireObject(answer)) {
            return { success: false, errorMessage: `Question '${key}': the response has no answer object for it` };
        }
        switch (question.Kind) {
            case 'Likelihood':
                return this.mapLikelihood(key, answer);
            case 'Choice':
                return this.mapChoice(key, question, answer);
            case 'Score':
                return this.mapScore(key, question, answer);
        }
    }

    /** Checks the answer's wire type, when the API sends one. */
    private typeMismatch(key: string, answer: SystemOneWireObject, expected: string): string | undefined {
        const type = answer['type'];
        return type === undefined || type === expected
            ? undefined
            : `Question '${key}': expected an answer of type '${expected}', got '${String(type)}'`;
    }

    private mapLikelihood(key: string, answer: SystemOneWireObject): MapAnswerResult {
        const mismatch = this.typeMismatch(key, answer, WIRE_LIKELIHOOD);
        if (mismatch) {
            return { success: false, errorMessage: mismatch };
        }
        const probability = answer[WIRE_LIKELIHOOD];
        if (typeof probability !== 'number' || !Number.isFinite(probability)) {
            return { success: false, errorMessage: `Question '${key}': the Likelihood probability is not a finite number` };
        }
        return { success: true, answer: { Kind: 'Likelihood', Probability: clamp(probability, 0, 1) } };
    }

    private mapChoice(key: string, question: ChoiceQuestion, answer: SystemOneWireObject): MapAnswerResult {
        const mismatch = this.typeMismatch(key, answer, 'choice');
        if (mismatch) {
            return { success: false, errorMessage: mismatch };
        }
        const values = question.Options.map(o => o.Value);
        const choice = answer['choice'];
        if (typeof choice !== 'string' || !values.includes(choice)) {
            return { success: false, errorMessage: `Question '${key}': the choice '${String(choice)}' is not one of the options (${values.join(', ')})` };
        }
        const raw = IsSystemOneWireObject(answer['probabilities']) ? answer['probabilities'] : {};
        const probabilities = normalize(values.map(value => [value, raw[value]]));
        if (!probabilities) {
            return { success: false, errorMessage: `Question '${key}': the Choice probabilities sum to 0` };
        }
        return { success: true, answer: { Kind: 'Choice', Value: choice, Probabilities: probabilities, Confidence: readConfidence(answer, probabilities) } };
    }

    /** A Score's probabilities come keyed by level index ("0", "1", …); MJ keys them by level name. */
    private mapScore(key: string, question: ScoreQuestion, answer: SystemOneWireObject): MapAnswerResult {
        const mismatch = this.typeMismatch(key, answer, 'score');
        if (mismatch) {
            return { success: false, errorMessage: mismatch };
        }
        const score = answer['score'];
        if (typeof score !== 'number' || !Number.isFinite(score)) {
            return { success: false, errorMessage: `Question '${key}': the Score value is not a finite number` };
        }
        const raw = IsSystemOneWireObject(answer['probabilities']) ? answer['probabilities'] : {};
        const probabilities = normalize(question.Levels.map((level, i) => [level, raw[String(i)]]));
        if (!probabilities) {
            return { success: false, errorMessage: `Question '${key}': the Score probabilities sum to 0` };
        }
        return {
            success: true,
            answer: { Kind: 'Score', Value: clamp(score, 0, question.Levels.length - 1), Probabilities: probabilities, Confidence: readConfidence(answer, probabilities) },
        };
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function finiteOr(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Builds a distribution over the given keys, in order. A missing, negative or non-numeric entry
 * counts as 0. Returns undefined when the entries sum to 0.
 */
function normalize(entries: Array<[string, unknown]>): Record<string, number> | undefined {
    const values = entries.map(([name, raw]): [string, number] => [name, Math.max(0, finiteOr(raw, 0))]);
    const sum = values.reduce((total, [, p]) => total + p, 0);
    if (sum <= 0) {
        return undefined;
    }
    const result: Record<string, number> = {};
    for (const [name, p] of values) {
        result[name] = p / sum;
    }
    return result;
}

/** The API's own confidence, clamped; when it sends none, the top probability. */
function readConfidence(answer: SystemOneWireObject, probabilities: Record<string, number>): number {
    const confidence = answer['confidence'];
    return typeof confidence === 'number' && Number.isFinite(confidence)
        ? clamp(confidence, 0, 1)
        : Math.max(...Object.values(probabilities));
}
