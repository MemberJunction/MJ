import type { MJConversationDetailEntity } from '@memberjunction/core-entities';
import { IndexByUUID, UUIDMap, UUIDsEqual } from '@memberjunction/global';

/**
 * Minimal shape of a conversation message needed to determine whether it is a
 * thread reply and which top-level message is its thread root.
 */
export interface ThreadReplyRow {
  readonly ID: MJConversationDetailEntity['ID'];
  readonly ParentID: MJConversationDetailEntity['ParentID'];
  readonly Role: MJConversationDetailEntity['Role'] | null;
}

/**
 * Payload emitted when the chat area scrolls to the top-level root of a
 * collapsed thread reply so the host can open the thread and reveal the reply.
 */
export interface ThreadReplyRevealRequest {
  readonly ReplyID: string;
  readonly RootID: string;
}

/**
 * Maps each thread reply's ID to its top-level root's ID. Rows that belong in
 * the main conversation flow are omitted from the returned {@link UUIDMap}.
 *
 * Rules:
 * - A person's row (`Role === 'User'`) with a `ParentID` is a thread reply,
 *   even when its parent is not in `rows` (so paging older rows in never flips
 *   a visible row to hidden).
 * - Any row whose parent is a thread reply belongs to the same thread root.
 * - Any non-person row (`AI` or `Error`) whose parent is a top-level row stays
 *   in the main flow (agent turns stamp `ParentID` to the prompt row).
 * - A non-person row whose parent is not loaded stays in the main flow.
 */
export function GetThreadReplyRoots(rows: readonly ThreadReplyRow[]): UUIDMap<string> {
  const byId = IndexByUUID(rows);
  const memo = new Map<ThreadReplyRow, string | null>();

  const resolveRoot = (row: ThreadReplyRow): string | null => {
    if (memo.has(row)) {
      return memo.get(row) ?? null;
    }
    memo.set(row, null);

    const parentId = row.ParentID;
    if (!parentId) {
      return null;
    }

    const parent = byId.Get(parentId);
    if (!parent) {
      // ponytail: a non-person row whose parent isn't loaded stays visible; if its parent later loads as a thread reply, it moves into that thread.
      const rootId = row.Role === 'User' ? parentId : null;
      memo.set(row, rootId);
      return rootId;
    }

    const parentRoot = resolveRoot(parent);
    const candidate = parentRoot ?? (row.Role === 'User' ? parent.ID : null);
    const rootId = candidate && !UUIDsEqual(candidate, row.ID) ? candidate : null;
    memo.set(row, rootId);
    return rootId;
  };

  const roots = new UUIDMap<string>();
  for (const row of rows) {
    const rootId = resolveRoot(row);
    if (rootId) {
      roots.Set(row.ID, rootId);
    }
  }
  return roots;
}
