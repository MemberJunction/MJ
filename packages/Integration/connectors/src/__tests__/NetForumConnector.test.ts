import { describe, it, expect } from 'vitest';
import type {
    RESTAuthContext,
    RESTResponse,
    CreateRecordContext,
    UpdateRecordContext,
    DeleteRecordContext,
    FetchContext,
} from '@memberjunction/integration-engine';
import type { MJIntegrationObjectEntity, MJIntegrationObjectFieldEntity, MJCompanyIntegrationEntity } from '@memberjunction/core-entities';
import type { UserInfo } from '@memberjunction/core';
import { NetForumConnector } from '../NetForumConnector.js';

/**
 * READ-ONLY / MOCKED-ONLY vitest (T4). NEVER hits a live netFORUM instance and NEVER mutates data.
 * Write-method tests assert REQUEST CONSTRUCTION + result handling against a mocked transport seam.
 *
 * The mocked SOAP responses below are SYNTHETIC, credential-free, PII-scrubbed compatibility samples
 * modeled on the xWeb ?op= wire shapes (netForumXML.asmx) + NetForumContext.md scenarios — they are
 * NOT captured from a real customer instance (no netFORUM credentials exist for this build). PII is
 * scrubbed per connector-test-conventions (names -> <scrubbed-name-N>, emails -> example+N@example.com).
 */

const AUTH_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <soap:Body>
    <AuthenticateResponse xmlns="http://www.avectra.com/2005/">
      <AuthenticateResult>eb5667ab-25ac-45c9-b831-23b43be8f194</AuthenticateResult>
    </AuthenticateResponse>
  </soap:Body>
</soap:Envelope>`;

const GETQUERY_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetQueryResponse xmlns="http://www.avectra.com/2005/">
      <GetQueryResult>
        <Results>
          <Result>
            <ind_cst_key>11111111-1111-1111-1111-111111111111</ind_cst_key>
            <ind_first_name>Ada</ind_first_name>
            <ind_last_name>&lt;scrubbed-name-1&gt;</ind_last_name>
            <eml_address>example+1@example.com</eml_address>
            <ind_change_date>2026-03-14T09:30:00</ind_change_date>
          </Result>
          <Result>
            <ind_cst_key>22222222-2222-2222-2222-222222222222</ind_cst_key>
            <ind_first_name>Grace</ind_first_name>
            <ind_last_name>&lt;scrubbed-name-2&gt;</ind_last_name>
            <eml_address>example+2@example.com</eml_address>
            <ind_change_date>2026-05-21T14:05:00</ind_change_date>
          </Result>
        </Results>
      </GetQueryResult>
    </GetQueryResponse>
  </soap:Body>
</soap:Envelope>`;

const GETQUERYDEF_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetQueryDefinitionResponse xmlns="http://www.avectra.com/2005/">
      <GetQueryDefinitionResult>
        <obj_key>33333333-3333-3333-3333-333333333333</obj_key>
        <obj_name>Individual</obj_name>
        <obj_description>Individual / member records</obj_description>
        <ListTable>
          <lst_mdt_name>co_individual</lst_mdt_name>
          <ListFromTables>
            <ListFromTable>
              <lsf_from_table>co_individual</lsf_from_table>
              <Columns>
                <Column>
                  <mdc_name>ind_cst_key</mdc_name>
                  <mdc_description>Customer Key</mdc_description>
                  <mdc_data_type>uniqueidentifier</mdc_data_type>
                  <mdc_nullable>0</mdc_nullable>
                  <mdc_table_name>co_individual</mdc_table_name>
                  <mdc_width_max>16</mdc_width_max>
                </Column>
                <Column>
                  <mdc_name>ind_first_name</mdc_name>
                  <mdc_description>First Name</mdc_description>
                  <mdc_data_type>nvarchar</mdc_data_type>
                  <mdc_nullable>1</mdc_nullable>
                  <mdc_table_name>co_individual</mdc_table_name>
                  <mdc_width_max>50</mdc_width_max>
                </Column>
                <Column>
                  <mdc_name>ind_custom_loyalty_tier</mdc_name>
                  <mdc_description>Customer-added custom field</mdc_description>
                  <mdc_data_type>nvarchar</mdc_data_type>
                  <mdc_nullable>1</mdc_nullable>
                  <mdc_table_name>co_individual</mdc_table_name>
                  <mdc_width_max>25</mdc_width_max>
                </Column>
              </Columns>
            </ListFromTable>
          </ListFromTables>
        </ListTable>
      </GetQueryDefinitionResult>
    </GetQueryDefinitionResponse>
  </soap:Body>
</soap:Envelope>`;

const INSERT_XML = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <WEBIndividualInsertResponse xmlns="http://www.avectra.com/2005/">
      <WEBIndividualInsertResult>44444444-4444-4444-4444-444444444444</WEBIndividualInsertResult>
    </WEBIndividualInsertResponse>
  </soap:Body>
</soap:Envelope>`;

/** A captured outbound SOAP request (what the connector PUT on the wire). */
interface CapturedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
}

/**
 * Test subclass: overrides the single SOAP transport seam (MakeRawHTTPRequest) to capture outbound
 * requests + return canned fixtures keyed by SOAPAction, and overrides the engine-cache accessors
 * so discovery/fetch run without a live IntegrationEngineBase. No credentials, no network.
 */
class MockedNetForumConnector extends NetForumConnector {
    public Requests: CapturedRequest[] = [];
    /** Map of SOAPAction operation suffix → canned RESTResponse. */
    public Responses: Record<string, RESTResponse> = {};
    /** The PK field name the mocked Individual object exposes. */
    public PkField = 'ind_cst_key';
    /** Per-object capability/config the mocked cache reports. */
    public Caps: { SupportsCreate: boolean; SupportsUpdate: boolean; CreateBodyKey: string | null; UpdateBodyKey: string | null; IncrementalWatermarkField: string | null; Configuration: string | null } = {
        SupportsCreate: true,
        SupportsUpdate: true,
        CreateBodyKey: 'WEBIndividualInsert',
        UpdateBodyKey: 'WEBIndividualUpdate',
        IncrementalWatermarkField: 'ind_change_date',
        Configuration: JSON.stringify({
            accessPath: { door: 'GetQuery', queryObject: 'Individual', nestingPath: [], doorArgs: { szObjectName: 'Individual', topModifier: '@TOP -1' } },
            stableOrderingKey: 'ind_cst_key',
            soapEndpoint: '/xweb/secure/netForumXML.asmx',
            writeOps: { createOp: 'WEBIndividualInsert', updateOp: 'WEBIndividualUpdate' },
        }),
    };

    protected override async MakeRawHTTPRequest(url: string, method: string, headers: Record<string, string>, body?: string): Promise<RESTResponse> {
        this.Requests.push({ url, method, headers, body });
        const action = (headers['SOAPAction'] ?? '').replace('http://www.avectra.com/2005/', '');
        const canned = this.Responses[action];
        if (canned) return canned;
        throw new Error(`MockedNetForumConnector: no canned response for SOAPAction "${action}"`);
    }

    // Engine-cache stand-ins so DiscoverFields / FetchChanges / CRUD run without IntegrationEngineBase.
    protected override GetCachedObject(_integrationID: string, objectName: string): MJIntegrationObjectEntity {
        return {
            ID: 'io-individual',
            IntegrationID: 'integ-1',
            Name: objectName,
            DisplayName: objectName,
            Description: 'Individual',
            SupportsCreate: this.Caps.SupportsCreate,
            SupportsUpdate: this.Caps.SupportsUpdate,
            CreateBodyKey: this.Caps.CreateBodyKey,
            UpdateBodyKey: this.Caps.UpdateBodyKey,
            IncrementalWatermarkField: this.Caps.IncrementalWatermarkField,
            Configuration: this.Caps.Configuration,
        } as unknown as MJIntegrationObjectEntity;
    }

    protected override GetCachedFields(_objectID: string): MJIntegrationObjectFieldEntity[] {
        return [
            { Name: this.PkField, DisplayName: 'Customer Key', Description: 'Customer Key', Type: 'String', IsPrimaryKey: true, IsRequired: true, IsReadOnly: true, IsUniqueKey: true, Status: 'Active', Sequence: 0 },
            { Name: 'ind_first_name', DisplayName: 'First Name', Description: 'First Name', Type: 'String', IsPrimaryKey: false, IsRequired: false, IsReadOnly: false, IsUniqueKey: false, Status: 'Active', Sequence: 1 },
        ] as unknown as MJIntegrationObjectFieldEntity[];
    }
}

const CI = { IntegrationID: 'integ-1', CredentialID: undefined, Configuration: JSON.stringify({ BaseURL: 'https://test.netforum.example', Username: 'u', Password: 'p' }) } as unknown as MJCompanyIntegrationEntity;
const CU = {} as UserInfo;

function makeConnector(): MockedNetForumConnector {
    const c = new MockedNetForumConnector();
    c.Responses['Authenticate'] = { Status: 200, Body: AUTH_XML, Headers: {} };
    c.Responses['GetVersion'] = { Status: 200, Body: '<GetVersionResponse xmlns="http://www.avectra.com/2005/"><GetVersionResult>2017.1</GetVersionResult></GetVersionResponse>', Headers: {} };
    c.Responses['GetQuery'] = { Status: 200, Body: GETQUERY_XML, Headers: {} };
    c.Responses['GetQueryDefinition'] = { Status: 200, Body: GETQUERYDEF_XML, Headers: {} };
    c.Responses['WEBIndividualInsert'] = { Status: 200, Body: INSERT_XML, Headers: {} };
    c.Responses['WEBIndividualUpdate'] = { Status: 200, Body: '<WEBIndividualUpdateResponse xmlns="http://www.avectra.com/2005/"><WEBIndividualUpdateResult>true</WEBIndividualUpdateResult></WEBIndividualUpdateResponse>', Headers: {} };
    return c;
}

function createCtx(objectName: string, attributes: Record<string, unknown>): CreateRecordContext {
    return { CompanyIntegration: CI, ContextUser: CU, ObjectName: objectName, Attributes: attributes } as unknown as CreateRecordContext;
}

describe('NetForumConnector — identity & capability', () => {
    const connector = new NetForumConnector();

    it('instantiates and exposes the canonical IntegrationName', () => {
        expect(connector).toBeInstanceOf(NetForumConnector);
        expect(connector.IntegrationName).toBe('NetForum Enterprise');
    });

    it('declares Create/Update; Delete held false (DeleteFacadeObject unconfirmed)', () => {
        expect(connector.SupportsCreate).toBe(true);
        expect(connector.SupportsUpdate).toBe(true);
        expect(connector.SupportsDelete).toBe(false);
    });

    it('discovery is NOT authoritative (must never deactivate Declared metadata)', () => {
        expect(connector.DiscoveryIsAuthoritative).toBe(false);
    });
});

describe('NetForumConnector — Authenticate (two-step SOAP token)', () => {
    it('POSTs a SOAP Authenticate envelope with credentials in the body and reads the token from AuthenticateResult', async () => {
        const c = makeConnector();
        // exercise auth via TestConnection (it authenticates then GetVersion)
        const r = await c.TestConnection(CI, CU);
        expect(r.Success).toBe(true);

        const authReq = c.Requests.find(req => req.headers['SOAPAction'] === 'http://www.avectra.com/2005/Authenticate');
        expect(authReq).toBeDefined();
        expect(authReq!.headers['Content-Type']).toContain('text/xml');
        // Credentials ride the SOAP BODY (userName/password), NOT an HTTP Basic/Bearer header.
        expect(authReq!.body).toContain('<Authenticate xmlns="http://www.avectra.com/2005/">');
        expect(authReq!.body).toContain('<userName>u</userName>');
        expect(authReq!.body).toContain('<password>p</password>');
        expect(authReq!.headers['Authorization']).toBeUndefined();
        // Authenticate is the bootstrap — it must NOT carry the AuthorizationToken header.
        expect(authReq!.body).not.toContain('AuthorizationToken');
    });

    it('carries the token in the SOAP AuthorizationToken header on subsequent calls (not an HTTP header)', async () => {
        const c = makeConnector();
        await c.TestConnection(CI, CU);
        const versionReq = c.Requests.find(req => req.headers['SOAPAction'] === 'http://www.avectra.com/2005/GetVersion');
        expect(versionReq).toBeDefined();
        expect(versionReq!.body).toContain('<AuthorizationToken xmlns="http://www.avectra.com/2005/"><Token>eb5667ab-25ac-45c9-b831-23b43be8f194</Token></AuthorizationToken>');
        expect(versionReq!.headers['Authorization']).toBeUndefined();
    });

    it('TestConnection surfaces auth failure as Success=false', async () => {
        const c = makeConnector();
        c.Responses['Authenticate'] = { Status: 200, Body: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><AuthenticateResponse xmlns="http://www.avectra.com/2005/"></AuthenticateResponse></soap:Body></soap:Envelope>', Headers: {} };
        const r = await c.TestConnection(CI, CU);
        expect(r.Success).toBe(false);
    });
});

describe('NetForumConnector — NormalizeResponse (SOAP/XML row parsing)', () => {
    it('unwraps GetQueryResult and parses flattened rows to full-record objects', () => {
        const c = makeConnector();
        // NormalizeResponse is protected; reach it via FetchChanges below. Here, test directly through a thin proxy.
        const rows = (c as unknown as { NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[] }).NormalizeResponse(GETQUERY_XML, null);
        expect(rows).toHaveLength(2);
        expect(rows[0]['ind_cst_key']).toBe('11111111-1111-1111-1111-111111111111');
        expect(rows[0]['ind_first_name']).toBe('Ada');
        // XML entities unescaped
        expect(rows[0]['ind_last_name']).toBe('<scrubbed-name-1>');
        expect(rows[1]['ind_change_date']).toBe('2026-05-21T14:05:00');
    });

    it('returns [] for an empty / non-XML body', () => {
        const c = makeConnector();
        const proxy = c as unknown as { NormalizeResponse(b: unknown, k: string | null): Record<string, unknown>[] };
        expect(proxy.NormalizeResponse('', null)).toEqual([]);
        expect(proxy.NormalizeResponse(null, null)).toEqual([]);
    });
});

describe('NetForumConnector — FetchChanges (GetQuery door + per-facade watermark)', () => {
    it('builds a GetQuery with @TOP -1 and full-record pass-through; PK extracted from metadata PK field', async () => {
        const c = makeConnector();
        const ctx: FetchContext = { CompanyIntegration: CI, ObjectName: 'Individual', WatermarkValue: null, BatchSize: 100, ContextUser: CU };
        const res = await c.FetchChanges(ctx);

        const req = c.Requests.find(r => r.headers['SOAPAction'] === 'http://www.avectra.com/2005/GetQuery');
        expect(req).toBeDefined();
        expect(req!.body).toContain('<szObjectName>Individual @TOP -1</szObjectName>');
        expect(req!.body).toContain('<szColumnList>*</szColumnList>');
        // no watermark → no szWhereClause
        expect(req!.body).not.toContain('szWhereClause');

        expect(res.Records).toHaveLength(2);
        expect(res.Records[0].ExternalID).toBe('11111111-1111-1111-1111-111111111111');
        expect(res.Records[0].ObjectType).toBe('Individual');
        // FULL-record pass-through: every column reaches Fields (not a narrow literal)
        expect(res.Records[0].Fields['ind_first_name']).toBe('Ada');
        expect(res.Records[0].Fields['eml_address']).toBe('example+1@example.com');
        expect(Object.keys(res.Records[0].Fields).length).toBeGreaterThanOrEqual(5);
        expect(res.HasMore).toBe(false);
        // watermark advanced to the max ind_change_date seen
        expect(res.NewWatermarkValue).toBe('2026-05-21T14:05:00');
    });

    it('on a subsequent sync applies the per-facade watermark field in szWhereClause (NOT a canonical LastModifiedDate)', async () => {
        const c = makeConnector();
        const ctx: FetchContext = { CompanyIntegration: CI, ObjectName: 'Individual', WatermarkValue: '2026-01-01T00:00:00', BatchSize: 100, ContextUser: CU };
        await c.FetchChanges(ctx);
        const req = c.Requests.find(r => r.headers['SOAPAction'] === 'http://www.avectra.com/2005/GetQuery');
        // szWhereClause value is XML-escaped in the envelope (>= → &gt;=, ' → &apos;)
        expect(req!.body).toContain('ind_change_date &gt;= &apos;2026-01-01T00:00:00&apos;');
        expect(req!.body).not.toContain('LastModifiedDate');
    });

    it('emits a ZERO_ROWS warning when GetQuery returns no rows', async () => {
        const c = makeConnector();
        c.Responses['GetQuery'] = { Status: 200, Body: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetQueryResponse xmlns="http://www.avectra.com/2005/"><GetQueryResult><Results /></GetQueryResult></GetQueryResponse></soap:Body></soap:Envelope>', Headers: {} };
        const ctx: FetchContext = { CompanyIntegration: CI, ObjectName: 'Individual', WatermarkValue: null, BatchSize: 100, ContextUser: CU };
        const res = await c.FetchChanges(ctx);
        expect(res.Records).toHaveLength(0);
        expect(res.Warnings?.[0].Code).toBe('ZERO_ROWS');
    });
});

describe('NetForumConnector — DiscoverFields (runtime GetQueryDefinition mechanism)', () => {
    it('parses the GetQueryDefinition column definition, surfacing customer-added columns', async () => {
        const c = makeConnector();
        const fields = await c.DiscoverFields(CI, 'Individual', CU);
        const names = fields.map(f => f.Name);
        expect(names).toContain('ind_cst_key');
        expect(names).toContain('ind_first_name');
        // customer-added column discovered at runtime (not in the static Declared set)
        expect(names).toContain('ind_custom_loyalty_tier');

        const custom = fields.find(f => f.Name === 'ind_custom_loyalty_tier')!;
        expect(custom.MaxLength).toBe(25);
        expect(custom.AllowsNull).toBe(true); // mdc_nullable=1

        const pk = fields.find(f => f.Name === 'ind_cst_key')!;
        expect(pk.AllowsNull).toBe(false); // mdc_nullable=0
        expect(pk.IsPrimaryKey).toBe(true); // Declared PK preserved (definition doesn't mark PK)
    });

    it('falls back to the Declared fields when GetQueryDefinition is unavailable (credential-free)', async () => {
        const c = makeConnector();
        c.Responses['GetQueryDefinition'] = { Status: 401, Body: '', Headers: {} };
        const fields = await c.DiscoverFields(CI, 'Individual', CU);
        // Declared baseline (from the mocked cache) is never lost
        expect(fields.map(f => f.Name)).toContain('ind_cst_key');
    });
});

describe('NetForumConnector — CreateRecord (facade SOAP op via metadata columns)', () => {
    it('POSTs the WEBIndividualInsert SOAP op and returns the new key via BuildCreatedResult', async () => {
        const c = makeConnector();
        const result = await c.CreateRecord(createCtx('Individual', { ind_first_name: 'Ada' }));
        const req = c.Requests.find(r => r.headers['SOAPAction'] === 'http://www.avectra.com/2005/WEBIndividualInsert');
        expect(req).toBeDefined();
        expect(req!.body).toContain('<WEBIndividualInsert xmlns="http://www.avectra.com/2005/">');
        expect(req!.body).toContain('<ind_first_name>Ada</ind_first_name>');
        // token carried in the SOAP header
        expect(req!.body).toContain('<AuthorizationToken xmlns="http://www.avectra.com/2005/">');
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('44444444-4444-4444-4444-444444444444');
    });

    it('fails loudly when a 2xx create returns no record key (silent-loss guard)', async () => {
        const c = makeConnector();
        c.Responses['WEBIndividualInsert'] = { Status: 200, Body: '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><WEBIndividualInsertResponse xmlns="http://www.avectra.com/2005/"><WEBIndividualInsertResult></WEBIndividualInsertResult></WEBIndividualInsertResponse></soap:Body></soap:Envelope>', Headers: {} };
        const result = await c.CreateRecord(createCtx('Individual', { ind_first_name: 'Ada' }));
        expect(result.Success).toBe(false);
        expect(result.ExternalID ?? '').toBe('');
    });

    it('returns a clean error when the object does not support create', async () => {
        const c = makeConnector();
        c.Caps = { ...c.Caps, SupportsCreate: false };
        const result = await c.CreateRecord(createCtx('Individual', { ind_first_name: 'Ada' }));
        expect(result.Success).toBe(false);
    });
});

describe('NetForumConnector — UpdateRecord (facade SOAP op)', () => {
    it('POSTs the WEBIndividualUpdate op with the PK + attributes', async () => {
        const c = makeConnector();
        const ctx: UpdateRecordContext = { CompanyIntegration: CI, ContextUser: CU, ObjectName: 'Individual', ExternalID: 'IND-1', Attributes: { ind_first_name: 'Grace' } } as unknown as UpdateRecordContext;
        const result = await c.UpdateRecord(ctx);
        const req = c.Requests.find(r => r.headers['SOAPAction'] === 'http://www.avectra.com/2005/WEBIndividualUpdate');
        expect(req).toBeDefined();
        expect(req!.body).toContain('<ind_cst_key>IND-1</ind_cst_key>');
        expect(req!.body).toContain('<ind_first_name>Grace</ind_first_name>');
        expect(result.Success).toBe(true);
        expect(result.ExternalID).toBe('IND-1');
    });
});

describe('NetForumConnector — DeleteRecord (unsupported)', () => {
    it('returns a clean error (no live mutation) since delete is unconfirmed', async () => {
        const c = makeConnector();
        const ctx: DeleteRecordContext = { CompanyIntegration: CI, ContextUser: CU, ObjectName: 'Individual', ExternalID: 'IND-1' } as unknown as DeleteRecordContext;
        const result = await c.DeleteRecord(ctx);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('does not support delete');
    });
});

describe('NetForumConnector — StableOrderingKey', () => {
    it('returns the IO stableOrderingKey for keyset resume', async () => {
        const c = makeConnector();
        // prime LastIntegrationID via a fetch
        await c.FetchChanges({ CompanyIntegration: CI, ObjectName: 'Individual', WatermarkValue: null, BatchSize: 100, ContextUser: CU });
        expect(c.StableOrderingKey('Individual')).toBe('ind_cst_key');
    });
});
