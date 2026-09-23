import { describe, it, expect } from 'vitest';
import { renderComponentFixture, query, text } from '@memberjunction/ng-test-utils';
import { CloneProgressComponent } from './clone-progress.component';

describe('CloneProgressComponent (DOM)', () => {
    it('renders progress percentage and phase message', () => {
        const fixture = renderComponentFixture(CloneProgressComponent, {
            inputs: {
                Progress: {
                    Phase: 'Stage 5: Materializing records',
                    PercentComplete: 75,
                    CompletedRecords: 9,
                    TotalRecords: 12,
                    CurrentEntityName: 'User Roles',
                    Message: 'Inserting User Role record 9',
                },
            },
        });

        const title = text(fixture, '.progress-title');
        expect(title).toContain('Stage 5: Materializing records');

        const percentage = text(fixture, '.progress-percentage');
        expect(percentage).toBe('75%');

        const details = text(fixture, '.progress-details');
        expect(details).toContain('Inserting User Role record 9');
        expect(details).toContain('Record 9 of 12 (User Roles)');
    });

    it('computes percentage from completed and total records when PercentComplete is missing', () => {
        const fixture = renderComponentFixture(CloneProgressComponent, {
            inputs: {
                Progress: {
                    Phase: 'Processing',
                    CompletedRecords: 5,
                    TotalRecords: 10,
                    Message: '',
                },
            },
        });

        const percentage = text(fixture, '.progress-percentage');
        expect(percentage).toBe('50%');
    });
});
