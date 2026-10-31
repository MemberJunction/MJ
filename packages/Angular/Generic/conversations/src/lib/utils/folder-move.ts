import { UUIDsEqual } from '@memberjunction/global';
import type { ConversationEngine } from '@memberjunction/core-entities';
import type { ConfirmDialogOptions } from '../services/dialog.service';

/**
 * Asks before conversations move into a folder that shares them, and returns whether the move may go ahead.
 *
 * A Shared or Public folder lists the conversations in it for everyone it is shared with, so a move there
 * publishes them. A move into a Private folder, or out of all folders (`projectId` null), needs no question.
 * Every move path (the conversation list and the chat header's folder picker) asks through this.
 */
export async function ConfirmMoveIntoFolder(
    dialog: { confirm(options: ConfirmDialogOptions): Promise<boolean> },
    engine: Pick<ConversationEngine, 'GetProjectVisibilityTier' | 'Projects'>,
    projectId: string | null,
    conversationCount: number,
): Promise<boolean> {
    if (!projectId || engine.GetProjectVisibilityTier(projectId) === 'Private') {
        return true;
    }
    const folder = engine.Projects.find((p) => UUIDsEqual(p.ID, projectId));
    const what = conversationCount === 1 ? 'this conversation' : `these ${conversationCount} conversations`;
    return dialog.confirm({
        title: 'Move into a shared folder?',
        message: `People with access to "${folder?.Name ?? 'this folder'}" will see ${what}.`,
        okText: 'Move',
    });
}
