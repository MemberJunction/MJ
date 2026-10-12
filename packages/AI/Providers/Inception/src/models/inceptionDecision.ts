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
 * A `BaseDecision` driver for Inception Labs' Decisions API, `POST https://api.inceptionlabs.ai/v1/decisions`,
 * which serves Mercury Decide (`mercury-decide`), a diffusion-based decision model. The API speaks the
 * System One decisions format exactly and returns the response bare, so the wire mapping comes from
 * {@link BaseSystemOneDecision} unchanged; this class supplies the endpoint, the default model, the
 * missing-key check, Inception's error messages and the classification of the statuses Inception documents.
 *
 * **Key.** An Inception API key, the same key Mercury 2 uses, sent as `Authorization: Bearer <key>`. A
 * raw key or an `API Key` AI Credential's values in JSON (`{"apiKey":"…"}`).
 *
 * **Endpoint.** The constructor's URL, else the credential's `endpoint` (an `API Key with Endpoint`
 * credential), else {@link InceptionDecision.DEFAULT_ENDPOINT}. Each is the full request URL.
 *
 * **Model.** `DecisionParams.Model`, the model-vendor row's `APIName`, defaulting to `mercury-decide`.
 */
@RegisterClass(BaseDecision, 'InceptionDecision')
export class InceptionDecision extends BaseSystemOneDecision {
    /** The Inception Decisions API endpoint. */
    public static readonly DEFAULT_ENDPOINT = 'https://api.inceptionlabs.ai/v1/decisions';

    /** The model used when DecisionParams.Model is empty. */
    public static readonly DEFAULT_MODEL = 'mercury-decide';

    private _endpointURL: string;

    /**
     * @param apiKey An Inception API key, or an AI Credential's values in JSON.
     * @param endpointURL Overrides the credential's `endpoint` and the default endpoint.
     */
    constructor(apiKey: string, endpointURL?: string) {
        super(apiKey);
        const endpoint = NonEmptyString(endpointURL) ?? this.Credential.Endpoint ?? InceptionDecision.DEFAULT_ENDPOINT;
        this._endpointURL = TrimTrailingSlashes(endpoint);
    }

    /** The configured Decisions API endpoint URL. */
    public get EndpointURL(): string {
        return this._endpointURL;
    }

    protected get ServiceName(): string {
        return 'Inception Decisions API';
    }

    protected get DefaultModel(): string {
        return InceptionDecision.DEFAULT_MODEL;
    }

    /** The one endpoint, whatever the model: the model travels in the body. */
    protected GetEndpointURL(_model: string): string {
        return this.EndpointURL;
    }

    /** Names Inception's `error.message`, or a `422`'s FastAPI `detail[].msg`, when the body has one. */
    protected DescribeHTTPError(status: number, bodyText: string): string {
        const message = ReadSystemOneErrorMessage(bodyText);
        return message ? `${this.ServiceName} returned HTTP ${status}: ${message}` : super.DescribeHTTPError(status, bodyText);
    }

    /**
     * Fixes two statuses whose `ErrorAnalyzer` reading is wrong for this API:
     * - `402` (billing inactive or quota exceeded, "Account access is unavailable.") reads as `Unknown`;
     *   it is `NoCredit`;
     * - `422` (a request Inception rejects, which passed MJ's own validation) reads as a fatal
     *   `InvalidRequest` that stops `Default Decision`'s failover loop unless the message happens to name
     *   a validation word; it is `VendorValidationError`.
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
                return 'VendorValidationError';
            default:
                return undefined;
        }
    }

    /**
     * No API key stops the call before any request. It is a `NoCredentials` error that allows failover,
     * as for the System One drivers: another candidate may be configured.
     */
    protected GetConfigurationError(): SystemOneConfigurationError | undefined {
        if (this.Credential.APIKey.trim().length > 0) {
            return undefined;
        }
        return {
            ErrorType: 'NoCredentials',
            Message: `${this.ServiceName} has no API key: bind an 'API Key' credential whose apiKey is an Inception API key, or set AI_VENDOR_API_KEY__INCEPTIONDECISION`,
        };
    }
}
