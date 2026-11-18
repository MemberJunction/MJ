/**
 * Keeping the chat's message list in order while agent replies start as unsaved placeholders.
 *
 * Only the server writes an agent's reply (A19): the chat shows an unsaved placeholder until the server acknowledges
 * the run, then gives the placeholder the server row's ID. Until then it has no creation time, and a refresh of the
 * conversation can already have brought the server's copy of the same row into the list.
 */
import { UUIDsEqual } from '@memberjunction/global';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';

/** Oldest first. A message with no creation time yet (an unsaved placeholder) is the newest, not the oldest. */
export function CompareMessagesByCreatedAt(a: MJConversationDetailEntity, b: MJConversationDetailEntity): number {
  return createdAtOf(a) - createdAtOf(b);
}

/**
 * The list with `message` in place of the first message that has its ID, and every other copy of that ID dropped (a
 * placeholder that just took the ID of a server row the list already holds), or with `message` appended when none has
 * it. Returns whether it was already there.
 */
export function UpsertMessageById(
  messages: MJConversationDetailEntity[],
  message: MJConversationDetailEntity
): { Messages: MJConversationDetailEntity[]; Existed: boolean } {
  const index = messages.findIndex((m) => UUIDsEqual(m.ID, message.ID));
  if (index < 0) {
    return { Messages: [...messages, message], Existed: false };
  }
  const updated = messages
    .map((m, i) => (i === index ? message : m))
    .filter((m, i) => i === index || !UUIDsEqual(m.ID, message.ID));
  return { Messages: updated, Existed: true };
}

function createdAtOf(message: MJConversationDetailEntity): number {
  return message.__mj_CreatedAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
}
