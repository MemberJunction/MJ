import { describe, it, expect } from 'vitest';
import {
    OrganicKeyClusterDetector,
    DetectorInputColumn,
} from '../discovery/OrganicKeyClusterDetector.js';

/**
 * Build a minimal DetectorInputColumn for unit testing.
 */
function col(
    schema: string,
    table: string,
    column: string,
    overrides: Partial<DetectorInputColumn> = {},
): DetectorInputColumn {
    return {
        schema,
        table,
        column,
        dataType: 'int',
        description: '',
        isPrimaryKey: false,
        participatesInFK: false,
        fkTarget: null,
        ...overrides,
    };
}

describe('OrganicKeyClusterDetector', () => {
    describe('baseline (name-only signal)', () => {
        const detector = new OrganicKeyClusterDetector({
            weights: { nameSimilarity: 1, embeddingDistance: 0, valueOverlap: 0 },
        });

        it('returns empty for fewer columns than minClusterSize', () => {
            expect(detector.detect([])).toEqual([]);
            expect(detector.detect([col('S', 'T', 'C')])).toEqual([]);
        });

        it('clusters identically-named columns across tables', () => {
            const columns = [
                col('Person', 'Person', 'BusinessEntityID'),
                col('Purchasing', 'Vendor', 'BusinessEntityID'),
                col('Person', 'Password', 'BusinessEntityID'),
                col('Sales', 'Store', 'BusinessEntityID'),
            ];
            const clusters = detector.detect(columns);
            expect(clusters.length).toBeGreaterThanOrEqual(1);
            const bizEntityCluster = clusters.find((c) =>
                c.members.every((m) => m.column === 'BusinessEntityID'),
            );
            expect(bizEntityCluster).toBeDefined();
            expect(bizEntityCluster!.members.length).toBe(4);
        });

        it('respects minDistinctTables filter — within-table-only groupings rejected', () => {
            const columns = [
                col('Sales', 'Customer', 'PrimaryEmail'),
                col('Sales', 'Customer', 'SecondaryEmail'),
                // Both columns share "email" token but live in the same table — should NOT form a cluster
            ];
            const clusters = detector.detect(columns);
            expect(clusters.length).toBe(0);
        });

        it('does not cluster type-incompatible columns even with name overlap', () => {
            const columns = [
                col('Sales', 'Customer', 'CustomerID', { dataType: 'uniqueidentifier' }),
                col('Sales', 'Order', 'CustomerID', { dataType: 'nvarchar(50)' }),
            ];
            const clusters = detector.detect(columns);
            expect(clusters.length).toBe(0);
        });

        it('does not cluster columns with disjoint names', () => {
            const columns = [
                col('S', 'A', 'FooBar'),
                col('S', 'B', 'BazQux'),
                col('S', 'C', 'AnotherThing'),
            ];
            const clusters = detector.detect(columns);
            expect(clusters.length).toBe(0);
        });
    });

    describe('FK-aware tagging', () => {
        const detector = new OrganicKeyClusterDetector({
            weights: { nameSimilarity: 1, embeddingDistance: 0, valueOverlap: 0 },
        });

        it('tags fk-fragmented when all members FK to different targets', () => {
            const columns = [
                col('Person', 'Person', 'BusinessEntityID', {
                    participatesInFK: true,
                    fkTarget: { schema: 'Person', table: 'BusinessEntity', column: 'BusinessEntityID' },
                }),
                col('Purchasing', 'Vendor', 'BusinessEntityID', {
                    participatesInFK: true,
                    fkTarget: { schema: 'Person', table: 'BusinessEntityContact', column: 'BusinessEntityID' },
                }),
                col('Sales', 'Store', 'BusinessEntityID', {
                    participatesInFK: true,
                    fkTarget: { schema: 'Person', table: 'BusinessEntity', column: 'BusinessEntityID' },
                }),
            ];
            const clusters = detector.detect(columns);
            expect(clusters.length).toBeGreaterThanOrEqual(1);
            expect(clusters[0].tags).toContain('fk-fragmented');
        });

        it('tags fk-redundant-single-target when all members FK to one target', () => {
            const columns = [
                col('Sales', 'OrderDetail', 'ProductID', {
                    participatesInFK: true,
                    fkTarget: { schema: 'Production', table: 'Product', column: 'ProductID' },
                }),
                col('Sales', 'ShoppingCart', 'ProductID', {
                    participatesInFK: true,
                    fkTarget: { schema: 'Production', table: 'Product', column: 'ProductID' },
                }),
                col('Production', 'TransactionHistory', 'ProductID', {
                    participatesInFK: true,
                    fkTarget: { schema: 'Production', table: 'Product', column: 'ProductID' },
                }),
            ];
            const clusters = detector.detect(columns);
            expect(clusters.length).toBeGreaterThanOrEqual(1);
            expect(clusters[0].tags).toContain('fk-redundant-single-target');
        });

        it('tags pk-to-pk for the live/archive pattern', () => {
            const columns = [
                col('Production', 'TransactionHistory', 'TransactionID', {
                    dataType: 'int',
                    isPrimaryKey: true,
                    participatesInFK: false,
                }),
                col('Production', 'TransactionHistoryArchive', 'TransactionID', {
                    dataType: 'int',
                    isPrimaryKey: true,
                    participatesInFK: false,
                }),
            ];
            const clusters = detector.detect(columns);
            expect(clusters.length).toBe(1);
            expect(clusters[0].tags).toContain('pk-to-pk');
        });

        it('tags no-fk-no-pk for pure value-space matches', () => {
            const columns = [
                col('dbo', 'DatabaseLog', 'DatabaseUser', { dataType: 'nvarchar(128)' }),
                col('dbo', 'ErrorLog', 'DatabaseUser', { dataType: 'nvarchar(128)' }),
            ];
            const clusters = detector.detect(columns);
            expect(clusters.length).toBe(1);
            expect(clusters[0].tags).toContain('no-fk-no-pk');
        });
    });

    describe('cluster ordering and member integrity', () => {
        const detector = new OrganicKeyClusterDetector({
            weights: { nameSimilarity: 1, embeddingDistance: 0, valueOverlap: 0 },
        });

        it('sorts clusters by member count descending', () => {
            const columns = [
                // Cluster A — 4 members
                col('S1', 'T1', 'EmailAddress'),
                col('S1', 'T2', 'EmailAddress'),
                col('S1', 'T3', 'EmailAddress'),
                col('S1', 'T4', 'EmailAddress'),
                // Cluster B — 2 members
                col('S1', 'T5', 'CustomerName'),
                col('S1', 'T6', 'CustomerName'),
            ];
            const clusters = detector.detect(columns);
            expect(clusters.length).toBe(2);
            expect(clusters[0].members.length).toBe(4);
            expect(clusters[1].members.length).toBe(2);
        });

        it('records max intra-cluster distance for each cluster', () => {
            const columns = [
                col('S', 'T1', 'BusinessEntityID'),
                col('S', 'T2', 'BusinessEntityID'),
                col('S', 'T3', 'BusinessEntityID'),
            ];
            const clusters = detector.detect(columns);
            expect(clusters[0].maxIntraDistance).toBeGreaterThanOrEqual(0);
            expect(clusters[0].maxIntraDistance).toBeLessThanOrEqual(1);
        });

        it('records the active distance weights in cluster output', () => {
            const customDetector = new OrganicKeyClusterDetector({
                weights: { nameSimilarity: 0.7, embeddingDistance: 0, valueOverlap: 0 },
            });
            const columns = [
                col('S', 'T1', 'BusinessEntityID'),
                col('S', 'T2', 'BusinessEntityID'),
            ];
            const clusters = customDetector.detect(columns);
            expect(clusters[0].distanceWeights?.nameSimilarity).toBe(0.7);
            expect(clusters[0].distanceWeights?.embeddingDistance).toBe(0);
        });
    });

    describe('configurable thresholds', () => {
        it('respects minClusterSize override', () => {
            const detector = new OrganicKeyClusterDetector({
                weights: { nameSimilarity: 1, embeddingDistance: 0, valueOverlap: 0 },
                thresholds: { minClusterSize: 3 },
            });
            // Only 2 columns — should be filtered by minClusterSize=3
            const columns = [
                col('S', 'T1', 'EmailAddress'),
                col('S', 'T2', 'EmailAddress'),
            ];
            expect(detector.detect(columns)).toEqual([]);
        });

        it('respects minDistinctTables override', () => {
            const detector = new OrganicKeyClusterDetector({
                weights: { nameSimilarity: 1, embeddingDistance: 0, valueOverlap: 0 },
                thresholds: { minDistinctTables: 3 },
            });
            // Same column across 2 tables — should be filtered by minDistinctTables=3
            const columns = [
                col('S', 'T1', 'EmailAddress'),
                col('S', 'T2', 'EmailAddress'),
            ];
            expect(detector.detect(columns)).toEqual([]);
        });
    });
});
