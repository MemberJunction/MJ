/**
 * Tests for the invocation index's pure layer.
 *
 * The interesting assertions here are the refusals: a cron humanizer that guesses, or a state mapper
 * that treats "Draft" as live, produces a confident sentence describing automation the agent does
 * not have — on a surface whose whole job is answering "does this run on its own?", that is the one
 * failure mode worth pinning.
 */
import { describe, it, expect } from 'vitest';
import {
    DescribeCron,
    DescribeInvocationTypes,
    DescribeWhen,
    GroupInvocations,
    IsUUID,
    ResolveInvocationState,
    SummarizeInvocations,
    joinWithOr,
    type AgentInvocationPathway,
} from '../lib/components/agent-invocations.model';

const pathway = (over: Partial<AgentInvocationPathway> = {}): AgentInvocationPathway => ({
    Kind: 'Schedule',
    Title: 'Nightly digest',
    Trigger: 'Daily at 06:00',
    State: 'Live',
    ...over,
});

describe('DescribeCron', () => {
    it('reads the shapes people actually write', () => {
        expect(DescribeCron('*/15 * * * *')).toBe('Every 15 minutes');
        expect(DescribeCron('*/1 * * * *')).toBe('Every 1 minute');
        expect(DescribeCron('30 * * * *')).toBe('Hourly, at :30');
        expect(DescribeCron('0 */6 * * *')).toBe('Every 6 hours');
        expect(DescribeCron('0 6 * * *')).toBe('Daily at 06:00');
        expect(DescribeCron('30 17 * * 5')).toBe('Every Friday at 17:30');
    });

    it('pads a single-digit clock so times line up when scanned', () => {
        expect(DescribeCron('5 9 * * *')).toBe('Daily at 09:05');
    });

    it('appends a timezone only when it changes the meaning', () => {
        expect(DescribeCron('0 6 * * *', 'America/New_York')).toBe('Daily at 06:00 (America/New_York)');
        // UTC is the stored default; repeating it on every row is noise, not information.
        expect(DescribeCron('0 6 * * *', 'UTC')).toBe('Daily at 06:00');
        expect(DescribeCron('0 6 * * *', '  ')).toBe('Daily at 06:00');
    });

    it('shows an expression it cannot justify rather than guessing at one', () => {
        // A humanizer that guesses writes a confident sentence describing a schedule the job does
        // not have. Five fields the reader can look up beats one sentence that is wrong.
        expect(DescribeCron('0 0 1 */3 *')).toBe('0 0 1 */3 *');
        expect(DescribeCron('15,45 8-17 * * 1-5')).toBe('15,45 8-17 * * 1-5');
        expect(DescribeCron('not a cron')).toBe('not a cron');
    });

    it('says so when there is no schedule at all', () => {
        expect(DescribeCron(null)).toBe('No schedule set');
        expect(DescribeCron('   ')).toBe('No schedule set');
    });
});

describe('ResolveInvocationState', () => {
    it('maps every substrate\'s spelling onto the three states that matter', () => {
        expect(ResolveInvocationState('Active')).toBe('Live');
        expect(ResolveInvocationState('active')).toBe('Live');
        expect(ResolveInvocationState('Paused')).toBe('Paused');
        expect(ResolveInvocationState('Disabled')).toBe('Off');
        expect(ResolveInvocationState('Revoked')).toBe('Off');
        expect(ResolveInvocationState('Expired')).toBe('Off');
    });

    it('treats pre-live statuses as Off, not as "might run"', () => {
        // Draft and Pending do not fire. Telling someone auditing an agent that a Draft might run is
        // the wrong kind of wrong on a surface built to answer exactly that question.
        expect(ResolveInvocationState('Draft')).toBe('Off');
        expect(ResolveInvocationState('Pending')).toBe('Off');
        expect(ResolveInvocationState(null)).toBe('Off');
        expect(ResolveInvocationState(undefined)).toBe('Off');
    });
});

describe('GroupInvocations', () => {
    it('drops empty groups rather than showing headings with nothing under them', () => {
        const groups = GroupInvocations([pathway(), pathway({ Kind: 'ExposedAsAction', State: 'Live' })]);
        expect(groups.map((g) => g.Kind)).toEqual(['Schedule', 'ExposedAsAction']);
    });

    it('keeps a fixed order regardless of the order pathways arrive in', () => {
        const groups = GroupInvocations([
            pathway({ Kind: 'CalledByAgent' }),
            pathway({ Kind: 'DataChange' }),
            pathway({ Kind: 'Schedule' }),
        ]);
        expect(groups.map((g) => g.Kind)).toEqual(['Schedule', 'DataChange', 'CalledByAgent']);
    });

    it('counts only the pathways that can actually fire', () => {
        const groups = GroupInvocations([
            pathway({ State: 'Live' }),
            pathway({ State: 'Paused' }),
            pathway({ State: 'Off' }),
        ]);
        expect(groups[0].LiveCount).toBe(1);
        expect(groups[0].Pathways).toHaveLength(3);
    });

    it('gives every group a label, an icon and a blurb', () => {
        const kinds = ['Schedule', 'Routine', 'DataChange', 'BulkOperation', 'CalledByAgent', 'ExposedAsAction'] as const;
        const groups = GroupInvocations(kinds.map((Kind) => pathway({ Kind })));
        expect(groups).toHaveLength(kinds.length);
        for (const g of groups) {
            expect(g.Label.length, `${g.Kind} label`).toBeGreaterThan(0);
            expect(g.Icon.length, `${g.Kind} icon`).toBeGreaterThan(0);
            expect(g.Blurb.length, `${g.Kind} blurb`).toBeGreaterThan(0);
        }
    });
});

describe('SummarizeInvocations', () => {
    it('an agent with no pathways is not automated', () => {
        const s = SummarizeInvocations([]);
        expect(s).toEqual({ Total: 0, Live: 0, IsAutomated: false, NextRunAt: null });
    });

    it('pathways that exist but cannot fire do not make an agent automated', () => {
        const s = SummarizeInvocations([pathway({ State: 'Paused' }), pathway({ State: 'Off' })]);
        expect(s.Total).toBe(2);
        expect(s.Live).toBe(0);
        expect(s.IsAutomated).toBe(false);
    });

    it('reports the soonest next run across live pathways', () => {
        const soon = new Date('2026-08-09T06:00:00Z');
        const later = new Date('2026-08-10T06:00:00Z');
        const s = SummarizeInvocations([
            pathway({ NextRunAt: later }),
            pathway({ NextRunAt: soon }),
        ]);
        expect(s.NextRunAt?.toISOString()).toBe(soon.toISOString());
    });

    it('ignores the next run of a pathway that cannot fire', () => {
        // A disabled job still carries the NextRunAt it had when it was switched off. Surfacing that
        // would promise a run that will never happen.
        const stale = new Date('2026-08-09T06:00:00Z');
        const real = new Date('2026-08-12T06:00:00Z');
        const s = SummarizeInvocations([
            pathway({ State: 'Off', NextRunAt: stale }),
            pathway({ State: 'Live', NextRunAt: real }),
        ]);
        expect(s.NextRunAt?.toISOString()).toBe(real.toISOString());
    });

    it('tolerates a missing or invalid next run', () => {
        const s = SummarizeInvocations([pathway({ NextRunAt: null }), pathway({ NextRunAt: new Date('nope') })]);
        expect(s.NextRunAt).toBeNull();
        expect(s.IsAutomated).toBe(true);
    });
});

describe('DescribeInvocationTypes', () => {
    it('turns schema names into a sentence', () => {
        expect(DescribeInvocationTypes(['Create'])).toBe('When a record is created');
        expect(DescribeInvocationTypes(['Create', 'Update'])).toBe('When a record is created or updated');
        expect(DescribeInvocationTypes(['Create', 'Update', 'Delete'])).toBe(
            'When a record is created, updated or deleted',
        );
    });

    it('collapses spellings that mean the same event', () => {
        expect(DescribeInvocationTypes(['Create', 'AfterCreate'])).toBe('When a record is created');
    });

    it('passes an unknown type through rather than dropping it', () => {
        // A binding fires on something; naming it oddly beats implying it fires on nothing.
        expect(DescribeInvocationTypes(['Archived'])).toBe('When a record is archived');
    });

    it('says something honest when no active type came back', () => {
        expect(DescribeInvocationTypes([])).toBe('On a data change');
        expect(DescribeInvocationTypes(['', '  '])).toBe('On a data change');
    });
});

describe('joinWithOr', () => {
    it('reads the way a person would say it', () => {
        expect(joinWithOr([])).toBe('');
        expect(joinWithOr(['a'])).toBe('a');
        expect(joinWithOr(['a', 'b'])).toBe('a or b');
        expect(joinWithOr(['a', 'b', 'c'])).toBe('a, b or c');
    });
});

describe('IsUUID', () => {
    it('accepts a real key and rejects anything that could carry SQL', () => {
        // This is the guard on the one value that reaches an ExtraFilter as a literal.
        expect(IsUUID('A715122C-F912-4BF5-B4BB-9B94DFDD2A9E')).toBe(true);
        expect(IsUUID('a715122c-f912-4bf5-b4bb-9b94dfdd2a9e')).toBe(true);
        expect(IsUUID(" ' OR 1=1 --")).toBe(false);
        expect(IsUUID('A715122C-F912-4BF5-B4BB-9B94DFDD2A9')).toBe(false);
        expect(IsUUID('')).toBe(false);
        expect(IsUUID(null)).toBe(false);
        expect(IsUUID(undefined)).toBe(false);
    });
});

describe('DescribeWhen', () => {
    const now = new Date('2026-08-09T12:00:00Z');

    it('phrases the past and the future differently', () => {
        expect(DescribeWhen(new Date('2026-08-09T09:00:00Z'), now)).toBe('3 hours ago');
        expect(DescribeWhen(new Date('2026-08-09T15:00:00Z'), now)).toBe('in 3 hours');
    });

    it('scales the unit to the distance', () => {
        expect(DescribeWhen(new Date('2026-08-09T11:30:00Z'), now)).toBe('30 minutes ago');
        expect(DescribeWhen(new Date('2026-08-07T12:00:00Z'), now)).toBe('2 days ago');
        expect(DescribeWhen(new Date('2026-06-09T12:00:00Z'), now)).toBe('2 months ago');
        expect(DescribeWhen(new Date('2024-08-09T12:00:00Z'), now)).toBe('2 years ago');
    });

    it('singularises', () => {
        expect(DescribeWhen(new Date('2026-08-09T11:00:00Z'), now)).toBe('1 hour ago');
        expect(DescribeWhen(new Date('2026-08-08T12:00:00Z'), now)).toBe('1 day ago');
    });

    it('handles the boundary and the absent case', () => {
        expect(DescribeWhen(new Date('2026-08-09T12:00:10Z'), now)).toBe('in under a minute');
        expect(DescribeWhen(new Date('2026-08-09T11:59:50Z'), now)).toBe('just now');
        expect(DescribeWhen(null, now)).toBeNull();
        expect(DescribeWhen(undefined, now)).toBeNull();
        expect(DescribeWhen(new Date('nope'), now)).toBeNull();
    });
});
