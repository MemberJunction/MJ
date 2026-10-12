import { AIErrorType, BaseDecision, BaseHostedSystemOneDecision } from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * A `BaseDecision` driver for Subquadratic's SubQ Decisions API, `POST https://api.subq.ai/v1/systemone`,
 * which serves SubQ Snap (`subq-snap-preview`, in public preview; the ID changes at general availability,
 * so the model-vendor row's `APIName` is where to change it). Errors arrive as `{ detail: { error_type,
 * message } }`. The endpoint, key and error handling come from {@link BaseHostedSystemOneDecision}.
 *
 * Not sent: the API's optional `images` (up to 4), which `DecisionParams` has no field for.
 */
@RegisterClass(BaseDecision, 'SubQDecision')
export class SubQDecision extends BaseHostedSystemOneDecision {
    /** The SubQ Decisions API endpoint. */
    public static readonly DEFAULT_ENDPOINT = 'https://api.subq.ai/v1/systemone';

    /** The model used when DecisionParams.Model is empty. */
    public static readonly DEFAULT_MODEL = 'subq-snap-preview';

    protected get ServiceName(): string {
        return 'SubQ Decisions API';
    }

    protected get DefaultModel(): string {
        return SubQDecision.DEFAULT_MODEL;
    }

    protected get DefaultEndpoint(): string {
        return SubQDecision.DEFAULT_ENDPOINT;
    }

    protected get APIKeyDescription(): string {
        return 'a SubQ API key';
    }

    protected get LegacyKeyVariable(): string {
        return 'AI_VENDOR_API_KEY__SUBQDECISION';
    }

    /**
     * Pins three statuses whose `ErrorAnalyzer` reading would depend on SubQ's message text, which SubQ
     * documents only for `validation_error`. A `422` whose message names no validation word reads as a
     * fatal `InvalidRequest`, and a `403` whose message says "unauthorized" as a fatal `Authentication`
     * error: either stops `Default Decision`'s failover loop, though another candidate could answer.
     * - `402` (no credits) is `NoCredit`;
     * - `403` (the key cannot use the model) and `422` (a request SubQ rejects, which passed MJ's own
     *   validation) are `ModelError`: another model may answer.
     *
     * Not `Authentication` or `VendorValidationError`: on those the runner drops the vendor's other
     * candidates, and the index it continues from then skips the next candidate (`BaseModelRunner`).
     *
     * `ErrorAnalyzer` keeps the rest: `401` stays a fatal `Authentication` error, as for every other
     * driver; `429` and `503` allow failover.
     */
    protected GetHTTPErrorType(status: number): AIErrorType | undefined {
        switch (status) {
            case 402:
                return 'NoCredit';
            case 403:
            case 422:
                return 'ModelError';
            default:
                return undefined;
        }
    }
}
