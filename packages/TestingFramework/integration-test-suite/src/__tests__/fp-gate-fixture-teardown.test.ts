/**
 * The Feature Pipeline gate fixtures' teardown deletes a stub pipeline's rows children first. PR 5's re-derivation
 * lease (`MJ: Feature Pipeline Rederivation Leases`, B3) references both the Record Process and the Process Run that
 * held it, and a released lease stays as a row, so it must go before both (wave-4 integration, D5-W4-6: the
 * Feature Pipelines suite's C2.1 teardown failed on FK_FeaturePipelineRederivationLease_ProcessRun and left its
 * Process Run and Record Process behind).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration';
import { FeaturePipelineGateFixtures } from '../checks/fp-gates/fp-gate-fixture';

describe('FeaturePipelineGateFixtures.DeleteStubPipeline', () => {
    afterEach(() => vi.restoreAllMocks());

    it('deletes the pipeline re-derivation leases before its Process Runs and its Record Processes', async () => {
        const order: string[] = [];
        vi.spyOn(FeaturePipelineGateFixtures, 'DeleteWhere').mockImplementation(async (_ctx, entityName) => {
            order.push(entityName);
            return [];
        });
        const ctx = {} as IntegrationCheckContext;
        await FeaturePipelineGateFixtures.DeleteStubPipeline(ctx, 'FP Gate', 'FP Gate Stub');
        const lease = order.indexOf('MJ: Feature Pipeline Rederivation Leases');
        expect(lease).toBeGreaterThanOrEqual(0);
        expect(lease).toBeLessThan(order.indexOf('MJ: Process Runs'));
        expect(lease).toBeLessThan(order.indexOf('MJ: Record Processes'));
    });
});
