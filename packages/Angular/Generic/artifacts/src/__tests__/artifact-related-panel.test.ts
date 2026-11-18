/**
 * @vitest-environment jsdom
 */
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChangeDetectorRef, Injector, runInInjectionContext } from '@angular/core';
import type { IMetadataProvider } from '@memberjunction/core';
import type { RecordRelations, RelatedRecord } from '@memberjunction/core-entities';

const loadRecordRelations = vi.fn();
const engineConfig = vi.fn().mockResolvedValue(undefined);

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core-entities')>();
    return {
        ...actual,
        LoadRecordRelations: (...args: unknown[]) => loadRecordRelations(...args),
        GraphEngine: { GetProviderInstance: () => ({ Config: engineConfig }) },
    };
});

import { ArtifactRelatedPanelComponent } from '../lib/components/artifact-related-panel.component';

function related(entityName: string, recordID: string, label: string, sharedConceptCount = 0): RelatedRecord {
    return {
        Node: { Key: `${entityName}|${recordID}`, EntityName: entityName, RecordID: recordID, Label: label, Icon: null, Description: null },
        GraphName: 'Library Knowledge',
        SharedConceptCount: sharedConceptCount,
    };
}

function create(): ArtifactRelatedPanelComponent {
    const injector = Injector.create({ providers: [{ provide: ChangeDetectorRef, useValue: { markForCheck: vi.fn(), detectChanges: vi.fn() } }] });
    const comp = runInInjectionContext(injector, () => new ArtifactRelatedPanelComponent());
    comp.Provider = { CurrentUser: { ID: 'u1' } } as unknown as IMetadataProvider;
    return comp;
}

async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ArtifactRelatedPanelComponent', () => {
    beforeEach(() => {
        loadRecordRelations.mockReset();
        engineConfig.mockClear();
    });

    it('loads the artifact relations as the provider user and groups them into sections', async () => {
        const relations: RecordRelations = {
            Links: [related('MJ: Artifacts', 'b', 'Board Policy')],
            Backlinks: [],
            Related: [related('MJ: Artifacts', 'e', 'Bylaws', 3)],
        };
        loadRecordRelations.mockResolvedValue(relations);
        const comp = create();
        comp.ArtifactId = 'a';
        await settle();

        expect(engineConfig).toHaveBeenCalledWith(false, { ID: 'u1' }, comp.Provider);
        expect(loadRecordRelations.mock.calls[0][1]).toEqual({ EntityName: 'MJ: Artifacts', RecordID: 'a' });
        expect(comp.IsLoading).toBe(false);
        expect(comp.IsEmpty).toBe(false);
        expect(comp.Sections.map((s) => [s.Key, s.Items.length])).toEqual([['links', 1], ['backlinks', 0], ['related', 1]]);
    });

    it('emits OpenArtifact for an artifact and OpenRecord for any other record', () => {
        const comp = create();
        const artifacts: string[] = [];
        const records: { EntityName: string; RecordID: string }[] = [];
        comp.OpenArtifact.subscribe((id) => artifacts.push(id));
        comp.OpenRecord.subscribe((r) => records.push(r));

        comp.Select(related('MJ: Artifacts', 'b', 'Doc B'));
        comp.Select(related('MJ_BizApps_Common: People', 'p1', 'Pat'));

        expect(artifacts).toEqual(['b']);
        expect(records).toEqual([{ EntityName: 'MJ_BizApps_Common: People', RecordID: 'p1' }]);
    });

    it('reports a load failure instead of an empty list', async () => {
        loadRecordRelations.mockRejectedValue(new Error('graph offline'));
        const comp = create();
        comp.ArtifactId = 'a';
        await settle();

        expect(comp.ErrorMessage).toBe('graph offline');
        expect(comp.IsLoading).toBe(false);
    });

    it('keeps only the latest artifact when the id changes mid-load', async () => {
        let resolveFirst: (r: RecordRelations) => void = () => undefined;
        loadRecordRelations
            .mockImplementationOnce(() => new Promise<RecordRelations>((resolve) => (resolveFirst = resolve)))
            .mockResolvedValueOnce({ Links: [], Backlinks: [related('MJ: Artifacts', 'd', 'Doc D')], Related: [] });
        const comp = create();
        comp.ArtifactId = 'a';
        comp.ArtifactId = 'z';
        await settle();
        resolveFirst({ Links: [related('MJ: Artifacts', 'stale', 'Stale')], Backlinks: [], Related: [] });
        await settle();

        expect(comp.Sections.find((s) => s.Key === 'links')?.Items).toEqual([]);
        expect(comp.Sections.find((s) => s.Key === 'backlinks')?.Items.map((i) => i.Node.RecordID)).toEqual(['d']);
    });
});
