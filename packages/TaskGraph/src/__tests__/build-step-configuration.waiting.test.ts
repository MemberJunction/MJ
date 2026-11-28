/**
 * What a waiting step's row carries. Each of these settings is read by the dispatcher from
 * `Task.Configuration` and from nowhere else, so a setting dropped here does not exist at run time:
 * a Wait with no moment fails, and a Human step with no provider falls back to the inbox and never
 * reaches the provider it named. Both shipped once; the live integration bundle caught them.
 */
import { describe, it, expect } from 'vitest';
import { TaskNode } from '@memberjunction/ai-core-plus';
import { BuildStepConfiguration } from '../TaskGraphService';

const base = { tempId: 't', name: 'Step', description: 'd', dependsOn: [] as string[] };

describe('BuildStepConfiguration — waiting steps', () => {
    it('carries a Wait step\'s duration', () => {
        expect(BuildStepConfiguration(TaskNode.Wait(base, { durationSeconds: 90 }))?.wait).toEqual({ durationSeconds: 90 });
    });

    it('carries a Wait step\'s until', () => {
        expect(BuildStepConfiguration(TaskNode.Wait(base, { until: 'payload.chargeOn' }))?.wait).toEqual({ until: 'payload.chargeOn' });
    });

    it('carries a Human step\'s provider and its configuration untouched', () => {
        const human = BuildStepConfiguration(TaskNode.Human(base, {
            instructions: 'Approve the refund',
            provider: 'BizAppsTasks',
            providerConfiguration: { taskTypeCode: 'REFUND', nested: { a: 1 } },
            expiresInHours: 48,
        }))?.human;
        expect(human).toEqual({
            instructions: 'Approve the refund',
            expiresInHours: 48,
            provider: 'BizAppsTasks',
            providerConfiguration: { taskTypeCode: 'REFUND', nested: { a: 1 } },
        });
    });

    it('carries a provider even when nothing else is set', () => {
        expect(BuildStepConfiguration(TaskNode.Human(base, { provider: 'X' }))?.human?.provider).toBe('X');
    });

    it('leaves an inbox Human step as it was', () => {
        expect(BuildStepConfiguration(TaskNode.Human(base, { instructions: 'Look' }))?.human).toEqual({ instructions: 'Look', expiresInHours: undefined });
    });

    it('carries an External step\'s key and deadline', () => {
        expect(BuildStepConfiguration(TaskNode.External(base, { domain: 'stripe', correlationKey: 'payload.id', expiresInHours: 2 }))?.external)
            .toEqual({ domain: 'stripe', correlationKey: 'payload.id', expiresInHours: 2 });
    });
});
