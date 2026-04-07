import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock Angular core to avoid JIT compilation errors
vi.mock('@angular/core', () => ({
    Injectable: () => (target: Function) => target,
    Component: () => (target: Function) => target,
    Directive: () => (target: Function) => target,
    NgModule: () => (target: Function) => target,
    Input: () => () => {},
    Output: () => () => {},
    EventEmitter: class { emit() {} },
    ChangeDetectorRef: class { detectChanges() {} markForCheck() {} },
    ChangeDetectionStrategy: { OnPush: 1 },
    ViewChild: () => () => {},
    ElementRef: class {},
    OnInit: class {},
    OnDestroy: class {},
    AfterViewInit: class {},
    Injector: class {},
    ViewEncapsulation: { None: 0 },
    inject: () => ({}),
}));

// Mock other Angular and MJ dependencies
vi.mock('@angular/forms', () => ({}));
vi.mock('rxjs', () => ({
    Subject: class { next() {} complete() {} pipe() { return this; } subscribe() { return this; } },
    BehaviorSubject: class { next() {} pipe() { return this; } subscribe() { return this; } getValue() {} },
}));
vi.mock('rxjs/operators', () => ({
    takeUntil: () => (source: unknown) => source,
}));
vi.mock('@memberjunction/core', () => ({
    BaseEntity: class {},
    CompositeKey: class {},
    Metadata: class {},
    RunView: class { RunView() { return { Success: false, Results: [] }; } RunViews() { return []; } },
}));
vi.mock('@memberjunction/core-entities', () => ({
    ResourceData: class {},
    KnowledgeHubMetadataEngine: { Instance: {} },
    MJContentSourceEntity: class {},
    MJContentSourceTypeEntity_IContentSourceTypeField: class {},
    MJScheduledActionEntity: class {},
    MJScheduledActionParamEntity: class {},
    MJContentItemDuplicateEntity: class {},
    UserInfoEngine: { Instance: { Config: vi.fn() } },
}));
vi.mock('@memberjunction/global', () => ({
    RegisterClass: () => (target: Function) => target,
    UUIDsEqual: vi.fn(),
    NormalizeUUID: vi.fn((x: string) => x),
}));
vi.mock('@memberjunction/ng-shared', () => ({
    BaseResourceComponent: class {},
    NavigationService: class {},
}));
vi.mock('@memberjunction/graphql-dataprovider', () => ({
    GraphQLDataProvider: class {},
    GraphQLAIClient: class {},
}));
vi.mock('@memberjunction/ng-notifications', () => ({
    MJNotificationService: { Instance: { CreateSimpleNotification: vi.fn() } },
}));
vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: { Instance: { Prompts: [] } },
}));
vi.mock('@memberjunction/ng-word-cloud', () => ({
    WordCloudItem: class {},
}));
vi.mock('@memberjunction/ng-trees', () => ({
    TreeBranchConfig: class {},
    TreeLeafConfig: class {},
}));

import { CronToHumanReadable } from '../AI/components/autotagging/autotagging-pipeline-resource.component';

describe('CronToHumanReadable', () => {
    describe('every N minutes patterns', () => {
        it('should parse "every minute" pattern', () => {
            expect(CronToHumanReadable('*/1 * * * *')).toBe('Every minute');
        });

        it('should parse "every 15 minutes" pattern', () => {
            expect(CronToHumanReadable('*/15 * * * *')).toBe('Every 15 minutes');
        });

        it('should parse "every 5 minutes" pattern', () => {
            expect(CronToHumanReadable('*/5 * * * *')).toBe('Every 5 minutes');
        });

        it('should parse "every 30 minutes" pattern', () => {
            expect(CronToHumanReadable('*/30 * * * *')).toBe('Every 30 minutes');
        });
    });

    describe('hourly patterns', () => {
        it('should parse "every hour" pattern (minute 0)', () => {
            expect(CronToHumanReadable('0 * * * *')).toBe('Every hour');
        });

        it('should parse "every hour" pattern (minute 30)', () => {
            expect(CronToHumanReadable('30 * * * *')).toBe('Every hour');
        });

        it('should parse "every 2 hours" pattern', () => {
            expect(CronToHumanReadable('0 */2 * * *')).toBe('Every 2 hours');
        });

        it('should parse "every 6 hours" pattern', () => {
            expect(CronToHumanReadable('0 */6 * * *')).toBe('Every 6 hours');
        });

        it('should parse "every 1 hour" as "every hour"', () => {
            expect(CronToHumanReadable('0 */1 * * *')).toBe('Every hour');
        });
    });

    describe('daily patterns', () => {
        it('should parse "daily at 2:00 AM"', () => {
            expect(CronToHumanReadable('0 2 * * *')).toBe('Daily at 2:00 AM');
        });

        it('should parse "daily at 12:00 PM"', () => {
            expect(CronToHumanReadable('0 12 * * *')).toBe('Daily at 12:00 PM');
        });

        it('should parse "daily at 12:00 AM" (midnight)', () => {
            expect(CronToHumanReadable('0 0 * * *')).toBe('Daily at 12:00 AM');
        });

        it('should parse "daily at 11:30 PM"', () => {
            expect(CronToHumanReadable('30 23 * * *')).toBe('Daily at 11:30 PM');
        });

        it('should parse "daily at 5:15 AM"', () => {
            expect(CronToHumanReadable('15 5 * * *')).toBe('Daily at 5:15 AM');
        });
    });

    describe('weekly patterns', () => {
        it('should parse "weekly on Monday at 2:00 AM"', () => {
            expect(CronToHumanReadable('0 2 * * 1')).toBe('Weekly on Monday at 2:00 AM');
        });

        it('should parse "weekly on Sunday at 12:00 AM"', () => {
            expect(CronToHumanReadable('0 0 * * 0')).toBe('Weekly on Sunday at 12:00 AM');
        });

        it('should parse "weekly on Friday at 6:00 PM"', () => {
            expect(CronToHumanReadable('0 18 * * 5')).toBe('Weekly on Friday at 6:00 PM');
        });

        it('should handle day-of-week 7 as Sunday', () => {
            expect(CronToHumanReadable('0 9 * * 7')).toBe('Weekly on Sunday at 9:00 AM');
        });
    });

    describe('monthly patterns', () => {
        it('should parse "monthly on day 1 at 12:00 AM"', () => {
            expect(CronToHumanReadable('0 0 1 * *')).toBe('Monthly on day 1 at 12:00 AM');
        });

        it('should parse "monthly on day 15 at 3:00 AM"', () => {
            expect(CronToHumanReadable('0 3 15 * *')).toBe('Monthly on day 15 at 3:00 AM');
        });
    });

    describe('6-part cron expressions (with seconds)', () => {
        it('should handle 6-part cron by discarding seconds field', () => {
            expect(CronToHumanReadable('0 0 2 * * *')).toBe('Daily at 2:00 AM');
        });

        it('should handle 6-part weekly cron', () => {
            expect(CronToHumanReadable('0 0 9 * * 1')).toBe('Weekly on Monday at 9:00 AM');
        });
    });

    describe('fallback behavior', () => {
        it('should return raw cron for unrecognized patterns', () => {
            const raw = '*/5 */2 1 6 3';
            expect(CronToHumanReadable(raw)).toBe(raw);
        });

        it('should return "No schedule" for empty string', () => {
            expect(CronToHumanReadable('')).toBe('No schedule');
        });

        it('should return raw cron for invalid part count', () => {
            expect(CronToHumanReadable('* * *')).toBe('* * *');
        });
    });
});
