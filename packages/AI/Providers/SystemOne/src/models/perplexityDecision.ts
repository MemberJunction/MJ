import {
    BaseDecision,
    BaseSystemOneDecision,
    IsSystemOneWireObject,
    NonEmptyString,
    SystemOneConfigurationError,
    TrimTrailingSlashes,
} from '@memberjunction/ai';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';

/**
 * A `BaseDecision` driver for Perplexity's Decisions API, `POST https://api.perplexity.ai/v1/decisions`,
 * which serves Perplexity's `pplx-decider-v1-27b` decision model. The API speaks the System One decisions
 * format and returns the response bare, so the wire mapping comes from {@link BaseSystemOneDecision}
 * unchanged; this class supplies the endpoint, the default model, the missing-key check and Perplexity's
 * error messages.
 *
 * **Key.** A Perplexity API key, sent as `Authorization: Bearer <key>` (the API does not read
 * `x-api-key`). A raw key or an `API Key` AI Credential's values in JSON (`{"apiKey":"…"}`).
 *
 * **Endpoint.** The constructor's URL, else the credential's `endpoint`, else
 * {@link PerplexityDecision.DEFAULT_ENDPOINT}. Trailing slashes are removed: the API answers `404` to a
 * path with one.
 *
 * **Model.** `DecisionParams.Model`, the model-vendor row's `APIName`, defaulting to
 * `pplx-decider-v1-27b`, the only model the API serves.
 */
@RegisterClass(BaseDecision, 'PerplexityDecision')
export class PerplexityDecision extends BaseSystemOneDecision {
    /** The Perplexity Decisions API endpoint. */
    public static readonly DEFAULT_ENDPOINT = 'https://api.perplexity.ai/v1/decisions';

    /** The model used when DecisionParams.Model is empty. */
    public static readonly DEFAULT_MODEL = 'pplx-decider-v1-27b';

    private _endpointURL: string;

    /**
     * @param apiKey A Perplexity API key, or an AI Credential's values in JSON.
     * @param endpointURL Overrides the credential's `endpoint` and the default endpoint.
     */
    constructor(apiKey: string, endpointURL?: string) {
        super(apiKey);
        const endpoint = NonEmptyString(endpointURL) ?? this.Credential.Endpoint ?? PerplexityDecision.DEFAULT_ENDPOINT;
        this._endpointURL = TrimTrailingSlashes(endpoint);
    }

    /** The configured Decisions API endpoint URL. */
    public get EndpointURL(): string {
        return this._endpointURL;
    }

    protected get ServiceName(): string {
        return 'Perplexity Decisions API';
    }

    protected get DefaultModel(): string {
        return PerplexityDecision.DEFAULT_MODEL;
    }

    /** The one endpoint, whatever the model: the model travels in the body. */
    protected GetEndpointURL(_model: string): string {
        return this.EndpointURL;
    }

    /**
     * Names Perplexity's `error.message` when the body has one. A `404` or `405` has an empty body and a
     * `504` can be an HTML page, so those keep the default: the status and the start of the body.
     */
    protected DescribeHTTPError(status: number, bodyText: string): string {
        const message = perplexityErrorMessage(SafeJSONParse<unknown>(bodyText));
        return message ? `${this.ServiceName} returned HTTP ${status}: ${message}` : super.DescribeHTTPError(status, bodyText);
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
            Message: `${this.ServiceName} has no API key: bind an 'API Key' credential whose apiKey is a Perplexity API key, or set AI_VENDOR_API_KEY__PERPLEXITYDECISION`,
        };
    }
}

/** The `error.message` of a Perplexity error body (`{ error: { message, type, code } }`), or an empty string. */
function perplexityErrorMessage(body: unknown): string {
    if (!IsSystemOneWireObject(body)) {
        return '';
    }
    const error = body['error'];
    return IsSystemOneWireObject(error) && typeof error['message'] === 'string' ? error['message'].trim() : '';
}
