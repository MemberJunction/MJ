import type { MJMLModelPublishRecordEntity } from '@memberjunction/core-entities';

/**
 * A request, from a model-detail widget, to open one record (an agent run, a Process Run, a scheduled job run, a user,
 * a publish record). The widgets never route (UI layering, boundary 1): the host that owns navigation (the ML Model
 * form, the registry) turns the request into its own navigation.
 */
export interface PSOpenRecordRequest {
  /** The entity of the record, e.g. `MJ: AI Agent Runs`. */
  readonly EntityName: string;
  /** The record's ID. */
  readonly RecordID: string;
}

/** The record an initiator (`MJ: ML Model Publish Records.Initiator`) links to, with the words shown for it. */
export interface PSInitiatorLink {
  /** What started the transition, in words. */
  readonly Label: string;
  /** The record to open, or null when the initiator names none (a system component without a Process Run). */
  readonly Record: PSOpenRecordRequest | null;
}

/** Reads an `Actor` initiator into its words and the record it links to. */
export class PSInitiatorLinks {
  /** The words and the linked record of `actor`. */
  public static For(actor: MJMLModelPublishRecordEntity['InitiatorObject']): PSInitiatorLink {
    switch (actor.kind) {
      case 'human':
        return { Label: 'a person', Record: { EntityName: 'MJ: Users', RecordID: actor.userId } };
      case 'agent':
        return { Label: 'agent run', Record: { EntityName: 'MJ: AI Agent Runs', RecordID: actor.agentRunId } };
      case 'scheduled-job':
        return { Label: 'scheduled job run', Record: { EntityName: 'MJ: Scheduled Job Runs', RecordID: actor.scheduledJobRunId } };
      case 'system':
        return {
          Label: actor.component,
          Record: actor.processRunId ? { EntityName: 'MJ: Process Runs', RecordID: actor.processRunId } : null,
        };
    }
  }
}
