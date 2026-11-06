import { BaseDecision, BaseHostedSystemOneDecision } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * A `BaseDecision` driver for Perplexity's Decisions API, `POST https://api.perplexity.ai/v1/decisions`,
 * which serves `pplx-decider-v1-27b`, its only model. The API takes the key only as a bearer token (not
 * `x-api-key`), and answers `404` to a path with a trailing slash. The endpoint, key and error handling
 * come from {@link BaseHostedSystemOneDecision}.
 */
@RegisterClass(BaseDecision, 'PerplexityDecision')
export class PerplexityDecision extends BaseHostedSystemOneDecision {
    /** The Perplexity Decisions API endpoint. */
    public static readonly DEFAULT_ENDPOINT = 'https://api.perplexity.ai/v1/decisions';

    /** The model used when DecisionParams.Model is empty. */
    public static readonly DEFAULT_MODEL = 'pplx-decider-v1-27b';

    protected get ServiceName(): string {
        return 'Perplexity Decisions API';
    }

    protected get DefaultModel(): string {
        return PerplexityDecision.DEFAULT_MODEL;
    }

    protected get DefaultEndpoint(): string {
        return PerplexityDecision.DEFAULT_ENDPOINT;
    }

    protected get APIKeyDescription(): string {
        return 'a Perplexity API key';
    }

    protected get LegacyKeyVariable(): string {
        return 'AI_VENDOR_API_KEY__PERPLEXITYDECISION';
    }
}
