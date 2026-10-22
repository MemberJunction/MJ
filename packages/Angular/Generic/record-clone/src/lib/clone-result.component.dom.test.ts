import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { CloneResultComponent } from './clone-result.component';
import type { RecordCloneExecuteOutput } from '@memberjunction/core-entities';
import type { CloneNavigationEvent } from './record-clone-types';

describe('CloneResultComponent (DOM)', () => {
    const SUCCESS_RESULT: RecordCloneExecuteOutput = {
        Success: true,
        ResultCode: 'SUCCESS',
        CloneLogID: 'log-uuid-456',
        Roots: [{ EntityName: 'Users', SourceKey: 'src-1', TargetKey: 'user-copy-123' }],
        Created: [
            { EntityName: 'Users', SourceKey: 'src-1', TargetKey: 'user-copy-123' },
            { EntityName: 'UserRoles', SourceKey: 'ur-1', TargetKey: 'ur-copy-1' },
            { EntityName: 'UserPreferences', SourceKey: 'up-1', TargetKey: 'up-copy-1' },
        ],
        Skipped: [],
        Counts: {
            ByEntity: {
                Users: { Create: 1, Reference: 0, Skip: 0 },
                Roles: { Create: 0, Reference: 2, Skip: 0 },
            },
            Create: 3,
            Total: 5,
        },
        Warnings: [{ Code: 'WARN1', Severity: 'Warning', Message: 'Profile picture skipped' }],
    };

    const FAILURE_RESULT: RecordCloneExecuteOutput = {
        Success: false,
        ResultCode: 'EXECUTION_ERROR',
        CloneLogID: null,
        Roots: [],
        Created: [],
        Skipped: [],
        Counts: { ByEntity: {}, Create: 0, Total: 0 },
        Warnings: [],
        ErrorMessage: 'Unique constraint violation on email address',
    };

    it('renders success state with record title, stats, and warnings', () => {
        const fixture = renderComponentFixture(CloneResultComponent, {
            inputs: {
                Result: SUCCESS_RESULT,
                EntityName: 'Users',
                RootRecordName: 'Jane Doe (Copy)',
            },
        });

        expect(query(fixture, '.result-icon-wrapper.success')).not.toBeNull();
        expect(text(fixture, '.result-title')).toBe('Record Cloned Successfully');
        expect(text(fixture, '.result-subtitle')).toContain('Jane Doe (Copy) has been created');

        const badges = queryAll(fixture, 'mj-stat-badge');
        expect(badges.length).toBe(2); // created, referenced

        const warningsBox = text(fixture, '.result-warnings-box');
        expect(warningsBox).toContain('Profile picture skipped');
    });

    it('emits OpenClone and NavigateToRecord when Open Cloned Record is clicked', () => {
        const fixture = renderComponentFixture(CloneResultComponent, {
            inputs: {
                Result: SUCCESS_RESULT,
                EntityName: 'Users',
            },
        });

        let emittedKey: unknown = null;
        let navEvent: CloneNavigationEvent | null = null;
        fixture.componentInstance.OpenClone.subscribe((k) => { emittedKey = k; });
        fixture.componentInstance.NavigateToRecord.subscribe((e) => { navEvent = e; });

        const openBtn = query(fixture, '.result-actions button') as HTMLButtonElement;
        expect(openBtn.textContent).toContain('Open Cloned Record');
        openBtn.click();

        expect(emittedKey).toBe('user-copy-123');
        expect(navEvent).toEqual({
            Kind: 'record',
            EntityName: 'Users',
            RecordKey: 'user-copy-123',
        });
    });

    it('emits CloneLog navigation when View Clone Log is clicked', () => {
        const fixture = renderComponentFixture(CloneResultComponent, {
            inputs: {
                Result: SUCCESS_RESULT,
                EntityName: 'Users',
            },
        });

        let navEvent: CloneNavigationEvent | null = null;
        fixture.componentInstance.NavigateToRecord.subscribe((e) => { navEvent = e; });

        const logBtn = query(fixture, '.audit-link-btn') as HTMLButtonElement;
        logBtn.click();

        expect(navEvent).toEqual({
            Kind: 'record',
            EntityName: 'MJ: Record Clone Logs',
            RecordKey: 'log-uuid-456',
        });
    });

    it('renders failure state and error message when execution fails', () => {
        const fixture = renderComponentFixture(CloneResultComponent, {
            inputs: {
                Result: FAILURE_RESULT,
                EntityName: 'Users',
            },
        });

        expect(query(fixture, '.result-icon-wrapper.failure')).not.toBeNull();
        expect(text(fixture, '.result-title')).toBe('Cloning Failed');
        expect(text(fixture, '.failure-message')).toContain('Unique constraint violation on email address');

        let triedAgain = false;
        fixture.componentInstance.CloneAnother.subscribe(() => { triedAgain = true; });

        const tryAgainBtn = query(fixture, '.result-actions button') as HTMLButtonElement;
        expect(tryAgainBtn.textContent).toContain('Try Again');
        tryAgainBtn.click();
        expect(triedAgain).toBe(true);
    });
});
