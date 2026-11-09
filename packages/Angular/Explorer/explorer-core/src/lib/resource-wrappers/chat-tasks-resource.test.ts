import { describe, expect, it, vi } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ViewChild: () => () => undefined,
  ViewEncapsulation: { None: 0 },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: Function) => target };
});

vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {},
}));

vi.mock('@memberjunction/ng-conversations', () => ({
  TasksFullViewComponent: class {},
  BuildConversationTasksFilter: vi.fn(async () => "ParentID IS NULL AND UserID = 'u-1'"),
}));

import type { EntityInfo, IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { ResourceData } from '@memberjunction/core-entities';
import { ChatTasksResource } from './chat-tasks-resource.component';

describe('ChatTasksResource (Agent Activity)', () => {
  it('exposes Agent Activity display name and diagram-project icon', async () => {
    const resource = Object.create(ChatTasksResource.prototype) as ChatTasksResource;
    expect(await resource.GetResourceDisplayName({} as ResourceData)).toBe('Agent Activity');
    expect(await resource.GetResourceIconClass({} as ResourceData)).toBe('fa-solid fa-diagram-project');
  });

  it('scopes MJ: Tasks queries to agent and conversation activity so bizapps-tasks human tasks do not leak in', async () => {
    const resource = Object.create(ChatTasksResource.prototype) as ChatTasksResource;
    Object.assign(resource as object, {
      CurrentUser: { ID: 'u-1' } as UserInfo,
    });
    Object.defineProperty(resource, 'ProviderToUse', {
      configurable: true,
      get: () =>
        ({
          EntityByName: (name: string) =>
            name === 'MJ: Tasks'
              ? ({ SchemaName: '__mj', BaseView: 'vwTasks' } as EntityInfo)
              : undefined,
        }) as Partial<IMetadataProvider> as IMetadataProvider,
    });

    const filter = await resource.ResolveAgentActivityFilter();
    expect(filter).toContain("ParentID IS NULL AND UserID = 'u-1'");
    expect(filter).toContain('ConversationDetailID IS NOT NULL');
    expect(filter).toContain('AgentID IS NOT NULL');
    expect(filter).toContain('AgentRunID IS NOT NULL');
    expect(filter).toContain('[__mj].[vwTasks]');
  });
});
