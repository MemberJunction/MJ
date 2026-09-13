import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        protected async InternalRunAction(): Promise<unknown> { return {}; }
    }
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target
}));

vi.mock('@memberjunction/core', () => ({
    BaseEntity: class BaseEntity {
        LatestResult: unknown = null;
        FirstPrimaryKey = { NeedsQuotes: true };
        Set(_field: string, _value: unknown): void {}
        Get(_field: string): unknown { return ''; }
        async Save(): Promise<boolean> { return true; }
    },
    LogError: vi.fn(),
    LogStatus: vi.fn(),
    Metadata: vi.fn().mockImplementation(() => ({
        GetEntityObject: vi.fn().mockResolvedValue({
            Set: vi.fn(),
            Get: vi.fn().mockReturnValue(1),
            Save: vi.fn().mockResolvedValue(true),
            NewRecord: vi.fn(),
            LatestResult: null
        })
    })),
    RunView: vi.fn().mockImplementation(() => ({
        RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] })
    })),
    UserInfo: class UserInfo {},
    CompositeKey: {
        FromID: vi.fn().mockReturnValue({}),
        // Records the (entity, row) pair so tests can assert the key was built from the entity's real PK columns.
        FromEntityRecord: vi.fn((entity: { PrimaryKeys: { Name: string }[] }, row: Record<string, unknown>) => ({
            KeyValuePairs: entity.PrimaryKeys.map(pk => ({ FieldName: pk.Name, Value: row[pk.Name] })),
        })),
    },
    RunViewResult: class RunViewResult {}
}));

vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('@memberjunction/actions-base', () => ({
    ActionParam: class ActionParam {
        Name: string = '';
        Value: unknown = null;
        Type: string = 'Input';
    },
    ActionResultSimple: class ActionResultSimple {
        Success: boolean = false;
        ResultCode: string = '';
        Message?: string;
    },
    RunActionParams: class RunActionParams {
        Params: unknown[] = [];
        ContextUser: unknown = null;
        Action: unknown = null;
        Filters: unknown[] = [];
    }
}));

vi.mock('@memberjunction/network-utils', () => ({
    HttpGet: vi.fn(),
    HttpPost: vi.fn(),
    IsHttpError: vi.fn(() => false)
}));

vi.mock('../config', () => ({
    ApolloAPIEndpoint: 'https://api.apollo.io/v1',
    EmailSourceName: 'Apollo.io',
    GroupSize: 10,
    ConcurrentGroups: 1,
    MaxPeopleToEnrichPerOrg: 500,
    ApolloAPIKey: 'test-api-key'
}));

// Import after mocks
import { ApolloEnrichmentAccountsAction } from '../accounts';
import { ApolloEnrichmentContactsAction } from '../contacts';

describe('ApolloEnrichmentAccountsAction', () => {
    let action: ApolloEnrichmentAccountsAction;

    beforeEach(() => {
        action = new ApolloEnrichmentAccountsAction();
    });

    it('should be instantiable', () => {
        expect(action).toBeDefined();
    });

    describe('IsValidDate', () => {
        it('should return true for valid date strings', () => {
            expect((action as unknown as Record<string, (d: string) => boolean>).IsValidDate('2024-01-15')).toBe(true);
            expect((action as unknown as Record<string, (d: string) => boolean>).IsValidDate('2024-01-15T10:30:00Z')).toBe(true);
        });

        it('should return false for invalid date strings', () => {
            expect((action as unknown as Record<string, (d: string) => boolean>).IsValidDate('')).toBe(false);
            expect((action as unknown as Record<string, (d: string) => boolean>).IsValidDate('not-a-date')).toBe(false);
        });

        it('should return false for null/undefined', () => {
            expect((action as unknown as Record<string, (d: string) => boolean>).IsValidDate(null as unknown as string)).toBe(false);
            expect((action as unknown as Record<string, (d: string) => boolean>).IsValidDate(undefined as unknown as string)).toBe(false);
        });
    });

    describe('IsExcludedTitle', () => {
        it('should exclude student titles', () => {
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle('Student')).toBe(true);
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle('student member')).toBe(true);
        });

        it('should exclude volunteer titles', () => {
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle('Volunteer')).toBe(true);
        });

        it('should exclude member titles', () => {
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle('Member')).toBe(true);
        });

        it('should not exclude regular titles', () => {
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle('CEO')).toBe(false);
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle('Software Engineer')).toBe(false);
        });

        it('should return false for null/undefined title', () => {
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle(null as unknown as string)).toBe(false);
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle(undefined as unknown as string)).toBe(false);
        });
    });

    describe('EscapeSingleQuotes', () => {
        it('should escape single quotes', () => {
            expect((action as unknown as Record<string, (s: string) => string>).EscapeSingleQuotes("O'Brien")).toBe("O''Brien");
        });

        it('should handle strings without quotes', () => {
            expect((action as unknown as Record<string, (s: string) => string>).EscapeSingleQuotes('Hello')).toBe('Hello');
        });

        it('should return empty string for null/undefined', () => {
            expect((action as unknown as Record<string, (s: string) => string>).EscapeSingleQuotes(null as unknown as string)).toBe('');
            expect((action as unknown as Record<string, (s: string) => string>).EscapeSingleQuotes(undefined as unknown as string)).toBe('');
        });

        it('should handle multiple quotes', () => {
            expect((action as unknown as Record<string, (s: string) => string>).EscapeSingleQuotes("it's a 'test'")).toBe("it''s a ''test''");
        });
    });
});

describe('ApolloEnrichmentContactsAction', () => {
    let action: ApolloEnrichmentContactsAction;

    beforeEach(() => {
        action = new ApolloEnrichmentContactsAction();
    });

    it('should be instantiable', () => {
        expect(action).toBeDefined();
    });

    describe('getParamValue', () => {
        it('should return param value by name case-insensitively', () => {
            const params = {
                Params: [{ Name: 'EntityName', Value: 'Contacts', Type: 'Input' }]
            };
            const result = (action as unknown as Record<string, (params: unknown, name: string) => unknown>).getParamValue(params, 'entityname');
            expect(result).toBe('Contacts');
        });

        it('should return null for "null" string values', () => {
            const params = {
                Params: [{ Name: 'EntityName', Value: 'null', Type: 'Input' }]
            };
            const result = (action as unknown as Record<string, (params: unknown, name: string) => unknown>).getParamValue(params, 'EntityName');
            expect(result).toBeNull();
        });

        it('should return undefined for missing params', () => {
            const params = {
                Params: [{ Name: 'EntityName', Value: 'Contacts', Type: 'Input' }]
            };
            const result = (action as unknown as Record<string, (params: unknown, name: string) => unknown>).getParamValue(params, 'NonExistent');
            expect(result).toBeUndefined();
        });
    });

    describe('EscapeSingleQuotes', () => {
        it('should escape single quotes in strings', () => {
            expect((action as unknown as Record<string, (s: string) => string>).EscapeSingleQuotes("it's")).toBe("it''s");
        });

        it('should return empty string for falsy input', () => {
            expect((action as unknown as Record<string, (s: string) => string>).EscapeSingleQuotes('')).toBe('');
            expect((action as unknown as Record<string, (s: string) => string>).EscapeSingleQuotes(null as unknown as string)).toBe('');
        });
    });

    describe('IsValidDate', () => {
        it('should return true for valid dates', () => {
            expect((action as unknown as Record<string, (d: string) => boolean>).IsValidDate('2024-06-15')).toBe(true);
        });

        it('should return false for empty or invalid dates', () => {
            expect((action as unknown as Record<string, (d: string) => boolean>).IsValidDate('')).toBe(false);
            expect((action as unknown as Record<string, (d: string) => boolean>).IsValidDate('xyz')).toBe(false);
        });
    });

    describe('IsExcludedTitle', () => {
        it('should exclude configured titles', () => {
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle('Student')).toBe(true);
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle('VOLUNTEER')).toBe(true);
        });

        it('should not exclude business titles', () => {
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle('VP of Sales')).toBe(false);
        });

        it('should return false for empty/null title', () => {
            expect((action as unknown as Record<string, (t: string) => boolean>).IsExcludedTitle(null as unknown as string)).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// Primary-key handling on the CONFIGURED account / contact entities (not MJ core entities):
// keys must come from the entity's real primary key column(s), never a literal `ID`.
// ---------------------------------------------------------------------------

describe('ApolloEnrichmentAccountsAction primary-key handling', () => {
    it('updateAccountEnrichedTimestamp loads the configured account entity by its real (composite) key', async () => {
        const action = new ApolloEnrichmentAccountsAction();
        const accountsEntityInfo = { Name: 'Accounts', PrimaryKeys: [{ Name: 'OrgID' }, { Name: 'Region' }] };
        const accountEntity = { Set: vi.fn(), Save: vi.fn().mockResolvedValue(true), LatestResult: null };
        const md = {
            EntityByName: vi.fn().mockReturnValue(accountsEntityInfo),
            GetEntityObject: vi.fn().mockResolvedValue(accountEntity),
        };
        const record = { OrgID: 42, Region: 'EMEA', Domain: 'example.com' };
        const params = { AccountEntity: { EntityName: 'Accounts', EnrichedAtField: 'EnrichedAt' }, Record: record };

        type TimestampUpdater = {
            updateAccountEnrichedTimestamp(p: unknown, r: Record<string, unknown>, m: unknown, u: unknown): Promise<boolean>;
        };
        const ok = await (action as unknown as TimestampUpdater).updateAccountEnrichedTimestamp(params, record, md, {});

        expect(ok).toBe(true);
        expect(md.EntityByName).toHaveBeenCalledWith('Accounts');
        const [entityName, key] = md.GetEntityObject.mock.calls[0];
        expect(entityName).toBe('Accounts');
        expect(key).toEqual({ KeyValuePairs: [{ FieldName: 'OrgID', Value: 42 }, { FieldName: 'Region', Value: 'EMEA' }] });
        expect(accountEntity.Set).toHaveBeenCalledWith('EnrichedAt', expect.any(Date));
    });
});

describe('ApolloEnrichmentContactsAction primary-key handling', () => {
    type HistoryUpserter = {
        UpsertContactEmploymentAndEducationHistory(contact: unknown, contactEntity: unknown, params: unknown): Promise<void>;
    };
    const employment = { organization_name: 'Acme', title: 'Engineer', current: true, start_date: null, end_date: null, degree: null };
    const baseParams = {
        EmploymentHistoryEntityName: 'Employment History',
        EmploymentHistoryContactIDFieldName: 'ContactKey',
        EmploymentHistoryOrganizationFieldName: 'Organization',
        EmploymentHistoryTitleFieldName: 'Title',
        CurrentUser: {},
    };

    it("filters history by the contact's real primary key value and column type, not a literal ID", async () => {
        const action = new ApolloEnrichmentContactsAction();
        const runView = vi.fn().mockResolvedValue({ Success: true, Results: [] });
        const { RunView } = await import('@memberjunction/core');
        (RunView as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () { return { RunView: runView }; });
        const historyEntity = { NewRecord: vi.fn(), Set: vi.fn(), Save: vi.fn().mockResolvedValue(true), LatestResult: null };
        const params = { ...baseParams, Md: { GetEntityObject: vi.fn().mockResolvedValue(historyEntity), EntityByName: vi.fn() } };
        const contactEntity = {
            PrimaryKeys: [{ Name: 'individual_id' }],
            FirstPrimaryKey: { Name: 'individual_id', Value: 9001, NeedsQuotes: false },
            EntityInfo: { Name: 'Contacts' },
            Get: vi.fn(() => { throw new Error('Get("ID") must not be used for the contact key'); }),
        };

        await (action as unknown as HistoryUpserter).UpsertContactEmploymentAndEducationHistory(
            { employment_history: [employment] }, contactEntity, params
        );

        expect(runView).toHaveBeenCalledTimes(1);
        expect(runView.mock.calls[0][0].ExtraFilter).toContain('ContactKey = 9001');
        expect(historyEntity.Set).toHaveBeenCalledWith('ContactKey', 9001);
    });

    it('refuses to build a single-column FK filter for a composite-keyed contact entity', async () => {
        const action = new ApolloEnrichmentContactsAction();
        const runView = vi.fn();
        const { RunView, LogError } = await import('@memberjunction/core');
        (RunView as unknown as ReturnType<typeof vi.fn>).mockImplementation(function () { return { RunView: runView }; });
        const params = { ...baseParams, Md: { GetEntityObject: vi.fn(), EntityByName: vi.fn() } };
        const contactEntity = {
            PrimaryKeys: [{ Name: 'OrgID' }, { Name: 'PersonNo' }],
            FirstPrimaryKey: { Name: 'OrgID', Value: 1, NeedsQuotes: false },
            EntityInfo: { Name: 'Org People' },
        };

        await (action as unknown as HistoryUpserter).UpsertContactEmploymentAndEducationHistory(
            { employment_history: [employment] }, contactEntity, params
        );

        expect(runView).not.toHaveBeenCalled();
        expect(params.Md.GetEntityObject).not.toHaveBeenCalled();
        expect(LogError).toHaveBeenCalledWith(expect.stringContaining('composite primary key'));
    });
});
