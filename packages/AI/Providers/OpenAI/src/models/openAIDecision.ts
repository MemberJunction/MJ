import {
    BaseDecision,
    BaseSystemOneDecision,
    DecisionParams,
    DecisionQuestion,
    IsSystemOneWireObject,
    SystemOneWireObject,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/** A parsed OpenAI Decisions answer, before it is mapped onto the System One shape. */
type OpenAIAnswer = SystemOneWireObject;

/**
 * A `BaseDecision` driver for OpenAI's Decisions API (`POST https://api.openai.com/v1/decisions`),
 * which answers typed questions with GPT-6 Luna. It is in public beta, and `gpt-6-luna` is the only
 * model it serves.
 *
 * OpenAI's wire differs from the System One format the other decision drivers share: the questions
 * are an array whose items carry their own `name`, a Likelihood is a `predicate`, a Choice's options
 * are `choices: [{ value, description }]`, a Score's levels are `levels: [{ label, description }]`,
 * and the answers come back as an array keyed by `name` with distributions as arrays. This class
 * builds that request and turns the answers back into the System One shape, so the answer mapping,
 * renormalisation and telemetry in {@link BaseSystemOneDecision} apply unchanged.
 *
 * A `refusal` answer is passed through with its type, so the base class fails the result with a
 * type mismatch that names it, and the failure allows failover to another decision model.
 */
@RegisterClass(BaseDecision, 'OpenAIDecision')
export class OpenAIDecision extends BaseSystemOneDecision {
    /** The OpenAI Decisions API endpoint. */
    public static readonly DEFAULT_ENDPOINT = 'https://api.openai.com/v1/decisions';

    /** The model used when DecisionParams.Model is empty: the only model the API serves. */
    public static readonly DEFAULT_MODEL = 'gpt-6-luna';

    private _endpointURL: string;

    /**
     * @param apiKey An OpenAI API key, or an AI Credential's values in JSON.
     * @param endpointURL Overrides the credential's `endpoint` and {@link DEFAULT_ENDPOINT}.
     */
    constructor(apiKey: string, endpointURL?: string) {
        super(apiKey);
        this._endpointURL = endpointURL && endpointURL.trim().length > 0
            ? endpointURL.trim()
            : this.Credential.Endpoint ?? OpenAIDecision.DEFAULT_ENDPOINT;
    }

    /** The configured Decisions API endpoint URL. */
    public get EndpointURL(): string {
        return this._endpointURL;
    }

    protected get ServiceName(): string {
        return 'OpenAI Decisions API';
    }

    protected get DefaultModel(): string {
        return OpenAIDecision.DEFAULT_MODEL;
    }

    /** The one endpoint, whatever the model: the model travels in the body. */
    protected GetEndpointURL(_model: string): string {
        return this.EndpointURL;
    }

    /**
     * The request body: `{ model, input, questions: [...] }`. An object state is sent as JSON text,
     * since `input` takes a string or messages.
     */
    protected override BuildRequestBody(model: string, params: DecisionParams): SystemOneWireObject {
        const questions = Object.entries(params.Questions).map(([name, question]) => this.buildOpenAIQuestion(name, question));
        const input = typeof params.State === 'string' ? params.State : JSON.stringify(params.State);
        return { model: this.GetWireModelName(model), input, questions };
    }

    /** Turns OpenAI's `{ answers: [...] }` into the System One `{ model, answers: { name: … }, usage }`. */
    protected override UnwrapResponse(body: unknown, _status: number): unknown {
        if (!IsSystemOneWireObject(body) || !Array.isArray(body['answers'])) {
            return body;
        }
        const answers: SystemOneWireObject = {};
        for (const item of body['answers']) {
            if (IsSystemOneWireObject(item) && typeof item['name'] === 'string') {
                answers[item['name']] = toSystemOneAnswer(item);
            }
        }
        return { model: body['model'], usage: body['usage'], answers };
    }

    private buildOpenAIQuestion(name: string, question: DecisionQuestion): SystemOneWireObject {
        switch (question.Kind) {
            case 'Likelihood':
                return { type: 'predicate', name, instructions: question.Instructions };
            case 'Choice':
                return {
                    type: 'choice',
                    name,
                    instructions: question.Instructions,
                    choices: question.Options.map(option => ({ value: option.Value, description: option.Description })),
                };
            case 'Score':
                // MJ levels are names only; each name doubles as its description. Lowest first, as OpenAI requires.
                return {
                    type: 'score',
                    name,
                    instructions: question.Instructions,
                    levels: question.Levels.map(level => ({ label: level, description: level })),
                };
        }
    }
}

/** Maps one OpenAI answer onto the System One answer shape that {@link BaseSystemOneDecision} reads. */
function toSystemOneAnswer(answer: OpenAIAnswer): SystemOneWireObject {
    switch (answer['type']) {
        case 'predicate':
            return { type: 'noul', noul: answer['probability'] };
        case 'choice':
            return {
                type: 'choice',
                choice: answer['choice'],
                probabilities: distribution(answer['probabilities'], 'value'),
                confidence: answer['confidence'],
            };
        case 'score':
            return {
                type: 'score',
                score: answer['score'],
                probabilities: distribution(answer['probabilities'], 'value'),
                confidence: answer['confidence'],
            };
        default:
            return { type: answer['type'] };
    }
}

/**
 * Turns `[{ <key>: k, probability: p }, …]` into `{ k: p }`. For a Score, `value` is the 0-based level
 * index, which is how the System One shape keys a Score's distribution.
 */
function distribution(entries: unknown, key: string): SystemOneWireObject {
    const result: SystemOneWireObject = {};
    if (!Array.isArray(entries)) {
        return result;
    }
    for (const entry of entries) {
        if (IsSystemOneWireObject(entry) && (typeof entry[key] === 'string' || typeof entry[key] === 'number')) {
            result[String(entry[key])] = entry['probability'];
        }
    }
    return result;
}
