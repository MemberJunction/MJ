import { WhiteboardItem } from './whiteboard-state';

/**
 * LIVE WHITEBOARD — right-click CONTEXT MENU model (pure, Angular-free).
 *
 * {@link BuildWhiteboardContextMenu} derives the action list for a right-click target:
 * an ITEM menu (edit / restyle / duplicate / z-order / delete, gated per kind), the
 * delete-only HIGHLIGHT menu, or the EMPTY-CANVAS menu (click-point "add … here" actions
 * that reuse the board's existing placement paths). The board component renders the model
 * and dispatches the picked action; this module decides only WHAT is offered.
 */

/** Identifier of one context-menu action — the board's dispatcher switches on it. */
export type WhiteboardContextMenuActionID =
  | 'edit'
  | 'restyle'
  | 'duplicate'
  | 'bring-front'
  | 'send-back'
  | 'delete'
  | 'add-sticky'
  | 'add-text'
  | 'add-markdown'
  | 'add-html';

/** One entry of the rendered context menu. */
export interface WhiteboardContextMenuAction {
  ID: WhiteboardContextMenuActionID;
  Label: string;
  /** Font Awesome icon classes. */
  Icon: string;
  /** Render a divider line ABOVE this entry. */
  SeparatorBefore?: boolean;
  /** Destructive styling (delete). */
  Danger?: boolean;
}

/** Kinds whose dblclick opens an editor — the menu's Edit action mirrors that path. */
const EDITABLE_KINDS: ReadonlySet<WhiteboardItem['Kind']> = new Set(['sticky', 'shape', 'text', 'markdown', 'html']);
/** Kinds whose text styling the toolbar flyout can restyle. */
const RESTYLABLE_KINDS: ReadonlySet<WhiteboardItem['Kind']> = new Set(['sticky', 'text']);
/** Kinds that cannot be duplicated (connectors reference other items; highlights are transient). */
const NON_DUPLICABLE_KINDS: ReadonlySet<WhiteboardItem['Kind']> = new Set(['connector', 'highlight']);

/**
 * Build the context-menu model for a right-click target.
 *
 *  - `item === null` → empty-canvas menu: add sticky / text / markdown panel / widget
 *    at the click point (the board routes these through its existing placement paths);
 *  - highlight → Delete only (highlights are transient "pointing" chrome);
 *  - any other item → Edit (same path as dblclick; editable kinds only), Restyle…
 *    (text/sticky), Duplicate (not connectors/highlights), Bring to front / Send to
 *    back, and Delete.
 */
export function BuildWhiteboardContextMenu(item: WhiteboardItem | null): WhiteboardContextMenuAction[] {
  if (item === null) {
    return [
      { ID: 'add-sticky', Label: 'Add sticky note here', Icon: 'fa-regular fa-note-sticky' },
      { ID: 'add-text', Label: 'Add text here', Icon: 'fa-solid fa-font' },
      { ID: 'add-markdown', Label: 'Add markdown panel here', Icon: 'fa-brands fa-markdown' },
      { ID: 'add-html', Label: 'Add widget here', Icon: 'fa-solid fa-code' }
    ];
  }
  if (item.Kind === 'highlight') {
    return [{ ID: 'delete', Label: 'Delete', Icon: 'fa-solid fa-trash-can', Danger: true }];
  }
  const actions: WhiteboardContextMenuAction[] = [];
  if (EDITABLE_KINDS.has(item.Kind)) {
    actions.push({ ID: 'edit', Label: 'Edit', Icon: 'fa-solid fa-pen' });
  }
  if (RESTYLABLE_KINDS.has(item.Kind)) {
    actions.push({ ID: 'restyle', Label: 'Restyle…', Icon: 'fa-solid fa-palette' });
  }
  if (!NON_DUPLICABLE_KINDS.has(item.Kind)) {
    actions.push({ ID: 'duplicate', Label: 'Duplicate', Icon: 'fa-regular fa-clone' });
  }
  actions.push(
    { ID: 'bring-front', Label: 'Bring to front', Icon: 'fa-solid fa-arrow-up-from-bracket', SeparatorBefore: actions.length > 0 },
    { ID: 'send-back', Label: 'Send to back', Icon: 'fa-solid fa-arrow-down-long' },
    { ID: 'delete', Label: 'Delete', Icon: 'fa-solid fa-trash-can', Danger: true, SeparatorBefore: true }
  );
  return actions;
}
