/**
 * The workspace's Tasks tab and inline workflow execution card unit tests.
 *
 * Tests:
 * 1. Tasks tab filter refresh (`BuildConversationTasksFilter` + `TasksFullViewComponent.LoadTasks`)
 * 2. AI Agent Workflows & Tasks Command Center hierarchy-aware grouping, KPI calculation,
 *    search/status filtering, and inspector drawer selection (`TasksFullViewComponent`)
 * 3. First-Class Inline Workflow Execution Card hierarchy deduplication and step formatting
 *    (`MessageItemComponent`)
 */
import '@angular/compiler'; // JIT support — the component modules evaluate Angular decorators in vitest's node env
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJTaskEntity } from '@memberjunction/core-entities';
import { CreateFakeProvider } from '@memberjunction/ng-test-utils';
import { ConversationWorkspaceComponent } from '../lib/components/workspace/conversation-workspace.component';
import { TasksFullViewComponent } from '../lib/components/task/tasks-full-view.component';
import { MessageItemComponent } from '../lib/components/message/message-item.component';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const TASKS_ENTITY = { Name: 'MJ: Tasks', SchemaName: '__mj', BaseView: 'vwTasks' } as unknown as EntityInfo;

interface TaskRow {
  ID: string;
  ConversationDetailID: string | null;
  UserID: string | null;
  Name?: string;
  Description?: string;
  Status?: MJTaskEntity['Status'];
  ParentID?: string | null;
  RootParentID?: string | null;
  Agent?: string | null;
  AgentID?: string | null;
  AgentRunID?: string | null;
  PercentComplete?: number | null;
  StartedAt?: Date | null;
  CompletedAt?: Date | null;
}

/**
 * A provider that answers like the database for these tests: the user owns one conversation, its
 * messages are listed, and a task is returned when the filter names its message or its owner.
 */
function database(): { provider: IMetadataProvider; messages: Array<{ ID: string }>; tasks: TaskRow[] } {
  const messages = [{ ID: 'msg-1' }];
  const tasks: TaskRow[] = [{ ID: 'task-1', ConversationDetailID: 'msg-1', UserID: null, Name: 'Standalone Task', Status: 'Complete' }];
  const provider = CreateFakeProvider<object>({
    runViewResults: (params) => {
      const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
      switch (params.EntityName) {
        case 'MJ: Conversations':
          return [{ ID: 'conv-1' }];
        case 'MJ: Conversation Details':
          return messages;
        case 'MJ: Tasks':
          if (filter.includes('ParentID IN') || filter.includes('RootParentID IN')) {
            return tasks.filter(t => t.ParentID != null && filter.includes(`'${t.ParentID}'`));
          }
          return tasks.filter(
            (task) =>
              filter === '1=1' ||
              (task.ConversationDetailID != null && filter.includes(`'${task.ConversationDetailID}'`)) ||
              (task.UserID != null && filter.includes(`UserID = '${task.UserID}'`))
          );
        default:
          return [];
      }
    },
    entityByName: (name) => (name === 'MJ: Tasks' ? TASKS_ENTITY : undefined),
  });
  return { provider, messages, tasks };
}

/** A workspace and its tasks view, with the view's inputs bound as the workspace template binds them. */
async function workspaceTasksView(provider: IMetadataProvider): Promise<TasksFullViewComponent> {
  const workspace = Object.create(ConversationWorkspaceComponent.prototype) as ConversationWorkspaceComponent;
  Object.assign(workspace, { Provider: provider, CurrentUser: USER, cdr: { markForCheck: () => undefined, detectChanges: () => undefined } });
  (workspace as unknown as { buildTasksFilter(): void }).buildTasksFilter();
  await new Promise((resolve) => setTimeout(resolve, 0)); // let any background filter work settle

  const view = Object.create(TasksFullViewComponent.prototype) as TasksFullViewComponent;
  Object.assign(view, {
    Provider: provider,
    CurrentUser: USER,
    aiEngineConfigured: true,
    AllTasks: [],
    FilteredTasks: [],
    TaskDependencies: [],
    AgentRunMap: new Map<string, string>(),
    WorkflowGroups: [],
    FilteredWorkflowGroups: [],
    AvailableAgents: [],
    SearchQuery: '',
    StatusFilter: 'all',
    SelectedAgentFilter: 'all',
  });
  view.BaseFilter = workspace.TasksFilter;
  Object.assign(view, { BaseFilterResolver: (workspace as unknown as { TasksFilterResolver?: () => Promise<string> }).TasksFilterResolver ?? null });
  return view;
}

describe('Conversation workspace — Tasks tab refresh & Command Center', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a task linked to a message created after the first load on the next refresh', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const db = database();
    const view = await workspaceTasksView(db.provider);

    await view.LoadTasks();
    expect(view.AllTasks.map((task) => task.ID)).toEqual(['task-1']);

    // An agent's task graph adds a message and a top-level task that has no user.
    db.messages.push({ ID: 'msg-2' });
    db.tasks.push({ ID: 'task-2', ConversationDetailID: 'msg-2', UserID: null, Name: 'Second Workflow', Status: 'In Progress' });
    await view.LoadTasks();

    expect(view.AllTasks.map((task) => task.ID).sort()).toEqual(['task-1', 'task-2']);
  });

  it('asks the resolver for a new filter on every load', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const db = database();
    const view = Object.create(TasksFullViewComponent.prototype) as TasksFullViewComponent;
    const resolver = vi.fn(async () => "ParentID IS NULL AND UserID = 'user-1'");
    Object.assign(view, {
      Provider: db.provider,
      CurrentUser: USER,
      aiEngineConfigured: true,
      AllTasks: [],
      FilteredTasks: [],
      TaskDependencies: [],
      AgentRunMap: new Map<string, string>(),
      WorkflowGroups: [],
      FilteredWorkflowGroups: [],
      AvailableAgents: [],
      SearchQuery: '',
      StatusFilter: 'all',
      SelectedAgentFilter: 'all',
      BaseFilter: '1=1',
    });
    Object.assign(view, { BaseFilterResolver: resolver });

    await view.LoadTasks();
    await view.LoadTasks();

    expect(resolver).toHaveBeenCalledTimes(2);
  });

  it('groups parent workflow containers with their child steps and calculates KPIs and filters accurately', async () => {
    const db = database();
    const t0 = new Date('2026-10-18T12:00:00Z');
    const t1 = new Date('2026-10-18T12:00:35Z');
    const t2 = new Date('2026-10-18T12:01:15Z');
    db.tasks.length = 0;
    db.tasks.push(
      {
        ID: 'wf-root-1',
        ConversationDetailID: 'msg-1',
        UserID: 'user-1',
        Name: 'User Growth & Report Pipeline',
        Description: '2-step workflow',
        Status: 'Complete',
        ParentID: null,
        RootParentID: null,
        StartedAt: t0,
        CompletedAt: t2,
      },
      {
        ID: 'wf-step-1',
        ConversationDetailID: null,
        UserID: 'user-1',
        Name: 'Query top 10 users',
        Description: 'Build SQL query\n\n--- Output ---\nReturned 10 active users',
        Status: 'Complete',
        ParentID: 'wf-root-1',
        RootParentID: 'wf-root-1',
        Agent: 'Query Builder',
        AgentID: 'agent-qb',
        AgentRunID: 'run-qb-1',
        PercentComplete: 100,
        StartedAt: t0,
        CompletedAt: t1,
      },
      {
        ID: 'wf-step-2',
        ConversationDetailID: null,
        UserID: 'user-1',
        Name: 'Write executive summary',
        Description: 'Draft report\n\n--- Output ---\nExecutive report completed',
        Status: 'Complete',
        ParentID: 'wf-root-1',
        RootParentID: 'wf-root-1',
        Agent: 'Research Report Writer',
        AgentID: 'agent-writer',
        AgentRunID: 'run-writer-1',
        PercentComplete: 100,
        StartedAt: t1,
        CompletedAt: t2,
      }
    );

    const view = await workspaceTasksView(db.provider);
    view.BaseFilterResolver = null;
    view.BaseFilter = '1=1';
    await view.LoadTasks();

    // Parent container and 2 children coalesce into a single 2-step workflow group!
    expect(view.WorkflowGroups).toHaveLength(1);
    const wf = view.WorkflowGroups[0];
    expect(wf.Title).toBe('User Growth & Report Pipeline');
    expect(wf.IsMultiStep).toBe(true);
    expect(wf.TotalSteps).toBe(2);
    expect(wf.CompletedSteps).toBe(2);
    expect(wf.PercentComplete).toBe(100);
    expect(wf.AgentPipeline.map(a => a.name)).toEqual(['Query Builder', 'Research Report Writer']);
    expect(wf.Steps[0].Instructions).toBe('Build SQL query');
    expect(wf.Steps[0].Output).toBe('Returned 10 active users');

    // KPI check
    expect(view.Kpis.TotalWorkflows).toBe(1);
    expect(view.Kpis.TotalSteps).toBe(2);
    expect(view.Kpis.CompletedSteps).toBe(2);
    expect(view.Kpis.SuccessRatePercent).toBe(100);

    // Search & filter checks
    view.SearchQuery = 'executive summary';
    view.OnFilterCriteriaChanged();
    expect(view.FilteredWorkflowGroups).toHaveLength(1);

    view.SearchQuery = 'nonexistent-keyword';
    view.OnFilterCriteriaChanged();
    expect(view.FilteredWorkflowGroups).toHaveLength(0);

    view.ResetAllFilters();
    expect(view.FilteredWorkflowGroups).toHaveLength(1);
  });
});

describe('MessageItemComponent — First-Class Inline Workflow Execution Card', () => {
  it('deduplicates the parent workflow container task from child step tasks and formats step summaries cleanly', () => {
    const item = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    const t0 = new Date('2026-10-18T12:00:00Z');
    const t1 = new Date('2026-10-18T12:00:42Z');

    item.DetailTasks = [
      {
        ID: 'parent-task',
        Name: 'Multi-Step Analytics Workflow',
        Description: '2-step workflow submitted by Sage',
        Status: 'In Progress',
        ParentID: null,
        PercentComplete: 50,
      } as unknown as MJTaskEntity,
      {
        ID: 'step-1',
        Name: 'Run user cohort query',
        Description: 'Query active cohorts\n\n--- Output ---\n**Cohort A**: 128 users',
        Status: 'Complete',
        ParentID: 'parent-task',
        Agent: 'Query Builder',
        StartedAt: t0,
        CompletedAt: t1,
      } as unknown as MJTaskEntity,
      {
        ID: 'step-2',
        Name: 'Generate retention report',
        Description: 'Synthesize retention metrics',
        Status: 'In Progress',
        ParentID: 'parent-task',
        Agent: 'Research Report Writer',
        StartedAt: t1,
        CompletedAt: null,
      } as unknown as MJTaskEntity,
    ];

    expect(item.WorkflowParentTask?.ID).toBe('parent-task');
    expect(item.WorkflowSteps.map(s => s.ID)).toEqual(['step-1', 'step-2']);
    expect(item.WorkflowCompletedStepCount).toBe(1);
    expect(item.WorkflowProgressPercent).toBe(75);
    expect(item.HasActiveWorkflowTasks).toBe(true);
    expect(item.FormatWorkflowStepDuration(item.WorkflowSteps[0])).toBe('0:42');
    expect(item.GetWorkflowStepSummary(item.WorkflowSteps[0])).toBe('**Cohort A**: 128 users');
  });
});
