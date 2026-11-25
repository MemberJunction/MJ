/**
 * @module registry/registry-check-initiators
 *
 * Who may take a Published model out of service without a replacement (ruling R9, D4-61): only a run of a Predictive
 * Studio Registry Check job. Both the lifecycle gate's `AdoptPublished` (before it locks anything) and the PreSave status
 * guard (on the `Published → Unevaluated` save itself) ask this one question, so the rule has one definition. The run's
 * job's type is resolved by name through `MJ: Scheduled Job Runs` → `MJ: Scheduled Jobs` → `MJ: Scheduled Job Types`,
 * every read on the caller's provider as its user; a row that is not there refuses (fail closed).
 */
import type { MJScheduledJobEntity, MJScheduledJobRunEntity, MJScheduledJobTypeEntity } from '@memberjunction/core-entities';
import type { Actor } from '@memberjunction/predictive-studio-core';

import { GuardContexts } from './guard-context';
import type { RegistryContext } from './registry-context';

/** The Registry Check job-run test of an initiator. */
export class RegistryCheckInitiators {
  /** The scheduled-job type whose runs alone may demote a Published model to Unevaluated (R9; shipped by M6.4). */
  public static readonly JobTypeName = 'Predictive Studio Registry Check';

  /**
   * Null when `initiator` is a run of a Registry Check job; otherwise why it is not, in words naming the initiator's
   * kind, the missing row or the job type the run belongs to.
   *
   * @throws Error when a read fails (a failed read is not an absent row)
   */
  public static async RefusalOf(initiator: Actor, ctx: RegistryContext): Promise<string | null> {
    if (initiator.kind !== 'scheduled-job') return `the initiator is a ${initiator.kind}, not a scheduled job run`;
    const runId = initiator.scheduledJobRunId;
    const run = await GuardContexts.ReadById<Pick<MJScheduledJobRunEntity, 'ID' | 'ScheduledJobID'>>('MJ: Scheduled Job Runs', runId, ['ID', 'ScheduledJobID'], ctx);
    if (run === null) return `no Scheduled Job Run has the ID '${runId}'`;
    const job = await GuardContexts.ReadById<Pick<MJScheduledJobEntity, 'ID' | 'JobTypeID'>>('MJ: Scheduled Jobs', run.ScheduledJobID, ['ID', 'JobTypeID'], ctx);
    if (job === null) return `the job ${run.ScheduledJobID} of run ${runId} does not exist`;
    const type = await GuardContexts.ReadById<Pick<MJScheduledJobTypeEntity, 'ID' | 'Name'>>('MJ: Scheduled Job Types', job.JobTypeID, ['ID', 'Name'], ctx);
    if (type === null) return `the job type ${job.JobTypeID} of run ${runId} does not exist`;
    if (type.Name !== RegistryCheckInitiators.JobTypeName) return `run ${runId} is a run of a '${type.Name}' job`;
    return null;
  }
}
