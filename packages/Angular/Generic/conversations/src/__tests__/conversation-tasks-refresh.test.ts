/**
 * The workspace's Tasks tab. Its filter lists message IDs, so it must be rebuilt each time the
 * tasks view loads: a task linked to a message created after the first load (for example the
 * top-level task of an agent's task graph, which is saved with no user) must appear on the next
 * refresh, as it did when the filter was a live subquery.
 *
 * Both components are created from their prototypes (no Angular DI) and bound the way the
 * workspace template binds them.
 */
import '@angular/compiler'; // JIT support — the component modules evaluate Angular decorators in vitest's node env
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { createFakeProvider } from '@memberjunction/ng-test-utils';
import { ConversationWorkspaceComponent } from '../lib/components/workspace/conversation-workspace.component';
import { TasksFullViewComponent } from '../lib/components/task/tasks-full-view.component';

const USER = { ID: 'user-1' } as unknown as UserInfo;
const TASKS_ENTITY = { Name: 'MJ: Tasks', SchemaName: '__mj', BaseView: 'vwTasks' } as unknown as EntityInfo;

interface TaskRow {
  ID: string;
  ConversationDetailID: string | null;
  UserID: string | null;
}

/**
 * A provider that answers like the database for these tests: the user owns one conversation, its
 * messages are listed, and a task is returned when the filter names its message or its owner.
 */
function database(): { provider: IMetadataProvider; messages: Array<{ ID: string }>; tasks: TaskRow[] } {
  const messages = [{ ID: 'msg-1' }];
  const tasks: TaskRow[] = [{ ID: 'task-1', ConversationDetailID: 'msg-1', UserID: null }];
  const provider = createFakeProvider<object>({
    runViewResults: (params) => {
      const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';
      switch (params.EntityName) {
        case 'MJ: Conversations':
          return [{ ID: 'conv-1' }];
        case 'MJ: Conversation Details':
          return messages;
        case 'MJ: Tasks':
          return tasks.filter(
            (task) =>
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
  Object.assign(workspace, { Provider: provider, currentUser: USER, cdr: { markForCheck: () => undefined, detectChanges: () => undefined } });
  (workspace as unknown as { buildTasksFilter(): void }).buildTasksFilter();
  await new Promise((resolve) => setTimeout(resolve, 0)); // let any background filter work settle

  const view = Object.create(TasksFullViewComponent.prototype) as TasksFullViewComponent;
  Object.assign(view, { Provider: provider, currentUser: USER, aiEngineConfigured: true, allTasks: [], filteredTasks: [] });
  // [baseFilter]="tasksFilter" and [BaseFilterResolver]="TasksFilterResolver"
  view.baseFilter = workspace.tasksFilter;
  Object.assign(view, { BaseFilterResolver: (workspace as unknown as { TasksFilterResolver?: () => Promise<string> }).TasksFilterResolver ?? null });
  return view;
}

describe('Conversation workspace — Tasks tab refresh', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a task linked to a message created after the first load on the next refresh', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const db = database();
    const view = await workspaceTasksView(db.provider);

    await view.loadTasks();
    expect(view.allTasks.map((task) => task.ID)).toEqual(['task-1']);

    // An agent's task graph adds a message and a top-level task that has no user.
    db.messages.push({ ID: 'msg-2' });
    db.tasks.push({ ID: 'task-2', ConversationDetailID: 'msg-2', UserID: null });
    await view.loadTasks();

    expect(view.allTasks.map((task) => task.ID).sort()).toEqual(['task-1', 'task-2']);
  });

  it('asks the resolver for a new filter on every load', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const db = database();
    const view = Object.create(TasksFullViewComponent.prototype) as TasksFullViewComponent;
    const resolver = vi.fn(async () => "ParentID IS NULL AND UserID = 'user-1'");
    Object.assign(view, { Provider: db.provider, currentUser: USER, aiEngineConfigured: true, allTasks: [], filteredTasks: [], baseFilter: '1=1' });
    Object.assign(view, { BaseFilterResolver: resolver });

    await view.loadTasks();
    await view.loadTasks();

    expect(resolver).toHaveBeenCalledTimes(2);
  });
});
