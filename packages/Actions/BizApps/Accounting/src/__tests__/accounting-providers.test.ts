import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Per-action tests for the Accounting providers (QuickBooks Online and
 * Microsoft Dynamics 365 Business Central).
 *
 * The SDK boundary is each base class's request helper (`makeQBORequest` /
 * `queryQBO` / `makeBCRequest`), spied per test — the same pattern the LMS
 * package uses with `makeLearnWorldsPaginatedRequest`. Base-class helpers
 * (validateJournalEntryBalance, mapAccountType, date formatting) are covered
 * in accounting.test.ts.
 */

vi.mock('@memberjunction/actions', () => ({
  BaseAction: class BaseAction {
    async Run(params: unknown) {
      return (this as { InternalRunAction(p: unknown): Promise<unknown> }).InternalRunAction(params);
    }
  },
  OAuth2Manager: class OAuth2Manager {},
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
  UUIDsEqual: (a: string, b: string) => a === b,
  IsValidUUID: (value: string | null | undefined) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? '').trim()),
  EscapeSQLString: (value: string | null | undefined) => String(value ?? '').replace(/'/g, "''"),
  MJGlobal: {
    Instance: {
      ClassFactory: {
        TryCreateInstance: vi.fn(),
      },
    },
  },
}));

vi.mock('@memberjunction/core', () => ({
  UserInfo: class UserInfo {},
  Metadata: vi.fn(),
  LogStatus: vi.fn(),
  LogError: vi.fn(),
  RunView: vi.fn().mockImplementation(() => ({
    RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
  })),
}));

vi.mock('@memberjunction/core-entities', () => ({
  MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {},
  MJIntegrationEntity: class MJIntegrationEntity {},
  MJCredentialEntity: class MJCredentialEntity {},
}));

// The token endpoint is the SDK boundary for connector-style Business Central auth.
const { getAccessTokenMock } = vi.hoisted(() => ({ getAccessTokenMock: vi.fn() }));
vi.mock('@memberjunction/integration-engine', () => ({
  OAuth2TokenManager: class OAuth2TokenManager {
    GetAccessToken(request: unknown, grant: string): Promise<unknown> {
      return getAccessTokenMock(request, grant);
    }
  },
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {},
}));

import { MJGlobal } from '@memberjunction/global';
import { LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { CreateQuickBooksJournalEntryAction } from '../providers/quickbooks/actions/create-journal-entry.action';
import { GetQuickBooksAccountBalancesAction } from '../providers/quickbooks/actions/get-account-balances.action';
import { GetQuickBooksGLCodesAction } from '../providers/quickbooks/actions/get-gl-codes.action';
import { GetQuickBooksTransactionsAction } from '../providers/quickbooks/actions/get-transactions.action';
import { GetQuickBooksDimensionsAction } from '../providers/quickbooks/actions/get-dimensions.action';
import { GetBusinessCentralCustomersAction } from '../providers/business-central/actions/get-customers.action';
import { GetBusinessCentralGeneralLedgerEntriesAction } from '../providers/business-central/actions/get-general-ledger-entries.action';
import { GetBusinessCentralGLAccountsAction } from '../providers/business-central/actions/get-gl-accounts.action';
import { GetBusinessCentralSalesInvoicesAction } from '../providers/business-central/actions/get-sales-invoices.action';
import { CreateBusinessCentralJournalEntryAction } from '../providers/business-central/actions/create-journal-entry.action';
import { GetBusinessCentralAccountBalancesAction } from '../providers/business-central/actions/get-account-balances.action';
import { GetBusinessCentralDimensionsAction } from '../providers/business-central/actions/get-dimensions.action';
import { CreateJournalEntryAction } from '../verbs/create-journal-entry.action';
import { BusinessCentralBaseAction } from '../providers/business-central/business-central-base.action';
import {
  BC_DEFAULT_AUTHORITY_HOST,
  BC_DEFAULT_SCOPE,
  ClearBusinessCentralTokenManagers,
  GetBusinessCentralTokenManager,
  ResolveBusinessCentralConnectorConfig,
} from '../providers/business-central/business-central-connection';
import { ACCOUNTING_VERBS, ERP_INTEGRATION, ErpPluginKey } from '../constants';

const contextUser = { ID: 'user-1', Name: 'Test User', Email: 'test@example.com' } as unknown as UserInfo;

type RunnableAction = { InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> };

function inputs(values: Record<string, unknown>): ActionParam[] {
  return Object.entries(values).map(([Name, Value]) => ({ Name, Value, Type: 'Input' } as ActionParam));
}

async function run(action: object, params: ActionParam[]): Promise<ActionResultSimple> {
  const runParams = { Params: params, ContextUser: contextUser } as unknown as RunActionParams;
  return (action as RunnableAction).InternalRunAction(runParams);
}

async function runWithoutUser(action: object, params: ActionParam[]): Promise<ActionResultSimple> {
  const runParams = { Params: params, ContextUser: undefined } as unknown as RunActionParams;
  return (action as RunnableAction).InternalRunAction(runParams);
}

function outParam(result: ActionResultSimple, name: string): unknown {
  return result.Params?.find((p) => p.Name === name)?.Value;
}

const COMPANY_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_COMPANY_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const CI_PROD = 'cccccccc-0000-4000-8000-000000000001';
const CI_UAT = 'cccccccc-0000-4000-8000-000000000002';
const CREDENTIAL_ID = 'dddddddd-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;

/** Every `new RunView()` returns a RunView() that resolves to `results`. */
function mockRunViewResults(results: Row[]) {
  const runViewFn = vi.fn().mockResolvedValue({ Success: true, Results: results });
  vi.mocked(RunView).mockImplementation(function (this: unknown) {
    return { RunView: runViewFn };
  } as never);
  return runViewFn;
}

/**
 * `new Metadata().GetEntityObject(entityName).Load(id)` fills the entity from `rows[entityName]`
 * (or returns false when there is no row). Returns the log of loads.
 */
function mockEntityLoads(rows: Record<string, Row | null>) {
  const loads: Array<{ entity: string; id: string }> = [];
  vi.mocked(Metadata).mockImplementation(function (this: unknown) {
    return {
      GetEntityObject: vi.fn(async (entityName: string) => ({
        async Load(this: Row, id: string) {
          loads.push({ entity: entityName, id });
          const row = rows[entityName];
          if (!row) {
            return false;
          }
          Object.assign(this, row);
          return true;
        },
      })),
    };
  } as never);
  return loads;
}

function connectionRow(id: string, name: string, integration: string, overrides: Row = {}): Row {
  return {
    ID: id,
    Name: name,
    CompanyID: COMPANY_ID,
    IntegrationID: 'int-bc',
    Integration: integration,
    IsActive: true,
    CredentialID: null,
    Configuration: null,
    ...overrides,
  };
}

/** A plugin stand-in that records the params it was run with. */
function recordingPlugin() {
  const runFn = vi.fn(async (runParams: RunActionParams): Promise<ActionResultSimple> => ({
    Success: true,
    ResultCode: 'SUCCESS',
    Params: runParams.Params,
  }));
  vi.mocked(MJGlobal.Instance.ClassFactory.TryCreateInstance).mockReturnValue({
    Resolved: true,
    Instance: { Run: runFn },
  } as never);
  return runFn;
}

function paramsPassedTo(runFn: ReturnType<typeof recordingPlugin>): ActionParam[] {
  return (runFn.mock.calls[0][0] as RunActionParams).Params;
}

const BALANCED_LINES = [
  { accountNumber: '1000', debit: 100 },
  { accountNumber: '2000', credit: 100 },
];

// ─── QuickBooks: CreateQuickBooksJournalEntryAction ─────────────────────────

describe('CreateQuickBooksJournalEntryAction', () => {
  let action: CreateQuickBooksJournalEntryAction;

  beforeEach(() => {
    action = new CreateQuickBooksJournalEntryAction();
  });

  it('should fail with ERROR when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Context user is required for QuickBooks API calls');
  });

  it('should fail when Lines is missing', async () => {
    const result = await run(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Lines parameter is required');
  });

  it('should fail when Lines is malformed JSON', async () => {
    const result = await run(action, inputs({ CompanyID: 'comp-1', Lines: '{not json' }));
    expect(result.Message).toBe('Invalid JSON format for Lines parameter');
  });

  it('should fail when Lines is not an array', async () => {
    const result = await run(action, inputs({ CompanyID: 'comp-1', Lines: { accountId: '1' } }));
    expect(result.Message).toBe('Lines must be an array');
  });

  it('should require at least 2 lines', async () => {
    const result = await run(action, inputs({ CompanyID: 'comp-1', Lines: [{ accountId: '1', debit: 100 }] }));
    expect(result.Message).toBe('Journal entry must have at least 2 lines');
  });

  it('should require accountId or accountNumber on every line', async () => {
    const result = await run(
      action,
      inputs({ CompanyID: 'comp-1', Lines: [{ debit: 100 }, { accountId: '2', credit: 100 }] }),
    );
    expect(result.Message).toBe('Line 1: accountId or accountNumber is required');
  });

  it('should require accountId on QBO even when accountNumber is present', async () => {
    const result = await run(
      action,
      inputs({
        CompanyID: 'comp-1',
        Lines: [
          { accountNumber: '1000', debit: 100 },
          { accountId: '2', credit: 100 },
        ],
      }),
    );
    expect(result.Message).toBe('Line 1: accountId is required for QuickBooks Online');
  });

  it('should require either debit or credit on every line', async () => {
    const result = await run(
      action,
      inputs({ CompanyID: 'comp-1', Lines: [{ accountId: '1' }, { accountId: '2', credit: 100 }] }),
    );
    expect(result.Message).toBe('Line 1: either debit or credit amount is required');
  });

  it('should reject a line carrying both debit and credit', async () => {
    const result = await run(
      action,
      inputs({ CompanyID: 'comp-1', Lines: [{ accountId: '1', debit: 100, credit: 100 }, { accountId: '2', credit: 100 }] }),
    );
    expect(result.Message).toBe('Line 1: cannot have both debit and credit on the same line');
  });

  it('should reject negative amounts', async () => {
    const debit = await run(
      action,
      inputs({ CompanyID: 'comp-1', Lines: [{ accountId: '1', debit: -5 }, { accountId: '2', credit: 100 }] }),
    );
    expect(debit.Message).toBe('Line 1: debit amount cannot be negative');

    const credit = await run(
      action,
      inputs({ CompanyID: 'comp-1', Lines: [{ accountId: '1', debit: 100 }, { accountId: '2', credit: -5 }] }),
    );
    expect(credit.Message).toBe('Line 2: credit amount cannot be negative');
  });

  it('should fail with VALIDATION_ERROR when debits do not equal credits', async () => {
    const result = await run(
      action,
      inputs({ CompanyID: 'comp-1', Lines: [{ accountId: '1', debit: 100 }, { accountId: '2', credit: 50 }] }),
    );
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(result.Message).toBe('Journal entry is not balanced. Total debits must equal total credits.');
  });

  it('should POST journalentry with the mapped QBO line items', async () => {
    const spy = vi.spyOn(action as never, 'makeQBORequest').mockResolvedValue({
      JournalEntry: {
        Id: 'je-1',
        DocNumber: 'JE-100',
        TotalAmt: 100,
        MetaData: { CreateTime: '2024-06-15T10:00:00Z' },
      },
    } as never);

    const result = await run(
      action,
      inputs({
        CompanyID: 'comp-1',
        DocNumber: 'JE-100',
        EntryDate: '2024-06-15',
        Lines: [
          { accountId: 'acct-1', debit: 100, description: 'Debit side' },
          { accountId: 'acct-2', credit: 100 },
        ],
      }),
    );

    const [endpoint, method, payload] = spy.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect(endpoint).toBe('journalentry');
    expect(method).toBe('POST');
    expect(payload.DocNumber).toBe('JE-100');
    expect(payload.Line).toEqual([
      {
        DetailType: 'JournalEntryLineDetail',
        Amount: 100,
        Description: 'Debit side',
        JournalEntryLineDetail: { PostingType: 'Debit', AccountRef: { value: 'acct-1' } },
      },
      {
        DetailType: 'JournalEntryLineDetail',
        Amount: 100,
        JournalEntryLineDetail: { PostingType: 'Credit', AccountRef: { value: 'acct-2' } },
      },
    ]);
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Journal entry JE-100 created successfully');
    expect(outParam(result, 'JournalEntryID')).toBe('je-1');
  });
});

// ─── QuickBooks: GetQuickBooksGLCodesAction ─────────────────────────────────

describe('GetQuickBooksGLCodesAction', () => {
  let action: GetQuickBooksGLCodesAction;

  beforeEach(() => {
    action = new GetQuickBooksGLCodesAction();
  });

  it('should fail with ERROR when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Context user is required for QuickBooks API calls');
  });

  it('should build the Account query with the Active filter by default', async () => {
    const spy = vi.spyOn(action as never, 'queryQBO').mockResolvedValue({ QueryResponse: { Account: [] } } as never);

    const result = await run(action, inputs({ CompanyID: 'comp-1' }));

    expect(spy.mock.calls[0][0]).toBe('SELECT * FROM Account WHERE Active = true ORDER BY FullyQualifiedName');
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved 0 GL codes from QuickBooks');
    expect(outParam(result, 'TotalCount')).toBe(0);
  });

  it('should add account type and parent filters to the query', async () => {
    const spy = vi.spyOn(action as never, 'queryQBO').mockResolvedValue({ QueryResponse: { Account: [] } } as never);

    await run(
      action,
      inputs({ CompanyID: 'comp-1', IncludeInactive: true, AccountTypes: 'Bank, Expense', ParentAccountID: 'p-1' }),
    );

    expect(spy.mock.calls[0][0]).toBe(
      "SELECT * FROM Account WHERE AccountType IN ('Bank','Expense') AND ParentRef = 'p-1' ORDER BY FullyQualifiedName",
    );
  });
});

// ─── QuickBooks: GetQuickBooksAccountBalancesAction ─────────────────────────

describe('GetQuickBooksAccountBalancesAction', () => {
  let action: GetQuickBooksAccountBalancesAction;

  beforeEach(() => {
    action = new GetQuickBooksAccountBalancesAction();
  });

  it('should fail with ERROR when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Context user is required for QuickBooks API calls');
  });

  it('should query account balances and report success', async () => {
    vi.spyOn(action as never, 'queryQBO').mockResolvedValue({ QueryResponse: { Account: [] } } as never);

    const result = await run(action, inputs({ CompanyID: 'comp-1' }));

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(outParam(result, 'TotalAccounts')).toBe(0);
  });
});

// ─── QuickBooks: GetQuickBooksTransactionsAction ────────────────────────────

describe('GetQuickBooksTransactionsAction', () => {
  let action: GetQuickBooksTransactionsAction;

  beforeEach(() => {
    action = new GetQuickBooksTransactionsAction();
  });

  it('should fail with ERROR_NO_CONTEXT_USER when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR_NO_CONTEXT_USER');
    expect(result.Message).toBe('Context user is required for QuickBooks API calls');
  });

  it('should query transactions and report the retrieved count', async () => {
    vi.spyOn(action as never, 'queryQBO').mockResolvedValue({ QueryResponse: {} } as never);

    const result = await run(action, inputs({ CompanyID: 'comp-1' }));

    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved 0 transactions');
    expect(outParam(result, 'TotalCount')).toBe(0);
  });
});

// ─── Business Central: GetBusinessCentralCustomersAction ────────────────────

describe('GetBusinessCentralCustomersAction', () => {
  let action: GetBusinessCentralCustomersAction;

  beforeEach(() => {
    action = new GetBusinessCentralCustomersAction();
  });

  it('should fail with ERROR when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Context user is required for Business Central API calls');
  });

  it('should GET the customers resource with the not-blocked OData filter', async () => {
    const spy = vi.spyOn(action as never, 'makeBCRequest').mockResolvedValue({ value: [] } as never);

    const result = await run(action, inputs({ CompanyID: 'comp-1' }));

    const endpoint = spy.mock.calls[0][0] as string;
    expect(endpoint).toContain('customers?');
    expect(endpoint).toContain("$filter=blocked eq ' '");
    expect(spy.mock.calls[0][1]).toBe('GET');
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(result.Message).toBe('Successfully retrieved 0 customers from Business Central');
  });

  it('should add search filters to the OData query', async () => {
    const spy = vi.spyOn(action as never, 'makeBCRequest').mockResolvedValue({ value: [] } as never);

    await run(action, inputs({ CompanyID: 'comp-1', SearchText: 'Acme' }));

    const endpoint = spy.mock.calls[0][0] as string;
    expect(endpoint).toContain("contains(displayName,'Acme')");
  });
});

// ─── Business Central: GetBusinessCentralGLEntriesAction ────────────────────

describe('GetBusinessCentralGeneralLedgerEntriesAction', () => {
  let action: GetBusinessCentralGeneralLedgerEntriesAction;

  beforeEach(() => {
    action = new GetBusinessCentralGeneralLedgerEntriesAction();
  });

  it('should fail with ERROR when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Context user is required for Business Central API calls');
  });

  it('should GET the generalLedgerEntries resource', async () => {
    const spy = vi.spyOn(action as never, 'makeBCRequest').mockResolvedValue({ value: [] } as never);

    const result = await run(action, inputs({ CompanyID: 'comp-1' }));

    expect(String(spy.mock.calls[0][0])).toContain('generalLedgerEntries');
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Successfully retrieved 0 general ledger entries from Business Central');
  });
});

// ─── Business Central: GetBusinessCentralGLAccountsAction ───────────────────

describe('GetBusinessCentralGLAccountsAction', () => {
  let action: GetBusinessCentralGLAccountsAction;

  beforeEach(() => {
    action = new GetBusinessCentralGLAccountsAction();
  });

  it('should fail with ERROR when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Context user is required for Business Central API calls');
  });

  it('should GET the accounts resource', async () => {
    const spy = vi.spyOn(action as never, 'makeBCRequest').mockResolvedValue({ value: [] } as never);

    const result = await run(action, inputs({ CompanyID: 'comp-1' }));

    expect(String(spy.mock.calls[0][0])).toContain('generalLedgerAccounts');
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Successfully retrieved 0 GL accounts from Business Central');
  });
});

// ─── Business Central: GetBusinessCentralSalesInvoicesAction ────────────────

describe('GetBusinessCentralSalesInvoicesAction', () => {
  let action: GetBusinessCentralSalesInvoicesAction;

  beforeEach(() => {
    action = new GetBusinessCentralSalesInvoicesAction();
  });

  it('should fail with ERROR when no context user is provided', async () => {
    const result = await runWithoutUser(action, inputs({ CompanyID: 'comp-1' }));
    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('ERROR');
    expect(result.Message).toBe('Context user is required for Business Central API calls');
  });

  it('should GET the salesInvoices resource', async () => {
    const spy = vi.spyOn(action as never, 'makeBCRequest').mockResolvedValue({ value: [] } as never);

    const result = await run(action, inputs({ CompanyID: 'comp-1' }));

    expect(String(spy.mock.calls[0][0])).toContain('salesInvoices');
    expect(result.Success).toBe(true);
    expect(result.Message).toBe('Successfully retrieved 0 sales invoices from Business Central');
  });
});

// ─── Verb dispatcher: CreateJournalEntry ────────────────────────────────────

describe('CreateJournalEntry dispatcher', () => {
  let action: CreateJournalEntryAction;

  beforeEach(() => {
    action = new CreateJournalEntryAction();
    vi.mocked(MJGlobal.Instance.ClassFactory.TryCreateInstance).mockReset();
  });

  it('should return PROVIDER_NOT_REGISTERED when no plugin is registered for the ERP', async () => {
    vi.spyOn(action as never, 'resolveCompanyAccountingIntegration').mockResolvedValue({
      Name: 'NetSuite',
      CompanyIntegrationID: 'ci-1',
      CompanyID: 'comp-1',
      IntegrationID: 'int-1',
    } as never);
    vi.mocked(MJGlobal.Instance.ClassFactory.TryCreateInstance).mockReturnValue({
      Resolved: false,
      Instance: null,
      Reason: 'not registered',
    });

    const result = await run(
      action,
      inputs({
        CompanyID: 'comp-1',
        Lines: [
          { accountId: '1', debit: 100 },
          { accountId: '2', credit: 100 },
        ],
      }),
    );

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('PROVIDER_NOT_REGISTERED');
    expect(result.Message).toContain(
      ErpPluginKey(ACCOUNTING_VERBS.CreateJournalEntry, 'NetSuite'),
    );
  });

  it('should POST journalentry on the QBO plugin when the integration is QuickBooks Online', async () => {
    vi.spyOn(action as never, 'resolveCompanyAccountingIntegration').mockResolvedValue({
      Name: ERP_INTEGRATION.QuickBooksOnline,
      CompanyIntegrationID: 'ci-1',
      CompanyID: 'comp-1',
      IntegrationID: 'int-1',
    } as never);

    const plugin = new CreateQuickBooksJournalEntryAction();
    const spy = vi.spyOn(plugin as never, 'makeQBORequest').mockResolvedValue({
      JournalEntry: {
        Id: 'je-1',
        DocNumber: 'JE-100',
        TotalAmt: 100,
        MetaData: { CreateTime: '2024-06-15T10:00:00Z' },
      },
    } as never);
    vi.mocked(MJGlobal.Instance.ClassFactory.TryCreateInstance).mockReturnValue({
      Resolved: true,
      Instance: plugin,
    });

    const result = await run(
      action,
      inputs({
        CompanyID: 'comp-1',
        DocNumber: 'JE-100',
        EntryDate: '2024-06-15',
        Lines: [
          { accountId: 'acct-1', debit: 100, description: 'Debit side' },
          { accountId: 'acct-2', credit: 100 },
        ],
      }),
    );

    expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).toHaveBeenCalledWith(
      expect.anything(),
      ErpPluginKey(ACCOUNTING_VERBS.CreateJournalEntry, ERP_INTEGRATION.QuickBooksOnline),
    );
    const [endpoint, method] = spy.mock.calls[0] as unknown as [string, string];
    expect(endpoint).toBe('journalentry');
    expect(method).toBe('POST');
    expect(result.Success).toBe(true);
    expect(outParam(result, 'JournalEntryID')).toBe('je-1');
  });

  it('should dispatch a business-central connection to the canonical Business Central plugin key', async () => {
    mockRunViewResults([connectionRow(CI_PROD, 'BC Production', 'business-central')]);
    const runFn = recordingPlugin();

    const result = await run(action, inputs({ CompanyID: COMPANY_ID, Lines: BALANCED_LINES }));

    expect(result.Success).toBe(true);
    expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).toHaveBeenCalledWith(
      expect.anything(),
      'CreateJournalEntry:Microsoft Dynamics 365 Business Central',
    );
    expect(runFn).toHaveBeenCalledTimes(1);
  });

  it('should add the resolved CompanyIntegrationID to the params the plugin receives', async () => {
    mockRunViewResults([connectionRow(CI_PROD, 'BC Production', 'business-central')]);
    const runFn = recordingPlugin();

    await run(action, inputs({ CompanyID: COMPANY_ID, Lines: BALANCED_LINES }));

    const passed = paramsPassedTo(runFn);
    expect(passed.filter((p) => p.Name === 'CompanyIntegrationID')).toEqual([
      { Name: 'CompanyIntegrationID', Type: 'Input', Value: CI_PROD },
    ]);
  });

  it('should fill in a blank CompanyIntegrationID param with the resolved connection', async () => {
    mockRunViewResults([connectionRow(CI_PROD, 'BC Production', 'business-central')]);
    const runFn = recordingPlugin();

    await run(action, inputs({ CompanyID: COMPANY_ID, CompanyIntegrationID: null, Lines: BALANCED_LINES }));

    const passed = paramsPassedTo(runFn).filter((p) => p.Name === 'CompanyIntegrationID');
    expect(passed).toHaveLength(1);
    expect(passed[0].Value).toBe(CI_PROD);
  });

  it('should honor an explicit CompanyIntegrationID and skip the ambiguity search', async () => {
    const runViewFn = mockRunViewResults([
      connectionRow(CI_PROD, 'BC Production', 'business-central'),
      connectionRow(CI_UAT, 'BC UAT', 'business-central'),
    ]);
    const loads = mockEntityLoads({ 'MJ: Company Integrations': connectionRow(CI_UAT, 'BC UAT', 'business-central') });
    const runFn = recordingPlugin();

    const result = await run(action, inputs({ CompanyID: COMPANY_ID, CompanyIntegrationID: CI_UAT, Lines: BALANCED_LINES }));

    expect(result.Success).toBe(true);
    expect(runViewFn).not.toHaveBeenCalled();
    expect(loads).toEqual([{ entity: 'MJ: Company Integrations', id: CI_UAT }]);
    expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).toHaveBeenCalledWith(
      expect.anything(),
      ErpPluginKey(ACCOUNTING_VERBS.CreateJournalEntry, ERP_INTEGRATION.BusinessCentral),
    );
    const passed = paramsPassedTo(runFn).filter((p) => p.Name === 'CompanyIntegrationID');
    expect(passed).toHaveLength(1);
    expect(passed[0].Value).toBe(CI_UAT);
  });

  it('should refuse an explicit CompanyIntegrationID that belongs to another company', async () => {
    mockEntityLoads({
      'MJ: Company Integrations': connectionRow(CI_UAT, 'BC UAT', 'business-central', { CompanyID: OTHER_COMPANY_ID }),
    });

    const result = await run(action, inputs({ CompanyID: COMPANY_ID, CompanyIntegrationID: CI_UAT, Lines: BALANCED_LINES }));

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('COMPANY_INTEGRATION_WRONG_COMPANY');
    expect(result.Message).toContain(`does not belong to company ${COMPANY_ID}`);
    expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).not.toHaveBeenCalled();
  });

  it('should refuse an inactive explicit CompanyIntegrationID', async () => {
    mockEntityLoads({
      'MJ: Company Integrations': connectionRow(CI_UAT, 'BC UAT', 'business-central', { IsActive: false }),
    });

    const result = await run(action, inputs({ CompanyID: COMPANY_ID, CompanyIntegrationID: CI_UAT, Lines: BALANCED_LINES }));

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('COMPANY_INTEGRATION_INACTIVE');
    expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).not.toHaveBeenCalled();
  });

  it('should refuse an explicit CompanyIntegrationID that is not an accounting connection', async () => {
    mockEntityLoads({ 'MJ: Company Integrations': connectionRow(CI_UAT, 'CRM', 'HubSpot') });

    const result = await run(action, inputs({ CompanyID: COMPANY_ID, CompanyIntegrationID: CI_UAT, Lines: BALANCED_LINES }));

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('NOT_ACCOUNTING_INTEGRATION');
    expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).not.toHaveBeenCalled();
  });

  it('should refuse an explicit CompanyIntegrationID that does not exist', async () => {
    mockEntityLoads({ 'MJ: Company Integrations': null });

    const result = await run(action, inputs({ CompanyID: COMPANY_ID, CompanyIntegrationID: CI_UAT, Lines: BALANCED_LINES }));

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('COMPANY_INTEGRATION_NOT_FOUND');
  });

  it('should refuse an ambiguous plain lookup and name the connections', async () => {
    mockRunViewResults([
      connectionRow(CI_PROD, 'BC Production', 'business-central'),
      connectionRow(CI_UAT, 'BC UAT', 'business-central'),
    ]);

    const result = await run(action, inputs({ CompanyID: COMPANY_ID, Lines: BALANCED_LINES }));

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('AMBIGUOUS_ACCOUNTING_INTEGRATION');
    expect(result.Message).toContain(CI_PROD);
    expect(result.Message).toContain(CI_UAT);
    expect(MJGlobal.Instance.ClassFactory.TryCreateInstance).not.toHaveBeenCalled();
  });

  it('should make the Business Central plugin post through the connection the dispatcher chose', async () => {
    // One search (the dispatcher's); the plugin then loads that exact row by ID.
    const runViewFn = mockRunViewResults([connectionRow(CI_UAT, 'BC UAT', 'business-central')]);
    const loads = mockEntityLoads({ 'MJ: Company Integrations': connectionRow(CI_UAT, 'BC UAT', 'business-central') });
    const plugin = new CreateBusinessCentralJournalEntryAction();
    vi.spyOn(plugin as never, 'resolveBCConnection').mockResolvedValue({
      AccessToken: 'token',
      TenantId: 'tenant',
      Environment: 'AIDP_Next_UAT',
      CompanyId: 'bc-company',
    } as never);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation((async (url: string | URL | Request) => {
      const target = String(url);
      if (target.endsWith('/journals')) {
        return new Response(JSON.stringify({ value: [{ id: 'j-1', code: 'GENERAL', balancingAccountNumber: null }] }));
      }
      if (target.endsWith('/journalLines')) {
        return new Response(JSON.stringify({ id: 'line-1', documentNumber: 'JE-1' }));
      }
      return new Response(null, { status: 204 });
    }) as never);
    vi.mocked(MJGlobal.Instance.ClassFactory.TryCreateInstance).mockReturnValue({ Resolved: true, Instance: plugin });

    const result = await run(action, inputs({ CompanyID: COMPANY_ID, Lines: BALANCED_LINES }));

    expect(result.Success).toBe(true);
    expect(runViewFn).toHaveBeenCalledTimes(1);
    expect(loads).toEqual([{ entity: 'MJ: Company Integrations', id: CI_UAT }]);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(
      'https://api.businesscentral.dynamics.com/v2.0/tenant/AIDP_Next_UAT/api/v2.0/companies(bc-company)/journals',
    );
  });
});

// ─── Business Central: CreateJournalEntry ───────────────────────────────────

describe('CreateBusinessCentralJournalEntryAction', () => {
  let action: CreateBusinessCentralJournalEntryAction;

  beforeEach(() => {
    action = new CreateBusinessCentralJournalEntryAction();
  });

  it('should fail with VALIDATION_ERROR when the entry is unbalanced', async () => {
    const spy = vi.spyOn(action as never, 'makeBCRequest');

    const result = await run(
      action,
      inputs({
        CompanyID: 'comp-1',
        Lines: [
          { accountNumber: '1000', debit: 100 },
          { accountNumber: '2000', credit: 50 },
        ],
      }),
    );

    expect(result.Success).toBe(false);
    expect(result.ResultCode).toBe('VALIDATION_ERROR');
    expect(spy).not.toHaveBeenCalled();
  });

  it('should POST journalLines then Microsoft.NAV.post for a balanced entry', async () => {
    const spy = vi.spyOn(action as never, 'makeBCRequest').mockImplementation((async (endpoint: string) => {
      if (endpoint === 'journals') {
        return { value: [{ id: 'j-1', code: 'GENERAL', balancingAccountNumber: null }] };
      }
      if (String(endpoint).includes('journalLines')) {
        return { id: 'line-1', documentNumber: 'JE-9' };
      }
      return undefined;
    }) as never);

    const result = await run(
      action,
      inputs({
        CompanyID: 'comp-1',
        DocNumber: 'JE-9',
        EntryDate: '2024-06-15',
        Lines: [
          { accountNumber: '1000', debit: 100, description: 'Debit side' },
          { accountNumber: '2000', credit: 100 },
        ],
      }),
    );

    expect(spy.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      ['journals', 'GET'],
      ['journals(j-1)/journalLines', 'POST'],
      ['journals(j-1)/journalLines', 'POST'],
      ['journals(j-1)/Microsoft.NAV.post', 'POST'],
    ]);
    const firstLine = spy.mock.calls[1][2] as Record<string, unknown>;
    expect(firstLine.accountNumber).toBe('1000');
    expect(firstLine.amount).toBe(100);
    const secondLine = spy.mock.calls[2][2] as Record<string, unknown>;
    expect(secondLine.accountNumber).toBe('2000');
    expect(secondLine.amount).toBe(-100);
    expect(result.Success).toBe(true);
    expect(result.ResultCode).toBe('SUCCESS');
    expect(outParam(result, 'JournalEntryID')).toBe('j-1');
    expect(outParam(result, 'DocNumber')).toBe('JE-9');
    expect(outParam(result, 'TotalAmount')).toBe(100);
  });

  it('should DELETE lines created in this call if a later POST fails', async () => {
    let linePosts = 0;
    const spy = vi.spyOn(action as never, 'makeBCRequest').mockImplementation((async (endpoint: string, method: string) => {
      if (endpoint === 'journals') {
        return { value: [{ id: 'j-1', code: 'GENERAL', balancingAccountNumber: null }] };
      }
      if (String(endpoint).includes('journalLines') && method === 'POST') {
        linePosts += 1;
        if (linePosts >= 2) {
          throw new Error('line 2 failed');
        }
        return { id: `line-${linePosts}`, documentNumber: 'JE-9' };
      }
      if (String(endpoint).startsWith('journalLines(') && method === 'DELETE') {
        return undefined;
      }
      throw new Error(`unexpected ${method} ${endpoint}`);
    }) as never);

    const result = await run(
      action,
      inputs({
        CompanyID: 'comp-1',
        Lines: [
          { accountNumber: '1000', debit: 100 },
          { accountNumber: '2000', credit: 100 },
        ],
      }),
    );

    expect(result.Success).toBe(false);
    expect(result.Message).toBe('line 2 failed');
    expect(spy.mock.calls.map((c) => [c[1], c[0]])).toEqual([
      ['GET', 'journals'],
      ['POST', 'journals(j-1)/journalLines'],
      ['POST', 'journals(j-1)/journalLines'],
      ['DELETE', 'journalLines(line-1)'],
    ]);
  });

  it('should error when JournalCode matches nothing', async () => {
    vi.spyOn(action as never, 'makeBCRequest').mockResolvedValue({
      value: [{ id: 'j-1', code: 'GENERAL', balancingAccountNumber: null }],
    } as never);

    const result = await run(action, inputs({
      CompanyID: 'comp-1',
      JournalCode: 'GENERAL2',
      Lines: [
        { accountNumber: '1000', debit: 100 },
        { accountNumber: '2000', credit: 100 },
      ],
    }));

    expect(result.Success).toBe(false);
    expect(result.Message).toContain("JournalCode 'GENERAL2' does not exist");
  });

  it('should refuse a journal that has a balancing account', async () => {
    vi.spyOn(action as never, 'makeBCRequest').mockResolvedValue({
      value: [{ id: 'j-1', code: 'CASH', balancingAccountNumber: '1010' }],
    } as never);

    const result = await run(action, inputs({
      CompanyID: 'comp-1',
      Lines: [
        { accountNumber: '1000', debit: 100 },
        { accountNumber: '2000', credit: 100 },
      ],
    }));

    expect(result.Success).toBe(false);
    expect(result.Message).toMatch(/balancing account/i);
  });

  it('should send accountNumber and omit accountId when both are present', async () => {
    const spy = vi.spyOn(action as never, 'makeBCRequest').mockImplementation((async (endpoint: string) => {
      if (endpoint === 'journals') {
        return { value: [{ id: 'j-1', code: 'GENERAL', balancingAccountNumber: null }] };
      }
      return { id: 'line-1' };
    }) as never);

    await run(action, inputs({
      CompanyID: 'comp-1',
      Lines: [
        { accountNumber: '1000', accountId: 'stale-guid', debit: 100 },
        { accountNumber: '2000', credit: 100 },
      ],
    }));

    const firstLine = spy.mock.calls[1][2] as Record<string, unknown>;
    expect(firstLine.accountNumber).toBe('1000');
    expect(firstLine.accountId).toBeUndefined();
  });
});

// ─── Business Central: GetAccountBalances ───────────────────────────────────

describe('GetBusinessCentralAccountBalancesAction', () => {
  let action: GetBusinessCentralAccountBalancesAction;

  beforeEach(() => {
    action = new GetBusinessCentralAccountBalancesAction();
  });

  it('should map account number to accountCode', async () => {
    vi.spyOn(action as never, 'makeBCRequest').mockResolvedValue({
      value: [
        {
          id: 'a-1',
          number: '1010',
          displayName: 'Cash',
          balance: 250,
          category: 'Assets',
          accountType: 'Posting',
          blocked: false,
        },
      ],
    } as never);

    const result = await run(action, inputs({ CompanyID: 'comp-1', AsOfDate: '2024-06-15' }));

    expect(result.Success).toBe(true);
    const balances = outParam(result, 'AccountBalances') as Array<{ accountCode: string; accountName: string }>;
    expect(balances).toHaveLength(1);
    expect(balances[0].accountCode).toBe('1010');
    expect(balances[0].accountName).toBe('Cash');
  });
});

// ─── Business Central: GetDimensions ────────────────────────────────────────

describe('GetBusinessCentralDimensionsAction', () => {
  let action: GetBusinessCentralDimensionsAction;

  beforeEach(() => {
    action = new GetBusinessCentralDimensionsAction();
  });

  it('should map dimensions and their values', async () => {
    const spy = vi.spyOn(action as never, 'makeBCRequest').mockImplementation((async (endpoint: string) => {
      if (endpoint === 'dimensions') {
        return { value: [{ id: 'd1', code: 'AREA', displayName: 'Area' }] };
      }
      if (endpoint === 'dimensionValues') {
        return { value: [{ id: 'v1', code: 'EAST', displayName: 'East', dimensionId: 'd1' }] };
      }
      return { value: [] };
    }) as never);

    const result = await run(action, inputs({ CompanyID: 'comp-1' }));

    expect(spy.mock.calls.map((c) => c[0])).toEqual(['dimensions', 'dimensionValues']);
    expect(result.Success).toBe(true);
    expect(outParam(result, 'Dimensions')).toEqual([
      {
        code: 'AREA',
        displayName: 'Area',
        values: [{ code: 'EAST', displayName: 'East' }],
      },
    ]);
  });
});

// ─── QuickBooks: GetDimensions ──────────────────────────────────────────────

describe('GetQuickBooksDimensionsAction', () => {
  it('should map Class and Department queries as two dimensions', async () => {
    const action = new GetQuickBooksDimensionsAction();
    vi.spyOn(action as never, 'queryQBO').mockImplementation((async (query: string) => {
      if (String(query).includes('Class')) {
        return { QueryResponse: { Class: [{ Id: 'c1', Name: 'Sales', FullyQualifiedName: 'Sales' }] } };
      }
      return { QueryResponse: { Department: [{ Id: 'd1', Name: 'Ops', FullyQualifiedName: 'Ops' }] } };
    }) as never);

    const result = await run(action, inputs({ CompanyID: 'comp-1' }));

    expect(result.Success).toBe(true);
    expect(outParam(result, 'Dimensions')).toEqual([
      { code: 'Class', displayName: 'Class', values: [{ code: 'Sales', displayName: 'Sales' }] },
      { code: 'Department', displayName: 'Department', values: [{ code: 'Ops', displayName: 'Ops' }] },
    ]);
  });
});

// ─── Business Central: connection resolution ────────────────────────────────

class TestBusinessCentralAction extends BusinessCentralBaseAction {
  public get Description(): string {
    return 'test';
  }

  protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
    this.params = params.Params;
    return { Success: true, ResultCode: 'SUCCESS', Params: params.Params };
  }
}

const CONNECTOR_COLUMNS = {
  ID: CI_UAT,
  ClientID: 'col-client',
  ClientSecret: 'col-secret',
  APIKey: 'col-tenant',
  ExternalSystemID: 'col-company',
};

describe('ResolveBusinessCentralConnectorConfig', () => {
  it('should let the Credential override the Configuration, and the Configuration override the columns', () => {
    const config = ResolveBusinessCentralConnectorConfig(
      CONNECTOR_COLUMNS,
      { TenantId: 'cfg-tenant', Environment: 'cfg-env', CompanyId: 'cfg-company', ClientId: 'cfg-client' },
      { TenantId: 'cred-tenant', ClientSecret: 'cred-secret' },
    );

    expect(config).toEqual({
      ClientId: 'cfg-client',
      ClientSecret: 'cred-secret',
      TenantId: 'cred-tenant',
      CompanyId: 'cfg-company',
      Environment: 'cfg-env',
      AuthorityHost: BC_DEFAULT_AUTHORITY_HOST,
      Scope: BC_DEFAULT_SCOPE,
    });
  });

  it('should fall back to ClientID, ClientSecret, APIKey and ExternalSystemID', () => {
    const config = ResolveBusinessCentralConnectorConfig(CONNECTOR_COLUMNS, { environmentName: 'production' }, {});

    expect(config.ClientId).toBe('col-client');
    expect(config.ClientSecret).toBe('col-secret');
    expect(config.TenantId).toBe('col-tenant');
    expect(config.CompanyId).toBe('col-company');
    expect(config.Environment).toBe('production');
  });

  it('should read the connector key spellings', () => {
    const config = ResolveBusinessCentralConnectorConfig(
      { ID: CI_UAT, ClientID: null, ClientSecret: null, APIKey: null, ExternalSystemID: null },
      { tenant_id: 'tenant', EnvironmentName: 'env', BusinessCentralCompanyId: 'company' },
      { azureClientId: 'client', azureClientSecret: 'secret', AuthorityHost: 'https://login.example.com/', Scope: 'custom/.default' },
    );

    expect(config).toEqual({
      ClientId: 'client',
      ClientSecret: 'secret',
      TenantId: 'tenant',
      CompanyId: 'company',
      Environment: 'env',
      AuthorityHost: 'https://login.example.com',
      Scope: 'custom/.default',
    });
  });

  it('should error when the environment is missing, never defaulting it', () => {
    expect(() => ResolveBusinessCentralConnectorConfig(CONNECTOR_COLUMNS, { tenantId: 'tenant' }, {}))
      .toThrow(`Business Central environment is not configured for CompanyIntegration ${CI_UAT}`);
  });

  it('should error when the company is missing', () => {
    expect(() => ResolveBusinessCentralConnectorConfig(
      { ...CONNECTOR_COLUMNS, ExternalSystemID: null },
      { environmentName: 'production' },
      {},
    )).toThrow(/company ID is not configured/);
  });
});

describe('BusinessCentralBaseAction connection resolution', () => {
  let action: TestBusinessCentralAction;

  beforeEach(() => {
    action = new TestBusinessCentralAction();
    ClearBusinessCentralTokenManagers();
    getAccessTokenMock.mockReset();
    getAccessTokenMock.mockResolvedValue({ AccessToken: 'minted-token', TokenType: 'Bearer', ExpiresAt: Date.now() + 3_600_000 });
    vi.mocked(LogError).mockClear();
  });

  function connectorRow(overrides: Row = {}): Row {
    return connectionRow(CI_UAT, 'BC UAT', 'business-central', {
      CredentialID: CREDENTIAL_ID,
      Configuration: JSON.stringify({ tenantId: 'cfg-tenant', environmentName: 'AIDP_Next_UAT', companyId: 'bc-company' }),
      ...overrides,
    });
  }

  function credentialRow(values: unknown, overrides: Row = {}): Row {
    return { ID: CREDENTIAL_ID, IsActive: true, Values: typeof values === 'string' ? values : JSON.stringify(values), ...overrides };
  }

  it('should mint a client-credentials token from the Credential for a connector connection', async () => {
    const loads = mockEntityLoads({
      'MJ: Credentials': credentialRow({ TenantId: 'cred-tenant', ClientId: 'client', ClientSecret: 'secret' }),
    });

    const connection = await action['resolveBCConnection'](connectorRow() as never, COMPANY_ID, contextUser);

    expect(loads).toEqual([{ entity: 'MJ: Credentials', id: CREDENTIAL_ID }]);
    expect(getAccessTokenMock).toHaveBeenCalledWith(
      {
        TokenURL: 'https://login.microsoftonline.com/cred-tenant/oauth2/v2.0/token',
        ClientId: 'client',
        ClientSecret: 'secret',
        Scopes: BC_DEFAULT_SCOPE,
      },
      'client_credentials',
    );
    expect(connection).toEqual({
      AccessToken: 'minted-token',
      TenantId: 'cred-tenant',
      Environment: 'AIDP_Next_UAT',
      CompanyId: 'bc-company',
    });
  });

  it('should call the connector connection\'s tenant, environment and company with the minted token', async () => {
    mockEntityLoads({
      'MJ: Company Integrations': connectorRow(),
      'MJ: Credentials': credentialRow({ ClientId: 'client', ClientSecret: 'secret' }),
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ value: [] })));
    await action['InternalRunAction']({ Params: inputs({ CompanyID: COMPANY_ID, CompanyIntegrationID: CI_UAT }), ContextUser: contextUser } as never);

    await action['makeBCRequest']('journals', 'GET', undefined, contextUser);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.businesscentral.dynamics.com/v2.0/cfg-tenant/AIDP_Next_UAT/api/v2.0/companies(bc-company)/journals');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer minted-token');
  });

  it('should treat a Configuration with a tenant or environment as a connector connection even without a Credential', async () => {
    const loads = mockEntityLoads({});
    const row = connectorRow({ CredentialID: null, ClientID: 'col-client', ClientSecret: 'col-secret' });

    const connection = await action['resolveBCConnection'](row as never, COMPANY_ID, contextUser);

    expect(loads).toEqual([]);
    expect(getAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(connection.TenantId).toBe('cfg-tenant');
    expect(connection.AccessToken).toBe('minted-token');
  });

  it('should error clearly when a connector connection has no environment', async () => {
    mockEntityLoads({ 'MJ: Credentials': credentialRow({ ClientId: 'client', ClientSecret: 'secret' }) });
    const row = connectorRow({ Configuration: JSON.stringify({ tenantId: 'cfg-tenant', companyId: 'bc-company' }) });

    await expect(action['resolveBCConnection'](row as never, COMPANY_ID, contextUser))
      .rejects.toThrow(/Business Central environment is not configured/);
    expect(getAccessTokenMock).not.toHaveBeenCalled();
  });

  it('should refuse an inactive Credential', async () => {
    mockEntityLoads({ 'MJ: Credentials': credentialRow({ ClientId: 'client' }, { IsActive: false }) });

    await expect(action['resolveBCConnection'](connectorRow() as never, COMPANY_ID, contextUser))
      .rejects.toThrow(`Credential ${CREDENTIAL_ID} for CompanyIntegration ${CI_UAT} is not active.`);
  });

  it('should refuse Credential Values that are not a JSON object', async () => {
    mockEntityLoads({ 'MJ: Credentials': credentialRow('{not json') });
    await expect(action['resolveBCConnection'](connectorRow() as never, COMPANY_ID, contextUser))
      .rejects.toThrow(`Values of Credential ${CREDENTIAL_ID} is not valid JSON`);

    mockEntityLoads({ 'MJ: Credentials': credentialRow(['a', 'b']) });
    await expect(action['resolveBCConnection'](connectorRow() as never, COMPANY_ID, contextUser))
      .rejects.toThrow(`Values of Credential ${CREDENTIAL_ID} must be a JSON object.`);
  });

  it('should refuse a Credential that cannot be loaded', async () => {
    mockEntityLoads({ 'MJ: Credentials': null });

    await expect(action['resolveBCConnection'](connectorRow() as never, COMPANY_ID, contextUser))
      .rejects.toThrow(/could not be loaded/);
  });

  describe('legacy connections (no CredentialID, no connector Configuration)', () => {
    function legacyRow(overrides: Row = {}): Row {
      return connectionRow(CI_PROD, 'BC', ERP_INTEGRATION.BusinessCentral, {
        AccessToken: 'legacy-token',
        TokenExpirationDate: null,
        CustomAttribute1: 'tenant-or-env',
        ExternalSystemID: 'bc-co',
        ...overrides,
      });
    }

    it('should keep reading the token from AccessToken and tenant and environment from CustomAttribute1', async () => {
      const loads = mockEntityLoads({});

      const connection = await action['resolveBCConnection'](legacyRow() as never, COMPANY_ID, contextUser);

      expect(connection).toEqual({
        AccessToken: 'legacy-token',
        TenantId: 'tenant-or-env',
        Environment: 'tenant-or-env',
        CompanyId: 'bc-co',
      });
      expect(getAccessTokenMock).not.toHaveBeenCalled();
      expect(loads).toEqual([]);
    });

    it('should build the same URL as before from a plain lookup', async () => {
      mockRunViewResults([legacyRow()]);
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ value: [] })));
      await action['InternalRunAction']({ Params: inputs({ CompanyID: COMPANY_ID }), ContextUser: contextUser } as never);

      await action['makeBCRequest']('journals', 'GET', undefined, contextUser);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.businesscentral.dynamics.com/v2.0/tenant-or-env/tenant-or-env/api/v2.0/companies(bc-co)/journals');
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer legacy-token');
    });

    it('should keep the legacy errors for a missing BC company or tenant', async () => {
      await expect(action['resolveBCConnection'](legacyRow({ ExternalSystemID: null }) as never, COMPANY_ID, contextUser))
        .rejects.toThrow('Business Central Company ID not found. Set in CompanyIntegration.ExternalSystemID');
      await expect(action['resolveBCConnection'](legacyRow({ CustomAttribute1: null }) as never, COMPANY_ID, contextUser))
        .rejects.toThrow('Tenant ID not found. Set in CompanyIntegration.CustomAttribute1 or environment variable');
    });

    it('should stay legacy when the Configuration carries no tenant or environment', async () => {
      const connection = await action['resolveBCConnection'](
        legacyRow({ Configuration: JSON.stringify({ syncDirection: 'pull' }) }) as never,
        COMPANY_ID,
        contextUser,
      );

      expect(connection.AccessToken).toBe('legacy-token');
      expect(getAccessTokenMock).not.toHaveBeenCalled();
    });

    it('should log and ignore a Configuration that is not valid JSON', async () => {
      const connection = await action['resolveBCConnection'](
        legacyRow({ Configuration: '{not json' }) as never,
        COMPANY_ID,
        contextUser,
      );

      expect(connection.AccessToken).toBe('legacy-token');
      expect(LogError).toHaveBeenCalledWith(expect.stringContaining(`Configuration of CompanyIntegration ${CI_PROD} is not valid JSON`));
    });
  });
});

describe('GetBusinessCentralTokenManager', () => {
  const config = ResolveBusinessCentralConnectorConfig(
    CONNECTOR_COLUMNS,
    { tenantId: 'tenant', environmentName: 'production' },
    {},
  );

  beforeEach(() => {
    ClearBusinessCentralTokenManagers();
  });

  it('should keep one token manager per CompanyIntegration', () => {
    const first = GetBusinessCentralTokenManager(CI_UAT, config);

    expect(GetBusinessCentralTokenManager(CI_UAT.toUpperCase(), config)).toBe(first);
    expect(GetBusinessCentralTokenManager(CI_PROD, config)).not.toBe(first);
  });

  it('should start a new token manager when the connection\'s tenant changes', () => {
    const first = GetBusinessCentralTokenManager(CI_UAT, config);

    expect(GetBusinessCentralTokenManager(CI_UAT, { ...config, TenantId: 'other-tenant' })).not.toBe(first);
  });
});

// ─── Backward-compat RegisterClass keys ─────────────────────────────────────

describe('legacy RegisterClass keys', () => {
  it('should still construct every historically named action class', () => {
    const ctors = [
      CreateQuickBooksJournalEntryAction,
      GetQuickBooksTransactionsAction,
      GetQuickBooksAccountBalancesAction,
      GetQuickBooksGLCodesAction,
      GetBusinessCentralGLAccountsAction,
      GetBusinessCentralGeneralLedgerEntriesAction,
      GetBusinessCentralCustomersAction,
      GetBusinessCentralSalesInvoicesAction,
    ];
    for (const Ctor of ctors) {
      expect(new Ctor()).toBeInstanceOf(Ctor);
    }
  });
});

