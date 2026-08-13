/**
 * Who completes a task — asserted across all four task shapes. (R2-1, PR #3749.)
 *
 * The bug this closes had no symptom to test for: a crashed prompt task is excluded by both
 * reclamation statements, so it is never returned to `Pending`, never retaken, and never even
 * *reported* — the graph sits `In Progress` forever, its submitting run `Paused` forever, and
 * `IsGraphStalled` calls it healthy because an `In Progress` node counts as active. Nothing logs.
 * A test that waits for a diagnostic waits forever, so the assertions are on the predicate itself.
 *
 * The matrix is the point. Each of the four shapes appears in both directions, because the failure
 * was not "the predicate was wrong" but "the predicate was right about three shapes and silent
 * about the fourth".
 */
import { describe, it, expect } from 'vitest';
import {
    BARE_COLUMNS,
    EXECUTOR_COLUMNS,
    HumanTaskSQL,
    IsHumanTask,
    IsMachineTask,
    MachineTaskSQL,
    type TaskAssignment,
} from '../task-predicates';

const task = (over: Partial<TaskAssignment>): TaskAssignment =>
    ({ AgentID: null, ActionID: null, PromptID: null, StepType: null, UserID: null, ...over });

const AGENT_TASK = task({ AgentID: 'a1', StepType: 'Agent' });
const ACTION_TASK = task({ ActionID: 'c1', StepType: 'Action' });
const PROMPT_TASK = task({ PromptID: 'p1', StepType: 'Prompt' });
const LOOP_WITH_PROMPT_BODY = task({ PromptID: 'p1', StepType: 'While' });
const HUMAN_TASK = task({ StepType: 'Human', UserID: 'u1' });
const UNASSIGNED_HUMAN_TASK = task({ StepType: 'Human' });
const LEGACY_HUMAN_TASK = task({ UserID: 'u1' });

describe('IsMachineTask — the four shapes, and the one that was missing', () => {
    it('recognises an agent task', () => {
        expect(IsMachineTask(AGENT_TASK)).toBe(true);
    });

    it('recognises an action task', () => {
        expect(IsMachineTask(ACTION_TASK)).toBe(true);
    });

    it('recognises a PROMPT task — the shape reclamation could not see', () => {
        // A Prompt step is assigned through `PromptID` and carries neither `AgentID` nor `ActionID`.
        // The old predicate was written before that column existed, so a crashed prompt task fell
        // out of both reclamation statements and wedged its graph permanently.
        expect(IsMachineTask(PROMPT_TASK)).toBe(true);
    });

    it('recognises a loop whose body is a prompt', () => {
        // Same assignment shape, different `StepType` — routing is on StepType, ownership is on the
        // executor column, and this row has to satisfy the second question regardless of the first.
        expect(IsMachineTask(LOOP_WITH_PROMPT_BODY)).toBe(true);
    });

    it('does not claim a human task for a runner', () => {
        expect(IsMachineTask(HUMAN_TASK)).toBe(false);
        expect(IsMachineTask(UNASSIGNED_HUMAN_TASK)).toBe(false);
    });
});

describe('IsHumanTask — including the rows that predate StepType', () => {
    it('recognises an explicit human step', () => {
        expect(IsHumanTask(HUMAN_TASK)).toBe(true);
    });

    it('recognises an UNASSIGNED human step', () => {
        // "Somebody needs to look at this" is a legitimate step the validator allows with no
        // assignee. Keying the exemption on `UserID` alone would have made this one reclaimable.
        expect(IsHumanTask(UNASSIGNED_HUMAN_TASK)).toBe(true);
    });

    it('recognises a human task written before the StepType column existed', () => {
        // Nullable column, real rows. A bare `StepType='Human'` filter leaves these asked but never
        // settled and never expired — dead forever. That is B4.
        expect(IsHumanTask(LEGACY_HUMAN_TASK)).toBe(true);
    });

    it('does not treat a machine task as somebody\'s to answer', () => {
        for (const t of [AGENT_TASK, ACTION_TASK, PROMPT_TASK, LOOP_WITH_PROMPT_BODY]) {
            expect(IsHumanTask(t)).toBe(false);
        }
    });

    it('is not the negation of IsMachineTask, and says so for a malformed row', () => {
        // A row carrying both an executor and an assignee is a bug. Both questions answer yes, which
        // is visible; defining one as the other's complement would have hidden it behind whichever
        // was asked first.
        const malformed = task({ AgentID: 'a1', StepType: 'Human', UserID: 'u1' });
        expect(IsMachineTask(malformed)).toBe(true);
        expect(IsHumanTask(malformed)).toBe(true);
    });
});

describe('the SQL twins say the same thing as the TypeScript ones', () => {
    it('names every executor column, so a new runner cannot be half-added', () => {
        const sql = MachineTaskSQL(BARE_COLUMNS);
        for (const column of EXECUTOR_COLUMNS) {
            expect(sql).toContain(`${column} IS NOT NULL`);
        }
        expect(sql).toContain('PromptID IS NOT NULL');
    });

    it('ORs the executor columns rather than ANDing them', () => {
        // A task carries exactly one. ANDing would exclude every real row — a failure loud enough to
        // catch immediately, which is precisely why it is worth pinning: the dangerous version of
        // this bug is the quiet one.
        expect(MachineTaskSQL(BARE_COLUMNS)).not.toContain(' AND ');
        expect(MachineTaskSQL(BARE_COLUMNS).split(' OR ')).toHaveLength(EXECUTOR_COLUMNS.length);
    });

    it('carries both arms of the human predicate', () => {
        const sql = HumanTaskSQL(BARE_COLUMNS);
        expect(sql).toContain(`StepType = 'Human'`);
        expect(sql).toContain('StepType IS NULL AND UserID IS NOT NULL');
    });

    it('quotes through the caller\'s dialect', () => {
        // The claim store builds bracketed T-SQL; `RunView.ExtraFilter` takes bare names. One
        // definition, two renderings — the alternative is two definitions that drift.
        const bracketed = MachineTaskSQL((c) => `[${c}]`);
        expect(bracketed).toContain('[PromptID] IS NOT NULL');
        expect(bracketed).not.toContain(' PromptID IS');
    });
});
