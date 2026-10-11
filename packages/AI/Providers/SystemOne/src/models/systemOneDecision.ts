import {
    BaseDecision,
    BaseSystemOneDecision,
    IsSystemOneWireObject,
    NonEmptyString,
    SystemOneConfigurationError,
    TrimTrailingSlashes,
} from '@memberjunction/ai';
import { RegisterClass, SafeJSONParse } from '@memberjunction/global';

/** The route every System One server answers on. */
const SYSTEMONE_PATH = '/v1/systemone';

/**
 * A `BaseDecision` driver for any server that speaks TypeSafe's System One API, `POST {base}/v1/systemone`:
 * - **Kev's own server**, such as a `modal deploy kev_serve.py` deployment at
 *   `https://<workspace>--kev-api.modal.run` (one deployment serves one Kev size);
 * - **llama.cpp's `llama-server`** with a decision model, such as `llama-server -hf ggml-org/Kev-4B-GGUF`,
 *   on any machine, VM or Hugging Face Inference Endpoint;
 * - **TypeSafe's own API**.
 *
 * The wire mapping comes from {@link BaseSystemOneDecision}. These servers return the response bare.
 *
 * **Endpoint.** The base URL comes from the constructor, else the credential's `endpoint` (an
 * `API Key with Endpoint` AI Credential), else the `SYSTEMONE_BASE_URL` environment variable.
 * `/v1/systemone` is appended unless the URL already ends with it (a URL ending in `/v1` gets
 * `/systemone`). With no base URL the call fails before any request.
 *
 * **Token.** Optional. With an API key the request carries `Authorization: Bearer <key>`; with none it
 * carries no Authorization header, because a local `llama-server` or Kev server is open by default.
 *
 * **Model.** The body's `model` is `DecisionParams.Model`, the model-vendor row's `APIName`, defaulting
 * to `kev-latest`. Kev's server accepts `kev-latest` and `jev-latest`.
 *
 * **Timeouts.** The driver sets none of its own: a Kev deployment that scaled to zero takes 35 to 55
 * seconds to start. The caller's cancellation and timeout apply.
 */
@RegisterClass(BaseDecision, 'SystemOneDecision')
export class SystemOneDecision extends BaseSystemOneDecision {
    /** The model used when DecisionParams.Model is empty. */
    public static readonly DEFAULT_MODEL = 'kev-latest';

    /** The environment variable the base URL is read from when neither the constructor nor the credential gives one. */
    public static readonly BASE_URL_ENV_VAR = 'SYSTEMONE_BASE_URL';

    private _endpointURL: string | undefined;

    /**
     * @param apiKey The bearer token, empty for an open server, or an AI Credential's values in JSON
     * (`{"apiKey":"…","endpoint":"https://…"}`).
     * @param baseURL Overrides the credential's `endpoint` and `SYSTEMONE_BASE_URL`.
     */
    constructor(apiKey: string, baseURL?: string) {
        super(apiKey);
        const base = NonEmptyString(baseURL) ?? this.Credential.Endpoint ?? NonEmptyString(process.env[SystemOneDecision.BASE_URL_ENV_VAR]);
        this._endpointURL = base ? ToSystemOneURL(base) : undefined;
    }

    /** The URL requests go to, ending in `/v1/systemone`; undefined when no base URL is configured. */
    public get EndpointURL(): string | undefined {
        return this._endpointURL;
    }

    protected get ServiceName(): string {
        return 'System One endpoint';
    }

    protected get DefaultModel(): string {
        return SystemOneDecision.DEFAULT_MODEL;
    }

    protected GetEndpointURL(_model: string): string {
        return this._endpointURL ?? '';
    }

    /** The token as a bearer token when there is one; no Authorization header when there is none. */
    protected GetRequestHeaders(_model: string): Record<string, string> {
        const token = this.Credential.APIKey.trim();
        return token.length > 0
            ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
            : { 'Content-Type': 'application/json' };
    }

    /**
     * Names the server's own message when the body has one: Kev's server (FastAPI) sends `detail`, as a
     * string or a list of `{ msg }`; llama.cpp sends `error.message`. Otherwise the start of the body.
     */
    protected DescribeHTTPError(status: number, bodyText: string): string {
        const message = serverMessage(SafeJSONParse<unknown>(bodyText));
        return message ? `${this.ServiceName} returned HTTP ${status}: ${message}` : super.DescribeHTTPError(status, bodyText);
    }

    /**
     * No base URL stops the call before any request, naming the ways to give one. It is a
     * `NoCredentials` error that allows failover: another candidate may be configured, and the type does
     * not exclude this vendor's other models, each of which may have its own endpoint bound.
     */
    protected GetConfigurationError(): SystemOneConfigurationError | undefined {
        if (this._endpointURL) {
            return undefined;
        }
        return {
            ErrorType: 'NoCredentials',
            Message: `${this.ServiceName} has no base URL: bind an 'API Key with Endpoint' credential whose endpoint is the server's URL, or set ${SystemOneDecision.BASE_URL_ENV_VAR}`,
        };
    }
}

/**
 * The System One URL for a base URL: trailing slashes removed, then `/v1/systemone` appended unless the
 * URL already ends with it, or `/systemone` when it ends in `/v1`.
 */
export function ToSystemOneURL(baseURL: string): string {
    const base = TrimTrailingSlashes(baseURL.trim());
    if (base.endsWith(SYSTEMONE_PATH)) {
        return base;
    }
    return base.endsWith('/v1') ? `${base}/systemone` : `${base}${SYSTEMONE_PATH}`;
}

/** The error message a System One server put in its body, or an empty string. */
function serverMessage(body: unknown): string {
    if (!IsSystemOneWireObject(body)) {
        return '';
    }
    const detail = body['detail'];
    if (typeof detail === 'string') {
        return detail.trim();
    }
    if (Array.isArray(detail)) {
        return detail
            .map(d => (IsSystemOneWireObject(d) && typeof d['msg'] === 'string' ? d['msg'].trim() : ''))
            .filter(m => m.length > 0)
            .join('; ');
    }
    const error = body['error'];
    if (IsSystemOneWireObject(error) && typeof error['message'] === 'string') {
        return error['message'].trim();
    }
    return typeof error === 'string' ? error.trim() : '';
}
