import { describe, it, expect, beforeEach } from 'vitest';
import type {
    RESTResponse,
    RESTAuthContext,
    FetchContext,
    PaginationType,
} from '@memberjunction/integration-engine';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { PathLMSConnector, parseSpectaQLSchema } from '../PathLMSConnector.js';

/**
 * READ-ONLY / MOCKED-ONLY test connector. Overrides the auth + HTTP transport seams (no live API, no
 * mutation) and the engine-cache accessors (so DiscoverObjects/DiscoverFields/FetchChanges run without a
 * seeded DB). Each POST is routed by the GraphQL operation name embedded in the query document; every
 * request is recorded for assertion. Path LMS is PULL-ONLY — there is no write path to test.
 */
class TestPathLMSConnector extends PathLMSConnector {
    /** Operation-name → canned GraphQL response (or '__introspection__' for the schema query). */
    public Routes = new Map<string, RESTResponse>();
    /** Every { url, method, body } the connector POSTed, in order. */
    public Requests: Array<{ url: string; method: string; body: unknown }> = [];
    /** Headers the most recent BuildHeaders produced (for auth-shape assertions). */
    public LastHeaders: Record<string, string> = {};
    /** Fixture IO rows keyed by object name. */
    public IOFixtures = new Map<string, MJIntegrationObjectEntity>();
    /** Fixture IOF rows keyed by IO ID. */
    public IOFFixtures = new Map<string, MJIntegrationObjectFieldEntity[]>();
    /** Force Authenticate to throw (auth-failure path). */
    public AuthShouldFail = false;
    /** Canned public SpectaQL HTML returned by the FetchPublicSchemaHTML seam (credential-free). */
    public PublicSchemaHTML = '';
    /** Count of times the live token exchange / introspection path was entered (must be 0 in no-cred tests). */
    public AuthenticateCalls = 0;

    protected override async Authenticate(): Promise<RESTAuthContext> {
        this.AuthenticateCalls++;
        if (this.AuthShouldFail) throw new Error('invalid credentials');
        return { Token: 'test-jwt', Credentials: { applicationId: 'app-1', applicationSecret: 's' } } as unknown as RESTAuthContext;
    }

    /** Override the public-schema fetch seam — returns the canned HTML, NO network, NO credential. */
    protected override async FetchPublicSchemaHTML(): Promise<string> {
        return this.PublicSchemaHTML;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext,
        url: string,
        method: string,
        headers: Record<string, string>,
        body?: unknown
    ): Promise<RESTResponse> {
        this.LastHeaders = headers;
        this.Requests.push({ url, method, body });
        const query = typeof (body as { query?: string })?.query === 'string' ? (body as { query: string }).query : '';
        const opName = query.includes('__schema') ? '__introspection__' : extractOpName(query);
        const canned = this.Routes.get(opName);
        if (!canned) {
            return { Status: 200, Body: { errors: [{ message: `no canned response for op "${opName}"` }] }, Headers: {} };
        }
        return canned;
    }

    // ── Expose protected seams + override cache accessors for tests ──

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        const io = this.IOFixtures.get(objectName);
        if (!io) throw new Error(`test IO fixture missing: ${objectName}`);
        return io;
    }
    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.IOFFixtures.get(objectID) ?? [];
    }

    public PublicBuildHeaders(token: string): Record<string, string> {
        return this.BuildHeaders({ Token: token } as RESTAuthContext);
    }
    /**
     * Exercises the REAL auth pipeline (not the overridden Authenticate stub) so the transport-smoke /
     * pre-configured-token behavior can be asserted: resolve creds → resolve token (no live exchange when a
     * token is configured) → build headers. Returns the header map the connector would put on the request.
     */
    public async RealAuthHeaders(ci: MJCompanyIntegrationEntity, user: UserInfo): Promise<Record<string, string>> {
        const auth = await super.Authenticate(ci, user);
        return this.BuildHeaders(auth);
    }
    public PublicNormalizeResponse(body: unknown, key: string | null): Record<string, unknown>[] {
        return this.NormalizeResponse(body, key);
    }
    public PublicExtractPaginationInfo(body: unknown, type: PaginationType, offset: number, pageSize: number) {
        return this.ExtractPaginationInfo(body, type, 1, offset, pageSize);
    }
}

/**
 * Extracts the GraphQL operation FIELD name for routing. Handles both the connector's named
 * `query PathLMS_<op>(...) { <op> ... }` documents and the TestConnection probe `query { teamsList { id } }`.
 * Routes off the first selected field inside the outer braces.
 */
function extractOpName(query: string): string {
    const named = query.match(/query\s+PathLMS_(\w+)/);
    if (named) return named[1];
    // Bare query: grab the first field after the opening brace.
    const m = query.match(/query\s*\{\s*(\w+)/);
    return m ? m[1] : '';
}

/** Builds a minimal IO fixture row. */
function makeIO(over: Partial<MJIntegrationObjectEntity> & { ID: string; Name: string }): MJIntegrationObjectEntity {
    return {
        DisplayName: over.Name,
        Description: 'fixture',
        APIPath: '/graphql',
        ResponseDataKey: over.Name,
        DefaultPageSize: 50,
        SupportsPagination: false,
        PaginationType: 'None',
        SupportsIncrementalSync: false,
        SupportsWrite: false,
        Configuration: null,
        ...over,
    } as unknown as MJIntegrationObjectEntity;
}

/** Builds a minimal IOF fixture row. */
function makeIOF(name: string, over: Partial<MJIntegrationObjectFieldEntity> = {}): MJIntegrationObjectFieldEntity {
    return {
        Name: name,
        DisplayName: name,
        Type: 'String',
        IsPrimaryKey: false,
        IsUniqueKey: false,
        IsReadOnly: true,
        IsRequired: false,
        Sequence: 0,
        Status: 'Active',
        RelatedIntegrationObjectID: null,
        RelatedIntegrationObject: null,
        ...over,
    } as unknown as MJIntegrationObjectFieldEntity;
}

function gqlOk(dataKey: string, records: unknown): RESTResponse {
    return { Status: 200, Body: { data: { [dataKey]: records } }, Headers: { 'content-type': 'application/json' } };
}

const companyIntegration = { IntegrationID: 'int-1', ID: 'ci-1', CredentialID: null, Configuration: '{"applicationId":"a","applicationSecret":"s"}' } as unknown as MJCompanyIntegrationEntity;
const contextUser = {} as unknown as UserInfo;

/**
 * A representative slice of the real public SpectaQL HTML structure served credential-free at
 * https://data-api.pathlms.com/. Mirrors the field/type/description DOM exactly so the connector's
 * credential-free PK/FK derivation can be asserted against the SAME rules `scripts/parse-sdl-fk.mjs` used
 * to author the persisted metadata (the T3 DocStructureSelfCheck reconciliation). It contains:
 *  - `Course` (has `id`): id-PK; `accountId` (empty desc) → FK→Account (genuine cross-ref kept);
 *    `userId` (self-alias desc, owner HAS id) → NOT an FK (renamed view of this row's own identity);
 *    `courseItems` typed-reference → FK→CourseItem.
 *  - `CategorySale` (id-LESS report row): `userId` (self-alias desc) → FK→User IS kept — the self-alias
 *    exclusion does NOT apply on id-less rows where the `<Type>Id` is the only reference.
 *  - `Account`, `User`, `CourseItem` emitted record types (so the above FK targets resolve, none dangling).
 *  - `CourseItemViewReport` (report-container wrapper) + `BaseTeam` (abstract base) — MUST be excluded.
 * Field rows match the real DOM: `<code>NAME</code> - <span class="property-type"><a href="#definition-T"><code>[T]!</code></a></span></td><td>DESC</td>`.
 */
const PUBLIC_SCHEMA_FIXTURE = `<!doctype html><html><body><main>
  <section id="definition-Course" class="definition definition-object" data-traverse-target="definition-Course">
    <h2 class="definition-heading">Course</h2>
    <div class="doc-row"><div class="doc-copy"><div class="definition-properties doc-copy-section">
      <h5>Fields</h5><table><thead><tr><th>Field Name</th><th>Description</th></tr></thead><tbody>
        <tr><td data-property-name=""><span class="property-name"><code>id</code></span> - <span class="property-type"><a href="#definition-ID"><code>ID!</code></a></span></td><td></td></tr>
        <tr><td data-property-name=""><span class="property-name"><code>name</code></span> - <span class="property-type"><a href="#definition-String"><code>String!</code></a></span></td><td>The course name</td></tr>
        <tr><td data-property-name=""><span class="property-name"><code>accountId</code></span> - <span class="property-type"><a href="#definition-Int"><code>Int!</code></a></span></td><td></td></tr>
        <tr><td data-property-name=""><span class="property-name"><code>userId</code></span> - <span class="property-type"><a href="#definition-Int"><code>Int!</code></a></span></td><td>The userId field is the same as id, but easier to utilize for cross referencing in other systems</td></tr>
        <tr class="row-has-field-arguments"><td data-property-name=""><span class="property-name"><code>courseItems</code></span> - <span class="property-type"><a href="#definition-CourseItem"><code>[CourseItem]!</code></a></span></td><td></td></tr>
        <tr class="row-field-arguments"><td colspan="2"><div class="field-arguments"><h5 class="field-arguments-heading">Arguments</h5><div class="field-argument-list"><div class="field-argument"><h6 class="field-argument-name"><span class="property-name"><code>limit</code></span> - <span class="property-type"><a href="#definition-Int"><code>Int</code></a></span></h6></div></div></div></td></tr>
      </tbody></table></div></div></div>
  </section>
  <section id="definition-CategorySale" class="definition definition-object" data-traverse-target="definition-CategorySale">
    <h2 class="definition-heading">CategorySale</h2>
    <div class="doc-row"><div class="doc-copy"><div class="definition-properties doc-copy-section"><h5>Fields</h5><table><tbody>
      <tr><td data-property-name=""><span class="property-name"><code>userId</code></span> - <span class="property-type"><a href="#definition-Int"><code>Int!</code></a></span></td><td>The userId field is the same as id, but easier to utilize for cross referencing in other systems</td></tr>
      <tr><td data-property-name=""><span class="property-name"><code>itemName</code></span> - <span class="property-type"><a href="#definition-String"><code>String</code></a></span></td><td></td></tr>
    </tbody></table></div></div></div>
  </section>
  <section id="definition-Account" class="definition definition-object" data-traverse-target="definition-Account">
    <h2 class="definition-heading">Account</h2>
    <div class="doc-row"><div class="doc-copy"><div class="definition-properties doc-copy-section"><h5>Fields</h5><table><tbody>
      <tr><td data-property-name=""><span class="property-name"><code>name</code></span> - <span class="property-type"><a href="#definition-String"><code>String</code></a></span></td><td></td></tr>
    </tbody></table></div></div></div>
  </section>
  <section id="definition-CourseItemViewReport" class="definition definition-object" data-traverse-target="definition-CourseItemViewReport">
    <h2 class="definition-heading">CourseItemViewReport</h2>
    <div class="doc-row"><div class="doc-copy"><div class="definition-properties doc-copy-section"><h5>Fields</h5><table><tbody>
      <tr><td data-property-name=""><span class="property-name"><code>results</code></span> - <span class="property-type"><a href="#definition-CourseItemView"><code>[CourseItemView]!</code></a></span></td><td></td></tr>
    </tbody></table></div></div></div>
  </section>
  <section id="definition-User" class="definition definition-object" data-traverse-target="definition-User">
    <h2 class="definition-heading">User</h2>
    <div class="doc-row"><div class="doc-copy"><div class="definition-properties doc-copy-section"><h5>Fields</h5><table><tbody>
      <tr><td data-property-name=""><span class="property-name"><code>id</code></span> - <span class="property-type"><a href="#definition-ID"><code>ID!</code></a></span></td><td></td></tr>
      <tr><td data-property-name=""><span class="property-name"><code>email</code></span> - <span class="property-type"><a href="#definition-String"><code>String</code></a></span></td><td></td></tr>
    </tbody></table></div></div></div>
  </section>
  <section id="definition-CourseItem" class="definition definition-object" data-traverse-target="definition-CourseItem">
    <h2 class="definition-heading">CourseItem</h2>
    <div class="doc-row"><div class="doc-copy"><div class="definition-properties doc-copy-section"><h5>Fields</h5><table><tbody>
      <tr><td data-property-name=""><span class="property-name"><code>id</code></span> - <span class="property-type"><a href="#definition-ID"><code>ID!</code></a></span></td><td></td></tr>
    </tbody></table></div></div></div>
  </section>
  <section id="definition-BaseTeam" class="definition definition-object" data-traverse-target="definition-BaseTeam">
    <h2 class="definition-heading">BaseTeam</h2>
    <div class="doc-row"><div class="doc-copy"><div class="definition-properties doc-copy-section"><h5>Fields</h5><table><tbody>
      <tr><td data-property-name=""><span class="property-name"><code>id</code></span> - <span class="property-type"><a href="#definition-ID"><code>ID!</code></a></span></td><td></td></tr>
    </tbody></table></div></div></div>
  </section>
</main></body></html>`;

describe('PathLMSConnector', () => {
    let connector: TestPathLMSConnector;

    beforeEach(() => {
        connector = new TestPathLMSConnector();
    });

    describe('Identity & capabilities', () => {
        it('IntegrationName getter is the verbatim canonical name', () => {
            expect(connector.IntegrationName).toBe('Path LMS');
        });

        it('is pull-only: Create/Update/Delete all false', () => {
            expect(connector.SupportsCreate).toBe(false);
            expect(connector.SupportsUpdate).toBe(false);
            expect(connector.SupportsDelete).toBe(false);
            expect(connector.SupportsGet).toBe(true);
        });

        it('declares a conservative rate-limit policy', () => {
            const policy = connector.RateLimitPolicy;
            expect(policy).not.toBeNull();
            expect(policy!.TokensPerSec).toBeGreaterThan(0);
        });
    });

    describe('BuildHeaders (auth shape)', () => {
        it('sends a Bearer Authorization header + JSON content negotiation', () => {
            const headers = connector.PublicBuildHeaders('the-jwt');
            expect(headers['Authorization']).toBe('Bearer the-jwt');
            expect(headers['Content-Type']).toBe('application/json');
            expect(headers['Accept']).toBe('application/json');
        });

        it('always injects an Authorization header, even with an empty token state', () => {
            // BuildHeaders is unconditional — the header is present on EVERY request regardless of token
            // state (T7b transport-smoke: the header must exist, never gated behind a live exchange).
            const headers = connector.PublicBuildHeaders('');
            expect(headers).toHaveProperty('Authorization');
            expect(headers['Authorization']).toMatch(/^Bearer /);
        });
    });

    describe('Auth header injection from a pre-configured token (T7b transport smoke)', () => {
        it('injects Authorization: Bearer <token> from a configured dummy token WITHOUT a live getToken exchange', async () => {
            // The transport-smoke gate configures a dummy bearer token and asserts the connector puts it on
            // the request. A direct token in Configuration must short-circuit the two-step exchange — no
            // network call to /api/v1/getToken — yet still produce the Authorization header.
            const ciDummyToken = {
                IntegrationID: 'int-1', ID: 'ci-dummy', CredentialID: null,
                Configuration: '{"Token":"dummy-smoke-token-123"}',
            } as unknown as MJCompanyIntegrationEntity;
            const headers = await connector.RealAuthHeaders(ciDummyToken, contextUser);
            expect(headers['Authorization']).toBe('Bearer dummy-smoke-token-123');
        });

        it('strips a leading "Bearer " on a pre-configured token (no double prefix)', async () => {
            const ciBearer = {
                IntegrationID: 'int-1', ID: 'ci-bearer', CredentialID: null,
                Configuration: '{"accessToken":"Bearer already-prefixed-jwt"}',
            } as unknown as MJCompanyIntegrationEntity;
            const headers = await connector.RealAuthHeaders(ciBearer, contextUser);
            expect(headers['Authorization']).toBe('Bearer already-prefixed-jwt');
        });

        it('accepts the apiKey alias as a pre-configured bearer token', async () => {
            const ciApiKey = {
                IntegrationID: 'int-1', ID: 'ci-apikey', CredentialID: null,
                Configuration: '{"apiKey":"key-as-token"}',
            } as unknown as MJCompanyIntegrationEntity;
            const headers = await connector.RealAuthHeaders(ciApiKey, contextUser);
            expect(headers['Authorization']).toBe('Bearer key-as-token');
        });
    });

    describe('NormalizeResponse (GraphQL envelope)', () => {
        it('strips data.<queryName> for a list payload', () => {
            const body = { data: { teamsList: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }] } };
            const recs = connector.PublicNormalizeResponse(body, 'teamsList');
            expect(recs).toHaveLength(2);
            expect(recs[0]).toEqual({ id: '1', name: 'A' });
        });

        it('wraps a single object payload into a one-element array', () => {
            const body = { data: { account: { details: {} } } };
            const recs = connector.PublicNormalizeResponse(body, 'account');
            expect(recs).toHaveLength(1);
        });

        it('falls back to the first data value when no responseDataKey is given', () => {
            const body = { data: { userMetadata: [{ id: '9' }] } };
            const recs = connector.PublicNormalizeResponse(body, null);
            expect(recs).toEqual([{ id: '9' }]);
        });

        it('throws on a GraphQL error with no data (auth/context failure)', () => {
            const body = { errors: [{ message: 'Context creation failed: JsonWebTokenError: jwt must be provided' }] };
            expect(() => connector.PublicNormalizeResponse(body, 'teamsList')).toThrow(/jwt must be provided/);
        });

        it('returns [] for a non-object body', () => {
            expect(connector.PublicNormalizeResponse('not json', 'teamsList')).toEqual([]);
        });
    });

    describe('ExtractPaginationInfo (offset/limit)', () => {
        it('reports HasMore when a full page is returned', () => {
            const body = { data: { courseUserVisits: Array.from({ length: 50 }, (_, i) => ({ id: String(i) })) } };
            const state = connector.PublicExtractPaginationInfo(body, 'Offset', 0, 50);
            expect(state.HasMore).toBe(true);
            expect(state.NextOffset).toBe(50);
        });

        it('reports no more pages on a short final page', () => {
            const body = { data: { courseUserVisits: [{ id: '1' }, { id: '2' }] } };
            const state = connector.PublicExtractPaginationInfo(body, 'Offset', 100, 50);
            expect(state.HasMore).toBe(false);
        });

        it('reports no more pages for non-offset pagination', () => {
            const body = { data: { teamsList: [{ id: '1' }] } };
            const state = connector.PublicExtractPaginationInfo(body, 'None', 0, 50);
            expect(state.HasMore).toBe(false);
        });
    });

    describe('TestConnection', () => {
        it('returns Success on a 2xx GraphQL data envelope', async () => {
            connector.Routes.set('teamsList', gqlOk('teamsList', [{ id: '1' }]));
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(true);
        });

        it('returns failure when authentication fails', async () => {
            connector.AuthShouldFail = true;
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toMatch(/invalid credentials/i);
        });

        it('returns failure on a GraphQL auth error envelope', async () => {
            connector.Routes.set('teamsList', {
                Status: 200,
                Body: { errors: [{ message: 'jwt must be provided' }], data: null },
                Headers: {},
            });
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toMatch(/jwt must be provided/);
        });

        it('returns failure on an HTTP 401', async () => {
            connector.Routes.set('teamsList', { Status: 401, Body: {}, Headers: {} });
            const result = await connector.TestConnection(companyIntegration, contextUser);
            expect(result.Success).toBe(false);
            expect(result.Message).toMatch(/401/);
        });
    });

    describe('parseSpectaQLSchema (credential-free public-schema parser)', () => {
        it('enumerates record types and EXCLUDES non-record SDL types (wrappers, abstract bases)', () => {
            const schema = parseSpectaQLSchema(PUBLIC_SCHEMA_FIXTURE);
            const names = schema.RecordTypes.map(t => t.Name);
            expect(names).toContain('Course');
            expect(names).toContain('User');
            // The 9-type exclusion rule must drop the report-container wrapper + abstract base.
            expect(names).not.toContain('CourseItemViewReport');
            expect(names).not.toContain('BaseTeam');
        });

        it('parses field rows with type + list + FK target, skipping field-argument rows', () => {
            const schema = parseSpectaQLSchema(PUBLIC_SCHEMA_FIXTURE);
            const course = schema.RecordTypesByName.get('course')!;
            const fieldNames = course.Fields.map(f => f.Name);
            expect(fieldNames).toEqual(['id', 'name', 'accountId', 'userId', 'courseItems']);
            // 'limit' is a FIELD ARGUMENT, never a field — must not leak in.
            expect(fieldNames).not.toContain('limit');
            const items = course.Fields.find(f => f.Name === 'courseItems')!;
            expect(items.IsList).toBe(true);
            expect(items.TargetType).toBe('CourseItem');
        });
    });

    describe('DiscoverObjects (CREDENTIAL-FREE from public schema — the T3 fix)', () => {
        beforeEach(() => {
            connector.PublicSchemaHTML = PUBLIC_SCHEMA_FIXTURE;
        });

        it('enumerates the standard universe with NO credential and NO live token exchange', async () => {
            const ciNoCred = { ...companyIntegration, CredentialID: null, Configuration: null } as unknown as MJCompanyIntegrationEntity;
            const objects = await connector.DiscoverObjects(ciNoCred, contextUser);
            const names = objects.map(o => o.Name);
            expect(names).toContain('Course');
            expect(names).toContain('User');
            expect(names).not.toContain('CourseItemViewReport');
            // Standard discovery must never authenticate — the public schema carries the universe.
            expect(connector.AuthenticateCalls).toBe(0);
        });

        it('marks every object pull-only (no write, no incremental)', async () => {
            const objects = await connector.DiscoverObjects(companyIntegration, contextUser);
            for (const o of objects) {
                expect(o.SupportsWrite).toBe(false);
                expect(o.SupportsIncrementalSync).toBe(false);
            }
        });
    });

    describe('DiscoverFields (CREDENTIAL-FREE baseline from public schema)', () => {
        beforeEach(() => {
            connector.PublicSchemaHTML = PUBLIC_SCHEMA_FIXTURE;
        });

        it('returns the full public-schema field set with NO credential, PK + FK set, all read-only', async () => {
            const ciNoCred = { ...companyIntegration, CredentialID: null, Configuration: null } as unknown as MJCompanyIntegrationEntity;
            const fields = await connector.DiscoverFields(ciNoCred, 'Course', contextUser);
            const names = fields.map(f => f.Name);
            expect(names).toEqual(['id', 'name', 'accountId', 'userId', 'courseItems']);
            const id = fields.find(f => f.Name === 'id')!;
            expect(id.IsPrimaryKey).toBe(true);
            expect(id.IsReadOnly).toBe(true);
            // `id` is the SOLE primary key — a `*Id` reference is never a PK.
            expect(fields.filter(f => f.IsPrimaryKey).map(f => f.Name)).toEqual(['id']);
            // TYPED-REFERENCE FK: courseItems → CourseItem (an emitted object type).
            const typedFk = fields.find(f => f.Name === 'courseItems')!;
            expect(typedFk.IsForeignKey).toBe(true);
            expect(typedFk.ForeignKeyTarget).toBe('CourseItem'); // resolves only because CourseItem is an emitted record type (no dangling FK)
            // SCALAR `<Type>Id` FK (genuine cross-ref): accountId (Int) → Account. Empty description, owner
            // HAS id, but accountId is NOT a self-alias of id — it references another row → FK kept.
            const scalarFk = fields.find(f => f.Name === 'accountId')!;
            expect(scalarFk.IsForeignKey).toBe(true);
            expect(scalarFk.ForeignKeyTarget).toBe('Account');
            expect(scalarFk.IsPrimaryKey).toBe(false);
            // SELF-ALIAS exclusion on an id-OWNING type: Course.userId says "same as id … for cross
            // referencing" AND Course has its own `id` → it is a renamed view of THIS row's identity, NOT a
            // reference to a User row. The persisted metadata leaves it non-FK (this is the over-FK fix:
            // the prior round produced 20 extra such FKs that drifted from the metadata).
            const selfAlias = fields.find(f => f.Name === 'userId')!;
            expect(selfAlias.IsForeignKey).toBe(false);
            // No credential present → live introspection path is NOT entered.
            expect(connector.AuthenticateCalls).toBe(0);
        });

        it('KEEPS the scalar <Type>Id FK on an id-LESS report row (self-alias exclusion does not apply)', async () => {
            const ciNoCred = { ...companyIntegration, CredentialID: null, Configuration: null } as unknown as MJCompanyIntegrationEntity;
            // CategorySale has NO `id` field — so even though userId's prose says "same as id", the row has
            // no own identity to alias; userId IS its reference to a User → FK→User kept (matches metadata).
            const fields = await connector.DiscoverFields(ciNoCred, 'CategorySale', contextUser);
            expect(fields.filter(f => f.IsPrimaryKey)).toHaveLength(0); // id-less → no PK (engine content-hash carries identity)
            const userId = fields.find(f => f.Name === 'userId')!;
            expect(userId.IsForeignKey).toBe(true);
            expect(userId.ForeignKeyTarget).toBe('User');
            expect(userId.IsPrimaryKey).toBe(false);
        });

        it('ADDITIVELY appends live tenant fields when a credential is present (Discovered overlay)', async () => {
            // Live introspection exposes a tenant-specific field the public SDL lacked.
            connector.Routes.set('__introspection__', {
                Status: 200,
                Body: { data: { __schema: { types: [
                    { kind: 'OBJECT', name: 'User', fields: [
                        { name: 'id', type: { kind: 'SCALAR', name: 'ID' } },
                        { name: 'email', type: { kind: 'SCALAR', name: 'String' } },
                        { name: 'tenantCustomField', type: { kind: 'SCALAR', name: 'String' } },
                    ] },
                ] } } },
                Headers: {},
            });
            const fields = await connector.DiscoverFields(companyIntegration, 'User', contextUser);
            const names = fields.map(f => f.Name);
            // Baseline public fields preserved + the tenant custom appended.
            expect(names).toContain('id');
            expect(names).toContain('email');
            expect(names).toContain('tenantCustomField');
            expect(connector.AuthenticateCalls).toBeGreaterThan(0);
        });

        it('degrades to the public baseline when live introspection fails (graceful)', async () => {
            // No __introspection__ route → GetSDLTypeMap throws → AppendLiveFields returns baseline.
            const fields = await connector.DiscoverFields(companyIntegration, 'User', contextUser);
            expect(fields.map(f => f.Name)).toEqual(['id', 'email']);
        });
    });

    describe('FetchChanges — GraphQL query construction (full-record pass-through)', () => {
        beforeEach(() => {
            const io = makeIO({
                ID: 'io-cuv',
                Name: 'courseUserVisits',
                SupportsPagination: true,
                PaginationType: 'Offset',
                Configuration: JSON.stringify({ GraphQLQueryName: 'courseUserVisits', ReturnType: '[CourseUserVisits]', OperationArguments: ['courseIds:[Int!]', 'limit:Int', 'offset:Int'] }),
            });
            connector.IOFixtures.set('courseUserVisits', io);
            connector.IOFFixtures.set('io-cuv', [
                makeIOF('id', { IsPrimaryKey: true, IsUniqueKey: true, IsRequired: true }),
                makeIOF('courseId', { Type: 'Int', IsRequired: true }),
            ]);
            // No introspection → object fields (none here) skipped; scalars selected as leaves.
        });

        it('POSTs a GraphQL document with the operation name + offset/limit pagination vars', async () => {
            connector.Routes.set('courseUserVisits', gqlOk('courseUserVisits', [{ id: '1', courseId: 5 }]));
            const ctx: FetchContext = {
                CompanyIntegration: companyIntegration,
                ObjectName: 'courseUserVisits',
                WatermarkValue: null,
                BatchSize: 50,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records).toHaveLength(1);
            const sent = connector.Requests.find(r => typeof (r.body as { query?: string })?.query === 'string' && (r.body as { query: string }).query.includes('courseUserVisits('));
            expect(sent).toBeDefined();
            const body = sent!.body as { query: string; variables: Record<string, unknown> };
            expect(body.query).toMatch(/courseUserVisits\(/);
            expect(body.query).toMatch(/\$offset/);
            expect(body.query).toMatch(/\$limit/);
            expect(body.variables.offset).toBe(0);
            expect(body.variables.limit).toBe(50);
        });

        it('passes through the FULL raw GraphQL node in Fields (custom-column contract)', async () => {
            // Source returns an extra field the IOF set does not declare — it must still reach Fields.
            connector.Routes.set('courseUserVisits', gqlOk('courseUserVisits', [{ id: '1', courseId: 5, undocumentedExtra: 'keep-me' }]));
            const ctx: FetchContext = {
                CompanyIntegration: companyIntegration,
                ObjectName: 'courseUserVisits',
                WatermarkValue: null,
                BatchSize: 50,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records[0].Fields).toHaveProperty('undocumentedExtra', 'keep-me');
            expect(result.Records[0].ExternalID).toBe('1');
        });

        it('paginates: a full page sets HasMore + NextOffset, a short page stops', async () => {
            // First call returns a full page (50) → HasMore. BatchSize bounds the batch so the loop yields.
            const fullPage = Array.from({ length: 50 }, (_, i) => ({ id: String(i), courseId: i }));
            connector.Routes.set('courseUserVisits', gqlOk('courseUserVisits', fullPage));
            const ctx: FetchContext = {
                CompanyIntegration: companyIntegration,
                ObjectName: 'courseUserVisits',
                WatermarkValue: null,
                BatchSize: 50,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.HasMore).toBe(true);
            expect(result.NextOffset).toBe(50);
        });
    });

    describe('FetchChanges — container object with no usable PK falls back to content-hash identity', () => {
        beforeEach(() => {
            const io = makeIO({
                ID: 'io-acct',
                Name: 'account',
                Configuration: JSON.stringify({ GraphQLQueryName: 'account', ReturnType: 'Account', OperationArguments: [] }),
            });
            connector.IOFixtures.set('account', io);
            // No PK field declared → BuildRecordIdentity returns '' → base content-hash identity used.
            connector.IOFFixtures.set('io-acct', [makeIOF('details', { Type: 'json' })]);
        });

        it('emits a record with empty connector identity (engine content-hash fallback dedupes it)', async () => {
            connector.Routes.set('account', gqlOk('account', { details: { x: 1 } }));
            const ctx: FetchContext = {
                CompanyIntegration: companyIntegration,
                ObjectName: 'account',
                WatermarkValue: null,
                BatchSize: 50,
                ContextUser: contextUser,
            };
            const result = await connector.FetchChanges(ctx);
            expect(result.Records).toHaveLength(1);
            expect(result.Records[0].ExternalID).toBe('');
            expect(result.Records[0].Fields).toHaveProperty('details');
        });
    });

    describe('Rate-limit / concurrency surface (provable-only)', () => {
        it('exposes a conservative RateLimitPolicy (vendor documents no explicit limit)', () => {
            const policy = connector.RateLimitPolicy;
            expect(policy).not.toBeNull();
            expect(policy!.TokensPerSec).toBe(5);
            expect(policy!.Burst).toBe(10);
        });

        it('does NOT fabricate a Retry-After parser (no documented 429 contract → engine default backoff)', () => {
            // Path LMS publishes no Retry-After header contract, so ExtractRetryAfterMs must stay the base
            // default (undefined) rather than invent a header format — the engine's AIMD handles backoff.
            expect(connector.ExtractRetryAfterMs(new Error('429 Too Many Requests'))).toBeUndefined();
        });
    });

    describe('FetchChanges — nested access path (tables ≠ doors)', () => {
        it('queries the door, descends the path, and emits the leaf records (depth-1)', async () => {
            const io = makeIO({
                ID: 'io-course', Name: 'Course',
                Configuration: JSON.stringify({ GraphQLType: 'Course', AccessPath: { Door: 'account', Segments: ['courses'] } }),
            });
            connector.IOFixtures.set('Course', io);
            connector.IOFFixtures.set('io-course', [
                makeIOF('id', { IsPrimaryKey: true, IsUniqueKey: true, IsRequired: true }),
                makeIOF('name', {}),
            ]);
            // Door `account` returns an object whose `courses` field is the Course record collection.
            connector.Routes.set('account', gqlOk('account', { courses: [{ id: 'c1', name: 'A', extra: 'keep' }, { id: 'c2', name: 'B' }] }));

            const result = await connector.FetchChanges({
                CompanyIntegration: companyIntegration, ObjectName: 'Course',
                WatermarkValue: null, BatchSize: 50, ContextUser: contextUser,
            } as FetchContext);

            expect(result.Records).toHaveLength(2);
            expect(result.Records.map(r => r.ExternalID).sort()).toEqual(['c1', 'c2']);
            // full-record pass-through survives the descent
            expect(result.Records[0].Fields).toHaveProperty('extra', 'keep');
            // the nested query descended the path
            const sent = connector.Requests.find(r => (r.body as { query?: string })?.query?.includes('PathLMS_account'));
            expect((sent!.body as { query: string }).query).toMatch(/account\s*\{\s*courses\s*\{/);
        });

        it('descends a 2-level path and flattens both array hops (depth-2)', async () => {
            const io = makeIO({
                ID: 'io-aq', Name: 'AssessmentQuestion',
                Configuration: JSON.stringify({ AccessPath: { Door: 'account', Segments: ['assessmentsReport', 'assessmentQuestions'] } }),
            });
            connector.IOFixtures.set('AssessmentQuestion', io);
            connector.IOFFixtures.set('io-aq', [makeIOF('id', { IsPrimaryKey: true, IsUniqueKey: true })]);
            connector.Routes.set('account', gqlOk('account', {
                assessmentsReport: [
                    { assessmentQuestions: [{ id: 'q1' }, { id: 'q2' }] },
                    { assessmentQuestions: [{ id: 'q3' }] },
                ],
            }));

            const result = await connector.FetchChanges({
                CompanyIntegration: companyIntegration, ObjectName: 'AssessmentQuestion',
                WatermarkValue: null, BatchSize: 50, ContextUser: contextUser,
            } as FetchContext);

            expect(result.Records.map(r => r.ExternalID).sort()).toEqual(['q1', 'q2', 'q3']);
        });

        it('skips an unresolved object (AccessPath.Door=null) with a NO_ACCESS_PATH warning, no broken query', async () => {
            const io = makeIO({
                ID: 'io-sq', Name: 'SurveyOpenEndedQuestion',
                Configuration: JSON.stringify({ AccessPath: { Door: null, Segments: [] } }),
            });
            connector.IOFixtures.set('SurveyOpenEndedQuestion', io);
            connector.IOFFixtures.set('io-sq', [makeIOF('id', { IsPrimaryKey: true })]);

            const before = connector.Requests.length;
            const result = await connector.FetchChanges({
                CompanyIntegration: companyIntegration, ObjectName: 'SurveyOpenEndedQuestion',
                WatermarkValue: null, BatchSize: 50, ContextUser: contextUser,
            } as FetchContext);

            expect(result.Records).toHaveLength(0);
            expect(result.Warnings?.[0]?.Code).toBe('NO_ACCESS_PATH');
            // no GraphQL data request was issued for the unresolved object
            expect(connector.Requests.length).toBe(before);
        });
    });
});
