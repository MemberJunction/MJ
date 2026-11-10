// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Subject } from 'rxjs';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { AgentClientService } from '@memberjunction/ng-agent-client';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * The conversation browser is a server Chromium process (or a billed hosted browser) that counts against
 * the user's cap, so every way out of the chat area must end it. Exercised WITHOUT TestBed: the component
 * is created via Object.create(prototype) with a fake controller seeded in.
 */

interface FakeBrowser {
  ConversationId: string | null;
  SetConversation: ReturnType<typeof vi.fn>;
  Open: ReturnType<typeof vi.fn>;
  Close: ReturnType<typeof vi.fn>;
  Dispose: ReturnType<typeof vi.fn>;
  Navigate: ReturnType<typeof vi.fn>;
}

function createComponent(conversationId: string, browser: FakeBrowser | null): ConversationChatAreaComponent {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  open['_conversationId'] = conversationId;
  open['remoteBrowser'] = browser;
  open['cdr'] = { detectChanges: vi.fn() };
  component.AllowRemoteBrowser = true;
  component.ShowRemoteBrowserPanel = false;
  return component;
}

function fakeBrowser(conversationId: string | null = null): FakeBrowser {
  const browser: FakeBrowser = {
    ConversationId: conversationId,
    SetConversation: vi.fn(),
    Open: vi.fn((id: string) => {
      browser.ConversationId = id;
    }),
    Close: vi.fn(async () => {
      browser.ConversationId = null;
    }),
    Dispose: vi.fn(),
    Navigate: vi.fn(),
  };
  return browser;
}

function makeFakeAgentClient(): {
  service: AgentClientService;
  tools: Map<string, { Name: string; Handler: (params: Record<string, unknown>) => Promise<unknown> }>;
} {
  const tools = new Map<string, { Name: string; Handler: (params: Record<string, unknown>) => Promise<unknown> }>();
  const service = {
    IsActive: false,
    SessionId: null as string | null,
    RegisterTool: vi.fn((def: { Name: string; Handler: (params: Record<string, unknown>) => Promise<unknown> }) => {
      tools.set(def.Name, def);
    }),
    UnregisterTool: vi.fn((name: string) => {
      tools.delete(name);
    }),
    GetRegisteredTools: () => Array.from(tools.values()),
    StartSession: vi.fn(),
  } as unknown as AgentClientService;
  return { service, tools };
}

describe('chat area: conversation browser lifecycle', () => {
  let notify: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    notify = vi.fn();
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens nothing when the host did not allow a browser', () => {
    const browser = fakeBrowser();
    const component = createComponent('conv-1', browser);
    component.AllowRemoteBrowser = false;

    component.OpenRemoteBrowserPanel();

    expect(browser.Open).not.toHaveBeenCalled();
    expect(component.ShowRemoteBrowserPanel).toBe(false);

    component.AllowRemoteBrowser = true;
    component.OpenRemoteBrowserPanel();
    expect(browser.Open).toHaveBeenCalledWith('conv-1');
    expect(component.ShowRemoteBrowserPanel).toBe(true);
  });

  it('ends the browser when the user closes the drawer', () => {
    const browser = fakeBrowser('conv-1');
    const component = createComponent('conv-1', browser);
    component.ShowRemoteBrowserPanel = true;

    component.CloseRemoteBrowserPanel();

    expect(browser.Close).toHaveBeenCalledTimes(1);
    expect(component.ShowRemoteBrowserPanel).toBe(false);
  });

  it('ends the browser and hides the drawer when AllowRemoteBrowser is turned off', () => {
    const { service, tools } = makeFakeAgentClient();
    const component = createComponent('conv-1', null);
    component.AppContext = { Host: 'test' };
    const open = component as unknown as Record<string, unknown>;
    open['agentClientService'] = service;

    // 1. Standby (drawer closed, ShowRemoteBrowserPanel === false): CloseRemoteBrowserPanel() is a no-op,
    //    so void this.remoteBrowser?.Close() in the setter is what unregisters the 13 standby tools.
    expect(component.EffectiveAppContext).toBeTruthy();
    expect(tools.size).toBe(13);
    component.AllowRemoteBrowser = false;
    expect(tools.size).toBe(0);
    expect(component.EffectiveAppContext).toEqual({ Host: 'test' });

    // 2. Open drawer (ShowRemoteBrowserPanel === true): turning AllowRemoteBrowser off hides the drawer
    //    and ends the live browser.
    component.AllowRemoteBrowser = true;
    component.OpenRemoteBrowserPanel();
    expect(component.ShowRemoteBrowserPanel).toBe(true);
    expect(tools.size).toBe(13);

    component.AllowRemoteBrowser = false;

    expect(component.ShowRemoteBrowserPanel).toBe(false);
    expect(tools.size).toBe(0);
    expect(component.EffectiveAppContext).toEqual({ Host: 'test' });
  });

  it('keeps the 13 browser_* tools across A -> null -> A, same-conversation reload, and letter-case changes', () => {
    const { service, tools } = makeFakeAgentClient();
    const convA = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const component = createComponent(convA, null);
    const open = component as unknown as Record<string, unknown>;
    open['agentClientService'] = service;
    const reset = () => (component as unknown as { resetConversationScopedViewState(): void }).resetConversationScopedViewState();
    const readToolCount = (): number => {
      const ctx = component.EffectiveAppContext;
      const caps = (ctx?.['Capabilities'] as { Tools?: unknown[] } | undefined)?.Tools;
      return caps?.length ?? 0;
    };

    // Initial standby on A: 13 tools registered and advertised.
    expect(readToolCount()).toBe(13);
    expect(tools.size).toBe(13);

    // 1. A -> no conversation -> A (starting a new chat and coming back to A).
    open['_conversationId'] = null;
    reset();
    expect(tools.size).toBe(0);
    open['_conversationId'] = convA;
    reset();
    expect(readToolCount()).toBe(13);
    expect(tools.size).toBe(13);

    // 2. The same conversation reloads (overlay-to-workspace handoff calls reset with the same ID).
    reset();
    expect(readToolCount()).toBe(13);
    expect(tools.size).toBe(13);

    // 3. The ID changes only in letter case.
    open['_conversationId'] = convA.toUpperCase();
    reset();
    expect(readToolCount()).toBe(13);
    expect(tools.size).toBe(13);
  });

  it('ends the browser on a switch to another conversation, and keeps it on a reload of the same one', () => {
    const browser = fakeBrowser('conv-1');
    const component = createComponent('conv-1', browser);
    const reset = () => (component as unknown as { resetConversationScopedViewState(): void }).resetConversationScopedViewState();

    reset();
    expect(browser.Close).not.toHaveBeenCalled();

    (component as unknown as Record<string, unknown>)['_conversationId'] = 'conv-2';
    component.ShowRemoteBrowserPanel = true;
    reset();
    expect(browser.Close).toHaveBeenCalledTimes(1);
    expect(component.ShowRemoteBrowserPanel).toBe(false);
  });

  it('disposes the browser when the chat area is destroyed', () => {
    vi.stubGlobal('window', { removeEventListener: vi.fn() });
    const browser = fakeBrowser('conv-1');
    const component = createComponent('conv-1', browser);
    const open = component as unknown as Record<string, unknown>;
    open['agentStateService'] = { stopPolling: vi.fn() };
    open['destroy$'] = new Subject<void>();

    component.ngOnDestroy();

    expect(browser.Dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps the header button lit while the browser runs behind another panel', () => {
    const browser = fakeBrowser('conv-1');
    const component = createComponent('conv-1', browser);
    component.ShowRemoteBrowserPanel = false;
    expect(component.IsRemoteBrowserLive).toBe(true);

    browser.ConversationId = null;
    expect(component.IsRemoteBrowserLive).toBe(false);
  });

  it('shows why a drawer navigation failed, instead of silently keeping the old page', async () => {
    const browser = fakeBrowser('conv-1');
    browser.Navigate.mockResolvedValue({ Success: false, ErrorMessage: 'Navigation to "http://10.0.0.5/" was blocked.' });
    const component = createComponent('conv-1', browser);
    component.RemoteBrowserUrlInput = 'http://10.0.0.5/';

    await component.NavigateRemoteBrowserFromInput();

    expect(notify).toHaveBeenCalledWith('Navigation to "http://10.0.0.5/" was blocked.', 'error', 5000);
    expect(component.IsRemoteBrowserNavigating).toBe(false);
  });

  it('hides the drawer and says why once when the server refuses the browser', () => {
    const component = createComponent('conv-1', null);
    const open = component as unknown as Record<string, unknown>;
    open['agentClientService'] = {};
    component.ShowRemoteBrowserPanel = true;
    const controller = (component as unknown as { ensureRemoteBrowser(): { options: { OnSessionRefused(message: string): void } } }).ensureRemoteBrowser();

    controller.options.OnSessionRefused('Conversation browsers are not enabled on this server.');

    expect(component.ShowRemoteBrowserPanel).toBe(false);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('Conversation browsers are not enabled on this server.', 'error', 6000);
  });
});
