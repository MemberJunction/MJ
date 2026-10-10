import { BaseDecision, BaseSystemOneDecision } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * A `BaseDecision` driver for OpenRouter's Decisions API, which serves TypeSafe's Jev decision
 * model. The API returns typed answers, so nothing is parsed from prose. Choice and Score
 * distributions are renormalised, because the API rounds each probability to two decimals.
 *
 * The wire mapping is the System One format's, in {@link BaseSystemOneDecision}; this class supplies
 * the endpoint and the default model.
 */
@RegisterClass(BaseDecision, 'OpenRouterDecision')
export class OpenRouterDecision extends BaseSystemOneDecision {
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

    protected get ServiceName(): string {
        return 'OpenRouter Decisions API';
    }

    protected get DefaultModel(): string {
        return OpenRouterDecision.DEFAULT_MODEL;
    }

    /** The one endpoint, whatever the model: the model travels in the body. */
    protected GetEndpointURL(_model: string): string {
        return this.EndpointURL;
    }
}
