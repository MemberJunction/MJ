import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type { BaseEntity, CloneContext } from '@memberjunction/core';
import { ResolverBase } from '../generic/ResolverBase.js';

class TestResolverProbe extends ResolverBase {
    public TestReverseMapInputFieldNames(input: Record<string, unknown>) {
        return this.ReverseMapInputFieldNames(input);
    }

    public TestApplyCloneContext(
        entityObject: BaseEntity,
        input: { CloneContext___?: CloneContext | null },
    ): boolean {
        return this.applyCloneContext(entityObject, input);
    }
}

describe('ResolverBase — CloneContext (§10.3)', () => {
    const probe = new TestResolverProbe();

    const sampleCloneContext: CloneContext = {
        CloneLogID: 'CLONE-LOG-001',
        SourceEntityName: 'TestEntity',
        SourceRecordID: 'REC-001',
        RootEntityName: 'TestEntity',
        RootSourceRecordID: 'REC-001',
        RootTargetRecordID: 'REC-002',
        Depth: 0,
        Route: 'RootSave',
        FieldChangeSummary: [{ Kind: 'Carried', Fields: ['Name'] }],
        Reason: 'Resolver test clone',
    };

    describe('ReverseMapInputFieldNames', () => {
        it('passes through CloneContext___ untouched while reverse-mapping transport names', () => {
            const input = {
                _mj__CreatedAt: '2026-09-21T00:00:00Z',
                Name: 'New Entity',
                CloneContext___: sampleCloneContext,
            };

            const mapped = probe.TestReverseMapInputFieldNames(input);

            expect(mapped['__mj_CreatedAt']).toBe('2026-09-21T00:00:00Z');
            expect(mapped['Name']).toBe('New Entity');
            expect(mapped['CloneContext___']).toEqual(sampleCloneContext);
        });
    });

    describe('applyCloneContext', () => {
        it('calls SetCloneContext on BaseEntity when valid CloneContext___ is provided', () => {
            const mockEntity = {
                SetCloneContext: vi.fn(),
            } as unknown as BaseEntity;

            const result = probe.TestApplyCloneContext(mockEntity, {
                CloneContext___: sampleCloneContext,
            });

            expect(result).toBe(true);
            expect(mockEntity.SetCloneContext).toHaveBeenCalledWith(sampleCloneContext);
        });

        it('returns false and does not call SetCloneContext when CloneContext___ is absent', () => {
            const mockEntity = {
                SetCloneContext: vi.fn(),
            } as unknown as BaseEntity;

            const result = probe.TestApplyCloneContext(mockEntity, {});

            expect(result).toBe(false);
            expect(mockEntity.SetCloneContext).not.toHaveBeenCalled();
        });

        it('returns false and does not call SetCloneContext when SourceRecordID or SourceEntityName is missing', () => {
            const mockEntity = {
                SetCloneContext: vi.fn(),
            } as unknown as BaseEntity;

            const invalidCtx = {
                ...sampleCloneContext,
                SourceRecordID: '',
            };

            const result = probe.TestApplyCloneContext(mockEntity, {
                CloneContext___: invalidCtx,
            });

            expect(result).toBe(false);
            expect(mockEntity.SetCloneContext).not.toHaveBeenCalled();
        });
    });
});
