import type {
  DocumentBlockMode,
  SlideDeckThemeSpec,
  SlideLayoutKind,
  SlideLayoutMetadata,
  SlideRegionKind,
  SlideRegionSpec,
  SlideSpec,
  SlideTransitionKind,
} from '@memberjunction/core-entities';
import {
  FormatMenuShortcut,
  NormalizeContextMenuItems,
} from '../../context-menu/context-menu-position.util';
import type {
  ContextMenuCommandBase,
  ContextMenuItem,
} from '../../context-menu/context-menu.types';

/**
 * Logical right-click zones supported by MJ Slides (`SlideDeckArtifactViewerComponent`).
 */
export type SlidesContextMenuZone =
  | 'filmstrip-slide'
  | 'filmstrip-empty'
  | 'stage-background'
  | 'slide-region'
  | 'speaker-notes'
  | 'viewer-stage'
  | 'presentation-stage';

/**
 * Strongly-typed discriminated union of all context menu commands dispatched by MJ Slides.
 */
export type SlidesContextMenuCommand =
  | { readonly Type: 'add-slide'; readonly AfterSlideID?: string; readonly Layout: SlideLayoutKind }
  | { readonly Type: 'duplicate-slide'; readonly SlideID: string }
  | { readonly Type: 'delete-slide'; readonly SlideID: string }
  | { readonly Type: 'move-slide'; readonly SlideID: string; readonly Delta: -1 | 1 }
  | { readonly Type: 'move-slide-edge'; readonly SlideID: string; readonly Edge: 'start' | 'end' }
  | { readonly Type: 'change-layout'; readonly SlideID: string; readonly Layout: SlideLayoutKind }
  | { readonly Type: 'set-transition'; readonly SlideID: string; readonly Transition: SlideTransitionKind }
  | { readonly Type: 'toggle-slide-hidden'; readonly SlideID: string }
  | { readonly Type: 'toggle-slide-lock'; readonly SlideID: string }
  | { readonly Type: 'focus-speaker-notes'; readonly SlideID: string }
  | { readonly Type: 'comment-slide'; readonly SlideID: string }
  | { readonly Type: 'copy-slide-markdown'; readonly SlideID: string }
  | { readonly Type: 'select-theme-preset'; readonly ThemeID: string }
  | { readonly Type: 'open-theme-drawer' }
  | { readonly Type: 'ask-ai-slide'; readonly SlideID: string }
  | { readonly Type: 'present'; readonly Mode: 'present' | 'presenter'; readonly SlideID?: string }
  | { readonly Type: 'exit-presentation' }
  | { readonly Type: 'navigate-slide'; readonly Direction: 'prev' | 'next' }
  | { readonly Type: 'jump-to-slide'; readonly SlideID: string }
  | { readonly Type: 'refresh-presentation-live-blocks' }
  | { readonly Type: 'export'; readonly Format: 'pptx' | 'pdf' }
  | {
      readonly Type: 'insert-region-content';
      readonly SlideID: string;
      readonly RegionID: string;
      readonly Preset: 'text' | 'bullets' | 'live-view' | 'sheet-chart' | 'whiteboard';
    }
  | { readonly Type: 'edit-region-inline'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'toggle-ole-edit'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'cut-region'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'copy-region'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'duplicate-region'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'paste-region'; readonly SlideID: string; readonly RegionID: string }
  | {
      readonly Type: 'change-region-kind';
      readonly SlideID: string;
      readonly RegionID: string;
      readonly Kind: SlideRegionKind;
    }
  | {
      readonly Type: 'swap-region';
      readonly SlideID: string;
      readonly RegionID: string;
      readonly Delta: -1 | 1;
    }
  | { readonly Type: 'clear-region'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'toggle-region-lock'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'comment-region'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'refresh-region-block'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'open-sheet-embed'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'update-workbook-version'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'freeze-region-block'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'unfreeze-region-block'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'open-source-artifact'; readonly ArtifactID: string }
  | { readonly Type: 'copy-block-json'; readonly SlideID: string; readonly RegionID: string }
  | { readonly Type: 'copy-speaker-notes'; readonly SlideID: string }
  | { readonly Type: 'copy-slide-and-notes-markdown'; readonly SlideID: string }
  | { readonly Type: 'reset-presenter-timer' };

// Ensure union satisfies base constraint at compile time
const _slidesCommandCheck: ContextMenuCommandBase = {
  Type: 'exit-presentation',
} satisfies SlidesContextMenuCommand;
void _slidesCommandCheck;

/**
 * Lightweight slide summary used to populate Jump-to-Slide submenus.
 */
export interface SlidesJumpTargetSummary {
  readonly SlideID: string;
  readonly SlideNumber: number;
  readonly Title: string;
  readonly Hidden: boolean;
}

/**
 * Immutable context snapshot passed to {@link BuildSlidesContextMenu}.
 */
export interface SlidesContextMenuSnapshot {
  readonly Zone: SlidesContextMenuZone;
  readonly IsEditable: boolean;
  readonly CanComment: boolean;
  readonly IsAiAssistantEnabled: boolean;
  readonly WorkspaceMode: 'edit' | 'present' | 'presenter' | 'source' | 'diff';
  readonly TotalSlides: number;
  readonly Slides: ReadonlyArray<SlidesJumpTargetSummary>;
  readonly Slide: SlideSpec;
  readonly SlideIndex: number;
  readonly CanEditSlide: boolean;
  readonly SlideLockedReason?: string;
  readonly CanToggleSlideLock: boolean;
  readonly SlideLockToggleDisabledReason?: string;
  readonly TargetRegion?: SlideRegionSpec;
  readonly RegionIndex?: number;
  readonly TotalRegions?: number;
  readonly CanEditRegion?: boolean;
  readonly RegionLockedReason?: string;
  readonly CanToggleRegionLock?: boolean;
  readonly RegionLockToggleDisabledReason?: string;
  readonly CanSwapEarlier?: boolean;
  readonly SwapEarlierDisabledReason?: string;
  readonly CanSwapLater?: boolean;
  readonly SwapLaterDisabledReason?: string;
  readonly IsOleBlock?: boolean;
  readonly IsOleEditing?: boolean;
  readonly IsSheetBackedBlock?: boolean;
  readonly BlockMode?: DocumentBlockMode;
  readonly SourceArtifactID?: string;
  readonly NewerWorkbookVersionNumber?: number | null;
  readonly HasCopiedRegion: boolean;
  readonly HasPreviousVisibleSlide: boolean;
  readonly HasNextVisibleSlide: boolean;
  readonly ActiveThemeID: string;
  readonly LayoutCatalog: ReadonlyArray<SlideLayoutMetadata>;
  readonly ThemePresets: ReadonlyArray<SlideDeckThemeSpec>;
  readonly IsMac?: boolean;
}

const TRANSITION_OPTIONS: ReadonlyArray<{ readonly Value: SlideTransitionKind; readonly Label: string }> = [
  { Value: 'none', Label: 'None' },
  { Value: 'fade', Label: 'Fade' },
  { Value: 'slide', Label: 'Slide' },
  { Value: 'zoom', Label: 'Zoom' },
];

const REGION_KIND_OPTIONS: ReadonlyArray<{
  readonly Kind: SlideRegionKind;
  readonly Label: string;
  readonly Icon: string;
}> = [
  { Kind: 'rich-text', Label: 'Rich Text / Bullets', Icon: 'fa-solid fa-align-left' },
  { Kind: 'callout', Label: 'Callout Box', Icon: 'fa-solid fa-circle-info' },
  { Kind: 'table', Label: 'Data Table', Icon: 'fa-solid fa-table' },
  { Kind: 'big-number', Label: 'KPI Big Number', Icon: 'fa-solid fa-arrow-trend-up' },
  { Kind: 'quote', Label: 'Executive Quote', Icon: 'fa-solid fa-quote-left' },
  { Kind: 'mj-block', Label: 'Live MJ Block / Artifact', Icon: 'fa-solid fa-database' },
];

const DEFAULT_LOCKED_SLIDE_REASON = 'Slide is locked by owner — you do not have permission to edit it';
const DEFAULT_LOCKED_REGION_REASON = 'Region is locked by owner — you do not have permission to edit it';

/**
 * Returns an accessible `aria-label` describing the active MJ Slides context menu zone.
 */
export function ComputeSlidesMenuAriaLabel(zone: SlidesContextMenuZone): string {
  switch (zone) {
    case 'filmstrip-slide':
      return 'Slide thumbnail actions';
    case 'filmstrip-empty':
      return 'Slide sorter actions';
    case 'stage-background':
      return 'Slide stage actions';
    case 'slide-region':
      return 'Slide region actions';
    case 'speaker-notes':
      return 'Speaker notes actions';
    case 'viewer-stage':
      return 'Presentation viewer actions';
    case 'presentation-stage':
      return 'Presentation navigation actions';
  }
}

/**
 * Serializes a {@link SlideSpec} (title, subtitle, regions, and optionally speaker notes)
 * to clean Markdown for clipboard copy actions.
 */
export function SerializeSlideToMarkdown(slide: SlideSpec, includeSpeakerNotes = false): string {
  const parts: string[] = [`# ${slide.Title}`];
  if (slide.Subtitle && slide.Subtitle.trim().length > 0) {
    parts.push(`*${slide.Subtitle.trim()}*`);
  }

  for (const region of slide.Regions) {
    if (region.Kind === 'big-number') {
      const value = region.BigNumberValue || '';
      const label = region.BigNumberLabel || region.Label;
      const delta = region.BigNumberDelta ? ` (${region.BigNumberDelta})` : '';
      parts.push(`## ${region.Label}\n\n**${value}** — ${label}${delta}`);
    } else if (region.Kind === 'quote') {
      const quoteText = (region.MarkdownContent || '').trim();
      const cite = region.QuoteAttribution ? `\n> — ${region.QuoteAttribution}` : '';
      parts.push(`## ${region.Label}\n\n> ${quoteText}${cite}`);
    } else if (region.MarkdownContent && region.MarkdownContent.trim().length > 0) {
      parts.push(`## ${region.Label}\n\n${region.MarkdownContent.trim()}`);
    }
  }

  if (includeSpeakerNotes && slide.SpeakerNotes && slide.SpeakerNotes.trim().length > 0) {
    parts.push(`> Speaker Notes: ${slide.SpeakerNotes.trim()}`);
  }

  return parts.join('\n\n');
}

function buildLayoutSubmenuChildren(
  slide: SlideSpec,
  layoutCatalog: ReadonlyArray<SlideLayoutMetadata>,
  mode: 'change' | 'insert-after',
): ContextMenuItem<SlidesContextMenuCommand>[] {
  return layoutCatalog.map((meta) => {
    if (mode === 'insert-after') {
      return {
        Kind: 'action',
        ID: `new-slide-layout-${meta.Kind}`,
        Label: meta.Label,
        Icon: meta.Icon,
        Command: {
          Type: 'add-slide',
          AfterSlideID: slide.SlideID,
          Layout: meta.Kind,
        },
      };
    }
    return {
      Kind: 'action',
      ID: `change-layout-${meta.Kind}`,
      Label: meta.Label,
      Icon: meta.Icon,
      Role: 'menuitemradio',
      Checked: slide.Layout === meta.Kind,
      Command: {
        Type: 'change-layout',
        SlideID: slide.SlideID,
        Layout: meta.Kind,
      },
    };
  });
}

function buildTransitionSubmenuChildren(
  slide: SlideSpec,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  const activeTransition: SlideTransitionKind = slide.Transition ?? 'fade';
  return TRANSITION_OPTIONS.map((opt) => ({
    Kind: 'action',
    ID: `transition-${opt.Value}`,
    Label: opt.Label,
    Role: 'menuitemradio',
    Checked: activeTransition === opt.Value,
    Command: {
      Type: 'set-transition',
      SlideID: slide.SlideID,
      Transition: opt.Value,
    },
  }));
}

function buildThemeSubmenuChildren(
  ctx: SlidesContextMenuSnapshot,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  const presetItems: ContextMenuItem<SlidesContextMenuCommand>[] = ctx.ThemePresets.map((preset) => ({
    Kind: 'action',
    ID: `theme-preset-${preset.ThemeID}`,
    Label: preset.Name,
    Role: 'menuitemradio',
    Checked: ctx.ActiveThemeID === preset.ThemeID,
    Command: {
      Type: 'select-theme-preset',
      ThemeID: preset.ThemeID,
    },
  }));

  return [
    ...presetItems,
    { Kind: 'separator', ID: 'sep-theme-drawer' },
    {
      Kind: 'action',
      ID: 'open-theme-drawer',
      Label: 'Customize Theme & Brand Colors…',
      Icon: 'fa-solid fa-sliders',
      Command: { Type: 'open-theme-drawer' },
    },
  ];
}

function buildJumpToSlideChildren(
  ctx: SlidesContextMenuSnapshot,
  excludeHidden: boolean,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  const list = excludeHidden ? ctx.Slides.filter((s) => !s.Hidden) : ctx.Slides;
  return list.map((s) => ({
    Kind: 'action',
    ID: `jump-slide-${s.SlideID}`,
    Label: `${s.SlideNumber}. ${s.Title}`,
    Role: 'menuitemradio',
    Checked: s.SlideID === ctx.Slide.SlideID,
    Command: {
      Type: 'jump-to-slide',
      SlideID: s.SlideID,
    },
  }));
}

function buildFilmstripSlideMenu(
  ctx: SlidesContextMenuSnapshot,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  const items: ContextMenuItem<SlidesContextMenuCommand>[] = [];
  const slideId = ctx.Slide.SlideID;
  const slideLockReason = ctx.SlideLockedReason || DEFAULT_LOCKED_SLIDE_REASON;
  const atStart = ctx.SlideIndex <= 0;
  const atEnd = ctx.SlideIndex >= ctx.TotalSlides - 1;

  if (ctx.IsEditable) {
    items.push(
      {
        Kind: 'action',
        ID: 'add-slide-after',
        Label: 'New Slide After',
        Icon: 'fa-solid fa-plus',
        Command: { Type: 'add-slide', AfterSlideID: slideId, Layout: 'TitleAndBody' },
      },
      {
        Kind: 'submenu',
        ID: 'add-slide-layout',
        Label: 'New Slide With Layout',
        Icon: 'fa-solid fa-table-columns',
        Children: buildLayoutSubmenuChildren(ctx.Slide, ctx.LayoutCatalog, 'insert-after'),
      },
      {
        Kind: 'action',
        ID: 'duplicate-slide',
        Label: 'Duplicate Slide',
        Icon: 'fa-regular fa-clone',
        Shortcut: FormatMenuShortcut('⌘D', 'Ctrl+D', ctx.IsMac),
        Command: { Type: 'duplicate-slide', SlideID: slideId },
      },
      { Kind: 'separator', ID: 'sep-filmstrip-order' },
      {
        Kind: 'action',
        ID: 'move-slide-up',
        Label: 'Move Slide Up',
        Icon: 'fa-solid fa-arrow-up',
        Shortcut: FormatMenuShortcut('⌥↑', 'Alt+↑', ctx.IsMac),
        Disabled: atStart,
        DisabledReason: atStart ? 'Slide is already at the beginning of the deck' : undefined,
        Command: { Type: 'move-slide', SlideID: slideId, Delta: -1 },
      },
      {
        Kind: 'action',
        ID: 'move-slide-down',
        Label: 'Move Slide Down',
        Icon: 'fa-solid fa-arrow-down',
        Shortcut: FormatMenuShortcut('⌥↓', 'Alt+↓', ctx.IsMac),
        Disabled: atEnd,
        DisabledReason: atEnd ? 'Slide is already at the end of the deck' : undefined,
        Command: { Type: 'move-slide', SlideID: slideId, Delta: 1 },
      },
      {
        Kind: 'action',
        ID: 'move-slide-start',
        Label: 'Move to Beginning',
        Icon: 'fa-solid fa-angles-up',
        Disabled: atStart,
        DisabledReason: atStart ? 'Slide is already at the beginning of the deck' : undefined,
        Command: { Type: 'move-slide-edge', SlideID: slideId, Edge: 'start' },
      },
      {
        Kind: 'action',
        ID: 'move-slide-end',
        Label: 'Move to End',
        Icon: 'fa-solid fa-angles-down',
        Disabled: atEnd,
        DisabledReason: atEnd ? 'Slide is already at the end of the deck' : undefined,
        Command: { Type: 'move-slide-edge', SlideID: slideId, Edge: 'end' },
      },
      { Kind: 'separator', ID: 'sep-filmstrip-design' },
      {
        Kind: 'submenu',
        ID: 'change-layout',
        Label: 'Change Layout',
        Icon: 'fa-solid fa-border-all',
        Disabled: !ctx.CanEditSlide,
        DisabledReason: !ctx.CanEditSlide ? slideLockReason : undefined,
        Children: buildLayoutSubmenuChildren(ctx.Slide, ctx.LayoutCatalog, 'change'),
      },
      {
        Kind: 'submenu',
        ID: 'slide-transition',
        Label: 'Slide Transition',
        Icon: 'fa-solid fa-wand-sparkles',
        Disabled: !ctx.CanEditSlide,
        DisabledReason: !ctx.CanEditSlide ? slideLockReason : undefined,
        Children: buildTransitionSubmenuChildren(ctx.Slide),
      },
      {
        Kind: 'action',
        ID: 'toggle-slide-hidden',
        Label: 'Skip / Hide Slide in Presentation',
        Icon: 'fa-regular fa-eye-slash',
        Role: 'menuitemcheckbox',
        Checked: Boolean(ctx.Slide.Hidden),
        Disabled: !ctx.CanEditSlide,
        DisabledReason: !ctx.CanEditSlide ? slideLockReason : undefined,
        Command: { Type: 'toggle-slide-hidden', SlideID: slideId },
      },
      { Kind: 'separator', ID: 'sep-filmstrip-present' },
    );
  }

  items.push(
    {
      Kind: 'action',
      ID: 'present-from-slide',
      Label: 'Present from This Slide',
      Icon: 'fa-solid fa-play',
      Shortcut: FormatMenuShortcut('⇧⌘↵', 'Ctrl+Shift+Enter', ctx.IsMac),
      Command: { Type: 'present', Mode: 'present', SlideID: slideId },
    },
    {
      Kind: 'action',
      ID: 'presenter-from-slide',
      Label: 'Presenter View from Here',
      Icon: 'fa-solid fa-chalkboard-user',
      Command: { Type: 'present', Mode: 'presenter', SlideID: slideId },
    },
  );

  if (ctx.IsEditable) {
    items.push({
      Kind: 'action',
      ID: 'focus-speaker-notes',
      Label: 'Focus Speaker Notes',
      Icon: 'fa-regular fa-note-sticky',
      Command: { Type: 'focus-speaker-notes', SlideID: slideId },
    });
  }

  if (ctx.CanComment) {
    items.push({
      Kind: 'action',
      ID: 'comment-slide',
      Label: 'Comment on Slide',
      Icon: 'fa-regular fa-comment-dots',
      Command: { Type: 'comment-slide', SlideID: slideId },
    });
  }

  if (ctx.IsEditable) {
    items.push({
      Kind: 'action',
      ID: 'toggle-slide-lock',
      Label: ctx.Slide.Locked ? 'Unlock Slide' : 'Lock Slide',
      Icon: ctx.Slide.Locked ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock',
      Disabled: !ctx.CanToggleSlideLock,
      DisabledReason: !ctx.CanToggleSlideLock ? ctx.SlideLockToggleDisabledReason : undefined,
      Command: { Type: 'toggle-slide-lock', SlideID: slideId },
    });
  }

  items.push({
    Kind: 'action',
    ID: 'copy-slide-markdown',
    Label: 'Copy Slide as Markdown',
    Icon: 'fa-regular fa-copy',
    Command: { Type: 'copy-slide-markdown', SlideID: slideId },
  });

  if (ctx.IsEditable) {
    const deleteDisabled = ctx.TotalSlides <= 1 || !ctx.CanEditSlide;
    const deleteReason =
      ctx.TotalSlides <= 1
        ? 'A presentation must keep at least 1 slide'
        : !ctx.CanEditSlide
          ? slideLockReason
          : undefined;
    items.push(
      { Kind: 'separator', ID: 'sep-filmstrip-danger' },
      {
        Kind: 'action',
        ID: 'delete-slide',
        Label: 'Delete Slide',
        Icon: 'fa-regular fa-trash-can',
        Shortcut: FormatMenuShortcut('⌫', 'Del', ctx.IsMac),
        Destructive: true,
        Disabled: deleteDisabled,
        DisabledReason: deleteReason,
        Command: { Type: 'delete-slide', SlideID: slideId },
      },
    );
  }

  return items;
}

function buildFilmstripEmptyMenu(
  ctx: SlidesContextMenuSnapshot,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  const items: ContextMenuItem<SlidesContextMenuCommand>[] = [];

  if (ctx.IsEditable) {
    items.push(
      {
        Kind: 'action',
        ID: 'add-slide-new',
        Label: 'New Slide',
        Icon: 'fa-solid fa-plus',
        Command: { Type: 'add-slide', Layout: 'TitleAndBody' },
      },
      {
        Kind: 'submenu',
        ID: 'add-slide-layout',
        Label: 'New Slide With Layout',
        Icon: 'fa-solid fa-table-columns',
        Children: buildLayoutSubmenuChildren(ctx.Slide, ctx.LayoutCatalog, 'insert-after'),
      },
      { Kind: 'separator', ID: 'sep-strip-theme' },
      {
        Kind: 'submenu',
        ID: 'deck-theme-preset',
        Label: 'Deck Theme Preset',
        Icon: 'fa-solid fa-palette',
        Children: buildThemeSubmenuChildren(ctx),
      },
      { Kind: 'separator', ID: 'sep-strip-present' },
    );
  }

  items.push(
    {
      Kind: 'action',
      ID: 'start-presentation',
      Label: 'Start Presentation',
      Icon: 'fa-solid fa-play',
      Command: { Type: 'present', Mode: 'present' },
    },
    {
      Kind: 'action',
      ID: 'open-presenter-cockpit',
      Label: 'Open Presenter Cockpit',
      Icon: 'fa-solid fa-chalkboard-user',
      Command: { Type: 'present', Mode: 'presenter' },
    },
    { Kind: 'separator', ID: 'sep-strip-export' },
    {
      Kind: 'action',
      ID: 'export-pptx',
      Label: 'Export PowerPoint (.pptx)',
      Icon: 'fa-solid fa-file-powerpoint',
      Command: { Type: 'export', Format: 'pptx' },
    },
    {
      Kind: 'action',
      ID: 'export-pdf',
      Label: 'Export Printable PDF',
      Icon: 'fa-solid fa-file-pdf',
      Command: { Type: 'export', Format: 'pdf' },
    },
  );

  return items;
}

function buildStageBackgroundMenu(
  ctx: SlidesContextMenuSnapshot,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  if (!ctx.IsEditable) {
    return buildViewerStageMenu(ctx);
  }

  const items: ContextMenuItem<SlidesContextMenuCommand>[] = [];
  const slideId = ctx.Slide.SlideID;
  const targetRegion = ctx.TargetRegion ?? ctx.Slide.Regions[0];
  const slideLockReason = ctx.SlideLockedReason || DEFAULT_LOCKED_SLIDE_REASON;
  const canEditTargetRegion = targetRegion ? (ctx.CanEditRegion ?? ctx.CanEditSlide) : false;
  const regionLockReason = ctx.RegionLockedReason || slideLockReason;

  if (targetRegion) {
    items.push(
      { Kind: 'header', ID: 'hdr-stage-insert', Label: 'Insert on Slide' },
      {
        Kind: 'action',
        ID: 'stage-add-text',
        Label: 'Add Text Paragraph',
        Icon: 'fa-solid fa-align-left',
        Disabled: !canEditTargetRegion,
        DisabledReason: !canEditTargetRegion ? regionLockReason : undefined,
        Command: {
          Type: 'insert-region-content',
          SlideID: slideId,
          RegionID: targetRegion.RegionID,
          Preset: 'text',
        },
      },
      {
        Kind: 'action',
        ID: 'stage-add-bullets',
        Label: 'Add Bullet List',
        Icon: 'fa-solid fa-list-ul',
        Disabled: !canEditTargetRegion,
        DisabledReason: !canEditTargetRegion ? regionLockReason : undefined,
        Command: {
          Type: 'insert-region-content',
          SlideID: slideId,
          RegionID: targetRegion.RegionID,
          Preset: 'bullets',
        },
      },
      {
        Kind: 'action',
        ID: 'stage-embed-live-view',
        Label: 'Embed Live Data View…',
        Icon: 'fa-solid fa-table-list',
        Disabled: !canEditTargetRegion,
        DisabledReason: !canEditTargetRegion ? regionLockReason : undefined,
        Command: {
          Type: 'insert-region-content',
          SlideID: slideId,
          RegionID: targetRegion.RegionID,
          Preset: 'live-view',
        },
      },
      {
        Kind: 'action',
        ID: 'stage-embed-sheet-chart',
        Label: 'Embed Spreadsheet Chart / Range…',
        Icon: 'fa-solid fa-chart-column',
        Disabled: !canEditTargetRegion,
        DisabledReason: !canEditTargetRegion ? regionLockReason : undefined,
        Command: {
          Type: 'insert-region-content',
          SlideID: slideId,
          RegionID: targetRegion.RegionID,
          Preset: 'sheet-chart',
        },
      },
      {
        Kind: 'action',
        ID: 'stage-embed-whiteboard',
        Label: 'Embed Inline Whiteboard',
        Icon: 'fa-solid fa-draw-polygon',
        Disabled: !canEditTargetRegion,
        DisabledReason: !canEditTargetRegion ? regionLockReason : undefined,
        Command: {
          Type: 'insert-region-content',
          SlideID: slideId,
          RegionID: targetRegion.RegionID,
          Preset: 'whiteboard',
        },
      },
      {
        Kind: 'action',
        ID: 'stage-paste-region',
        Label: 'Paste Region Content',
        Icon: 'fa-regular fa-clipboard',
        Shortcut: FormatMenuShortcut('⌘V', 'Ctrl+V', ctx.IsMac),
        Disabled: !canEditTargetRegion || !ctx.HasCopiedRegion,
        DisabledReason: !canEditTargetRegion
          ? regionLockReason
          : !ctx.HasCopiedRegion
            ? 'Copy a slide region first'
            : undefined,
        Command: {
          Type: 'paste-region',
          SlideID: slideId,
          RegionID: targetRegion.RegionID,
        },
      },
      { Kind: 'separator', ID: 'sep-stage-design' },
    );
  }

  items.push(
    {
      Kind: 'submenu',
      ID: 'change-layout',
      Label: 'Change Slide Layout',
      Icon: 'fa-solid fa-border-all',
      Disabled: !ctx.CanEditSlide,
      DisabledReason: !ctx.CanEditSlide ? slideLockReason : undefined,
      Children: buildLayoutSubmenuChildren(ctx.Slide, ctx.LayoutCatalog, 'change'),
    },
    {
      Kind: 'submenu',
      ID: 'deck-theme-preset',
      Label: 'Deck Theme Preset',
      Icon: 'fa-solid fa-palette',
      Children: buildThemeSubmenuChildren(ctx),
    },
    {
      Kind: 'submenu',
      ID: 'slide-transition',
      Label: 'Slide Transition',
      Icon: 'fa-solid fa-wand-sparkles',
      Disabled: !ctx.CanEditSlide,
      DisabledReason: !ctx.CanEditSlide ? slideLockReason : undefined,
      Children: buildTransitionSubmenuChildren(ctx.Slide),
    },
    {
      Kind: 'action',
      ID: 'add-slide-after',
      Label: 'New Slide After',
      Icon: 'fa-solid fa-plus',
      Command: { Type: 'add-slide', AfterSlideID: slideId, Layout: 'TitleAndBody' },
    },
    {
      Kind: 'action',
      ID: 'duplicate-slide',
      Label: 'Duplicate Slide',
      Icon: 'fa-regular fa-clone',
      Shortcut: FormatMenuShortcut('⌘D', 'Ctrl+D', ctx.IsMac),
      Command: { Type: 'duplicate-slide', SlideID: slideId },
    },
    { Kind: 'separator', ID: 'sep-stage-gov' },
    {
      Kind: 'action',
      ID: 'toggle-slide-lock',
      Label: ctx.Slide.Locked ? 'Unlock Current Slide' : 'Lock Current Slide',
      Icon: ctx.Slide.Locked ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock',
      Disabled: !ctx.CanToggleSlideLock,
      DisabledReason: !ctx.CanToggleSlideLock ? ctx.SlideLockToggleDisabledReason : undefined,
      Command: { Type: 'toggle-slide-lock', SlideID: slideId },
    },
  );

  if (ctx.IsAiAssistantEnabled) {
    items.push({
      Kind: 'action',
      ID: 'ask-ai-slide',
      Label: 'Ask AI for This Slide…',
      Icon: 'fa-solid fa-wand-magic-sparkles',
      Command: { Type: 'ask-ai-slide', SlideID: slideId },
    });
  }

  items.push(
    { Kind: 'separator', ID: 'sep-stage-present' },
    {
      Kind: 'action',
      ID: 'present-from-slide',
      Label: 'Present from Current Slide',
      Icon: 'fa-solid fa-play',
      Shortcut: FormatMenuShortcut('⇧⌘↵', 'Ctrl+Shift+Enter', ctx.IsMac),
      Command: { Type: 'present', Mode: 'present', SlideID: slideId },
    },
    {
      Kind: 'action',
      ID: 'presenter-from-slide',
      Label: 'Open Presenter Cockpit',
      Icon: 'fa-solid fa-chalkboard-user',
      Command: { Type: 'present', Mode: 'presenter', SlideID: slideId },
    },
  );

  return items;
}

function buildSlideRegionMenu(
  ctx: SlidesContextMenuSnapshot,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  const region = ctx.TargetRegion ?? ctx.Slide.Regions[0];
  if (!region) {
    return ctx.IsEditable ? buildStageBackgroundMenu(ctx) : buildViewerStageMenu(ctx);
  }

  const items: ContextMenuItem<SlidesContextMenuCommand>[] = [];
  const slideId = ctx.Slide.SlideID;
  const regionId = region.RegionID;
  const canEditRegion = ctx.IsEditable && Boolean(ctx.CanEditRegion ?? ctx.CanEditSlide);
  const regionLockReason = ctx.RegionLockedReason || ctx.SlideLockedReason || DEFAULT_LOCKED_REGION_REASON;
  const hasBlock = region.Kind === 'mj-block' || Boolean(region.BlockSpec);

  if (ctx.IsEditable) {
    if (ctx.IsOleBlock) {
      items.push({
        Kind: 'action',
        ID: 'toggle-ole-edit',
        Label: ctx.IsOleEditing ? 'Done Editing Canvas' : 'Edit Canvas Inline',
        Icon: ctx.IsOleEditing ? 'fa-solid fa-check' : 'fa-solid fa-pen',
        Disabled: !canEditRegion,
        DisabledReason: !canEditRegion ? regionLockReason : undefined,
        Command: { Type: 'toggle-ole-edit', SlideID: slideId, RegionID: regionId },
      });
    } else {
      items.push({
        Kind: 'action',
        ID: 'edit-region-inline',
        Label: 'Edit Content Inline',
        Icon: 'fa-solid fa-pen',
        Disabled: !canEditRegion,
        DisabledReason: !canEditRegion ? regionLockReason : undefined,
        Command: { Type: 'edit-region-inline', SlideID: slideId, RegionID: regionId },
      });
    }

    items.push({
      Kind: 'action',
      ID: 'cut-region',
      Label: 'Cut Region Content',
      Icon: 'fa-solid fa-scissors',
      Shortcut: FormatMenuShortcut('⌘X', 'Ctrl+X', ctx.IsMac),
      Disabled: !canEditRegion,
      DisabledReason: !canEditRegion ? regionLockReason : undefined,
      Command: { Type: 'cut-region', SlideID: slideId, RegionID: regionId },
    });
  }

  items.push({
    Kind: 'action',
    ID: 'copy-region',
    Label: 'Copy Region',
    Icon: 'fa-regular fa-copy',
    Shortcut: FormatMenuShortcut('⌘C', 'Ctrl+C', ctx.IsMac),
    Command: { Type: 'copy-region', SlideID: slideId, RegionID: regionId },
  });

  if (ctx.IsEditable) {
    items.push(
      {
        Kind: 'action',
        ID: 'duplicate-region',
        Label: 'Duplicate Region',
        Icon: 'fa-regular fa-clone',
        Shortcut: FormatMenuShortcut('⌘D', 'Ctrl+D', ctx.IsMac),
        Disabled: !canEditRegion,
        DisabledReason: !canEditRegion ? regionLockReason : undefined,
        Command: { Type: 'duplicate-region', SlideID: slideId, RegionID: regionId },
      },
      {
        Kind: 'action',
        ID: 'paste-region',
        Label: 'Paste into Region',
        Icon: 'fa-regular fa-clipboard',
        Shortcut: FormatMenuShortcut('⌘V', 'Ctrl+V', ctx.IsMac),
        Disabled: !canEditRegion || !ctx.HasCopiedRegion,
        DisabledReason: !canEditRegion
          ? regionLockReason
          : !ctx.HasCopiedRegion
            ? 'Copy a slide region first'
            : undefined,
        Command: { Type: 'paste-region', SlideID: slideId, RegionID: regionId },
      },
      { Kind: 'separator', ID: 'sep-region-type' },
      {
        Kind: 'submenu',
        ID: 'region-content-type',
        Label: 'Region Content Type',
        Icon: 'fa-solid fa-layer-group',
        Disabled: !canEditRegion,
        DisabledReason: !canEditRegion ? regionLockReason : undefined,
        Children: REGION_KIND_OPTIONS.map((opt) => ({
          Kind: 'action',
          ID: `region-kind-${opt.Kind}`,
          Label: opt.Label,
          Icon: opt.Icon,
          Role: 'menuitemradio',
          Checked: region.Kind === opt.Kind,
          Command: {
            Type: 'change-region-kind',
            SlideID: slideId,
            RegionID: regionId,
            Kind: opt.Kind,
          },
        })),
      },
    );

    const totalRegions = ctx.TotalRegions ?? ctx.Slide.Regions.length;
    const regionIdx = ctx.RegionIndex ?? ctx.Slide.Regions.findIndex((r) => r.RegionID === regionId);
    if (totalRegions > 1) {
      const atFirst = regionIdx <= 0;
      const atLast = regionIdx >= totalRegions - 1;
      const canSwapEarlier = canEditRegion && (ctx.CanSwapEarlier ?? true);
      const swapEarlierReason = !canEditRegion
        ? regionLockReason
        : ctx.CanSwapEarlier === false
          ? (ctx.SwapEarlierDisabledReason || DEFAULT_LOCKED_REGION_REASON)
          : undefined;
      const canSwapLater = canEditRegion && (ctx.CanSwapLater ?? true);
      const swapLaterReason = !canEditRegion
        ? regionLockReason
        : ctx.CanSwapLater === false
          ? (ctx.SwapLaterDisabledReason || DEFAULT_LOCKED_REGION_REASON)
          : undefined;
      items.push(
        {
          Kind: 'action',
          ID: 'swap-region-earlier',
          Label: 'Move Region Earlier (Swap Left)',
          Icon: 'fa-solid fa-arrow-left-long',
          Disabled: !canSwapEarlier || atFirst,
          DisabledReason: !canSwapEarlier
            ? swapEarlierReason
            : atFirst
              ? 'Region is already first on this slide'
              : undefined,
          Command: { Type: 'swap-region', SlideID: slideId, RegionID: regionId, Delta: -1 },
        },
        {
          Kind: 'action',
          ID: 'swap-region-later',
          Label: 'Move Region Later (Swap Right)',
          Icon: 'fa-solid fa-arrow-right-long',
          Disabled: !canSwapLater || atLast,
          DisabledReason: !canSwapLater
            ? swapLaterReason
            : atLast
              ? 'Region is already last on this slide'
              : undefined,
          Command: { Type: 'swap-region', SlideID: slideId, RegionID: regionId, Delta: 1 },
        },
      );
    }
  }

  if (hasBlock) {
    items.push({ Kind: 'separator', ID: 'sep-region-block' });

    if (!ctx.IsOleBlock && ctx.BlockMode !== 'Frozen') {
      items.push({
        Kind: 'action',
        ID: 'refresh-region-block',
        Label: 'Refresh Live Data',
        Icon: 'fa-solid fa-arrows-rotate',
        Command: { Type: 'refresh-region-block', SlideID: slideId, RegionID: regionId },
      });
    }

    if (ctx.IsEditable && ctx.IsSheetBackedBlock) {
      items.push({
        Kind: 'action',
        ID: 'open-sheet-embed',
        Label: 'Change Sheet Chart / Range…',
        Icon: 'fa-solid fa-chart-pie',
        Disabled: !canEditRegion,
        DisabledReason: !canEditRegion ? regionLockReason : undefined,
        Command: { Type: 'open-sheet-embed', SlideID: slideId, RegionID: regionId },
      });
    }

    if (ctx.IsEditable && ctx.NewerWorkbookVersionNumber != null) {
      items.push({
        Kind: 'action',
        ID: 'update-workbook-version',
        Label: `Update from Latest Workbook (v${ctx.NewerWorkbookVersionNumber})`,
        Icon: 'fa-solid fa-cloud-arrow-down',
        Disabled: !canEditRegion,
        DisabledReason: !canEditRegion ? regionLockReason : undefined,
        Command: { Type: 'update-workbook-version', SlideID: slideId, RegionID: regionId },
      });
    }

    if (ctx.IsEditable && !ctx.IsOleBlock) {
      if (ctx.BlockMode === 'Frozen') {
        items.push({
          Kind: 'action',
          ID: 'unfreeze-region-block',
          Label: 'Switch to Live',
          Icon: 'fa-solid fa-bolt',
          Disabled: !canEditRegion,
          DisabledReason: !canEditRegion ? regionLockReason : undefined,
          Command: { Type: 'unfreeze-region-block', SlideID: slideId, RegionID: regionId },
        });
      } else {
        items.push({
          Kind: 'action',
          ID: 'freeze-region-block',
          Label: 'Freeze Snapshot…',
          Icon: 'fa-solid fa-snowflake',
          Disabled: !canEditRegion,
          DisabledReason: !canEditRegion ? regionLockReason : undefined,
          Command: { Type: 'freeze-region-block', SlideID: slideId, RegionID: regionId },
        });
      }
    }

    if (ctx.SourceArtifactID) {
      items.push({
        Kind: 'action',
        ID: 'open-source-artifact',
        Label: 'Open Source Artifact',
        Icon: 'fa-solid fa-arrow-up-right-from-square',
        Command: { Type: 'open-source-artifact', ArtifactID: ctx.SourceArtifactID },
      });
    }

    items.push({
      Kind: 'action',
      ID: 'copy-block-json',
      Label: 'Copy Live Block JSON',
      Icon: 'fa-solid fa-code',
      Command: { Type: 'copy-block-json', SlideID: slideId, RegionID: regionId },
    });
  }

  items.push({ Kind: 'separator', ID: 'sep-region-gov' });

  if (ctx.CanComment) {
    items.push({
      Kind: 'action',
      ID: 'comment-region',
      Label: 'Comment on Region',
      Icon: 'fa-regular fa-comment-dots',
      Command: { Type: 'comment-region', SlideID: slideId, RegionID: regionId },
    });
  }

  if (ctx.IsEditable) {
    const canToggleLock = ctx.CanToggleRegionLock ?? canEditRegion;
    items.push(
      {
        Kind: 'action',
        ID: 'toggle-region-lock',
        Label: region.Locked ? 'Unlock Region' : 'Lock Region',
        Icon: region.Locked ? 'fa-solid fa-lock-open' : 'fa-solid fa-lock',
        Disabled: !canToggleLock,
        DisabledReason: !canToggleLock ? ctx.RegionLockToggleDisabledReason : undefined,
        Command: { Type: 'toggle-region-lock', SlideID: slideId, RegionID: regionId },
      },
      { Kind: 'separator', ID: 'sep-region-danger' },
      {
        Kind: 'action',
        ID: 'clear-region',
        Label: 'Clear Region Content',
        Icon: 'fa-solid fa-eraser',
        Destructive: true,
        Disabled: !canEditRegion,
        DisabledReason: !canEditRegion ? regionLockReason : undefined,
        Command: { Type: 'clear-region', SlideID: slideId, RegionID: regionId },
      },
    );
  }

  return items;
}

function buildSpeakerNotesMenu(
  ctx: SlidesContextMenuSnapshot,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  const hasNotes = Boolean(ctx.Slide.SpeakerNotes && ctx.Slide.SpeakerNotes.trim().length > 0);
  const items: ContextMenuItem<SlidesContextMenuCommand>[] = [
    {
      Kind: 'action',
      ID: 'copy-speaker-notes',
      Label: 'Copy Speaker Notes',
      Icon: 'fa-regular fa-copy',
      Disabled: !hasNotes,
      DisabledReason: !hasNotes ? 'No speaker notes recorded for this slide' : undefined,
      Command: { Type: 'copy-speaker-notes', SlideID: ctx.Slide.SlideID },
    },
    {
      Kind: 'action',
      ID: 'copy-slide-and-notes-markdown',
      Label: 'Copy Full Slide + Notes as Markdown',
      Icon: 'fa-brands fa-markdown',
      Command: { Type: 'copy-slide-and-notes-markdown', SlideID: ctx.Slide.SlideID },
    },
  ];

  if (ctx.WorkspaceMode === 'presenter') {
    items.push(
      { Kind: 'separator', ID: 'sep-notes-presenter' },
      {
        Kind: 'action',
        ID: 'reset-presenter-timer',
        Label: 'Reset Elapsed Timer',
        Icon: 'fa-solid fa-stopwatch',
        Command: { Type: 'reset-presenter-timer' },
      },
      {
        Kind: 'action',
        ID: 'nav-prev-slide',
        Label: 'Previous Slide',
        Icon: 'fa-solid fa-chevron-left',
        Shortcut: '←',
        Disabled: !ctx.HasPreviousVisibleSlide,
        DisabledReason: !ctx.HasPreviousVisibleSlide ? 'Already at the first visible slide' : undefined,
        Command: { Type: 'navigate-slide', Direction: 'prev' },
      },
      {
        Kind: 'action',
        ID: 'nav-next-slide',
        Label: 'Next Slide',
        Icon: 'fa-solid fa-chevron-right',
        Shortcut: '→',
        Disabled: !ctx.HasNextVisibleSlide,
        DisabledReason: !ctx.HasNextVisibleSlide ? 'Already at the last visible slide' : undefined,
        Command: { Type: 'navigate-slide', Direction: 'next' },
      },
      {
        Kind: 'action',
        ID: 'exit-presentation',
        Label: 'Exit Presentation',
        Icon: 'fa-solid fa-xmark',
        Shortcut: 'Esc',
        Command: { Type: 'exit-presentation' },
      },
    );
  }

  return items;
}

function buildViewerStageMenu(
  ctx: SlidesContextMenuSnapshot,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  const items: ContextMenuItem<SlidesContextMenuCommand>[] = [
    {
      Kind: 'action',
      ID: 'present-from-slide',
      Label: 'Start Presentation',
      Icon: 'fa-solid fa-play',
      Command: { Type: 'present', Mode: 'present', SlideID: ctx.Slide.SlideID },
    },
    {
      Kind: 'action',
      ID: 'presenter-from-slide',
      Label: 'Open Presenter Cockpit',
      Icon: 'fa-solid fa-chalkboard-user',
      Command: { Type: 'present', Mode: 'presenter', SlideID: ctx.Slide.SlideID },
    },
    { Kind: 'separator', ID: 'sep-viewer-nav' },
    {
      Kind: 'action',
      ID: 'nav-prev-slide',
      Label: 'Previous Slide',
      Icon: 'fa-solid fa-chevron-left',
      Shortcut: '←',
      Disabled: !ctx.HasPreviousVisibleSlide,
      DisabledReason: !ctx.HasPreviousVisibleSlide ? 'Already at the first slide' : undefined,
      Command: { Type: 'navigate-slide', Direction: 'prev' },
    },
    {
      Kind: 'action',
      ID: 'nav-next-slide',
      Label: 'Next Slide',
      Icon: 'fa-solid fa-chevron-right',
      Shortcut: '→',
      Disabled: !ctx.HasNextVisibleSlide,
      DisabledReason: !ctx.HasNextVisibleSlide ? 'Already at the last slide' : undefined,
      Command: { Type: 'navigate-slide', Direction: 'next' },
    },
    {
      Kind: 'submenu',
      ID: 'jump-to-slide',
      Label: 'Jump to Slide',
      Icon: 'fa-solid fa-list-ol',
      Children: buildJumpToSlideChildren(ctx, false),
    },
    { Kind: 'separator', ID: 'sep-viewer-copy' },
    {
      Kind: 'action',
      ID: 'copy-slide-markdown',
      Label: 'Copy Slide Text as Markdown',
      Icon: 'fa-regular fa-copy',
      Shortcut: FormatMenuShortcut('⌘C', 'Ctrl+C', ctx.IsMac),
      Command: { Type: 'copy-slide-markdown', SlideID: ctx.Slide.SlideID },
    },
  ];

  if (ctx.CanComment) {
    items.push({
      Kind: 'action',
      ID: 'comment-slide',
      Label: 'Comment on Slide',
      Icon: 'fa-regular fa-comment-dots',
      Command: { Type: 'comment-slide', SlideID: ctx.Slide.SlideID },
    });
  }

  items.push(
    { Kind: 'separator', ID: 'sep-viewer-export' },
    {
      Kind: 'action',
      ID: 'export-pptx',
      Label: 'Export PowerPoint (.pptx)',
      Icon: 'fa-solid fa-file-powerpoint',
      Command: { Type: 'export', Format: 'pptx' },
    },
    {
      Kind: 'action',
      ID: 'export-pdf',
      Label: 'Export Printable PDF',
      Icon: 'fa-solid fa-file-pdf',
      Command: { Type: 'export', Format: 'pdf' },
    },
  );

  return items;
}

function buildPresentationStageMenu(
  ctx: SlidesContextMenuSnapshot,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  const visibleSlides = buildJumpToSlideChildren(ctx, true);
  const items: ContextMenuItem<SlidesContextMenuCommand>[] = [
    {
      Kind: 'action',
      ID: 'nav-prev-slide',
      Label: 'Previous Slide',
      Icon: 'fa-solid fa-chevron-left',
      Shortcut: '←',
      Disabled: !ctx.HasPreviousVisibleSlide,
      DisabledReason: !ctx.HasPreviousVisibleSlide ? 'Already at the first visible slide' : undefined,
      Command: { Type: 'navigate-slide', Direction: 'prev' },
    },
    {
      Kind: 'action',
      ID: 'nav-next-slide',
      Label: 'Next Slide',
      Icon: 'fa-solid fa-chevron-right',
      Shortcut: '→',
      Disabled: !ctx.HasNextVisibleSlide,
      DisabledReason: !ctx.HasNextVisibleSlide ? 'Already at the last visible slide' : undefined,
      Command: { Type: 'navigate-slide', Direction: 'next' },
    },
    {
      Kind: 'submenu',
      ID: 'jump-to-slide',
      Label: 'Jump to Slide',
      Icon: 'fa-solid fa-list-ol',
      Disabled: visibleSlides.length === 0,
      Children: visibleSlides,
    },
    { Kind: 'separator', ID: 'sep-present-data' },
    {
      Kind: 'action',
      ID: 'refresh-presentation-live-blocks',
      Label: 'Refresh Live Data',
      Icon: 'fa-solid fa-arrows-rotate',
      Command: { Type: 'refresh-presentation-live-blocks' },
    },
    {
      Kind: 'action',
      ID: 'copy-slide-markdown',
      Label: 'Copy Slide Text as Markdown',
      Icon: 'fa-regular fa-copy',
      Shortcut: FormatMenuShortcut('⌘C', 'Ctrl+C', ctx.IsMac),
      Command: { Type: 'copy-slide-markdown', SlideID: ctx.Slide.SlideID },
    },
    { Kind: 'separator', ID: 'sep-present-mode' },
  ];

  if (ctx.WorkspaceMode === 'present') {
    items.push({
      Kind: 'action',
      ID: 'switch-to-presenter',
      Label: 'Switch to Presenter View',
      Icon: 'fa-solid fa-chalkboard-user',
      Command: { Type: 'present', Mode: 'presenter', SlideID: ctx.Slide.SlideID },
    });
  } else {
    items.push({
      Kind: 'action',
      ID: 'switch-to-present',
      Label: 'Switch to Standard Presentation',
      Icon: 'fa-solid fa-play',
      Command: { Type: 'present', Mode: 'present', SlideID: ctx.Slide.SlideID },
    });
  }

  items.push(
    {
      Kind: 'action',
      ID: 'exit-presentation',
      Label: 'Exit Presentation',
      Icon: 'fa-solid fa-xmark',
      Shortcut: 'Esc',
      Command: { Type: 'exit-presentation' },
    },
    { Kind: 'separator', ID: 'sep-present-export' },
    {
      Kind: 'action',
      ID: 'export-pptx',
      Label: 'Export PowerPoint (.pptx)',
      Icon: 'fa-solid fa-file-powerpoint',
      Command: { Type: 'export', Format: 'pptx' },
    },
    {
      Kind: 'action',
      ID: 'export-pdf',
      Label: 'Export Printable PDF',
      Icon: 'fa-solid fa-file-pdf',
      Command: { Type: 'export', Format: 'pdf' },
    },
  );

  return items;
}

/**
 * Pure descriptor builder for MJ Slides right-click context menus across Zones 3a–3d.
 * Returns normalized `ContextMenuItem<SlidesContextMenuCommand>[]` with zero `any`/`unknown`.
 */
export function BuildSlidesContextMenu(
  ctx: SlidesContextMenuSnapshot,
): ContextMenuItem<SlidesContextMenuCommand>[] {
  let raw: ContextMenuItem<SlidesContextMenuCommand>[];

  switch (ctx.Zone) {
    case 'filmstrip-slide':
      raw = buildFilmstripSlideMenu(ctx);
      break;
    case 'filmstrip-empty':
      raw = buildFilmstripEmptyMenu(ctx);
      break;
    case 'stage-background':
      raw = buildStageBackgroundMenu(ctx);
      break;
    case 'slide-region':
      raw = buildSlideRegionMenu(ctx);
      break;
    case 'speaker-notes':
      raw = buildSpeakerNotesMenu(ctx);
      break;
    case 'viewer-stage':
      raw = buildViewerStageMenu(ctx);
      break;
    case 'presentation-stage':
      raw = buildPresentationStageMenu(ctx);
      break;
  }

  return NormalizeContextMenuItems(raw);
}
