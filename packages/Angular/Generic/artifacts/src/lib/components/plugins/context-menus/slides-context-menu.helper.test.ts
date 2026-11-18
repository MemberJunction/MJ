import { describe, expect, it } from 'vitest';
import {
  SLIDE_DECK_THEME_PRESETS,
  SLIDE_LAYOUT_CATALOG,
  type SlideSpec,
} from '@memberjunction/core-entities';
import type {
  ContextMenuActionItem,
  ContextMenuItem,
  ContextMenuSubmenuItem,
} from '../../context-menu/context-menu.types';
import {
  BuildSlidesContextMenu,
  ComputeSlidesMenuAriaLabel,
  SerializeSlideToMarkdown,
  type SlidesContextMenuCommand,
  type SlidesContextMenuSnapshot,
  type SlidesJumpTargetSummary,
} from './slides-context-menu.helper';

function findAction(
  items: ReadonlyArray<ContextMenuItem<SlidesContextMenuCommand>>,
  id: string,
): ContextMenuActionItem<SlidesContextMenuCommand> | undefined {
  for (const item of items) {
    if (item.Kind === 'action' && item.ID === id) {
      return item;
    }
    if (item.Kind === 'submenu') {
      const nested = findAction(item.Children, id);
      if (nested) {
        return nested;
      }
    }
  }
  return undefined;
}

function findSubmenu(
  items: ReadonlyArray<ContextMenuItem<SlidesContextMenuCommand>>,
  id: string,
): ContextMenuSubmenuItem<SlidesContextMenuCommand> | undefined {
  for (const item of items) {
    if (item.Kind === 'submenu' && item.ID === id) {
      return item;
    }
  }
  return undefined;
}

function makeSlide(overrides: Partial<SlideSpec> = {}): SlideSpec {
  return {
    SlideID: 'slide-1',
    SlideNumber: 1,
    Layout: 'TitleAndBody',
    Title: 'Quarterly Review',
    Subtitle: 'Architecture & Metrics',
    Regions: [
      {
        RegionID: 'main',
        Label: 'Slide Body',
        Kind: 'rich-text',
        MarkdownContent: '- Bullet one\n- Bullet two',
      },
    ],
    SpeakerNotes: 'Emphasize Q4 throughput.',
    Transition: 'fade',
    Hidden: false,
    ...overrides,
  };
}

function makeTwoColumnSlide(overrides: Partial<SlideSpec> = {}): SlideSpec {
  return makeSlide({
    SlideID: 'slide-2',
    SlideNumber: 2,
    Layout: 'TwoColumn',
    Title: 'Two Column Comparison',
    Regions: [
      {
        RegionID: 'left',
        Label: 'Left Column',
        Kind: 'rich-text',
        MarkdownContent: 'Left content',
      },
      {
        RegionID: 'right',
        Label: 'Right Column',
        Kind: 'mj-block',
        MarkdownContent: '',
        BlockSpec: {
          BlockID: 'blk-1',
          Kind: 'EntityView',
          Mode: 'Live',
          Title: 'Live Artifacts',
          EntityName: 'MJ: Artifacts',
        },
      },
    ],
    ...overrides,
  });
}

function makeSnapshot(
  overrides: Partial<SlidesContextMenuSnapshot> = {},
): SlidesContextMenuSnapshot {
  const slide = overrides.Slide ?? makeSlide();
  const slides: SlidesJumpTargetSummary[] = overrides.Slides
    ? [...overrides.Slides]
    : [
        { SlideID: 'slide-1', SlideNumber: 1, Title: 'Slide 1', Hidden: false },
        { SlideID: 'slide-2', SlideNumber: 2, Title: 'Slide 2', Hidden: false },
        { SlideID: 'slide-3', SlideNumber: 3, Title: 'Slide 3', Hidden: false },
      ];

  return {
    Zone: 'filmstrip-slide',
    IsEditable: true,
    CanComment: true,
    IsAiAssistantEnabled: true,
    WorkspaceMode: 'edit',
    TotalSlides: slides.length,
    Slides: slides,
    Slide: slide,
    SlideIndex: 0,
    CanEditSlide: true,
    CanToggleSlideLock: true,
    HasCopiedRegion: false,
    HasPreviousVisibleSlide: false,
    HasNextVisibleSlide: true,
    ActiveThemeID: SLIDE_DECK_THEME_PRESETS[0].ThemeID,
    LayoutCatalog: SLIDE_LAYOUT_CATALOG,
    ThemePresets: SLIDE_DECK_THEME_PRESETS,
    IsMac: true,
    ...overrides,
  };
}

describe('slides-context-menu.helper', () => {
  describe('Zone 3a: filmstrip-slide', () => {
    it('disables Delete Slide with reason when deck has only 1 slide', () => {
      const slide = makeSlide();
      const items = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'filmstrip-slide',
          Slide: slide,
          TotalSlides: 1,
          Slides: [{ SlideID: slide.SlideID, SlideNumber: 1, Title: slide.Title, Hidden: false }],
          SlideIndex: 0,
        }),
      );

      const del = findAction(items, 'delete-slide');
      expect(del).toBeDefined();
      expect(del?.Disabled).toBe(true);
      expect(del?.Destructive).toBe(true);
      expect(del?.DisabledReason).toContain('at least 1 slide');
    });

    it('guards Move Up / Move to Beginning on first slide and Move Down / Move to End on last slide', () => {
      const firstItems = BuildSlidesContextMenu(makeSnapshot({ SlideIndex: 0, TotalSlides: 3 }));
      expect(findAction(firstItems, 'move-slide-up')?.Disabled).toBe(true);
      expect(findAction(firstItems, 'move-slide-start')?.Disabled).toBe(true);
      expect(findAction(firstItems, 'move-slide-down')?.Disabled).toBe(false);
      expect(findAction(firstItems, 'move-slide-end')?.Disabled).toBe(false);

      const lastItems = BuildSlidesContextMenu(makeSnapshot({ SlideIndex: 2, TotalSlides: 3 }));
      expect(findAction(lastItems, 'move-slide-up')?.Disabled).toBe(false);
      expect(findAction(lastItems, 'move-slide-start')?.Disabled).toBe(false);
      expect(findAction(lastItems, 'move-slide-down')?.Disabled).toBe(true);
      expect(findAction(lastItems, 'move-slide-end')?.Disabled).toBe(true);

      const midItems = BuildSlidesContextMenu(makeSnapshot({ SlideIndex: 1, TotalSlides: 3 }));
      expect(findAction(midItems, 'move-slide-up')?.Disabled).toBe(false);
      expect(findAction(midItems, 'move-slide-down')?.Disabled).toBe(false);
      expect(findAction(midItems, 'move-slide-start')?.Command).toEqual({
        Type: 'move-slide-edge',
        SlideID: 'slide-1',
        Edge: 'start',
      });
      expect(findAction(midItems, 'move-slide-end')?.Command).toEqual({
        Type: 'move-slide-edge',
        SlideID: 'slide-1',
        Edge: 'end',
      });
    });

    it('renders Change Layout, Slide Transition, and Skip/Hide Slide checkbox state', () => {
      const slide = makeSlide({
        SlideID: 'slide-2',
        Layout: 'TwoColumn',
        Transition: 'slide',
        Hidden: true,
      });
      const items = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'filmstrip-slide',
          Slide: slide,
          SlideIndex: 1,
        }),
      );

      const layoutSub = findSubmenu(items, 'change-layout');
      expect(layoutSub?.Children.length).toBe(SLIDE_LAYOUT_CATALOG.length);
      expect(findAction(items, 'change-layout-TwoColumn')?.Checked).toBe(true);
      expect(findAction(items, 'change-layout-Title')?.Checked).toBe(false);

      const transSub = findSubmenu(items, 'slide-transition');
      expect(transSub?.Children.length).toBe(4);
      expect(findAction(items, 'transition-slide')?.Checked).toBe(true);
      expect(findAction(items, 'transition-fade')?.Checked).toBe(false);
      expect(findAction(items, 'transition-zoom')?.Checked).toBe(false);

      const hideItem = findAction(items, 'toggle-slide-hidden');
      expect(hideItem?.Role).toBe('menuitemcheckbox');
      expect(hideItem?.Checked).toBe(true);
      expect(hideItem?.Command).toEqual({ Type: 'toggle-slide-hidden', SlideID: 'slide-2' });
    });

    it('disables slide-mutating controls with reason when slide is locked for actor', () => {
      const items = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'filmstrip-slide',
          CanEditSlide: false,
          SlideLockedReason: 'Locked by owner Alice',
          CanToggleSlideLock: false,
          SlideLockToggleDisabledReason: 'Only owner Alice can unlock',
        }),
      );

      expect(findSubmenu(items, 'change-layout')?.Disabled).toBe(true);
      expect(findSubmenu(items, 'change-layout')?.DisabledReason).toBe('Locked by owner Alice');
      expect(findSubmenu(items, 'slide-transition')?.Disabled).toBe(true);
      expect(findAction(items, 'toggle-slide-hidden')?.Disabled).toBe(true);
      expect(findAction(items, 'toggle-slide-lock')?.Disabled).toBe(true);
      expect(findAction(items, 'delete-slide')?.Disabled).toBe(true);
    });

    it('omits authoring items in read-only mode and retains Present/Comment/Copy', () => {
      const items = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'filmstrip-slide',
          IsEditable: false,
          CanComment: true,
        }),
      );

      expect(findAction(items, 'add-slide-after')).toBeUndefined();
      expect(findAction(items, 'duplicate-slide')).toBeUndefined();
      expect(findAction(items, 'delete-slide')).toBeUndefined();
      expect(findAction(items, 'toggle-slide-hidden')).toBeUndefined();
      expect(findAction(items, 'present-from-slide')).toBeDefined();
      expect(findAction(items, 'presenter-from-slide')).toBeDefined();
      expect(findAction(items, 'comment-slide')).toBeDefined();
      expect(findAction(items, 'copy-slide-markdown')).toBeDefined();
    });
  });

  describe('Zone 3a: filmstrip-empty', () => {
    it('exposes New Slide, Theme Preset, Present, and Export options in Edit mode', () => {
      const items = BuildSlidesContextMenu(
        makeSnapshot({ Zone: 'filmstrip-empty', IsEditable: true }),
      );

      expect(findAction(items, 'add-slide-new')).toBeDefined();
      expect(findSubmenu(items, 'add-slide-layout')).toBeDefined();
      expect(findSubmenu(items, 'deck-theme-preset')).toBeDefined();
      expect(findAction(items, 'open-theme-drawer')).toBeDefined();
      expect(findAction(items, 'start-presentation')).toBeDefined();
      expect(findAction(items, 'export-pptx')).toBeDefined();
      expect(findAction(items, 'export-pdf')).toBeDefined();
    });

    it('omits New Slide and Theme Preset in read-only mode', () => {
      const items = BuildSlidesContextMenu(
        makeSnapshot({ Zone: 'filmstrip-empty', IsEditable: false }),
      );

      expect(findAction(items, 'add-slide-new')).toBeUndefined();
      expect(findSubmenu(items, 'deck-theme-preset')).toBeUndefined();
      expect(findAction(items, 'start-presentation')).toBeDefined();
      expect(findAction(items, 'export-pptx')).toBeDefined();
    });
  });

  describe('Zone 3b: stage-background', () => {
    it('exposes Add Text/Bullets, LiveBlock, Sheet Chart, Whiteboard, Paste, Layout, Theme, AI, and Present', () => {
      const slide = makeSlide();
      const items = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'stage-background',
          Slide: slide,
          TargetRegion: slide.Regions[0],
          HasCopiedRegion: false,
          IsAiAssistantEnabled: true,
        }),
      );

      expect(findAction(items, 'stage-add-text')?.Command).toEqual({
        Type: 'insert-region-content',
        SlideID: 'slide-1',
        RegionID: 'main',
        Preset: 'text',
      });
      expect(findAction(items, 'stage-add-bullets')?.Command).toEqual({
        Type: 'insert-region-content',
        SlideID: 'slide-1',
        RegionID: 'main',
        Preset: 'bullets',
      });
      expect(findAction(items, 'stage-embed-live-view')).toBeDefined();
      expect(findAction(items, 'stage-embed-sheet-chart')).toBeDefined();
      expect(findAction(items, 'stage-embed-whiteboard')).toBeDefined();
      expect(findAction(items, 'stage-paste-region')?.Disabled).toBe(true);
      expect(findSubmenu(items, 'change-layout')).toBeDefined();
      expect(findSubmenu(items, 'deck-theme-preset')).toBeDefined();
      expect(findAction(items, 'ask-ai-slide')).toBeDefined();
      expect(findAction(items, 'present-from-slide')).toBeDefined();
    });

    it('enables Paste Region Content when HasCopiedRegion is true', () => {
      const slide = makeSlide();
      const items = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'stage-background',
          Slide: slide,
          TargetRegion: slide.Regions[0],
          HasCopiedRegion: true,
        }),
      );

      expect(findAction(items, 'stage-paste-region')?.Disabled).toBe(false);
    });
  });

  describe('Zone 3c: slide-region', () => {
    it('hides Swap Region Earlier/Later on single-region slides and enables/guards properly on TwoColumn slides', () => {
      const single = makeSlide();
      const singleItems = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'slide-region',
          Slide: single,
          TargetRegion: single.Regions[0],
          RegionIndex: 0,
          TotalRegions: 1,
          CanEditRegion: true,
        }),
      );
      expect(findAction(singleItems, 'swap-region-earlier')).toBeUndefined();
      expect(findAction(singleItems, 'swap-region-later')).toBeUndefined();

      const twoCol = makeTwoColumnSlide();
      const leftItems = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'slide-region',
          Slide: twoCol,
          TargetRegion: twoCol.Regions[0],
          RegionIndex: 0,
          TotalRegions: 2,
          CanEditRegion: true,
        }),
      );
      expect(findAction(leftItems, 'swap-region-earlier')?.Disabled).toBe(true);
      expect(findAction(leftItems, 'swap-region-later')?.Disabled).toBe(false);
      expect(findAction(leftItems, 'swap-region-later')?.Command).toEqual({
        Type: 'swap-region',
        SlideID: twoCol.SlideID,
        RegionID: 'left',
        Delta: 1,
      });

      const rightItems = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'slide-region',
          Slide: twoCol,
          TargetRegion: twoCol.Regions[1],
          RegionIndex: 1,
          TotalRegions: 2,
          CanEditRegion: true,
        }),
      );
      expect(findAction(rightItems, 'swap-region-earlier')?.Disabled).toBe(false);
      expect(findAction(rightItems, 'swap-region-later')?.Disabled).toBe(true);
    });

    it('disables swap-region actions when target or neighbor region is locked', () => {
      const twoCol = makeTwoColumnSlide();
      const lockedTargetItems = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'slide-region',
          Slide: twoCol,
          TargetRegion: twoCol.Regions[0],
          RegionIndex: 0,
          TotalRegions: 2,
          CanEditSlide: true,
          CanEditRegion: false,
          RegionLockedReason: 'Region locked by owner',
        }),
      );
      expect(findAction(lockedTargetItems, 'swap-region-later')?.Disabled).toBe(true);
      expect(findAction(lockedTargetItems, 'swap-region-later')?.DisabledReason).toBe(
        'Region locked by owner',
      );

      const lockedNeighborItems = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'slide-region',
          Slide: twoCol,
          TargetRegion: twoCol.Regions[1],
          RegionIndex: 1,
          TotalRegions: 2,
          CanEditSlide: true,
          CanEditRegion: true,
          CanSwapEarlier: false,
          SwapEarlierDisabledReason: 'Target region is locked',
          CanSwapLater: false,
          SwapLaterDisabledReason: 'Already last region',
        }),
      );
      expect(findAction(lockedNeighborItems, 'swap-region-earlier')?.Disabled).toBe(true);
      expect(findAction(lockedNeighborItems, 'swap-region-earlier')?.DisabledReason).toBe(
        'Target region is locked',
      );
      expect(findAction(lockedNeighborItems, 'swap-region-later')?.Disabled).toBe(true);
    });

    it('includes Sheet Chart, Workbook Update, Freeze/Unfreeze, Source Artifact, and Copy Block JSON for blocks', () => {
      const twoCol = makeTwoColumnSlide();
      const liveItems = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'slide-region',
          Slide: twoCol,
          TargetRegion: twoCol.Regions[1],
          RegionIndex: 1,
          TotalRegions: 2,
          CanEditRegion: true,
          IsOleBlock: false,
          IsSheetBackedBlock: true,
          BlockMode: 'Live',
          SourceArtifactID: 'wb-art-9',
          NewerWorkbookVersionNumber: 4,
        }),
      );

      expect(findAction(liveItems, 'refresh-region-block')).toBeDefined();
      expect(findAction(liveItems, 'open-sheet-embed')).toBeDefined();
      expect(findAction(liveItems, 'update-workbook-version')?.Label).toContain('v4');
      expect(findAction(liveItems, 'freeze-region-block')).toBeDefined();
      expect(findAction(liveItems, 'unfreeze-region-block')).toBeUndefined();
      expect(findAction(liveItems, 'open-source-artifact')?.Command).toEqual({
        Type: 'open-source-artifact',
        ArtifactID: 'wb-art-9',
      });
      expect(findAction(liveItems, 'copy-block-json')).toBeDefined();

      const frozenItems = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'slide-region',
          Slide: twoCol,
          TargetRegion: twoCol.Regions[1],
          RegionIndex: 1,
          TotalRegions: 2,
          CanEditRegion: true,
          IsOleBlock: false,
          BlockMode: 'Frozen',
        }),
      );
      expect(findAction(frozenItems, 'refresh-region-block')).toBeUndefined();
      expect(findAction(frozenItems, 'freeze-region-block')).toBeUndefined();
      expect(findAction(frozenItems, 'unfreeze-region-block')).toBeDefined();
    });

    it('shows inline canvas edit toggle for OLE artifact regions', () => {
      const twoCol = makeTwoColumnSlide();
      const oleItems = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'slide-region',
          Slide: twoCol,
          TargetRegion: twoCol.Regions[1],
          RegionIndex: 1,
          TotalRegions: 2,
          CanEditRegion: true,
          IsOleBlock: true,
          IsOleEditing: true,
          SourceArtifactID: 'wb-child-1',
        }),
      );

      const toggleOle = findAction(oleItems, 'toggle-ole-edit');
      expect(toggleOle?.Label).toBe('Done Editing Canvas');
      expect(findAction(oleItems, 'edit-region-inline')).toBeUndefined();
      expect(findAction(oleItems, 'refresh-region-block')).toBeUndefined();
      expect(findAction(oleItems, 'open-source-artifact')).toBeDefined();
    });
  });

  describe('Zone 3d: speaker-notes, viewer-stage & presentation-stage', () => {
    it('builds speaker-notes menu with presenter controls when in presenter mode', () => {
      const items = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'speaker-notes',
          WorkspaceMode: 'presenter',
          HasPreviousVisibleSlide: true,
          HasNextVisibleSlide: false,
        }),
      );

      expect(findAction(items, 'copy-speaker-notes')?.Disabled).toBe(false);
      expect(findAction(items, 'copy-slide-and-notes-markdown')).toBeDefined();
      expect(findAction(items, 'reset-presenter-timer')).toBeDefined();
      expect(findAction(items, 'nav-prev-slide')?.Disabled).toBe(false);
      expect(findAction(items, 'nav-next-slide')?.Disabled).toBe(true);
      expect(findAction(items, 'exit-presentation')).toBeDefined();
    });

    it('filters hidden slides from Jump to Slide in presentation-stage', () => {
      const items = BuildSlidesContextMenu(
        makeSnapshot({
          Zone: 'presentation-stage',
          WorkspaceMode: 'present',
          Slides: [
            { SlideID: 'slide-1', SlideNumber: 1, Title: 'Intro', Hidden: false },
            { SlideID: 'slide-2', SlideNumber: 2, Title: 'Backup Appendix', Hidden: true },
            { SlideID: 'slide-3', SlideNumber: 3, Title: 'Closing', Hidden: false },
          ],
          HasPreviousVisibleSlide: false,
          HasNextVisibleSlide: true,
        }),
      );

      const jump = findSubmenu(items, 'jump-to-slide');
      expect(jump?.Children.length).toBe(2);
      expect(findAction(items, 'jump-slide-slide-2')).toBeUndefined();
      expect(findAction(items, 'refresh-presentation-live-blocks')).toBeDefined();
      expect(findAction(items, 'switch-to-presenter')).toBeDefined();
      expect(findAction(items, 'exit-presentation')).toBeDefined();
    });

    it('formats platform shortcuts for macOS vs Windows/Linux', () => {
      const macItems = BuildSlidesContextMenu(
        makeSnapshot({ Zone: 'viewer-stage', IsEditable: false, IsMac: true }),
      );
      const winItems = BuildSlidesContextMenu(
        makeSnapshot({ Zone: 'viewer-stage', IsEditable: false, IsMac: false }),
      );

      expect(findAction(macItems, 'copy-slide-markdown')?.Shortcut).toBe('⌘C');
      expect(findAction(winItems, 'copy-slide-markdown')?.Shortcut).toBe('Ctrl+C');
    });
  });

  describe('Utilities', () => {
    it('serializes slide content and optional speaker notes to Markdown', () => {
      const slide = makeSlide({
        Regions: [
          {
            RegionID: 'kpi',
            Label: 'ARR',
            Kind: 'big-number',
            MarkdownContent: '',
            BigNumberValue: '$14.8M',
            BigNumberLabel: 'Annual Recurring Revenue',
            BigNumberDelta: '+24%',
          },
        ],
        SpeakerNotes: 'Call out enterprise retention.',
      });

      const withoutNotes = SerializeSlideToMarkdown(slide, false);
      expect(withoutNotes).toContain('# Quarterly Review');
      expect(withoutNotes).toContain('**$14.8M** — Annual Recurring Revenue (+24%)');
      expect(withoutNotes).not.toContain('Speaker Notes:');

      const withNotes = SerializeSlideToMarkdown(slide, true);
      expect(withNotes).toContain('> Speaker Notes: Call out enterprise retention.');
    });

    it('returns non-empty ARIA labels for every zone', () => {
      const zones = [
        'filmstrip-slide',
        'filmstrip-empty',
        'stage-background',
        'slide-region',
        'speaker-notes',
        'viewer-stage',
        'presentation-stage',
      ] as const;

      for (const zone of zones) {
        expect(ComputeSlidesMenuAriaLabel(zone).length).toBeGreaterThan(0);
      }
    });
  });
});
