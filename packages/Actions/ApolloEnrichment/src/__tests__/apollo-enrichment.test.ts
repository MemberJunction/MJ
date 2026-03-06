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
    CompositeKey: { FromID: vi.fn().mockReturnValue({}) },
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

vi.mock('axios', () => ({
    default: {
        get: vi.fn(),
        post: vi.fn()
    }
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
