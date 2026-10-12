import {
    AIErrorType,
    BaseDecision,
    BaseSystemOneDecision,
    NonEmptyString,
    ReadSystemOneErrorMessage,
    SystemOneConfigurationError,
    TrimTrailingSlashes,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/**
 * A `BaseDecision` driver for Subquadratic's SubQ Decisions API, `POST https://api.subq.ai/v1/systemone`,
 * which serves SubQ Snap (`subq-snap-preview`, in public preview). The API speaks the System One decisions
 * format exactly and returns the response bare, so the wire mapping comes from {@link BaseSystemOneDecision}
 * unchanged; this class supplies the endpoint, the default model, the missing-key check, SubQ's error
 * messages and the classification of the statuses SubQ documents.
 *
 * **Key.** A SubQ API key (console.subq.ai), sent as `Authorization: Bearer <key>`. A raw key or an
 * `API Key` AI Credential's values in JSON (`{"apiKey":"…"}`).
 *
 * **Endpoint.** The constructor's URL, else the credential's `endpoint` (an `API Key with Endpoint`
 * credential), else {@link SubQDecision.DEFAULT_ENDPOINT}. Each is the full request URL.
 *
 * **Model.** `DecisionParams.Model`, the model-vendor row's `APIName`, defaulting to `subq-snap-preview`.
 * SubQ will change the ID at general availability; the row's `APIName` is where to change it.
 *
 * Not sent: the API's optional `images` (up to 4), which `DecisionParams` has no field for.
 */
@RegisterClass(BaseDecision, 'SubQDecision')
export class SubQDecision extends BaseSystemOneDecision {
    /** The SubQ Decisions API endpoint. */
    public static readonly DEFAULT_ENDPOINT = 'https://api.subq.ai/v1/systemone';

    /** The model used when DecisionParams.Model is empty. */
    public static readonly DEFAULT_MODEL = 'subq-snap-preview';

    private _endpointURL: string;

    /**
     * @param apiKey A SubQ API key, or an AI Credential's values in JSON.
     * @param endpointURL Overrides the credential's `endpoint` and the default endpoint.
     */
    constructor(apiKey: string, endpointURL?: string) {
        super(apiKey);
        const endpoint = NonEmptyString(endpointURL) ?? this.Credential.Endpoint ?? SubQDecision.DEFAULT_ENDPOINT;
        this._endpointURL = TrimTrailingSlashes(endpoint);
    }

    /** The configured Decisions API endpoint URL. */
    public get EndpointURL(): string {
        return this._endpointURL;
    }

    protected get ServiceName(): string {
        return 'SubQ Decisions API';
    }

    protected get DefaultModel(): string {
        return SubQDecision.DEFAULT_MODEL;
    }

    /** The one endpoint, whatever the model: the model travels in the body. */
    protected GetEndpointURL(_model: string): string {
        return this.EndpointURL;
    }

    /** Names SubQ's `detail.error_type` and `detail.message` when the body has them. */
    protected DescribeHTTPError(status: number, bodyText: string): string {
        const message = ReadSystemOneErrorMessage(bodyText);
        return message ? `${this.ServiceName} returned HTTP ${status}: ${message}` : super.DescribeHTTPError(status, bodyText);
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
     * candidates, and the index it continues from then skips the next candidate (`BaseModelRunner`),
     * while SubQ serves one decision model, so dropping its rows gains nothing.
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

    /**
     * No API key stops the call before any request. It is a `NoCredentials` error that allows failover,
     * as for the other System One drivers: another candidate may be configured.
     */
    protected GetConfigurationError(): SystemOneConfigurationError | undefined {
        if (this.Credential.APIKey.trim().length > 0) {
            return undefined;
        }
        return {
            ErrorType: 'NoCredentials',
            Message: `${this.ServiceName} has no API key: bind an 'API Key' credential whose apiKey is a SubQ API key, or set AI_VENDOR_API_KEY__SUBQDECISION`,
        };
    }
}
