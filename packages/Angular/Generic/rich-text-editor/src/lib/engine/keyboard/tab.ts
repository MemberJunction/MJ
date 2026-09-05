import { EditingHost } from './host';

/**
 * Tab and Shift+Tab.
 *
 * Inside a list they change the item's nesting level. Anywhere else the event is left alone,
 * so Tab keeps its accessibility meaning and moves focus out of the editor — an editor that
 * traps Tab is an editor keyboard users cannot leave.
 *
 * Returns true when the event was consumed.
 */
export function handleTab(host: EditingHost, range: Range, shift: boolean): boolean {
    host.RemoveZeroWidthSpaces();
    host.SaveUndoState(range);
    if (!host.ChangeListLevel(range, shift ? -1 : 1)) {
        return false;
    }
    host.SetSelection(range);
    host.DocumentChanged();
    return true;
}
