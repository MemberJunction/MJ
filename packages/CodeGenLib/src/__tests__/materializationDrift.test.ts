import { describe, it, expect } from 'vitest';
import { evaluateMaterializationDrift, type MaterializationDriftFacts } from '../Database/materializationDrift';

describe('evaluateMaterializationDrift (Phase 4 §13/§17.2)', () => {
    describe('EntityBaseView', () => {
        const base = (o: Partial<MaterializationDriftFacts['baseView']>): MaterializationDriftFacts => ({
            sourceType: 'EntityBaseView',
            baseView: { sourceEntityExists: true, currentEntityFields: ['ID', 'Name'], materializedColumns: ['ID', 'Name'], ...o },
        });
        it('no drift when the entity exists and the shape matches (case-insensitive)', () => {
            expect(evaluateMaterializationDrift(base({ currentEntityFields: ['id', 'NAME'] })).drift).toBe(false);
        });
        it('drift when the source entity is gone', () => {
            const v = evaluateMaterializationDrift(base({ sourceEntityExists: false }));
            expect(v.drift).toBe(true);
            expect(v.reason).toMatch(/no longer exists/);
        });
        it('drift when the source gained a field (snapshot missing it)', () => {
            const v = evaluateMaterializationDrift(base({ currentEntityFields: ['ID', 'Name', 'NewCol'] }));
            expect(v.drift).toBe(true);
            expect(v.reason).toMatch(/newcol/i);
        });
        it('drift when the source dropped/renamed a field (snapshot orphaned)', () => {
            const v = evaluateMaterializationDrift(base({ currentEntityFields: ['ID'] }));
            expect(v.drift).toBe(true);
            expect(v.reason).toMatch(/orphaned.*name/i);
        });
        it('skips the shape check when the materialized columns could not be introspected (empty) — no false DriftHold', () => {
            expect(evaluateMaterializationDrift(base({ materializedColumns: [] })).drift).toBe(false);
        });
        it('still flags a missing source entity even when columns are empty', () => {
            expect(evaluateMaterializationDrift(base({ sourceEntityExists: false, materializedColumns: [] })).drift).toBe(true);
        });
    });

    describe('Query', () => {
        const q = (o: Partial<NonNullable<MaterializationDriftFacts['query']>>): MaterializationDriftFacts => ({
            sourceType: 'Query',
            query: { missingSourceEntities: [], missingSourceFields: [], missingComposedQueries: [], currentOutputColumns: [], materializedColumns: [], ...o },
        });
        it('no drift when all provenance resolves', () => {
            expect(evaluateMaterializationDrift(q({})).drift).toBe(false);
        });
        it('drift when a source entity was removed', () => {
            expect(evaluateMaterializationDrift(q({ missingSourceEntities: ['Donations'] })).reason).toMatch(/source entity removed/i);
        });
        it('drift when a mapped source field was removed/renamed', () => {
            expect(evaluateMaterializationDrift(q({ missingSourceFields: ['Members.Region'] })).reason).toMatch(/removed\/renamed/i);
        });
        it('drift when a composed inner query was removed', () => {
            expect(evaluateMaterializationDrift(q({ missingComposedQueries: ['Active Members'] })).reason).toMatch(/composed inner query removed/i);
        });

        describe('output-shape drift (§13 — create-if-absent table not rebuilt)', () => {
            it('no drift when the output columns match the snapshot (case-insensitive)', () => {
                expect(evaluateMaterializationDrift(q({
                    currentOutputColumns: ['Region', 'Total'], materializedColumns: ['region', 'total'],
                })).drift).toBe(false);
            });
            it('drift when the query gained an output column the snapshot lacks', () => {
                const v = evaluateMaterializationDrift(q({
                    currentOutputColumns: ['Region', 'Total', 'Year'], materializedColumns: ['Region', 'Total'],
                }));
                expect(v.drift).toBe(true);
                expect(v.reason).toMatch(/output shape changed.*year/i);
            });
            it('drift when the query dropped/renamed an output column the snapshot still has', () => {
                const v = evaluateMaterializationDrift(q({
                    currentOutputColumns: ['Region'], materializedColumns: ['Region', 'Total'],
                }));
                expect(v.drift).toBe(true);
                expect(v.reason).toMatch(/orphaned.*total/i);
            });
            it('skips the shape check when the current output columns are unknown (not yet analyzed)', () => {
                expect(evaluateMaterializationDrift(q({
                    currentOutputColumns: [], materializedColumns: ['Region', 'Total'],
                })).drift).toBe(false);
            });
            it('skips the shape check when the table could not be introspected', () => {
                expect(evaluateMaterializationDrift(q({
                    currentOutputColumns: ['Region', 'Total'], materializedColumns: [],
                })).drift).toBe(false);
            });
            it('provenance drift outranks shape drift (reported first)', () => {
                const v = evaluateMaterializationDrift(q({
                    missingSourceEntities: ['Donations'],
                    currentOutputColumns: ['Region'], materializedColumns: ['Region', 'Total'],
                }));
                expect(v.reason).toMatch(/source entity removed/i);
            });
        });
    });
});
