import { AIErrorType, BaseDecision, BaseHostedSystemOneDecision } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * A `BaseDecision` driver for Inception Labs' Decisions API, `POST https://api.inceptionlabs.ai/v1/decisions`,
 * which serves Mercury Decide (`mercury-decide`), a diffusion-based decision model. The key is the same
 * Inception API key Mercury 2 uses. Errors arrive OpenAI-style (`{ error: { message } }`), or as FastAPI's
 * `{ detail: [{ msg }] }` for a `422`. The endpoint, key and error handling come from
 * {@link BaseHostedSystemOneDecision}.
 */
@RegisterClass(BaseDecision, 'InceptionDecision')
export class InceptionDecision extends BaseHostedSystemOneDecision {
    /** The Inception Decisions API endpoint. */
    public static readonly DEFAULT_ENDPOINT = 'https://api.inceptionlabs.ai/v1/decisions';

    /** The model used when DecisionParams.Model is empty. */
    public static readonly DEFAULT_MODEL = 'mercury-decide';

    protected get ServiceName(): string {
        return 'Inception Decisions API';
    }

    protected get DefaultModel(): string {
        return InceptionDecision.DEFAULT_MODEL;
    }

    protected get DefaultEndpoint(): string {
        return InceptionDecision.DEFAULT_ENDPOINT;
    }

    protected get APIKeyDescription(): string {
        return 'an Inception API key';
    }

    protected get LegacyKeyVariable(): string {
        return 'AI_VENDOR_API_KEY__INCEPTIONDECISION';
    }

    /**
     * Fixes two statuses whose `ErrorAnalyzer` reading is wrong for this API:
     * - `402` (billing inactive or quota exceeded, "Account access is unavailable.") reads as `Unknown`;
     *   it is `NoCredit`;
     * - `422` (a request Inception rejects, which passed MJ's own validation) reads as a fatal
     *   `InvalidRequest` that stops `Default Decision`'s failover loop, unless the message happens to name
     *   a validation word; it is `ModelError`: another model may answer.
     *
     * Not `VendorValidationError`: on that the runner drops the vendor's other candidates, and the index
     * it continues from then skips the next candidate (`BaseModelRunner`), which here would be Mercury
     * Decide's OpenRouter row.
     *
     * `ErrorAnalyzer` keeps the rest: `401` stays a fatal `Authentication` error, as for every other
     * driver; `404` (`model_not_found`) is `ModelError` and `413` (`request_too_large`) `Unknown`, both
     * allowing failover; `429` and `5xx` allow failover.
     */
    protected GetHTTPErrorType(status: number): AIErrorType | undefined {
        switch (status) {
            case 402:
                return 'NoCredit';
            case 422:
                return 'ModelError';
            default:
                return undefined;
        }
    }
}
