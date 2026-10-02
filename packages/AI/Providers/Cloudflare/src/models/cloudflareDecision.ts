import {
    BaseDecision,
    BaseSystemOneDecision,
    CreateSystemOneHTTPError,
    DecisionParams,
    DecisionResult,
    IsSystemOneWireObject,
    SystemOneWireObject,
} from '@memberjunction/ai';
import { RegisterClass } from '@memberjunction/global';

/** The placeholder a base URL carries where the Cloudflare account ID goes. */
const ACCOUNT_ID_PLACEHOLDER = '{account_id}';

/** The parts of a Cloudflare credential: an API token, and an account ID when the key carries one. */
interface CloudflareCredential {
    AccountID?: string;
    APIToken: string;
}

/**
 * A `BaseDecision` driver for Cloudflare's Clef decision models (`@cf/cloudflare/clef` and
 * `@cf/cloudflare/clef-flash`) on Workers AI. They speak the System One decisions format (the one
 * TypeSafe's Jev speaks), so the wire mapping comes from {@link BaseSystemOneDecision}; this class
 * supplies the Workers AI endpoint, the account ID and the token, and unwraps Cloudflare's v4 response
 * envelope.
 *
 * **Credentials.** Workers AI needs an account ID in the URL and an API token. The API key is either
 * `"<accountId>:<apiToken>"`, or the token alone with the account ID in the `CLOUDFLARE_ACCOUNT_ID`
 * environment variable. A key that names an account wins over the variable.
 *
 * **Endpoint.** `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run`, followed by the
 * model. To go through an AI Gateway instead, set `CLOUDFLARE_WORKERS_AI_BASE_URL` (or pass a base URL
 * to the constructor) to the URL the model is appended to, such as
 * `https://gateway.ai.cloudflare.com/v1/{account_id}/my-gateway/workers-ai`. `{account_id}` is replaced
 * with the account ID; a base URL without it needs none.
 *
 * **Model.** `DecisionParams.Model` is the model-vendor row's `APIName` (`@cf/cloudflare/clef`), which
 * is the URL's last part; the body's `model` field is its last segment (`clef`).
 */
@RegisterClass(BaseDecision, 'CloudflareDecision')
export class CloudflareDecision extends BaseSystemOneDecision {
    /** The Workers AI base URL the model is appended to, with the account ID placeholder. */
    public static readonly DEFAULT_BASE_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID_PLACEHOLDER}/ai/run`;

    /** The model used when DecisionParams.Model is empty. */
    public static readonly DEFAULT_MODEL = '@cf/cloudflare/clef';

    /** The environment variable the account ID is read from when the API key does not carry one. */
    public static readonly ACCOUNT_ID_ENV_VAR = 'CLOUDFLARE_ACCOUNT_ID';

    /** The environment variable that overrides the base URL, for an AI Gateway. */
    public static readonly BASE_URL_ENV_VAR = 'CLOUDFLARE_WORKERS_AI_BASE_URL';

    private _accountID: string | undefined;
    private _apiToken: string;
    private _baseURL: string;

    /**
     * @param apiKey `"<accountId>:<apiToken>"`, or the API token alone (the account ID then comes from `CLOUDFLARE_ACCOUNT_ID`).
     * @param baseURL Overrides the base URL, and `CLOUDFLARE_WORKERS_AI_BASE_URL`; see the class notes.
     */
    constructor(apiKey: string, baseURL?: string) {
        super(apiKey);
        const credential = parseCredential(apiKey);
        this._apiToken = credential.APIToken;
        this._accountID = credential.AccountID ?? readEnv(CloudflareDecision.ACCOUNT_ID_ENV_VAR);
        const base = nonEmpty(baseURL) ?? readEnv(CloudflareDecision.BASE_URL_ENV_VAR) ?? CloudflareDecision.DEFAULT_BASE_URL;
        this._baseURL = base.replace(/\/+$/, '');
    }

    /** The Cloudflare account ID, from the API key or `CLOUDFLARE_ACCOUNT_ID`; undefined when neither has one. */
    public get AccountID(): string | undefined {
        return this._accountID;
    }

    /** The base URL the model is appended to, before the account ID is filled in. */
    public get BaseURL(): string {
        return this._baseURL;
    }

    protected get ServiceName(): string {
        return 'Cloudflare Workers AI';
    }

    protected get DefaultModel(): string {
        return CloudflareDecision.DEFAULT_MODEL;
    }

    /** The base URL with the account ID filled in, then the model's `APIName`. */
    protected GetEndpointURL(model: string): string {
        const base = this.BaseURL.split(ACCOUNT_ID_PLACEHOLDER).join(encodeURIComponent(this.AccountID ?? ''));
        return `${base}/${model.replace(/^\/+/, '')}`;
    }

    /** The API token, without the account ID the key may carry, as a bearer token. */
    protected GetRequestHeaders(_model: string): Record<string, string> {
        return { Authorization: `Bearer ${this._apiToken}`, 'Content-Type': 'application/json' };
    }

    /** Workers AI's model selector is the `APIName`'s last segment: `clef` for `@cf/cloudflare/clef`. */
    protected GetWireModelName(model: string): string {
        const segments = model.split('/').filter(s => s.length > 0);
        return segments.length > 0 ? segments[segments.length - 1] : model;
    }

    /**
     * Cloudflare's v4 API wraps the response as `{ result, success, errors, messages }`; a Worker or a
     * gateway may return it bare. A wrapped response that reports `success: false` is an error.
     */
    protected UnwrapResponse(body: unknown, status: number): unknown {
        if (!isEnvelope(body)) {
            return body;
        }
        if (body['success'] === false) {
            const messages = errorMessages(body);
            throw CreateSystemOneHTTPError(`${this.ServiceName} reported a failure (HTTP ${status})${messages ? `: ${messages}` : ''}`, status);
        }
        return body['result'];
    }

    /** Names the envelope's `errors[].message` when the body has them, otherwise the start of the body. */
    protected DescribeHTTPError(status: number, bodyText: string): string {
        const messages = errorMessages(parseJSON(bodyText));
        return messages ? `${this.ServiceName} returned HTTP ${status}: ${messages}` : super.DescribeHTTPError(status, bodyText);
    }

    /**
     * Fails without a request when the credential is incomplete. That is a configuration error another
     * attempt would repeat, so it is fatal and does not fail over.
     */
    protected async DoDecide(params: DecisionParams): Promise<DecisionResult> {
        const missing = this.missingCredential();
        if (missing) {
            const now = new Date();
            const result = new DecisionResult(false, now, now);
            result.errorMessage = missing;
            result.errorInfo = { errorType: 'Authentication', severity: 'Fatal', canFailover: false };
            return result;
        }
        return super.DoDecide(params);
    }

    /** What the credential lacks, as an error message, or undefined when it is complete. */
    private missingCredential(): string | undefined {
        if (this._apiToken.length === 0) {
            return `${this.ServiceName} has no API token: set the API key to '<accountId>:<apiToken>', or to the token with ${CloudflareDecision.ACCOUNT_ID_ENV_VAR} set`;
        }
        if (!this.AccountID && this.BaseURL.includes(ACCOUNT_ID_PLACEHOLDER)) {
            return `${this.ServiceName} has no Cloudflare account ID: set the API key to '<accountId>:<apiToken>', or set the ${CloudflareDecision.ACCOUNT_ID_ENV_VAR} environment variable`;
        }
        return undefined;
    }
}

/** Splits `"<accountId>:<apiToken>"` at its first colon; a key with no colon is the token alone. */
function parseCredential(apiKey: string): CloudflareCredential {
    const key = (apiKey ?? '').trim();
    const colon = key.indexOf(':');
    if (colon < 0) {
        return { APIToken: key };
    }
    return { AccountID: nonEmpty(key.slice(0, colon)), APIToken: key.slice(colon + 1).trim() };
}

function nonEmpty(value: string | undefined): string | undefined {
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function readEnv(name: string): string | undefined {
    return nonEmpty(process.env[name]);
}

/** Whether a parsed body is Cloudflare's v4 envelope rather than a bare System One response. */
function isEnvelope(body: unknown): body is SystemOneWireObject {
    return IsSystemOneWireObject(body) && typeof body['success'] === 'boolean' && !('answers' in body);
}

function parseJSON(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

/** The envelope's `errors[].message` values, joined, or an empty string when there are none. */
function errorMessages(body: unknown): string {
    if (!IsSystemOneWireObject(body) || !Array.isArray(body['errors'])) {
        return '';
    }
    return body['errors']
        .map(e => (IsSystemOneWireObject(e) && typeof e['message'] === 'string' ? e['message'].trim() : ''))
        .filter(m => m.length > 0)
        .join('; ');
}
