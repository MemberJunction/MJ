/**
 * Unit tests for Invariant 5 — Hierarchy validity.
 *
 * Covers (per INTEGRATION-FRAMEWORK-DIRECTIVE.md §4.4.3):
 *   - Pass: valid hierarchy with parent IO present + matching FK + valid topological sort
 *   - Fail: orphan parent reference (declared parent IO doesn't exist)
 *   - Fail: ParentObjectIDFieldName references non-existent IOF
 *   - Fail: parent-chain cycle
 *   - Fail: TraversalOrder violates topological order
 *   - Fail: TraversalOrder missing IOs / contains unknowns / has duplicates
 */
import { describe, it, expect } from 'vitest';
import { CheckHierarchyValidity } from '../Invariant5_HierarchyValidity.js';
import type { MetadataFile } from '../types.js';

function makeMetadata(ios: Array<{
    Name: string;
    Parent?: { Name: string; FieldName: string };
    HierarchyPath?: string[];
    IOFs?: Array<{ Name: string; RelatedRef?: string; [k: string]: unknown }>;
}>, traversalOrder?: string[]): MetadataFile {
    return {
        fields: {
            Name: 'TestVendor',
            ClassName: 'TestVendorConnector',
            ...(traversalOrder ? { TraversalOrder: traversalOrder } : {}),
        },
        relatedEntities: {
            'MJ: Integration Objects': ios.map((io) => ({
                fields: {
                    Name: io.Name,
                    ParentObjectName: io.Parent?.Name ?? null,
                    ParentObjectIDFieldName: io.Parent?.FieldName ?? null,
                    Configuration: io.HierarchyPath
                        ? JSON.stringify({ HierarchyPath: io.HierarchyPath })
                        : undefined,
                },
                relatedEntities: io.IOFs ? {
                    'MJ: Integration Object Fields': io.IOFs.map((iof) => ({
                        fields: {
                            Name: iof.Name,
                            ...(iof.RelatedRef ? { RelatedIntegrationObjectID: iof.RelatedRef } : {}),
                        },
                    })),
                } : undefined,
            })),
        },
    };
}

describe('Invariant 5 — Hierarchy validity', () => {
    it('passes when hierarchy is valid + topological order correct', () => {
        const md = makeMetadata(
            [
                { Name: 'orgs' },
                {
                    Name: 'projects',
                    Parent: { Name: 'orgs', FieldName: 'OrgID' },
                    HierarchyPath: ['orgs'],
                    IOFs: [{ Name: 'OrgID', RelatedRef: '@lookup:MJ: Integration Objects.Name=orgs' }],
                },
            ],
            ['orgs', 'projects']
        );
        const result = CheckHierarchyValidity(md);
        expect(result.Status).toBe('Pass');
        expect(result.Failures.filter((f) => f.Severity === 'Error')).toEqual([]);
    });

    it('fails when ParentObjectName references nonexistent IO', () => {
        const md = makeMetadata([
            { Name: 'projects', Parent: { Name: 'missing-parent', FieldName: 'OrgID' }, IOFs: [{ Name: 'OrgID' }] },
        ]);
        const result = CheckHierarchyValidity(md);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes("ParentObjectName='missing-parent'"))).toBe(true);
    });

    it('fails when ParentObjectIDFieldName references nonexistent IOF', () => {
        const md = makeMetadata([
            { Name: 'orgs' },
            { Name: 'projects', Parent: { Name: 'orgs', FieldName: 'NonExistentField' }, IOFs: [{ Name: 'OrgID' }] },
        ]);
        const result = CheckHierarchyValidity(md);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes("NonExistentField"))).toBe(true);
    });

    it('fails when TraversalOrder violates topological order (child before parent)', () => {
        const md = makeMetadata(
            [
                { Name: 'orgs' },
                { Name: 'projects', Parent: { Name: 'orgs', FieldName: 'OrgID' }, IOFs: [{ Name: 'OrgID', RelatedRef: '@lookup:MJ: Integration Objects.Name=orgs' }] },
            ],
            ['projects', 'orgs']
        );
        const result = CheckHierarchyValidity(md);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes('topological order'))).toBe(true);
    });

    it('fails when TraversalOrder has duplicates', () => {
        const md = makeMetadata(
            [{ Name: 'orgs' }, { Name: 'projects' }],
            ['orgs', 'projects', 'orgs']
        );
        const result = CheckHierarchyValidity(md);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes('duplicates'))).toBe(true);
    });

    it('fails when TraversalOrder contains unknown IO names', () => {
        const md = makeMetadata([{ Name: 'orgs' }], ['orgs', 'phantom']);
        const result = CheckHierarchyValidity(md);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes("don't match any IO"))).toBe(true);
    });

    it('detects parent-chain cycle', () => {
        // Manually constructing a cycle: A.parent=B, B.parent=A
        const md: MetadataFile = {
            fields: { Name: 'TestVendor', ClassName: 'TestVendorConnector' },
            relatedEntities: {
                'MJ: Integration Objects': [
                    { fields: { Name: 'A', ParentObjectName: 'B' } },
                    { fields: { Name: 'B', ParentObjectName: 'A' } },
                ],
            },
        };
        const result = CheckHierarchyValidity(md);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes('parent-chain cycle'))).toBe(true);
    });

    it('passes trivially when no IOs exist', () => {
        const md: MetadataFile = {
            fields: { Name: 'Empty', ClassName: 'EmptyConnector' },
            relatedEntities: { 'MJ: Integration Objects': [] },
        };
        expect(CheckHierarchyValidity(md).Status).toBe('Pass');
    });
});
