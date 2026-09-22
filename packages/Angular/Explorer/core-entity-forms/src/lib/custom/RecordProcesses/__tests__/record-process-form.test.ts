import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { RecordProcessFormPolicy } from '../record-process-form.component';
import type { FormChromeContext, FormChromeSpec, FormChromeGroup } from '@memberjunction/ng-base-forms';

/**
 * These were written against an earlier shape of the form-chrome types and stopped compiling when
 * that shape changed — `FormChromeGroupSpec` no longer exists (the type is `FormChromeGroup`), a
 * group carries `Icon` / `SectionKeys` / `IsMore` rather than `Items` / `IsFolder`, and neither the
 * spec nor the context has an `EntityName`. The assertions were right about the behaviour, so they
 * are kept verbatim; only the literals are brought up to date.
 */

/** A group with the required fields filled in, so each test states only what it is about. */
const group = (key: string, title: string): FormChromeGroup => ({
    Key: key,
    Title: title,
    Icon: 'fa-solid fa-list',
    SectionKeys: [],
    IsMore: false,
});

/** A spec around `groups`. RelatedRoles and MoreSectionKeys are required but irrelevant here. */
const spec = (groups: FormChromeGroup[]): FormChromeSpec => ({
    Layout: 'left-nav',
    Groups: groups,
    RelatedRoles: new Map(),
    MoreSectionKeys: [],
});

/**
 * `DecorateChrome` takes the context but ignores it (`_ctx`), so an empty stub is the honest
 * fixture: building a real `EntityInfo` would suggest the policy reads something it does not.
 */
const context = {} as FormChromeContext;

describe('RecordProcessFormPolicy', () => {
    it('decorates form chrome spec so processOverview sits as the lead group', () => {
        const policy = new RecordProcessFormPolicy();
        const initialSpec = spec([
            group('details', 'Details'),
            group('processOverview', 'Overview & Status'),
            group('processRuns', 'Prior Runs'),
        ]);

        const result = policy.DecorateChrome(initialSpec, context);
        expect(result.Groups[0].Key).toBe('processOverview');
        expect(result.Groups[0].IsLead).toBe(true);
        expect(result.Groups.map((g) => g.Key)).toEqual(['processOverview', 'details', 'processRuns']);
    });

    it('returns spec unchanged if processOverview is not present', () => {
        const policy = new RecordProcessFormPolicy();
        const initialSpec = spec([group('details', 'Details')]);

        const result = policy.DecorateChrome(initialSpec, context);
        expect(result.Groups.map((g) => g.Key)).toEqual(['details']);
    });

    it('leaves the other groups in their original order behind the lead', () => {
        // The reorder lifts one group out and keeps the rest as they were — worth pinning, since a
        // sort-based implementation would pass the first test while shuffling everything else.
        const policy = new RecordProcessFormPolicy();
        const result = policy.DecorateChrome(
            spec([group('a', 'A'), group('processOverview', 'Overview'), group('b', 'B'), group('c', 'C')]),
            context,
        );
        expect(result.Groups.map((g) => g.Key)).toEqual(['processOverview', 'a', 'b', 'c']);
    });
});
