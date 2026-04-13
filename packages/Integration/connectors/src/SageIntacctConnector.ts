import { RegisterClass } from '@memberjunction/global';
import { Metadata, type UserInfo } from '@memberjunction/core';
import type { MJCompanyIntegrationEntity, MJCredentialEntity } from '@memberjunction/core-entities';
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

/** Default page size for readByQuery */
const DEFAULT_PAGE_SIZE = 100;

/** Session lifetime — Sage Intacct sessions last ~10 minutes; refresh at 8 min */
const SESSION_LIFETIME_MS = 8 * 60 * 1000;

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
    {
        Name: 'LOCATION', DisplayName: 'Location',
        Description: 'A location in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'LOCATIONID', DisplayName: 'Location ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Location ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'PARENTID', DisplayName: 'Parent ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent ID' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'CONTACT', DisplayName: 'Contact',
        Description: 'A contact record in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'CONTACTNAME', DisplayName: 'Contact Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contact Name' },
            { Name: 'FIRSTNAME', DisplayName: 'First Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'First Name' },
            { Name: 'LASTNAME', DisplayName: 'Last Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Last Name' },
            { Name: 'EMAIL1', DisplayName: 'Email', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Email' },
            { Name: 'PHONE1', DisplayName: 'Phone', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Phone' },
            { Name: 'MAILADDRESS.ADDRESS1', DisplayName: 'Address Line 1', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Address Line 1' },
            { Name: 'MAILADDRESS.CITY', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'MAILADDRESS.STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State' },
            { Name: 'MAILADDRESS.ZIP', DisplayName: 'Zip Code', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Zip Code' },
            { Name: 'MAILADDRESS.COUNTRY', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'TERRITORY', DisplayName: 'Territory',
        Description: 'A sales territory in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'TERRITORYID', DisplayName: 'Territory ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Territory ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'PARENTID', DisplayName: 'Parent ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent ID' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'USERINFO', DisplayName: 'User',
        Description: 'A user account in Sage Intacct (read-only)', SupportsWrite: false,
        Fields: [
            { Name: 'LOGINID', DisplayName: 'Login ID', Type: 'string', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Login ID' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'USERTYPE', DisplayName: 'User Type', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'User Type' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'APPAYMENT', DisplayName: 'AP Payment',
        Description: 'An Accounts Payable payment in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'VENDORID', DisplayName: 'Vendor ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor ID' },
            { Name: 'VENDORNAME', DisplayName: 'Vendor Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Vendor Name' },
            { Name: 'PAYMENTDATE', DisplayName: 'Payment Date', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Date' },
            { Name: 'PAYMENTAMOUNT', DisplayName: 'Payment Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Amount' },
            { Name: 'PAYMENTMETHOD', DisplayName: 'Payment Method', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Method' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'APADJUSTMENT', DisplayName: 'AP Adjustment',
        Description: 'An Accounts Payable adjustment in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'VENDORID', DisplayName: 'Vendor ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor ID' },
            { Name: 'VENDORNAME', DisplayName: 'Vendor Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Vendor Name' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'APTERM', DisplayName: 'AP Term',
        Description: 'An Accounts Payable payment term in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Name' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'ARPAYMENT', DisplayName: 'AR Payment',
        Description: 'An Accounts Receivable payment in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer ID' },
            { Name: 'CUSTOMERNAME', DisplayName: 'Customer Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Customer Name' },
            { Name: 'PAYMENTDATE', DisplayName: 'Payment Date', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Date' },
            { Name: 'PAYMENTAMOUNT', DisplayName: 'Payment Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Amount' },
            { Name: 'PAYMENTMETHOD', DisplayName: 'Payment Method', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Method' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'ARADJUSTMENT', DisplayName: 'AR Adjustment',
        Description: 'An Accounts Receivable adjustment in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer ID' },
            { Name: 'CUSTOMERNAME', DisplayName: 'Customer Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Customer Name' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'ARTERM', DisplayName: 'AR Term',
        Description: 'An Accounts Receivable payment term in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Name' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'RECURRINGINVOICE', DisplayName: 'Recurring Invoice',
        Description: 'A recurring AR invoice in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer ID' },
            { Name: 'CUSTOMERNAME', DisplayName: 'Customer Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Customer Name' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'ITEM', DisplayName: 'Item',
        Description: 'An inventory item in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'ITEMID', DisplayName: 'Item ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Item ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'ITEMTYPE', DisplayName: 'Item Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item Type' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'PRODUCTLINEID', DisplayName: 'Product Line', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product Line' },
            { Name: 'EXTENDED_DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'WAREHOUSE', DisplayName: 'Warehouse',
        Description: 'A warehouse in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'WAREHOUSEID', DisplayName: 'Warehouse ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Warehouse ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'LOCATIONID', DisplayName: 'Location ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Location ID' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'PODOCUMENT', DisplayName: 'Purchase Order',
        Description: 'A purchase order in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'DOCID', DisplayName: 'Document ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Document ID' },
            { Name: 'VENDORID', DisplayName: 'Vendor ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor ID' },
            { Name: 'VENDORNAME', DisplayName: 'Vendor Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Vendor Name' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'WHENDUE', DisplayName: 'Due Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Due Date' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'SODOCUMENT', DisplayName: 'Sales Order',
        Description: 'A sales order in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'DOCID', DisplayName: 'Document ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Document ID' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer ID' },
            { Name: 'CUSTOMERNAME', DisplayName: 'Customer Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Customer Name' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'WHENDUE', DisplayName: 'Due Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Due Date' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'GLBATCH', DisplayName: 'GL Batch',
        Description: 'A General Ledger journal entry batch in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'JOURNAL', DisplayName: 'Journal', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Journal' },
            { Name: 'BATCH_DATE', DisplayName: 'Batch Date', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Batch Date' },
            { Name: 'BATCH_TITLE', DisplayName: 'Batch Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Batch Title' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'GLENTRY', DisplayName: 'GL Entry',
        Description: 'A General Ledger line entry in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'BATCHNO', DisplayName: 'Batch Number', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Batch Number' },
            { Name: 'ACCOUNTNO', DisplayName: 'Account Number', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account Number' },
            { Name: 'DEBIT', DisplayName: 'Debit Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Debit Amount' },
            { Name: 'CREDIT', DisplayName: 'Credit Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Credit Amount' },
            { Name: 'DEPARTMENTID', DisplayName: 'Department ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department ID' },
            { Name: 'LOCATIONID', DisplayName: 'Location ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Location ID' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'TASK', DisplayName: 'Task',
        Description: 'A project task in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'TASKID', DisplayName: 'Task ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Task ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'PROJECTID', DisplayName: 'Project ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Project ID' },
            { Name: 'PROJECTNAME', DisplayName: 'Project Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Project Name' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'BEGINDATE', DisplayName: 'Begin Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Begin Date' },
            { Name: 'ENDDATE', DisplayName: 'End Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End Date' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'TIMESHEET', DisplayName: 'Timesheet',
        Description: 'An employee timesheet in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'EMPLOYEEID', DisplayName: 'Employee ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employee ID' },
            { Name: 'BEGINDATE', DisplayName: 'Begin Date', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Begin Date' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'EEXPENSES', DisplayName: 'Expense Report',
        Description: 'An employee expense report in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'EMPLOYEEID', DisplayName: 'Employee ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employee ID' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'CHECKINGACCOUNT', DisplayName: 'Checking Account',
        Description: 'A checking/bank account in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'BANKACCOUNTID', DisplayName: 'Bank Account ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Bank Account ID' },
            { Name: 'BANKNAME', DisplayName: 'Bank Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Bank Name' },
            { Name: 'BANKACCOUNTNO', DisplayName: 'Account Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account Number' },
            { Name: 'GLACCOUNTNO', DisplayName: 'GL Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'GL Account' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'SAVINGSACCOUNT', DisplayName: 'Savings Account',
        Description: 'A savings account in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'BANKACCOUNTID', DisplayName: 'Bank Account ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Bank Account ID' },
            { Name: 'BANKNAME', DisplayName: 'Bank Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Bank Name' },
            { Name: 'BANKACCOUNTNO', DisplayName: 'Account Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account Number' },
            { Name: 'GLACCOUNTNO', DisplayName: 'GL Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'GL Account' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'CCTRANSACTION', DisplayName: 'Credit Card Transaction',
        Description: 'A credit card transaction in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'CARDID', DisplayName: 'Card ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Card ID' },
            { Name: 'WHENCREATED', DisplayName: 'Date Created', Type: 'date', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'CONTRACT', DisplayName: 'Contract',
        Description: 'A contract in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'CONTRACTID', DisplayName: 'Contract ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Contract ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer ID' },
            { Name: 'CUSTOMERNAME', DisplayName: 'Customer Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Customer Name' },
            { Name: 'BEGINDATE', DisplayName: 'Begin Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Begin Date' },
            { Name: 'ENDDATE', DisplayName: 'End Date', Type: 'date', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End Date' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'CONTRACTDETAIL', DisplayName: 'Contract Line',
        Description: 'A contract line item in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: true, Description: 'Record Number' },
            { Name: 'CONTRACTID', DisplayName: 'Contract ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contract ID' },
            { Name: 'ITEMID', DisplayName: 'Item ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item ID' },
            { Name: 'ITEMNAME', DisplayName: 'Item Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Item Name' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },
    {
        Name: 'SUPDOC', DisplayName: 'Supporting Document',
        Description: 'A supporting document/attachment in Sage Intacct', SupportsWrite: true,
        Fields: [
            { Name: 'SUPDOCID', DisplayName: 'Document ID', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: true, Description: 'Document ID' },
            { Name: 'SUPDOCNAME', DisplayName: 'Document Name', Type: 'string', IsRequired: true, IsReadOnly: false, IsPrimaryKey: false, Description: 'Document Name' },
            { Name: 'SUPDOCFOLDERNAME', DisplayName: 'Folder Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Folder Name' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'When Modified' },
        ],
    },

    // ── Additional Standard Objects (Tier 1 + Tier 2) ────────────────
    {
        Name: 'APACCOUNTLABEL', DisplayName: 'AP Account Label',
        Description: 'Accounts payable account label/type definitions', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ACCOUNTLABEL', DisplayName: 'Label', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Label' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'GLACCOUNTNO', DisplayName: 'GL Account Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'GL Account Number' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'APRECURBILL', DisplayName: 'Recurring AP Bill',
        Description: 'Recurring accounts payable bill templates', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'VENDORID', DisplayName: 'Vendor ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor ID' },
            { Name: 'VENDORNAME', DisplayName: 'Vendor Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Vendor Name' },
            { Name: 'TOTALDUE', DisplayName: 'Total Due', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total Due' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'RECUR_TYPE', DisplayName: 'Recurrence Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Recurrence Type' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'ARACCOUNTLABEL', DisplayName: 'AR Account Label',
        Description: 'Accounts receivable account label/type definitions', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ACCOUNTLABEL', DisplayName: 'Label', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Label' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'GLACCOUNTNO', DisplayName: 'GL Account Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'GL Account Number' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'ARADVANCE', DisplayName: 'AR Advance',
        Description: 'Accounts receivable advance payments', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer ID' },
            { Name: 'CUSTOMERNAME', DisplayName: 'Customer Name', Type: 'string', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Customer Name' },
            { Name: 'TOTALENTERED', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'DATECREATED', DisplayName: 'Date Created', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State' },
            { Name: 'CURRENCY', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Currency' },
        ],
    },
    {
        Name: 'CONTRACTEXPENSE', DisplayName: 'Contract Expense',
        Description: 'Contract expense entries', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'CONTRACTID', DisplayName: 'Contract ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Contract ID' },
            { Name: 'POSTINGDATE', DisplayName: 'Posting Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Posting Date' },
            { Name: 'AMOUNT', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'GLACCOUNTNO', DisplayName: 'GL Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'GL Account' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State' },
        ],
    },
    {
        Name: 'CONTRACTTYPE', DisplayName: 'Contract Type',
        Description: 'Contract type definitions', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
        ],
    },
    {
        Name: 'CREDITCARD', DisplayName: 'Charge Card Account',
        Description: 'Charge card/credit card account definitions', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'CARDID', DisplayName: 'Card ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Card ID' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'CARDTYPE', DisplayName: 'Card Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Card Type' },
            { Name: 'EXP_MONTH', DisplayName: 'Expiration Month', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Expiration Month' },
            { Name: 'EXP_YEAR', DisplayName: 'Expiration Year', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Expiration Year' },
            { Name: 'MAILADDRESS.ADDRESS1', DisplayName: 'Address', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Address' },
            { Name: 'MAILADDRESS.CITY', DisplayName: 'City', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'City' },
            { Name: 'MAILADDRESS.STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State' },
            { Name: 'MAILADDRESS.ZIP', DisplayName: 'Zip', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Zip' },
            { Name: 'MAILADDRESS.COUNTRY', DisplayName: 'Country', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Country' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'CUSTOMERGROUP', DisplayName: 'Customer Group',
        Description: 'Customer grouping for reporting and access', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ID', DisplayName: 'Group ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Group ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'MEMBERFILTER', DisplayName: 'Member Filter', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Member Filter' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'CUSTTYPE', DisplayName: 'Customer Type',
        Description: 'Customer classification types', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
        ],
    },
    {
        Name: 'DEPOSIT', DisplayName: 'Deposit',
        Description: 'Bank deposits', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'BANKACCOUNTID', DisplayName: 'Bank Account ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Bank Account ID' },
            { Name: 'DEPOSITDATE', DisplayName: 'Deposit Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Deposit Date' },
            { Name: 'TOTALENTERED', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State' },
            { Name: 'CURRENCY', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Currency' },
        ],
    },
    {
        Name: 'EARNINGTYPE', DisplayName: 'Earning Type',
        Description: 'Earning type definitions for timesheets', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
        ],
    },
    {
        Name: 'EEACCOUNTLABEL', DisplayName: 'Expense Type',
        Description: 'Expense type/account label definitions', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ACCOUNTLABEL', DisplayName: 'Label', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Label' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'GLACCOUNTNO', DisplayName: 'GL Account Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'GL Account Number' },
            { Name: 'ITEMID', DisplayName: 'Item ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item ID' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'EPPAYMENT', DisplayName: 'Expense Reimbursement',
        Description: 'Employee expense reimbursement payments', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'EMPLOYEEID', DisplayName: 'Employee ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employee ID' },
            { Name: 'PAYMENTDATE', DisplayName: 'Payment Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Date' },
            { Name: 'PAYMENTAMOUNT', DisplayName: 'Payment Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Amount' },
            { Name: 'BANKACCOUNTID', DisplayName: 'Bank Account ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Bank Account ID' },
            { Name: 'PAYMENTMETHOD', DisplayName: 'Payment Method', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Payment Method' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
        ],
    },
    {
        Name: 'EXCHANGERATE', DisplayName: 'Exchange Rate',
        Description: 'Currency exchange rate entries', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'RATETYPE', DisplayName: 'Rate Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Rate Type' },
            { Name: 'FROMCURRENCY', DisplayName: 'From Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'From Currency' },
            { Name: 'TOCURRENCY', DisplayName: 'To Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'To Currency' },
            { Name: 'EFFECTIVEDATE', DisplayName: 'Effective Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Effective Date' },
            { Name: 'RATE', DisplayName: 'Rate', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Rate' },
        ],
    },
    {
        Name: 'EXPENSEADJUSTMENTS', DisplayName: 'Expense Adjustment',
        Description: 'Adjustments to employee expense reports', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'EMPLOYEEID', DisplayName: 'Employee ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Employee ID' },
            { Name: 'SUPDOCID', DisplayName: 'Attachment ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Attachment ID' },
            { Name: 'TOTALENTERED', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'DATECREATED', DisplayName: 'Date Created', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State' },
        ],
    },
    {
        Name: 'FUNDSTRANSFER', DisplayName: 'Funds Transfer',
        Description: 'Transfers between bank accounts', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'FROMACCOUNTID', DisplayName: 'From Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'From Account' },
            { Name: 'TOACCOUNTID', DisplayName: 'To Account', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'To Account' },
            { Name: 'TRANSFERDATE', DisplayName: 'Transfer Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transfer Date' },
            { Name: 'AMOUNT', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'CURRENCY', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Currency' },
        ],
    },
    {
        Name: 'GLACCOUNTBALANCE', DisplayName: 'GL Account Balance',
        Description: 'Account balance data for reporting', SupportsWrite: false,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ACCOUNTNO', DisplayName: 'Account Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account Number' },
            { Name: 'ACCOUNTTITLE', DisplayName: 'Account Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account Title' },
            { Name: 'DEPARTMENTID', DisplayName: 'Department', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department' },
            { Name: 'LOCATIONID', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'TOTALDEBIT', DisplayName: 'Total Debit', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total Debit' },
            { Name: 'TOTALCREDIT', DisplayName: 'Total Credit', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total Credit' },
            { Name: 'TOTALENTERED', DisplayName: 'Total Entered', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total Entered' },
            { Name: 'PERIODNAME', DisplayName: 'Period Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Period Name' },
        ],
    },
    {
        Name: 'GLACCTALLOCATION', DisplayName: 'GL Account Allocation',
        Description: 'Account allocation definitions for distributing amounts', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ALLOCATIONID', DisplayName: 'Allocation ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Allocation ID' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'ALLOCATEBY', DisplayName: 'Allocate By', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Allocate By' },
            { Name: 'TYPE', DisplayName: 'Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Type' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'GLBUDGETHEADER', DisplayName: 'GL Budget',
        Description: 'General ledger budget definitions', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'BUDGETID', DisplayName: 'Budget ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Budget unique ID' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'CURRENCY', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Currency' },
            { Name: 'STARTPERIOD', DisplayName: 'Start Period', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Start Period' },
            { Name: 'ENDPERIOD', DisplayName: 'End Period', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End Period' },
            { Name: 'DEFAULT_BUDGET', DisplayName: 'Default Budget', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Default Budget' },
        ],
    },
    {
        Name: 'GLBUDGETITEM', DisplayName: 'GL Budget Item',
        Description: 'Budget line items with period amounts', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'BUDGETKEY', DisplayName: 'Budget Key', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Budget Key' },
            { Name: 'ACCT_NO', DisplayName: 'Account Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account Number' },
            { Name: 'AMOUNT', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'PERIODNAME', DisplayName: 'Period Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Period Name' },
            { Name: 'DEPARTMENTID', DisplayName: 'Department ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department ID' },
            { Name: 'LOCATIONID', DisplayName: 'Location ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Location ID' },
            { Name: 'CLASSID', DisplayName: 'Class ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Class ID' },
        ],
    },
    {
        Name: 'INVDOCUMENT', DisplayName: 'Inventory Transaction',
        Description: 'Inventory transactions (receipts, shipments, adjustments)', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'DOCID', DisplayName: 'Document ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Document ID' },
            { Name: 'TRANSACTIONTYPE', DisplayName: 'Transaction Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Transaction Type' },
            { Name: 'DATECREATED', DisplayName: 'Date Created', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Date Created' },
            { Name: 'WAREHOUSEID', DisplayName: 'Warehouse ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Warehouse ID' },
            { Name: 'TOTAL', DisplayName: 'Total', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Total' },
            { Name: 'STATE', DisplayName: 'State', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'State' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
        ],
    },
    {
        Name: 'ITEMGROUP', DisplayName: 'Item Group',
        Description: 'Item grouping for reporting and access', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ID', DisplayName: 'Group ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Group ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'MEMBERFILTER', DisplayName: 'Member Filter', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Member Filter' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'ITEMWAREHOUSEINFO', DisplayName: 'Item Warehouse Info',
        Description: 'Item-warehouse relationships with stock and location data', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ITEMID', DisplayName: 'Item ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item ID' },
            { Name: 'WAREHOUSEID', DisplayName: 'Warehouse ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Warehouse ID' },
            { Name: 'ONHAND', DisplayName: 'On Hand Qty', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'On Hand Qty' },
            { Name: 'ONORDER', DisplayName: 'On Order Qty', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'On Order Qty' },
            { Name: 'ONHOLD', DisplayName: 'On Hold Qty', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'On Hold Qty' },
            { Name: 'REORDERPOINT', DisplayName: 'Reorder Point', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Reorder Point' },
            { Name: 'REORDERQTY', DisplayName: 'Reorder Quantity', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Reorder Quantity' },
            { Name: 'MAXORDERQTY', DisplayName: 'Max Order Qty', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Max Order Qty' },
            { Name: 'SAFETYSTOCK', DisplayName: 'Safety Stock', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Safety Stock' },
        ],
    },
    {
        Name: 'LOCATIONENTITY', DisplayName: 'Entity/Subsidiary',
        Description: 'Legal entities and subsidiaries', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ENTITYID', DisplayName: 'Entity ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Entity ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'PARENTID', DisplayName: 'Parent Entity ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Parent Entity ID' },
            { Name: 'TAXID', DisplayName: 'Tax ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax ID' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'CURRENCY', DisplayName: 'Currency', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Currency' },
        ],
    },
    {
        Name: 'PODOCUMENTENTRY', DisplayName: 'PO Line Item',
        Description: 'Purchase order/transaction line items', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'PODOCUMENTKEY', DisplayName: 'PO Document Key', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'PO Document Key' },
            { Name: 'ITEMID', DisplayName: 'Item ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item ID' },
            { Name: 'ITEMDESC', DisplayName: 'Item Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item Description' },
            { Name: 'QUANTITY', DisplayName: 'Quantity', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Quantity' },
            { Name: 'UNIT', DisplayName: 'Unit', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Unit' },
            { Name: 'PRICE', DisplayName: 'Price', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Price' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'DEPARTMENTID', DisplayName: 'Department', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department' },
            { Name: 'LOCATIONID', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'CLASSID', DisplayName: 'Class', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Class' },
            { Name: 'VENDORID', DisplayName: 'Vendor ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Vendor ID' },
        ],
    },
    {
        Name: 'PRODUCTLINE', DisplayName: 'Product Line',
        Description: 'Product line definitions for item categorization', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'PRODUCTLINEID', DisplayName: 'Product Line ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Product Line ID' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'PROJECTTYPE', DisplayName: 'Project Type',
        Description: 'Project type definitions', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
        ],
    },
    {
        Name: 'REPORTINGPERIOD', DisplayName: 'Reporting Period',
        Description: 'Fiscal reporting period definitions', SupportsWrite: false,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'HEADER1', DisplayName: 'Header', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Header' },
            { Name: 'START_DATE', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Start Date' },
            { Name: 'END_DATE', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End Date' },
            { Name: 'BUDGETABLE', DisplayName: 'Budgetable', Type: 'boolean', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Budgetable' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'REVRECSCHEDULE', DisplayName: 'Revenue Recognition Schedule',
        Description: 'Revenue recognition schedule definitions', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'SCHEDULEKEY', DisplayName: 'Schedule Key', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Schedule Key' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'POSTINGTYPE', DisplayName: 'Posting Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Posting Type' },
            { Name: 'REVRECTEMPLATEKEY', DisplayName: 'Template Key', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Template Key' },
            { Name: 'AMOUNT', DisplayName: 'Amount', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Amount' },
            { Name: 'STARTDATE', DisplayName: 'Start Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Start Date' },
            { Name: 'ENDDATE', DisplayName: 'End Date', Type: 'datetime', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'End Date' },
        ],
    },
    {
        Name: 'ROLES', DisplayName: 'User Role',
        Description: 'User role definitions for access control', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ROLEID', DisplayName: 'Role ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Role ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'SODOCUMENTENTRY', DisplayName: 'SO Line Item',
        Description: 'Sales order/transaction line items', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'SODOCUMENTKEY', DisplayName: 'SO Document Key', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'SO Document Key' },
            { Name: 'ITEMID', DisplayName: 'Item ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item ID' },
            { Name: 'ITEMDESC', DisplayName: 'Item Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Item Description' },
            { Name: 'QUANTITY', DisplayName: 'Quantity', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Quantity' },
            { Name: 'UNIT', DisplayName: 'Unit', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Unit' },
            { Name: 'PRICE', DisplayName: 'Price', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Price' },
            { Name: 'TOTALAMOUNT', DisplayName: 'Total Amount', Type: 'number', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Total Amount' },
            { Name: 'DEPARTMENTID', DisplayName: 'Department', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Department' },
            { Name: 'LOCATIONID', DisplayName: 'Location', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Location' },
            { Name: 'CLASSID', DisplayName: 'Class', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Class' },
            { Name: 'CUSTOMERID', DisplayName: 'Customer ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Customer ID' },
        ],
    },
    {
        Name: 'STATACCOUNT', DisplayName: 'Statistical Account',
        Description: 'Statistical (non-financial) accounts for tracking', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ACCOUNTNO', DisplayName: 'Account Number', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account Number' },
            { Name: 'TITLE', DisplayName: 'Title', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Title' },
            { Name: 'ACCOUNTTYPE', DisplayName: 'Account Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Account Type' },
            { Name: 'NORMALBALANCE', DisplayName: 'Normal Balance', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Normal Balance' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'TAXDETAIL', DisplayName: 'Tax Detail',
        Description: 'Tax detail definitions for tax calculations', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'DETAILID', DisplayName: 'Detail ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Detail ID' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'TAXTYPE', DisplayName: 'Tax Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax Type' },
            { Name: 'VALUE', DisplayName: 'Value/Rate', Type: 'number', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Value/Rate' },
            { Name: 'TAXAUTHORITY', DisplayName: 'Tax Authority', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Tax Authority' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'TAXSOLUTION', DisplayName: 'Tax Solution',
        Description: 'Tax solution configurations', SupportsWrite: false,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'TAXSOLUTIONID', DisplayName: 'Solution ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Solution ID' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'SOLUTIONTYPE', DisplayName: 'Solution Type', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Solution Type' },
        ],
    },
    {
        Name: 'TIMETYPE', DisplayName: 'Time Type',
        Description: 'Time type definitions for timesheets', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
        ],
    },
    {
        Name: 'UOM', DisplayName: 'Unit of Measure',
        Description: 'Unit of measure definitions', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'ABBREVIATION', DisplayName: 'Abbreviation', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Abbreviation' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'VENDORGROUP', DisplayName: 'Vendor Group',
        Description: 'Vendor grouping for reporting and access', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'ID', DisplayName: 'Group ID', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Group ID' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'MEMBERFILTER', DisplayName: 'Member Filter', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Member Filter' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
        ],
    },
    {
        Name: 'VENDTYPE', DisplayName: 'Vendor Type',
        Description: 'Vendor classification types', SupportsWrite: true,
        Fields: [
            { Name: 'RECORDNO', DisplayName: 'Record Number', Type: 'number', IsRequired: true, IsReadOnly: true, IsPrimaryKey: true, Description: 'Sage Intacct record number' },
            { Name: 'WHENMODIFIED', DisplayName: 'When Modified', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Last modification timestamp' },
            { Name: 'WHENCREATED', DisplayName: 'When Created', Type: 'datetime', IsRequired: false, IsReadOnly: true, IsPrimaryKey: false, Description: 'Creation timestamp' },
            { Name: 'NAME', DisplayName: 'Name', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Name' },
            { Name: 'STATUS', DisplayName: 'Status', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Status' },
            { Name: 'DESCRIPTION', DisplayName: 'Description', Type: 'string', IsRequired: false, IsReadOnly: false, IsPrimaryKey: false, Description: 'Description' },
        ],
    },

];

/** Primary key field name for each known Sage Intacct object */
const OBJECT_PK_MAP: Record<string, string> = {
    CUSTOMER: 'CUSTOMERID',
    VENDOR: 'VENDORID',
    GLACCOUNT: 'ACCOUNTNO',
    APBILL: 'RECORDNO',
    ARINVOICE: 'RECORDNO',
    PROJECT: 'PROJECTID',
    EMPLOYEE: 'EMPLOYEEID',
    DEPARTMENT: 'DEPARTMENTID',
    CLASS: 'CLASSID',
    LOCATION: 'LOCATIONID',
    CONTACT: 'RECORDNO',
    TERRITORY: 'TERRITORYID',
    USERINFO: 'LOGINID',
    APPAYMENT: 'RECORDNO',
    APADJUSTMENT: 'RECORDNO',
    APTERM: 'NAME',
    ARPAYMENT: 'RECORDNO',
    ARADJUSTMENT: 'RECORDNO',
    ARTERM: 'NAME',
    RECURRINGINVOICE: 'RECORDNO',
    ITEM: 'ITEMID',
    WAREHOUSE: 'WAREHOUSEID',
    PODOCUMENT: 'DOCID',
    SODOCUMENT: 'DOCID',
    GLBATCH: 'RECORDNO',
    GLENTRY: 'RECORDNO',
    TASK: 'TASKID',
    TIMESHEET: 'RECORDNO',
    EEXPENSES: 'RECORDNO',
    CHECKINGACCOUNT: 'BANKACCOUNTID',
    SAVINGSACCOUNT: 'BANKACCOUNTID',
    CCTRANSACTION: 'RECORDNO',
    CONTRACT: 'CONTRACTID',
    CONTRACTDETAIL: 'RECORDNO',
    SUPDOC: 'SUPDOCID',
};

/** Objects that use legacy API functions (create_*, update_*, delete_*) instead of the
 *  generic CRUD API. These require different XML structures. */
const LEGACY_FUNCTION_OBJECTS = new Set(['APBILL', 'ARINVOICE']);

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
        try {
            const session = await this.GetSession(companyIntegration, contextUser);
            const xml = this.BuildInspectRequest(session, '*');
            const response = await this.SendXMLRequest(session, xml);
            const types = this.ParseInspectObjectsResponse(response);

            return types.map(name => ({
                Name: name,
                Label: this.FormatLabel(name),
                SupportsIncrementalSync: true,
                SupportsWrite: true,
            }));
        } catch {
            // Fallback to known objects
            return SAGE_INTACCT_OBJECTS.map(obj => ({
                Name: obj.Name,
                Label: obj.DisplayName,
                Description: obj.Description,
                SupportsIncrementalSync: true,
                SupportsWrite: obj.SupportsWrite,
            }));
        }
    }

    /**
     * Discovers fields on a specific object using the inspect API function.
     */
    public async DiscoverFields(
        companyIntegration: MJCompanyIntegrationEntity,
        objectName: string,
        contextUser: UserInfo
    ): Promise<ExternalFieldSchema[]> {
        try {
            const session = await this.GetSession(companyIntegration, contextUser);
            const xml = this.BuildInspectRequest(session, objectName);
            const response = await this.SendXMLRequest(session, xml);
            const fields = this.ParseInspectFieldsResponse(response);

            return fields.map(f => ({
                Name: f.Name,
                Label: f.Label || this.FormatLabel(f.Name),
                DataType: INTACCT_TYPE_MAP[f.DataType.toLowerCase()] ?? 'string',
                IsRequired: f.IsRequired,
                IsUniqueKey: f.Name === this.GetPrimaryKeyField(objectName),
                IsReadOnly: f.IsReadOnly,
            }));
        } catch {
            // Fallback to known object fields
            const obj = SAGE_INTACCT_OBJECTS.find(o => o.Name.toLowerCase() === objectName.toLowerCase());
            if (!obj) return [];
            return obj.Fields.map(f => ({
                Name: f.Name,
                Label: f.DisplayName,
                Description: f.Description,
                DataType: f.Type,
                IsRequired: f.IsRequired,
                IsUniqueKey: f.IsPrimaryKey,
                IsReadOnly: f.IsReadOnly,
            }));
        }
    }

    // ─── FetchChanges ────────────────────────────────────────────────

    /**
     * Fetches records using readByQuery with WHENMODIFIED watermark filtering.
     * Supports pagination via readMore with resultId tokens.
     */
    public async FetchChanges(ctx: FetchContext): Promise<FetchBatchResult> {
        const session = await this.GetSession(ctx.CompanyIntegration, ctx.ContextUser);
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName);
        const pageSize = Math.min(ctx.BatchSize || DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);

        // If we have a cursor (resultId) from a previous call, use readMore
        if (ctx.CurrentCursor) {
            return this.FetchMoreRecords(session, ctx.CurrentCursor, ctx.ObjectName, pkField);
        }

        // Build the query filter
        const filter = ctx.WatermarkValue
            ? `WHENMODIFIED >= '${ctx.WatermarkValue}'`
            : '';

        const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, pageSize);
        const response = await this.SendXMLRequest(session, xml);
        return this.ParseReadByQueryResponse(response, ctx.ObjectName, pkField);
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

        const xml = this.BuildUpdateRequest(session, ctx.ObjectName, ctx.ExternalID, ctx.Attributes);
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
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName);

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
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName);
        const pageSize = ctx.PageSize ?? DEFAULT_PAGE_SIZE;

        const filterParts = Object.entries(ctx.Filters).map(
            ([field, value]) => `${field} = '${this.EscapeXmlValue(String(value))}'`
        );
        const filter = filterParts.join(' AND ');

        const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, pageSize);
        const response = await this.SendXMLRequest(session, xml);
        const result = this.ParseReadByQueryResponse(response, ctx.ObjectName, pkField);

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
        const pkField = this.GetPrimaryKeyField(ctx.ObjectName);
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

        const xml = this.BuildReadByQueryRequest(session, ctx.ObjectName, filter, pageSize);
        const response = await this.SendXMLRequest(session, xml);
        const result = this.ParseReadByQueryResponse(response, ctx.ObjectName, pkField);

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
        contextUser: UserInfo
    ): Promise<SageIntacctConnectionConfig | null> {
        const md = new Metadata();
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
        pageSize: number
    ): string {
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
        attributes: Record<string, unknown>
    ): string {
        const pkField = this.GetPrimaryKeyField(objectName);
        const fieldsXml = this.AttributesToXml({ [pkField]: key, ...attributes });
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

    private ParseReadByQueryResponse(
        xml: string,
        objectName: string,
        pkField: string
    ): FetchBatchResult & { NextCursor?: string } {
        this.CheckForErrors(xml);

        const numRemaining = parseInt(this.ExtractXmlValue(xml, 'numremaining') || '0', 10);
        const resultId = this.ExtractXmlValue(xml, 'resultId') || undefined;
        const records = this.ExtractRecords(xml, objectName);

        const externalRecords: ExternalRecord[] = records.map(r => ({
            ExternalID: String(r[pkField] ?? ''),
            ObjectType: objectName,
            Fields: r,
            ModifiedAt: r['WHENMODIFIED'] ? new Date(String(r['WHENMODIFIED'])) : undefined,
        }));

        // Compute watermark from the latest WHENMODIFIED in this batch
        const newWatermark = this.ComputeWatermark(records);

        return {
            Records: externalRecords,
            HasMore: numRemaining > 0,
            NewWatermarkValue: newWatermark,
            NextCursor: numRemaining > 0 ? resultId : undefined,
        };
    }

    private ParseSingleRecord(xml: string, objectName: string): Record<string, unknown> | null {
        this.CheckForErrors(xml);
        const records = this.ExtractRecords(xml, objectName);
        return records.length > 0 ? records[0] : null;
    }

    private ParseInspectObjectsResponse(xml: string): string[] {
        this.CheckForErrors(xml);
        const objectNames: string[] = [];

        // inspect with '*' returns <type>OBJECTNAME</type> elements
        const typeRegex = /<type[^>]*>([^<]+)<\/type>/gi;
        let match: RegExpExecArray | null;
        while ((match = typeRegex.exec(xml)) !== null) {
            objectNames.push(match[1].trim());
        }
        return objectNames;
    }

    private ParseInspectFieldsResponse(xml: string): IntacctFieldDef[] {
        this.CheckForErrors(xml);
        const fields: IntacctFieldDef[] = [];

        // inspect returns <Field> elements with <Name>, <DataType>, etc.
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

            if (name) {
                fields.push({ Name: name, Label: label, DataType: dataType, IsRequired: isRequired, IsReadOnly: isReadOnly });
            }
        }

        return fields;
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
     * Gets the primary key field name for a Sage Intacct object.
     */
    private GetPrimaryKeyField(objectName: string): string {
        return OBJECT_PK_MAP[objectName.toUpperCase()] || 'RECORDNO';
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
        return this.ParseReadByQueryResponse(response, objectName, pkField);
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
