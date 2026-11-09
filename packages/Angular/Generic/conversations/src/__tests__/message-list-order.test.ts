import { describe, it, expect } from 'vitest';
import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { CompareMessagesByCreatedAt, UpsertMessageById } from '../lib/utils/message-list-order';

/**
 * An agent reply starts as an unsaved placeholder (only the server writes replies) and takes the server row's ID when
 * the run is acknowledged. A conversation refresh in between must neither send the placeholder to the top nor leave
 * the server's copy of the row beside it.
 */
function row(id: string, createdAt?: string): MJConversationDetailEntity {
  return { ID: id, __mj_CreatedAt: createdAt ? new Date(createdAt) : null } as unknown as MJConversationDetailEntity;
}

describe('CompareMessagesByCreatedAt', () => {
  it('puts a message with no creation time yet (an unsaved placeholder) last, not first', () => {
    const placeholder = row('local-1');
    const sorted = [placeholder, row('b', '2026-10-12T10:00:02Z'), row('a', '2026-10-12T10:00:01Z')].sort(CompareMessagesByCreatedAt);
    expect(sorted.map((m) => m.ID)).toEqual(['a', 'b', 'local-1']);
  });
});

describe('UpsertMessageById', () => {
  it('appends a message the list does not hold', () => {
    const result = UpsertMessageById([row('a')], row('b'));
    expect(result.Existed).toBe(false);
    expect(result.Messages.map((m) => m.ID)).toEqual(['a', 'b']);
  });

  it('replaces a message in place, matching its ID in any case', () => {
    const updated = row('ABC');
    const result = UpsertMessageById([row('x'), row('abc'), row('y')], updated);
    expect(result.Existed).toBe(true);
    expect(result.Messages).toEqual([row('x'), updated, row('y')]);
    expect(result.Messages[1]).toBe(updated);
  });

  it("keeps one row when a placeholder takes the ID of the server's copy a refresh already brought in", () => {
    const serverCopy = row('server-1', '2026-10-12T10:00:01Z');
    const placeholder = row('local-1');
    const list = [serverCopy, placeholder];
    (placeholder as unknown as { ID: string }).ID = 'server-1'; // adopted: same object, now the server's ID

    const result = UpsertMessageById(list, placeholder);
    expect(result.Messages).toEqual([placeholder]);
    expect(result.Messages[0]).toBe(placeholder);
  });
});
