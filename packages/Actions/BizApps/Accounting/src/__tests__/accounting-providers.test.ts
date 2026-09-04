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
}));

vi.mock('@memberjunction/actions-base', () => ({
  ActionParam: class ActionParam {},
}));

import { MJGlobal } from '@memberjunction/global';
import { UserInfo } from '@memberjunction/core';
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
import { ACCOUNTING_VERBS, ERP_INTEGRATION, erpPluginKey } from '../constants';

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
      erpPluginKey(ACCOUNTING_VERBS.CreateJournalEntry, 'NetSuite'),
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
      erpPluginKey(ACCOUNTING_VERBS.CreateJournalEntry, ERP_INTEGRATION.QuickBooksOnline),
    );
    const [endpoint, method] = spy.mock.calls[0] as unknown as [string, string];
    expect(endpoint).toBe('journalentry');
    expect(method).toBe('POST');
    expect(result.Success).toBe(true);
    expect(outParam(result, 'JournalEntryID')).toBe('je-1');
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

