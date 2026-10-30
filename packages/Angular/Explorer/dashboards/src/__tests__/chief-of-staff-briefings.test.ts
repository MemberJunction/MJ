// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';

const notify = vi.fn();
vi.mock('@memberjunction/ng-notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@memberjunction/ng-notifications')>()),
  MJNotificationService: { get Instance() { return { CreateSimpleNotification: notify }; } },
}));

import { ChiefOfStaffApprovalsComponent } from '../ChiefOfStaff/chief-of-staff-approvals.component';
import type { MJConversationEntity, MJUserRoutineEntity } from '@memberjunction/core-entities';

/**
 * A wake routine's briefings live in the routine's own conversation, which the chat sidebar never
 * lists. The routine cards on the Overview and Approvals & Wakes pages give two ways in: "Open briefing" deep-links into the Chat app
 * (query params as well as configuration, so an already-open Chat tab switches), and "Read" opens
 * the conversation in a slide-in reader without leaving the page. Both need a routine that has
 * run at least once, since the conversation is created on the first run.
 */

type Open = Record<string, unknown>;

interface Harness {
  component: ChiefOfStaffApprovalsComponent;
  openNavItemByName: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
}

function createComponent(options: { chatApp?: { ID: string } | null; conversationLoads?: boolean } = {}): Harness {
  const component = Object.create(ChiefOfStaffApprovalsComponent.prototype) as ChiefOfStaffApprovalsComponent;
  const open = component as unknown as Open;
  const openNavItemByName = vi.fn(async () => 'tab-1');
  const load = vi.fn(async () => options.conversationLoads ?? true);
  open['navigationService'] = { OpenNavItemByName: openNavItemByName };
  open['appManager'] = {
    GetAppByName: (name: string) => {
      if (name === 'Chat') return options.chatApp === undefined ? { ID: 'chat-app' } : options.chatApp;
      if (name === 'Chief of Staff') return { ID: 'cos-app' };
      return null;
    },
  };
  open['cdr'] = { markForCheck: vi.fn(), detectChanges: vi.fn() };
  Object.defineProperty(component, 'ProviderToUse', {
    get: () => ({
      CurrentUser: { ID: 'user-1' },
      GetEntityObject: vi.fn(async () => ({ ID: 'C1', Name: 'Chief of Staff — Wake (default)', Load: load })),
    }),
    configurable: true,
  });
  return { component, openNavItemByName, load };
}

const ran = { ID: 'R1', Name: 'Chief of Staff — Wake (default)', ConversationID: 'C1' } as MJUserRoutineEntity;
const neverRan = { ID: 'R2', Name: 'Chief of Staff — Wake (new)', ConversationID: null } as MJUserRoutineEntity;

describe('ChiefOfStaffApprovalsComponent — a routine\'s briefings', () => {
  it('a routine that has run can open its briefings; one that never ran cannot', () => {
    const { component } = createComponent();
    expect(component.CanOpenBriefing(ran)).toBe(true);
    expect(component.CanOpenBriefing(neverRan)).toBe(false);
  });

  it('"Open briefing" deep-links into the Chat app with the routine conversation in configuration and query params', () => {
    const { component, openNavItemByName } = createComponent();
    const event = { stopPropagation: vi.fn() } as unknown as Event;

    component.OpenRoutineBriefing(ran, event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(openNavItemByName).toHaveBeenCalledWith('Conversations', { conversationId: 'C1' }, 'chat-app', { queryParams: { conversationId: 'C1' } });
  });

  it('"Open briefing" does nothing for a routine that never ran', () => {
    const { component, openNavItemByName } = createComponent();
    component.OpenRoutineBriefing(neverRan);
    expect(openNavItemByName).not.toHaveBeenCalled();
  });

  it('"Open briefing" tells the user when the Chat app is not installed', () => {
    notify.mockClear();
    const { component, openNavItemByName } = createComponent({ chatApp: null });
    component.OpenRoutineBriefing(ran);
    expect(openNavItemByName).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Chat'), 'error', expect.any(Number));
  });

  it('the reader opens on the routine conversation, loaded through the provider, and closes clean', async () => {
    const { component, load } = createComponent();

    await component.OpenBriefingReader(ran);

    expect(load).toHaveBeenCalledWith('C1');
    expect(component.BriefingRoutine).toBe(ran);
    expect(component.BriefingConversationId).toBe('C1');
    expect((component.BriefingConversation as MJConversationEntity | null)?.ID).toBe('C1');
    expect(component.IsBriefingReaderOpen).toBe(true);

    component.CloseBriefingReader();

    expect(component.IsBriefingReaderOpen).toBe(false);
    expect(component.BriefingRoutine).toBeNull();
    expect(component.BriefingConversationId).toBeNull();
    expect(component.BriefingConversation).toBeNull();
  });

  it('the reader still opens on the conversation ID when the entity cannot be loaded', async () => {
    const { component } = createComponent({ conversationLoads: false });

    await component.OpenBriefingReader(ran);

    expect(component.IsBriefingReaderOpen).toBe(true);
    expect(component.BriefingConversationId).toBe('C1');
    expect(component.BriefingConversation).toBeNull();
  });

  it('the reader does not open for a routine that never ran', async () => {
    const { component } = createComponent();
    await component.OpenBriefingReader(neverRan);
    expect(component.IsBriefingReaderOpen).toBe(false);
  });
});

describe('ChiefOfStaffApprovalsComponent — moving between pages', () => {
  it('opens another page through its nav item in the Chief of Staff app', () => {
    const { component, openNavItemByName } = createComponent();

    component.OpenPage('governance');

    expect(openNavItemByName).toHaveBeenCalledWith('Governance', undefined, 'cos-app');
  });
});
