import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll, capture } from '@memberjunction/ng-test-utils';
import {
    MJBurstClusterStripComponent,
    MJBurstClusterItem,
    MJBurstClusterCategory
} from './burst-cluster-strip.component';

interface SampleActivityRow {
    ActivityID: string;
    OccurredAt: string;
    Kind: string;
    Summary: string;
}

const SAMPLE_CATEGORIES: MJBurstClusterCategory[] = [
    { Key: 'update', Label: 'Update', SingularLabel: 'edit', PluralLabel: 'edits', Color: 'var(--mj-brand-primary)', CssModifier: 'update' },
    { Key: 'create', Label: 'Create', SingularLabel: 'create', PluralLabel: 'creates', Color: 'var(--mj-status-success)', CssModifier: 'create' },
    { Key: 'restore', Label: 'Restore', SingularLabel: 'restore', PluralLabel: 'restores', Color: '#8b5cf6', CssModifier: 'restore' }
];

describe('MJBurstClusterStripComponent (DOM)', () => {
    it('clusters irregular time-series [Items] into session bursts with non-linear quiet-gap connectors', () => {
        const items: MJBurstClusterItem[] = [
            { ID: 'e1', Timestamp: '2026-01-10T09:00:00Z', Category: 'create', Tooltip: 'Created record' },
            { ID: 'e2', Timestamp: '2026-06-15T14:00:00Z', Category: 'update', Tooltip: 'Edit 1' },
            { ID: 'e3', Timestamp: '2026-06-15T14:25:00Z', Category: 'update', Tooltip: 'Edit 2' },
            { ID: 'e4', Timestamp: '2026-10-20T18:00:00Z', Category: 'restore', Tooltip: 'Restored v1' }
        ];

        const f = renderComponentFixture(MJBurstClusterStripComponent, {
            inputs: {
                Items: items,
                Categories: SAMPLE_CATEGORIES,
                ItemSingularNoun: 'change',
                ItemPluralNoun: 'changes'
            }
        });

        const comp = f.componentInstance;
        expect(comp.Clusters).toHaveLength(3);
        expect(comp.Clusters[0].TotalCount).toBe(1);
        expect(comp.Clusters[0].Subtitle).toBe('Initial creation');
        expect(comp.Clusters[0].GapAfterLabel).toBe('5 mos quiet');
        expect(comp.Clusters[1].TotalCount).toBe(2);
        expect(comp.Clusters[1].Subtitle).toBe('2 edits');
        expect(comp.Clusters[1].GapAfterLabel).toBe('4 mos quiet');
        expect(comp.Clusters[2].TotalCount).toBe(1);
        expect(comp.Clusters[2].GapAfterLabel).toBeNull();

        expect(queryAll(f, '.mj-burst-node')).toHaveLength(3);
        expect(queryAll(f, '.mj-burst-gap-connector')).toHaveLength(2);
    });

    it('binds arbitrary domain objects via [Data] and [FieldMap] with zero domain coupling', () => {
        const rawRows: SampleActivityRow[] = [
            { ActivityID: 'a-1', OccurredAt: '2026-03-01T10:00:00Z', Kind: 'email', Summary: 'Welcome email' },
            { ActivityID: 'a-2', OccurredAt: '2026-03-01T11:30:00Z', Kind: 'call', Summary: 'Intro call' },
            { ActivityID: 'a-3', OccurredAt: '2026-08-12T16:00:00Z', Kind: 'meeting', Summary: 'QBR meeting' }
        ];

        const f = renderComponentFixture(MJBurstClusterStripComponent<SampleActivityRow>, {
            inputs: {
                Data: rawRows,
                FieldMap: {
                    ID: 'ActivityID',
                    Timestamp: 'OccurredAt',
                    Category: 'Kind',
                    Tooltip: (r: SampleActivityRow) => `${r.Kind}: ${r.Summary}`
                }
            }
        });

        const comp = f.componentInstance;
        expect(comp.Clusters).toHaveLength(2);
        expect(comp.ResolvedCategories.map(c => c.Key)).toEqual(['email', 'call', 'meeting']);
        expect(comp.Clusters[0].Pips[0].Tooltip).toBe('email: Welcome email');

        comp.SelectCluster(comp.Clusters[0].Key);
        expect(comp.GetSelectedData()).toHaveLength(2);
        expect(comp.GetSelectedData()[0].ActivityID).toBe('a-1');
    });

    it('fires BeforeClusterSelect / AfterClusterSelect / BeforeSelectionClear / AfterSelectionClear and honors Cancel', () => {
        const items: MJBurstClusterItem[] = [
            { ID: '1', Timestamp: '2026-01-01T10:00:00Z', Category: 'create' },
            { ID: '2', Timestamp: '2026-05-01T10:00:00Z', Category: 'update' }
        ];

        const f = renderComponentFixture(MJBurstClusterStripComponent, {
            inputs: { Items: items, Categories: SAMPLE_CATEGORIES }
        });
        const comp = f.componentInstance;
        const afterSelectEvents = capture(comp.AfterClusterSelect);
        const filterChangedEvents = capture(comp.FilterChanged);

        // 1. Cancel selection via BeforeClusterSelect
        const cancelSub = comp.BeforeClusterSelect.subscribe(args => {
            args.Cancel = true;
        });
        const didSelectCancelled = comp.SelectCluster(comp.Clusters[1].Key);
        expect(didSelectCancelled).toBe(false);
        expect(comp.SelectedClusterKey).toBeNull();
        expect(afterSelectEvents).toHaveLength(0);
        cancelSub.unsubscribe();

        // 2. Allow selection
        const didSelect = comp.SelectCluster(comp.Clusters[1].Key);
        expect(didSelect).toBe(true);
        expect(comp.SelectedClusterKey).toBe(comp.Clusters[1].Key);
        expect(afterSelectEvents).toHaveLength(1);
        expect(afterSelectEvents[0].SelectedIDs?.has('2')).toBe(true);
        expect(filterChangedEvents).toHaveLength(1);

        // 3. Cancel ClearSelection via BeforeSelectionClear
        const cancelClearSub = comp.BeforeSelectionClear.subscribe(args => {
            args.Cancel = true;
        });
        expect(comp.ClearSelection()).toBe(false);
        expect(comp.SelectedClusterKey).toBe(comp.Clusters[1].Key);
        cancelClearSub.unsubscribe();

        // 4. Allow ClearSelection
        expect(comp.ClearSelection()).toBe(true);
        expect(comp.SelectedClusterKey).toBeNull();
    });

    it('scales to multi-year histories via adaptive era coalescing and supports semantic Click-to-Zoom drill-down', () => {
        // Generate 15 distinct session bursts across 4 years (2023..2026)
        const multiYearItems: MJBurstClusterItem[] = [];
        const dates = [
            '2023-02-10T10:00:00Z', '2023-05-14T10:00:00Z', '2023-09-20T10:00:00Z', '2023-11-30T10:00:00Z',
            '2024-01-15T10:00:00Z', '2024-04-18T10:00:00Z', '2024-07-22T10:00:00Z', '2024-10-05T10:00:00Z',
            '2025-02-01T10:00:00Z', '2025-06-12T10:00:00Z', '2025-09-19T10:00:00Z', '2025-12-01T10:00:00Z',
            '2026-03-04T10:00:00Z', '2026-07-11T10:00:00Z', '2026-10-15T10:00:00Z'
        ];
        dates.forEach((iso, idx) => {
            multiYearItems.push({
                ID: `ev-${idx}`,
                Timestamp: iso,
                Category: idx === 0 ? 'create' : 'update'
            });
        });

        const f = renderComponentFixture(MJBurstClusterStripComponent, {
            inputs: {
                Items: multiYearItems,
                Categories: SAMPLE_CATEGORIES,
                Resolution: 'auto',
                CoalesceStrategy: 'adaptive-era',
                EraZoomThreshold: 8,
                AllowZoom: true
            }
        });

        const comp = f.componentInstance;
        // Root overview coalesces into 4 Year eras: 2023, 2024, 2025, 2026
        expect(comp.EffectiveResolution).toBe('year');
        expect(comp.Clusters.map(c => c.Label)).toEqual(['2023', '2024', '2025', '2026']);
        expect(comp.Clusters.every(c => c.IsZoomableEra)).toBe(true);

        const afterZoomEvents = capture(comp.AfterZoomChange);

        // Click the 2024 era node -> drills down into 2024's 4 session bursts!
        const node2024 = queryAll(f, '.mj-burst-node')[1] as HTMLButtonElement;
        node2024.click();
        f.detectChanges();

        expect(comp.ZoomStack).toHaveLength(1);
        expect(comp.ActiveZoomBreadcrumb?.Label).toBe('2024');
        expect(comp.EffectiveResolution).toBe('session');
        expect(comp.Clusters).toHaveLength(4);
        expect(afterZoomEvents).toHaveLength(1);
        expect(query(f, '.mj-burst-zoom-back-pill')).not.toBeNull();

        // Click the zoom-out breadcrumb pill -> returns to full 4-year overview
        const backPill = query(f, '.mj-burst-zoom-back-pill') as HTMLButtonElement;
        backPill.click();
        f.detectChanges();

        expect(comp.ZoomStack).toHaveLength(0);
        expect(comp.EffectiveResolution).toBe('year');
        expect(comp.Clusters).toHaveLength(4);
    });

    it('supports explicit calendar resolutions (month, quarter) and PipClicked event emission', () => {
        const items: MJBurstClusterItem[] = [
            { ID: 'm1', Timestamp: '2026-01-15T10:00:00Z', Category: 'create' },
            { ID: 'm2', Timestamp: '2026-01-28T10:00:00Z', Category: 'update' },
            { ID: 'm3', Timestamp: '2026-04-10T10:00:00Z', Category: 'update' }
        ];

        const f = renderComponentFixture(MJBurstClusterStripComponent, {
            inputs: {
                Items: items,
                Categories: SAMPLE_CATEGORIES,
                Resolution: 'quarter',
                AllowZoom: false
            }
        });

        const comp = f.componentInstance;
        expect(comp.EffectiveResolution).toBe('quarter');
        expect(comp.Clusters).toHaveLength(2);
        expect(comp.Clusters[0].Label).toBe("Q1 '26");
        expect(comp.Clusters[0].TotalCount).toBe(2);
        expect(comp.Clusters[1].Label).toBe("Q2 '26");

        const pipSpy = vi.fn();
        comp.PipClicked.subscribe(pipSpy);
        const firstPip = query(f, '.mj-burst-pip') as HTMLElement;
        firstPip.click();
        expect(pipSpy).toHaveBeenCalledTimes(1);
        expect(pipSpy.mock.calls[0][0].Pip.ID).toBe('m1');
    });
});
