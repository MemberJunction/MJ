// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { ConversationEngine, type ConversationBranchRow, type MJConversationDetailEntity } from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { ConversationChatAreaComponent } from '../lib/components/conversation/conversation-chat-area.component';

/**
 * `OnDeleteMessage`: before the confirm dialog, the branch rows are read fresh and a row that
 * some branch still shares is not deleted. When the rows cannot be read, nothing is deleted.
 *
 * Built via `Object.create(prototype)` so the real handler runs against stubbed collaborators,
 * matching `chat-area-regenerate.test.ts`.
 */

interface Harness {
  component: ConversationChatAreaComponent;
  provider: { GetEntityObject: ReturnType<typeof vi.fn> };
  confirm: ReturnType<typeof vi.fn>;
}

function row(id: string, sequence: number): MJConversationDetailEntity {
  return { ID: id, ConversationID: 'CONV-1', Sequence: sequence, BranchID: null } as MJConversationDetailEntity;
}

function branch(id: string, forkFromSequence: number): ConversationBranchRow {
  return { ID: id, ConversationID: 'CONV-1', ParentBranchID: null, ForkFromSequence: forkFromSequence, Name: null };
}

const ROW_1 = row('ROW-1', 1);
const ROW_2 = row('ROW-2', 2);
const ROW_3 = row('ROW-3', 3);
const ROW_4 = row('ROW-4', 4);
const CURRENT_USER = { ID: 'USER-1' };

function createHarness(): Harness {
  const component = Object.create(ConversationChatAreaComponent.prototype) as ConversationChatAreaComponent;
  const open = component as unknown as Record<string, unknown>;
  const provider = { GetEntityObject: vi.fn() };
  const confirm = vi.fn(async () => false);

  open['_conversationId'] = 'CONV-1';
  open['Conversation'] = { ID: 'CONV-1', UserID: 'USER-1' };
  open['CurrentUser'] = CURRENT_USER;
  open['Provider'] = provider;
  // Out of order on purpose: the handler sorts the window by Sequence.
  open['messages'] = [ROW_3, ROW_1, ROW_4, ROW_2];
  // The list held since the transcript loaded: empty, as after a failed read.
  open['branches'] = [];
  open['confirmDialog'] = { confirm };

  return { component, provider, confirm };
}

function heldBranches(component: ConversationChatAreaComponent): ConversationBranchRow[] {
  return (component as unknown as { branches: ConversationBranchRow[] }).branches;
}

/** The conversation the chat area's held fork rows belong to. */
function heldBranchesConversation(component: ConversationChatAreaComponent): string | null | undefined {
  return (component as unknown as { branchRowsConversationId?: string | null }).branchRowsConversationId;
}

describe('ConversationChatAreaComponent.OnDeleteMessage branch guard', () => {
  let notify: ReturnType<typeof vi.fn>;
  let loadBranches: MockInstance<typeof ConversationEngine.LoadBranchesFresh>;
  let logError: MockInstance<typeof console.error>;

  beforeEach(() => {
    notify = vi.fn();
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);
    loadBranches = vi.spyOn(ConversationEngine, 'LoadBranchesFresh').mockResolvedValue([]);
    logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([2, 3])('does not delete a row when a fresh branch forks at sequence %i, at or after the row', async (forkFromSequence) => {
    const h = createHarness();
    const fresh = [branch('BRANCH-A', forkFromSequence)];
    loadBranches.mockResolvedValueOnce(fresh);

    await h.component.OnDeleteMessage(ROW_2);

    expect(loadBranches).toHaveBeenCalledWith('CONV-1', CURRENT_USER, h.provider);
    expect(notify).toHaveBeenCalledWith('A fork depends on this message, so it cannot be deleted', 'error', 3000);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.provider.GetEntityObject).not.toHaveBeenCalled();
    expect(heldBranches(h.component)).toBe(fresh);
    expect(heldBranchesConversation(h.component)).toBe('CONV-1');
  });

  it('deletes nothing when the branch rows cannot be read', async () => {
    const h = createHarness();
    loadBranches.mockRejectedValueOnce(new Error('read failed'));

    await h.component.OnDeleteMessage(ROW_2);

    expect(notify).toHaveBeenCalledWith('Could not verify branches; the message was not deleted', 'error', 3000);
    expect(logError).toHaveBeenCalledTimes(1);
    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.provider.GetEntityObject).not.toHaveBeenCalled();
  });

  it('asks for confirmation, counting rows by Sequence, when no branch forks at or after the row', async () => {
    const h = createHarness();
    loadBranches.mockResolvedValueOnce([branch('BRANCH-A', 1)]);

    await h.component.OnDeleteMessage(ROW_2);

    expect(notify).not.toHaveBeenCalled();
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(h.confirm).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Delete this message and the 2 messages after it? This cannot be undone.'
    }));
    // The dialog stub answers Cancel, so nothing loads for delete.
    expect(h.provider.GetEntityObject).not.toHaveBeenCalled();
  });

  it('stops when another conversation opens while the branch rows load', async () => {
    const h = createHarness();
    const open = h.component as unknown as Record<string, unknown>;
    loadBranches.mockImplementationOnce(async () => {
      open['_conversationId'] = 'CONV-2';
      return [];
    });

    await h.component.OnDeleteMessage(ROW_2);

    expect(h.confirm).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(heldBranches(h.component)).toEqual([]);
    expect(heldBranchesConversation(h.component)).toBeUndefined();
  });
});
