import { describe, it, expect, vi, afterEach } from 'vitest';
import { ChangeDetectorRef, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { type CompositeKey, type IMetadataProvider, UserInfo } from '@memberjunction/core';
import {
  MJArtifactVersionEntity,
  SlideDeckEngine,
  type DocumentBlockSpec,
  type SlideDeckSpec,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { SlideDeckArtifactViewerComponent } from './slide-deck-artifact-viewer.component';
import { DocumentCollaborationService } from '../../services/document-collaboration.service';
import { type NavigationRequest } from '../base-artifact-viewer.component';
import { ArtifactAgentPresenceBarComponent } from '../presence/artifact-agent-presence-bar.component';
import { ArtifactAgentRegionIndicatorComponent } from '../presence/artifact-agent-region-indicator.component';
import { MjContextMenuComponent } from '../context-menu/mj-context-menu.component';

@Component({
  standalone: true,
  selector: 'mj-artifact-type-plugin-viewer',
  template: '<div data-testid="slide-plugin-viewer-stub"></div>',
})
class SlidePluginViewerStubComponent {
  @Input() Provider: IMetadataProvider | null = null;
  @Input() artifactVersion: MJArtifactVersionEntity | null = null;
  @Input() artifactTypeName = '';
  @Input() ArtifactTypeName = '';
  @Input() AncestorArtifactIDs: ReadonlySet<string> | null = null;
  @Input() readonly = true;
  @Output() ContentCommitted = new EventEmitter<string>();
  @Output() OpenEntityRecord = new EventEmitter<{ entityName: string; compositeKey: CompositeKey }>();
  @Output() navigationRequest = new EventEmitter<NavigationRequest>();
}

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

function makeSlideVersion(customDeck?: SlideDeckSpec, artifactId = 'art-slide-dom-1'): MJArtifactVersionEntity {
  const deck = customDeck ?? SlideDeckEngine.Instance.CreateDefaultDeck('Board Deck', 'deck-dom-1');
  const ver = Object.create(MJArtifactVersionEntity.prototype) as MJArtifactVersionEntity;
  Object.defineProperties(ver, {
    ID: { value: 'sv-dom-1', enumerable: true },
    ArtifactID: { value: artifactId, enumerable: true },
    Name: { value: 'Board Deck', enumerable: true },
    VersionNumber: { value: 1, enumerable: true },
    ContentMode: { value: 'Text', enumerable: true },
    Configuration: { value: null, enumerable: true },
    Content: { value: SlideDeckEngine.Instance.SerializeDeckSpec(deck), enumerable: true },
  });
  return ver;
}

function makeDeckFixture(options: { readonly?: boolean; customDeck?: SlideDeckSpec } = {}) {
  const isReadonly = options.readonly ?? false;
  const f = renderComponentFixture(SlideDeckArtifactViewerComponent, {
    imports: [
      FormsModule,
      SlidePluginViewerStubComponent,
      ArtifactAgentPresenceBarComponent,
      ArtifactAgentRegionIndicatorComponent,
    ],
    declarations: [SlideDeckArtifactViewerComponent, MjContextMenuComponent],
    providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
    inputs: {
      artifactVersion: makeSlideVersion(options.customDeck, isReadonly ? 'art-slide-dom-1' : ''),
      readonly: isReadonly,
    },
    setup: (inst) => {
      inst.ShowFilmstrip = true;
    },
  });
  f.detectChanges();
  return f;
}

function makeThreeSlideDeck(): SlideDeckSpec {
  const base = SlideDeckEngine.Instance.CreateDefaultDeck('Three Slide Deck', 'deck-three');
  const added1 = SlideDeckEngine.Instance.AddSlide(base, {
    Layout: 'TitleAndBody',
    Title: 'Second Slide',
    Subtitle: 'Middle narrative',
  });
  const added2 = SlideDeckEngine.Instance.AddSlide(added1.Deck, {
    Layout: 'TwoColumn',
    Title: 'Third Slide',
    Subtitle: 'Two column comparison',
  });
  return added2.Deck;
}

function dispatchContextMenu(
  el: Element,
  init: { clientX?: number; clientY?: number; shiftKey?: boolean } = {},
): MouseEvent {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: init.clientX ?? 120,
    clientY: init.clientY ?? 140,
    shiftKey: init.shiftKey ?? false,
  });
  el.dispatchEvent(event);
  return event;
}

function queryMenuItem(itemId: string): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(`[data-testid="mj-context-menu-item-${itemId}"]`);
}

describe('SlideDeckArtifactViewerComponent DOM', () => {
  it('mounts read-only by default (B3) and renders the slide deck workspace', () => {
    const f = makeDeckFixture({ readonly: true });
    expect(f.componentInstance.IsEditable).toBe(false);
    expect(query(f, '.mj-slides-shell')).not.toBeNull();
  });

  it('toggles filmstrip rail visibility via ToggleFilmstrip', () => {
    const f = renderComponentFixture(SlideDeckArtifactViewerComponent, {
      imports: [
        FormsModule,
        SlidePluginViewerStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactAgentRegionIndicatorComponent,
      ],
      declarations: [SlideDeckArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        artifactVersion: makeSlideVersion(),
        readonly: true,
      },
      setup: (inst) => {
        inst.ToggleFilmstrip();
      },
    });
    f.detectChanges();
    expect(f.componentInstance.ShowFilmstrip).toBe(false);
  });

  it('wires ContentCommitted output on base viewer contract', () => {
    const f = makeDeckFixture({ readonly: true });
    const committed = capture(f.componentInstance.ContentCommitted);
    f.componentInstance.ContentCommitted.emit('{}');
    expect(committed).toEqual(['{}']);
  });

  it('enforces single-slide guarded delete and duplicates slide from filmstrip context menu', () => {
    const singleDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Solo Deck', 'deck-solo');
    const singleSlideDeck: SlideDeckSpec = {
      ...singleDeck,
      Slides: [singleDeck.Slides[0]],
    };
    const f = makeDeckFixture({ readonly: false, customDeck: singleSlideDeck });
    const soleSlide = f.componentInstance.Deck.Slides[0];
    const thumb = query(f, `[data-testid="filmstrip-slide-${soleSlide.SlideID}"]`);
    expect(thumb).not.toBeNull();

    dispatchContextMenu(thumb!);
    f.detectChanges();

    expect(f.componentInstance.ContextMenuOpen).toBe(true);
    const deleteBtn = queryMenuItem('delete-slide');
    expect(deleteBtn).not.toBeNull();
    expect(deleteBtn?.getAttribute('aria-disabled')).toBe('true');

    // Clicking disabled delete must keep the sole slide intact
    deleteBtn!.click();
    f.detectChanges();
    expect(f.componentInstance.Deck.Slides).toHaveLength(1);

    // Duplicate works from the same menu
    const dupBtn = queryMenuItem('duplicate-slide');
    expect(dupBtn).not.toBeNull();
    dupBtn!.click();
    f.detectChanges();
    expect(f.componentInstance.Deck.Slides).toHaveLength(2);
  });

  it('toggles Hidden slide badge via filmstrip menu and skips hidden slides in presentation mode while keeping them selectable in Studio', () => {
    const deck = makeThreeSlideDeck();
    const f = makeDeckFixture({ readonly: false, customDeck: deck });
    const slide1 = f.componentInstance.Deck.Slides[0];
    const slide2 = f.componentInstance.Deck.Slides[1];
    const slide3 = f.componentInstance.Deck.Slides[2];

    const thumb2 = query(f, `[data-testid="filmstrip-slide-${slide2.SlideID}"]`);
    expect(thumb2).not.toBeNull();
    dispatchContextMenu(thumb2!);
    f.detectChanges();

    const hideBtn = queryMenuItem('toggle-slide-hidden');
    expect(hideBtn).not.toBeNull();
    hideBtn!.click();
    f.detectChanges();

    expect(f.componentInstance.Deck.Slides[1].Hidden).toBe(true);
    expect(query(f, `[data-testid="filmstrip-hidden-badge-${slide2.SlideID}"]`)).not.toBeNull();

    // Still selectable in Studio editor
    f.componentInstance.SelectSlide(slide2.SlideID);
    expect(f.componentInstance.ActiveSlideID).toBe(slide2.SlideID);

    // Entering Presentation Mode skips hidden Slide 2 on NextSlide and PrevSlide
    f.componentInstance.SelectSlide(slide1.SlideID);
    f.componentInstance.EnterPresentationMode('present');
    f.detectChanges();

    f.componentInstance.NextSlide();
    expect(f.componentInstance.ActiveSlideID).toBe(slide3.SlideID);

    f.componentInstance.PrevSlide();
    expect(f.componentInstance.ActiveSlideID).toBe(slide1.SlideID);
  });

  it('moves slide to deck edge and changes slide transition from filmstrip menu', () => {
    const deck = makeThreeSlideDeck();
    const f = makeDeckFixture({ readonly: false, customDeck: deck });
    const slide3 = f.componentInstance.Deck.Slides[2];

    const thumb3 = query(f, `[data-testid="filmstrip-slide-${slide3.SlideID}"]`);
    dispatchContextMenu(thumb3!);
    f.detectChanges();

    const moveStartBtn = queryMenuItem('move-slide-start');
    expect(moveStartBtn).not.toBeNull();
    moveStartBtn!.click();
    f.detectChanges();
    expect(f.componentInstance.Deck.Slides[0].SlideID).toBe(slide3.SlideID);

    // Reopen menu and change transition via submenu
    const movedThumb = query(f, `[data-testid="filmstrip-slide-${slide3.SlideID}"]`);
    dispatchContextMenu(movedThumb!);
    f.detectChanges();

    const transitionSubmenuBtn = queryMenuItem('slide-transition');
    expect(transitionSubmenuBtn).not.toBeNull();
    transitionSubmenuBtn!.click();
    f.detectChanges();

    const slideTransitionBtn = queryMenuItem('transition-slide');
    expect(slideTransitionBtn).not.toBeNull();
    slideTransitionBtn!.click();
    f.detectChanges();
    expect(f.componentInstance.Deck.Slides[0].Transition).toBe('slide');
  });

  it('opens stage background menu and executes Add Text on stage', () => {
    const f = makeDeckFixture({ readonly: false });
    const stage = query(f, '.mj-slide-canvas-stage');
    expect(stage).not.toBeNull();

    dispatchContextMenu(stage!);
    f.detectChanges();

    expect(f.componentInstance.ContextMenuOpen).toBe(true);
    const addTextBtn = queryMenuItem('stage-add-text');
    expect(addTextBtn).not.toBeNull();
    addTextBtn!.click();
    f.detectChanges();

    expect(f.componentInstance.ContextMenuOpen).toBe(false);
    expect(f.componentInstance.ActiveSlide.Regions[0].MarkdownContent).toContain('New section narrative');
  });

  it('swaps TwoColumn regions earlier/later, copies/pastes region specs, clears region, and opens source artifact', () => {
    const deck = makeThreeSlideDeck();
    const twoColSlide = deck.Slides[2];
    twoColSlide.Regions[0].MarkdownContent = 'Left narrative block';
    twoColSlide.Regions[1].MarkdownContent = 'Right narrative block';

    const f = makeDeckFixture({ readonly: false, customDeck: deck });
    f.componentInstance.SelectSlide(twoColSlide.SlideID);
    f.detectChanges();

    const firstRegionId = f.componentInstance.ActiveSlide.Regions[0].RegionID;
    const secondRegionId = f.componentInstance.ActiveSlide.Regions[1].RegionID;

    const firstCard = query(f, `[data-testid="slide-region-${firstRegionId}"]`);
    expect(firstCard).not.toBeNull();
    dispatchContextMenu(firstCard!);
    f.detectChanges();

    expect(queryMenuItem('swap-region-earlier')?.getAttribute('aria-disabled')).toBe('true');
    const swapLaterBtn = queryMenuItem('swap-region-later');
    expect(swapLaterBtn).not.toBeNull();
    swapLaterBtn!.click();
    f.detectChanges();

    expect(f.componentInstance.ActiveSlide.Regions[0].RegionID).toBe(secondRegionId);
    expect(f.componentInstance.ActiveSlide.Regions[1].RegionID).toBe(firstRegionId);

    // Copy region 0 (secondRegionId) and paste into region 1 (firstRegionId)
    const sourceCard = query(f, `[data-testid="slide-region-${secondRegionId}"]`);
    dispatchContextMenu(sourceCard!);
    f.detectChanges();
    queryMenuItem('copy-region')!.click();
    f.detectChanges();
    expect(f.componentInstance.StatusBannerMessage).toContain('Copied region');

    const destCard = query(f, `[data-testid="slide-region-${firstRegionId}"]`);
    dispatchContextMenu(destCard!);
    f.detectChanges();
    expect(queryMenuItem('paste-region')?.getAttribute('aria-disabled')).toBeNull();
    queryMenuItem('paste-region')!.click();
    f.detectChanges();
    expect(f.componentInstance.ActiveSlide.Regions[1].MarkdownContent).toBe('Right narrative block');

    // Clear region 1
    const clearTarget = query(f, `[data-testid="slide-region-${firstRegionId}"]`);
    dispatchContextMenu(clearTarget!);
    f.detectChanges();
    queryMenuItem('clear-region')!.click();
    f.detectChanges();
    expect(f.componentInstance.ActiveSlide.Regions[1].MarkdownContent).toBe('');

    // Embedded source artifact opens entity record via OpenEntityRecord output
    const opened = capture(f.componentInstance.OpenEntityRecord);
    f.componentInstance.OnSlidesContextMenuCommand({
      Type: 'open-source-artifact',
      ArtifactID: '11111111-1111-1111-1111-111111111111',
    });
    expect(opened).toHaveLength(1);
    expect(opened[0].entityName).toBe('MJ: Artifacts');
    expect(opened[0].compositeKey.GetValueByFieldName('ID')).toBe(
      '11111111-1111-1111-1111-111111111111',
    );
  });

  it('closes open context menu on first Escape without exiting presentation mode, then exits on second Escape', () => {
    const f = makeDeckFixture({ readonly: false });
    f.componentInstance.EnterPresentationMode('present');
    f.detectChanges();

    const stage = query(f, '.mj-slide-canvas-stage');
    expect(stage).not.toBeNull();
    dispatchContextMenu(stage!);
    f.detectChanges();

    expect(f.componentInstance.ContextMenuOpen).toBe(true);
    expect(f.componentInstance.WorkspaceMode).toBe('present');

    // First Escape closes only the context menu
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    f.detectChanges();
    expect(f.componentInstance.ContextMenuOpen).toBe(false);
    expect(f.componentInstance.WorkspaceMode).toBe('present');
    expect(f.componentInstance.IsPresentationActive).toBe(true);

    // Second Escape exits presentation mode
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    f.detectChanges();
    expect(f.componentInstance.WorkspaceMode).toBe('edit');
    expect(f.componentInstance.IsPresentationActive).toBe(false);
  });

  it('bypasses custom menu for Shift+Right-Click, pre-prevented child events, and native textareas, while handling presenter notes and Shift+F10', () => {
    const f = makeDeckFixture({ readonly: false });
    const slide1 = f.componentInstance.Deck.Slides[0];
    const thumb = query(f, `[data-testid="filmstrip-slide-${slide1.SlideID}"]`);
    expect(thumb).not.toBeNull();

    // 1) Shift + Right-Click -> native bypass
    const shiftEvent = dispatchContextMenu(thumb!, { shiftKey: true });
    f.detectChanges();
    expect(shiftEvent.defaultPrevented).toBe(false);
    expect(f.componentInstance.ContextMenuOpen).toBe(false);

    // 2) Pre-prevented child event (e.g. inline Whiteboard) -> stage must not open menu
    const stage = query(f, '.mj-slide-canvas-stage');
    const prePrevented = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    prePrevented.preventDefault();
    stage!.dispatchEvent(prePrevented);
    f.detectChanges();
    expect(f.componentInstance.ContextMenuOpen).toBe(false);

    // 3) Native <textarea> speaker-notes-input -> bypasses custom menu
    const notesTextarea = query(f, '[data-testid="speaker-notes-input"]');
    expect(notesTextarea).not.toBeNull();
    const notesEvent = dispatchContextMenu(notesTextarea!);
    f.detectChanges();
    expect(notesEvent.defaultPrevented).toBe(false);
    expect(f.componentInstance.ContextMenuOpen).toBe(false);

    // 4) Shift+F10 keyboard shortcut on filmstrip thumbnail opens menu
    thumb!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, cancelable: true }),
    );
    f.detectChanges();
    expect(f.componentInstance.ContextMenuOpen).toBe(true);
    f.componentInstance.CloseContextMenu();
    f.detectChanges();

    // 5) Read-only presenter notes card opens speaker-notes menu
    f.componentInstance.EnterPresentationMode('presenter');
    f.detectChanges();
    const presenterNotesCard = query(f, '[data-testid="presenter-speaker-notes-card"]');
    expect(presenterNotesCard).not.toBeNull();
    dispatchContextMenu(presenterNotesCard!);
    f.detectChanges();
    expect(f.componentInstance.ContextMenuOpen).toBe(true);
    expect(queryMenuItem('copy-speaker-notes')).not.toBeNull();
    expect(queryMenuItem('reset-presenter-timer')).not.toBeNull();
  });

  it('prevents non-owner CanShare collaborators from unlocking or mutating owner-locked slides and regions', () => {
    const ownerUserId = '11111111-1111-4111-8111-111111111111';
    const collaboratorUserId = '22222222-2222-4222-8222-222222222222';
    const baseDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Lock Regression', 'deck-lock-reg');
    const twoCol = SlideDeckEngine.Instance.AddSlide(baseDeck, {
      Layout: 'TwoColumn',
      Title: 'Mixed Locks',
    });
    const slide1 = twoCol.Deck.Slides[0];
    const slide2 = twoCol.Deck.Slides[1];

    // Lock slide 1 (slide-level owner lock) and lock region 1 of slide 2 (region-level owner lock)
    const ownerLockedDeck = SlideDeckEngine.Instance.SetSlideLock(
      twoCol.Deck,
      slide1.SlideID,
      true,
      ownerUserId,
      false,
      ownerUserId,
    ).Deck;
    const lockedRegDeck = SlideDeckEngine.Instance.SetRegionLock(
      ownerLockedDeck,
      slide2.SlideID,
      slide2.Regions[1].RegionID,
      true,
      ownerUserId,
      false,
      ownerUserId,
    ).Deck;

    const collaboratorUser: UserInfo = Object.create(UserInfo.prototype);
    Object.defineProperties(collaboratorUser, {
      ID: { value: collaboratorUserId, enumerable: true },
      Name: { value: 'Share Collaborator', enumerable: true },
      Email: { value: 'collab@example.com', enumerable: true },
    });
    const provider: IMetadataProvider = Object.create(Object.prototype);
    Object.defineProperties(provider, {
      CurrentUser: { value: collaboratorUser, enumerable: true },
      Entities: { value: [], enumerable: true },
    });

    const f = makeDeckFixture({ customDeck: lockedRegDeck, readonly: false });
    f.componentInstance.Provider = provider;
    f.componentInstance.ResolvedPermissions = {
      ArtifactID: 'art-slide-dom-1',
      CanRead: true,
      CanEdit: true,
      CanDelete: false,
      CanShare: true,
      Source: 'ArtifactPermission',
      Reason: 'Collaborator with edit + share only (not owner)',
    };
    f.detectChanges();

    // Slide 1 is owner-locked: CanShare collaborator must NOT be able to unlock, edit, or delete it
    f.componentInstance.SelectSlide(slide1.SlideID);
    expect(f.componentInstance.CanEditSlideElements).toBe(false);
    expect(f.componentInstance.CanEditRegion(f.componentInstance.ActiveSlide.Regions[0])).toBe(false);

    f.componentInstance.ToggleCurrentSlideLock();
    expect(f.componentInstance.Deck.Slides[0].Locked).toBe(true);
    expect(f.componentInstance.StatusBannerMessage).toContain('locked');

    f.componentInstance.DeleteSlideById(slide1.SlideID);
    expect(f.componentInstance.Deck.Slides.length).toBe(lockedRegDeck.Slides.length);

    // Slide 2 is unlocked, but Region 1 is owner-locked
    f.componentInstance.SelectSlide(slide2.SlideID);
    f.detectChanges();
    const unlockedReg = f.componentInstance.ActiveSlide.Regions[0];
    const ownerLockedReg = f.componentInstance.ActiveSlide.Regions[1];
    expect(f.componentInstance.CanEditRegion(unlockedReg)).toBe(true);
    expect(f.componentInstance.CanEditRegion(ownerLockedReg)).toBe(false);

    f.componentInstance.ToggleRegionLock(ownerLockedReg);
    expect(f.componentInstance.ActiveSlide.Regions[1].Locked).toBe(true);

    const originalLockedMarkdown = ownerLockedReg.MarkdownContent;
    f.componentInstance.CutSlideRegion(slide2.SlideID, ownerLockedReg.RegionID);
    expect(f.componentInstance.ActiveSlide.Regions[1].MarkdownContent).toBe(originalLockedMarkdown);

    // Swapping an unlocked region with a locked neighbor (or vice versa) must be rejected
    f.componentInstance.SwapSlideRegion(slide2.SlideID, unlockedReg.RegionID, 1);
    expect(f.componentInstance.ActiveSlide.Regions[0].RegionID).toBe(unlockedReg.RegionID);
    expect(f.componentInstance.ActiveSlide.Regions[1].RegionID).toBe(ownerLockedReg.RegionID);

    // Context menu on unlocked region disables swap-region-later because neighbor is owner-locked
    const unlockedCard = query(f, `[data-testid="slide-region-${unlockedReg.RegionID}"]`);
    dispatchContextMenu(unlockedCard!);
    f.detectChanges();
    expect(queryMenuItem('swap-region-later')?.getAttribute('aria-disabled')).toBe('true');

    // Context menu on locked region disables cut & swap
    const lockedCard = query(f, `[data-testid="slide-region-${ownerLockedReg.RegionID}"]`);
    dispatchContextMenu(lockedCard!);
    f.detectChanges();
    expect(queryMenuItem('cut-region')?.getAttribute('aria-disabled')).toBe('true');
    expect(queryMenuItem('swap-region-earlier')?.getAttribute('aria-disabled')).toBe('true');
  });

  it('routes OnSlideDrop through SlideDeckEngine.ReorderSlides and keeps active selection on moved slide', () => {
    const f = makeDeckFixture({ customDeck: makeThreeSlideDeck(), readonly: false });
    const s0 = f.componentInstance.Deck.Slides[0].SlideID;
    const s2 = f.componentInstance.Deck.Slides[2].SlideID;
    const reorderSpy = vi.spyOn(SlideDeckEngine.Instance, 'ReorderSlides');

    f.componentInstance.SelectSlide(s0);
    expect(f.componentInstance.ActiveSlideIndex).toBe(0);

    const dragData = new Map<string, string>();
    const dragTransfer = {
      effectAllowed: 'move',
      dropEffect: 'move',
      setData: (format: string, value: string) => {
        dragData.set(format, value);
      },
      getData: (format: string) => dragData.get(format) ?? '',
    };
    const dragStartEvent: DragEvent = Object.create(Event.prototype);
    Object.defineProperties(dragStartEvent, {
      dataTransfer: { value: dragTransfer, enumerable: true },
    });
    const dropEvent: DragEvent = Object.create(Event.prototype);
    Object.defineProperties(dropEvent, {
      preventDefault: { value: vi.fn(), enumerable: true },
      dataTransfer: { value: dragTransfer, enumerable: true },
    });

    f.componentInstance.OnSlideDragStart(s0, dragStartEvent);
    f.componentInstance.OnSlideDrop(s2, dropEvent);

    const slideCount = f.componentInstance.Deck.Slides.length;
    expect(reorderSpy).toHaveBeenCalledTimes(1);
    expect(f.componentInstance.Deck.Slides.map((s) => s.SlideNumber)).toEqual(
      Array.from({ length: slideCount }, (_, idx) => idx + 1),
    );
    expect(f.componentInstance.Deck.Slides[2].SlideID).toBe(s0);
    expect(f.componentInstance.ActiveSlideID).toBe(s0);
    expect(f.componentInstance.ActiveSlideIndex).toBe(2);

    f.componentInstance.MoveSlideToEdge(s0, 'start');
    expect(f.componentInstance.Deck.Slides[0].SlideID).toBe(s0);
    expect(f.componentInstance.Deck.Slides[0].SlideNumber).toBe(1);
    expect(f.componentInstance.ActiveSlideID).toBe(s0);
    expect(f.componentInstance.ActiveSlideIndex).toBe(0);
  });

  it('deep-clones BlockSpec with a fresh UUID BlockID on Copy/Paste and Duplicate', () => {
    const base = SlideDeckEngine.Instance.CreateDefaultDeck('Block Clone', 'deck-block-clone');
    const twoCol = SlideDeckEngine.Instance.AddSlide(base, {
      Layout: 'TwoColumn',
      Title: 'Live KPIs',
    });
    const sourceBlockId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const sourceBlock: DocumentBlockSpec = {
      BlockID: sourceBlockId,
      Title: 'ARR Metric',
      Kind: 'SavedQuery',
      Mode: 'Live',
      QueryID: 'qry-arr-1',
      Parameters: { fiscalYear: 2026 },
    };
    const slide = twoCol.Deck.Slides[1];
    slide.Regions[0] = {
      ...slide.Regions[0],
      Kind: 'mj-block',
      BlockSpec: sourceBlock,
      MarkdownContent: `:::mj-block\n${JSON.stringify(sourceBlock)}\n:::`,
    };

    const f = makeDeckFixture({ customDeck: twoCol.Deck, readonly: false });
    f.componentInstance.SelectSlide(slide.SlideID);
    f.detectChanges();

    const srcId = slide.Regions[0].RegionID;
    const dstId = slide.Regions[1].RegionID;

    f.componentInstance.CopySlideRegion(slide.SlideID, srcId);
    f.componentInstance.PasteIntoSlideRegion(slide.SlideID, dstId);

    const pastedBlock = f.componentInstance.ActiveSlide.Regions[1].BlockSpec;
    expect(pastedBlock).toBeDefined();
    expect(pastedBlock?.BlockID).toBeTruthy();
    expect(pastedBlock?.BlockID).not.toBe(sourceBlockId);
    expect(f.componentInstance.ActiveSlide.Regions[1].MarkdownContent).toContain(pastedBlock!.BlockID);
    expect(f.componentInstance.ActiveSlide.Regions[1].MarkdownContent).not.toContain(sourceBlockId);

    // Mutating pasted BlockSpec.Parameters must not affect the source region's BlockSpec
    if (pastedBlock?.Parameters) {
      pastedBlock.Parameters['fiscalYear'] = 2030;
    }
    expect(f.componentInstance.ActiveSlide.Regions[0].BlockSpec?.Parameters?.['fiscalYear']).toBe(2026);

    f.componentInstance.DuplicateSlideRegion(slide.SlideID, srcId);
    // DuplicateSlideRegion splices the clone at idx + 1 (index 1), shifting pasted dstId to index 2
    const duplicatedBlock = f.componentInstance.ActiveSlide.Regions[1]?.BlockSpec;
    expect(duplicatedBlock).toBeDefined();
    expect(duplicatedBlock?.BlockID).not.toBe(sourceBlockId);
    expect(duplicatedBlock?.BlockID).not.toBe(pastedBlock?.BlockID);
    expect(f.componentInstance.ActiveSlide.Regions[2]?.BlockSpec?.BlockID).toBe(pastedBlock?.BlockID);
  });

  it('preserves headings, strong, em, code, and list items in OnInlineRegionContentBlur', () => {
    const f = makeDeckFixture({ readonly: false });
    const slide = f.componentInstance.ActiveSlide;
    const region = slide.Regions[0];

    const editorEl = document.createElement('div');
    editorEl.innerHTML =
      '<h1>Title</h1><h2>Section</h2><h3>Detail</h3>' +
      '<p>Has <strong>bold</strong>, <em>italic</em>, and <code>code()</code>.</p>' +
      '<ul><li>Alpha</li><li>Beta</li></ul>';
    const blurEvent = new FocusEvent('blur');
    Object.defineProperty(blurEvent, 'target', { value: editorEl, enumerable: true });

    f.componentInstance.OnInlineRegionContentBlur(region, blurEvent);

    const saved = f.componentInstance.ActiveSlide.Regions[0].MarkdownContent;
    expect(saved).toContain('# Title');
    expect(saved).toContain('## Section');
    expect(saved).toContain('### Detail');
    expect(saved).toContain('**bold**');
    expect(saved).toContain('*italic*');
    expect(saved).toContain('`code()`');
    expect(saved).toContain('- Alpha');
    expect(saved).toContain('- Beta');
  });

  it('calls cdr.detectChanges in FocusRegionInlineEditor, suppresses post-long-press clicks via click.capture, and orders modal Primary left / Cancel right', () => {
    const f = makeDeckFixture({ readonly: false });
    const targetSlide = f.componentInstance.Deck.Slides[1];
    const targetRegion = targetSlide.Regions[0];

    const componentCdr = f.debugElement.injector.get(ChangeDetectorRef);
    const cdrProto = Object.getPrototypeOf(componentCdr);
    const detectSpy = vi.spyOn(cdrProto, 'detectChanges');
    f.componentInstance.FocusRegionInlineEditor(targetSlide.SlideID, targetRegion.RegionID);
    expect(detectSpy).toHaveBeenCalled();
    expect(query(f, `[data-testid="slide-region-${targetRegion.RegionID}"]`)).not.toBeNull();
    const region = targetRegion;

    // Suppress click after touch long-press via (click.capture) on .mj-slides-shell
    const shell = query(f, '.mj-slides-shell') as HTMLElement;
    const childBtn = document.createElement('button');
    const childClickSpy = vi.fn();
    childBtn.addEventListener('click', childClickSpy);
    shell.appendChild(childBtn);

    try {
      vi.useFakeTimers();
      const pointerDown = new Event('pointerdown', { bubbles: true });
      Object.defineProperties(pointerDown, {
        pointerType: { value: 'touch' },
        clientX: { value: 48 },
        clientY: { value: 48 },
      });
      shell.dispatchEvent(pointerDown);
      vi.advanceTimersByTime(550);
    } finally {
      vi.useRealTimers();
    }

    expect(f.componentInstance.ContextMenuOpen).toBe(true);
    childBtn.click();
    expect(childClickSpy).not.toHaveBeenCalled();

    // Verify all 3 confirmation modals render Primary LEFT, Cancel RIGHT
    f.componentInstance.PendingFreezeBlock = {
      BlockID: 'blk-freeze-1',
      Title: 'Pipeline',
      Kind: 'SavedQuery',
      Mode: 'Live',
      QueryID: 'q-1',
    };
    f.componentInstance.PendingFreezeRegion = region;
    componentCdr.markForCheck();
    f.detectChanges();
    const freezeActions = query(f, '[data-testid="slides-freeze-warning-modal"] .mj-slides-modal-actions');
    const freezeBtns = freezeActions?.querySelectorAll('button') ?? [];
    expect(freezeBtns.length).toBe(2);
    expect(freezeBtns[0].classList.contains('primary')).toBe(true);
    expect(freezeBtns[1].textContent?.trim()).toBe('Cancel');
    f.componentInstance.CancelFreezeSlideBlock();

    f.componentInstance.ShowMarkdownToDeckModal = true;
    componentCdr.markForCheck();
    f.detectChanges();
    const mdActions = query(f, '[data-testid="markdown-to-deck-modal"] .mj-slides-modal-actions');
    const mdBtns = mdActions?.querySelectorAll('button') ?? [];
    expect(mdBtns.length).toBe(2);
    expect(mdBtns[0].classList.contains('primary')).toBe(true);
    expect(mdBtns[1].textContent?.trim()).toBe('Cancel');
    f.componentInstance.ShowMarkdownToDeckModal = false;

    f.componentInstance.ShowSheetEmbedModal = true;
    componentCdr.markForCheck();
    f.detectChanges();
    const sheetActions = query(f, '[data-testid="slides-sheet-embed-modal"] .mj-slides-modal-actions');
    const sheetBtns = sheetActions?.querySelectorAll('button') ?? [];
    expect(sheetBtns.length).toBe(2);
    expect(sheetBtns[0].classList.contains('primary')).toBe(true);
    expect(sheetBtns[1].textContent?.trim()).toBe('Cancel');
  });

  it('renders 4:3 stage aspect-ratio, real SVG chart bars, sanitized image/table regions, and empty CSS placeholders without fake defaults', () => {
    const customDeck = SlideDeckEngine.Instance.CreateDefaultDeck('Visual Fidelity Deck', 'deck-dom-vis');
    customDeck.AspectRatio = '4:3';
    customDeck.Slides[0].Title = '';
    customDeck.Slides[0].Subtitle = '';
    customDeck.Slides[0].Regions = [
      {
        RegionID: 'reg-chart-1',
        Label: 'Quarterly Chart',
        Kind: 'mj-block',
        MarkdownContent: '',
        BlockSpec: {
          BlockID: 'blk-svg-chart',
          Kind: 'EntityView',
          Mode: 'Frozen',
          Title: 'Revenue Bar Chart',
          EntityName: 'MJ: Artifacts',
          DisplayMode: 'chart',
          ChartType: 'bar',
          FrozenSnapshot: {
            Columns: [
              { Name: 'Quarter', DisplayName: 'Quarter', Type: 'nvarchar' },
              { Name: 'ARR', DisplayName: 'ARR', Type: 'decimal' },
            ],
            Rows: [
              { Quarter: 'Q1', ARR: 120 },
              { Quarter: 'Q2', ARR: 185 },
            ],
            TotalRowCount: 2,
            FrozenAt: '2026-11-15T10:00:00.000Z',
            FrozenByUserID: 'u-1',
            FrozenByUserName: 'Alice',
            SecurityWarningAcknowledged: true,
          },
        },
      },
      {
        RegionID: 'reg-img-1',
        Label: 'Safe Image',
        Kind: 'image',
        MarkdownContent: '',
        ImageUrl: 'https://cdn.example.com/diagram.png',
        ImageAlt: 'Architecture Diagram',
      },
      {
        RegionID: 'reg-tbl-1',
        Label: 'Pipe Table',
        Kind: 'table',
        MarkdownContent: '| Item | Status |\n|---|---|\n| Auth | Complete |',
      },
    ];

    const f = makeDeckFixture({ readonly: false, customDeck });
    const stage = query(f, '.mj-slide-canvas-stage') as HTMLElement | null;
    expect(stage?.getAttribute('data-aspect-ratio')).toBe('4:3');
    expect(stage?.style.aspectRatio).toBe('4 / 3');

    // CSS data-placeholder instead of literal fake default text when Title is blank
    f.componentInstance.ActiveSlide.Title = '';
    f.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    f.detectChanges();
    const titleEl = query(f, '[data-testid="editable-slide-title"]') as HTMLElement | null;
    expect(titleEl?.textContent?.trim()).toBe('');
    expect(titleEl?.getAttribute('data-placeholder')).toBe('Slide Title');

    // Real SVG chart rendered on stage
    const chartSvg = query(f, '[data-testid="slide-block-chart-reg-chart-1"] svg.mj-slide-chart-svg');
    expect(chartSvg).not.toBeNull();
    expect(chartSvg?.querySelectorAll('rect').length).toBe(2);

    // Sanitized image and markdown pipe table rendered
    const imgEl = query(f, '[data-testid="slide-image-region-reg-img-1"] img') as HTMLImageElement | null;
    expect(imgEl?.getAttribute('src')).toBe('https://cdn.example.com/diagram.png');
    const mdTbl = query(f, '[data-testid="slide-markdown-table-reg-tbl-1"] table');
    expect(mdTbl?.textContent).toContain('Auth');
  });

  it('renders NW-1 Drift banner & compare popover and NW-3 filter, reply box, and suggestion Accept/Reject cards in DOM', () => {
    const f = makeDeckFixture({ readonly: false });
    const slideId = f.componentInstance.ActiveSlide.SlideID;
    const regionId = f.componentInstance.ActiveSlide.Regions[0].RegionID;
    const cdr = f.debugElement.injector.get(ChangeDetectorRef);

    // NW-1 Drift banner + popover
    f.componentInstance.ActiveSlideDriftSummaries = [
      {
        RegionID: regionId,
        BlockID: 'blk-drift-1',
        BlockTitle: 'Pipeline Telemetry',
        FrozenAt: '2026-11-15T10:00:00.000Z',
        FrozenByUserName: 'Alice',
        SignatureVerified: true,
        FrozenRowCount: 4,
        LiveRowCount: 5,
        HasDrift: true,
        AddedRowCount: 1,
        RemovedRowCount: 0,
        ChangedRowCount: 1,
      },
    ];
    f.componentInstance.ShowDriftComparePopover = true;

    // Reset conflict banner
    f.componentInstance.HasPendingResetConflict = true;

    // NW-3 Comments + Suggestions drawer
    f.componentInstance.RightDrawerTab = 'comments';
    f.componentInstance.AnchoredThreads = [
      {
        ConversationID: 'conv-dom-1',
        AnchorKey: `${slideId}::${regionId}`,
        AnchorLabel: `Slide 1 · Main`,
        QuotedText: '',
        Status: 'Open',
        AgentMode: 'edit',
        CreatedAt: '2026-11-15T10:00:00.000Z',
        Messages: [
          {
            DetailID: 'm-1',
            UserName: 'Alice',
            Role: 'User',
            Message: 'Please tighten the executive hook.',
            CreatedAt: '2026-11-15T10:00:00.000Z',
            Mentions: [],
          },
        ],
      },
    ];
    f.componentInstance.SharedSuggestions = [
      {
        SuggestionID: 'sug-dom-1',
        SlideID: slideId,
        Field: 'slide-title',
        AuthorID: 'agent-1',
        AuthorName: 'DeckAgent',
        OriginalText: f.componentInstance.ActiveSlide.Title,
        SuggestedText: 'Board Strategy Q4',
        Status: 'Pending',
        CreatedAt: '2026-11-15T10:05:00.000Z',
      },
    ];

    cdr.markForCheck();
    f.detectChanges();

    expect(query(f, '[data-testid="slides-nw1-drift-banner"]')).not.toBeNull();
    expect(query(f, '[data-testid="slides-nw1-drift-popover"]')?.textContent).toContain('+1 added');
    expect(query(f, '[data-testid="slides-nw1-hmac-verified"]')?.textContent).toContain('Signed by Alice');
    expect(query(f, '[data-testid="slides-room-reset-conflict-banner"]')).not.toBeNull();
    expect(query(f, '[data-testid="slides-comment-filter-slide-btn"]')).not.toBeNull();
    expect(query(f, '[data-testid="reply-input-slide-thread-conv-dom-1"]')).not.toBeNull();

    // Accept suggestion button updates active slide title
    const acceptBtn = query(f, '[data-testid="slides-accept-suggestion-sug-dom-1"]') as HTMLButtonElement | null;
    expect(acceptBtn).not.toBeNull();
    acceptBtn?.click();
    f.detectChanges();
    expect(f.componentInstance.ActiveSlide.Title).toBe('Board Strategy Q4');
  });

  it('isolates GuestSnapshotMode in Slides (P0-P3-4): skips Yjs connect & server permission/snapshot RPCs', async () => {
    const hasBackendSpy = vi.spyOn(DocumentCollaborationService.prototype, 'HasCollaborationBackend').mockReturnValue(true);
    const verifyServerSpy = vi.spyOn(DocumentCollaborationService.prototype, 'VerifyFrozenSnapshotOnServer');
    const resolvePermSpy = vi.spyOn(DocumentCollaborationService.prototype, 'ResolvePermissionsFromServer');
    const runViewSpy = vi.fn(async () => ({ Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 0, ErrorMessage: '' }));
    const fakeProvider = {
      CurrentUser: new UserInfo(undefined, { ID: 'u-guest-1', Name: 'Signed In Visitor' }),
      RunView: runViewSpy,
    } as Partial<IMetadataProvider> as IMetadataProvider;

    const f = renderComponentFixture(SlideDeckArtifactViewerComponent, {
      imports: [
        FormsModule,
        SlidePluginViewerStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactAgentRegionIndicatorComponent,
      ],
      declarations: [SlideDeckArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        Provider: fakeProvider,
        GuestSnapshotMode: true,
        artifactVersion: makeSlideVersion(makeThreeSlideDeck(), 'art-slide-guest-1'),
        readonly: false,
      },
    });
    await f.whenStable();
    f.detectChanges();

    expect(f.componentInstance.AccessRevoked).toBe(false);
    expect(f.componentInstance.ConnectionStatus).toBe('local');
    expect(f.componentInstance.ResolvedPermissions).toBeNull();
    expect((f.nativeElement as HTMLElement).textContent ?? '').not.toContain('Access Revoked');
    expect(hasBackendSpy).not.toHaveBeenCalled();
    expect(verifyServerSpy).not.toHaveBeenCalled();
    expect(resolvePermSpy).not.toHaveBeenCalled();
    expect(runViewSpy).not.toHaveBeenCalled();
  });

  it('re-applies pre-init ViewMode/NavigationAnchor on deck init (NW-6) and replaces only OriginalText slice (NW-3)', () => {
    const deck = makeThreeSlideDeck();
    const slide2 = deck.Slides[1];
    const bodyRegion = slide2.Regions.find((r) => r.Label.toLowerCase().includes('body')) ?? slide2.Regions[0];
    bodyRegion.MarkdownContent = 'Keep bullet A\nbullet B\nKeep bullet C';

    const f = renderComponentFixture(SlideDeckArtifactViewerComponent, {
      imports: [
        FormsModule,
        SlidePluginViewerStubComponent,
        ArtifactAgentPresenceBarComponent,
        ArtifactAgentRegionIndicatorComponent,
      ],
      declarations: [SlideDeckArtifactViewerComponent, MjContextMenuComponent],
      providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: vi.fn() } }],
      inputs: {
        ViewMode: 'diff',
        NavigationAnchor: { SlideNumber: 2 },
        artifactVersion: makeSlideVersion(deck, ''),
        readonly: false,
      },
    });
    f.detectChanges();

    expect(f.componentInstance.WorkspaceMode).toBe('diff');
    expect(f.componentInstance.ActiveSlideIndex).toBe(1);

    // NW-3: SlideNumber fallback + slice-only replacement when OriginalText is present in MarkdownContent
    f.componentInstance.SharedSuggestions = [
      {
        SuggestionID: 'sug-slice-2',
        SlideID: '',
        SlideNumber: 2,
        RegionID: bodyRegion.RegionID,
        Field: 'region-markdown',
        AuthorID: 'agent-1',
        AuthorName: 'DeckAgent',
        OriginalText: 'bullet B',
        SuggestedText: 'bullet B revised',
        Status: 'Pending',
        CreatedAt: '2026-11-15T10:05:00.000Z',
      },
    ];
    f.componentInstance.AcceptSlideSuggestion(f.componentInstance.SharedSuggestions[0]);
    expect(f.componentInstance.ActiveSlide.Regions.find((r) => r.RegionID === bodyRegion.RegionID)?.MarkdownContent).toBe(
      'Keep bullet A\nbullet B revised\nKeep bullet C',
    );
  });
});
