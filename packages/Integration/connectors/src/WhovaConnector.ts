import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import {
    BaseIntegrationConnector,
    BaseRESTIntegrationConnector,
    type RESTAuthContext,
    type RESTResponse,
    type PaginationState,
    type PaginationType,
    type ConnectionTestResult,
    type FetchContext,
    type FetchBatchResult,
    type ExternalRecord,
} from '@memberjunction/integration-engine';
import { z } from 'zod';

/**
 * Whova events / conference-management connector.
 *
 * ── Why this connector is metadata-driven + read-only, and has NO baked API surface ──
 *
 * Whova publishes NO machine-readable API contract (no OpenAPI / Postman / SDK) — confirmed at build
 * (SchemaContractStatus=NoMachineReadableContractFound). Whova has no direct/native REST API for
 * third-party self-integration; CRM/system integration is routed exclusively through Whova's own
 * Zapier app. The only credential-free-provable programmatic surface is that Zapier app: 3 triggers
 * (Get Attendees, Get Orders, Get Registrants) and 1 write action (Create or Update Attendee), each
 * scoped by a required `Event` parameter.
 *
 * Because of that, several things are UNDOCUMENTED credential-free and are therefore NEVER hardcoded
 * here — they are resolved at runtime from the credential / CompanyIntegration.Configuration instead:
 *   - the underlying REST base URL (Zapier abstracts it) → `apiBaseUrl` in Configuration,
 *   - the auth scheme (Zapier abstracts it) → a bearer `Token` from the credential/Configuration,
 *   - each object's REST path + response shape → the per-IO `APIPath` / `ResponseDataKey` metadata,
 *     populated only once a credentialed path is discovered (they are null in the Declared metadata),
 *   - pagination (none documented) → PaginationType='None' on every IO.
 * Guessing any of those would violate the provable-only / no-InferredFromContext discipline. This is
 * the HONEST-NA shape: the connector is structurally complete and deploys, but proving a live sync
 * needs a real credential + a runtime-discovered REST path.
 *
 * ── Capability surface ──
 * READ / export-only. Per the BrandResearch WriteCapability the frozen contract downgraded every
 * object's write capability to false for bijection consistency (a "Create or Update Attendee" action
 * exists at the Zapier level, but NO REST path/method/body-shape is documented credential-free, so
 * CreateAPIPath/Method cannot be honestly populated). So SupportsCreate/Update/Delete all stay false
 * (BaseIntegrationConnector defaults) and no CRUD method is wired — a capability<->column contract we
 * keep in lockstep. The documented Zapier-level write capability is preserved in
 * Integration.Configuration.WriteCapability for the runtime re-enable path.
 *
 * ── Discovery ──
 * There is no credential-free schema-of-record and no auth-gated list/describe endpoint documented,
 * so discovery is NOT authoritative: DiscoverObjects/DiscoverFields inherit the base's metadata-driven
 * path (the Declared IO/IOF cache), and DiscoveryIsAuthoritative stays false so a comprehensive-refresh
 * never deactivates the Declared metadata on absence. Runtime custom-column capture (full-record
 * pass-through) grows the per-event custom attendee/registration fields the Declared baseline can't
 * enumerate (Whova exposes a large per-event MENU of organizer-configurable custom profile fields).
 *
 * ── Event scoping ──
 * Whova is single-tenant-per-event: every trigger/action requires an `Event` scope. `Event` is a
 * per-sync-scope input (from CompanyIntegration.Configuration), NOT a syncable Events object. The
 * connector echoes the resolved Event onto every fetched record (the Declared IOF `Event` on Orders /
 * Registrants) so downstream records carry their scope.
 */
@RegisterClass(BaseIntegrationConnector, 'WhovaConnector')
export class WhovaConnector extends BaseRESTIntegrationConnector {

    /** Verbatim three-way invariant name: ClassName / IntegrationName getter / MJ: Integrations.Name ("whova"). */
    public override get IntegrationName(): string {
        return 'whova';
    }

    // ─── Capability surface (read/export-only) ───────────────────────
    // SupportsCreate/Update/Delete stay false (BaseIntegrationConnector defaults). No documented REST
    // write path exists credential-free; the Zapier-level write capability lives in
    // Integration.Configuration.WriteCapability and is re-enabled at runtime once a path is discovered.

    /**
     * No complete-gamut list/describe/introspection endpoint is documented credential-free for Whova,
     * so discovery re-reads the Declared metadata cache and can NEVER prove the source dropped an
     * object/field. Leaving this false keeps the comprehensive-refresh from deactivating the Declared
     * baseline on absence (the only structure we have without a live credential).
     */
    public override get DiscoveryIsAuthoritative(): boolean {
        return false;
    }

    // ─── Auth + transport (BaseRESTIntegrationConnector abstracts) ────

    /**
     * Resolves the bearer Token, per-tenant Event scope, and (undocumented) REST base URL from the
     * linked Credential entity, falling back to CompanyIntegration.Configuration JSON. The base URL and
     * auth scheme are UNDOCUMENTED credential-free (Zapier abstracts them), so they are read from config
     * at runtime, never hardcoded. Credential bytes never leave this scope.
     */
    protected async Authenticate(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<WhovaAuthContext> {
        const creds = await this.LoadCredentials(companyIntegration, contextUser);
        return { Token: creds.Token, Event: creds.Event, BaseURL: creds.BaseURL };
    }

    /**
     * Bearer auth header. The true auth scheme is UNDOCUMENTED credential-free (Zapier abstracts it);
     * a static bearer token is the conventional shape and requires no crypto/signing, so no auth-helper
     * is used. If a credentialed probe later reveals a different scheme, this is the single seam to change.
     */
    protected BuildHeaders(auth: WhovaAuthContext): Record<string, string> {
        return {
            'Authorization': `Bearer ${auth.Token}`,
            'Accept': 'application/json',
        };
    }

    /**
     * Base URL for API requests. UNDOCUMENTED credential-free — supplied per-connection via
     * Configuration.apiBaseUrl (or the credential). Throwing rather than defaulting to an invented host
     * enforces the provable-only rule: a wrong guessed host would silently 404 every object.
     */
    protected GetBaseURL(_companyIntegration: MJCompanyIntegrationEntity, auth: WhovaAuthContext): string {
        if (!auth.BaseURL || auth.BaseURL.trim().length === 0) {
            throw new Error(
                'Whova REST base URL is not configured. Whova publishes no credential-free base URL ' +
                '(its programmatic surface is abstracted behind Zapier); set "apiBaseUrl" on the ' +
                'CompanyIntegration.Configuration (or credential) once a credentialed REST path is discovered.'
            );
        }
        return auth.BaseURL.replace(/\/+$/, '');
    }

    /**
     * Executes an HTTP request via fetch. Parses JSON when the response looks like JSON, else returns
     * the raw text body. The concrete connector owns the transport seam so tests can override it.
     */
    protected async MakeHTTPRequest(
        _auth: WhovaAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        const init: RequestInit = { method, headers };
        if (body !== undefined && method !== 'GET' && method !== 'HEAD') {
            init.body = typeof body === 'string' ? body : JSON.stringify(body);
            (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
        }
        const response = await fetch(url, init);
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { responseHeaders[key.toLowerCase()] = value; });
        const text = await response.text();
        let parsed: unknown = text;
        const contentType = responseHeaders['content-type'] ?? '';
        if (contentType.includes('json') || (text.length > 0 && (text[0] === '{' || text[0] === '['))) {
            try { parsed = JSON.parse(text); } catch { parsed = text; }
        }
        return { Status: response.status, Body: parsed, Headers: responseHeaders };
    }

    /**
     * Extracts the record array from the response envelope. No response payload shape is documented
     * credential-free, so this handles the common shapes generically: a wrapper key (when the per-IO
     * ResponseDataKey is set at runtime), a root array, or a single root object. This never fabricates
     * a field schema — it only unwraps whatever the live response actually returns.
     */
    protected NormalizeResponse(rawBody: unknown, responseDataKey: string | null): Record<string, unknown>[] {
        if (responseDataKey && isRecord(rawBody)) {
            const inner = rawBody[responseDataKey];
            if (Array.isArray(inner)) return inner.filter(isRecord);
        }
        if (Array.isArray(rawBody)) return rawBody.filter(isRecord);
        // A wrapper object with a single array-valued property (common Zapier-style envelope).
        if (isRecord(rawBody)) {
            for (const v of Object.values(rawBody)) {
                if (Array.isArray(v)) return v.filter(isRecord);
            }
            return [rawBody];
        }
        return [];
    }

    /**
     * No pagination scheme is documented credential-free (Zapier's trigger listing shows input fields
     * only, not paging cursors) — every IO is PaginationType='None'. If a paging scheme is discovered
     * at runtime, populate the IO's PaginationType and this hook resolves the vendor's cursor/offset.
     */
    protected ExtractPaginationInfo(
        rawBody: unknown,
        paginationType: PaginationType,
        currentPage: number,
        currentOffset: number,
        _pageSize: number
    ): PaginationState {
        if (paginationType === 'None') return { HasMore: false };
        if (isRecord(rawBody)) {
            const next = rawBody['next'] ?? rawBody['next_cursor'] ?? rawBody['nextCursor'];
            if (typeof next === 'string' && next.length > 0) return { HasMore: true, NextCursor: next };
            const hasMore = rawBody['has_more'] ?? rawBody['hasMore'];
            if (hasMore === true) {
                return paginationType === 'Offset'
                    ? { HasMore: true, NextOffset: currentOffset + 1 }
                    : { HasMore: true, NextPage: currentPage + 1 };
            }
        }
        return { HasMore: false };
    }

    /**
     * Tests connectivity by resolving the credential + scope. Because Whova exposes no credential-free
     * REST endpoint, the honest test verifies the connector CAN resolve everything a live sync needs (a
     * Token, an Event scope, and a runtime-configured base URL) rather than hitting an invented host. If
     * a base URL is configured, it additionally probes it. This is the HONEST-NA connection posture.
     */
    public override async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const auth = await this.Authenticate(companyIntegration, contextUser);
            if (!auth.BaseURL || auth.BaseURL.trim().length === 0) {
                return {
                    Success: false,
                    Message:
                        'Whova credential + Event scope resolved, but no REST base URL is configured. ' +
                        'Whova has no credential-free REST endpoint (its API is abstracted behind Zapier); ' +
                        'set "apiBaseUrl" on the Configuration once a credentialed path is discovered.',
                };
            }
            const baseURL = this.GetBaseURL(companyIntegration, auth);
            const response = await this.MakeHTTPRequest(auth, baseURL, 'GET', this.BuildHeaders(auth));
            if (response.Status === 401 || response.Status === 403) {
                return { Success: false, Message: `Whova authentication failed (HTTP ${response.Status}) against ${baseURL}.` };
            }
            if (response.Status >= 500) {
                return { Success: false, Message: `Whova base URL returned HTTP ${response.Status}.` };
            }
            return { Success: true, Message: `Connected to Whova (event scope "${auth.Event ?? '(unset)'}") at ${baseURL}.` };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Whova connection error: ${message}` };
        }
    }

    /**
     * Fetches records for an object.
     *
     * When the object's REST path (`APIPath`) has been populated at runtime (post-credential
     * discovery), this delegates to the base metadata-driven fetch — which handles pagination and
     * full-record pass-through — and then echoes the resolved `Event` scope onto each record (Whova is
     * event-scoped and the Event does not otherwise appear in every record). Full-record pass-through
     * is preserved: `Fields` remains the complete source record (the base sets `Fields: raw`) plus the
     * `Event` scope key, never a hand-filtered subset — so custom-column capture sees everything.
     *
     * When `APIPath` is not yet configured (the Declared-metadata default — no credential-free REST
     * path is documented), the connector surfaces a structured `FetchWarning` and returns zero records
     * rather than throwing or inventing a path. This is the HONEST-NA behavior: the object is real and
     * deploys, but a live fetch needs a runtime-discovered path.
     */
    public override async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const obj = this.GetCachedObject(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        if (!obj.APIPath || obj.APIPath.trim().length === 0) {
            return {
                Records: [],
                HasMore: false,
                Warnings: [{
                    Code: 'NO_RUNTIME_PATH',
                    Message:
                        `"${ctx.ObjectName}": no REST APIPath is configured. Whova publishes no ` +
                        `credential-free REST path for this object (its programmatic surface is abstracted ` +
                        `behind Zapier); populate the IntegrationObject.APIPath once a credentialed path is ` +
                        `discovered, then this object will sync.`,
                    Data: { object: ctx.ObjectName },
                }],
            };
        }

        const auth = await this.Authenticate(ctx.CompanyIntegration, ctx.ContextUser);
        const result = await super.FetchChanges(ctx);
        const eventScope = auth.Event;
        if (!eventScope) return result;

        // Echo the resolved Event scope onto each record WITHOUT dropping any source key (full-record
        // pass-through): spread the complete source Fields and add Event only when the source omitted it.
        return {
            ...result,
            Records: result.Records.map(r => this.echoEventScope(r, eventScope)),
        };
    }

    /** Adds the Event scope to a record's Fields without ever removing a source key (full-record pass-through). */
    private echoEventScope(record: ExternalRecord, eventScope: string): ExternalRecord {
        const fields = record.Fields as Record<string, unknown>;
        if ('Event' in fields && fields['Event'] != null && String(fields['Event']).length > 0) return record;
        return { ...record, Fields: { ...fields, Event: eventScope } };
    }

    // ─── Credential resolution ───────────────────────────────────────

    /**
     * Resolves the bearer Token, per-tenant Event scope, and (undocumented) REST base URL from the
     * linked Credential entity, falling back to CompanyIntegration.Configuration JSON. Event and base
     * URL are per-tenant config — NEVER hardcoded. Only the Token is strictly required to construct the
     * connector; Event and BaseURL may be absent until a live path is configured (surfaced honestly by
     * TestConnection / FetchChanges rather than fabricated).
     */
    private async LoadCredentials(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<WhovaResolvedCredentials> {
        let token: string | undefined;
        let event: string | undefined;
        let baseURL: string | undefined;

        const credentialID = companyIntegration.CredentialID;
        if (credentialID) {
            const fromCred = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (fromCred) {
                token = fromCred.Token ?? token;
                event = fromCred.Event ?? event;
                baseURL = fromCred.BaseURL ?? baseURL;
            }
        }

        const configJson = companyIntegration.Configuration;
        if (configJson) {
            const fromConfig = this.ParseCredentialJson(configJson);
            if (fromConfig) {
                token = token ?? fromConfig.Token;
                event = event ?? fromConfig.Event;
                baseURL = baseURL ?? fromConfig.BaseURL;
            }
        }

        if (!token) {
            throw new Error('No Whova credential or Configuration JSON found — a "Token" is required.');
        }
        return { Token: token, Event: event, BaseURL: baseURL };
    }

    /** Loads Token/Event/BaseURL from a Credential entity's Values JSON. */
    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<WhovaResolvedCredentials | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;
        return this.ParseCredentialJson(credential.Values);
    }

    /** Parses a JSON string to extract Token + Event scope + BaseURL (tolerant of casing/aliases). */
    private ParseCredentialJson(json: string): WhovaResolvedCredentials | null {
        try {
            const result = WhovaCredentialSchema.safeParse(JSON.parse(json));
            if (!result.success) return null;
            const p = result.data;
            const token = p.Token ?? p.token ?? p.apiKey ?? p.ApiKey;
            const event = p.Event ?? p.event ?? p.EventID ?? p.eventId;
            const baseURL = p.apiBaseUrl ?? p.BaseURL ?? p.baseUrl;
            if (token == null && event == null && baseURL == null) return null;
            return {
                Token: token != null ? String(token) : undefined,
                Event: event != null ? String(event) : undefined,
                BaseURL: baseURL != null ? String(baseURL) : undefined,
            };
        } catch {
            return null;
        }
    }
}

// ─── Module-level types + helpers (mechanism, NOT a catalog) ──────────

/** Auth context: resolved bearer token, per-tenant Event scope, and runtime-configured base URL. */
interface WhovaAuthContext extends RESTAuthContext {
    Token: string;
    /** Per-tenant Event scope (Whova is single-tenant-per-event). Undocumented shape → runtime config. */
    Event?: string;
    /** Runtime-configured REST base URL. UNDOCUMENTED credential-free → never hardcoded. */
    BaseURL?: string;
}

/** Resolved Whova credentials (Token required; Event + BaseURL per-tenant, may be absent pre-discovery). */
interface WhovaResolvedCredentials {
    Token?: string;
    Event?: string;
    BaseURL?: string;
}

/** Zod schema for the credential/Configuration JSON shape (tolerant of casing aliases). */
const WhovaCredentialSchema = z.object({
    Token: z.string().optional(),
    token: z.string().optional(),
    apiKey: z.string().optional(),
    ApiKey: z.string().optional(),
    Event: z.union([z.string(), z.number()]).optional(),
    event: z.union([z.string(), z.number()]).optional(),
    EventID: z.union([z.string(), z.number()]).optional(),
    eventId: z.union([z.string(), z.number()]).optional(),
    apiBaseUrl: z.string().optional(),
    BaseURL: z.string().optional(),
    baseUrl: z.string().optional(),
}).passthrough();

/** Narrows an unknown value to a plain record. */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
