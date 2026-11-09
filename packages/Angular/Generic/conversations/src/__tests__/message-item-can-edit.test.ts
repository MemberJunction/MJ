import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import type { UserInfo } from '@memberjunction/core';
import type { MJConversationDetailEntity, MJConversationEntity } from '@memberjunction/core-entities';
import { MessageItemComponent } from '../lib/components/message/message-item.component';

/**
 * Edit shows only on a message the server will let its viewer edit. The server's authorship rule lets only the
 * author of a person's message change it, so offering Edit to anyone else, the conversation's owner included, could
 * only end in a failed save.
 */
function canEdit(ownerID: string, viewerID: string, messageUserID: string | null): boolean {
  const component = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
  component.AllowMessageEdit = true;
  component.Conversation = { UserID: ownerID } as MJConversationEntity;
  component.CurrentUser = { ID: viewerID } as UserInfo;
  component.message = { Role: 'User', Status: 'Complete', UserID: messageUserID } as MJConversationDetailEntity;
  return component.CanEdit;
}

describe('MessageItemComponent.CanEdit (authorship)', () => {
  it('lets the owner edit their own message, in any case of their ID', () => {
    expect(canEdit('OWNER', 'owner', 'Owner')).toBe(true);
  });

  it('hides Edit on a message a grantee wrote, even from the owner', () => {
    expect(canEdit('OWNER', 'OWNER', 'GRANTEE')).toBe(false);
  });

  it("hides Edit on the owner's message from a grantee", () => {
    expect(canEdit('OWNER', 'GRANTEE', 'OWNER')).toBe(false);
    expect(canEdit('OWNER', 'GRANTEE', null)).toBe(false);
  });
});
