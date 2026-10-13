// Angular components in this package are partial-compiled — load the JIT compiler first.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { ConversationEngine, type ConversationScope } from '@memberjunction/core-entities';
import { ConversationWorkspaceComponent } from '../lib/components/workspace/conversation-workspace.component';

/** The workspace artifact viewer reads in the chat area's scope (its open view), else Main. */
function workspace(selected: string | null, chatScope: ConversationScope | null | undefined): ConversationWorkspaceComponent {
  const component = Object.create(ConversationWorkspaceComponent.prototype) as ConversationWorkspaceComponent;
  const open = component as unknown as Record<string, unknown>;
  open['SelectedConversationId'] = selected;
  open['chatArea'] = chatScope === undefined ? undefined : { ArtifactViewerScope: chatScope };
  return component;
}

describe('ConversationWorkspaceComponent.ArtifactViewerScope', () => {
  const forkScope: ConversationScope = { ConversationID: 'c1', BranchID: 'T1', Branches: [{ ID: 'T1', ConversationID: 'c1', ParentBranchID: null, ForkFromSequence: 2 }] };

  it('is null with no selected conversation', () => {
    expect(workspace(null, forkScope).ArtifactViewerScope).toBeNull();
  });

  it("uses the chat area's scope for the selected conversation", () => {
    expect(workspace('C1', forkScope).ArtifactViewerScope).toBe(forkScope);
  });

  it('is Main when no chat area is rendered or its scope is of another conversation', () => {
    expect(workspace('c1', undefined).ArtifactViewerScope).toEqual(ConversationEngine.TrunkScope('c1'));
    expect(workspace('c2', forkScope).ArtifactViewerScope).toEqual(ConversationEngine.TrunkScope('c2'));
  });
});
