import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import type { IMetadataProvider } from '@memberjunction/core';
import {
  MJArtifactVersionEntity,
  SlideDeckEngine,
  type SlideDeckSpec,
} from '@memberjunction/core-entities';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { SlideDeckArtifactViewerComponent } from './slide-deck-artifact-viewer.component';
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
  @Input() readonly = true;
  @Output() ContentCommitted = new EventEmitter<string>();
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
    expect(f.componentInstance.copiedSlideRegionSpec?.MarkdownContent).toBe('Right narrative block');

    const destCard = query(f, `[data-testid="slide-region-${firstRegionId}"]`);
    dispatchContextMenu(destCard!);
    f.detectChanges();
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
});
