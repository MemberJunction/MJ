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

    it('leaves the other groups in their original order behind the lead', () => {
        // The reorder lifts one group out and keeps the rest exactly as they were. Worth pinning
        // separately: a sort-based implementation would satisfy the first test — processOverview
        // does end up first — while quietly reordering everything behind it.
        //
        // The trailing keys are deliberately NOT in alphabetical order. With 'a', 'b', 'c' the
        // expected result is also the sorted result, so a sort-based implementation would pass
        // this test too and it would assert nothing. 'charlie', 'alpha', 'bravo' sorts to
        // 'alpha', 'bravo', 'charlie' — different from the original order, so the test fails if
        // the implementation ever stops preserving it.
        const policy = new RecordProcessFormPolicy();
        const initialSpec: FormChromeSpec = {
            Layout: 'left-nav',
            Groups: [
                {
                    Key: 'charlie',
                    Title: 'Charlie',
                    Icon: 'fa fa-list',
                    SectionKeys: ['charlie'],
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
                    Key: 'alpha',
                    Title: 'Alpha',
                    Icon: 'fa fa-list',
                    SectionKeys: ['alpha'],
                    IsMore: false,
                },
                {
                    Key: 'bravo',
                    Title: 'Bravo',
                    Icon: 'fa fa-list',
                    SectionKeys: ['bravo'],
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
            PrimarySectionCount: 4,
        };

        const result = policy.DecorateChrome(initialSpec, context);
        expect(result.Groups.map((g) => g.Key)).toEqual(['processOverview', 'charlie', 'alpha', 'bravo']);
    });
});
