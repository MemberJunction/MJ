import { describe, it, expect } from 'vitest';
import {
    PipelineStage,
    PipelineEntityParams,
    PipelineContentParams,
    PipelineSingleRecordParams,
    PipelineProgressEvent,
    PipelineResult,
    PipelineError
} from '../generic/PipelineTypes';

describe('Pipeline Types', () => {
    describe('PipelineStage', () => {
        it('should include all expected stages', () => {
            const stages: PipelineStage[] = ['extract', 'autotag', 'vectorize', 'complete', 'error'];
            expect(stages).toHaveLength(5);
        });
    });

    describe('PipelineEntityParams', () => {
        it('should define entity processing parameters', () => {
            const params: PipelineEntityParams = {
                EntityID: 'entity-123',
                EntityDocumentID: 'doc-456',
                EnableAutotagging: true,
                EnableVectorization: true,
                BatchSize: 100,
                ExtraFilter: "Status = 'Active'"
            };

            expect(params.EnableAutotagging).toBe(true);
            expect(params.BatchSize).toBe(100);
            expect(params.ExtraFilter).toContain('Active');
        });

        it('should work without optional fields', () => {
            const params: PipelineEntityParams = {
                EntityID: 'entity-123',
                EntityDocumentID: 'doc-456',
                EnableAutotagging: false,
                EnableVectorization: true
            };

            expect(params.BatchSize).toBeUndefined();
            expect(params.ExtraFilter).toBeUndefined();
        });
    });

    describe('PipelineContentParams', () => {
        it('should define content source processing parameters', () => {
            const params: PipelineContentParams = {
                ContentSourceID: 'src-789',
                EnableAutotagging: true,
                EnableVectorization: false,
                EntityDocumentID: 'doc-123'
            };

            expect(params.ContentSourceID).toBe('src-789');
            expect(params.EnableVectorization).toBe(false);
        });
    });

    describe('PipelineProgressEvent', () => {
        it('should track progress through pipeline stages', () => {
            const event: PipelineProgressEvent = {
                Stage: 'autotag',
                TotalItems: 500,
                ProcessedItems: 125,
                ElapsedMs: 3000,
                EstimatedRemainingMs: 9000,
                CurrentItem: 'Contact: John Doe'
            };

            expect(event.ProcessedItems).toBeLessThan(event.TotalItems);
            expect(event.Stage).toBe('autotag');
        });
    });

    describe('PipelineResult', () => {
        it('should represent successful pipeline completion', () => {
            const result: PipelineResult = {
                Success: true,
                TotalRecordsProcessed: 500,
                RecordsAutotagged: 500,
                RecordsVectorized: 500,
                ElapsedMs: 12000,
                Errors: []
            };

            expect(result.Success).toBe(true);
            expect(result.Errors).toHaveLength(0);
        });

        it('should represent partial failure', () => {
            const result: PipelineResult = {
                Success: false,
                TotalRecordsProcessed: 450,
                RecordsAutotagged: 400,
                RecordsVectorized: 380,
                ElapsedMs: 15000,
                Errors: [
                    { RecordID: 'rec-1', Stage: 'vectorize', Message: 'Embedding failed' },
                    { RecordID: 'rec-2', Stage: 'autotag', Message: 'Tag generation timeout' }
                ]
            };

            expect(result.Success).toBe(false);
            expect(result.Errors).toHaveLength(2);
            expect(result.RecordsVectorized).toBeLessThan(result.TotalRecordsProcessed);
        });
    });

    describe('PipelineError', () => {
        it('should capture error details', () => {
            const error: PipelineError = {
                Stage: 'vectorize',
                RecordID: 'rec-123',
                Message: 'Failed to generate embedding: model overloaded'
            };

            expect(error.Stage).toBe('vectorize');
            expect(error.RecordID).toBe('rec-123');
        });

        it('should work without optional RecordID', () => {
            const error: PipelineError = {
                Stage: 'extract',
                Message: 'Connection timeout to data source'
            };

            expect(error.RecordID).toBeUndefined();
        });
    });
});
