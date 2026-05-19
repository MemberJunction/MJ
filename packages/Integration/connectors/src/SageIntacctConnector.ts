import { RegisterClass } from '@memberjunction/global';
import { Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { IntegrationEngineBase } from '@memberjunction/integration-engine-base';
import {
    BaseIntegrationConnector,
    type ConnectionTestResult,
    type ExternalObjectSchema,
    type ExternalFieldSchema,
    type FetchContext,
    type FetchBatchResult,
    type DefaultFieldMapping,
    type DefaultIntegrationConfig,
    type ExternalRecord,
    type CRUDResult,
    type CreateRecordContext,
    type UpdateRecordContext,
    type DeleteRecordContext,
    type GetRecordContext,
    type SearchContext,
    type SearchResult,
    type ListContext,
    type ListResult,
    type IntegrationObjectInfo,
    type ActionGeneratorConfig,
} from '@memberjunction/integration-engine';

// ─── Types ────────────────────────────────────────────────────────────

/** Connection configuration parsed from CompanyIntegration credentials */
export interface SageIntacctConnectionConfig {
    /** Sage Intacct Company ID */
    CompanyId: string;
    /** Web Services Sender ID (from Marketplace subscription) */
    SenderId: string;
    /** Web Services Sender Password */
    SenderPassword: string;
    /** User ID for session-based authentication */
    UserId: string;
    /** User password */
    UserPassword: string;
    /** Optional entity ID for multi-entity shared companies */
    EntityId?: string;

    // ── Optional performance overrides ──────────────────────────
    /** Maximum retries for rate-limited or failed requests. Default: 3 */
    MaxRetries?: number;
    /** HTTP request timeout in milliseconds. Default: 30000 */
    RequestTimeoutMs?: number;
    /** Minimum milliseconds between API requests. Default: 200 */
    MinRequestIntervalMs?: number;
}

/** Internal session state for Sage Intacct API */
interface SageIntacctSession {
    /** Session ID returned by getAPISession */
    SessionId: string;
    /** API endpoint URL returned by the session */
    Endpoint: string;
    /** When the session was created */
    CreatedAt: number;
    /** Full config for reference */
    Config: SageIntacctConnectionConfig;
}

/** Sage Intacct field definition from inspect */
interface IntacctFieldDef {
    Name: string;
    Label: string;
    DataType: string;
    IsRequired: boolean;
    IsReadOnly: boolean;
    IsCustom: boolean;
    /** Maximum string length when SI reports it. */
    MaxLength?: number | null;
    /** Numeric precision when SI reports it. */
    Precision?: number | null;
    /** Numeric scale when SI reports it. */
    Scale?: number | null;
    /** Default value expression when SI reports it. */
    DefaultValue?: string | null;
    /** Reference target object name (for FK fields). */
    References?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────

/** Sage Intacct XML Gateway endpoint */
const INTACCT_API_ENDPOINT = 'https://api.intacct.com/ia/xml/xmlgw.phtml';

/** Control ID prefix for XML requests */
const CONTROL_ID_PREFIX = 'mj-intacct';

/** DTD version for Sage Intacct API */
const DTD_VERSION = '3.0';

/** Default maximum retries */
const DEFAULT_MAX_RETRIES = 3;

/** Default HTTP request timeout in milliseconds */
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/** Default minimum milliseconds between API requests */
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 200;

/** Default page size for readByQuery — SI's documented max. */
// Direct probing against the live tenant proved that pageSize=1000 (and
// even 2000) is accepted; the previously-observed DL02000001 errors were
// from SQL-style ORDER BY in the WHERE clause, NOT from large pageSizes.
// Critically, SI's readByQuery does NOT scan in PK-ascending order — at
// pageSize=100 against APBILL it returned RECORDNOs 19..1354, silently
// dropping 12..18 because those weren't in SI's first 100 of natural
// order. PK-cursor advancement (PK > maxOfBatch) then made the missing
// records permanently invisible. Using SI's documented maximum minimizes
// the chance any object exceeds a single page; for the few that do (e.g.
// GLBATCH with thousands of rows) SI provides a server-side resultId
// that maintains scan consistency across readMore calls.
const DEFAULT_PAGE_SIZE = 1000;

/** Session lifetime — Sage Intacct sessions last ~10 minutes; refresh at 8 min */
const SESSION_LIFETIME_MS = 8 * 60 * 1000;

// ─── Range-chunked pagination constants ───────────────────────────────
//
// SI's readByQuery cannot guarantee PK-ascending scan order, and SI rejects
// both `<orderby>` (XSD parse error) and SQL-style `ORDER BY` (DL02000001).
// Without ordering, the only way to GUARANTEE complete record coverage for
// numeric-PK objects is to walk RECORDNO in fixed numeric ranges:
//
//   chunk 0: RECORDNO ∈ [0, CHUNK)
//   chunk 1: RECORDNO ∈ [CHUNK, 2*CHUNK)
//   chunk 2: RECORDNO ∈ [2*CHUNK, 3*CHUNK)
//   ...
//   stop when N consecutive chunks return zero records
//
// Within a chunk, if the response is a full page we know the chunk is too
// dense (more records exist than we can safely retrieve in one page given
// SI's scattered ordering). We HALVE the chunk and retry — recursive
// subdivision down to a hard floor.
//
// Initial chunk size: 5000 RECORDNOs. For typical SI density (~0.1
// records per RECORDNO unit, observed on APBILL: 148 records over 1342
// units = density 0.11), a 5000 chunk holds ~550 records, well under
// page-size. For dense objects (density up to 1.0), halving once gets us
// to 2500 then 1250 (still fits in page-size=1000? No — needs another
// halve to 625). The floor MIN_CHUNK protects against pathological
// density (e.g. composite-PK objects with >1 record per RECORDNO unit,
// which shouldn't exist for SI but is defensive).

/** Initial RECORDNO range size when starting range-chunked walk. */
const RANGE_INITIAL_CHUNK = 5000;

/** Hard floor on chunk size during recursive halving. Throws if a chunk
 *  at this size still returns a full page (signals the impossible case
 *  of >pageSize records in <RANGE_MIN_CHUNK RECORDNOs). */
const RANGE_MIN_CHUNK = 100;

/** Starting probe value for upper-bound discovery. The first probe asks SI
 *  whether any record has RECORDNO >= this value. Cheap to start small. */
const RANGE_DISCOVERY_INITIAL_PROBE = 10000;

/** Multiplier applied each iteration when the previous probe DID find
 *  records. Geometric growth → log_RANGE_DISCOVERY_GROWTH(maxRecordno)
 *  HTTP calls upfront, bounded at log10(SANITY_CAP) ≤ 11 calls. */
const RANGE_DISCOVERY_GROWTH = 10;

/** Hard sanity cap on max RECORDNO probe. If exponential probing exceeds
 *  this without finding an empty range, throws — guards against runaway
 *  loops when SI behaves pathologically. 100 billion is well beyond any
 *  plausible real-world tenant's RECORDNO assignment. */
const RANGE_DISCOVERY_SANITY_CAP = 100_000_000_000;

/** Number of attempts for the discovery probe before giving up. Each
 *  retry uses exponential backoff. A persistent failure THROWS rather
 *  than silently treating the transient error as "no records exist past
 *  this point" — fail-stop semantics over silent under-coverage. */
const RANGE_DISCOVERY_MAX_ATTEMPTS = 3;

/** Backoff between discovery probe retries. Doubled on each retry. */
const RANGE_DISCOVERY_RETRY_BACKOFF_MS = 500;

/** Sub-range verification confirms each "completed" chunk's record count
 *  by independently querying its two halves and checking the sum matches.
 *  This catches SI inconsistencies where a chunk query reports "complete"
 *  with N records while sub-ranges sum to a different value. Skipped for
 *  chunks already at minimum size since further splitting isn't possible. */
const RANGE_VERIFICATION_ENABLED = true;

/** Cursor prefix for range-chunked walks. Format:
 *  `RANGE:<lo>:<chunkSize>:<upperBound>:<maxWatermarkB64>`
 *  Watermark is base64-encoded to allow `:` inside it. */
const RANGE_CURSOR_PREFIX = 'RANGE:';

/** State carried in the cursor between FetchChanges calls during a
 *  range-chunked walk. */
interface RangeCursorState {
    /** Lower bound of the current chunk (inclusive). */
    lo: number;
    /** Width of the current chunk in RECORDNO units. May shrink after a
     *  dense-chunk halving event. Grows back to RANGE_INITIAL_CHUNK after
     *  a successful (non-dense) chunk. */
    chunkSize: number;
    /** Upper bound on RECORDNO discovered via exponential probe at the
     *  start of the walk. The walk terminates when `lo >= upperBound` —
     *  no empty-chunk heuristic, no doubt about missing records past this. */
    upperBound: number;
    /** Max WHENMODIFIED seen across all chunks so far. Returned as
     *  NewWatermarkValue only on the final batch. */
    maxWatermark?: string;
}

/**
 * Sage Intacct objects that exist only as children of a parent record. They
 * cannot be queried directly via `readByQuery` — SI returns them inline as
 * <line> elements within their parent's response. Mirroring them as
 * standalone tables produces empty result sets and confusing sync runs, so
 * we hide them from the picker and surface a clear error if a caller still
 * tries to fetch them.
 *
 * Map: child object name → parent object name. Match is case-insensitive.
 * Add entries here as more parent/child families come up. Patterns:
 *   - `*Detail` / `*Details` — line-item children of transactions
 *   - `*Line` — same family, older naming
 *   - `*Item` — line items on POs/SOs/Invoices
 */
const SAGE_INTACCT_CHILD_OBJECTS: Record<string, string> = {
    // Existing items / line-level entries
    'APBILLITEM': 'APBILL',
    'APBILLITEMS': 'APBILL',
    'ARINVOICEITEM': 'ARINVOICE',
    'ARINVOICEITEMS': 'ARINVOICE',
    'ARPAYMENTITEM': 'ARPAYMENT',
    'ARPAYMENTITEMS': 'ARPAYMENT',
    'APPAYMENTITEM': 'APPAYMENT',
    'APPAYMENTITEMS': 'APPAYMENT',
    'GLBATCHENTRY': 'GLBATCH',
    'GLBATCHENTRIES': 'GLBATCH',
    'JOURNALENTRYITEM': 'GLBATCH',
    'PURCHASINGDOCUMENTENTRY': 'PURCHASINGDOCUMENT',
    'SODOCUMENTENTRY': 'SODOCUMENT',
    'STOREORDERDETAIL': 'STOREORDER',
    'STOREORDERDETAILS': 'STOREORDER',
    // Detail/line tables observed in production picker as silent skips —
    // these never have standalone schema; SI returns them inline with
    // the parent record. Mapping them to parents removes them from
    // pickers and prevents "0 fields discovered" failures at apply time.
    'APBILLDETAIL': 'APBILL',
    'APPAYMENTDETAIL': 'APPAYMENT',
    'APDETAIL': 'APBILL',
    'ARDETAIL': 'ARINVOICE',
    'ARADJUSTMENTDETAIL': 'ARADJUSTMENT',
    'ARINVOICEPAYMENT': 'ARINVOICE',
    'ARRETAINAGERELEASEENTRY': 'ARRETAINAGERELEASE',
    'APRETAINAGERELEASEENTRY': 'APRETAINAGERELEASE',
    'APBILLPAYMENT': 'APBILL',
    'APPOSTEDADVANCE': 'APPAYMENT',
    'ARPOSTEDOVERPAYMENT': 'ARPAYMENT',
    'ALLOCATIONENTRY': 'ALLOCATION',
    'CONTRACTBILLINGSCHEDULEENTRY': 'CONTRACTBILLINGSCHEDULE',
    'CONTRACTREVENUESCHEDULEENTRY': 'CONTRACTREVENUESCHEDULE',
    'CONTRACTREVENUETEMPLATEENTRY': 'CONTRACTREVENUETEMPLATE',
    'CONTRACTBILLINGTEMPLATEENTRY': 'CONTRACTBILLINGTEMPLATE',
    'CONTRACTEXPENSESCHEDULEENTRY': 'CONTRACTEXPENSE',
    'CONTRACTNEGATIVEBILLINGENTRY': 'CONTRACTNEGATIVEBILLING',
    'CONTRACTUSAGEBILLING': 'CONTRACTUSAGE',
    'CONTRACTMEABUNDLEENTRY': 'CONTRACT',
    'CHANGEREQUESTENTRY': 'CHANGEREQUEST',
    'TIMESHEETENTRY': 'TIMESHEET',
    // Audit/history line tables — children of audit records
    'AUDITHISTORY': 'AUDITRECORD',
    'COSTHISTORY': 'ITEM',
    'LANDEDCOSTHISTORY': 'PURCHASINGDOCUMENT',
    'BUYTOORDERHISTORY': 'PURCHASINGDOCUMENT',
    'DROPSHIPHISTORY': 'SODOCUMENT',
    // System/ID-mapping helpers exposed but not standalone-syncable
    'ROLEUSERS': 'ROLE',
    'ROLEGROUPS': 'ROLE',
    'ROLEPOLICYASSIGNMENT': 'ROLE',
    'PARTNERFIELDMAP': 'PARTNER',
    'COMPLIANCETASKITEM': 'CONTRACTCOMPLIANCETASKITEM',
    'CONTRACTCOMPLIANCETASKITEM': 'CONTRACT',
    'CONTRACTCOMPLIANCENOTE': 'CONTRACT',
    'VENDORENTITYCONTACTS': 'VENDOR',
};

/** Sage Intacct data type to generic type mapping */
const INTACCT_TYPE_MAP: Record<string, string> = {
    'string': 'string',
    'varchar': 'string',
    'text': 'text',
    'integer': 'integer',
    'int': 'integer',
    'decimal': 'decimal',
    'number': 'decimal',
    'float': 'decimal',
    'double': 'decimal',
    'currency': 'decimal',
    'boolean': 'boolean',
    'date': 'date',
    'datetime': 'datetime',
    'timestamp': 'datetime',
    'percent': 'decimal',
};

// ─── Sage Intacct Object Metadata for Action Generation ───────────────

const SAGE_INTACCT_OBJECTS: IntegrationObjectInfo[] = [
    {
        Name: 'CUSTOMER', DisplayName: 'Customer',
        Description: 'A customer record in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique customer identifier' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer name' },
            { Name: 'DISPLAYCONTACT.EMAIL1', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address' },
            { Name: 'DISPLAYCONTACT.PHONE1', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone number' },
            { Name: 'DISPLAYCONTACT.MAILADDRESS.ADDRESS1', DisplayName: 'Address Line 1', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Mailing address line 1' },
            { Name: 'DISPLAYCONTACT.MAILADDRESS.CITY', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'DISPLAYCONTACT.MAILADDRESS.STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State/province' },
            { Name: 'DISPLAYCONTACT.MAILADDRESS.ZIP', DisplayName: 'Zip Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Postal/zip code' },
            { Name: 'DISPLAYCONTACT.MAILADDRESS.COUNTRY', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer status (active/inactive)' },
            { Name: 'TOTALDUE', DisplayName: 'Total Due', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total amount due' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'VENDOR', DisplayName: 'Vendor',
        Description: 'A vendor/supplier record in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'VENDORID', DisplayName: 'Vendor ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique vendor identifier' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor name' },
            { Name: 'DISPLAYCONTACT.EMAIL1', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary email address' },
            { Name: 'DISPLAYCONTACT.PHONE1', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Primary phone number' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor status' },
            { Name: 'VENDTYPE', DisplayName: 'Vendor Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor type category' },
            { Name: 'TOTALDUE', DisplayName: 'Total Due', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total amount due' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'GLACCOUNT', DisplayName: 'GL Account',
        Description: 'A General Ledger account in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'ACCOUNTNO', DisplayName: 'Account Number', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'GL account number' },
            { Name: 'TITLE', DisplayName: 'Title', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account title' },
            { Name: 'ACCOUNTTYPE', DisplayName: 'Account Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account type (e.g., balancesheet, incomestatement)' },
            { Name: 'NORMALBALANCE', DisplayName: 'Normal Balance', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Normal balance (debit/credit)' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account status' },
            { Name: 'CATEGORY', DisplayName: 'Category', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account category' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'APBILL', DisplayName: 'AP Bill',
        Description: 'An Accounts Payable bill in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'System-assigned record number' },
            { Name: 'VENDORID', DisplayName: 'Vendor ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor ID' },
            { Name: 'VENDORNAME', DisplayName: 'Vendor Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Vendor name' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Bill date' },
            { Name: 'WHENDUE', DisplayName: 'Due Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment due date' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total bill amount' },
            { Name: 'TOTALDUE', DisplayName: 'Total Due', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Amount remaining' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Bill state (Draft, Pending, etc.)' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Bill description/memo' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'ARINVOICE', DisplayName: 'AR Invoice',
        Description: 'An Accounts Receivable invoice in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'integer', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'System-assigned record number' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer ID' },
            { Name: 'CUSTOMERNAME', DisplayName: 'Customer Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Customer name' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Invoice date' },
            { Name: 'WHENDUE', DisplayName: 'Due Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment due date' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total invoice amount' },
            { Name: 'TOTALDUE', DisplayName: 'Total Due', Type: 'decimal', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Amount remaining' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Invoice state' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Invoice description/memo' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'PROJECT', DisplayName: 'Project',
        Description: 'A project in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'PROJECTID', DisplayName: 'Project ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique project identifier' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project name' },
            { Name: 'PROJECTCATEGORY', DisplayName: 'Category', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project category' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project status' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Associated customer ID' },
            { Name: 'BEGINDATE', DisplayName: 'Begin Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project start date' },
            { Name: 'ENDDATE', DisplayName: 'End Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project end date' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'EMPLOYEE', DisplayName: 'Employee',
        Description: 'An employee record in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'EMPLOYEEID', DisplayName: 'Employee ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique employee identifier' },
            { Name: 'PERSONALINFO.CONTACTNAME', DisplayName: 'Contact Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employee contact name' },
            { Name: 'TITLE', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Job title' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employee status' },
            { Name: 'DEPARTMENTID', DisplayName: 'Department ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department identifier' },
            { Name: 'LOCATIONID', DisplayName: 'Location ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Location identifier' },
            { Name: 'STARTDATE', DisplayName: 'Start Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employment start date' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'DEPARTMENT', DisplayName: 'Department',
        Description: 'A department in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'DEPARTMENTID', DisplayName: 'Department ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique department identifier' },
            { Name: 'TITLE', DisplayName: 'Title', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department title' },
            { Name: 'PARENTID', DisplayName: 'Parent ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent department ID' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
    {
        Name: 'CLASS', DisplayName: 'Class',
        Description: 'A class dimension in Sage Intacct for categorizing transactions', SupportsWrite: true,
        Fields: [
            { Name: 'CLASSID', DisplayName: 'Class ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Unique class identifier' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Class name' },
            { Name: 'PARENTID', DisplayName: 'Parent ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent class ID' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Class status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modified timestamp' },
        ],
    },
];

/** Primary key field name for each known Sage Intacct object.
 *  This is a fallback used only when the IntegrationObject metadata does NOT
 *  carry a DefaultQueryParams.pk_field hint. Prefer the metadata over this map. */
const OBJECT_PK_MAP: Record<string, string> = {
    CUSTOMER: 'CUSTOMERID',
    VENDOR: 'VENDORID',
    GLACCOUNT: 'ACCOUNTNO',
    ACCOUNT: 'ACCOUNTNO',
    APBILL: 'RECORDNO',
    ARINVOICE: 'RECORDNO',
    PROJECT: 'PROJECTID',
    EMPLOYEE: 'EMPLOYEEID',
    DEPARTMENT: 'DEPARTMENTID',
    CLASS: 'CLASSID',
    LOCATION: 'LOCATIONID',
    ITEM: 'ITEMID',
    CONTACT: 'CONTACTNAME',
    WAREHOUSE: 'WAREHOUSEID',
    USER: 'LOGIN',
    CURRENCY: 'CURRENCYCODE',
    TASK: 'TASKID',
    CONTRACT: 'CONTRACTID',
};

// ─── Connector Implementation ─────────────────────────────────────────

/**
 * Connector for the Sage Intacct Web Services API (XML over HTTPS).
 *
 * Extends BaseIntegrationConnector directly (not BaseRESTIntegrationConnector)
 * because Sage Intacct uses XML request/response bodies over a single gateway
 * endpoint, not standard REST resource URLs.
 *
 * Auth flow:
 *   1. POST XML to https://api.intacct.com/ia/xml/xmlgw.phtml
 *   2. The request includes Sender ID/Password (app credentials) and User ID/Password
 *   3. A getAPISession function returns a sessionid + endpoint
 *   4. Subsequent requests use the sessionid for authentication
 *
 * API operations:
 *   - readByQuery: Query records with SQL-like filter expressions
 *   - readMore: Fetch next page of a paginated result set
 *   - read: Get a single record by key
 *   - create / update / delete: Standard CRUD on objects
 *   - inspect: Discover object fields and types
 *
 * Pagination:
 *   - readByQuery returns a resultId + numRemaining
 *   - readMore uses the resultId to fetch subsequent pages
 */
@RegisterClass(BaseIntegrationConnector, 'SageIntacctConnector')
export class SageIntacctConnector extends BaseIntegrationConnector {

    // ── Session Cache ────────────────────────────────────────────────

    private cachedSession: SageIntacctSession | null = null;

    /** Timestamp of the last API request, used for throttling */
    private lastRequestTime = 0;

    // ── Capability Getters ───────────────────────────────────────────

    public override get SupportsCreate(): boolean { return true; }
    public override get SupportsUpdate(): boolean { return true; }
    public override get SupportsDelete(): boolean { return true; }
    public override get SupportsSearch(): boolean { return true; }
    public override get SupportsListing(): boolean { return true; }

    public override get IntegrationName(): string { return 'Sage Intacct'; }

    // ── Action Generation ────────────────────────────────────────────

    public override GetIntegrationObjects(): IntegrationObjectInfo[] {
        return SAGE_INTACCT_OBJECTS;
    }

    public override GetActionGeneratorConfig(): ActionGeneratorConfig | null {
        const objects = this.GetIntegrationObjects();
        if (objects.length === 0) return null;

        return {
            IntegrationName: 'Sage Intacct',
            CategoryName: 'Sage Intacct',
            IconClass: 'fa-solid fa-file-invoice-dollar',
            Objects: objects,
            IncludeSearch: true,
            IncludeList: true,
            CategoryDescription: 'Sage Intacct accounting and ERP integration actions',
            ParentCategoryName: 'Business Apps',
        };
    }

    // ── Default Configuration ────────────────────────────────────────

    public override GetDefaultConfiguration(): DefaultIntegrationConfig | null {
        return {
            DefaultSchemaName: 'SageIntacct',
            DefaultObjects: [
                {
                    SourceObjectName: 'CUSTOMER',
                    TargetTableName: 'SageIntacct_Customer',
                    TargetEntityName: 'Sage Intacct Customers',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('CUSTOMER', 'Contacts'),
                },
                {
                    SourceObjectName: 'VENDOR',
                    TargetTableName: 'SageIntacct_Vendor',
                    TargetEntityName: 'Sage Intacct Vendors',
                    SyncEnabled: true,
                    FieldMappings: this.GetDefaultFieldMappings('VENDOR', 'Companies'),
                },
                {
                    SourceObjectName: 'GLACCOUNT',
                    TargetTableName: 'SageIntacct_GLAccount',
                    TargetEntityName: 'Sage Intacct GL Accounts',
                    SyncEnabled: true,
                    FieldMappings: [],
                },
            ],
        };
    }

    public override GetDefaultFieldMappings(objectName: string, _entityName: string): DefaultFieldMapping[] {
        switch (objectName) {
            case 'CUSTOMER':
                return [
                    { SourceFieldName: 'CUSTOMERID', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'NAME', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'DISPLAYCONTACT.EMAIL1', DestinationFieldName: 'Email' },
                    { SourceFieldName: 'DISPLAYCONTACT.PHONE1', DestinationFieldName: 'Phone' },
                    { SourceFieldName: 'STATUS', DestinationFieldName: 'Status' },
                ];
            case 'VENDOR':
                return [
                    { SourceFieldName: 'VENDORID', DestinationFieldName: 'ExternalID', IsKeyField: true },
                    { SourceFieldName: 'NAME', DestinationFieldName: 'Name' },
                    { SourceFieldName: 'DISPLAYCONTACT.EMAIL1', DestinationFieldName: 'Email' },
                    { SourceFieldName: 'DISPLAYCONTACT.PHONE1', DestinationFieldName: 'Phone' },
                    { SourceFieldName: 'STATUS', DestinationFieldName: 'Status' },
                ];
            default:
                return [];
        }
    }

    // ─── TestConnection ──────────────────────────────────────────────

    public async TestConnection(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ConnectionTestResult> {
        try {
            const session = await this.GetSession(companyIntegration, contextUser, true);
            return {
                Success: true,
                Message: `Successfully connected to Sage Intacct (Company: ${session.Config.CompanyId})`,
                ServerVersion: `Sage Intacct Web Services API ${DTD_VERSION}`,
            };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { Success: false, Message: `Connection failed: ${message}` };
        }
    }

    // ─── Discovery ───────────────────────────────────────────────────

    /**
     * Discovers available objects using the inspect API function with '*' wildcard.
     * Falls back to the known object list if the API call fails.
     */
    public async DiscoverObjects(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<ExternalObjectSchema[]> {
        // Strategy: union the curated static catalog with whatever SI's
        // dynamic `inspect *` endpoint returns. The dynamic list usually
        // contains many object names — some are valid API codes (CUSTOMER,
        // VENDOR, ARINVOICE, GLACCOUNT...) that the per-object describe
        // endpoint accepts cleanly, others are human display names ("AP
        // bill", "Work queue") that get rejected at describe time. Rather
        // than guess which is which up-front, we present everything and let
        // the describe phase weed out invalid names with logged warnings.
        // The curated catalog is unioned in so the picker always shows the
        // well-known objects even if dynamic discovery fails outright (e.g.
        // auth/network problem on the inspect call).
        const merged = new Map<string, ExternalObjectSchema>();

        // Seed with curated catalog — these have known-good API codes and
        // rich field metadata. They win on collisions.
        for (const obj of SAGE_INTACCT_OBJECTS) {
            merged.set(obj.Name, {
                Name: obj.Name,
                Label: obj.DisplayName,
                Description: obj.Description,
                SupportsIncrementalSync: true,
                SupportsWrite: obj.SupportsWrite,
            });
        }

        // Layer dynamic results on top — anything new gets added; anything
        // that collides with a curated entry is ignored (curated wins).
        try {
            const session = await this.GetSession(companyIntegration, contextUser);
            const xml = this.BuildInspectRequest(session, '*');
            const response = await this.SendXMLRequest(session, xml);
            const candidates = this.ParseInspectObjectsResponse(response);

            // Per-object probe: candidates from inspect-* are a mix of real
            // API codes and display-name-derived guesses. The only reliable
            // way to know which actually exist as API objects is to probe
            // each one with `inspect <name>` and keep the ones SI accepts.
            // Done in parallel (8-way) so 600+ probes don't sequence
            // serially. Curated names are skipped (already known good).
            const toProbe = candidates.filter(n => !merged.has(n));
            console.log(`[SageIntacct] DiscoverObjects: probing ${toProbe.length} candidate object names...`);
            const validatedNames = await this.ProbeObjectNames(session, toProbe);
            console.log(`[SageIntacct] DiscoverObjects: ${validatedNames.length}/${toProbe.length} candidates validated as real API objects`);

            for (const name of validatedNames) {
                if (!merged.has(name)) {
                    merged.set(name, {
                        Name: name,
                        Label: this.FormatLabel(name),
                        SupportsIncrementalSync: true,
                        SupportsWrite: true,
                    });
                }
            }
        } catch (err) {
            // Dynamic discovery failed — fall through with curated set only.
            // Logged so operators know the picker is showing the smaller set.
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`[SageIntacct] DiscoverObjects: dynamic inspect failed (${msg}); returning curated catalog only`);
        }

        // Filter out known child-only objects — they can't be fetched
        // independently from SI's API. Surfacing them in the picker leads
        // users to select objects that always come back empty.
        const filtered: ExternalObjectSchema[] = [];
        const skippedChildren: string[] = [];
        for (const obj of merged.values()) {
            const parent = SAGE_INTACCT_CHILD_OBJECTS[obj.Name.toUpperCase()];
            if (parent) {
                skippedChildren.push(`${obj.Name} (child of ${parent})`);
                continue;
            }
            filtered.push(obj);
        }
        if (skippedChildren.length > 0) {
            console.log(
                `[SageIntacct] DiscoverObjects: filtered ${skippedChildren.length} known child-only objects from picker — ` +
                `they sync inline via their parent records.`
            );
        }
        return filtered;
    }

    /**
     * Probes a list of candidate object names against SI's per-object
     * `inspect <name>` endpoint to determine which are real API objects vs
     * display-name labels with no API equivalent. Runs in parallel with a
     * bounded worker pool so the 600+ probe round-trips don't serialize.
     *
     * Returns only the names that responded successfully — failures (including
     * "Object type X not found") are silently dropped. This is intentional:
     * the goal is to populate the picker with names the user can actually
     * sync, not surface every SI-side error.
     */
    private async ProbeObjectNames(
        session: SageIntacctSession,
        candidates: string[]
    ): Promise<string[]> {
        if (candidates.length === 0) return [];

        const concurrency = 8;
        const validated: string[] = [];
        let cursor = 0;
        let zeroFieldCount = 0;
        const errorSamples: string[] = [];
        let totalErrors = 0;

        const worker = async (): Promise<void> => {
            while (true) {
                const idx = cursor++;
                if (idx >= candidates.length) return;
                const name = candidates[idx];
                try {
                    const xml = this.BuildInspectRequest(session, name);
                    const response = await this.SendXMLRequest(session, xml);
                    // Successful response = real API object. Empty inspect
                    // fields don't mean it's not syncable — many SI objects
                    // (especially platform/contract/role types) return no
                    // schema via inspect but DO return data via readByQuery.
                    // The earlier "require ≥1 field" check was too strict
                    // and silently dropped 242 real objects per probe pass.
                    this.CheckForErrors(response);
                    validated.push(name);
                    if (this.ParseInspectFieldsResponse(response).length === 0) {
                        zeroFieldCount++;
                    }
                } catch (err) {
                    totalErrors++;
                    if (errorSamples.length < 3) {
                        const msg = err instanceof Error ? err.message : String(err);
                        errorSamples.push(`"${name}": ${msg.slice(0, 200)}`);
                    }
                }
            }
        };

        await Promise.all(Array.from({ length: concurrency }, () => worker()));
        console.log(
            `[SageIntacct] ProbeObjectNames: ${validated.length} validated, ` +
            `${zeroFieldCount} returned no fields, ${totalErrors} errored`
        );
        if (errorSamples.length > 0) {
            console.log(`[SageIntacct] ProbeObjectNames sample errors:\n  ${errorSamples.join('\n  ')}`);
        }
        return validated;
    }

    /**
     * Discovers fields on a specific object by combining the `inspect` API
     * call (standard fields) with a `lookup` call (which exposes custom fields
     * via the ISCUSTOM flag). Custom fields are returned with IsCustom=true so
     * the sync engine can flag them in IntegrationObjectField metadata.
     */
    public async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        const session = await this.GetSession(companyIntegration, contextUser);
        const inspectXml = this.BuildInspectRequest(session, objectName);
        const inspectResponse = await this.SendXMLRequest(session, inspectXml);
        let standardFields = this.ParseInspectFieldsResponse(inspectResponse);

        // Always pull lookup. Two reasons: (1) it's the source of ISCUSTOM
        // flags for custom fields, (2) it's the deterministic fallback when
        // inspect returns an empty <Fields/> (common for SI platform/role/
        // contract-template objects whose schema isn't surfaced via inspect
        // but IS via lookup). Same shape, different SI metadata API surface.
        let lookupFields: IntacctFieldDef[] = [];
        let customFieldNames: Set<string> = new Set();
        try {
            const lookupXml = this.BuildLookupRequest(session, objectName);
            const lookupResponse = await this.SendXMLRequest(session, lookupXml);
            lookupFields = this.ParseLookupFieldsResponse(lookupResponse);
            for (const f of lookupFields) {
                if (f.IsCustom) customFieldNames.add(f.Name);
            }
        } catch {
            // Lookup not supported for this object — proceed with inspect only.
        }

        // Lookup-as-fallback: when inspect returned no fields but lookup did,
        // promote lookup as the primary field source. Lookup-derived fields
        // are deterministic SI metadata, no inference.
        if (standardFields.length === 0 && lookupFields.length > 0) {
            console.log(`[SageIntacct] DiscoverFields: ${objectName} — inspect returned 0 fields, using ${lookupFields.length} fields from lookup API`);
            standardFields = lookupFields;
        }

        const pkField = this.GetPrimaryKeyField(objectName, companyIntegration.IntegrationID);

        // Curated catalog overlay: when SAGE_INTACCT_OBJECTS has a record for
        // this object, build a quick lookup of curated field metadata. Where
        // inspect is missing data (no MaxLength, no description, etc.) we fill
        // from the curated entry. Live inspect data still wins on direct
        // conflicts — curation is a supplement, not a source of truth.
        const curatedObj = SAGE_INTACCT_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
        const curatedFieldMap = new Map<string, IntegrationObjectInfo['Fields'][number]>();
        if (curatedObj) {
            for (const cf of curatedObj.Fields) {
                curatedFieldMap.set(cf.Name.toLowerCase(), cf);
            }
        }

        const result: ExternalFieldSchema[] = standardFields.map(f => {
            const isCustom = customFieldNames.has(f.Name) || f.IsCustom;
            if (isCustom) {
                console.debug(`[SageIntacct] Custom field detected on ${objectName}: ${f.Name}`);
            }
            const curated = curatedFieldMap.get(f.Name.toLowerCase());
            return {
                Name: f.Name,
                Label: f.Label || curated?.DisplayName || this.FormatLabel(f.Name),
                Description: curated?.Description,
                DataType: INTACCT_TYPE_MAP[f.DataType.toLowerCase()] ?? curated?.Type ?? 'string',
                IsRequired: f.IsRequired || curated?.IsRequired === true,
                IsUniqueKey: f.Name === pkField || curated?.IsPrimaryKey === true,
                IsReadOnly: f.IsReadOnly || curated?.IsReadOnly === true,
                IsForeignKey: !!f.References,
                ForeignKeyTarget: f.References ?? null,
                MaxLength: f.MaxLength ?? null,
                Precision: f.Precision ?? null,
                Scale: f.Scale ?? null,
                DefaultValue: f.DefaultValue ?? null,
            };
        });

        // Append curated fields that inspect didn't return — happens when SI
        // returns a partial field list for legacy objects, or when curation
        // covers a known field that the per-tenant SI instance omits.
        const inspectNames = new Set(result.map(f => f.Name.toLowerCase()));
        if (curatedObj) {
            for (const cf of curatedObj.Fields) {
                if (!inspectNames.has(cf.Name.toLowerCase())) {
                    result.push({
                        Name: cf.Name,
                        Label: cf.DisplayName ?? cf.Name,
                        Description: cf.Description,
                        DataType: cf.Type ?? 'string',
                        IsRequired: cf.IsRequired === true,
                        IsUniqueKey: cf.IsPrimaryKey === true,
                        IsReadOnly: cf.IsReadOnly === true,
                    });
                    inspectNames.add(cf.Name.toLowerCase());
                }
            }
        }

        // Engine cache fallback. SI's per-object inspect frequently returns
        // empty <Fields/> for platform/contract/role objects that ARE real
        // and ARE syncable via readByQuery — they just don't expose schema.
        // For those, hydrate constraints from previously-persisted
        // IntegrationObjectField rows so the user's prior describe survives
        // a transient SI gap. Live > curated > IOF cache (precedence order).
        const knownNames = new Set(result.map(f => f.Name.toLowerCase()));
        try {
            const integrationObj = IntegrationEngineBase.Instance.GetIntegrationObject(
                companyIntegration.IntegrationID, objectName
            );
            if (integrationObj) {
                const cachedFields = IntegrationEngineBase.Instance.GetIntegrationObjectFields(integrationObj.ID);
                let appended = 0;
                for (const cf of cachedFields) {
                    if (cf.Status !== 'Active') continue;
                    if (knownNames.has(cf.Name.toLowerCase())) continue;
                    result.push({
                        Name: cf.Name,
                        Label: cf.DisplayName ?? cf.Name,
                        Description: cf.Description ?? undefined,
                        DataType: cf.Type ?? 'string',
                        IsRequired: !!cf.IsRequired,
                        IsUniqueKey: !!cf.IsPrimaryKey,
                        IsReadOnly: !!cf.IsReadOnly,
                        MaxLength: cf.Length ?? null,
                        Precision: cf.Precision ?? null,
                        Scale: cf.Scale ?? null,
                        DefaultValue: cf.DefaultValue ?? null,
                    });
                    knownNames.add(cf.Name.toLowerCase());
                    appended++;
                }
                if (appended > 0) {
                    console.log(`[SageIntacct] DiscoverFields: hydrated ${appended} fields on ${objectName} from IntegrationObjectField cache (live inspect was missing them)`);
                }
            }
        } catch (err) {
            // Engine may not be configured; live result alone is fine.
            console.warn(`[SageIntacct] DiscoverFields: IOF cache fallback unavailable for ${objectName}: ${err instanceof Error ? err.message : String(err)}`);
        }

        // Final defensive dedupe by lowercased Name. Belt-and-suspenders for
        // the (IntegrationObjectID, Name) unique key — every code path that
        // ever adds to `result` is now guarded.
        const seen = new Set<string>();
        return result.filter(f => {
            const key = f.Name.toLowerCase();
            if (seen.has(key)) {
                console.warn(`[SageIntacct] DiscoverFields: dropping duplicate field "${f.Name}" on ${objectName}`);
                return false;
            }
            seen.add(key);
            return true;
        });
    }

    private BuildLookupRequest(session: SageIntacctSession, objectName: string): string {
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-lookup-${Date.now()}">
                <lookup>
                    <object>${this.EscapeXmlValue(objectName)}</object>
                </lookup>
            </function>`);
    }

    /**
     * Full parser for SI's `lookup <object>` response. Returns the same shape
     * as ParseInspectFieldsResponse so callers can use lookup as a drop-in
     * fallback when inspect comes back empty. SI's lookup endpoint frequently
     * returns a populated `<Fields>` block for objects whose `inspect` returns
     * an empty `<Fields/>` — same metadata, different API surface, same
     * deterministic source-of-truth from SI.
     *
     * Lookup uses uppercase tags (`<NAME>`, `<DATATYPE>`, `<ISCUSTOM>`) where
     * inspect uses mixed case (`<Name>`, `<DataType>`). Tag extraction tries
     * both casings to be robust against per-tenant API quirks.
     */
    private ParseLookupFieldsResponse(xml: string): IntacctFieldDef[] {
        this.CheckForErrors(xml);
        const fields: IntacctFieldDef[] = [];
        const seen = new Set<string>();
        const fieldRegex = /<Field>\s*([\s\S]*?)\s*<\/Field>/gi;
        let match: RegExpExecArray | null;
        while ((match = fieldRegex.exec(xml)) !== null) {
            const frag = match[1];
            const name = this.ExtractXmlValueFromFragment(frag, 'NAME')
                || this.ExtractXmlValueFromFragment(frag, 'Name');
            if (!name) continue;
            const key = name.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);

            const dataType = this.ExtractXmlValueFromFragment(frag, 'DATATYPE')
                || this.ExtractXmlValueFromFragment(frag, 'DataType')
                || 'string';
            const label = this.ExtractXmlValueFromFragment(frag, 'DISPLAYLABEL')
                || this.ExtractXmlValueFromFragment(frag, 'DisplayLabel')
                || name;
            const isRequired = (this.ExtractXmlValueFromFragment(frag, 'REQUIRED')
                || this.ExtractXmlValueFromFragment(frag, 'Required')).toLowerCase() === 'true';
            const isReadOnly = (this.ExtractXmlValueFromFragment(frag, 'READONLY')
                || this.ExtractXmlValueFromFragment(frag, 'ReadOnly')).toLowerCase() === 'true';
            const isCustom = (this.ExtractXmlValueFromFragment(frag, 'ISCUSTOM')
                || this.ExtractXmlValueFromFragment(frag, 'IsCustom')).toLowerCase() === 'true';

            const maxLength = this.ParseNumericTagFromFragment(frag, 'MAXLENGTH')
                ?? this.ParseNumericTagFromFragment(frag, 'MaxLength')
                ?? this.ParseNumericTagFromFragment(frag, 'LENGTH')
                ?? this.ParseNumericTagFromFragment(frag, 'Length');
            const precision = this.ParseNumericTagFromFragment(frag, 'PRECISION')
                ?? this.ParseNumericTagFromFragment(frag, 'Precision');
            const scale = this.ParseNumericTagFromFragment(frag, 'SCALE')
                ?? this.ParseNumericTagFromFragment(frag, 'Scale');
            const defaultValueRaw = this.ExtractXmlValueFromFragment(frag, 'DEFAULTVALUE')
                || this.ExtractXmlValueFromFragment(frag, 'DefaultValue');
            const referencesRaw = this.ExtractXmlValueFromFragment(frag, 'REFERENCES')
                || this.ExtractXmlValueFromFragment(frag, 'References');

            fields.push({
                Name: name, Label: label, DataType: dataType,
                IsRequired: isRequired, IsReadOnly: isReadOnly, IsCustom: isCustom,
                MaxLength: maxLength,
                Precision: precision,
                Scale: scale,
                DefaultValue: defaultValueRaw && defaultValueRaw.length > 0 ? defaultValueRaw : null,
                References: referencesRaw && referencesRaw.length > 0 ? referencesRaw : null,
            });
        }
        return fields;
    }

    // ─── FetchChanges ────────────────────────────────────────────────

    /**
     * Fetches records from a Sage Intacct object. Uses one of two strategies
     * based on the object's primary key shape:
     *
     *   - Numeric PK (RECORDNO): walks RECORDNO in fixed numeric ranges with
     *     recursive halving on dense chunks. Bulletproof — no dependence on
     *     SI's scan order, pagination signals, or page-size limits.
     *
     *   - String PK (CUSTOMERID, VENDORID, etc.): single readByQuery + readMore
     *     loop using SI's server-side resultId. Hard fails (instead of silently
     *     dropping records) if SI returns a full page without a resultId.
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        // Guardrail: if a caller somehow ends up trying to fetch a child-only
        // object directly (entity map left over from a previous picker, or a
        // hand-set IntegrationObject row), bail with a clear message rather
        // than producing an empty result that looks like "the table is empty".
        const parentForChild = SAGE_INTACCT_CHILD_OBJECTS[ctx.ObjectName.toUpperCase()];
        if (parentForChild) {
            console.warn(
                `[SageIntacct] FetchChanges: "${ctx.ObjectName}" is a child of "${parentForChild}" and cannot be fetched directly. ` +
                `Sync the parent object instead — child rows arrive inline in the parent's response.`
            );
            return { Records: [], HasMore: false };
        }

        const session = await this.GetSession(ctx.CompanyIntegration, ctx.ContextUser);
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName, ctx.CompanyIntegration.IntegrationID);
        const pageSize = Math.max(ctx.BatchSize || 0, DEFAULT_PAGE_SIZE);

        // Dispatch by PK shape. RECORDNO (universal SI numeric row id) gets
        // the bulletproof range-chunked walk. Everything else (string PKs)
        // takes the single-pull-with-readMore path.
        if (pkField === 'RECORDNO') {
            return this.FetchChangesByRange(session, ctx, pageSize);
        }
        return this.FetchChangesSinglePull(session, ctx, pageSize, pkField);
    }

    /**
     * Range-chunked walk over numeric RECORDNO. Each FetchChanges call
     * processes ONE chunk (one HTTP request to SI). The engine drives the
     * walk by passing the returned NextCursor back on the next call. Cursor
     * encodes (lo, chunkSize, upperBound, maxWatermarkSeen).
     *
     * Termination: walk completes when `lo >= upperBound`. The upperBound is
     * discovered ONCE at the start of the walk via exponential probe of SI's
     * actual MAX RECORDNO — no empty-chunk heuristic, no "what if records
     * exist past N" doubt. The walk covers exactly [0, MAX_RECORDNO + safety
     * margin), every RECORDNO accounted for.
     *
     * Density adaptation: full-page response → halve chunk, re-query same lo.
     * Watermark: tracked in cursor; emitted only on final batch.
     */
    private async FetchChangesByRange(
        session: SageIntacctSession,
        ctx: FetchContext,
        pageSize: number
    ): Promise<FetchBatchResult> {
        let state = this.parseRangeCursor(ctx.CurrentCursor);
        if (!state) {
            // First call of this walk — discover the actual upper bound on
            // RECORDNO so termination is precise rather than heuristic.
            const upperBound = await this.discoverUpperBound(session, ctx);
            // Start with chunkSize = min(upperBound, RANGE_INITIAL_CHUNK)
            // so small objects walk in a single chunk (no wasted traversal),
            // while huge ranges still cap at a sane starting point that won't
            // require many density halvings to fit in pageSize.
            const initialChunkSize = Math.max(
                Math.min(upperBound, RANGE_INITIAL_CHUNK),
                RANGE_MIN_CHUNK
            );
            state = {
                lo: 0,
                chunkSize: initialChunkSize,
                upperBound,
                maxWatermark: undefined,
            };
        }

        // If this call lands at-or-past the discovered upper bound, the walk
        // is over even before we make the first request. Emit the watermark
        // and terminate. (This shouldn't happen normally — advanceRangeWalk
        // catches it first — but defends against cursors hand-crafted by
        // tooling or replays.)
        if (state.lo >= state.upperBound) {
            console.log(`[SageIntacct] ${ctx.ObjectName}: RANGE walk complete — lo=${state.lo} >= upperBound=${state.upperBound}. Final watermark: ${state.maxWatermark ?? 'none'}`);
            return { Records: [], HasMore: false, NewWatermarkValue: state.maxWatermark };
        }

        const hi = Math.min(state.lo + state.chunkSize, state.upperBound);
        const filter = this.buildRangeFilter(ctx, state.lo, hi);
        console.log(`[SageIntacct] ${ctx.ObjectName}: RANGE [${state.lo}, ${hi}) chunkSize=${state.chunkSize} upperBound=${state.upperBound} — filter="${filter}"`);

        const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, pageSize);
        const response = await this.SendXMLRequest(session, xml);
        const result = this.ParseReadByQueryResponseRaw(response, ctx.ObjectName, pageSize);

        // Density check: a full page back means SI may have more records in
        // this RECORDNO range than fit in one page. Because SI doesn't scan
        // PK-ascending, the records we got could be any random subset of the
        // chunk's true contents — keeping them risks a permanent miss of the
        // un-returned records. Discard, halve, re-query.
        if (result.records.length >= pageSize) {
            return this.handleDenseChunk(ctx, state, pageSize);
        }

        // Sub-range verification: independently query [lo, mid) and [mid, hi)
        // and confirm their counts sum to the main query's count. Catches SI
        // inconsistencies where a chunk reports "complete" while sub-ranges
        // tell a different story. Throws on mismatch (fail-stop) — partial
        // sync data is worse than no sync data.
        if (RANGE_VERIFICATION_ENABLED && (hi - state.lo) >= 2 * RANGE_MIN_CHUNK) {
            const verificationOutcome = await this.verifyChunk(session, ctx, state.lo, hi, pageSize, result.records.length);
            if (verificationOutcome === 'sub-range-dense') {
                // Either half is dense — drill down via standard halving.
                return this.handleDenseChunk(ctx, state, pageSize);
            }
            // verificationOutcome === 'verified' → sums match; main count is trustworthy.
        }

        // Chunk fully captured. Compute its contribution to the watermark and
        // decide whether to advance to the next chunk or terminate.
        return this.advanceRangeWalk(ctx, state, result.records);
    }

    /** Sub-range verification: query both halves of [lo, hi) independently
     *  and confirm their counts sum to `mainCount`. Returns 'verified' when
     *  sums match, 'sub-range-dense' when either half is at-or-above
     *  pageSize (signalling that further drill-down is needed). Throws on
     *  count mismatch — that's an SI inconsistency we refuse to paper over. */
    private async verifyChunk(
        session: SageIntacctSession,
        ctx: FetchContext,
        lo: number,
        hi: number,
        pageSize: number,
        mainCount: number
    ): Promise<'verified' | 'sub-range-dense'> {
        const mid = lo + Math.floor((hi - lo) / 2);
        const leftFilter = this.buildRangeFilter(ctx, lo, mid);
        const rightFilter = this.buildRangeFilter(ctx, mid, hi);

        const [leftRaw, rightRaw] = await Promise.all([
            this.SendXMLRequest(session, this.BuildReadByQueryRequest(session, ctx.ObjectName, leftFilter, pageSize)),
            this.SendXMLRequest(session, this.BuildReadByQueryRequest(session, ctx.ObjectName, rightFilter, pageSize)),
        ]);
        const left = this.ParseReadByQueryResponseRaw(leftRaw, ctx.ObjectName, pageSize);
        const right = this.ParseReadByQueryResponseRaw(rightRaw, ctx.ObjectName, pageSize);

        // If either half is dense, we can't trust the parent's count yet —
        // drill into smaller chunks. The caller handles this via the standard
        // dense-halving path.
        if (left.records.length >= pageSize || right.records.length >= pageSize) {
            console.warn(
                `[SageIntacct] ${ctx.ObjectName}: verification of [${lo}, ${hi}) revealed dense sub-range ` +
                `(left=${left.records.length}, right=${right.records.length}). Drilling down.`
            );
            return 'sub-range-dense';
        }

        const sumOfHalves = left.records.length + right.records.length;
        if (sumOfHalves !== mainCount) {
            throw new Error(
                `[SageIntacct] ${ctx.ObjectName}: SI INCONSISTENCY in [${lo}, ${hi}). ` +
                `Main query returned ${mainCount} records, but sub-ranges ` +
                `[${lo}, ${mid}) + [${mid}, ${hi}) returned ${left.records.length} + ${right.records.length} = ${sumOfHalves}. ` +
                `SI is hiding records — refusing to continue sync with potentially incomplete data. ` +
                `Re-run sync; if persistent, this object may need manual investigation.`
            );
        }
        // Sums match — main count verified.
        return 'verified';
    }

    /** Exponential probe of SI for the highest RECORDNO that exists on this
     *  object. Returns an upper bound (always strictly greater than the true
     *  max). Costs O(log_RANGE_DISCOVERY_GROWTH(maxRecordno)) HTTP calls —
     *  typically 1-5 calls for any plausible tenant.
     *
     *  Uses pageSize=1 because we only care whether ANY record exists at or
     *  above the probe point; the records themselves are discarded. Does NOT
     *  apply WHENMODIFIED filter — we want the absolute upper bound on
     *  RECORDNO regardless of when it was modified, so that incremental
     *  syncs still cover the full RECORDNO space (each chunk inside the
     *  walk applies its own WHENMODIFIED filter).
     *
     *  Each probe is retried up to RANGE_DISCOVERY_MAX_ATTEMPTS times on
     *  network/transport failure before throwing. A retried-but-still-failed
     *  probe THROWS rather than silently treating the failure as "no records
     *  exist past this point" — fail-stop matches the user requirement that
     *  partial sync is worse than no sync. */
    private async discoverUpperBound(session: SageIntacctSession, ctx: FetchContext): Promise<number> {
        let probe = RANGE_DISCOVERY_INITIAL_PROBE;
        while (probe <= RANGE_DISCOVERY_SANITY_CAP) {
            const result = await this.probeRecordnoExistsRetried(session, ctx, probe);
            if (result.records.length === 0 && result.numRemaining === 0) {
                console.log(`[SageIntacct] ${ctx.ObjectName}: discovered upperBound=${probe} (no records at or above this RECORDNO)`);
                return probe;
            }
            probe *= RANGE_DISCOVERY_GROWTH;
        }
        throw new Error(
            `[SageIntacct] ${ctx.ObjectName}: max RECORDNO exceeds sanity cap of ${RANGE_DISCOVERY_SANITY_CAP}. ` +
            `This object's RECORDNOs are pathologically large; raise RANGE_DISCOVERY_SANITY_CAP.`
        );
    }

    /** Single discovery probe with retry on TRANSPORT errors only. SI-side
     *  errors (permission denied, syntax invalid, schema rejected) are
     *  deterministic and don't benefit from retry — they're propagated
     *  immediately so the caller (sync engine) can record the object as
     *  failed and move on. Throws after RANGE_DISCOVERY_MAX_ATTEMPTS
     *  exhausted on transport — does NOT silently treat persistent failure
     *  as "empty result." */
    private async probeRecordnoExistsRetried(
        session: SageIntacctSession,
        ctx: FetchContext,
        probe: number
    ): Promise<{ records: Record<string, unknown>[]; numRemaining: number; resultId: string | undefined }> {
        const filter = `RECORDNO >= ${probe}`;
        let lastError: unknown;
        for (let attempt = 1; attempt <= RANGE_DISCOVERY_MAX_ATTEMPTS; attempt++) {
            try {
                const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, 1);
                const response = await this.SendXMLRequest(session, xml);
                return this.ParseReadByQueryResponseRaw(response, ctx.ObjectName, 1);
            } catch (err) {
                lastError = err;
                // SI-side errors (permission, schema, query syntax) are
                // deterministic — retrying gives the same answer. Surface
                // immediately so the engine can move on to the next object.
                if (this.isSageIntacctApiError(err)) {
                    throw err;
                }
                const willRetry = attempt < RANGE_DISCOVERY_MAX_ATTEMPTS;
                console.warn(
                    `[SageIntacct] ${ctx.ObjectName}: discovery probe at RECORDNO >= ${probe} ` +
                    `transport attempt ${attempt}/${RANGE_DISCOVERY_MAX_ATTEMPTS} failed: ${(err as Error)?.message ?? String(err)}` +
                    (willRetry ? ` — retrying after ${RANGE_DISCOVERY_RETRY_BACKOFF_MS * attempt}ms` : ' — giving up')
                );
                if (willRetry) {
                    await new Promise(resolve => setTimeout(resolve, RANGE_DISCOVERY_RETRY_BACKOFF_MS * attempt));
                }
            }
        }
        throw new Error(
            `[SageIntacct] ${ctx.ObjectName}: discovery probe at RECORDNO >= ${probe} failed ` +
            `after ${RANGE_DISCOVERY_MAX_ATTEMPTS} transport attempts. Refusing to assume "no records exist" ` +
            `from a transport-level failure — sync would silently undercount. Last error: ` +
            `${(lastError as Error)?.message ?? String(lastError)}`
        );
    }

    /** Returns true when the error originated from SI's API response (a
     *  thrown structured error from CheckForErrors), false for transport /
     *  network / parser failures. SI-side errors are not worth retrying. */
    private isSageIntacctApiError(err: unknown): boolean {
        const msg = (err as Error)?.message;
        if (typeof msg !== 'string') return false;
        return msg.startsWith('Sage Intacct error ') || msg.startsWith('Sage Intacct API error');
    }

    /** Halve the current chunk and re-query its lower half on the next call.
     *  Throws if already at RANGE_MIN_CHUNK — that signals the impossible
     *  case where SI has more records in 100 RECORDNOs than fit in our
     *  configured page size, and we cannot guarantee complete sync. */
    private handleDenseChunk(
        ctx: FetchContext,
        state: RangeCursorState,
        pageSize: number
    ): FetchBatchResult {
        const halved = Math.max(Math.floor(state.chunkSize / 2), RANGE_MIN_CHUNK);
        if (halved === state.chunkSize) {
            throw new Error(
                `[SageIntacct] ${ctx.ObjectName}: chunk at minimum size ${state.chunkSize} ` +
                `still returns ≥${pageSize} records. Cannot guarantee complete sync. ` +
                `Increase DEFAULT_PAGE_SIZE or lower RANGE_MIN_CHUNK.`
            );
        }
        console.warn(
            `[SageIntacct] ${ctx.ObjectName}: dense chunk at [${state.lo}, ${state.lo + state.chunkSize}) — ` +
            `halving to ${halved} and retrying. (Records from this query are discarded; they will be re-fetched in halved chunks.)`
        );
        // Re-query the SAME lo with smaller chunkSize. upperBound unchanged.
        const nextCursor = this.buildRangeCursor({ ...state, chunkSize: halved });
        return { Records: [], HasMore: true, NextCursor: nextCursor };
    }

    /** Chunk completed safely. Advance to next chunk or terminate the walk
     *  when we cross the discovered upperBound. */
    private advanceRangeWalk(
        ctx: FetchContext,
        state: RangeCursorState,
        records: Record<string, unknown>[]
    ): FetchBatchResult {
        const externalRecords = records.map(r => this.toExternalRecord(r, ctx.ObjectName, 'RECORDNO'));
        const chunkWatermark = this.ComputeWatermark(records);
        const newMaxWatermark = this.maxWatermarkString(state.maxWatermark, chunkWatermark);

        const nextLo = state.lo + state.chunkSize;

        if (nextLo >= state.upperBound) {
            console.log(`[SageIntacct] ${ctx.ObjectName}: RANGE walk complete — covered [0, ${state.upperBound}). Final watermark: ${newMaxWatermark ?? 'none'}`);
            return {
                Records: externalRecords,
                HasMore: false,
                NewWatermarkValue: newMaxWatermark,
            };
        }

        const nextCursor = this.buildRangeCursor({
            lo: nextLo,
            chunkSize: RANGE_INITIAL_CHUNK,  // grow back to default after dense recovery
            upperBound: state.upperBound,    // carried forward unchanged
            maxWatermark: newMaxWatermark,
        });
        return {
            Records: externalRecords,
            HasMore: true,
            NextCursor: nextCursor,
        };
    }

    /** Single-page fetch + readMore loop for objects with string PKs (CUSTOMER,
     *  VENDOR, GLACCOUNT, etc.). These are typically small lookup tables; if
     *  one ever exceeds a single page, we trust SI's resultId. If SI returns
     *  a full page without a resultId, we HARD FAIL rather than silently
     *  drop records via PK-cursor pagination. */
    private async FetchChangesSinglePull(
        session: SageIntacctSession,
        ctx: FetchContext,
        pageSize: number,
        pkField: string
    ): Promise<FetchBatchResult> {
        // readMore continuation — SI maintains scan-order consistency on its
        // server-side resultId, so this path is safe.
        if (ctx.CurrentCursor) {
            return this.FetchMoreRecords(session, ctx.CurrentCursor, ctx.ObjectName, pkField);
        }

        // Initial fetch with watermark filter only.
        const hasWhenModified = this.ObjectHasWhenModified(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const filterParts: string[] = [];
        if (ctx.WatermarkValue && hasWhenModified) {
            filterParts.push(`WHENMODIFIED >= '${this.NormalizeSageIntacctTimestamp(ctx.WatermarkValue)}'`);
        }
        const filter = filterParts.join(' AND ');
        console.log(`[SageIntacct] ${ctx.ObjectName}: SINGLE-PULL fetch (${pkField}) — filter="${filter}"`);

        const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, pageSize);
        const response = await this.SendXMLRequest(session, xml);
        const raw = this.ParseReadByQueryResponseRaw(response, ctx.ObjectName, pageSize);

        const externalRecords = raw.records.map(r => this.toExternalRecord(r, ctx.ObjectName, pkField));
        const watermark = this.ComputeWatermark(raw.records);

        // Safe terminal cases: small response (definitely complete) OR full
        // page WITH resultId (readMore handles the rest deterministically).
        if (raw.records.length < pageSize) {
            return { Records: externalRecords, HasMore: false, NewWatermarkValue: watermark };
        }
        if (raw.resultId) {
            return { Records: externalRecords, HasMore: true, NextCursor: raw.resultId };
        }

        // Dangerous case: full page, no resultId, string PK. PK-cursor
        // pagination would silently drop records (SI's scan order is not
        // PK-ascending). We REFUSE to proceed rather than corrupt the sync.
        throw new Error(
            `[SageIntacct] ${ctx.ObjectName}: SI returned ${raw.records.length} records ` +
            `(full page) with no resultId and the PK (${pkField}) is non-numeric. ` +
            `Cannot safely paginate without ordering guarantees. ` +
            `Either (a) raise DEFAULT_PAGE_SIZE so this object fits in one page, ` +
            `or (b) add ${ctx.ObjectName} to the numeric-PK code path if it has a RECORDNO column.`
        );
    }

    private parseRangeCursor(cursor: string | undefined): RangeCursorState | null {
        if (!cursor || !cursor.startsWith(RANGE_CURSOR_PREFIX)) return null;
        const body = cursor.slice(RANGE_CURSOR_PREFIX.length);
        const parts = body.split(':');
        if (parts.length < 4) return null;
        const lo = parseInt(parts[0], 10);
        const chunkSize = parseInt(parts[1], 10);
        const upperBound = parseInt(parts[2], 10);
        const maxWatermarkB64 = parts[3];
        if (!Number.isFinite(lo) || !Number.isFinite(chunkSize) || !Number.isFinite(upperBound)) return null;
        const maxWatermark = maxWatermarkB64 ? Buffer.from(maxWatermarkB64, 'base64').toString('utf8') : undefined;
        return { lo, chunkSize, upperBound, maxWatermark };
    }

    private buildRangeCursor(state: RangeCursorState): string {
        const wmB64 = state.maxWatermark ? Buffer.from(state.maxWatermark, 'utf8').toString('base64') : '';
        return `${RANGE_CURSOR_PREFIX}${state.lo}:${state.chunkSize}:${state.upperBound}:${wmB64}`;
    }

    private buildRangeFilter(ctx: FetchContext, lo: number, hi: number): string {
        const hasWhenModified = this.ObjectHasWhenModified(ctx.CompanyIntegration.IntegrationID, ctx.ObjectName);
        const parts: string[] = [];
        if (ctx.WatermarkValue && hasWhenModified) {
            parts.push(`WHENMODIFIED >= '${this.NormalizeSageIntacctTimestamp(ctx.WatermarkValue)}'`);
        }
        parts.push(`RECORDNO >= ${lo}`);
        parts.push(`RECORDNO < ${hi}`);
        return parts.join(' AND ');
    }

    /** Converts a watermark value to SI's expected datetime literal format
     *  (`MM/DD/YYYY HH:mm:ss`). The integration engine may pass watermarks
     *  in ISO 8601 (e.g. `2026-04-26T01:00:25.170Z`) when no prior SI-format
     *  watermark exists for an object — substituting that ISO string straight
     *  into a `WHENMODIFIED >= '...'` filter triggers SI's generic
     *  DL02000001 "There was an error processing the request" rejection.
     *  This converts to SI's accepted format using UTC components for
     *  deterministic results regardless of the host server's timezone. */
    private NormalizeSageIntacctTimestamp(value: string): string {
        // Already in SI's MM/DD/YYYY format — pass through unchanged.
        if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(value)) {
            return value;
        }
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) {
            // Can't parse — let SI reject it loudly rather than silently
            // re-format something we don't understand.
            return value;
        }
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()} ` +
               `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    }

    private toExternalRecord(record: Record<string, unknown>, objectName: string, pkField: string): ExternalRecord {
        return {
            ExternalID: String(record[pkField] ?? ''),
            ObjectType: objectName,
            Fields: record,
            ModifiedAt: record['WHENMODIFIED'] ? new Date(String(record['WHENMODIFIED'])) : undefined,
        };
    }

    /** Returns the lex-greater of two ISO/SI watermark strings, or undefined
     *  if both are absent. SI's WHENMODIFIED format (`MM/DD/YYYY HH:mm:ss`)
     *  doesn't sort lex-correctly across years/months in pure string compare,
     *  so we parse to Date for comparison. */
    private maxWatermarkString(a: string | undefined, b: string | undefined): string | undefined {
        if (!a) return b;
        if (!b) return a;
        const da = new Date(a);
        const db = new Date(b);
        if (Number.isNaN(da.getTime())) return b;
        if (Number.isNaN(db.getTime())) return a;
        return da.getTime() >= db.getTime() ? a : b;
    }

    /**
     * Returns true when the IntegrationObject's discovered field set includes
     * WHENMODIFIED. Used to skip the watermark filter for objects that don't
     * support it (most SI platform/lookup objects).
     */
    private ObjectHasWhenModified(integrationID: string, objectName: string): boolean {
        try {
            const obj = IntegrationEngineBase.Instance.GetIntegrationObject(integrationID, objectName);
            if (!obj) return true; // unknown — assume yes, preserve existing behavior
            const fields = IntegrationEngineBase.Instance.GetIntegrationObjectFields(obj.ID);
            if (!fields || fields.length === 0) return true; // no metadata yet — preserve behavior
            return fields.some(f => f.Name.toUpperCase() === 'WHENMODIFIED');
        } catch {
            return true;
        }
    }

    // ─── CRUD Operations ─────────────────────────────────────────────

    public override async CreateRecord(ctx: CreateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);

        const xml = this.BuildCreateRequest(session, ctx.ObjectName, ctx.Attributes);
        try {
            const response = await this.SendXMLRequest(session, xml);
            const recordKey = this.ExtractRecordKey(response, ctx.ObjectName);
            return { Success: true, ExternalID: recordKey, StatusCode: 200 };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'CreateRecord', ctx.ObjectName);
        }
    }

    public override async UpdateRecord(ctx: UpdateRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName, companyIntegration.IntegrationID);

        const xml = this.BuildUpdateRequest(session, ctx.ObjectName, ctx.ExternalID, ctx.Attributes, pkField);
        try {
            await this.SendXMLRequest(session, xml);
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'UpdateRecord', ctx.ObjectName);
        }
    }

    public override async DeleteRecord(ctx: DeleteRecordContext): Promise<CRUDResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);

        const xml = this.BuildDeleteRequest(session, ctx.ObjectName, ctx.ExternalID);
        try {
            await this.SendXMLRequest(session, xml);
            return { Success: true, ExternalID: ctx.ExternalID, StatusCode: 200 };
        } catch (err: unknown) {
            return this.BuildCRUDError(err, 'DeleteRecord', ctx.ObjectName);
        }
    }

    public override async GetRecord(ctx: GetRecordContext): Promise<ExternalRecord | null> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName, companyIntegration.IntegrationID);

        const xml = this.BuildReadRequest(session, ctx.ObjectName, ctx.ExternalID);
        try {
            const response = await this.SendXMLRequest(session, xml);
            const record = this.ParseSingleRecord(response, ctx.ObjectName);
            if (!record) return null;

            return {
                ExternalID: String(record[pkField] ?? ctx.ExternalID),
                ObjectType: ctx.ObjectName,
                Fields: record,
            };
        } catch {
            return null;
        }
    }

    public override async SearchRecords(ctx: SearchContext): Promise<SearchResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName, companyIntegration.IntegrationID);
        const pageSize = ctx.PageSize ?? DEFAULT_PAGE_SIZE;

        const filterParts = Object.entries(ctx.Filters).map(
            ([field, value]) => `${field} = '${this.EscapeXmlValue(String(value))}'`
        );
        const filter = filterParts.join(' AND ');

        const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, pageSize, pkField);
        const response = await this.SendXMLRequest(session, xml);
        const result = this.ParseReadByQueryResponse(response, ctx.ObjectName, pkField, pageSize);

        return {
            Records: result.Records,
            TotalCount: result.Records.length + (result.HasMore ? 1 : 0), // Intacct doesn't give exact total in readByQuery
            HasMore: result.HasMore,
        };
    }

    public override async ListRecords(ctx: ListContext): Promise<ListResult> {
        const companyIntegration = ctx.CompanyIntegration as MJCompanyIntegrationEntity;
        const contextUser = ctx.ContextUser as UserInfo;
        const session = await this.GetSession(companyIntegration, contextUser);
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName, companyIntegration.IntegrationID);
        const pageSize = ctx.PageSize ?? DEFAULT_PAGE_SIZE;

        if (ctx.Cursor) {
            const result = await this.FetchMoreRecords(session, ctx.Cursor, ctx.ObjectName, pkField);
            return {
                Records: result.Records,
                HasMore: result.HasMore,
                NextCursor: result.HasMore ? result.NextCursor : undefined,
            };
        }

        const filter = ctx.Filter
            ? Object.entries(ctx.Filter).map(([k, v]) => `${k} = '${this.EscapeXmlValue(String(v))}'`).join(' AND ')
            : '';

        const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, pageSize, pkField);
        const response = await this.SendXMLRequest(session, xml);
        const result = this.ParseReadByQueryResponse(response, ctx.ObjectName, pkField, pageSize);

        return {
            Records: result.Records,
            HasMore: result.HasMore,
            NextCursor: result.HasMore ? result.NextCursor : undefined,
        };
    }

    // ─── Session Management ──────────────────────────────────────────

    /**
     * Gets or refreshes a Sage Intacct API session.
     * Sessions are cached and reused until they approach expiration.
     */
    private async GetSession(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo,
        forceRefresh = false
    ): Promise<SageIntacctSession> {
        if (!forceRefresh && this.cachedSession && this.IsSessionValid()) {
            return this.cachedSession;
        }

        const config = await this.ParseConfig(companyIntegration, contextUser);
        const xml = this.BuildSessionRequest(config);
        const responseXml = await this.PostXML(INTACCT_API_ENDPOINT, xml, config);
        const session = this.ParseSessionResponse(responseXml, config);

        this.cachedSession = session;
        return session;
    }

    private IsSessionValid(): boolean {
        if (!this.cachedSession) return false;
        return (Date.now() - this.cachedSession.CreatedAt) < SESSION_LIFETIME_MS;
    }

    // ─── Configuration Parsing ───────────────────────────────────────

    /**
     * Parses connection configuration from CompanyIntegration credentials.
     * Looks for a linked MJCredentialEntity or falls back to Configuration JSON.
     */
    private async ParseConfig(
        companyIntegration: MJCompanyIntegrationEntity,
        contextUser: UserInfo
    ): Promise<SageIntacctConnectionConfig> {
        // Try credential entity first
        const credentialID = companyIntegration.Get('CredentialID') as string | null;
        if (credentialID) {
            const config = await this.LoadFromCredentialEntity(credentialID, contextUser);
            if (config) return config;
        }

        // Fall back to Configuration JSON
        const configJson = companyIntegration.Get('Configuration') as string | null;
        if (configJson) {
            const parsed = JSON.parse(configJson) as Partial<SageIntacctConnectionConfig>;
            return this.ValidateConfig(parsed);
        }

        throw new Error('SageIntacctConnector: No credentials or configuration found on CompanyIntegration');
    }

    private async LoadFromCredentialEntity(
        credentialID: string,
        contextUser: UserInfo,
        provider?: IMetadataProvider
    ): Promise<SageIntacctConnectionConfig | null> {
        const md = provider ?? new Metadata();
        const credential = await md.GetEntityObject<MJCredentialEntity>('MJ: Credentials', contextUser);
        const loaded = await credential.Load(credentialID);
        if (!loaded || !credential.Values) return null;

        try {
            const parsed = JSON.parse(credential.Values) as Partial<SageIntacctConnectionConfig>;
            return this.ValidateConfig(parsed);
        } catch {
            return null;
        }
    }

    private ValidateConfig(raw: Partial<SageIntacctConnectionConfig>): SageIntacctConnectionConfig {
        if (!raw.CompanyId) throw new Error('SageIntacctConnector: CompanyId is required');
        if (!raw.SenderId) throw new Error('SageIntacctConnector: SenderId is required');
        if (!raw.SenderPassword) throw new Error('SageIntacctConnector: SenderPassword is required');
        if (!raw.UserId) throw new Error('SageIntacctConnector: UserId is required');
        if (!raw.UserPassword) throw new Error('SageIntacctConnector: UserPassword is required');

        return {
            CompanyId: raw.CompanyId,
            SenderId: raw.SenderId,
            SenderPassword: raw.SenderPassword,
            UserId: raw.UserId,
            UserPassword: raw.UserPassword,
            EntityId: raw.EntityId,
            MaxRetries: raw.MaxRetries ?? DEFAULT_MAX_RETRIES,
            RequestTimeoutMs: raw.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            MinRequestIntervalMs: raw.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS,
        };
    }

    // ─── XML Request Builders ────────────────────────────────────────

    private BuildSessionRequest(config: SageIntacctConnectionConfig): string {
        const entityTag = config.EntityId
            ? `<locationid>${this.EscapeXmlValue(config.EntityId)}</locationid>`
            : '';
        return `<?xml version="1.0" encoding="UTF-8"?>
<request>
    <control>
        <senderid>${this.EscapeXmlValue(config.SenderId)}</senderid>
        <password>${this.EscapeXmlValue(config.SenderPassword)}</password>
        <controlid>${CONTROL_ID_PREFIX}-session-${Date.now()}</controlid>
        <uniqueid>false</uniqueid>
        <dtdversion>${DTD_VERSION}</dtdversion>
        <includewhitespace>false</includewhitespace>
    </control>
    <operation>
        <authentication>
            <login>
                <userid>${this.EscapeXmlValue(config.UserId)}</userid>
                <companyid>${this.EscapeXmlValue(config.CompanyId)}</companyid>
                <password>${this.EscapeXmlValue(config.UserPassword)}</password>
                ${entityTag}
            </login>
        </authentication>
        <content>
            <function controlid="${CONTROL_ID_PREFIX}-getSession">
                <getAPISession/>
            </function>
        </content>
    </operation>
</request>`;
    }

    private BuildReadByQueryRequest(
        session: SageIntacctSession,
        objectName: string,
        filter: string,
        pageSize: number,
        _orderByField?: string
    ): string {
        // SI's readByQuery XSD does NOT accept an <orderby> child element —
        // every request including it errors with "Element 'orderby' is not
        // expected" and returns 0 records. Ordering, when needed, must be
        // expressed in the WHERE/<query> clause via SI's SOQL-like syntax
        // ("ORDER BY <field> ASC" appended to the query expression). The
        // caller can append "ORDER BY <field>" inside `filter` if it wants
        // deterministic ordering. The orderByField parameter is preserved
        // for API stability but no longer emits the rejected XML element.
        void _orderByField;
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-readByQuery-${Date.now()}">
                <readByQuery>
                    <object>${this.EscapeXmlValue(objectName)}</object>
                    <fields>*</fields>
                    <query>${this.EscapeXmlValue(filter)}</query>
                    <pagesize>${pageSize}</pagesize>
                </readByQuery>
            </function>`);
    }

    private BuildReadMoreRequest(session: SageIntacctSession, resultId: string): string {
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-readMore-${Date.now()}">
                <readMore>
                    <resultId>${this.EscapeXmlValue(resultId)}</resultId>
                </readMore>
            </function>`);
    }

    private BuildReadRequest(session: SageIntacctSession, objectName: string, key: string): string {
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-read-${Date.now()}">
                <read>
                    <object>${this.EscapeXmlValue(objectName)}</object>
                    <keys>${this.EscapeXmlValue(key)}</keys>
                    <fields>*</fields>
                </read>
            </function>`);
    }

    private BuildCreateRequest(
        session: SageIntacctSession,
        objectName: string,
        attributes: Record<string, unknown>
    ): string {
        const fieldsXml = this.AttributesToXml(attributes);
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-create-${Date.now()}">
                <create>
                    <${objectName}>
                        ${fieldsXml}
                    </${objectName}>
                </create>
            </function>`);
    }

    private BuildUpdateRequest(
        session: SageIntacctSession,
        objectName: string,
        key: string,
        attributes: Record<string, unknown>,
        pkField?: string
    ): string {
        const resolvedPk = pkField ?? this.GetPrimaryKeyField(objectName);
        const fieldsXml = this.AttributesToXml({ [resolvedPk]: key, ...attributes });
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-update-${Date.now()}">
                <update>
                    <${objectName}>
                        ${fieldsXml}
                    </${objectName}>
                </update>
            </function>`);
    }

    private BuildDeleteRequest(
        session: SageIntacctSession,
        objectName: string,
        key: string
    ): string {
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-delete-${Date.now()}">
                <delete>
                    <object>${this.EscapeXmlValue(objectName)}</object>
                    <keys>${this.EscapeXmlValue(key)}</keys>
                </delete>
            </function>`);
    }

    private BuildInspectRequest(session: SageIntacctSession, objectNameOrWildcard: string): string {
        return this.WrapInSessionRequest(session, `
            <function controlid="${CONTROL_ID_PREFIX}-inspect-${Date.now()}">
                <inspect>
                    <object>${this.EscapeXmlValue(objectNameOrWildcard)}</object>
                </inspect>
            </function>`);
    }

    /**
     * Wraps a function XML fragment in a session-authenticated request envelope.
     */
    private WrapInSessionRequest(session: SageIntacctSession, functionXml: string): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<request>
    <control>
        <senderid>${this.EscapeXmlValue(session.Config.SenderId)}</senderid>
        <password>${this.EscapeXmlValue(session.Config.SenderPassword)}</password>
        <controlid>${CONTROL_ID_PREFIX}-${Date.now()}</controlid>
        <uniqueid>false</uniqueid>
        <dtdversion>${DTD_VERSION}</dtdversion>
        <includewhitespace>false</includewhitespace>
    </control>
    <operation>
        <authentication>
            <sessionid>${this.EscapeXmlValue(session.SessionId)}</sessionid>
        </authentication>
        <content>
            ${functionXml}
        </content>
    </operation>
</request>`;
    }

    // ─── XML Response Parsers ────────────────────────────────────────

    private ParseSessionResponse(xml: string, config: SageIntacctConnectionConfig): SageIntacctSession {
        this.CheckForErrors(xml);
        const sessionId = this.ExtractXmlValue(xml, 'sessionid');
        const endpoint = this.ExtractXmlValue(xml, 'endpoint') || INTACCT_API_ENDPOINT;

        if (!sessionId) {
            throw new Error('SageIntacctConnector: getAPISession did not return a sessionid');
        }

        return {
            SessionId: sessionId,
            Endpoint: endpoint,
            CreatedAt: Date.now(),
            Config: config,
        };
    }

    /** Lower-level parser: returns just the raw records + SI's signals
     *  without applying any pagination logic. Used by the range-chunked and
     *  single-pull paths which decide pagination for themselves. */
    private ParseReadByQueryResponseRaw(
        xml: string,
        objectName: string,
        pageSize: number
    ): { records: Record<string, unknown>[]; numRemaining: number; resultId: string | undefined } {
        this.CheckForErrors(xml);
        const numRemaining = parseInt(this.ExtractXmlValue(xml, 'numremaining') || '0', 10);
        const resultId = this.ExtractXmlValue(xml, 'resultId') || undefined;
        const records = this.ExtractRecords(xml, objectName);
        console.log(
            `[SageIntacct] ${objectName}: SI response — records.length=${records.length}, ` +
            `numremaining=${numRemaining}, resultId=${resultId ? 'present' : 'absent'}, pageSize=${pageSize}`
        );
        return { records, numRemaining, resultId };
    }

    private ParseReadByQueryResponse(
        xml: string,
        objectName: string,
        pkField: string,
        pageSize: number = DEFAULT_PAGE_SIZE
    ): FetchBatchResult & { NextCursor?: string } {
        this.CheckForErrors(xml);

        const numRemaining = parseInt(this.ExtractXmlValue(xml, 'numremaining') || '0', 10);
        const resultId = this.ExtractXmlValue(xml, 'resultId') || undefined;
        const records = this.ExtractRecords(xml, objectName);
        console.log(
            `[SageIntacct] ${objectName}: SI response — records.length=${records.length}, ` +
            `numremaining=${numRemaining}, resultId=${resultId ? 'present' : 'absent'}, pageSize=${pageSize}`
        );

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r[pkField] ?? ''),
            ObjectType: objectName,
            Fields: r,
            ModifiedAt: r['WHENMODIFIED'] ? new Date(String(r['WHENMODIFIED'])) : undefined,
        }));

        // Compute watermark from the latest WHENMODIFIED in this batch
        const newWatermark = this.ComputeWatermark(records);

        // Legacy parser used by SearchRecords/ListRecords/FetchMoreRecords
        // (browse/search APIs that use SI's resultId pagination directly).
        // The sync engine path uses the bulletproof range-chunked walk in
        // FetchChangesByRange — it never reaches this branch.
        //
        // Safe pagination signals:
        //   - SI returned a resultId → readMore against that resultId
        //   - SI returned numremaining=0 AND records.length < pageSize → done
        //
        // Unsafe case: full page with no resultId. The previous PKCURSOR
        // fallback (PK > maxPK on next call) silently dropped records when
        // SI's scan order wasn't PK-ascending, which is the actual default.
        // Better to fail loudly than corrupt the dataset.
        const pageWasFull = records.length >= pageSize;
        const apiSaysMore = numRemaining > 0;

        let hasMore = false;
        let nextCursor: string | undefined;
        if (resultId && (apiSaysMore || pageWasFull)) {
            hasMore = true;
            nextCursor = resultId;
        } else if (pageWasFull) {
            throw new Error(
                `[SageIntacct] ${objectName}: SI returned a full page (${records.length} records) ` +
                `with no resultId. Cannot safely paginate — SI's readByQuery does not scan in ` +
                `PK-ascending order, so PK-cursor advancement would silently drop records. ` +
                `Use FetchChanges (range-chunked sync) for complete coverage, or raise ` +
                `pageSize so this query fits in a single page.`
            );
        }
        // Suppress unused-warning when the legacy MaxPkValue helper is not
        // referenced from this branch. Other callers (probe scripts) may
        // still invoke it via reflection.
        void pkField;

        // Critical: only advance the watermark on the FINAL batch of an
        // entity's fetch. Intermediate batches must keep the original
        // watermark filter so PK-cursor pagination doesn't shrink the
        // WHENMODIFIED window and silently drop records modified between
        // the original watermark and the batch's max. The engine sets
        // currentWatermark from NewWatermarkValue immediately and that
        // becomes the next batch's WHERE filter — fine for the FINAL
        // batch (entity fully drained), broken for any mid-pagination
        // batch (next call still needs the original watermark to find
        // the rest of the records).
        const newWatermarkForReturn = hasMore ? undefined : newWatermark;
        return {
            Records: externalRecords,
            HasMore: hasMore,
            NewWatermarkValue: newWatermarkForReturn,
            NextCursor: nextCursor,
        };
    }

    private ParseSingleRecord(xml: string, objectName: string): Record<string, unknown> | null {
        this.CheckForErrors(xml);
        const records = this.ExtractRecords(xml, objectName);
        return records.length > 0 ? records[0] : null;
    }

    /**
     * Returns the maximum PK value across the records, picking the right
     * comparator (numeric vs lexicographic) based on whether all values
     * look like integers. Returns undefined when records is empty or no
     * record has a usable PK value.
     */
    private MaxPkValue(records: Record<string, unknown>[], pkField: string): string | number | undefined {
        const values: Array<string | number> = [];
        for (const r of records) {
            const v = r[pkField];
            if (v == null) continue;
            if (typeof v === 'number' && Number.isFinite(v)) values.push(v);
            else if (typeof v === 'string' && v.length > 0) values.push(v);
        }
        if (values.length === 0) return undefined;
        const allNumericStrings = values.every(v =>
            typeof v === 'number' || (typeof v === 'string' && /^-?\d+$/.test(v))
        );
        if (allNumericStrings) {
            return values.reduce<number>((m, v) => {
                const n = typeof v === 'number' ? v : parseInt(v, 10);
                return n > m ? n : m;
            }, Number.NEGATIVE_INFINITY);
        }
        // String comparison — return lexicographically largest
        return values.reduce<string>((m, v) => {
            const s = String(v);
            return s > m ? s : m;
        }, '');
    }

    private ParseInspectObjectsResponse(xml: string): string[] {
        this.CheckForErrors(xml);
        const objectNames: string[] = [];
        const skipped: string[] = [];

        // inspect with '*' returns <type>OBJECTNAME</type> elements containing
        // a mix of (a) real API codes that work directly (CUSTOMER, APBILL),
        // (b) human display names where the API code is a "strip spaces +
        // uppercase" transform of the display name ("AP bill" → APBILL,
        // "Order entry transaction" → ORDERENTRYTRANSACTION), and (c) proper-
        // case display-only labels that have no API equivalent ("Channel",
        // "User", "Entity"). We can't tell (b) from (c) up-front, so this
        // method returns BOTH: real-looking API codes pass straight through,
        // and display-name-shaped entries are normalized into candidate API
        // codes. The caller then probes each candidate against per-object
        // inspect to keep only the ones SI actually accepts.
        const typeRegex = /<type[^>]*>([^<]+)<\/type>/gi;
        const apiNameRegex = /^[A-Z][A-Z0-9_]*$/;
        const seen = new Set<string>();
        let match: RegExpExecArray | null;
        while ((match = typeRegex.exec(xml)) !== null) {
            const raw = match[1].trim();
            if (!raw) continue;
            // Already an API-code-shaped name → keep verbatim
            if (apiNameRegex.test(raw)) {
                if (!seen.has(raw)) {
                    seen.add(raw);
                    objectNames.push(raw);
                }
                continue;
            }
            // Display-name-shaped → derive a candidate API code by stripping
            // whitespace and uppercasing. SI accepts these for many objects
            // where the inspect-* list shows the display label.
            const candidate = raw.replace(/[\s\-]+/g, '').toUpperCase();
            if (!candidate || !apiNameRegex.test(candidate)) {
                skipped.push(raw);
                continue;
            }
            if (!seen.has(candidate)) {
                seen.add(candidate);
                objectNames.push(candidate);
            }
        }
        if (skipped.length > 0) {
            console.log(
                `[SageIntacct] ParseInspectObjectsResponse: filtered ${skipped.length} non-API-code names ` +
                `(e.g. "${skipped.slice(0, 3).join('", "')}"${skipped.length > 3 ? ', ...' : ''}) — ` +
                `these entries cannot be inspected via the per-object endpoint.`
            );
        }
        return objectNames;
    }

    private ParseInspectFieldsResponse(xml: string): IntacctFieldDef[] {
        this.CheckForErrors(xml);
        const fields: IntacctFieldDef[] = [];
        // SI's inspect can emit the same <Name> in multiple <Field> blocks
        // (nested aliases, legacy + current paths for the same column, etc.).
        // The unique key on IntegrationObjectField is (IntegrationObjectID,
        // Name) so duplicates blow up at insert time. Dedupe here, first
        // occurrence wins.
        const seenNames = new Set<string>();

        // inspect returns <Field> elements with <Name>, <DataType>, etc.
        // SI also exposes (when present): <MaxLength>, <Precision>, <Scale>,
        // <DefaultValue>, <References> (FK target object name). Surface them
        // so downstream DDL generation has real constraints to work with
        // instead of guessing precision/length and producing brittle types.
        const fieldRegex = /<Field>\s*([\s\S]*?)\s*<\/Field>/gi;
        let match: RegExpExecArray | null;
        while ((match = fieldRegex.exec(xml)) !== null) {
            const fieldXml = match[1];
            const name = this.ExtractXmlValueFromFragment(fieldXml, 'Name');
            const label = this.ExtractXmlValueFromFragment(fieldXml, 'DisplayLabel') || name;
            const dataType = this.ExtractXmlValueFromFragment(fieldXml, 'DataName')
                || this.ExtractXmlValueFromFragment(fieldXml, 'DataType')
                || 'string';
            const isRequired = this.ExtractXmlValueFromFragment(fieldXml, 'Required') === 'true';
            const isReadOnly = this.ExtractXmlValueFromFragment(fieldXml, 'ReadOnly') === 'true'
                || this.ExtractXmlValueFromFragment(fieldXml, 'SystemGenerated') === 'true';

            const isCustom = this.ExtractXmlValueFromFragment(fieldXml, 'IsCustom').toLowerCase() === 'true'
                || this.ExtractXmlValueFromFragment(fieldXml, 'ISCUSTOM').toLowerCase() === 'true';

            const maxLength = this.ParseNumericTagFromFragment(fieldXml, 'MaxLength')
                ?? this.ParseNumericTagFromFragment(fieldXml, 'Length');
            const precision = this.ParseNumericTagFromFragment(fieldXml, 'Precision');
            const scale = this.ParseNumericTagFromFragment(fieldXml, 'Scale');
            const defaultValueRaw = this.ExtractXmlValueFromFragment(fieldXml, 'DefaultValue');
            const defaultValue = defaultValueRaw && defaultValueRaw.length > 0 ? defaultValueRaw : null;
            const referencesRaw = this.ExtractXmlValueFromFragment(fieldXml, 'References')
                || this.ExtractXmlValueFromFragment(fieldXml, 'ReferencesObject');
            const references = referencesRaw && referencesRaw.length > 0 ? referencesRaw : null;

            if (name) {
                const key = name.toLowerCase();
                if (seenNames.has(key)) continue;
                seenNames.add(key);
                fields.push({
                    Name: name, Label: label, DataType: dataType,
                    IsRequired: isRequired, IsReadOnly: isReadOnly,
                    IsCustom: isCustom,
                    MaxLength: maxLength,
                    Precision: precision,
                    Scale: scale,
                    DefaultValue: defaultValue,
                    References: references,
                });
            }
        }

        return fields;
    }

    /**
     * Pulls a tag value out of a fragment and parses it as a number. Returns
     * null when the tag is absent, empty, or doesn't parse. Used for fields
     * like MaxLength / Precision / Scale that SI reports inconsistently
     * across object families (some return numbers, some omit, some return
     * empty strings).
     */
    private ParseNumericTagFromFragment(fragment: string, tagName: string): number | null {
        const raw = this.ExtractXmlValueFromFragment(fragment, tagName);
        if (!raw || raw.length === 0) return null;
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
    }

    // ─── HTTP Transport ──────────────────────────────────────────────

    /**
     * Sends an XML request to the Sage Intacct API using a session.
     * Handles throttling and retry logic.
     */
    private async SendXMLRequest(session: SageIntacctSession, xml: string): Promise<string> {
        return this.PostXML(session.Endpoint, xml, session.Config);
    }

    /**
     * Posts XML to the Sage Intacct gateway with throttling and retry support.
     */
    private async PostXML(
        url: string,
        xml: string,
        config: SageIntacctConnectionConfig
    ): Promise<string> {
        const maxRetries = config.MaxRetries ?? DEFAULT_MAX_RETRIES;
        const timeoutMs = config.RequestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
        const minInterval = config.MinRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            await this.Throttle(minInterval);

            try {
                const controller = new AbortController();
                const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/xml',
                        'Accept': 'application/xml',
                    },
                    body: xml,
                    signal: controller.signal,
                });

                clearTimeout(timeoutHandle);
                this.lastRequestTime = Date.now();

                const responseText = await response.text();

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 500)}`);
                }

                return responseText;
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : String(err);
                const isRetryable = message.includes('abort') || message.includes('timeout')
                    || message.includes('ECONNRESET') || message.includes('429')
                    || message.includes('503');

                if (!isRetryable || attempt === maxRetries) {
                    throw new Error(`Sage Intacct API request failed after ${attempt + 1} attempt(s): ${message}`);
                }

                // Exponential backoff: 1s, 2s, 4s, ...
                const delay = Math.pow(2, attempt) * 1000;
                await this.Sleep(delay);
            }
        }

        throw new Error('Sage Intacct API request failed: max retries exceeded');
    }

    // ─── XML Parsing Helpers ─────────────────────────────────────────

    /**
     * Checks the API response for error elements and throws if found.
     */
    private CheckForErrors(xml: string): void {
        // Check for control-level errors
        const statusMatch = xml.match(/<status>(.*?)<\/status>/i);
        if (statusMatch && statusMatch[1].toLowerCase() === 'failure') {
            const errMsg = this.ExtractErrorMessage(xml);
            throw new Error(`Sage Intacct API error: ${errMsg}`);
        }

        // Check for function-level errors
        const errNoMatch = xml.match(/<errorno>(.*?)<\/errorno>/i);
        if (errNoMatch) {
            const errDesc = this.ExtractXmlValue(xml, 'description2')
                || this.ExtractXmlValue(xml, 'description')
                || this.ExtractXmlValue(xml, 'errormessage')
                || 'Unknown error';
            throw new Error(`Sage Intacct error ${errNoMatch[1]}: ${errDesc}`);
        }
    }

    private ExtractErrorMessage(xml: string): string {
        const desc2 = this.ExtractXmlValue(xml, 'description2');
        if (desc2) return desc2;
        const desc = this.ExtractXmlValue(xml, 'description');
        if (desc) return desc;
        const errMsg = this.ExtractXmlValue(xml, 'errormessage');
        if (errMsg) return errMsg;
        return 'Unknown error (no description in response)';
    }

    /**
     * Extracts the text content of an XML element by tag name.
     * Simple regex-based parsing — sufficient for Sage Intacct's flat response format.
     */
    private ExtractXmlValue(xml: string, tagName: string): string | null {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
        const match = xml.match(regex);
        return match ? match[1].trim() : null;
    }

    private ExtractXmlValueFromFragment(fragment: string, tagName: string): string {
        const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'i');
        const match = fragment.match(regex);
        return match ? match[1].trim() : '';
    }

    /**
     * Extracts records from a readByQuery/read response.
     * Records are child elements within the <data> element, tagged by object name
     * (e.g., <CUSTOMER>, <VENDOR>, etc.) or a generic lowercase tag.
     */
    private ExtractRecords(xml: string, objectName: string): Record<string, unknown>[] {
        const records: Record<string, unknown>[] = [];

        // Look for the data section
        const dataMatch = xml.match(/<data[^>]*>([\s\S]*?)<\/data>/i);
        if (!dataMatch) return records;
        const dataContent = dataMatch[1];

        // Extract individual record elements — try both uppercase and lowercase
        const recordRegex = new RegExp(
            `<${objectName}[^>]*>([\\s\\S]*?)</${objectName}>`,
            'gi'
        );
        let match: RegExpExecArray | null;
        while ((match = recordRegex.exec(dataContent)) !== null) {
            const recordXml = match[1];
            const record = this.ParseRecordFields(recordXml);
            records.push(record);
        }

        return records;
    }

    /**
     * Parses field name/value pairs from a record XML fragment.
     * Handles flat fields only (nested objects are returned as string values).
     */
    private ParseRecordFields(recordXml: string): Record<string, unknown> {
        const fields: Record<string, unknown> = {};
        const fieldRegex = /<(\w+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g;
        let match: RegExpExecArray | null;

        while ((match = fieldRegex.exec(recordXml)) !== null) {
            const fieldName = match[1];
            const value = match[2].trim();

            // Attempt to parse numeric values
            if (/^-?\d+$/.test(value)) {
                fields[fieldName] = parseInt(value, 10);
            } else if (/^-?\d+\.\d+$/.test(value)) {
                fields[fieldName] = parseFloat(value);
            } else if (value === '' || value === null) {
                fields[fieldName] = null;
            } else {
                fields[fieldName] = value;
            }
        }

        return fields;
    }

    private ExtractRecordKey(xml: string, objectName: string): string {
        // After create, Sage Intacct typically returns the key in a <RECORDNO> or object-specific PK field
        const pkField = this.GetPrimaryKeyField(objectName);
        const value = this.ExtractXmlValue(xml, pkField)
            || this.ExtractXmlValue(xml, 'RECORDNO')
            || this.ExtractXmlValue(xml, 'key')
            || '';
        return value;
    }

    // ─── Utility Helpers ─────────────────────────────────────────────

    /**
     * Converts an attributes object to XML field elements.
     */
    private AttributesToXml(attributes: Record<string, unknown>): string {
        return Object.entries(attributes)
            .filter(([, v]) => v != null)
            .map(([key, value]) => `<${key}>${this.EscapeXmlValue(String(value))}</${key}>`)
            .join('\n                        ');
    }

    /**
     * Escapes special characters for XML content.
     */
    private EscapeXmlValue(value: string): string {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    /**
     * Gets the primary key field name for a Sage Intacct object, preferring
     * the IntegrationObject metadata (DefaultQueryParams.pk_field or the
     * IntegrationObjectField marked IsPrimaryKey) over the built-in fallback
     * map. Returns 'RECORDNO' when nothing else is available.
     *
     * This is called frequently — the lookup is cheap (pure engine cache) and
     * avoids hardcoded switch statements on object names.
     */
    private GetPrimaryKeyField(objectName: string, integrationID?: string): string {
        if (integrationID) {
            const fromMetadata = this.resolvePkFromMetadata(integrationID, objectName);
            if (fromMetadata) return fromMetadata;
        }
        return OBJECT_PK_MAP[objectName.toUpperCase()] || 'RECORDNO';
    }

    /**
     * Resolves the PK for an object from the engine cache.
     * Checks (in order): DefaultQueryParams.pk_field, then the field record
     * with IsPrimaryKey=true. Returns null when nothing is found.
     */
    private resolvePkFromMetadata(integrationID: string, objectName: string): string | null {
        try {
            const obj = IntegrationEngineBase.Instance.GetIntegrationObject(integrationID, objectName);
            if (!obj) return null;

            if (obj.DefaultQueryParams) {
                const parsed = JSON.parse(obj.DefaultQueryParams) as { pk_field?: string };
                if (parsed.pk_field && typeof parsed.pk_field === 'string') {
                    return parsed.pk_field;
                }
            }

            const fields = IntegrationEngineBase.Instance.GetIntegrationObjectFields(obj.ID);
            const pkField = fields.find(f => f.IsPrimaryKey && f.Status === 'Active');
            return pkField ? pkField.Name : null;
        } catch {
            return null;
        }
    }

    /**
     * Formats an API object name into a human-readable label.
     */
    private FormatLabel(name: string): string {
        // Convert ALLCAPS to Title Case with spaces before capitals
        return name
            .replace(/_/g, ' ')
            .replace(/([A-Z])([A-Z]+)/g, (_match, first: string, rest: string) =>
                first + rest.toLowerCase()
            )
            .replace(/^\w/, c => c.toUpperCase());
    }

    /**
     * Computes the latest WHENMODIFIED watermark from a batch of records.
     */
    private ComputeWatermark(records: Record<string, unknown>[]): string | undefined {
        let latest: string | undefined;
        for (const record of records) {
            const modified = record['WHENMODIFIED'];
            if (modified && typeof modified === 'string') {
                if (!latest || modified > latest) {
                    latest = modified;
                }
            }
        }
        return latest;
    }

    /**
     * Fetches more records using a readMore request with a resultId cursor.
     */
    private async FetchMoreRecords(
        session: SageIntacctSession,
        resultId: string,
        objectName: string,
        pkField: string
    ): Promise<FetchBatchResult & { NextCursor?: string }> {
        const xml = this.BuildReadMoreRequest(session, resultId);
        const response = await this.SendXMLRequest(session, xml);
        // readMore inherits the original page size; the engine batch-size
        // doesn't change mid-stream. DEFAULT_PAGE_SIZE is the server-side
        // default and matches what BuildReadByQueryRequest uses.
        return this.ParseReadByQueryResponse(response, objectName, pkField, DEFAULT_PAGE_SIZE);
    }

    /**
     * Throttles API requests to respect rate limits.
     */
    private async Throttle(minIntervalMs: number): Promise<void> {
        const elapsed = Date.now() - this.lastRequestTime;
        if (elapsed < minIntervalMs) {
            await this.Sleep(minIntervalMs - elapsed);
        }
    }

    private Sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private BuildCRUDError(err: unknown, operation: string, objectName: string): CRUDResult {
        const message = err instanceof Error ? err.message : String(err);
        return {
            Success: false,
            ErrorMessage: `${operation} failed for ${objectName}: ${message}`,
            StatusCode: 500,
        };
    }
}

/** Tree-shaking prevention function — import and call from module entry point */
export function LoadSageIntacctConnector(): void { /* no-op */ }
