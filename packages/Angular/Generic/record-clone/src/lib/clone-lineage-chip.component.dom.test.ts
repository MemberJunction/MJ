import { describe, it, expect, vi } from 'vitest';
import { renderComponentFixture, query, queryAll, text } from '@memberjunction/ng-test-utils';
import { CloneLineageChipComponent } from './clone-lineage-chip.component';
import { RecordCloneService } from './record-clone.service';
import type { RecordCloneGetLineageOutput } from '@memberjunction/core-entities';
import type { FormNavigationEvent } from './record-clone-types';

describe('CloneLineageChipComponent (DOM)', () => {
    const LINEAGE_WITH_SOURCE: RecordCloneGetLineageOutput = {
        Ancestors: [
            {
                CloneLogID: 'log-0',
                EntityName: 'Sales Pipeline',
                RecordID: 'pipe-0',
                DisplayName: 'Global Root Template',
                ClonedAt: '2026-08-01T10:00:00Z',
                ClonedBy: 'Admin',
            },
            {
                CloneLogID: 'log-1',
                EntityName: 'Sales Pipeline',
                RecordID: 'pipe-1',
                DisplayName: 'Enterprise Pipeline Template',
                ClonedAt: '2026-09-01T10:00:00Z',
                ClonedBy: 'Alice',
            },
        ],
        Clones: [
            {
                CloneLogID: 'log-2',
                EntityName: 'Sales Pipeline',
                RecordID: 'pipe-2',
                DisplayName: 'Q4 EMEA Pipeline',
                ClonedAt: '2026-09-15T14:30:00Z',
                ClonedBy: 'Bob',
            },
        ],
        TotalClones: 1,
    };

    it('renders nothing when no lineage exists', () => {
        const fixture = renderComponentFixture(CloneLineageChipComponent, {
            inputs: {
                AutoLoad: false,
                LineageData: null,
            },
        });
        expect(query(fixture, '.lineage-chip-btn')).toBeNull();
    });

    it('renders "Cloned from <name>" when record has a source', () => {
        const fixture = renderComponentFixture(CloneLineageChipComponent, {
            inputs: {
                AutoLoad: false,
                LineageData: LINEAGE_WITH_SOURCE,
            },
        });

        const chip = query(fixture, '.lineage-chip-btn');
        expect(chip).not.toBeNull();
        expect(text(fixture, '.chip-label')).toBe('Cloned from Enterprise Pipeline Template');
    });

    it('toggles popover on click and emits NavigateToRecord when item is clicked', () => {
        const fixture = renderComponentFixture(CloneLineageChipComponent, {
            inputs: {
                AutoLoad: false,
                LineageData: LINEAGE_WITH_SOURCE,
            },
        });

        expect(query(fixture, '.lineage-popover')).toBeNull();

        // Click chip to open popover
        const chip = query(fixture, '.lineage-chip-btn') as HTMLButtonElement;
        chip.click();
        fixture.detectChanges();

        expect(query(fixture, '.lineage-popover')).not.toBeNull();

        // Verify ancestors and clones sections
        const groupLabels = queryAll(fixture, '.group-label');
        expect(groupLabels.length).toBe(2);

        let navEvent: FormNavigationEvent | null = null;
        fixture.componentInstance.NavigateToRecord.subscribe((e) => { navEvent = e; });

        // Click first ancestor link
        const firstLink = query(fixture, '.item-link') as HTMLButtonElement;
        expect(firstLink.textContent?.trim()).toBe('Global Root Template');
        firstLink.click();
        fixture.detectChanges();

        expect(navEvent).toEqual({
            Kind: 'record',
            EntityName: 'Sales Pipeline',
            RecordKey: 'pipe-0',
        });

        // Popover should close after navigation
        expect(query(fixture, '.lineage-popover')).toBeNull();
    });
});
