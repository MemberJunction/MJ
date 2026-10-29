/**
 * Pinning a message on a fresh copy of its row.
 *
 * The chat's copy of an agent reply can carry streamed or local text that differs from the stored reply, and the
 * server refuses a person's save that changes a reply's content (A19), so a pin saved through that copy is refused.
 * Pinning loads the row as stored and changes only `IsPinned`, as the rating component does for its fields.
 */
import type { IMetadataProvider } from '@memberjunction/core';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

/** Saves `IsPinned` on the stored row; false when it can't be loaded or saved. */
export async function SavePinState(provider: IMetadataProvider, conversationDetailId: string, pinned: boolean): Promise<boolean> {
  const fresh = await provider.GetEntityObject<MJConversationDetailEntity>('MJ: Conversation Details');
  if (!(await fresh.Load(conversationDetailId))) return false;
  fresh.IsPinned = pinned;
  return fresh.Save();
}
