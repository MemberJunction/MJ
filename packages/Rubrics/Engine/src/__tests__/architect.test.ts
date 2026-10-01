import { describe, expect, it } from 'vitest';
import { CritiqueRubric, DraftFromDescription, DraftFromImport, ImportMatrix, ImproveFromData, PublishImportedDraft, SaveImportedDraft } from '../architect.js';
import type { RubricVersionSnapshot } from '@memberjunction/rubrics-base';

describe('rubric architect', () => {
    it('nests a numbered path and marks a knockout as a gate', () => {
        const rows = ImportMatrix('3,Security,1,no\n3.2,Encryption,2,yes');
        expect(rows[1]).toMatchObject({ key: '3.2', parentKey: '3', name: 'Encryption', weight: 2, gate: true });
    });

    it('flags a vague name, a missing anchor, and a gate that allows not-applicable', async () => {
        const version: RubricVersionSnapshot = {
            id: 'v', rubricId: 'r', notApplicablePolicy: 'ExcludeAndRedistribute', scoreDisplayMin: 0, scoreDisplayMax: 1,
            nodes: [{
                id: 'c', key: 'ok', name: 'Ok', nodeType: 'Criterion', weight: 1, isAdvisory: false, isGate: true,
                notApplicablePolicy: 'ExcludeAndRedistribute', evidenceRequired: false, rationaleRequired: false, sequence: 0,
            }],
            scales: [], bands: [],
        };
        const inherited: RubricVersionSnapshot = {
            ...version,
            notApplicablePolicy: 'NotAllowed',
            nodes: [{ ...version.nodes[0], name: 'Accuracy', notApplicablePolicy: null }],
        };
        expect(CritiqueRubric(inherited).some(note => note.includes('not-applicable'))).toBe(false);
        expect(DraftFromImport('Imported', '1,Accuracy,1,yes').status).toBe('Draft');
        expect(PublishImportedDraft().ok).toBe(false);
        const saved: { name: string; status: string; nodes: { key: string; parentKey: string | null; name: string; weight: number; gate: boolean }[] }[] = [];
        const criteria: { versionId: string; nodes: { name: string; weight: number; gate: boolean; parentKey: string | null }[] }[] = [];
        const result = await SaveImportedDraft({
            async SaveVersion(fields) { saved.push(fields); return 'version-1'; },
            async SaveCriteria(versionId, nodes) { criteria.push({ versionId, nodes }); },
        }, 'Imported', '3,Security,1,no\n3.2,Encryption,2,yes');
        expect(result).toEqual({ id: 'version-1', status: 'Draft' });
        expect(saved[0].status).toBe('Draft');
        expect(saved[0].nodes).toContainEqual({ key: '3.2', parentKey: '3', name: 'Encryption', weight: 2, gate: true });
        expect(criteria).toEqual([{
            versionId: 'version-1',
            nodes: saved[0].nodes,
        }]);
        expect(ImproveFromData([{ criterionKey: 'facts', flag: 'NoDiscrimination' }], { withheld: false, kappa: 0.2 })).toEqual([
            'facts: NoDiscrimination',
            'Agreement kappa 0.2 is low.',
        ]);
        const published: string[] = [];
        const names: string[] = [];
        const described = await DraftFromDescription({
            async SaveVersion(fields) {
                names.push(fields.name);
                if (fields.status !== 'Draft') published.push(fields.status);
                return 'draft-from-description';
            },
            async SaveCriteria() {},
        }, 'Score a vendor packet');
        expect(names).toEqual(['Score a vendor packet']);
        expect(described).toEqual({ id: 'draft-from-description', status: 'Draft' });
        expect(published).toEqual([]);
        expect(PublishImportedDraft().ok).toBe(false);
        expect(CritiqueRubric(version)).toEqual([
            'ok: the name is too vague.',
            'ok: no anchors.',
            'ok: a gate should not allow not-applicable.',
        ]);
    });
});
