import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { RecordProcessFormPolicy } from '../record-process-form.component';
import type { FormChromeContext, FormChromeSpec, FormChromeGroup } from '@memberjunction/ng-base-forms';

describe('RecordProcessFormPolicy', () => {
    it('decorates form chrome spec so processOverview sits as the lead group', () => {
        const policy = new RecordProcessFormPolicy();
        const initialGroups: FormChromeGroup[] = [
            {
                Key: 'details',
                Title: 'Details',
                Icon: 'fa fa-list',
                SectionKeys: ['details'],
                IsMore: false,
            },
            {
                Key: 'processOverview',
                Title: 'Overview & Status',
                Icon: 'fa fa-info-circle',
                SectionKeys: ['processOverview'],
                IsMore: false,
            },
            {
                Key: 'processRuns',
                Title: 'Prior Runs',
                Icon: 'fa fa-history',
                SectionKeys: ['processRuns'],
                IsMore: false,
            },
        ];

        const initialSpec: FormChromeSpec = {
            Layout: 'left-nav',
            Groups: initialGroups,
            RelatedRoles: new Map(),
            MoreSectionKeys: [],
        };

        const context: FormChromeContext = {
            Entity: new EntityInfo(),
            RelatedRoles: {
                Policy: 'smart',
                Budget: 0,
                Assignments: [],
            },
            Panels: [],
            PrimarySectionCount: 3,
        };

        const result = policy.DecorateChrome(initialSpec, context);
        expect(result.Groups[0].Key).toBe('processOverview');
        expect(result.Groups[0].IsLead).toBe(true);
        expect(result.Groups.map((g) => g.Key)).toEqual(['processOverview', 'details', 'processRuns']);
    });

    it('returns spec unchanged if processOverview is not present', () => {
        const policy = new RecordProcessFormPolicy();
        const initialSpec: FormChromeSpec = {
            Layout: 'left-nav',
            Groups: [
                {
                    Key: 'details',
                    Title: 'Details',
                    Icon: 'fa fa-list',
                    SectionKeys: ['details'],
                    IsMore: false,
                },
            ],
            RelatedRoles: new Map(),
            MoreSectionKeys: [],
        };

        const context: FormChromeContext = {
            Entity: new EntityInfo(),
            RelatedRoles: {
                Policy: 'smart',
                Budget: 0,
                Assignments: [],
            },
            Panels: [],
            PrimarySectionCount: 1,
        };

        const result = policy.DecorateChrome(initialSpec, context);
        expect(result.Groups.map((g) => g.Key)).toEqual(['details']);
    });
});
