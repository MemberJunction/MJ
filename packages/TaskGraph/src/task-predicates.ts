/**
 * Who completes a task — a dispatcher, or a person.
 *
 * **Why this is a module and not three inline predicates.** The distinction is asked in SQL (claim
 * reclamation, the human settle/expiry sweeps) and in TypeScript (claim routing), by code in two
 * files, and it has been written down four different ways:
 *
 *   `AgentID IS NOT NULL OR ActionID IS NOT NULL`                    — claim reclamation
 *   `StepType='Human'`                                               — human settle, human expiry
 *   `StepType='Human' OR (StepType IS NULL AND UserID IS NOT NULL)`  — human reopen
 *   `if (ActionID) … else if (PromptID) … else if (!AgentID) human`  — claim routing
 *
 * Those were co-extensive when they were written and are not any more, and the way that surfaced is
 * the reason this file exists. The first form predates the `PromptID` column: a Prompt step (and a
 * ForEach/While with a prompt body) carries `PromptID` with both `AgentID` and `ActionID` null, so a
 * prompt task whose owner crashed is claimed normally, expires normally, and is then **invisible to
 * both reclamation statements** — `TryClaim` cannot retake it because it is no longer `Pending`, and
 * `FindOrphanedInProgress` will not even report it. The graph sits `In Progress` forever with its
 * submitting run `Paused` forever, and `IsGraphStalled` reports it healthy because an `In Progress`
 * node counts as active. Zero diagnostics, anywhere.
 *
 * The fix is not "add `PromptID` to the OR" — that restores the coincidence and hands the same
 * failure to whoever adds the next runner column. It is to say the thing once, here, in the terms
 * the engine actually means, and have every site ask this module.
 *
 * @module @memberjunction/task-graph
 */

/** Renders a column reference for the dialect the caller is building. */
export type ColumnQuoter = (column: string) => string;

/** For `RunView.ExtraFilter`, which takes bare column names. */
export const BARE_COLUMNS: ColumnQuoter = (column) => column;

/**
 * The columns that assign a task to an executor, in the order claim routing tries them.
 *
 * Adding a runner means adding its column here and nowhere else — which is the whole point. If a
 * future runner is assigned by something other than a column on the task, this list stops being
 * sufficient and the predicate below must change shape rather than grow.
 */
export const EXECUTOR_COLUMNS = ['AgentID', 'ActionID', 'PromptID'] as const;

/** The shape both predicates need. Structural, so `MJTaskEntity` satisfies it as-is. */
export type TaskAssignment = {
    AgentID: string | null;
    ActionID: string | null;
    PromptID: string | null;
    StepType: string | null;
    UserID: string | null;
};

/**
 * SQL for "a dispatcher completes this task".
 *
 * Used to SCOPE reclamation: only a task something was supposed to be executing can have been
 * abandoned by a crash. A human task's `In Progress` — if it ever reaches it — is a person's state
 * to own, not a claim to reclaim.
 */
export function MachineTaskSQL(quote: ColumnQuoter = BARE_COLUMNS): string {
    return `(${EXECUTOR_COLUMNS.map((c) => `${quote(c)} IS NOT NULL`).join(' OR ')})`;
}

/**
 * SQL for "a person completes this task".
 *
 * The `StepType IS NULL` arm is not defensive clutter: `StepType` is nullable and rows predating the
 * column exist in real databases. A human task written before it would be invisible to a bare
 * `StepType='Human'` filter — asked, never settled, never expired, dead forever. This is the wide
 * form the reopen path already used; the settle and expiry paths were narrower, which is B4.
 */
export function HumanTaskSQL(quote: ColumnQuoter = BARE_COLUMNS): string {
    return `(${quote('StepType')} = 'Human' OR (${quote('StepType')} IS NULL AND ${quote('UserID')} IS NOT NULL))`;
}

/** True when some runner owns this task. The TypeScript twin of {@link MachineTaskSQL}. */
export function IsMachineTask(task: Pick<TaskAssignment, 'AgentID' | 'ActionID' | 'PromptID'>): boolean {
    return !!(task.AgentID || task.ActionID || task.PromptID);
}

/**
 * True when a person completes this task.
 *
 * Deliberately NOT `!IsMachineTask(task)`. A task carrying both an executor column and a `UserID` is
 * malformed, and the two questions should not silently answer each other for it: routing asks
 * "is there a runner for this?" and the human lifecycle asks "is somebody expected to act?". A row
 * that says yes to both is a bug worth seeing rather than a coin flip resolved by operator
 * precedence.
 */
export function IsHumanTask(task: Pick<TaskAssignment, 'StepType' | 'UserID'>): boolean {
    return task.StepType === 'Human' || (task.StepType == null && task.UserID != null);
}
