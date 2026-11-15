import { describe, expect, it } from 'vitest';
import type {
  ContextMenuActionItem,
  ContextMenuItem,
  ContextMenuSubmenuItem,
} from '../../context-menu/context-menu.types';
import type { DocumentBlockSpec } from '@memberjunction/core-entities';
import type {
  DocumentOutlineItem,
  DocumentRenderSegment,
  DocumentSuggestionItem,
} from '../../../services/document-collaboration.service';
import {
  BuildDocsContextMenu,
  type DocsContextMenuCommand,
  type DocsContextMenuSnapshot,
} from './docs-context-menu.helper';

function findItem(
  items: ReadonlyArray<ContextMenuItem<DocsContextMenuCommand>>,
  id: string,
): ContextMenuItem<DocsContextMenuCommand> | undefined {
  for (const item of items) {
    if (item.ID === id) {
      return item;
    }
    if (item.Kind === 'submenu') {
      const nested = findItem(item.Children, id);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function findAction(
  items: ReadonlyArray<ContextMenuItem<DocsContextMenuCommand>>,
  id: string,
): ContextMenuActionItem<DocsContextMenuCommand> | undefined {
  const item = findItem(items, id);
  return item?.Kind === 'action' ? item : undefined;
}

function findSubmenu(
  items: ReadonlyArray<ContextMenuItem<DocsContextMenuCommand>>,
  id: string,
): ContextMenuSubmenuItem<DocsContextMenuCommand> | undefined {
  const item = findItem(items, id);
  return item?.Kind === 'submenu' ? item : undefined;
}

function makeSegment(overrides: Partial<DocumentRenderSegment> = {}): DocumentRenderSegment {
  return {
    SegmentID: 'seg-1',
    Kind: 'markdown',
    BlockKind: 'paragraph',
    StartLine: 1,
    EndLine: 1,
    RawMarkdown: 'Hello collaborative world.',
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<DocsContextMenuSnapshot> = {}): DocsContextMenuSnapshot {
  const seg = makeSegment();
  return {
    ViewMode: 'edit',
    CanUserEdit: true,
    CanUserShareArtifact: true,
    IsSimpleNoteMode: false,
    IsAiAssistantEnabled: true,
    CommentsEnabled: true,
    SegmentCount: 3,
    SegmentIndex: 1,
    SegmentEditable: true,
    IsSegmentLocked: false,
    IsHeadingCollapsed: false,
    SelectedText: '',
    Target: { Kind: 'prose', Segment: seg },
    IsMac: true,
    ...overrides,
  };
}

describe('BuildDocsContextMenu', () => {
  it('builds Zone 2a prose menu in edit + block mode with Format Text, Turn Into, Structure, Review, and Delete', () => {
    const items = BuildDocsContextMenu(makeSnapshot({ SelectedText: 'collaborative' }));

    expect(findAction(items, 'cut')?.Disabled).toBe(false);
    expect(findAction(items, 'cut')?.Shortcut).toBe('⌘X');
    expect(findAction(items, 'copy')?.Shortcut).toBe('⌘C');
    expect(findAction(items, 'copy-markdown')?.Shortcut).toBe('⇧⌘C');
    expect(findAction(items, 'paste')?.Shortcut).toBe('⌘V');

    const formatSub = findSubmenu(items, 'format-text');
    expect(formatSub).toBeDefined();
    expect(findAction(items, 'format-bold')?.Command).toEqual({
      Type: 'format-text',
      Format: 'bold',
      SegmentID: 'seg-1',
    });
    expect(findAction(items, 'format-link')?.Shortcut).toBe('⌘K');

    const turnIntoSub = findSubmenu(items, 'turn-into');
    expect(turnIntoSub).toBeDefined();
    expect(findAction(items, 'turn-into-paragraph')?.Role).toBe('menuitemradio');
    expect(findAction(items, 'turn-into-paragraph')?.Checked).toBe(true);
    expect(findAction(items, 'turn-into-heading-2')?.Checked).toBe(false);

    expect(findAction(items, 'insert-block-above')).toBeDefined();
    expect(findAction(items, 'insert-block-below')).toBeDefined();
    expect(findAction(items, 'insert-slash-menu')?.Shortcut).toBe('/');
    expect(findAction(items, 'duplicate-block')?.Shortcut).toBe('⌘D');
    expect(findAction(items, 'move-block-up')?.Disabled).toBe(false);
    expect(findAction(items, 'move-block-down')?.Disabled).toBe(false);
    expect(findAction(items, 'add-comment')?.Command).toEqual({
      Type: 'add-comment',
      SegmentID: 'seg-1',
      SelectedText: 'collaborative',
    });
    expect(findAction(items, 'ask-ai')).toBeDefined();
    expect(findAction(items, 'delete-block')?.Destructive).toBe(true);
    expect(findAction(items, 'delete-block')?.Disabled).toBe(false);
  });

  it('uses Windows/Linux shortcut labels when IsMac is false', () => {
    const items = BuildDocsContextMenu(makeSnapshot({ IsMac: false }));
    expect(findAction(items, 'cut')?.Shortcut).toBe('Ctrl+X');
    expect(findAction(items, 'copy')?.Shortcut).toBe('Ctrl+C');
    expect(findAction(items, 'copy-markdown')?.Shortcut).toBe('Ctrl+Shift+C');
    expect(findAction(items, 'move-block-up')?.Shortcut).toBe('Alt+↑');
    expect(findAction(items, 'delete-block')?.Shortcut).toBe('Del');
  });

  it('places Propose Tracked Suggestion prominently at the top in Suggest mode', () => {
    const items = BuildDocsContextMenu(makeSnapshot({ ViewMode: 'suggest' }));
    expect(items[0].Kind).toBe('header');
    expect(items[1].ID).toBe('propose-suggestion');
    const allSuggestItems = items.filter((i) => i.ID === 'propose-suggestion');
    expect(allSuggestItems).toHaveLength(1);
  });

  it('omits block-studio structure actions in IsSimpleNoteMode', () => {
    const items = BuildDocsContextMenu(makeSnapshot({ IsSimpleNoteMode: true }));
    expect(findSubmenu(items, 'format-text')).toBeDefined();
    expect(findSubmenu(items, 'turn-into')).toBeUndefined();
    expect(findAction(items, 'insert-block-above')).toBeUndefined();
    expect(findAction(items, 'duplicate-block')).toBeUndefined();
    expect(findAction(items, 'delete-block')).toBeUndefined();
  });

  it('handles heading lock governance: disables Lock toggle for non-owners and disables edits on locked sections', () => {
    const headingSeg = makeSegment({
      SegmentID: 'heading-1',
      BlockKind: 'heading',
      HeadingLevel: 2,
      HeadingText: 'Locked Section',
      RawMarkdown: '## Locked Section',
    });

    const nonOwnerItems = BuildDocsContextMenu(
      makeSnapshot({
        CanUserShareArtifact: false,
        SegmentEditable: false,
        IsSegmentLocked: true,
        Target: { Kind: 'prose', Segment: headingSeg },
      }),
    );

    const lockBtn = findAction(nonOwnerItems, 'toggle-heading-lock');
    expect(lockBtn?.Label).toBe('Unlock Section');
    expect(lockBtn?.Disabled).toBe(true);
    expect(lockBtn?.DisabledReason).toContain('Only artifact owners');

    const cutBtn = findAction(nonOwnerItems, 'cut');
    expect(cutBtn?.Disabled).toBe(true);
    expect(cutBtn?.DisabledReason).toContain('Locked by owner');

    const formatSub = findSubmenu(nonOwnerItems, 'format-text');
    expect(formatSub?.Disabled).toBe(true);

    const deleteBtn = findAction(nonOwnerItems, 'delete-block');
    expect(deleteBtn?.Disabled).toBe(true);
  });

  it('disables Move Up at top, Move Down at bottom, and Delete Block when SegmentCount <= 1', () => {
    const firstOnlyItems = BuildDocsContextMenu(
      makeSnapshot({ SegmentIndex: 0, SegmentCount: 1 }),
    );
    expect(findAction(firstOnlyItems, 'move-block-up')?.Disabled).toBe(true);
    expect(findAction(firstOnlyItems, 'move-block-down')?.Disabled).toBe(true);
    expect(findAction(firstOnlyItems, 'delete-block')?.Disabled).toBe(true);
    expect(findAction(firstOnlyItems, 'delete-block')?.DisabledReason).toContain('at least 1 block');
  });

  it('includes Callout Style submenu on callout blocks and Copy Code on code blocks (omitting Format Text on code)', () => {
    const calloutSeg = makeSegment({
      SegmentID: 'callout-1',
      BlockKind: 'callout',
      RawMarkdown: '> [!WARNING]\n> Watch out',
    });
    const calloutItems = BuildDocsContextMenu(
      makeSnapshot({
        Target: { Kind: 'prose', Segment: calloutSeg, CurrentCalloutType: 'WARNING' },
      }),
    );
    expect(findSubmenu(calloutItems, 'callout-style')).toBeDefined();
    expect(findAction(calloutItems, 'callout-style-warning')?.Checked).toBe(true);
    expect(findAction(calloutItems, 'callout-style-note')?.Checked).toBe(false);

    const codeSeg = makeSegment({
      SegmentID: 'code-1',
      BlockKind: 'code',
      RawMarkdown: '```ts\nconst x = 1;\n```',
    });
    const codeItems = BuildDocsContextMenu(
      makeSnapshot({
        Target: { Kind: 'prose', Segment: codeSeg, HasCodeContent: true },
      }),
    );
    expect(findAction(codeItems, 'copy-code')?.Disabled).toBe(false);
    expect(findSubmenu(codeItems, 'format-text')).toBeUndefined();
  });

  it('builds Zone 2b table menu for header vs body row, alignment radio state, min-row/col guards, and viewer mode', () => {
    const tableSeg = makeSegment({
      SegmentID: 'table-1',
      BlockKind: 'table',
      RawMarkdown: '| Name | Score |\n| :--- | ---: |\n| Alice | 95 |',
    });

    const headerItems = BuildDocsContextMenu(
      makeSnapshot({
        Target: {
          Kind: 'table',
          Segment: tableSeg,
          RowIndex: 0,
          ColIndex: 1,
          IsHeaderRow: true,
          TableHeadersCount: 2,
          TableBodyRowCount: 1,
          ColumnAlignment: 'right',
          CellText: 'Score',
        },
      }),
    );
    expect(findAction(headerItems, 'table-insert-row-above')).toBeUndefined();
    expect(findAction(headerItems, 'table-delete-row')).toBeUndefined();
    expect(findAction(headerItems, 'table-insert-row-below')).toBeDefined();
    expect(findAction(headerItems, 'table-align-right')?.Checked).toBe(true);
    expect(findSubmenu(headerItems, 'table-sort-col')).toBeUndefined();

    const bodySingleRowItems = BuildDocsContextMenu(
      makeSnapshot({
        Target: {
          Kind: 'table',
          Segment: tableSeg,
          RowIndex: 0,
          ColIndex: 0,
          IsHeaderRow: false,
          TableHeadersCount: 1,
          TableBodyRowCount: 1,
          ColumnAlignment: 'left',
          CellText: 'Alice',
        },
      }),
    );
    expect(findAction(bodySingleRowItems, 'table-insert-row-above')).toBeDefined();
    expect(findAction(bodySingleRowItems, 'table-delete-row')?.Disabled).toBe(true);
    expect(findAction(bodySingleRowItems, 'table-delete-col')?.Disabled).toBe(true);

    const viewerTableItems = BuildDocsContextMenu(
      makeSnapshot({
        ViewMode: 'preview',
        CanUserEdit: false,
        SegmentEditable: false,
        Target: {
          Kind: 'table',
          Segment: tableSeg,
          RowIndex: 1,
          ColIndex: 0,
          IsHeaderRow: false,
          TableHeadersCount: 2,
          TableBodyRowCount: 2,
          ColumnAlignment: 'none',
          CellText: 'Bob',
        },
      }),
    );
    expect(findAction(viewerTableItems, 'table-insert-row-below')).toBeUndefined();
    expect(findAction(viewerTableItems, 'delete-block')).toBeUndefined();
    expect(findAction(viewerTableItems, 'preview-switch-to-write')).toBeUndefined();
    expect(findAction(viewerTableItems, 'table-copy-cell')).toBeDefined();
    expect(findSubmenu(viewerTableItems, 'table-copy-as')).toBeDefined();
  });

  it('builds Zone 2c live data block menu for Live vs Frozen states and record-link cells', () => {
    const liveBlock: DocumentBlockSpec = {
      BlockID: 'blk-live-1',
      Kind: 'EntityView',
      Mode: 'Live',
      Title: 'Active Projects',
      EntityName: 'MJ: Projects',
    };
    const liveSeg = makeSegment({
      SegmentID: 'blk-live-1',
      Kind: 'mj-block',
      BlockKind: 'mj-block',
      Descriptor: liveBlock,
    });

    const liveItems = BuildDocsContextMenu(
      makeSnapshot({
        Target: {
          Kind: 'live-block',
          Segment: liveSeg,
          Block: liveBlock,
          HasResultRows: true,
          IsCollapsed: false,
          RecordLinkContext: {
            ColumnName: 'Name',
            TargetEntityName: 'MJ: Projects',
            RowIndex: 0,
          },
        },
      }),
    );
    expect(findAction(liveItems, 'live-block-open-record')).toBeDefined();
    expect(findAction(liveItems, 'live-block-refresh')).toBeDefined();
    expect(findAction(liveItems, 'live-block-toggle-freeze')?.Label).toBe('Freeze Snapshot…');
    expect(findAction(liveItems, 'live-block-copy-csv')).toBeDefined();
    expect(findAction(liveItems, 'live-block-copy-json')).toBeDefined();

    const frozenBlock: DocumentBlockSpec = { ...liveBlock, Mode: 'Frozen' };
    const frozenItems = BuildDocsContextMenu(
      makeSnapshot({
        Target: {
          Kind: 'live-block',
          Segment: liveSeg,
          Block: frozenBlock,
          HasResultRows: false,
          IsCollapsed: true,
        },
      }),
    );
    expect(findAction(frozenItems, 'live-block-refresh')).toBeUndefined();
    expect(findAction(frozenItems, 'live-block-toggle-freeze')?.Label).toBe('Switch to Live Mode');
    expect(findAction(frozenItems, 'live-block-copy-csv')).toBeUndefined();
    expect(findAction(frozenItems, 'live-block-toggle-collapse')?.Label).toBe('Expand Card');
  });

  it('builds Zone 2c embedded OLE artifact menu with newer version update and pin toggle', () => {
    const oleBlock: DocumentBlockSpec = {
      BlockID: 'blk-wb-1',
      Kind: 'Artifact',
      Mode: 'Live',
      ArtifactID: 'wb-1',
      ArtifactType: 'Whiteboard',
      VersionID: 'ver-1',
      EmbedMode: 'Inline',
    };
    const oleSeg = makeSegment({
      SegmentID: 'blk-wb-1',
      Kind: 'mj-block',
      BlockKind: 'mj-block',
      Descriptor: oleBlock,
    });

    const editItems = BuildDocsContextMenu(
      makeSnapshot({
        Target: {
          Kind: 'embedded-artifact',
          Segment: oleSeg,
          Block: oleBlock,
          IsCollapsed: false,
          IsInlineEditing: true,
          CanInlineEdit: true,
          IsFullScreen: false,
          NewerVersionNumber: 4,
        },
      }),
    );
    expect(findAction(editItems, 'ole-toggle-inline-edit')?.Label).toBe('Finish Inline Edit');
    expect(findAction(editItems, 'ole-open-source')?.Command).toEqual({
      Type: 'ole-open-source',
      ArtifactID: 'wb-1',
    });
    expect(findAction(editItems, 'ole-update-latest')?.Label).toBe('Update to Latest Version (v4)');
    expect(findAction(editItems, 'ole-toggle-pin')?.Label).toBe('Follow Latest Version');

    const viewerItems = BuildDocsContextMenu(
      makeSnapshot({
        ViewMode: 'preview',
        CanUserEdit: false,
        SegmentEditable: false,
        Target: {
          Kind: 'embedded-artifact',
          Segment: oleSeg,
          Block: { ...oleBlock, VersionID: null },
          IsCollapsed: false,
          IsInlineEditing: false,
          CanInlineEdit: false,
          IsFullScreen: true,
          NewerVersionNumber: null,
        },
      }),
    );
    expect(findAction(viewerItems, 'ole-toggle-inline-edit')).toBeUndefined();
    expect(findAction(viewerItems, 'ole-update-latest')).toBeUndefined();
    expect(findAction(viewerItems, 'ole-toggle-pin')).toBeUndefined();
    expect(findAction(viewerItems, 'ole-toggle-fullscreen')?.Label).toBe('Exit Full Screen');
    expect(findAction(viewerItems, 'ole-open-source')).toBeDefined();
  });

  it('builds Zone 2d preview prose, suggestion card, and outline rail menus', () => {
    const headingSeg = makeSegment({
      SegmentID: 'h-intro',
      BlockKind: 'heading',
      HeadingLevel: 1,
      HeadingText: 'Introduction',
      RawMarkdown: '# Introduction',
    });

    const previewItems = BuildDocsContextMenu(
      makeSnapshot({
        ViewMode: 'preview',
        CanUserEdit: true,
        SelectedText: 'Intro',
        Target: {
          Kind: 'preview-prose',
          Segment: headingSeg,
          LinkUrl: 'https://memberjunction.org',
          ImageUrl: 'https://memberjunction.org/logo.png',
        },
      }),
    );
    expect(findAction(previewItems, 'preview-copy-selection')).toBeDefined();
    expect(findAction(previewItems, 'preview-copy-link')).toBeDefined();
    expect(findAction(previewItems, 'preview-open-link')).toBeDefined();
    expect(findAction(previewItems, 'preview-copy-image')).toBeDefined();
    expect(findAction(previewItems, 'preview-copy-anchor')).toBeDefined();
    expect(findAction(previewItems, 'preview-switch-to-write')).toBeDefined();

    const suggestion: DocumentSuggestionItem = {
      SuggestionID: 'sug-1',
      BlockID: 'seg-1',
      OriginalMarkdown: 'Old text',
      ProposedMarkdown: 'New text',
      Rationale: 'Clarify',
      AuthorName: 'Reviewer',
      CreatedAt: '2026-01-01T00:00:00Z',
      Status: 'Pending',
    };
    const sugItems = BuildDocsContextMenu(
      makeSnapshot({
        Target: { Kind: 'suggestion-card', Suggestion: suggestion },
      }),
    );
    expect(findAction(sugItems, 'suggestion-accept')).toBeDefined();
    expect(findAction(sugItems, 'suggestion-reject')?.Destructive).toBe(true);
    expect(findAction(sugItems, 'suggestion-jump')).toBeDefined();
    expect(findAction(sugItems, 'suggestion-copy-proposed')).toBeDefined();

    const outlineItem: DocumentOutlineItem = {
      ID: 'h-intro',
      Kind: 'heading',
      Level: 1,
      Title: 'Introduction',
      StartLine: 1,
    };
    const outlineItems = BuildDocsContextMenu(
      makeSnapshot({
        Target: {
          Kind: 'outline-item',
          OutlineItem: outlineItem,
          TargetSegment: headingSeg,
          TargetSegmentIndex: 0,
        },
      }),
    );
    expect(findAction(outlineItems, 'outline-jump')).toBeDefined();
    expect(findAction(outlineItems, 'toggle-heading-collapse')).toBeDefined();
    expect(findAction(outlineItems, 'toggle-heading-lock')).toBeDefined();
    expect(findAction(outlineItems, 'move-block-up')?.Disabled).toBe(true);
    expect(findAction(outlineItems, 'move-block-down')?.Disabled).toBe(false);
  });

  it('disables all 6 prose structure items and outline moves when SegmentEditable is false, and gates toggle-heading-lock on IsArtifactOwner', () => {
    const lockedSeg = makeSegment({ SegmentID: 'seg-locked', BlockKind: 'paragraph', RawMarkdown: 'Locked body' });
    const headingSeg = makeSegment({
      SegmentID: 'h-locked',
      BlockKind: 'heading',
      HeadingLevel: 2,
      HeadingText: 'Protected Section',
      RawMarkdown: '## Protected Section <!-- mj-lock:owner-1 -->',
    });

    const lockedProseItems = BuildDocsContextMenu(
      makeSnapshot({
        ViewMode: 'edit',
        CanUserEdit: true,
        CanUserShareArtifact: true,
        IsArtifactOwner: false,
        SegmentCount: 3,
        SegmentIndex: 1,
        SegmentEditable: false,
        IsSegmentLocked: true,
        Target: { Kind: 'prose', Segment: lockedSeg },
      }),
    );
    for (const id of [
      'insert-block-above',
      'insert-block-below',
      'insert-slash-menu',
      'duplicate-block',
      'move-block-up',
      'move-block-down',
    ]) {
      expect(findAction(lockedProseItems, id)?.Disabled).toBe(true);
    }

    const nonOwnerHeadingItems = BuildDocsContextMenu(
      makeSnapshot({
        ViewMode: 'edit',
        CanUserEdit: true,
        CanUserShareArtifact: true,
        IsArtifactOwner: false,
        SegmentCount: 3,
        SegmentIndex: 1,
        SegmentEditable: false,
        IsSegmentLocked: true,
        Target: { Kind: 'prose', Segment: headingSeg },
      }),
    );
    expect(findAction(nonOwnerHeadingItems, 'toggle-heading-lock')?.Disabled).toBe(true);

    const outlineItem: DocumentOutlineItem = {
      ID: 'h-locked',
      Kind: 'heading',
      Level: 2,
      Title: 'Protected Section',
      StartLine: 1,
    };
    const lockedOutlineItems = BuildDocsContextMenu(
      makeSnapshot({
        ViewMode: 'edit',
        CanUserEdit: true,
        CanUserShareArtifact: true,
        IsArtifactOwner: false,
        SegmentCount: 3,
        SegmentIndex: 1,
        SegmentEditable: false,
        IsSegmentLocked: true,
        Target: {
          Kind: 'outline-item',
          OutlineItem: outlineItem,
          TargetSegment: headingSeg,
          TargetSegmentIndex: 1,
        },
      }),
    );
    expect(findAction(lockedOutlineItems, 'move-block-up')?.Disabled).toBe(true);
    expect(findAction(lockedOutlineItems, 'move-block-down')?.Disabled).toBe(true);
    expect(findAction(lockedOutlineItems, 'toggle-heading-lock')?.Disabled).toBe(true);

    const ownerHeadingItems = BuildDocsContextMenu(
      makeSnapshot({
        ViewMode: 'edit',
        CanUserEdit: true,
        CanUserShareArtifact: true,
        IsArtifactOwner: true,
        SegmentCount: 3,
        SegmentIndex: 1,
        SegmentEditable: true,
        IsSegmentLocked: true,
        Target: { Kind: 'prose', Segment: headingSeg },
      }),
    );
    expect(findAction(ownerHeadingItems, 'toggle-heading-lock')?.Disabled).toBe(false);
  });
});
