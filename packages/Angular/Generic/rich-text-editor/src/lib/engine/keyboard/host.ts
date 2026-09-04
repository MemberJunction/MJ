import { DefaultBlockSpec } from '../node/block';
import { BlockTransform, TagAttributeTable } from '../format/block';
import { InlineFormat } from '../format/inline';

/**
 * What a key handler is allowed to ask of the editor.
 *
 * The handlers are written against this interface rather than the engine class so they can
 * be exercised with a hand-rolled host in tests, and so the dependency points one way:
 * the engine implements the host, the keyboard layer never imports the engine.
 */
export interface EditingHost {
    readonly Root: HTMLElement;
    readonly BlockSpec: DefaultBlockSpec;
    readonly TagAttributes: TagAttributeTable | undefined;
    /** Whether typing a space after a bare URL should turn it into a link. */
    readonly AddLinks: boolean;

    GetSelection(): Range;
    SetSelection(range: Range): void;

    /** Record the current document before a mutation, so it can be undone. */
    SaveUndoState(range?: Range): void;
    /** A command has mutated the document: mark undo dirty and notify listeners. */
    DocumentChanged(): void;
    /** Repair the structure around the caret once the browser has finished a native delete. */
    ScheduleAfterNativeDelete(): void;
    /** Sweep caret ballast the engine inserted earlier. */
    RemoveZeroWidthSpaces(): void;

    ModifyBlocks(transform: BlockTransform, range: Range): void;
    /** Nest (+1) or lift (-1) the list items the range spans, in place. False outside a list. */
    ChangeListLevel(range: Range, delta: 1 | -1): boolean;
    ToggleFormat(format: InlineFormat): void;
    Undo(): void;
    Redo(): void;
}
