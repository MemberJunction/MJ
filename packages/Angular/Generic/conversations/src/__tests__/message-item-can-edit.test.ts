import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MessageItemComponent } from '../lib/components/message/message-item.component';

/**
 * The edit pencil shows only on a message the server will let its viewer edit: the conversation's owner, on a
 * message they wrote. A grantee's message (its `UserID` is the grantee's) is refused by the server's authorship rule
 * even for the owner, so offering the pencil there could only end in a failed save.
 */
function canEdit(ownerID: string, viewerID: string, messageUserID: string | null): boolean {
  const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
  const open = component as unknown as Record<string, unknown>;
  open.Conversation = { UserID: ownerID };
  open.CurrentUser = { ID: viewerID };
  open.message = { UserID: messageUserID };
  return component.CanEditMessage;
}

describe('MessageItemComponent.CanEditMessage', () => {
  it("lets the owner edit their own message, with or without a UserID", () => {
    expect(canEdit('OWNER', 'owner', null)).toBe(true);
    expect(canEdit('OWNER', 'owner', 'Owner')).toBe(true);
  });

  it("hides the pencil on a message a grantee wrote, even for the owner", () => {
    expect(canEdit('OWNER', 'OWNER', 'GRANTEE')).toBe(false);
  });

  it('hides the pencil from anyone who does not own the conversation, as before', () => {
    expect(canEdit('OWNER', 'GRANTEE', 'GRANTEE')).toBe(false);
  });
});
