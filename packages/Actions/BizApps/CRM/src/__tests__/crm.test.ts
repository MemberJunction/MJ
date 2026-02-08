import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {
        protected async InternalRunAction(): Promise<unknown> { return {}; }
    }
}));

vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: unknown) => target
}));

vi.mock('@memberjunction/core', () => ({
    UserInfo: class UserInfo {},
    Metadata: vi.fn(),
    RunView: vi.fn().mockImplementation(() => ({
        RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] })
    }))
}));

vi.mock('@memberjunction/core-entities', () => ({
    CompanyIntegrationEntity: class CompanyIntegrationEntity {
        CompanyID: string = '';
        APIKey: string | null = null;
        AccessToken: string | null = null;
        RefreshToken: string | null = null;
        CustomAttribute1: string | null = null;
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

import { BaseCRMAction } from '../base/base-crm.action';

// Concrete subclass for testing
class TestCRMAction extends BaseCRMAction {
    protected crmProvider = 'TestCRM';
    protected integrationName = 'TestCRM';

    protected async InternalRunAction(): Promise<{ Success: boolean; ResultCode: string }> {
        return { Success: true, ResultCode: 'SUCCESS' };
    }
}

describe('BaseCRMAction', () => {
    let action: TestCRMAction;

    beforeEach(() => {
        action = new TestCRMAction();
    });

    describe('formatPhoneNumber', () => {
        it('should format 10-digit US numbers to E.164', () => {
            expect(action['formatPhoneNumber']('5551234567')).toBe('+15551234567');
        });

        it('should format numbers with existing country code', () => {
            expect(action['formatPhoneNumber']('15551234567')).toBe('+15551234567');
        });

        it('should strip non-numeric characters', () => {
            expect(action['formatPhoneNumber']('(555) 123-4567')).toBe('+15551234567');
        });

        it('should return empty string for empty input', () => {
            expect(action['formatPhoneNumber']('')).toBe('');
        });

        it('should return cleaned string for non-US numbers', () => {
            expect(action['formatPhoneNumber']('+44 20 7123 4567')).toBe('442071234567');
        });
    });

    describe('isValidEmail', () => {
        it('should return true for valid emails', () => {
            expect(action['isValidEmail']('test@example.com')).toBe(true);
            expect(action['isValidEmail']('user.name@domain.org')).toBe(true);
        });

        it('should return false for invalid emails', () => {
            expect(action['isValidEmail']('invalid')).toBe(false);
            expect(action['isValidEmail']('no@')).toBe(false);
            expect(action['isValidEmail']('@domain.com')).toBe(false);
            expect(action['isValidEmail']('has spaces@domain.com')).toBe(false);
        });
    });

    describe('mapDealStatus', () => {
        it('should map won statuses', () => {
            expect(action['mapDealStatus']('closed-won')).toBe('won');
            expect(action['mapDealStatus']('Won')).toBe('won');
            expect(action['mapDealStatus']('Success')).toBe('won');
        });

        it('should map lost statuses', () => {
            expect(action['mapDealStatus']('closed-lost')).toBe('lost');
            expect(action['mapDealStatus']('Lost')).toBe('lost');
            expect(action['mapDealStatus']('Failed')).toBe('lost');
        });

        it('should map open statuses', () => {
            expect(action['mapDealStatus']('open')).toBe('open');
            expect(action['mapDealStatus']('Active')).toBe('open');
            expect(action['mapDealStatus']('Qualified')).toBe('open');
        });

        it('should return unknown for unrecognized statuses', () => {
            expect(action['mapDealStatus']('pending')).toBe('unknown');
            expect(action['mapDealStatus']('review')).toBe('unknown');
        });
    });

    describe('mapActivityType', () => {
        it('should map call types', () => {
            expect(action['mapActivityType']('call')).toBe('call');
            expect(action['mapActivityType']('Phone')).toBe('call');
        });

        it('should map email types', () => {
            expect(action['mapActivityType']('email')).toBe('email');
        });

        it('should map meeting types', () => {
            expect(action['mapActivityType']('meeting')).toBe('meeting');
            expect(action['mapActivityType']('Appointment')).toBe('meeting');
        });

        it('should map task types', () => {
            expect(action['mapActivityType']('task')).toBe('task');
            expect(action['mapActivityType']('Todo')).toBe('task');
        });

        it('should return other for unknown types', () => {
            expect(action['mapActivityType']('unknown')).toBe('other');
        });
    });

    describe('formatCRMDate', () => {
        it('should format date as ISO string', () => {
            const date = new Date('2024-06-15T10:30:00Z');
            expect(action['formatCRMDate'](date)).toBe('2024-06-15T10:30:00.000Z');
        });
    });

    describe('parseCRMDate', () => {
        it('should parse ISO date string', () => {
            const result = action['parseCRMDate']('2024-06-15T10:30:00Z');
            expect(result.toISOString()).toBe('2024-06-15T10:30:00.000Z');
        });
    });

    describe('buildCRMErrorMessage', () => {
        it('should build error without system error', () => {
            expect(action['buildCRMErrorMessage']('GetContact', 'Not found'))
                .toBe('CRM operation failed: GetContact. Not found');
        });

        it('should include system error', () => {
            const result = action['buildCRMErrorMessage']('GetContact', 'Failed', new Error('API timeout'));
            expect(result).toContain('System error: API timeout');
        });
    });

    describe('getCommonCRMParams', () => {
        it('should return CompanyID param', () => {
            const params = action['getCommonCRMParams']();
            expect(params).toHaveLength(1);
            expect(params[0].Name).toBe('CompanyID');
        });
    });

    describe('getCredentialFromEnv', () => {
        it('should build correct env key', () => {
            process.env['BIZAPPS_TESTCRM_COMP1_API_KEY'] = 'key123';
            expect(action['getCredentialFromEnv']('COMP1', 'API_KEY')).toBe('key123');
            delete process.env['BIZAPPS_TESTCRM_COMP1_API_KEY'];
        });
    });

    describe('getParamValue', () => {
        it('should find param by name', () => {
            const params = [{ Name: 'ContactId', Value: '42', Type: 'Input' }];
            expect(action['getParamValue'](params, 'ContactId')).toBe('42');
        });

        it('should return undefined for missing param', () => {
            expect(action['getParamValue']([], 'Missing')).toBeUndefined();
        });
    });
});
