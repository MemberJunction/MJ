/**
 * @fileoverview Scheduled job that evaluates a sample of completed agent runs.
 * @module @memberjunction/scheduling-engine
 */

import { RegisterClass } from '@memberjunction/global';
import { DatabaseProviderBase, Metadata, ValidationResult } from '@memberjunction/core';
import { MJScheduledJobEntity } from '@memberjunction/core-entities';
import { ProviderProductionCatalog, ProviderRubricEngine, ProductionSamplingJob } from '@memberjunction/rubrics';
import { ScheduledJobResult, NotificationContent } from '@memberjunction/scheduling-base-types';
import { BaseScheduledJob, ScheduledJobExecutionContext } from '../BaseScheduledJob';

/**
 * Runs {@link ProductionSamplingJob} off the agent response path.
 * Configuration is unused. The catalog keeps Active ProductionSampling links only.
 */
@RegisterClass(BaseScheduledJob, 'EvaluateSampledAgentRunsDriver')
export class EvaluateSampledAgentRunsDriver extends BaseScheduledJob {
    public async Execute(context: ScheduledJobExecutionContext): Promise<ScheduledJobResult> {
        const provider = Metadata.Provider; // global-provider-ok: scheduled maintenance sweep is a server-global task
        if (!(provider instanceof DatabaseProviderBase)) {
            return { Success: false, ErrorMessage: 'Evaluate Sampled Agent Runs: no database provider available' };
        }
        void context.heartbeat?.();
        const engine = ProviderRubricEngine(provider, context.ContextUser);
        const chosen = await ProductionSamplingJob(ProviderProductionCatalog(provider, context.ContextUser), {
            EvaluateRecord: async (input) => {
                void context.heartbeat?.();
                await engine.EvaluateRecord(input);
            },
        }).run();
        return { Success: true, Details: { Evaluated: chosen.length } };
    }

    public ValidateConfiguration(_schedule: MJScheduledJobEntity): ValidationResult {
        const result = new ValidationResult();
        result.Success = true;
        return result;
    }

    public FormatNotification(context: ScheduledJobExecutionContext, result: ScheduledJobResult): NotificationContent {
        const evaluated = (result.Details?.['Evaluated'] as number) ?? 0;
        if (!result.Success) {
            return {
                Subject: `Evaluate Sampled Agent Runs failed: ${context.Schedule.Name}`,
                Body: `The job "${context.Schedule.Name}" failed.\n\nError: ${result.ErrorMessage ?? 'unknown'}`,
                Priority: 'High',
                Metadata: { Evaluated: evaluated },
            };
        }
        return {
            Subject: `Evaluate Sampled Agent Runs: ${evaluated} run(s) evaluated`,
            Body: `The job "${context.Schedule.Name}" evaluated ${evaluated} sampled agent run(s).`,
            Priority: 'Normal',
            Metadata: { Evaluated: evaluated },
        };
    }
}
