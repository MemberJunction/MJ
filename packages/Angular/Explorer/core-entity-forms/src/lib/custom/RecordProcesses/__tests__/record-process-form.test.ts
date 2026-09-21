import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { RecordProcessFormPolicy } from '../record-process-form.component';
import type { FormChromeContext, FormChromeSpec, FormChromeGroupSpec } from '@memberjunction/ng-base-forms';

describe('RecordProcessFormPolicy', () => {
    it('decorates form chrome spec so processOverview sits as the lead group', () => {
        const policy = new RecordProcessFormPolicy();
        const initialGroups: FormChromeGroupSpec[] = [
            {
                Key: 'details',
                Title: 'Details',
                IsFolder: false,
                Items: [],
            },
            {
                Key: 'processOverview',
                Title: 'Overview & Status',
                IsFolder: false,
                Items: [],
            },
            {
                Key: 'processRuns',
                Title: 'Prior Runs',
                IsFolder: false,
                Items: [],
            },
        ];

        const initialSpec: FormChromeSpec = {
            EntityName: 'MJ: Record Processes',
            Groups: initialGroups,
            Folders: [],
        };

        const context: FormChromeContext = {
            EntityName: 'MJ: Record Processes',
            Record: null,
            IsNew: false,
        };

        const result = policy.DecorateChrome(initialSpec, context);
        expect(result.Groups[0].Key).toBe('processOverview');
        expect(result.Groups[0].IsLead).toBe(true);
        expect(result.Groups.map((g) => g.Key)).toEqual(['processOverview', 'details', 'processRuns']);
    });

    it('returns spec unchanged if processOverview is not present', () => {
        const policy = new RecordProcessFormPolicy();
        const initialSpec: FormChromeSpec = {
            EntityName: 'MJ: Record Processes',
            Groups: [
                {
                    Key: 'details',
                    Title: 'Details',
                    IsFolder: false,
                    Items: [],
                },
            ],
            Folders: [],
        };

        const context: FormChromeContext = {
            EntityName: 'MJ: Record Processes',
            Record: null,
            IsNew: false,
        };

        const result = policy.DecorateChrome(initialSpec, context);
        expect(result.Groups.map((g) => g.Key)).toEqual(['details']);
    });
});
