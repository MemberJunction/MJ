import { describe, it, expect } from 'vitest';
import type {
    RESTAuthContext,
    RESTResponse,
    PaginationType,
    FetchContext,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
} from '@memberjunction/integration-engine';
import type {
    MJCompanyIntegrationEntity,
    MJIntegrationObjectEntity,
    MJIntegrationObjectFieldEntity,
} from '@memberjunction/core-entities';
import {
    MagnetMailConnector,
    type MagnetMailAuthContext,
    type SoapRequest,
} from '../MagnetMailConnector.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────
// SOAP XML shapes descend from the MagnetMail WSDL (document/literal, ns http://www.magnetmail.net/):
//   PROVENANCE: packages/Integration/connectors-registry/magnetmail/runs/.../output — WSDL type graph
//   (AuthenticationResult, mmAuthHeader, getMessages*Result → Message[], SaveResult.id, soap:Fault).
// These are synthetic-but-shaped (credential-free [B] ceiling); no PII, no live endpoint contacted.

/** Authenticate response envelope (AuthenticationResult carries sessionId + user_id). */
const AUTHENTICATE_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <AuthenticateResponse xmlns="http://www.magnetmail.net/">
      <AuthenticateResult>
        <authenticated>true</authenticated>
        <sessionId>SESS-ABC-123</sessionId>
        <loginid>4567</loginid>
        <user_id>USR-99</user_id>
      </AuthenticateResult>
    </AuthenticateResponse>
  </soap:Body>
</soap:Envelope>`;

/** A getMessages response with two Message records nested under getMessagesResult. */
const GET_MESSAGES_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <getMessagesResponse xmlns="http://www.magnetmail.net/">
      <getMessagesResult>
        <Message>
          <message_id>1001</message_id>
          <message_name>Spring Newsletter</message_name>
          <sent_date>2026-03-02T10:00:00</sent_date>
        </Message>
        <Message>
          <message_id>1002</message_id>
          <message_name>Summer Newsletter</message_name>
          <sent_date>2026-06-01T10:00:00</sent_date>
        </Message>
      </getMessagesResult>
    </getMessagesResponse>
  </soap:Body>
</soap:Envelope>`;

/** A SOAP 1.1 fault envelope (HTTP 500). */
const FAULT_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>Invalid session token</faultstring>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>`;

/** Parsed-body forms (what a mocked MakeHTTPRequest returns as RESTResponse.Body). */
const authenticateBody = { AuthenticateResponse: { AuthenticateResult: { authenticated: true, sessionId: 'SESS-ABC-123', user_id: 'USR-99' } } };
const faultBody = { _soapFault: { faultcode: 'soap:Client', faultstring: 'Invalid session token' } };
const messagesBody = {
    getMessagesResponse: {
        getMessagesResult: {
            Message: [
                { message_id: 1001, message_name: 'Spring', sent_date: '2026-03-02T10:00:00' },
                { message_id: 1002, message_name: 'Summer', sent_date: '2026-06-01T10:00:00' },
            ],
        },
    },
};
/** getMessages with the dates OUT OF ORDER (later record first) — for the max-watermark test. */
const messagesOutOfOrderBody = {
    getMessagesResult: {
        Message: [
            { message_id: 2002, sent_date: '2026-06-01T10:00:00' },
            { message_id: 2001, sent_date: '2026-03-02T10:00:00' },
        ],
    },
};
/** Recipient nested inside a RecipientSuppressionList → ArrayOfRecipient (AccessPath descent). */
const nestedRecipientBody = {
    getSuppressedRecipientListResult: {
        RecipientSuppressionList: {
            ArrayOfRecipient: {
                Recipient: [
                    { id: 'R1', email: 'a@example.com' },
                    { id: 'R2', email: 'b@example.com' },
                ],
            },
        },
    },
};
/** SaveResult with an id (create success). */
const createBody = { addRecipientResponse: { addRecipientResult: { id: 5555, error: 0 } } };
/** SaveResult with NO id (create failure — must fail loudly). */
const createNoIdBody = { addRecipientResponse: { addRecipientResult: { error: 0, msg: 'ok but no id' } } };
/** SaveResult that is HTTP 200 + carries an id BUT signals an in-band error flag (must fail loudly). */
const createInBandErrorFlagBody = { addRecipientResponse: { addRecipientResult: { id: 5555, error: 1, msg: 'Duplicate email address' } } };
/** SaveResult with a populated errorObj (tns:Error) inside a 200 body (must fail loudly). */
const createInBandErrorObjBody = { addRecipientResponse: { addRecipientResult: { id: 5555, error: 0, errorObj: { errorCode: 'E12', errorMessage: 'Invalid recipient payload' } } } };

// ─── Captured request + fixture builders ───────────────────────────────────

interface CapturedRequest { url: string; method: string; headers: Record<string, string>; body: SoapRequest | undefined; }

function makeIO(over: Partial<MJIntegrationObjectEntity> & { ID: string; Name: string }): MJIntegrationObjectEntity {
    return {
        DisplayName: over.Name,
        Description: 'fixture',
        APIPath: '/mmapi.asmx',
        ResponseDataKey: null,
        DefaultPageSize: 0,
        SupportsPagination: false,
        PaginationType: 'None',
        SupportsIncrementalSync: false,
        SupportsWrite: false,
        IncrementalWatermarkField: null,
        Configuration: null,
        Status: 'Active',
        CreateAPIPath: null,
        CreateMethod: null,
        UpdateAPIPath: null,
        UpdateMethod: null,
        DeleteAPIPath: null,
        DeleteMethod: null,
        ...over,
    } as unknown as MJIntegrationObjectEntity;
}

function makeIOF(over: Partial<MJIntegrationObjectFieldEntity> & { Name: string }): MJIntegrationObjectFieldEntity {
    return {
        Type: 'string', IsPrimaryKey: false, IsRequired: false, IsReadOnly: false, IsUniqueKey: false,
        Sequence: 0, Status: 'Active', RelatedIntegrationObjectID: null, ...over,
    } as unknown as MJIntegrationObjectFieldEntity;
}

const seededAuth: MagnetMailAuthContext = {
    SessionID: 'SESS-ABC-123', UserId: 'USR-99',
    Endpoint: 'https://hlma-apie1.magnetmail.net/mmapi.asmx', Namespace: 'http://www.magnetmail.net/',
};

/**
 * Mocked connector — overrides the transport boundary (MakeHTTPRequest), config parse (fixed creds, no DB),
 * and the engine-cache accessors. All SOAP envelope / normalize / pagination / fetch / CRUD logic runs FOR
 * REAL. Nothing hits a live endpoint or mutates data.
 */
class MockedMagnetMailConnector extends MagnetMailConnector {
    public Captured: CapturedRequest[] = [];
    public Responses: RESTResponse[] = [];
    public IOFixtures = new Map<string, MJIntegrationObjectEntity>();
    public IOFFixtures = new Map<string, MJIntegrationObjectFieldEntity[]>();

    protected override async ParseConfig(): Promise<never> {
        return { Username: 'u', Password: 'p', Endpoint: seededAuth.Endpoint, Namespace: seededAuth.Namespace, SessionTTLMs: 1_800_000 } as never;
    }

    protected override async MakeHTTPRequest(
        _auth: RESTAuthContext, url: string, method: string, headers: Record<string, string>, body?: unknown
    ): Promise<RESTResponse> {
        this.Captured.push({ url, method, headers, body: body as SoapRequest | undefined });
        const next = this.Responses.shift();
        if (!next) throw new Error(`MockedMagnetMailConnector: no canned response queued for ${method} ${url}`);
        return next;
    }

    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        const io = this.IOFixtures.get(objectName);
        if (!io) throw new Error(`test IO fixture missing: ${objectName}`);
        return io;
    }
    protected override GetCachedFields(objectID: string): MJIntegrationObjectFieldEntity[] {
        return this.IOFFixtures.get(objectID) ?? [];
    }

    /** Seed the session cache so fetch/CRUD tests skip the live two-step auth. */
    public SeedAuth(): void {
        this.cachedSession = { Auth: seededAuth, CreatedAt: Date.now(), TTLMs: 1_800_000 };
    }

    // Exposed protected seams for direct unit assertions.
    public PublicEnvelope(req: SoapRequest, includeAuth = true): string {
        return this.buildSoapEnvelope(includeAuth ? seededAuth : { ...seededAuth, SessionID: '', UserId: '' }, req);
    }
    public PublicNormalize(body: unknown, key: string | null): Record<string, unknown>[] { return this.NormalizeResponse(body, key); }
    public PublicPagination(body: unknown, type: PaginationType, page = 1, offset = 0, size = 50) {
        return this.ExtractPaginationInfo(body, type, page, offset, size);
    }
    public PublicHeaders(): Record<string, string> { return this.BuildHeaders(seededAuth); }
    public PublicParse(xml: string, status = 200): RESTResponse { return this.parseSoapResponse(xml, status, {}); }
    public PublicFault(body: unknown) { return this.extractSoapFault(body); }
}

const ci = { IntegrationID: 'int-1', Configuration: null, CredentialID: null } as unknown as MJCompanyIntegrationEntity;
const user = {} as never;

function fetchCtx(objectName: string, over?: Partial<FetchContext>): FetchContext {
    return { CompanyIntegration: ci, ObjectName: objectName, WatermarkValue: null, BatchSize: 100, ContextUser: user, ...over };
}

const messagePK = (): MJIntegrationObjectFieldEntity[] => [
    makeIOF({ Name: 'message_id', IsPrimaryKey: true, IsRequired: true, IsUniqueKey: true, Type: 'integer' }),
];

// ═══════════════════════════════════════════════════════════════════════════

describe('MagnetMailConnector — identity + capabilities', () => {
    it('IntegrationName is the verbatim MJ: Integrations.Name (magnetmail)', () => {
        expect(new MagnetMailConnector().IntegrationName).toBe('magnetmail');
    });

    it('declares Create + Update, NO Delete (no delete op exists in the WSDL), non-authoritative discovery', () => {
        const c = new MagnetMailConnector();
        expect(c.SupportsCreate).toBe(true);
        expect(c.SupportsUpdate).toBe(true);
        expect(c.SupportsDelete).toBe(false);
        expect(c.DiscoveryIsAuthoritative).toBe(false);
    });
});

describe('MagnetMailConnector — BuildHeaders (SOAP 1.1)', () => {
    it('sends text/xml with no signing/crypto', () => {
        const h = new MockedMagnetMailConnector().PublicHeaders();
        expect(h['Content-Type']).toBe('text/xml; charset=utf-8');
        expect(h['Accept']).toBe('text/xml');
    });
});

describe('MagnetMailConnector — buildSoapEnvelope', () => {
    const c = new MockedMagnetMailConnector();

    it('emits the <mmAuthHeader> SOAP header (sessionId + user_id) on authenticated operations', () => {
        const xml = c.PublicEnvelope({ Action: 'getMessages', Args: {}, IncludeAuthHeader: true });
        expect(xml).toContain('<mmAuthHeader xmlns="http://www.magnetmail.net/">');
        expect(xml).toContain('<sessionId>SESS-ABC-123</sessionId>');
        expect(xml).toContain('<user_id>USR-99</user_id>');
        expect(xml).toContain('<getMessages xmlns="http://www.magnetmail.net/">');
    });

    it('OMITS the mmAuthHeader on the Authenticate call', () => {
        const xml = c.PublicEnvelope({ Action: 'Authenticate', Args: { username: 'u', password: 'p' }, IncludeAuthHeader: false }, false);
        expect(xml).not.toContain('mmAuthHeader');
        expect(xml).toContain('<username>u</username>');
        expect(xml).toContain('<password>p</password>');
    });

    it('renders nested objects/arrays recursively and escapes values', () => {
        const xml = c.PublicEnvelope({
            Action: 'addRecipient',
            Args: { email: 'a&b@x.com', Groups: [{ group_id: 1 }, { group_id: 2 }] },
            IncludeAuthHeader: true,
        });
        expect(xml).toContain('<email>a&amp;b@x.com</email>');
        expect(xml).toContain('<Groups>');
        expect(xml).toContain('<group_id>1</group_id>');
        expect(xml).toContain('<group_id>2</group_id>');
    });

    it('nests args inside a <criteria> wrapper when WrapperElement is set', () => {
        const xml = c.PublicEnvelope({ Action: 'searchForRecipients', Args: { email: 'x@y.com' }, IncludeAuthHeader: true, WrapperElement: 'criteria' });
        expect(xml).toContain('<criteria>');
        expect(xml).toContain('<email>x@y.com</email>');
        expect(xml).toContain('</criteria>');
    });
});

describe('MagnetMailConnector — parseSoapResponse / xmlToObject (real XML → JS)', () => {
    const c = new MockedMagnetMailConnector();

    it('parses an Authenticate envelope into a nested JS object', () => {
        const res = c.PublicParse(AUTHENTICATE_XML);
        expect(res.Status).toBe(200);
        const body = res.Body as Record<string, unknown>;
        const result = ((body.AuthenticateResponse as Record<string, unknown>).AuthenticateResult) as Record<string, unknown>;
        expect(result.sessionId).toBe('SESS-ABC-123');
        expect(result.user_id).toBe('USR-99');
        expect(result.authenticated).toBe(true);
        expect(result.loginid).toBe(4567); // numeric coercion
    });

    it('parses repeated <Message> elements into an array', () => {
        const res = c.PublicParse(GET_MESSAGES_XML);
        const recs = c.PublicNormalize(res.Body, 'Message');
        expect(recs).toHaveLength(2);
        expect(recs[0].message_id).toBe(1001);
        expect(recs[1].message_name).toBe('Summer Newsletter');
    });

    it('detects a soap:Fault and surfaces it as _soapFault with HTTP 500', () => {
        const res = c.PublicParse(FAULT_XML, 500);
        expect(res.Status).toBe(500);
        const fault = c.PublicFault(res.Body);
        expect(fault?.faultcode).toBe('soap:Client');
        expect(fault?.faultstring).toBe('Invalid session token');
    });
});

describe('MagnetMailConnector — NormalizeResponse (strip <action>Result + AccessPath descent)', () => {
    const c = new MockedMagnetMailConnector();

    it('strips the Response/Result wrapper and returns the record array', () => {
        expect(c.PublicNormalize(messagesBody, 'Message')).toHaveLength(2);
    });

    it('deep-descends AccessPath nesting (RecipientSuppressionList → ArrayOfRecipient → Recipient)', () => {
        const recs = c.PublicNormalize(nestedRecipientBody, 'Recipient');
        expect(recs).toHaveLength(2);
        expect(recs[0].id).toBe('R1');
    });

    it('wraps a single record object into a one-element array', () => {
        const single = { getUserDetailsResult: { User: { user_id: 'USR-99', account_name: 'Acme' } } };
        const recs = c.PublicNormalize(single, 'User');
        expect(recs).toHaveLength(1);
        expect(recs[0].account_name).toBe('Acme');
    });

    it('returns [] for null / empty bodies', () => {
        expect(c.PublicNormalize(null, 'Message')).toEqual([]);
        expect(c.PublicNormalize({ getMessagesResult: {} }, 'Message')).toEqual([]);
    });
});

describe('MagnetMailConnector — ExtractPaginationInfo (pageNumber/pageCount)', () => {
    const c = new MockedMagnetMailConnector();

    it('None pagination → never has more', () => {
        expect(c.PublicPagination(messagesBody, 'None').HasMore).toBe(false);
    });

    it('PageNumber: a FULL page (count == pageSize) → HasMore + NextPage', () => {
        const p = c.PublicPagination(messagesBody, 'PageNumber', 1, 0, 2);
        expect(p.HasMore).toBe(true);
        expect(p.NextPage).toBe(2);
    });

    it('PageNumber: a partial page (count < pageSize) → set exhausted', () => {
        const p = c.PublicPagination(messagesBody, 'PageNumber', 1, 0, 50);
        expect(p.HasMore).toBe(false);
    });
});

describe('MagnetMailConnector — TestConnection (two-step auth)', () => {
    it('authenticates and reports success (auth happy path)', async () => {
        const c = new MockedMagnetMailConnector();
        c.Responses.push({ Status: 200, Body: authenticateBody, Headers: {} });
        const result = await c.TestConnection(ci, user);
        expect(result.Success).toBe(true);
        expect(result.Message).toContain('USR-99');
        // The Authenticate call carries no mmAuthHeader (IncludeAuthHeader false).
        expect(c.Captured[0].body?.Action).toBe('Authenticate');
        expect(c.Captured[0].body?.IncludeAuthHeader).toBe(false);
    });

    it('reports an auth failure on a SOAP fault', async () => {
        const c = new MockedMagnetMailConnector();
        c.Responses.push({ Status: 500, Body: faultBody, Headers: {} });
        const result = await c.TestConnection(ci, user);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('authentication failed');
    });

    it('reports a connection error on a network failure', async () => {
        const c = new MockedMagnetMailConnector();
        // no canned response → MakeHTTPRequest throws → caught
        const result = await c.TestConnection(ci, user);
        expect(result.Success).toBe(false);
        expect(result.Message).toContain('error');
    });
});

describe('MagnetMailConnector — Authenticate attaches mmAuthHeader on subsequent ops', () => {
    it('caches the session and sends sessionId + user_id in the next op request', async () => {
        const c = new MockedMagnetMailConnector();
        const io = makeIO({ ID: 'io-msg', Name: 'Message', ResponseDataKey: 'Message', Configuration: JSON.stringify({ ListOperation: 'getMessages' }) });
        c.IOFixtures.set('Message', io);
        c.IOFFixtures.set('io-msg', messagePK());
        // First response = Authenticate, second = the getMessages op.
        c.Responses.push({ Status: 200, Body: authenticateBody, Headers: {} });
        c.Responses.push({ Status: 200, Body: messagesBody, Headers: {} });

        await c.FetchChanges(fetchCtx('Message'));

        expect(c.Captured[0].body?.Action).toBe('Authenticate');
        const opReq = c.Captured[1].body;
        expect(opReq?.Action).toBe('getMessages');
        expect(opReq?.IncludeAuthHeader).toBe(true); // → mmAuthHeader emitted for the data op
    });
});

describe('MagnetMailConnector — FetchChanges (SOAP read)', () => {
    function messageConnector(over?: Partial<MJIntegrationObjectEntity>): MockedMagnetMailConnector {
        const c = new MockedMagnetMailConnector();
        c.SeedAuth();
        const io = makeIO({
            ID: 'io-msg', Name: 'Message', ResponseDataKey: 'Message',
            Configuration: JSON.stringify({ ListOperation: 'getMessages' }),
            ...over,
        });
        c.IOFixtures.set('Message', io);
        c.IOFFixtures.set('io-msg', messagePK());
        return c;
    }

    it('surfaces a loud warning (not silent empty) when no list operation is configured', async () => {
        const c = messageConnector({ Configuration: JSON.stringify({}) });
        const result = await c.FetchChanges(fetchCtx('Message'));
        expect(result.Records).toHaveLength(0);
        expect(result.Warnings?.[0].Code).toBe('NO_LIST_OPERATION');
        expect(c.Captured).toHaveLength(0);
    });

    it('reads records and passes the FULL source record through to Fields', async () => {
        const c = messageConnector();
        c.Responses.push({ Status: 200, Body: messagesBody, Headers: {} });
        const result = await c.FetchChanges(fetchCtx('Message'));
        expect(result.Records).toHaveLength(2);
        expect(result.Records[0].ExternalID).toBe('1001');
        // Full-record pass-through: every source key reaches Fields.
        expect(result.Records[0].Fields.message_name).toBe('Spring');
        expect(result.Records[0].Fields.sent_date).toBe('2026-03-02T10:00:00');
        expect(c.Captured[0].body?.Action).toBe('getMessages');
    });

    it('throws on a SOAP fault (partial failure → engine keeps the old watermark)', async () => {
        const c = messageConnector({ SupportsIncrementalSync: true, IncrementalWatermarkField: 'sentStartDate' });
        c.Responses.push({ Status: 500, Body: faultBody, Headers: {} });
        await expect(c.FetchChanges(fetchCtx('Message', { WatermarkValue: '2026-01-01T00:00:00' }))).rejects.toThrow(/SOAP Fault/);
    });
});

describe('MagnetMailConnector — FetchChanges incremental watermark', () => {
    function incrementalConnector(): MockedMagnetMailConnector {
        const c = new MockedMagnetMailConnector();
        c.SeedAuth();
        const io = makeIO({
            ID: 'io-msg', Name: 'Message', ResponseDataKey: 'Message',
            SupportsIncrementalSync: true, IncrementalWatermarkField: 'sentStartDate',
            Configuration: JSON.stringify({ ListOperation: 'getMessagesUTC', WatermarkValueField: 'sent_date' }),
        });
        c.IOFixtures.set('Message', io);
        c.IOFFixtures.set('io-msg', messagePK());
        return c;
    }

    it('first sync (no watermark) omits the date param but still emits the max watermark seen', async () => {
        const c = incrementalConnector();
        c.Responses.push({ Status: 200, Body: messagesBody, Headers: {} });
        const result = await c.FetchChanges(fetchCtx('Message', { WatermarkValue: null }));
        expect(c.Captured[0].body?.Args.sentStartDate).toBeUndefined();
        expect(result.NewWatermarkValue).toBe('2026-06-01T10:00:00');
    });

    it('subsequent sync injects the sentStartDate date-range param from the watermark', async () => {
        const c = incrementalConnector();
        c.Responses.push({ Status: 200, Body: messagesBody, Headers: {} });
        const result = await c.FetchChanges(fetchCtx('Message', { WatermarkValue: '2026-02-01T00:00:00' }));
        expect(c.Captured[0].body?.Args.sentStartDate).toBe('2026-02-01T00:00:00');
        expect(result.NewWatermarkValue).toBe('2026-06-01T10:00:00');
    });

    it('tracks the MAX watermark even when records arrive out of order', async () => {
        const c = incrementalConnector();
        c.Responses.push({ Status: 200, Body: messagesOutOfOrderBody, Headers: {} });
        const result = await c.FetchChanges(fetchCtx('Message', { WatermarkValue: '2026-01-01T00:00:00' }));
        expect(result.NewWatermarkValue).toBe('2026-06-01T10:00:00');
    });
});

describe('MagnetMailConnector — CRUD (SOAP mutation envelopes)', () => {
    function recipientWriteConnector(over?: Partial<MJIntegrationObjectEntity>): MockedMagnetMailConnector {
        const c = new MockedMagnetMailConnector();
        c.SeedAuth();
        const io = makeIO({
            ID: 'io-rec', Name: 'Recipient', ResponseDataKey: 'Recipient', SupportsWrite: true,
            CreateAPIPath: '/mmapi.asmx', CreateMethod: 'POST', CreateBodyShape: 'literal', CreateIDLocation: 'body',
            UpdateAPIPath: '/mmapi.asmx', UpdateMethod: 'POST', UpdateBodyShape: 'literal', UpdateIDLocation: 'body',
            Configuration: JSON.stringify({ CreateOperation: 'addRecipient', UpdateOperation: 'editRecipient' }),
            ...over,
        });
        c.IOFixtures.set('Recipient', io);
        c.IOFFixtures.set('io-rec', [makeIOF({ Name: 'id', IsPrimaryKey: true, IsRequired: true, IsUniqueKey: true })]);
        return c;
    }

    it('CreateRecord builds an addRecipient SOAP envelope and extracts SaveResult.id via BuildCreatedResult', async () => {
        const c = recipientWriteConnector();
        c.Responses.push({ Status: 200, Body: createBody, Headers: {} });
        const ctx = { CompanyIntegration: ci, ContextUser: user, ObjectName: 'Recipient', Attributes: { email: 'a@example.com' } } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(c.Captured[0].body?.Action).toBe('addRecipient');
        expect(c.Captured[0].body?.IncludeAuthHeader).toBe(true);
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('5555');
    });

    it('CreateRecord fails LOUDLY on a 2xx with no record id (BuildCreatedResult guard)', async () => {
        const c = recipientWriteConnector();
        c.Responses.push({ Status: 200, Body: createNoIdBody, Headers: {} });
        const ctx = { CompanyIntegration: ci, ContextUser: user, ObjectName: 'Recipient', Attributes: { email: 'a@example.com' } } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
    });

    it('CreateRecord fails LOUDLY on a 200 body carrying an in-band error flag (error != 0) even with an id', async () => {
        const c = recipientWriteConnector();
        c.Responses.push({ Status: 200, Body: createInBandErrorFlagBody, Headers: {} });
        const ctx = { CompanyIntegration: ci, ContextUser: user, ObjectName: 'Recipient', Attributes: { email: 'a@example.com' } } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.ExternalID).toBeUndefined();
        expect(result.ErrorMessage).toContain('Duplicate email address');
    });

    it('CreateRecord fails LOUDLY on a 200 body carrying a populated errorObj even with an id', async () => {
        const c = recipientWriteConnector();
        c.Responses.push({ Status: 200, Body: createInBandErrorObjBody, Headers: {} });
        const ctx = { CompanyIntegration: ci, ContextUser: user, ObjectName: 'Recipient', Attributes: { email: 'a@example.com' } } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Invalid recipient payload');
    });

    it('UpdateRecord fails LOUDLY on a 200 body carrying an in-band error flag', async () => {
        const c = recipientWriteConnector();
        c.Responses.push({ Status: 200, Body: { editRecipientResult: { error: 1, msg: 'No such recipient' } }, Headers: {} });
        const ctx = { CompanyIntegration: ci, ContextUser: user, ObjectName: 'Recipient', ExternalID: '5555', Attributes: { first_name: 'Ada' } } as unknown as UpdateRecordContext;
        const result = await c.UpdateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('No such recipient');
    });

    it('CreateRecord surfaces a SOAP fault as a failed result', async () => {
        const c = recipientWriteConnector();
        c.Responses.push({ Status: 500, Body: faultBody, Headers: {} });
        const ctx = { CompanyIntegration: ci, ContextUser: user, ObjectName: 'Recipient', Attributes: { email: 'a@example.com' } } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('SOAP Fault');
    });

    it('UpdateRecord injects the target id under the PK field and posts the editRecipient envelope', async () => {
        const c = recipientWriteConnector();
        c.Responses.push({ Status: 200, Body: { editRecipientResult: { id: 5555 } }, Headers: {} });
        const ctx = { CompanyIntegration: ci, ContextUser: user, ObjectName: 'Recipient', ExternalID: '5555', Attributes: { first_name: 'Ada' } } as unknown as UpdateRecordContext;
        const result = await c.UpdateRecord(ctx);
        expect(c.Captured[0].body?.Action).toBe('editRecipient');
        expect(c.Captured[0].body?.Args.id).toBe('5555');
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('5555');
    });

    it('CreateRecord fails loudly when Configuration.CreateOperation is absent (no wire call)', async () => {
        const c = recipientWriteConnector({ Configuration: JSON.stringify({}) });
        const ctx = { CompanyIntegration: ci, ContextUser: user, ObjectName: 'Recipient', Attributes: {} } as unknown as CreateRecordContext;
        const result = await c.CreateRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('CreateOperation');
        expect(c.Captured).toHaveLength(0);
    });

    it('CreateRecord fails when the IO has no per-operation write columns (capability honesty)', async () => {
        const c = recipientWriteConnector({ CreateAPIPath: null, CreateMethod: null });
        const ctx = { CompanyIntegration: ci, ContextUser: user, ObjectName: 'Recipient', Attributes: {} } as unknown as CreateRecordContext;
        // The override throws "not supported"; the engine surfaces it (not a silent success).
        await expect(c.CreateRecord(ctx)).rejects.toThrow(/not supported/);
    });

    it('DeleteRecord is unsupported — no delete operation exists in the WSDL', async () => {
        const c = recipientWriteConnector();
        const ctx = { CompanyIntegration: ci, ContextUser: user, ObjectName: 'Recipient', ExternalID: '5555' } as unknown as DeleteRecordContext;
        await expect(c.DeleteRecord(ctx)).rejects.toThrow(/DeleteRecord not supported/);
    });
});
