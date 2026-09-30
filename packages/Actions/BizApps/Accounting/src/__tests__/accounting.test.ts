import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        protected async InternalRunAction(): Promise<unknown> { return {}; }
    }
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
                TryCreateInstance: vi.fn(() => ({ Resolved: false, Instance: null })),
            },
        },
    },
}));

vi.mock('@memberjunction/core', () => ({
    UserInfo: class UserInfo {},
    Metadata: vi.fn().mockImplementation(() => ({
        GetEntityObject: vi.fn()
    })),
    RunView: vi.fn().mockImplementation(() => ({
        RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] })
    }))
}));

vi.mock('@memberjunction/core-entities', () => ({
    MJCompanyIntegrationEntity: class MJCompanyIntegrationEntity {
        CompanyID: string = '';
        AccessToken: string | null = null;
        RefreshToken: string | null = null;
        TokenExpirationDate: string | null = null;
        APIKey: string | null = null;
        ExternalSystemID: string | null = null;
        CustomAttribute1: string | null = null;
        NavigationBaseURL: string | null = null;
    },
    MJIntegrationEntity: class MJIntegrationEntity {
        NavigationBaseURL: string | null = null;
    }
}));

vi.mock('@memberjunction/actions-base', () => ({
    ActionParam: class ActionParam {
        Name: string = '';
        Value: unknown = null;
        Type: string = 'Input';
    },
    ActionResultSimple: class ActionResultSimple {},
    RunActionParams: class RunActionParams {
        Params: unknown[] = [];
        ContextUser: unknown = null;
    }
}));

import { Metadata, RunView } from '@memberjunction/core';
import { BaseAccountingAction } from '../base/base-accounting-action';
import { QuickBooksBaseAction } from '../providers/quickbooks/quickbooks-base.action';
import {
    ACCOUNTING_ERP_INTEGRATION_ALIASES,
    CanonicalERPIntegrationName,
    ERP_INTEGRATION,
    ERPIntegrationNameAliases,
} from '../constants';

const COMPANY_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_COMPANY_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const CI_PROD = 'cccccccc-0000-4000-8000-000000000001';
const CI_UAT = 'cccccccc-0000-4000-8000-000000000002';

type Row = Record<string, unknown>;

/** Every `new RunView()` returns a RunView() that resolves to `results`. */
function mockRunViewResults(results: Row[]) {
    const runViewFn = vi.fn().mockResolvedValue({ Success: true, Results: results });
    vi.mocked(RunView).mockImplementation(function (this: unknown) {
        return { RunView: runViewFn };
    } as never);
    return runViewFn;
}

/** `GetEntityObject('MJ: Company Integrations').Load(id)` fills the entity from `record`, or returns false when null. */
function mockCompanyIntegrationLoad(record: Row | null) {
    const loadFn = vi.fn(async function (this: Row, _id: string) {
        if (!record) {
            return false;
        }
        Object.assign(this, record);
        return true;
    });
    const getEntityObject = vi.fn(async () => ({ Load: loadFn }));
    vi.mocked(Metadata).mockImplementation(function (this: unknown) {
        return { GetEntityObject: getEntityObject };
    } as never);
    return { loadFn, getEntityObject };
}

function bcRow(id: string, name: string, integration: string, overrides: Row = {}): Row {
    return {
        ID: id,
        Name: name,
        CompanyID: COMPANY_ID,
        IntegrationID: 'int-bc',
        Integration: integration,
        IsActive: true,
        ...overrides,
    };
}

// Create a concrete subclass for testing abstract BaseAccountingAction
class TestAccountingAction extends BaseAccountingAction {
    protected accountingProvider = 'TestProvider';
    protected integrationName = 'Test Integration';

    protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
        return { Success: true, ResultCode: 'SUCCESS' };
    }
}

// Looks connections up the way the Business Central plugins do, without their HTTP layer.
class TestBCLookupAction extends BaseAccountingAction {
    protected accountingProvider = 'Business Central';
    protected integrationName: string = ERP_INTEGRATION.BusinessCentral;

    protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
        return { Success: true, ResultCode: 'SUCCESS' };
    }
}

describe('ERP integration aliases', () => {
    it('should list the connector and legacy Business Central names after the canonical one', () => {
        expect(ERPIntegrationNameAliases(ERP_INTEGRATION.BusinessCentral)).toEqual([
            'Microsoft Dynamics 365 Business Central',
            'business-central',
            'BusinessCentral',
        ]);
    });

    it('should map any alias, in any case, back to the canonical provider name', () => {
        expect(CanonicalERPIntegrationName('business-central')).toBe(ERP_INTEGRATION.BusinessCentral);
        expect(CanonicalERPIntegrationName('BUSINESSCENTRAL')).toBe(ERP_INTEGRATION.BusinessCentral);
        expect(CanonicalERPIntegrationName('QuickBooks Online')).toBe(ERP_INTEGRATION.QuickBooksOnline);
        expect(CanonicalERPIntegrationName('NetSuite')).toBeUndefined();
        expect(CanonicalERPIntegrationName(null)).toBeUndefined();
    });

    it('should leave an unknown name as its own only alias', () => {
        expect(ERPIntegrationNameAliases('NetSuite')).toEqual(['NetSuite']);
    });

    it('should include every alias of every provider in the accounting name list', () => {
        expect(ACCOUNTING_ERP_INTEGRATION_ALIASES).toEqual(expect.arrayContaining([
            'QuickBooks Online',
            'Microsoft Dynamics 365 Business Central',
            'business-central',
            'BusinessCentral',
        ]));
    });
});

describe('BaseAccountingAction', () => {
    let action: TestAccountingAction;

    beforeEach(() => {
        action = new TestAccountingAction();
    });

    describe('validateAccountNumber', () => {
        it('should return true for valid account numbers', () => {
            expect(action['validateAccountNumber']('1234')).toBe(true);
            expect(action['validateAccountNumber']('100-200')).toBe(true);
            expect(action['validateAccountNumber']('100.200')).toBe(true);
        });

        it('should return false for invalid account numbers', () => {
            expect(action['validateAccountNumber']('abc')).toBe(false);
            expect(action['validateAccountNumber']('12 34')).toBe(false);
            expect(action['validateAccountNumber']('12@34')).toBe(false);
        });
    });

    describe('validateJournalEntryBalance', () => {
        it('should return true when debits equal credits', () => {
            const lines = [
                { debit: 100, credit: 0 },
                { debit: 0, credit: 100 }
            ];
            expect(action['validateJournalEntryBalance'](lines)).toBe(true);
        });

        it('should return true for small rounding differences', () => {
            const lines = [
                { debit: 100.005, credit: 0 },
                { debit: 0, credit: 100.001 }
            ];
            expect(action['validateJournalEntryBalance'](lines)).toBe(true);
        });

        it('should return false when debits do not equal credits', () => {
            const lines = [
                { debit: 100, credit: 0 },
                { debit: 0, credit: 50 }
            ];
            expect(action['validateJournalEntryBalance'](lines)).toBe(false);
        });

        it('should handle missing debit/credit values', () => {
            const lines = [
                { debit: 100 },
                { credit: 100 }
            ] as Array<{ debit?: number; credit?: number }>;
            expect(action['validateJournalEntryBalance'](lines)).toBe(true);
        });
    });

    describe('formatCurrency', () => {
        it('should format USD by default', () => {
            const result = action['formatCurrency'](1234.56);
            expect(result).toBe('$1,234.56');
        });

        it('should handle zero', () => {
            const result = action['formatCurrency'](0);
            expect(result).toBe('$0.00');
        });
    });

    describe('formatAccountingDate', () => {
        it('should format date as YYYY-MM-DD', () => {
            const date = new Date('2024-06-15T10:30:00Z');
            const result = action['formatAccountingDate'](date);
            expect(result).toBe('2024-06-15');
        });
    });

    describe('buildAccountingErrorMessage', () => {
        it('should build error message without system error', () => {
            const result = action['buildAccountingErrorMessage']('CreateJournal', 'Invalid data');
            expect(result).toBe('Accounting operation failed: CreateJournal. Invalid data');
        });

        it('should include system error when provided', () => {
            const result = action['buildAccountingErrorMessage']('CreateJournal', 'Invalid data', new Error('DB error'));
            expect(result).toContain('System error: DB error');
        });
    });

    describe('getParamValue', () => {
        it('should return param value by name', () => {
            const params = [{ Name: 'CompanyID', Value: '123', Type: 'Input' as const }];
            expect(action['getParamValue'](params, 'CompanyID')).toBe('123');
        });

        it('should return undefined for missing param', () => {
            const params = [{ Name: 'CompanyID', Value: '123', Type: 'Input' as const }];
            expect(action['getParamValue'](params, 'NonExistent')).toBeUndefined();
        });
    });

    describe('getCommonAccountingParams', () => {
        it('should return CompanyID, FiscalYear, AccountingPeriod, IntegrationName, CompanyIntegrationID', () => {
            const params = action['getCommonAccountingParams']();
            expect(params.map((p: { Name: string }) => p.Name)).toEqual([
                'CompanyID',
                'FiscalYear',
                'AccountingPeriod',
                'IntegrationName',
                'CompanyIntegrationID',
            ]);
        });
    });

    describe('getCredentialFromEnv', () => {
        it('should construct correct env key', () => {
            process.env['BIZAPPS_TESTPROVIDER_COMP1_ACCESS_TOKEN'] = 'token123';
            const result = action['getCredentialFromEnv']('COMP1', 'ACCESS_TOKEN');
            expect(result).toBe('token123');
            delete process.env['BIZAPPS_TESTPROVIDER_COMP1_ACCESS_TOKEN'];
        });

        it('should return undefined for missing env var', () => {
            const result = action['getCredentialFromEnv']('COMP1', 'MISSING_KEY');
            expect(result).toBeUndefined();
        });
    });

    describe('resolveCompanyAccountingIntegration', () => {
        it('should quote CompanyID so ExtraFilter cannot be injected', async () => {
            const { RunView } = await import('@memberjunction/core');
            const runViewFn = vi.fn().mockResolvedValue({
                Success: true,
                Results: [{
                    ID: 'ci-1',
                    CompanyID: 'comp-1',
                    IntegrationID: 'int-1',
                    Integration: 'QuickBooks Online',
                }],
            });
            vi.mocked(RunView).mockImplementation(function (this: unknown) {
                return { RunView: runViewFn };
            } as never);

            await action['resolveCompanyAccountingIntegration']("abc' OR 1=1--", {} as never);

            const filter = runViewFn.mock.calls[0][0].ExtraFilter as string;
            expect(filter).toContain("CompanyID = 'abc'' OR 1=1--'");
            expect(filter).toContain('IsActive = 1');
            expect(filter).toContain("'QuickBooks Online'");
            expect(filter).toContain("'Microsoft Dynamics 365 Business Central'");
        });

        it('should fail with AMBIGUOUS_ACCOUNTING_INTEGRATION when two ERPs are active', async () => {
            const { RunView } = await import('@memberjunction/core');
            const runViewFn = vi.fn().mockResolvedValue({
                Success: true,
                Results: [
                    { ID: 'ci-1', CompanyID: 'comp-1', IntegrationID: 'int-1', Integration: 'Microsoft Dynamics 365 Business Central' },
                    { ID: 'ci-2', CompanyID: 'comp-1', IntegrationID: 'int-2', Integration: 'QuickBooks Online' },
                ],
            });
            vi.mocked(RunView).mockImplementation(function (this: unknown) {
                return { RunView: runViewFn };
            } as never);

            await expect(action['resolveCompanyAccountingIntegration']('comp-1', {} as never))
                .rejects.toMatchObject({ resultCode: 'AMBIGUOUS_ACCOUNTING_INTEGRATION' });
        });

        it('should select the named integration when IntegrationName is passed', async () => {
            const { RunView } = await import('@memberjunction/core');
            const runViewFn = vi.fn().mockResolvedValue({
                Success: true,
                Results: [
                    { ID: 'ci-2', CompanyID: 'comp-1', IntegrationID: 'int-2', Integration: 'QuickBooks Online' },
                ],
            });
            vi.mocked(RunView).mockImplementation(function (this: unknown) {
                return { RunView: runViewFn };
            } as never);

            const resolved = await action['resolveCompanyAccountingIntegration']('comp-1', {} as never, 'QuickBooks Online');
            expect(resolved.Name).toBe('QuickBooks Online');
            expect(runViewFn.mock.calls[0][0].ExtraFilter).toContain("'QuickBooks Online'");
            expect(runViewFn.mock.calls[0][0].ExtraFilter).not.toContain('Business Central');
        });

        it('should filter on the Integration view column, not Integration.Name', async () => {
            const runViewFn = mockRunViewResults([bcRow(CI_PROD, 'BC Production', 'business-central')]);

            await action['resolveCompanyAccountingIntegration'](COMPANY_ID, {} as never);

            const filter = runViewFn.mock.calls[0][0].ExtraFilter as string;
            expect(filter).toContain('AND Integration IN (');
            expect(filter).not.toContain('Integration.Name');
        });

        it('should search the connector and legacy Business Central names', async () => {
            const runViewFn = mockRunViewResults([bcRow(CI_PROD, 'BC Production', 'business-central')]);

            const resolved = await action['resolveCompanyAccountingIntegration'](COMPANY_ID, {} as never);

            const filter = runViewFn.mock.calls[0][0].ExtraFilter as string;
            expect(filter).toContain("'business-central'");
            expect(filter).toContain("'BusinessCentral'");
            expect(resolved).toEqual({
                Name: 'business-central',
                CompanyIntegrationID: CI_PROD,
                CompanyID: COMPANY_ID,
                IntegrationID: 'int-bc',
            });
        });

        it('should expand an IntegrationName alias to every name of its provider', async () => {
            const runViewFn = mockRunViewResults([bcRow(CI_PROD, 'BC Production', 'business-central')]);

            await action['resolveCompanyAccountingIntegration'](COMPANY_ID, {} as never, 'business-central');

            const filter = runViewFn.mock.calls[0][0].ExtraFilter as string;
            expect(filter).toContain("'Microsoft Dynamics 365 Business Central'");
            expect(filter).toContain("'business-central'");
            expect(filter).toContain("'BusinessCentral'");
            expect(filter).not.toContain('QuickBooks');
        });

        it('should refuse two connections to the same ERP even when IntegrationName is passed', async () => {
            mockRunViewResults([
                bcRow(CI_PROD, 'BC Production', 'business-central'),
                bcRow(CI_UAT, 'BC UAT', 'business-central'),
            ]);

            const attempt = action['resolveCompanyAccountingIntegration'](COMPANY_ID, {} as never, 'business-central');

            await expect(attempt).rejects.toMatchObject({ resultCode: 'AMBIGUOUS_ACCOUNTING_INTEGRATION' });
            await expect(attempt).rejects.toThrow(/BC Production.*BC UAT.*Pass CompanyIntegrationID/);
        });
    });

    describe('resolveExplicitAccountingIntegration', () => {
        it('should load exactly the named connection without searching', async () => {
            const runViewFn = mockRunViewResults([]);
            const { loadFn } = mockCompanyIntegrationLoad(bcRow(CI_UAT, 'BC UAT', 'business-central'));

            const resolved = await action['resolveExplicitAccountingIntegration'](CI_UAT, COMPANY_ID, {} as never);

            expect(loadFn).toHaveBeenCalledWith(CI_UAT);
            expect(runViewFn).not.toHaveBeenCalled();
            expect(resolved.CompanyIntegrationID).toBe(CI_UAT);
            expect(resolved.Name).toBe('business-central');
        });

        it('should refuse a connection of a non-accounting Integration', async () => {
            mockCompanyIntegrationLoad(bcRow(CI_UAT, 'HubSpot', 'HubSpot'));

            await expect(action['resolveExplicitAccountingIntegration'](CI_UAT, COMPANY_ID, {} as never))
                .rejects.toMatchObject({ resultCode: 'NOT_ACCOUNTING_INTEGRATION' });
        });

        it('should refuse a connection of a different provider than IntegrationName', async () => {
            mockCompanyIntegrationLoad(bcRow(CI_UAT, 'BC UAT', 'business-central'));

            await expect(action['resolveExplicitAccountingIntegration'](CI_UAT, COMPANY_ID, {} as never, 'QuickBooks Online'))
                .rejects.toMatchObject({ resultCode: 'NOT_ACCOUNTING_INTEGRATION' });
        });
    });
});

describe('BaseAccountingAction.getCompanyIntegration', () => {
    let action: TestBCLookupAction;

    beforeEach(() => {
        action = new TestBCLookupAction();
    });

    it('should search active connections under every Business Central name using the Integration column', async () => {
        const runViewFn = mockRunViewResults([bcRow(CI_PROD, 'BC Production', 'business-central')]);

        const record = await action['getCompanyIntegration'](COMPANY_ID, {} as never);

        const filter = runViewFn.mock.calls[0][0].ExtraFilter as string;
        expect(filter).toBe(
            `CompanyID = '${COMPANY_ID}' AND IsActive = 1 AND Integration IN ('Microsoft Dynamics 365 Business Central', 'business-central', 'BusinessCentral')`
        );
        expect(filter).not.toContain('Integration.Name');
        expect(record.ID).toBe(CI_PROD);
    });

    it('should refuse more than one active connection and name them, never taking the first', async () => {
        mockRunViewResults([
            bcRow(CI_PROD, 'BC Production', 'business-central'),
            bcRow(CI_UAT, 'BC UAT', 'business-central'),
        ]);

        const attempt = action['getCompanyIntegration'](COMPANY_ID, {} as never);

        await expect(attempt).rejects.toThrow(
            `Company ${COMPANY_ID} has 2 active accounting connections: 'BC Production' (business-central, ID ${CI_PROD}), 'BC UAT' (business-central, ID ${CI_UAT}). Pass CompanyIntegrationID to select one.`
        );
    });

    it('should report when the company has no active connection', async () => {
        mockRunViewResults([]);

        await expect(action['getCompanyIntegration'](COMPANY_ID, {} as never))
            .rejects.toThrow(/No active Microsoft Dynamics 365 Business Central integration found/);
    });

    it('should load exactly the connection named by CompanyIntegrationID', async () => {
        const runViewFn = mockRunViewResults([]);
        const { loadFn, getEntityObject } = mockCompanyIntegrationLoad(bcRow(CI_UAT, 'BC UAT', 'business-central'));

        const record = await action['getCompanyIntegration'](COMPANY_ID, {} as never, CI_UAT);

        expect(getEntityObject).toHaveBeenCalledWith('MJ: Company Integrations', {});
        expect(loadFn).toHaveBeenCalledWith(CI_UAT);
        expect(runViewFn).not.toHaveBeenCalled();
        expect(record.ID).toBe(CI_UAT);
    });

    it('should refuse a CompanyIntegrationID that belongs to another company', async () => {
        mockCompanyIntegrationLoad(bcRow(CI_UAT, 'BC UAT', 'business-central', { CompanyID: OTHER_COMPANY_ID }));

        await expect(action['getCompanyIntegration'](COMPANY_ID, {} as never, CI_UAT))
            .rejects.toMatchObject({ resultCode: 'COMPANY_INTEGRATION_WRONG_COMPANY' });
    });

    it('should refuse an inactive CompanyIntegrationID', async () => {
        mockCompanyIntegrationLoad(bcRow(CI_UAT, 'BC UAT', 'business-central', { IsActive: false }));

        await expect(action['getCompanyIntegration'](COMPANY_ID, {} as never, CI_UAT))
            .rejects.toMatchObject({ resultCode: 'COMPANY_INTEGRATION_INACTIVE' });
    });

    it('should refuse a CompanyIntegrationID of another provider', async () => {
        mockCompanyIntegrationLoad(bcRow(CI_UAT, 'QBO', 'QuickBooks Online'));

        await expect(action['getCompanyIntegration'](COMPANY_ID, {} as never, CI_UAT))
            .rejects.toMatchObject({ resultCode: 'NOT_ACCOUNTING_INTEGRATION' });
    });

    it('should refuse a CompanyIntegrationID that does not exist', async () => {
        mockCompanyIntegrationLoad(null);

        await expect(action['getCompanyIntegration'](COMPANY_ID, {} as never, CI_UAT))
            .rejects.toMatchObject({ resultCode: 'COMPANY_INTEGRATION_NOT_FOUND' });
    });

    it('should refuse a malformed CompanyIntegrationID before querying', async () => {
        const { loadFn } = mockCompanyIntegrationLoad(null);

        await expect(action['getCompanyIntegration'](COMPANY_ID, {} as never, "x' OR 1=1--"))
            .rejects.toMatchObject({ resultCode: 'VALIDATION_ERROR' });
        expect(loadFn).not.toHaveBeenCalled();
    });

    it('should not reuse a cached connection when a different CompanyIntegrationID is asked for', async () => {
        mockRunViewResults([bcRow(CI_PROD, 'BC Production', 'business-central')]);
        await action['getCompanyIntegration'](COMPANY_ID, {} as never);

        mockCompanyIntegrationLoad(bcRow(CI_UAT, 'BC UAT', 'business-central'));
        const record = await action['getCompanyIntegration'](COMPANY_ID, {} as never, CI_UAT);

        expect(record.ID).toBe(CI_UAT);
    });
});

describe('QuickBooksBaseAction', () => {
    describe('mapAccountType', () => {
        // Create test instance
        class TestQBAction extends QuickBooksBaseAction {
            protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
                return { Success: true, ResultCode: 'SUCCESS' };
            }
        }

        let action: TestQBAction;

        beforeEach(() => {
            action = new TestQBAction();
        });

        it('should map Bank to Asset', () => {
            expect(action['mapAccountType']('Bank')).toBe('Asset');
        });

        it('should map Accounts Payable to Liability', () => {
            expect(action['mapAccountType']('Accounts Payable')).toBe('Liability');
        });

        it('should map Equity to Equity', () => {
            expect(action['mapAccountType']('Equity')).toBe('Equity');
        });

        it('should map Income to Revenue', () => {
            expect(action['mapAccountType']('Income')).toBe('Revenue');
        });

        it('should map Expense to Expense', () => {
            expect(action['mapAccountType']('Expense')).toBe('Expense');
        });

        it('should return Other for unknown types', () => {
            expect(action['mapAccountType']('Unknown')).toBe('Other');
        });
    });

    describe('parseQBODate', () => {
        class TestQBAction extends QuickBooksBaseAction {
            protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
                return { Success: true, ResultCode: 'SUCCESS' };
            }
        }

        it('should parse QBO date format', () => {
            const action = new TestQBAction();
            const date = action['parseQBODate']('2024-06-15');
            expect(date.toISOString()).toBe('2024-06-15T00:00:00.000Z');
        });
    });

    describe('formatQBODate', () => {
        class TestQBAction extends QuickBooksBaseAction {
            protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
                return { Success: true, ResultCode: 'SUCCESS' };
            }
        }

        it('should format date for QBO API', () => {
            const action = new TestQBAction();
            const date = new Date('2024-06-15T10:30:00Z');
            expect(action['formatQBODate'](date)).toBe('2024-06-15');
        });
    });
});
