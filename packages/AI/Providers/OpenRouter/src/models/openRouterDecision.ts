import {
    BaseDecision,
    ChoiceQuestion,
    DecisionAnswer,
    DecisionParams,
    DecisionQuestion,
    DecisionResult,
    ModelUsage,
    ScoreQuestion,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * The Decisions API's name for a Likelihood question. It is both the wire `type` of the question
 * and the property that carries the answer's probability. The vendor's word stays at this boundary.
 */
const WIRE_LIKELIHOOD = 'noul';

/** A parsed JSON object from the API, narrowed with {@link isObject} before use. */
type WireObject = Record<string, unknown>;

type MapAnswerResult = { success: true; answer: DecisionAnswer } | { success: false; errorMessage: string };

/**
 * A `BaseDecision` driver for OpenRouter's Decisions API, which serves TypeSafe's Jev decision
 * model. The API returns typed answers, so nothing is parsed from prose. Choice and Score
 * distributions are renormalised, because the API rounds each probability to two decimals.
 */
@RegisterClass(BaseDecision, 'OpenRouterDecision')
export class OpenRouterDecision extends BaseDecision {
    /** The OpenRouter Decisions API endpoint. */
    public static readonly DEFAULT_ENDPOINT = 'https://openrouter.ai/api/alpha/decisions';

    /** The model used when DecisionParams.Model is empty. */
    public static readonly DEFAULT_MODEL = '~typesafe/jev-latest';

    private _endpointURL: string;

    constructor(apiKey: string, endpointURL?: string) {
        super(apiKey);
        this._endpointURL = endpointURL && endpointURL.trim().length > 0
            ? endpointURL.trim()
            : OpenRouterDecision.DEFAULT_ENDPOINT;
    }

    /** The configured Decisions API endpoint URL. */
    public get EndpointURL(): string {
        return this._endpointURL;
    }

    /**
     * Sends the questions to the Decisions API and maps its typed answers. An HTTP or network error
     * is thrown, carrying the HTTP `status`, so `Decide()` classifies it and rate limits and
     * server errors become failover-eligible.
     */
    protected async DoDecide(params: DecisionParams): Promise<DecisionResult> {
        const startTime = new Date();
        const model = params.Model && params.Model.trim().length > 0 ? params.Model.trim() : OpenRouterDecision.DEFAULT_MODEL;
        const response = await this.postRequest(this.buildRequestBody(model, params), params.CancellationToken);

        const result = new DecisionResult(true, startTime, new Date());
        this.recordTelemetry(result, response);
        const answers = isObject(response) ? response['answers'] : undefined;
        if (!isObject(answers)) {
            return this.fail(result, 'The Decisions API response has no answers object');
        }
        for (const [key, question] of Object.entries(params.Questions)) {
            const mapped = this.mapAnswer(key, question, answers);
            if ('errorMessage' in mapped) {
                return this.fail(result, mapped.errorMessage);
            }
            result.Answers[key] = mapped.answer;
        }
        return result;
    }

    /** POSTs the request and returns the parsed JSON body. Throws on a non-2xx status. */
    private async postRequest(body: WireObject, signal?: AbortSignal): Promise<unknown> {
        const res = await fetch(this.EndpointURL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal,
        });
        if (!res.ok) {
            const snippet = (await res.text().catch(() => '')).slice(0, 500);
            const err = new Error(`OpenRouter Decisions API returned HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`) as Error & { status: number };
            err.status = res.status;
            throw err;
        }
        try {
            return await res.json();
        } catch (err: unknown) {
            throw new Error(`The OpenRouter Decisions API response is not JSON: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

    /** Records the dated model version and usage, whenever the response carries them. */
    private recordTelemetry(result: DecisionResult, response: unknown): void {
        if (!isObject(response)) {
            return;
        }
        if (typeof response['model'] === 'string') {
            result.ResolvedModel = response['model'];
        }
        const usage = response['usage'];
        if (isObject(usage)) {
            result.Usage = new ModelUsage(
                finiteOr(usage['input_tokens'], 0),
                finiteOr(usage['output_tokens'], 0),
                typeof usage['cost'] === 'number' ? usage['cost'] : undefined,
                'USD'
            );
        }
    }

    private fail(result: DecisionResult, message: string): DecisionResult {
        result.success = false;
        result.errorMessage = message;
        result.Answers = {};
        return result;
    }

    private buildRequestBody(model: string, params: DecisionParams): WireObject {
        const questions: WireObject = {};
        for (const [key, question] of Object.entries(params.Questions)) {
            questions[key] = this.buildQuestion(question);
        }
        return { model, state: params.State, questions };
    }

    /** Maps one question onto the wire: a Choice's options as `{ value: description }`, a Score's levels as an array. */
    private buildQuestion(question: DecisionQuestion): WireObject {
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

    private mapAnswer(key: string, question: DecisionQuestion, answers: WireObject): MapAnswerResult {
        const answer = Object.prototype.hasOwnProperty.call(answers, key) ? answers[key] : undefined;
        if (!isObject(answer)) {
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
    private typeMismatch(key: string, answer: WireObject, expected: string): string | undefined {
        const type = answer['type'];
        return type === undefined || type === expected
            ? undefined
            : `Question '${key}': expected an answer of type '${expected}', got '${String(type)}'`;
    }

    private mapLikelihood(key: string, answer: WireObject): MapAnswerResult {
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

    private mapChoice(key: string, question: ChoiceQuestion, answer: WireObject): MapAnswerResult {
        const mismatch = this.typeMismatch(key, answer, 'choice');
        if (mismatch) {
            return { success: false, errorMessage: mismatch };
        }
        const values = question.Options.map(o => o.Value);
        const choice = answer['choice'];
        if (typeof choice !== 'string' || !values.includes(choice)) {
            return { success: false, errorMessage: `Question '${key}': the choice '${String(choice)}' is not one of the options (${values.join(', ')})` };
        }
        const raw = isObject(answer['probabilities']) ? answer['probabilities'] : {};
        const probabilities = normalize(values.map(value => [value, raw[value]]));
        if (!probabilities) {
            return { success: false, errorMessage: `Question '${key}': the Choice probabilities sum to 0` };
        }
        return { success: true, answer: { Kind: 'Choice', Value: choice, Probabilities: probabilities, Confidence: readConfidence(answer, probabilities) } };
    }

    /** A Score's probabilities come keyed by level index ("0", "1", …); MJ keys them by level name. */
    private mapScore(key: string, question: ScoreQuestion, answer: WireObject): MapAnswerResult {
        const mismatch = this.typeMismatch(key, answer, 'score');
        if (mismatch) {
            return { success: false, errorMessage: mismatch };
        }
        const score = answer['score'];
        if (typeof score !== 'number' || !Number.isFinite(score)) {
            return { success: false, errorMessage: `Question '${key}': the Score value is not a finite number` };
        }
        const raw = isObject(answer['probabilities']) ? answer['probabilities'] : {};
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

function isObject(value: unknown): value is WireObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
function readConfidence(answer: WireObject, probabilities: Record<string, number>): number {
    const confidence = answer['confidence'];
    return typeof confidence === 'number' && Number.isFinite(confidence)
        ? clamp(confidence, 0, 1)
        : Math.max(...Object.values(probabilities));
}
