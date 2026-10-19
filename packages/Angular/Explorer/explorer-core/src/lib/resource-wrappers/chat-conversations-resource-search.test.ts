/**
 * `ChatConversationsResource.OnSearchResultSelected` for a message hit: selects the conversation,
 * renders it into the chat area, then has the chat area open the message at its branch and
 * sequence. A conversation hit only selects the conversation. A failed open is logged.
 *
 * Node preset with the Angular and MJ UI packages mocked; the component is reached via
 * Object.create so none of Angular's construction machinery has to exist.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@angular/core', () => ({
  Component: () => (target: Function) => target,
  ViewChild: () => () => undefined,
  HostListener: () => () => undefined,
  ChangeDetectorRef: class {},
  ViewEncapsulation: { None: 0 },
}));

vi.mock('@memberjunction/global', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@memberjunction/global')>();
  return { ...actual, RegisterClass: () => (target: Function) => target };
});

vi.mock('@memberjunction/ng-shared', () => ({
  BaseResourceComponent: class {},
  NavigationService: class {},
}));

vi.mock('@memberjunction/ng-conversations', () => ({
  ConversationChatAreaComponent: class {},
  ConversationListComponent: class {},
  ConversationStreamingService: class {},
  ActiveTasksService: class {},
  UICommandHandlerService: class {},
  ConversationBridgeService: class {},
  MentionAutocompleteService: class {},
}));

vi.mock('@memberjunction/ng-composer', () => ({}));
vi.mock('@memberjunction/ai-core-plus', () => ({}));
vi.mock('@memberjunction/ng-notifications', () => ({ MJNotificationService: class {} }));
vi.mock('@memberjunction/ng-artifacts', () => ({}));
vi.mock('@memberjunction/ai-engine-base', () => ({ AIEngineBase: { Instance: {} } }));

import type { SearchResult } from '@memberjunction/ng-conversations';
import { ChatConversationsResource } from './chat-conversations-resource.component';

interface Harness {
  resource: ChatConversationsResource;
  calls: string[];
  openMessage: ReturnType<typeof vi.fn>;
  selectConversation: ReturnType<typeof vi.fn>;
}

function createHarness(): Harness {
  const resource = Object.create(ChatConversationsResource.prototype) as ChatConversationsResource;
  const open = resource as unknown as Record<string, unknown>;
  const calls: string[] = [];
  const openMessage = vi.fn(async () => {
    calls.push('OpenMessage');
    return true;
  });
  const selectConversation = vi.fn(async () => {
    calls.push('OnConversationSelected');
  });

  open['IsSearchPanelOpen'] = true;
  open['OnConversationSelected'] = selectConversation;
  open['cdr'] = { detectChanges: vi.fn(() => calls.push('detectChanges')) };
  open['ChatArea'] = { OpenMessage: openMessage };

  return { resource, calls, openMessage, selectConversation };
}

function hit(overrides: Partial<SearchResult> & Pick<SearchResult, 'id' | 'type'>): SearchResult {
  return {
    title: 'Title',
    preview: 'Preview',
    createdAt: new Date('2026-10-01T00:00:00Z'),
    relevanceScore: 5,
    ...overrides,
  };
}

/** Lets the fire-and-forget open chain settle. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('ChatConversationsResource.OnSearchResultSelected', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the conversation, renders it, then opens the message at its branch and sequence', async () => {
    const h = createHarness();

    h.resource.OnSearchResultSelected(hit({ id: 'M1', type: 'message', conversationId: 'C9', branchId: 'B2', sequence: 14 }));
    await settle();

    expect(h.resource.IsSearchPanelOpen).toBe(false);
    expect(h.selectConversation).toHaveBeenCalledWith('C9');
    expect(h.openMessage).toHaveBeenCalledWith('C9', 'B2', 14);
    expect(h.calls).toEqual(['OnConversationSelected', 'detectChanges', 'OpenMessage']);
  });

  it('opens a trunk message with a null branch', async () => {
    const h = createHarness();

    h.resource.OnSearchResultSelected(hit({ id: 'M1', type: 'message', conversationId: 'C9', branchId: null, sequence: 3 }));
    await settle();

    expect(h.openMessage).toHaveBeenCalledWith('C9', null, 3);
  });

  it('logs a message open that fails instead of leaving the rejection unhandled', async () => {
    const h = createHarness();
    const failure = new Error('open failed');
    h.openMessage.mockRejectedValueOnce(failure);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    h.resource.OnSearchResultSelected(hit({ id: 'M1', type: 'message', conversationId: 'C9', branchId: 'B2', sequence: 14 }));
    await settle();

    expect(error).toHaveBeenCalledWith(expect.any(String), failure);
  });

  it('only selects the conversation for a conversation result', async () => {
    const h = createHarness();

    h.resource.OnSearchResultSelected(hit({ id: 'C1', type: 'conversation', conversationId: 'C1' }));
    await settle();

    expect(h.selectConversation).toHaveBeenCalledWith('C1');
    expect(h.openMessage).not.toHaveBeenCalled();
  });
});

describe('ChatConversationsResource.handleActionableCommand (open:resource)', () => {
  it('resolves kebab-case App slug ("data-explorer") to "Data Explorer" application and calls SwitchToApp', async () => {
    const h = createHarness();
    const open = h.resource as unknown as Record<string, unknown>;
    const switchToApp = vi.fn().mockResolvedValue(undefined);
    open['navigationService'] = {
      SwitchToApp: switchToApp,
      OpenNavItemByName: vi.fn().mockResolvedValue(null),
    };
    Object.defineProperty(h.resource, 'ProviderToUse', {
      configurable: true,
      get: () => ({
        Applications: [
          { ID: 'A1B2C3D4-0000-0000-0000-000000000001', Name: 'Data Explorer', Path: 'data-explorer' },
        ],
      }),
    });

    const handle = (h.resource as unknown as {
      handleActionableCommand: (req: { command: Record<string, unknown> }) => void;
    }).handleActionableCommand.bind(h.resource);

    handle({
      command: {
        type: 'open:resource',
        label: 'Open Data Explorer',
        icon: 'fa-table',
        resourceType: 'App',
        resourceId: 'data-explorer',
      },
    });
    await settle();

    expect(switchToApp).toHaveBeenCalledWith(
      'A1B2C3D4-0000-0000-0000-000000000001',
      undefined,
      undefined
    );
  });

  it('finds a matching NavItem inside an application DefaultNavItems when target is a nav item', async () => {
    const h = createHarness();
    const open = h.resource as unknown as Record<string, unknown>;
    const switchToApp = vi.fn().mockResolvedValue(undefined);
    open['navigationService'] = {
      SwitchToApp: switchToApp,
      OpenNavItemByName: vi.fn().mockResolvedValue(null),
    };
    Object.defineProperty(h.resource, 'ProviderToUse', {
      configurable: true,
      get: () => ({
        Applications: [
          {
            ID: 'A1B2C3D4-0000-0000-0000-000000000002',
            Name: 'Home',
            Path: 'home',
            DefaultNavItems: JSON.stringify([{ Label: 'Data Explorer', Route: 'data-explorer' }]),
          },
        ],
      }),
    });

    const handle = (h.resource as unknown as {
      handleActionableCommand: (req: { command: Record<string, unknown> }) => void;
    }).handleActionableCommand.bind(h.resource);

    handle({
      command: {
        type: 'open:resource',
        label: 'Open Data Explorer',
        icon: 'fa-table',
        resourceType: 'App',
        resourceId: 'data-explorer',
      },
    });
    await settle();

    expect(switchToApp).toHaveBeenCalledWith(
      'A1B2C3D4-0000-0000-0000-000000000002',
      'Data Explorer',
      undefined
    );
  });

  it('delegates Artifact/File open:resource commands to ChatArea.openConversationArtifactForCommand', () => {
    const h = createHarness();
    const openArtifactForCommand = vi.fn().mockReturnValue(true);
    (h.resource as unknown as Record<string, unknown>)['ChatArea'] = {
      openConversationArtifactForCommand: openArtifactForCommand,
    };

    const handle = (h.resource as unknown as {
      handleActionableCommand: (req: { command: Record<string, unknown> }) => void;
    }).handleActionableCommand.bind(h.resource);

    const cmd = {
      type: 'open:resource',
      label: 'Download CSV File',
      resourceType: 'File',
      resourceId: 'customers.csv',
    };
    handle({ command: cmd });

    expect(openArtifactForCommand).toHaveBeenCalledWith(cmd);
  });
});
