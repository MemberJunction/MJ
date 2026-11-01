import { UUIDsEqual } from '@memberjunction/global';
import { IsInheritingFolderAccess, type ConversationEngine } from '@memberjunction/core-entities';
import type { ConfirmDialogOptions } from '../services/dialog.service';

/**
 * Asks before conversations move into a folder that shares them, and returns whether the move may go ahead.
 *
 * A Shared or Public folder lists a conversation for everyone it is shared with only when the conversation
 * inherits its folder's access, which its owner turns on (it is off by default). So only a move of an
 * inheriting conversation into a Shared or Public folder publishes it and asks. A move into a Private folder,
 * out of all folders (`projectId` null), or of conversations that do not inherit needs no question.
 * Every move path (the conversation list and the chat header's folder picker) asks through this.
 */
export async function ConfirmMoveIntoFolder(
    dialog: { confirm(options: ConfirmDialogOptions): Promise<boolean> },
    engine: Pick<ConversationEngine, 'GetProjectVisibilityTier' | 'Projects'>,
    projectId: string | null,
    conversations: ReadonlyArray<{ AdditionalData?: string | null } | null | undefined>,
): Promise<boolean> {
    const inheriting = conversations.filter((c) => IsInheritingFolderAccess(c)).length;
    if (!projectId || inheriting === 0 || engine.GetProjectVisibilityTier(projectId) === 'Private') {
        return true;
    }
    const folder = engine.Projects.find((p) => UUIDsEqual(p.ID, projectId));
    const what = inheriting === 1 ? 'this conversation' : `these ${inheriting} conversations`;
    return dialog.confirm({
        title: 'Move into a shared folder?',
        message: `People with access to "${folder?.Name ?? 'this folder'}" will see ${what}.`,
        okText: 'Move',
    });
}
