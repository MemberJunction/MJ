/**
 * A host that will not RUN graphs must not ACCEPT them either. (R3-11, PR #3771.)
 *
 * `MJ_DISABLE_TASK_GRAPH_DISPATCHER=1` switched off execution while the durable submitter kept
 * registering through the generated manifest — so the agent found a submitter, submitted, told the
 * user it would follow up, and parked its run `Paused`. The graph sat `Pending` and the run sat
 * parked forever, with no per-submission diagnostics anywhere.
 *
 * The suppression routes through the existing `null` return rather than a throw, because that path
 * is already built to be honest: the agent reports that this host cannot run graphs instead of
 * promising a follow-up that will never come.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import {
    GetTaskGraphSubmitter,
    SuppressTaskGraphSubmission,
    TaskGraphSubmissionSuppressedBecause,
    TASK_GRAPH_SUBMITTER_KEY,
    TaskGraphSubmitter,
    type TaskGraphSubmitOutcome,
} from '../task-graph/task-graph-submitter';

/** A submitter that would happily accept anything, so the refusal cannot come from its absence. */
class WillingSubmitter extends TaskGraphSubmitter {
    public async Submit(): Promise<TaskGraphSubmitOutcome> {
        return { Success: true, ParentTaskID: 'would-have-accepted' };
    }
}

afterEach(() => {
    // The module-level switch is process-wide by design; leaving it set would silently disable
    // graph submission for every test that runs after this file.
    SuppressTaskGraphSubmission(null as unknown as string);
});

describe('SuppressTaskGraphSubmission', () => {
    it('hides a registered submitter, so callers take the no-submitter path', () => {
        MJGlobal.Instance.ClassFactory.Register(TaskGraphSubmitter, WillingSubmitter, TASK_GRAPH_SUBMITTER_KEY);
        expect(GetTaskGraphSubmitter()).not.toBeNull();

        SuppressTaskGraphSubmission('the dispatcher is disabled on this host');
        expect(GetTaskGraphSubmitter()).toBeNull();
    });

    it('records WHY, so the refusal can explain itself rather than looking like a missing package', () => {
        // "No dispatcher is loaded here" and "this host was told not to run graphs" are different
        // facts, and an operator who set a flag deserves to be told the flag is what stopped them.
        SuppressTaskGraphSubmission('MJ_DISABLE_TASK_GRAPH_DISPATCHER=1 is set on this host');
        expect(TaskGraphSubmissionSuppressedBecause()).toContain('MJ_DISABLE_TASK_GRAPH_DISPATCHER');
    });

    it('reports nothing suppressed on an ordinary host', () => {
        expect(TaskGraphSubmissionSuppressedBecause()).toBeNull();
    });
});
