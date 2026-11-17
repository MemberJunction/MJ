import {
  ContextMenuCommandBase,
  ContextMenuItem,
} from '../../context-menu/context-menu.types';
import {
  FormatMenuShortcut,
  NormalizeContextMenuItems,
} from '../../context-menu/context-menu-position.util';
import type { DocumentBlockSpec } from '@memberjunction/core-entities';
import type {
  DocumentOutlineItem,
  DocumentRenderSegment,
  DocumentSuggestionItem,
} from '../../../services/document-collaboration.service';

export type DocsTableAlignment = 'left' | 'center' | 'right' | 'none';
export type DocsCalloutType = 'NOTE' | 'TIP' | 'IMPORTANT' | 'WARNING' | 'CAUTION';
export type DocsFormatSnippetKind = 'bold' | 'italic' | 'strikethrough' | 'inline-code' | 'link';
export type DocsBlockConvertTarget =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'bullet-list'
  | 'ordered-list'
  | 'task-list'
  | 'callout'
  | 'code';
export type DocsViewModeSnapshot = 'edit' | 'suggest' | 'preview' | 'source' | 'diff';

/**
 * Strongly-typed discriminated union of all MJ Docs context menu commands.
 */
export type DocsContextMenuCommand =
  | {
      readonly Type: 'clipboard';
      Action: 'cut' | 'copy-rich' | 'copy-markdown' | 'copy-code' | 'paste';
      SegmentID: string;
    }
  | {
      readonly Type: 'format-text';
      Format: DocsFormatSnippetKind;
      SegmentID: string;
    }
  | {
      readonly Type: 'turn-into';
      Target: DocsBlockConvertTarget;
      SegmentID: string;
    }
  | {
      readonly Type: 'callout-style';
      CalloutType: DocsCalloutType;
      SegmentID: string;
    }
  | {
      readonly Type: 'insert-block';
      Placement: 'above' | 'below' | 'slash';
      SegmentID: string;
    }
  | {
      readonly Type: 'duplicate-block';
      SegmentID: string;
    }
  | {
      readonly Type: 'move-block';
      Direction: -1 | 1;
      SegmentID: string;
    }
  | {
      readonly Type: 'delete-block';
      SegmentID: string;
    }
  | {
      readonly Type: 'toggle-heading-collapse';
      SegmentID: string;
    }
  | {
      readonly Type: 'toggle-heading-lock';
      SegmentID: string;
    }
  | {
      readonly Type: 'add-comment';
      SegmentID: string;
      SelectedText?: string;
    }
  | {
      readonly Type: 'propose-suggestion';
      SegmentID: string;
    }
  | {
      readonly Type: 'ask-ai';
      SegmentID: string;
    }
  | {
      readonly Type: 'table-insert-row';
      Placement: 'above' | 'below';
      SegmentID: string;
      RowIndex: number;
      IsHeaderRow: boolean;
    }
  | {
      readonly Type: 'table-delete-row';
      SegmentID: string;
      RowIndex: number;
    }
  | {
      readonly Type: 'table-insert-col';
      Placement: 'left' | 'right';
      SegmentID: string;
      ColIndex: number;
    }
  | {
      readonly Type: 'table-delete-col';
      SegmentID: string;
      ColIndex: number;
    }
  | {
      readonly Type: 'table-align-col';
      SegmentID: string;
      ColIndex: number;
      Alignment: 'left' | 'center' | 'right';
    }
  | {
      readonly Type: 'table-sort-col';
      SegmentID: string;
      ColIndex: number;
      Direction: 'asc' | 'desc';
    }
  | {
      readonly Type: 'table-copy-cell';
      SegmentID: string;
      RowIndex: number;
      ColIndex: number;
      IsHeaderRow: boolean;
    }
  | {
      readonly Type: 'table-copy-as';
      SegmentID: string;
      Format: 'markdown' | 'csv' | 'tsv';
    }
  | {
      readonly Type: 'live-block-refresh';
      BlockID: string;
    }
  | {
      readonly Type: 'live-block-configure';
      BlockID: string;
    }
  | {
      readonly Type: 'live-block-open-record';
      BlockID: string;
      ColumnName: string;
      RowIndex: number;
    }
  | {
      readonly Type: 'live-block-toggle-freeze';
      BlockID: string;
      Action: 'freeze' | 'unfreeze';
    }
  | {
      readonly Type: 'live-block-copy-csv';
      BlockID: string;
    }
  | {
      readonly Type: 'live-block-copy-json';
      BlockID: string;
    }
  | {
      readonly Type: 'live-block-toggle-collapse';
      BlockID: string;
    }
  | {
      readonly Type: 'ole-toggle-inline-edit';
      BlockID: string;
    }
  | {
      readonly Type: 'ole-toggle-fullscreen';
      BlockID: string;
    }
  | {
      readonly Type: 'ole-open-source';
      ArtifactID: string;
    }
  | {
      readonly Type: 'ole-update-latest';
      BlockID: string;
    }
  | {
      readonly Type: 'ole-toggle-pin';
      BlockID: string;
    }
  | {
      readonly Type: 'preview-copy-selection';
      SelectedText: string;
    }
  | {
      readonly Type: 'preview-copy-link';
      Url: string;
    }
  | {
      readonly Type: 'preview-open-link';
      Url: string;
    }
  | {
      readonly Type: 'preview-copy-image';
      Url: string;
    }
  | {
      readonly Type: 'preview-copy-anchor';
      AnchorKey: string;
    }
  | {
      readonly Type: 'preview-switch-to-write';
      SegmentID: string;
    }
  | {
      readonly Type: 'suggestion-accept';
      SuggestionID: string;
    }
  | {
      readonly Type: 'suggestion-reject';
      SuggestionID: string;
    }
  | {
      readonly Type: 'suggestion-jump';
      AnchorKey: string;
    }
  | {
      readonly Type: 'suggestion-copy-proposed';
      SuggestionID: string;
    }
  | {
      readonly Type: 'outline-jump';
      ItemID: string;
    };

/**
 * Compile-time verification that DocsContextMenuCommand satisfies ContextMenuCommandBase.
 */
type _VerifyCommandBase = DocsContextMenuCommand extends ContextMenuCommandBase ? true : never;
const _VERIFY_COMMAND_BASE: _VerifyCommandBase = true;
void _VERIFY_COMMAND_BASE;

export interface DocsLiveRecordLinkContext {
  ColumnName: string;
  TargetEntityName: string;
  RowIndex: number;
}

export type DocsContextTarget =
  | {
      Kind: 'prose';
      Segment: DocumentRenderSegment;
      CurrentCalloutType?: DocsCalloutType;
      CurrentListKind?: 'bullet' | 'ordered' | 'task';
      HasCodeContent?: boolean;
    }
  | {
      Kind: 'table';
      Segment: DocumentRenderSegment;
      RowIndex: number;
      ColIndex: number;
      IsHeaderRow: boolean;
      TableHeadersCount: number;
      TableBodyRowCount: number;
      ColumnAlignment: DocsTableAlignment;
      CellText: string;
    }
  | {
      Kind: 'live-block';
      Segment: DocumentRenderSegment;
      Block: DocumentBlockSpec;
      HasResultRows: boolean;
      IsCollapsed: boolean;
      RecordLinkContext?: DocsLiveRecordLinkContext;
    }
  | {
      Kind: 'embedded-artifact';
      Segment: DocumentRenderSegment;
      Block: DocumentBlockSpec;
      IsCollapsed: boolean;
      IsInlineEditing: boolean;
      CanInlineEdit: boolean;
      IsFullScreen: boolean;
      NewerVersionNumber: number | null;
    }
  | {
      Kind: 'preview-prose';
      Segment: DocumentRenderSegment;
      LinkUrl?: string | null;
      ImageUrl?: string | null;
      IsInsidePre?: boolean;
      IsInsideTable?: boolean;
    }
  | {
      Kind: 'suggestion-card';
      Suggestion: DocumentSuggestionItem;
    }
  | {
      Kind: 'outline-item';
      OutlineItem: DocumentOutlineItem;
      TargetSegment: DocumentRenderSegment | null;
      TargetSegmentIndex: number;
    };

export interface DocsContextMenuSnapshot {
  ViewMode: DocsViewModeSnapshot;
  CanUserEdit: boolean;
  CanUserShareArtifact: boolean;
  IsArtifactOwner?: boolean;
  IsSimpleNoteMode: boolean;
  IsAiAssistantEnabled: boolean;
  CommentsEnabled: boolean;
  SegmentCount: number;
  SegmentIndex: number;
  SegmentEditable: boolean;
  IsSegmentLocked: boolean;
  IsHeadingCollapsed: boolean;
  SelectedText: string;
  Target: DocsContextTarget;
  IsMac?: boolean;
}

const LOCKED_EDIT_REASON = 'Locked by owner — you do not have permission to edit this section';
const OWNER_ONLY_LOCK_REASON = 'Only artifact owners can lock or unlock sections';
const MIN_BLOCK_DELETE_REASON = 'A document must keep at least 1 block';

function isInteractiveMode(ctx: DocsContextMenuSnapshot): boolean {
  return ctx.CanUserEdit && (ctx.ViewMode === 'edit' || ctx.ViewMode === 'suggest');
}

function getEditLockReason(ctx: DocsContextMenuSnapshot): string | undefined {
  if (!ctx.SegmentEditable) {
    return ctx.IsSegmentLocked ? LOCKED_EDIT_REASON : 'Editing is disabled';
  }
  return undefined;
}

function resolveCurrentBlockConvertTarget(
  seg: DocumentRenderSegment,
  listKind?: 'bullet' | 'ordered' | 'task',
): DocsBlockConvertTarget {
  switch (seg.BlockKind) {
    case 'heading': {
      const level = seg.HeadingLevel ?? 1;
      if (level === 1) return 'heading-1';
      if (level === 2) return 'heading-2';
      return 'heading-3';
    }
    case 'list': {
      if (listKind === 'ordered') return 'ordered-list';
      if (listKind === 'task') return 'task-list';
      return 'bullet-list';
    }
    case 'callout':
      return 'callout';
    case 'code':
      return 'code';
    default:
      return 'paragraph';
  }
}

function buildProseMenu(
  ctx: DocsContextMenuSnapshot,
  target: Extract<DocsContextTarget, { Kind: 'prose' }>,
): ContextMenuItem<DocsContextMenuCommand>[] {
  const seg = target.Segment;
  if (!isInteractiveMode(ctx)) {
    return buildPreviewProseMenu(ctx, {
      Kind: 'preview-prose',
      Segment: seg,
      IsInsidePre: seg.BlockKind === 'code',
      IsInsideTable: seg.BlockKind === 'table',
    });
  }

  const items: ContextMenuItem<DocsContextMenuCommand>[] = [];
  const lockReason = getEditLockReason(ctx);
  const segLocked = !ctx.SegmentEditable;
  const hasSelection = ctx.SelectedText.trim().length > 0;
  const hasBlockContent = seg.RawMarkdown.trim().length > 0;
  const isSuggestMode = ctx.ViewMode === 'suggest';
  const currentConvertTarget = resolveCurrentBlockConvertTarget(seg, target.CurrentListKind);

  if (isSuggestMode) {
    items.push(
      { Kind: 'header', ID: 'hdr-suggest', Label: 'Suggest Mode' },
      {
        Kind: 'action',
        ID: 'propose-suggestion',
        Label: 'Propose Tracked Suggestion…',
        Icon: 'fa-solid fa-code-pull-request',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'propose-suggestion', SegmentID: seg.SegmentID },
      },
      { Kind: 'separator', ID: 'sep-suggest' },
    );
  }

  // Clipboard
  items.push(
    {
      Kind: 'action',
      ID: 'cut',
      Label: 'Cut',
      Icon: 'fa-solid fa-scissors',
      Shortcut: FormatMenuShortcut('⌘X', 'Ctrl+X', ctx.IsMac),
      Disabled: segLocked || (!hasSelection && !hasBlockContent),
      DisabledReason: lockReason ?? (!hasSelection && !hasBlockContent ? 'Nothing to cut in empty block' : undefined),
      Command: { Type: 'clipboard', Action: 'cut', SegmentID: seg.SegmentID },
    },
    {
      Kind: 'action',
      ID: 'copy',
      Label: 'Copy',
      Icon: 'fa-regular fa-copy',
      Shortcut: FormatMenuShortcut('⌘C', 'Ctrl+C', ctx.IsMac),
      Command: { Type: 'clipboard', Action: 'copy-rich', SegmentID: seg.SegmentID },
    },
    {
      Kind: 'action',
      ID: 'copy-markdown',
      Label: 'Copy Block as Markdown',
      Icon: 'fa-brands fa-markdown',
      Shortcut: FormatMenuShortcut('⇧⌘C', 'Ctrl+Shift+C', ctx.IsMac),
      Command: { Type: 'clipboard', Action: 'copy-markdown', SegmentID: seg.SegmentID },
    },
  );

  if (seg.BlockKind === 'code') {
    items.push({
      Kind: 'action',
      ID: 'copy-code',
      Label: 'Copy Code',
      Icon: 'fa-solid fa-code',
      Disabled: target.HasCodeContent === false,
      DisabledReason: target.HasCodeContent === false ? 'Code block is empty' : undefined,
      Command: { Type: 'clipboard', Action: 'copy-code', SegmentID: seg.SegmentID },
    });
  }

  items.push({
    Kind: 'action',
    ID: 'paste',
    Label: 'Paste',
    Icon: 'fa-regular fa-clipboard',
    Shortcut: FormatMenuShortcut('⌘V', 'Ctrl+V', ctx.IsMac),
    Disabled: segLocked,
    DisabledReason: lockReason,
    Command: { Type: 'clipboard', Action: 'paste', SegmentID: seg.SegmentID },
  });

  // Format Text submenu (non-code blocks)
  if (seg.BlockKind !== 'code') {
    items.push(
      { Kind: 'separator', ID: 'sep-format' },
      {
        Kind: 'submenu',
        ID: 'format-text',
        Label: 'Format Text',
        Icon: 'fa-solid fa-bold',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Children: [
          {
            Kind: 'action',
            ID: 'format-bold',
            Label: 'Bold',
            Icon: 'fa-solid fa-bold',
            Shortcut: FormatMenuShortcut('⌘B', 'Ctrl+B', ctx.IsMac),
            Command: { Type: 'format-text', Format: 'bold', SegmentID: seg.SegmentID },
          },
          {
            Kind: 'action',
            ID: 'format-italic',
            Label: 'Italic',
            Icon: 'fa-solid fa-italic',
            Shortcut: FormatMenuShortcut('⌘I', 'Ctrl+I', ctx.IsMac),
            Command: { Type: 'format-text', Format: 'italic', SegmentID: seg.SegmentID },
          },
          {
            Kind: 'action',
            ID: 'format-strikethrough',
            Label: 'Strikethrough',
            Icon: 'fa-solid fa-strikethrough',
            Command: { Type: 'format-text', Format: 'strikethrough', SegmentID: seg.SegmentID },
          },
          {
            Kind: 'action',
            ID: 'format-inline-code',
            Label: 'Inline Code',
            Icon: 'fa-solid fa-code',
            Shortcut: FormatMenuShortcut('⌘E', 'Ctrl+E', ctx.IsMac),
            Command: { Type: 'format-text', Format: 'inline-code', SegmentID: seg.SegmentID },
          },
          {
            Kind: 'action',
            ID: 'format-link',
            Label: 'Link…',
            Icon: 'fa-solid fa-link',
            Shortcut: FormatMenuShortcut('⌘K', 'Ctrl+K', ctx.IsMac),
            Command: { Type: 'format-text', Format: 'link', SegmentID: seg.SegmentID },
          },
        ],
      },
    );
  }

  // Turn Into & Callout Style
  if (!ctx.IsSimpleNoteMode) {
    const turnIntoOptions: ReadonlyArray<{
      ID: string;
      Label: string;
      Icon: string;
      Target: DocsBlockConvertTarget;
    }> = [
      { ID: 'turn-into-paragraph', Label: 'Paragraph', Icon: 'fa-solid fa-paragraph', Target: 'paragraph' },
      { ID: 'turn-into-heading-1', Label: 'Heading 1', Icon: 'fa-solid fa-heading', Target: 'heading-1' },
      { ID: 'turn-into-heading-2', Label: 'Heading 2', Icon: 'fa-solid fa-heading', Target: 'heading-2' },
      { ID: 'turn-into-heading-3', Label: 'Heading 3', Icon: 'fa-solid fa-heading', Target: 'heading-3' },
      { ID: 'turn-into-bullet-list', Label: 'Bullet List', Icon: 'fa-solid fa-list-ul', Target: 'bullet-list' },
      { ID: 'turn-into-ordered-list', Label: 'Numbered List', Icon: 'fa-solid fa-list-ol', Target: 'ordered-list' },
      { ID: 'turn-into-task-list', Label: 'Task Checklist', Icon: 'fa-solid fa-list-check', Target: 'task-list' },
      { ID: 'turn-into-callout', Label: 'Callout Note', Icon: 'fa-solid fa-circle-info', Target: 'callout' },
      { ID: 'turn-into-code', Label: 'Code Block', Icon: 'fa-solid fa-code', Target: 'code' },
    ];

    items.push({
      Kind: 'submenu',
      ID: 'turn-into',
      Label: 'Turn Into',
      Icon: 'fa-solid fa-paragraph',
      Disabled: segLocked,
      DisabledReason: lockReason,
      Children: turnIntoOptions.map((opt) => ({
        Kind: 'action',
        ID: opt.ID,
        Label: opt.Label,
        Icon: opt.Icon,
        Role: 'menuitemradio',
        Checked: currentConvertTarget === opt.Target,
        Command: { Type: 'turn-into', Target: opt.Target, SegmentID: seg.SegmentID },
      })),
    });
  }

  if (seg.BlockKind === 'callout') {
    const activeCallout = target.CurrentCalloutType ?? 'NOTE';
    const calloutTypes: ReadonlyArray<DocsCalloutType> = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION'];
    items.push({
      Kind: 'submenu',
      ID: 'callout-style',
      Label: 'Callout Style',
      Icon: 'fa-solid fa-circle-info',
      Disabled: segLocked,
      DisabledReason: lockReason,
      Children: calloutTypes.map((ct) => ({
        Kind: 'action',
        ID: `callout-style-${ct.toLowerCase()}`,
        Label: ct,
        Role: 'menuitemradio',
        Checked: activeCallout === ct,
        Command: { Type: 'callout-style', CalloutType: ct, SegmentID: seg.SegmentID },
      })),
    });
  }

  // Structure (Advanced Block Studio mode)
  if (!ctx.IsSimpleNoteMode) {
    items.push(
      { Kind: 'separator', ID: 'sep-structure' },
      {
        Kind: 'action',
        ID: 'insert-block-above',
        Label: 'Insert Block Above',
        Icon: 'fa-solid fa-arrow-up',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'insert-block', Placement: 'above', SegmentID: seg.SegmentID },
      },
      {
        Kind: 'action',
        ID: 'insert-block-below',
        Label: 'Insert Block Below',
        Icon: 'fa-solid fa-arrow-down',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'insert-block', Placement: 'below', SegmentID: seg.SegmentID },
      },
      {
        Kind: 'action',
        ID: 'insert-slash-menu',
        Label: 'Insert via / Menu…',
        Icon: 'fa-solid fa-plus',
        Shortcut: '/',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'insert-block', Placement: 'slash', SegmentID: seg.SegmentID },
      },
      {
        Kind: 'action',
        ID: 'duplicate-block',
        Label: 'Duplicate Block',
        Icon: 'fa-regular fa-clone',
        Shortcut: FormatMenuShortcut('⌘D', 'Ctrl+D', ctx.IsMac),
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'duplicate-block', SegmentID: seg.SegmentID },
      },
      {
        Kind: 'action',
        ID: 'move-block-up',
        Label: 'Move Block Up',
        Icon: 'fa-solid fa-chevron-up',
        Shortcut: FormatMenuShortcut('⌥↑', 'Alt+↑', ctx.IsMac),
        Disabled: segLocked || ctx.SegmentIndex <= 0,
        DisabledReason: lockReason ?? (ctx.SegmentIndex <= 0 ? 'Already at the top of the document' : undefined),
        Command: { Type: 'move-block', Direction: -1, SegmentID: seg.SegmentID },
      },
      {
        Kind: 'action',
        ID: 'move-block-down',
        Label: 'Move Block Down',
        Icon: 'fa-solid fa-chevron-down',
        Shortcut: FormatMenuShortcut('⌥↓', 'Alt+↓', ctx.IsMac),
        Disabled: segLocked || ctx.SegmentIndex >= ctx.SegmentCount - 1,
        DisabledReason:
          lockReason ?? (ctx.SegmentIndex >= ctx.SegmentCount - 1 ? 'Already at the bottom of the document' : undefined),
        Command: { Type: 'move-block', Direction: 1, SegmentID: seg.SegmentID },
      },
    );
  }

  // Heading Collapse & Owner-Only Lock
  if (seg.BlockKind === 'heading') {
    const canManageLock = ctx.IsArtifactOwner ?? ctx.CanUserShareArtifact;
    items.push(
      { Kind: 'separator', ID: 'sep-heading' },
      {
        Kind: 'action',
        ID: 'toggle-heading-collapse',
        Label: ctx.IsHeadingCollapsed ? 'Expand Section' : 'Collapse Section',
        Icon: ctx.IsHeadingCollapsed ? 'fa-solid fa-expand' : 'fa-solid fa-compress',
        Command: { Type: 'toggle-heading-collapse', SegmentID: seg.SegmentID },
      },
      {
        Kind: 'action',
        ID: 'toggle-heading-lock',
        Label: ctx.IsSegmentLocked ? 'Unlock Section' : 'Lock Section (Owner Only)',
        Icon: ctx.IsSegmentLocked ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock',
        Disabled: !canManageLock,
        DisabledReason: !canManageLock ? OWNER_ONLY_LOCK_REASON : undefined,
        Command: { Type: 'toggle-heading-lock', SegmentID: seg.SegmentID },
      },
    );
  }

  // Review & AI
  items.push({ Kind: 'separator', ID: 'sep-review' });
  if (ctx.CommentsEnabled) {
    items.push({
      Kind: 'action',
      ID: 'add-comment',
      Label: 'Add Anchored Comment',
      Icon: 'fa-regular fa-comment-dots',
      Shortcut: FormatMenuShortcut('⌥⌘M', 'Ctrl+Alt+M', ctx.IsMac),
      Command: {
        Type: 'add-comment',
        SegmentID: seg.SegmentID,
        SelectedText: hasSelection ? ctx.SelectedText : undefined,
      },
    });
  }
  if (!isSuggestMode) {
    items.push({
      Kind: 'action',
      ID: 'propose-suggestion',
      Label: 'Propose Tracked Suggestion…',
      Icon: 'fa-solid fa-code-pull-request',
      Disabled: segLocked,
      DisabledReason: lockReason,
      Command: { Type: 'propose-suggestion', SegmentID: seg.SegmentID },
    });
  }
  if (ctx.IsAiAssistantEnabled) {
    items.push({
      Kind: 'action',
      ID: 'ask-ai',
      Label: 'Ask AI About Section…',
      Icon: 'fa-solid fa-wand-magic-sparkles',
      Command: { Type: 'ask-ai', SegmentID: seg.SegmentID },
    });
  }

  // Danger
  if (!ctx.IsSimpleNoteMode) {
    const deleteDisabled = segLocked || ctx.SegmentCount <= 1;
    const deleteReason = lockReason ?? (ctx.SegmentCount <= 1 ? MIN_BLOCK_DELETE_REASON : undefined);
    items.push(
      { Kind: 'separator', ID: 'sep-danger' },
      {
        Kind: 'action',
        ID: 'delete-block',
        Label: 'Delete Block',
        Icon: 'fa-regular fa-trash-can',
        Shortcut: FormatMenuShortcut('⌫', 'Del', ctx.IsMac),
        Destructive: true,
        Disabled: deleteDisabled,
        DisabledReason: deleteReason,
        Command: { Type: 'delete-block', SegmentID: seg.SegmentID },
      },
    );
  }

  return items;
}

function buildTableMenu(
  ctx: DocsContextMenuSnapshot,
  target: Extract<DocsContextTarget, { Kind: 'table' }>,
): ContextMenuItem<DocsContextMenuCommand>[] {
  const seg = target.Segment;
  const isInteractive = isInteractiveMode(ctx);
  const segLocked = !ctx.SegmentEditable;
  const lockReason = getEditLockReason(ctx);
  const items: ContextMenuItem<DocsContextMenuCommand>[] = [];

  if (isInteractive) {
    items.push({ Kind: 'header', ID: 'hdr-table-rows', Label: 'Rows & Columns' });

    if (!target.IsHeaderRow) {
      items.push({
        Kind: 'action',
        ID: 'table-insert-row-above',
        Label: 'Insert Row Above',
        Icon: 'fa-solid fa-arrow-up',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: {
          Type: 'table-insert-row',
          Placement: 'above',
          SegmentID: seg.SegmentID,
          RowIndex: target.RowIndex,
          IsHeaderRow: false,
        },
      });
    }

    items.push({
      Kind: 'action',
      ID: 'table-insert-row-below',
      Label: 'Insert Row Below',
      Icon: 'fa-solid fa-arrow-down',
      Disabled: segLocked,
      DisabledReason: lockReason,
      Command: {
        Type: 'table-insert-row',
        Placement: 'below',
        SegmentID: seg.SegmentID,
        RowIndex: target.IsHeaderRow ? 0 : target.RowIndex,
        IsHeaderRow: target.IsHeaderRow,
      },
    });

    if (!target.IsHeaderRow) {
      const minRowDisabled = target.TableBodyRowCount <= 1;
      items.push({
        Kind: 'action',
        ID: 'table-delete-row',
        Label: 'Delete Row',
        Icon: 'fa-solid fa-minus',
        Destructive: true,
        Disabled: segLocked || minRowDisabled,
        DisabledReason: lockReason ?? (minRowDisabled ? 'Table must keep at least 1 body row' : undefined),
        Command: {
          Type: 'table-delete-row',
          SegmentID: seg.SegmentID,
          RowIndex: target.RowIndex,
        },
      });
    }

    items.push(
      { Kind: 'separator', ID: 'sep-table-cols' },
      {
        Kind: 'action',
        ID: 'table-insert-col-left',
        Label: 'Insert Column Left',
        Icon: 'fa-solid fa-arrow-left',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: {
          Type: 'table-insert-col',
          Placement: 'left',
          SegmentID: seg.SegmentID,
          ColIndex: target.ColIndex,
        },
      },
      {
        Kind: 'action',
        ID: 'table-insert-col-right',
        Label: 'Insert Column Right',
        Icon: 'fa-solid fa-arrow-right',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: {
          Type: 'table-insert-col',
          Placement: 'right',
          SegmentID: seg.SegmentID,
          ColIndex: target.ColIndex,
        },
      },
      {
        Kind: 'submenu',
        ID: 'table-align-col',
        Label: 'Column Alignment',
        Icon: 'fa-solid fa-align-left',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Children: [
          {
            Kind: 'action',
            ID: 'table-align-left',
            Label: 'Align Left',
            Icon: 'fa-solid fa-align-left',
            Role: 'menuitemradio',
            Checked: target.ColumnAlignment === 'left',
            Command: {
              Type: 'table-align-col',
              SegmentID: seg.SegmentID,
              ColIndex: target.ColIndex,
              Alignment: 'left',
            },
          },
          {
            Kind: 'action',
            ID: 'table-align-center',
            Label: 'Align Center',
            Icon: 'fa-solid fa-align-center',
            Role: 'menuitemradio',
            Checked: target.ColumnAlignment === 'center',
            Command: {
              Type: 'table-align-col',
              SegmentID: seg.SegmentID,
              ColIndex: target.ColIndex,
              Alignment: 'center',
            },
          },
          {
            Kind: 'action',
            ID: 'table-align-right',
            Label: 'Align Right',
            Icon: 'fa-solid fa-align-right',
            Role: 'menuitemradio',
            Checked: target.ColumnAlignment === 'right',
            Command: {
              Type: 'table-align-col',
              SegmentID: seg.SegmentID,
              ColIndex: target.ColIndex,
              Alignment: 'right',
            },
          },
        ],
      },
    );

    if (target.TableBodyRowCount > 1) {
      items.push({
        Kind: 'submenu',
        ID: 'table-sort-col',
        Label: 'Sort by This Column',
        Icon: 'fa-solid fa-arrow-down-a-z',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Children: [
          {
            Kind: 'action',
            ID: 'table-sort-asc',
            Label: 'Sort A → Z',
            Icon: 'fa-solid fa-arrow-down-a-z',
            Command: {
              Type: 'table-sort-col',
              SegmentID: seg.SegmentID,
              ColIndex: target.ColIndex,
              Direction: 'asc',
            },
          },
          {
            Kind: 'action',
            ID: 'table-sort-desc',
            Label: 'Sort Z → A',
            Icon: 'fa-solid fa-arrow-down-z-a',
            Command: {
              Type: 'table-sort-col',
              SegmentID: seg.SegmentID,
              ColIndex: target.ColIndex,
              Direction: 'desc',
            },
          },
        ],
      });
    }

    const minColDisabled = target.TableHeadersCount <= 1;
    items.push({
      Kind: 'action',
      ID: 'table-delete-col',
      Label: 'Delete Column',
      Icon: 'fa-solid fa-table-columns',
      Destructive: true,
      Disabled: segLocked || minColDisabled,
      DisabledReason: lockReason ?? (minColDisabled ? 'Table must keep at least 1 column' : undefined),
      Command: {
        Type: 'table-delete-col',
        SegmentID: seg.SegmentID,
        ColIndex: target.ColIndex,
      },
    });
  }

  items.push(
    { Kind: 'separator', ID: 'sep-table-copy' },
    {
      Kind: 'action',
      ID: 'table-copy-cell',
      Label: 'Copy Cell Text',
      Icon: 'fa-regular fa-copy',
      Disabled: target.CellText.length === 0,
      DisabledReason: target.CellText.length === 0 ? 'Cell is empty' : undefined,
      Command: {
        Type: 'table-copy-cell',
        SegmentID: seg.SegmentID,
        RowIndex: target.RowIndex,
        ColIndex: target.ColIndex,
        IsHeaderRow: target.IsHeaderRow,
      },
    },
    {
      Kind: 'submenu',
      ID: 'table-copy-as',
      Label: 'Copy Table As',
      Icon: 'fa-solid fa-file-export',
      Children: [
        {
          Kind: 'action',
          ID: 'table-copy-markdown',
          Label: 'Markdown Table',
          Icon: 'fa-brands fa-markdown',
          Command: { Type: 'table-copy-as', SegmentID: seg.SegmentID, Format: 'markdown' },
        },
        {
          Kind: 'action',
          ID: 'table-copy-csv',
          Label: 'CSV (Comma-Separated)',
          Icon: 'fa-solid fa-file-csv',
          Command: { Type: 'table-copy-as', SegmentID: seg.SegmentID, Format: 'csv' },
        },
        {
          Kind: 'action',
          ID: 'table-copy-tsv',
          Label: 'TSV (Tab-Separated)',
          Icon: 'fa-solid fa-table',
          Command: { Type: 'table-copy-as', SegmentID: seg.SegmentID, Format: 'tsv' },
        },
      ],
    },
  );

  if (ctx.CommentsEnabled) {
    items.push({
      Kind: 'action',
      ID: 'add-comment',
      Label: 'Add Anchored Comment',
      Icon: 'fa-regular fa-comment-dots',
      Command: {
        Type: 'add-comment',
        SegmentID: seg.SegmentID,
        SelectedText: ctx.SelectedText.trim() || undefined,
      },
    });
  }

  if (!isInteractive && ctx.CanUserEdit) {
    items.push({
      Kind: 'action',
      ID: 'preview-switch-to-write',
      Label: 'Switch to Write & Edit Block',
      Icon: 'fa-solid fa-pen-to-square',
      Command: { Type: 'preview-switch-to-write', SegmentID: seg.SegmentID },
    });
  }

  if (isInteractive) {
    const deleteDisabled = segLocked || ctx.SegmentCount <= 1;
    items.push(
      { Kind: 'separator', ID: 'sep-table-danger' },
      {
        Kind: 'action',
        ID: 'delete-block',
        Label: 'Delete Entire Table',
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Disabled: deleteDisabled,
        DisabledReason: lockReason ?? (ctx.SegmentCount <= 1 ? MIN_BLOCK_DELETE_REASON : undefined),
        Command: { Type: 'delete-block', SegmentID: seg.SegmentID },
      },
    );
  }

  return items;
}

function buildLiveBlockMenu(
  ctx: DocsContextMenuSnapshot,
  target: Extract<DocsContextTarget, { Kind: 'live-block' }>,
): ContextMenuItem<DocsContextMenuCommand>[] {
  const { Block: block, Segment: seg } = target;
  const isInteractive = isInteractiveMode(ctx);
  const segLocked = !ctx.SegmentEditable;
  const lockReason = getEditLockReason(ctx);
  const items: ContextMenuItem<DocsContextMenuCommand>[] = [];

  if (target.RecordLinkContext) {
    items.push(
      {
        Kind: 'action',
        ID: 'live-block-open-record',
        Label: `Open ${target.RecordLinkContext.TargetEntityName || 'Record'} in Explorer`,
        Icon: 'fa-solid fa-arrow-up-right-from-square',
        Command: {
          Type: 'live-block-open-record',
          BlockID: block.BlockID,
          ColumnName: target.RecordLinkContext.ColumnName,
          RowIndex: target.RecordLinkContext.RowIndex,
        },
      },
      { Kind: 'separator', ID: 'sep-live-record' },
    );
  }

  if (block.Mode !== 'Frozen') {
    items.push({
      Kind: 'action',
      ID: 'live-block-refresh',
      Label: 'Refresh Live Data',
      Icon: 'fa-solid fa-arrows-rotate',
      Command: { Type: 'live-block-refresh', BlockID: block.BlockID },
    });
  }

  if (isInteractive) {
    items.push(
      {
        Kind: 'action',
        ID: 'live-block-configure',
        Label: 'Configure Live Block…',
        Icon: 'fa-solid fa-sliders',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'live-block-configure', BlockID: block.BlockID },
      },
      {
        Kind: 'action',
        ID: 'live-block-toggle-freeze',
        Label: block.Mode === 'Frozen' ? 'Switch to Live Mode' : 'Freeze Snapshot…',
        Icon: block.Mode === 'Frozen' ? 'fa-solid fa-bolt' : 'fa-solid fa-snowflake',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: {
          Type: 'live-block-toggle-freeze',
          BlockID: block.BlockID,
          Action: block.Mode === 'Frozen' ? 'unfreeze' : 'freeze',
        },
      },
    );
  }

  items.push({ Kind: 'separator', ID: 'sep-live-data' });

  if (target.HasResultRows) {
    items.push({
      Kind: 'action',
      ID: 'live-block-copy-csv',
      Label: 'Copy Result Data as CSV',
      Icon: 'fa-solid fa-file-csv',
      Command: { Type: 'live-block-copy-csv', BlockID: block.BlockID },
    });
  }

  items.push(
    {
      Kind: 'action',
      ID: 'live-block-copy-json',
      Label: 'Inspect / Copy :::mj-block JSON',
      Icon: 'fa-solid fa-code',
      Command: { Type: 'live-block-copy-json', BlockID: block.BlockID },
    },
    {
      Kind: 'action',
      ID: 'live-block-toggle-collapse',
      Label: target.IsCollapsed ? 'Expand Card' : 'Collapse Card',
      Icon: target.IsCollapsed ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up',
      Command: { Type: 'live-block-toggle-collapse', BlockID: block.BlockID },
    },
  );

  if (ctx.CommentsEnabled || ctx.IsAiAssistantEnabled) {
    items.push({ Kind: 'separator', ID: 'sep-live-collab' });
  }
  if (ctx.CommentsEnabled) {
    items.push({
      Kind: 'action',
      ID: 'add-comment',
      Label: 'Add Anchored Comment',
      Icon: 'fa-regular fa-comment-dots',
      Command: { Type: 'add-comment', SegmentID: seg.SegmentID },
    });
  }
  if (ctx.IsAiAssistantEnabled) {
    items.push({
      Kind: 'action',
      ID: 'ask-ai',
      Label: 'Ask AI About Block…',
      Icon: 'fa-solid fa-wand-magic-sparkles',
      Command: { Type: 'ask-ai', SegmentID: seg.SegmentID },
    });
  }

  if (isInteractive) {
    const deleteDisabled = segLocked || ctx.SegmentCount <= 1;
    items.push(
      { Kind: 'separator', ID: 'sep-live-danger' },
      {
        Kind: 'action',
        ID: 'delete-block',
        Label: 'Delete Live Block',
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Disabled: deleteDisabled,
        DisabledReason: lockReason ?? (ctx.SegmentCount <= 1 ? MIN_BLOCK_DELETE_REASON : undefined),
        Command: { Type: 'delete-block', SegmentID: seg.SegmentID },
      },
    );
  }

  return items;
}

function buildEmbeddedArtifactMenu(
  ctx: DocsContextMenuSnapshot,
  target: Extract<DocsContextTarget, { Kind: 'embedded-artifact' }>,
): ContextMenuItem<DocsContextMenuCommand>[] {
  const { Block: block, Segment: seg } = target;
  const isInteractive = isInteractiveMode(ctx);
  const segLocked = !ctx.SegmentEditable;
  const lockReason = getEditLockReason(ctx);
  const items: ContextMenuItem<DocsContextMenuCommand>[] = [];

  if (isInteractive && target.CanInlineEdit) {
    items.push({
      Kind: 'action',
      ID: 'ole-toggle-inline-edit',
      Label: target.IsInlineEditing ? 'Finish Inline Edit' : 'Edit Inline',
      Icon: target.IsInlineEditing ? 'fa-solid fa-check' : 'fa-solid fa-pen-to-square',
      Disabled: segLocked,
      DisabledReason: lockReason,
      Command: { Type: 'ole-toggle-inline-edit', BlockID: block.BlockID },
    });
  }

  items.push({
    Kind: 'action',
    ID: 'ole-toggle-fullscreen',
    Label: target.IsFullScreen ? 'Exit Full Screen' : 'Open Full Screen',
    Icon: target.IsFullScreen ? 'fa-solid fa-compress' : 'fa-solid fa-expand',
    Command: { Type: 'ole-toggle-fullscreen', BlockID: block.BlockID },
  });

  if (block.ArtifactID?.trim()) {
    items.push({
      Kind: 'action',
      ID: 'ole-open-source',
      Label: 'Open Source Artifact',
      Icon: 'fa-solid fa-arrow-up-right-from-square',
      Command: { Type: 'ole-open-source', ArtifactID: block.ArtifactID.trim() },
    });
  }

  if (isInteractive) {
    items.push({ Kind: 'separator', ID: 'sep-ole-version' });
    if (target.NewerVersionNumber != null) {
      items.push({
        Kind: 'action',
        ID: 'ole-update-latest',
        Label: `Update to Latest Version (v${target.NewerVersionNumber})`,
        Icon: 'fa-solid fa-cloud-arrow-down',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'ole-update-latest', BlockID: block.BlockID },
      });
    }
    items.push(
      {
        Kind: 'action',
        ID: 'ole-toggle-pin',
        Label: block.VersionID ? 'Follow Latest Version' : 'Pin Version',
        Icon: 'fa-solid fa-thumbtack',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'ole-toggle-pin', BlockID: block.BlockID },
      },
      {
        Kind: 'action',
        ID: 'ole-configure',
        Label: 'Configure Embedded Block…',
        Icon: 'fa-solid fa-sliders',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'live-block-configure', BlockID: block.BlockID },
      },
    );
  }

  items.push(
    { Kind: 'separator', ID: 'sep-ole-misc' },
    {
      Kind: 'action',
      ID: 'live-block-toggle-collapse',
      Label: target.IsCollapsed ? 'Expand Card' : 'Collapse Card',
      Icon: target.IsCollapsed ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-up',
      Command: { Type: 'live-block-toggle-collapse', BlockID: block.BlockID },
    },
    {
      Kind: 'action',
      ID: 'ole-copy-json',
      Label: 'Copy Block Reference JSON',
      Icon: 'fa-solid fa-link',
      Command: { Type: 'live-block-copy-json', BlockID: block.BlockID },
    },
  );

  if (ctx.CommentsEnabled) {
    items.push({
      Kind: 'action',
      ID: 'add-comment',
      Label: 'Add Anchored Comment',
      Icon: 'fa-regular fa-comment-dots',
      Command: { Type: 'add-comment', SegmentID: seg.SegmentID },
    });
  }

  if (isInteractive) {
    const deleteDisabled = segLocked || ctx.SegmentCount <= 1;
    items.push(
      { Kind: 'separator', ID: 'sep-ole-danger' },
      {
        Kind: 'action',
        ID: 'delete-block',
        Label: 'Delete Embedded Block',
        Icon: 'fa-regular fa-trash-can',
        Destructive: true,
        Disabled: deleteDisabled,
        DisabledReason: lockReason ?? (ctx.SegmentCount <= 1 ? MIN_BLOCK_DELETE_REASON : undefined),
        Command: { Type: 'delete-block', SegmentID: seg.SegmentID },
      },
    );
  }

  return items;
}

function buildPreviewProseMenu(
  ctx: DocsContextMenuSnapshot,
  target: Extract<DocsContextTarget, { Kind: 'preview-prose' }>,
): ContextMenuItem<DocsContextMenuCommand>[] {
  const seg = target.Segment;
  const items: ContextMenuItem<DocsContextMenuCommand>[] = [];
  const trimmedSelection = ctx.SelectedText.trim();

  if (trimmedSelection.length > 0) {
    items.push({
      Kind: 'action',
      ID: 'preview-copy-selection',
      Label: 'Copy Selection',
      Icon: 'fa-regular fa-copy',
      Shortcut: FormatMenuShortcut('⌘C', 'Ctrl+C', ctx.IsMac),
      Command: { Type: 'preview-copy-selection', SelectedText: ctx.SelectedText },
    });
  }

  items.push({
    Kind: 'action',
    ID: 'copy-markdown',
    Label: 'Copy Section Markdown',
    Icon: 'fa-brands fa-markdown',
    Shortcut: FormatMenuShortcut('⇧⌘C', 'Ctrl+Shift+C', ctx.IsMac),
    Command: { Type: 'clipboard', Action: 'copy-markdown', SegmentID: seg.SegmentID },
  });

  if (target.IsInsidePre || seg.BlockKind === 'code') {
    items.push({
      Kind: 'action',
      ID: 'copy-code',
      Label: 'Copy Code Block',
      Icon: 'fa-solid fa-code',
      Command: { Type: 'clipboard', Action: 'copy-code', SegmentID: seg.SegmentID },
    });
  }

  if (target.IsInsideTable || seg.BlockKind === 'table') {
    items.push(
      {
        Kind: 'action',
        ID: 'table-copy-csv',
        Label: 'Copy Table as CSV',
        Icon: 'fa-solid fa-file-csv',
        Command: { Type: 'table-copy-as', SegmentID: seg.SegmentID, Format: 'csv' },
      },
      {
        Kind: 'action',
        ID: 'table-copy-markdown',
        Label: 'Copy Table as Markdown',
        Icon: 'fa-brands fa-markdown',
        Command: { Type: 'table-copy-as', SegmentID: seg.SegmentID, Format: 'markdown' },
      },
    );
  }

  if (target.LinkUrl) {
    items.push(
      { Kind: 'separator', ID: 'sep-preview-link' },
      {
        Kind: 'action',
        ID: 'preview-copy-link',
        Label: 'Copy Link URL',
        Icon: 'fa-solid fa-link',
        Command: { Type: 'preview-copy-link', Url: target.LinkUrl },
      },
      {
        Kind: 'action',
        ID: 'preview-open-link',
        Label: 'Open Link in New Tab',
        Icon: 'fa-solid fa-arrow-up-right-from-square',
        Command: { Type: 'preview-open-link', Url: target.LinkUrl },
      },
    );
  }

  if (target.ImageUrl) {
    items.push({
      Kind: 'action',
      ID: 'preview-copy-image',
      Label: 'Copy Image URL',
      Icon: 'fa-regular fa-image',
      Command: { Type: 'preview-copy-image', Url: target.ImageUrl },
    });
  }

  if (seg.BlockKind === 'heading') {
    items.push(
      { Kind: 'separator', ID: 'sep-preview-heading' },
      {
        Kind: 'action',
        ID: 'preview-copy-anchor',
        Label: 'Copy Section Reference (#anchor)',
        Icon: 'fa-solid fa-hashtag',
        Command: { Type: 'preview-copy-anchor', AnchorKey: seg.SegmentID },
      },
      {
        Kind: 'action',
        ID: 'toggle-heading-collapse',
        Label: ctx.IsHeadingCollapsed ? 'Expand Section' : 'Collapse Section',
        Icon: ctx.IsHeadingCollapsed ? 'fa-solid fa-expand' : 'fa-solid fa-compress',
        Command: { Type: 'toggle-heading-collapse', SegmentID: seg.SegmentID },
      },
    );
  }

  if (ctx.CommentsEnabled || ctx.IsAiAssistantEnabled || ctx.CanUserEdit) {
    items.push({ Kind: 'separator', ID: 'sep-preview-actions' });
  }

  if (ctx.CommentsEnabled) {
    items.push({
      Kind: 'action',
      ID: 'add-comment',
      Label: 'Add Anchored Comment',
      Icon: 'fa-regular fa-comment-dots',
      Shortcut: FormatMenuShortcut('⌥⌘M', 'Ctrl+Alt+M', ctx.IsMac),
      Command: {
        Type: 'add-comment',
        SegmentID: seg.SegmentID,
        SelectedText: trimmedSelection || undefined,
      },
    });
  }

  if (ctx.IsAiAssistantEnabled) {
    items.push({
      Kind: 'action',
      ID: 'ask-ai',
      Label: 'Ask AI About Section…',
      Icon: 'fa-solid fa-wand-magic-sparkles',
      Command: { Type: 'ask-ai', SegmentID: seg.SegmentID },
    });
  }

  if (ctx.CanUserEdit) {
    items.push({
      Kind: 'action',
      ID: 'preview-switch-to-write',
      Label: 'Switch to Write & Edit Block',
      Icon: 'fa-solid fa-pen-to-square',
      Command: { Type: 'preview-switch-to-write', SegmentID: seg.SegmentID },
    });
  }

  return items;
}

function buildSuggestionCardMenu(
  ctx: DocsContextMenuSnapshot,
  target: Extract<DocsContextTarget, { Kind: 'suggestion-card' }>,
): ContextMenuItem<DocsContextMenuCommand>[] {
  const sug = target.Suggestion;
  const items: ContextMenuItem<DocsContextMenuCommand>[] = [];

  if (ctx.CanUserEdit && sug.Status === 'Pending') {
    const segLocked = !ctx.SegmentEditable;
    const lockReason = getEditLockReason(ctx);
    items.push(
      {
        Kind: 'action',
        ID: 'suggestion-accept',
        Label: 'Accept Suggestion',
        Icon: 'fa-solid fa-check',
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'suggestion-accept', SuggestionID: sug.SuggestionID },
      },
      {
        Kind: 'action',
        ID: 'suggestion-reject',
        Label: 'Reject Suggestion',
        Icon: 'fa-solid fa-xmark',
        Destructive: true,
        Disabled: segLocked,
        DisabledReason: lockReason,
        Command: { Type: 'suggestion-reject', SuggestionID: sug.SuggestionID },
      },
      { Kind: 'separator', ID: 'sep-suggestion-nav' },
    );
  }

  items.push(
    {
      Kind: 'action',
      ID: 'suggestion-jump',
      Label: 'Jump to Target Block',
      Icon: 'fa-solid fa-crosshairs',
      Command: { Type: 'suggestion-jump', AnchorKey: sug.BlockID },
    },
    {
      Kind: 'action',
      ID: 'suggestion-copy-proposed',
      Label: 'Copy Proposed Markdown',
      Icon: 'fa-regular fa-copy',
      Command: { Type: 'suggestion-copy-proposed', SuggestionID: sug.SuggestionID },
    },
  );

  return items;
}

function buildOutlineItemMenu(
  ctx: DocsContextMenuSnapshot,
  target: Extract<DocsContextTarget, { Kind: 'outline-item' }>,
): ContextMenuItem<DocsContextMenuCommand>[] {
  const { OutlineItem: item, TargetSegment: seg, TargetSegmentIndex: segIdx } = target;
  const isInteractive = isInteractiveMode(ctx);
  const items: ContextMenuItem<DocsContextMenuCommand>[] = [
    {
      Kind: 'action',
      ID: 'outline-jump',
      Label: 'Jump to Section',
      Icon: 'fa-solid fa-crosshairs',
      Command: { Type: 'outline-jump', ItemID: item.ID },
    },
  ];

  if (item.Kind === 'heading' && seg) {
    items.push({
      Kind: 'action',
      ID: 'toggle-heading-collapse',
      Label: ctx.IsHeadingCollapsed ? 'Expand Section' : 'Collapse Section',
      Icon: ctx.IsHeadingCollapsed ? 'fa-solid fa-expand' : 'fa-solid fa-compress',
      Command: { Type: 'toggle-heading-collapse', SegmentID: seg.SegmentID },
    });
  }

  items.push({
    Kind: 'action',
    ID: 'preview-copy-anchor',
    Label: 'Copy Section Anchor',
    Icon: 'fa-solid fa-hashtag',
    Command: { Type: 'preview-copy-anchor', AnchorKey: item.ID },
  });

  if (isInteractive && seg) {
    const segLocked = !ctx.SegmentEditable;
    const lockReason = getEditLockReason(ctx);
    const canManageLock = ctx.IsArtifactOwner ?? ctx.CanUserShareArtifact;
    items.push({ Kind: 'separator', ID: 'sep-outline-edit' });
    if (item.Kind === 'heading') {
      items.push({
        Kind: 'action',
        ID: 'toggle-heading-lock',
        Label: ctx.IsSegmentLocked ? 'Unlock Section' : 'Lock Section (Owner Only)',
        Icon: ctx.IsSegmentLocked ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock',
        Disabled: !canManageLock,
        DisabledReason: !canManageLock ? OWNER_ONLY_LOCK_REASON : undefined,
        Command: { Type: 'toggle-heading-lock', SegmentID: seg.SegmentID },
      });
    }
    if (!ctx.IsSimpleNoteMode) {
      items.push(
        {
          Kind: 'action',
          ID: 'move-block-up',
          Label: 'Move Section Block Up',
          Icon: 'fa-solid fa-chevron-up',
          Disabled: segLocked || segIdx <= 0,
          DisabledReason: lockReason ?? (segIdx <= 0 ? 'Already at the top of the document' : undefined),
          Command: { Type: 'move-block', Direction: -1, SegmentID: seg.SegmentID },
        },
        {
          Kind: 'action',
          ID: 'move-block-down',
          Label: 'Move Section Block Down',
          Icon: 'fa-solid fa-chevron-down',
          Disabled: segLocked || segIdx >= ctx.SegmentCount - 1,
          DisabledReason:
            lockReason ?? (segIdx >= ctx.SegmentCount - 1 ? 'Already at the bottom of the document' : undefined),
          Command: { Type: 'move-block', Direction: 1, SegmentID: seg.SegmentID },
        },
      );
    }
  }

  return items;
}

/**
 * Pure descriptor builder for all MJ Docs right-click context menus (Zones 2a–2d).
 * Normalizes separators and empty headers before returning.
 */
export function BuildDocsContextMenu(
  ctx: DocsContextMenuSnapshot,
): ContextMenuItem<DocsContextMenuCommand>[] {
  let raw: ContextMenuItem<DocsContextMenuCommand>[];
  switch (ctx.Target.Kind) {
    case 'prose':
      raw = buildProseMenu(ctx, ctx.Target);
      break;
    case 'table':
      raw = buildTableMenu(ctx, ctx.Target);
      break;
    case 'live-block':
      raw = buildLiveBlockMenu(ctx, ctx.Target);
      break;
    case 'embedded-artifact':
      raw = buildEmbeddedArtifactMenu(ctx, ctx.Target);
      break;
    case 'preview-prose':
      raw = buildPreviewProseMenu(ctx, ctx.Target);
      break;
    case 'suggestion-card':
      raw = buildSuggestionCardMenu(ctx, ctx.Target);
      break;
    case 'outline-item':
      raw = buildOutlineItemMenu(ctx, ctx.Target);
      break;
  }
  return NormalizeContextMenuItems(raw);
}
