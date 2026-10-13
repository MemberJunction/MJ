import type { SearchResult } from '@memberjunction/ng-conversations';

/**
 * Where a Chat search result opens.
 */
export type ChatSearchRoute =
  | { Kind: 'conversation'; ConversationId: string }
  | { Kind: 'artifact'; ArtifactId: string; Title: string }
  | { Kind: 'nav-item'; NavItemName: 'Collections' | 'Tasks'; Configuration: Record<string, string> };

/**
 * Maps a Chat search result to the surface that opens it.
 *
 * Conversations and messages open a conversation in the Chat resource itself. Artifacts open
 * directly, because an artifact need not belong to a collection or a conversation. Collections
 * and tasks open their own nav items. Returns null when the result has nothing to open.
 */
export function ResolveChatSearchRoute(result: SearchResult): ChatSearchRoute | null {
  switch (result.type) {
    case 'conversation':
      return { Kind: 'conversation', ConversationId: result.id };
    case 'message':
      return result.conversationId ? { Kind: 'conversation', ConversationId: result.conversationId } : null;
    case 'artifact':
      return { Kind: 'artifact', ArtifactId: result.id, Title: result.title };
    case 'collection':
      return { Kind: 'nav-item', NavItemName: 'Collections', Configuration: { collectionId: result.id } };
    case 'task':
      return { Kind: 'nav-item', NavItemName: 'Tasks', Configuration: { taskId: result.id } };
    default:
      return null;
  }
}
