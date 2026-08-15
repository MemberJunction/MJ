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
  BaseAction: class BaseAction {},
  OAuth2Manager: class OAuth2Manager {},
}));

vi.mock('@memberjunction/global', () => ({
  RegisterClass: () => (target: unknown) => target,
  UUIDsEqual: (a: string, b: string) => a === b,
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

import { UserInfo } from '@memberjunction/core';
import type { ActionParam, ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { CreateQuickBooksJournalEntryAction } from '../providers/quickbooks/actions/create-journal-entry.action';
import { GetQuickBooksAccountBalancesAction } from '../providers/quickbooks/actions/get-account-balances.action';
import { GetQuickBooksGLCodesAction } from '../providers/quickbooks/actions/get-gl-codes.action';
import { GetQuickBooksTransactionsAction } from '../providers/quickbooks/actions/get-transactions.action';
import { GetBusinessCentralCustomersAction } from '../providers/business-central/actions/get-customers.action';
import { GetBusinessCentralGeneralLedgerEntriesAction } from '../providers/business-central/actions/get-general-ledger-entries.action';
import { GetBusinessCentralGLAccountsAction } from '../providers/business-central/actions/get-gl-accounts.action';
import { GetBusinessCentralSalesInvoicesAction } from '../providers/business-central/actions/get-sales-invoices.action';

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

  it('should require accountId on every line', async () => {
    const result = await run(
      action,
      inputs({ CompanyID: 'comp-1', Lines: [{ debit: 100 }, { accountId: '2', credit: 100 }] }),
    );
    expect(result.Message).toBe('Line 1: accountId is required');
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
