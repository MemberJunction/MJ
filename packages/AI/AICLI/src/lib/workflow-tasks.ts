import type { MJTaskEntityType } from '@memberjunction/core-entities';

/**
 * The `MJ: Tasks` columns the audit reads. A task-graph task belongs to the run that submitted its
 * graph through the graph's parent task (`AgentRunID` on a task with no `ParentID`); every other
 * task in the graph shares that parent as its `RootParentID`.
 */
export type WorkflowTaskRow = Pick<MJTaskEntityType, 'ID' | 'Name' | 'Status' | 'StepType' | 'ErrorMessage' | 'AgentRunID' | 'ParentID'>;

/** The columns to request for a {@link WorkflowTaskRow}. */
export const WORKFLOW_TASK_FIELDS: Array<keyof WorkflowTaskRow> = ['ID', 'Name', 'Status', 'StepType', 'ErrorMessage', 'AgentRunID', 'ParentID'];

/** A task of the workflow a run handed to the task-graph dispatcher, as the audit reports it. */
export interface WorkflowTaskInfo {
  TaskID: string;
  Name: string;
  Status: MJTaskEntityType['Status'];
  StepType: MJTaskEntityType['StepType'];
  ErrorMessage?: string;
  /** The agent run that executed this task, when an agent did. Audit it the same way as this one. */
  AgentRunID?: string;
}

/**
 * The workflow a run handed to the task-graph dispatcher.
 *
 * A dispatched workflow's steps run as tasks, each with its own status and error, so its failures
 * are recorded here and not on the submitting run's steps. That is why an audit that read only the
 * run's steps reported a failed workflow as having no errors.
 */
export interface WorkflowTaskSummary {
  /** The workflow's overall status, from its graph's parent task. `In Progress` while it runs. */
  Status: MJTaskEntityType['Status'];
  /** How many tasks the workflow holds, not counting the graph's parent task. */
  TaskCount: number;
  /** Those tasks counted by status, e.g. `{ Complete: 4, Failed: 1 }`. */
  StatusCounts: Record<string, number>;
  /** The tasks that failed, with their errors. */
  FailedTasks: WorkflowTaskInfo[];
}

/**
 * Summarizes a run's workflow from its tasks: the graph parent task(s) and everything under them.
 *
 * @returns `undefined` when the run dispatched no workflow.
 */
export function SummarizeWorkflowTasks(tasks: WorkflowTaskRow[]): WorkflowTaskSummary | undefined {
  const parents = tasks.filter((task) => !task.ParentID);
  if (parents.length === 0) {
    return undefined;
  }

  const workTasks = tasks.filter((task) => !!task.ParentID);
  const statusCounts: Record<string, number> = {};
  for (const task of workTasks) {
    statusCounts[task.Status] = (statusCounts[task.Status] ?? 0) + 1;
  }

  return {
    // One run submits one graph. Should there ever be more, a failed one is the one to report.
    Status: parents.find((parent) => parent.Status === 'Failed')?.Status ?? parents[0].Status,
    TaskCount: workTasks.length,
    StatusCounts: statusCounts,
    FailedTasks: workTasks.filter((task) => task.Status === 'Failed').map(ToWorkflowTaskInfo),
  };
}

/** The reported form of one task row. */
export function ToWorkflowTaskInfo(task: WorkflowTaskRow): WorkflowTaskInfo {
  return {
    TaskID: task.ID,
    Name: task.Name,
    Status: task.Status,
    StepType: task.StepType,
    ErrorMessage: task.ErrorMessage || undefined,
    AgentRunID: task.AgentRunID || undefined,
  };
}
