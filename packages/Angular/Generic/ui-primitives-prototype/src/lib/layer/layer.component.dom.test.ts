import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MJLayerService } from '../services/layer.service';
import { MJBeforeEvent } from '../types/events';
import {
  MJLayerBodyDirective,
  MJLayerComponent,
  MJLayerFooterDirective,
  MJLayerHeaderDirective,
  MJLayerTitleDirective,
} from './layer.component';
import { MJPhonePresentation, ResolvePhonePresentation } from './phone-presentation';

@Component({
  standalone: true,
  imports: [
    MJLayerComponent,
    MJLayerHeaderDirective,
    MJLayerTitleDirective,
    MJLayerBodyDirective,
    MJLayerFooterDirective,
  ],
  template: `
    <button type="button" id="popover-trigger">Open Popover</button>

    <mj-layer
      [Open]="parentModalOpen()"
      [Kind]="'sheet'"
      [Closeable]="true"
      (AfterClose)="parentModalOpen.set(false)"
    >
      <div mjLayerHeader>
        <h2 mjLayerTitle>Parent Sheet</h2>
      </div>
      <div mjLayerBody>
        <button type="button">Sheet Action</button>
      </div>
    </mj-layer>

    <mj-layer
      [Open]="layerOpen()"
      [Kind]="'dialog'"
      [Closeable]="true"
      (BeforeOpen)="onBeforeOpen($event)"
      (BeforeClose)="onBeforeClose($event)"
      (AfterOpen)="afterOpenCount = afterOpenCount + 1"
      (AfterClose)="layerOpen.set(false); afterCloseCount = afterCloseCount + 1"
    >
      <div mjLayerHeader>
        <h2 mjLayerTitle>Dialog Title</h2>
      </div>
      <div mjLayerBody>
        <button type="button" id="dialog-nested-trigger" data-autofocus>Primary Action</button>
      </div>
      <div mjLayerFooter>
        <button type="button">Close</button>
      </div>
    </mj-layer>

    <mj-layer
      [Open]="popoverOpen()"
      [Kind]="'popover'"
      [Anchor]="popoverAnchor()"
      [Label]="'Quick Popover'"
      (AfterClose)="popoverOpen.set(false)"
    >
      <div mjLayerBody>
        <button type="button">Popover Action</button>
      </div>
    </mj-layer>

    <mj-layer
      [Open]="menuOpen()"
      [Kind]="'menu'"
      [Anchor]="'#popover-trigger'"
      [PhonePresentation]="menuPhonePresentation()"
      (AfterClose)="menuOpen.set(false)"
    >
      <div mjLayerBody>
        <button type="button" role="menuitem">Rename</button>
        <button type="button" role="menuitem">Duplicate</button>
      </div>
    </mj-layer>
  `,
})
class LayerHostComponent {
  public readonly parentModalOpen = signal(false);
  public readonly layerOpen = signal(false);
  public readonly popoverOpen = signal(false);
  public readonly popoverAnchor = signal('#popover-trigger');
  public readonly menuOpen = signal(false);
  public readonly menuPhonePresentation = signal<MJPhonePresentation | undefined>(undefined);
  public cancelNextOpen = false;
  public cancelNextClose = false;
  public afterOpenCount = 0;
  public afterCloseCount = 0;

  public onBeforeOpen(ev: MJBeforeEvent<'open'>): void {
    if (this.cancelNextOpen) {
      ev.Cancel = true;
    }
  }

  public onBeforeClose(ev: MJBeforeEvent<'escape' | 'backdrop' | 'programmatic'>): void {
    if (this.cancelNextClose) {
      ev.Cancel = true;
    }
  }
}

describe('MJLayerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayerHostComponent],
    }).compileComponents();
  });

  it('defaults Modal by Kind (true for dialog/sheet, false for popover), wires aria-labelledby, and passes axe', async () => {
    const fixture = TestBed.createComponent(LayerHostComponent);
    const layerService = TestBed.inject(MJLayerService);
    fixture.detectChanges();

    expect(layerService.ActiveCount).toBe(0);

    // Popover defaults to non-modal (no aria-modal="true") when [Modal] is omitted
    fixture.componentInstance.popoverOpen.set(true);
    fixture.detectChanges();
    const popover = document.body.querySelector(
      '.cdk-overlay-container [role="dialog"]'
    ) as HTMLElement | null;
    expect(popover).toBeTruthy();
    expect(popover?.getAttribute('aria-modal')).toBeNull();
    fixture.componentInstance.popoverOpen.set(false);
    fixture.detectChanges();

    // Dialog defaults to modal (aria-modal="true") when [Modal] is omitted
    fixture.componentInstance.layerOpen.set(true);
    fixture.detectChanges();

    expect(layerService.ActiveCount).toBe(1);
    const dialog = document.body.querySelector(
      '.cdk-overlay-container [role="dialog"][aria-modal="true"]'
    ) as HTMLElement | null;
    expect(dialog).toBeTruthy();

    const titleEl = dialog?.querySelector('[mjLayerTitle]') as HTMLElement | null;
    expect(titleEl?.id).toBeTruthy();
    expect(dialog?.getAttribute('aria-labelledby')).toBe(titleEl?.id);

    await ExpectNoAxeViolations(fixture);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.afterCloseCount).toBe(1);
    expect(fixture.componentInstance.layerOpen()).toBe(false);
    expect(layerService.ActiveCount).toBe(0);
    expect(document.body.querySelector('.cdk-overlay-container [role="dialog"]')).toBeNull();
  });

  it('honors cancelable BeforeClose on Escape without leaving zombie state', () => {
    const fixture = TestBed.createComponent(LayerHostComponent);
    const layerService = TestBed.inject(MJLayerService);
    fixture.componentInstance.layerOpen.set(true);
    fixture.detectChanges();

    fixture.componentInstance.cancelNextClose = true;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.afterCloseCount).toBe(0);
    expect(fixture.componentInstance.layerOpen()).toBe(true);
    expect(layerService.ActiveCount).toBe(1);

    fixture.componentInstance.cancelNextClose = false;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(layerService.ActiveCount).toBe(0);
    expect(fixture.componentInstance.layerOpen()).toBe(false);
  });

  it('honors cancelable BeforeOpen and restores focus to a trigger inside an open modal when a nested popover closes', async () => {
    const fixture = TestBed.createComponent(LayerHostComponent);
    const layerService = TestBed.inject(MJLayerService);
    fixture.detectChanges();

    // Cancelable BeforeOpen prevents opening
    fixture.componentInstance.cancelNextOpen = true;
    fixture.componentInstance.layerOpen.set(true);
    fixture.detectChanges();
    expect(layerService.ActiveCount).toBe(0);
    expect(fixture.componentInstance.afterOpenCount).toBe(0);

    // Allow opening modal dialog
    fixture.componentInstance.cancelNextOpen = false;
    fixture.componentInstance.layerOpen.set(false);
    fixture.detectChanges();
    fixture.componentInstance.layerOpen.set(true);
    fixture.detectChanges();
    await Promise.resolve();

    expect(layerService.ActiveCount).toBe(1);
    expect(fixture.componentInstance.afterOpenCount).toBe(1);

    const nestedTrigger = document.body.querySelector(
      '#dialog-nested-trigger'
    ) as HTMLButtonElement;
    expect(nestedTrigger).toBeTruthy();
    nestedTrigger.focus();
    expect(document.activeElement).toBe(nestedTrigger);

    // Open popover anchored to button inside open modal dialog (stack length = 2)
    fixture.componentInstance.popoverAnchor.set('#dialog-nested-trigger');
    fixture.componentInstance.popoverOpen.set(true);
    fixture.detectChanges();
    await Promise.resolve();
    expect(layerService.ActiveCount).toBe(2);

    // Escape closes topmost popover only and restores focus back to the trigger inside the still-open modal
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.popoverOpen()).toBe(false);
    expect(fixture.componentInstance.layerOpen()).toBe(true);
    expect(layerService.ActiveCount).toBe(1);
    expect(document.activeElement).toBe(nestedTrigger);

    // Second Escape closes the modal dialog
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(layerService.ActiveCount).toBe(0);
    expect(fixture.componentInstance.layerOpen()).toBe(false);
  });

  it('keeps modal scroll lock active when an underlying modal closes out of LIFO order', () => {
    window.scroll = vi.fn();
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      configurable: true,
      value: 2000,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 800,
    });

    const fixture = TestBed.createComponent(LayerHostComponent);
    const layerService = TestBed.inject(MJLayerService);

    fixture.componentInstance.parentModalOpen.set(true);
    fixture.detectChanges();
    expect(layerService.ActiveCount).toBe(1);
    expect(document.documentElement.classList.contains('cdk-global-scrollblock')).toBe(true);

    fixture.componentInstance.layerOpen.set(true);
    fixture.detectChanges();
    expect(layerService.ActiveCount).toBe(2);
    expect(document.documentElement.classList.contains('cdk-global-scrollblock')).toBe(true);

    fixture.componentInstance.parentModalOpen.set(false);
    fixture.detectChanges();
    expect(layerService.ActiveCount).toBe(1);
    expect(document.documentElement.classList.contains('cdk-global-scrollblock')).toBe(true);

    fixture.componentInstance.layerOpen.set(false);
    fixture.detectChanges();
    expect(layerService.ActiveCount).toBe(0);
    expect(document.documentElement.classList.contains('cdk-global-scrollblock')).toBe(false);
  });
});

/**
 * jsdom has no matchMedia; stand one in so the layer service sees a phone held upright (narrow),
 * a phone held sideways (short), or a desktop. A query matches when it names the viewport's feature.
 */
function mockViewport(viewport: 'narrow' | 'short' | 'desktop'): void {
  const feature = { narrow: 'max-width: 640px', short: 'max-height: 480px', desktop: null }[viewport];
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string): MediaQueryList => {
      const list = new EventTarget() as MediaQueryList;
      Object.defineProperties(list, {
        matches: { value: feature !== null && query.includes(feature) },
        media: { value: query },
      });
      return list;
    },
  });
}

describe('ResolvePhonePresentation', () => {
  it('defaults by Kind: choose-from and fill-in kinds open as a sheet, the rest stay as they are', () => {
    expect(ResolvePhonePresentation('dialog', undefined)).toBe('sheet');
    expect(ResolvePhonePresentation('sheet', undefined, 'bottom')).toBe('sheet');
    expect(ResolvePhonePresentation('sheet', undefined, 'end')).toBe('full-screen');
    expect(ResolvePhonePresentation('sheet', undefined, 'start')).toBe('full-screen');
    expect(ResolvePhonePresentation('menu', undefined)).toBe('sheet');
    expect(ResolvePhonePresentation('popover', undefined)).toBe('sheet');
    expect(ResolvePhonePresentation('tooltip', undefined)).toBe('anchored');
    expect(ResolvePhonePresentation('toast', undefined)).toBe('anchored');
    expect(ResolvePhonePresentation('custom-kind', undefined)).toBe('anchored');
  });

  it('lets an explicit value win, and ignores values it does not know', () => {
    expect(ResolvePhonePresentation('popover', 'anchored')).toBe('anchored');
    expect(ResolvePhonePresentation('dialog', 'full-screen')).toBe('full-screen');
    expect(ResolvePhonePresentation('tooltip', 'sheet')).toBe('sheet');
    expect(ResolvePhonePresentation('menu', 'sideways')).toBe('sheet');
  });
});

describe('MJLayerComponent phone presentation', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayerHostComponent],
    }).compileComponents();
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });

  function openMenu(phonePresentation: MJPhonePresentation | undefined) {
    const fixture = TestBed.createComponent(LayerHostComponent);
    fixture.componentInstance.menuPhonePresentation.set(phonePresentation);
    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();
    fixture.detectChanges();
    const panel = document.body.querySelector<HTMLElement>('.cdk-overlay-container [role="menu"]');
    const pane = panel?.closest<HTMLElement>('.cdk-overlay-pane') ?? null;
    return { fixture, panel, pane };
  }

  it('opens a menu on a phone as a modal bottom sheet that keeps role="menu" and gets a title', () => {
    mockViewport('narrow');
    const { fixture, panel, pane } = openMenu(undefined);
    const layerService = TestBed.inject(MJLayerService);

    expect(panel).toBeTruthy();
    expect(pane?.classList.contains('mj-layer-pane-phone-sheet')).toBe(true);
    expect(pane?.getAttribute('role')).toBe('dialog');
    expect(pane?.getAttribute('aria-modal')).toBe('true');
    expect(pane?.getAttribute('aria-label')).toBe('Open Popover');
    expect(document.body.querySelector('.cdk-overlay-backdrop')).toBeTruthy();
    // No consumer title, so the sheet shows the trigger's name where the menu's anchor used to be.
    expect(panel?.querySelector('.mj-layer-sheet-title')?.textContent?.trim()).toBe('Open Popover');

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.menuOpen()).toBe(false);
    expect(layerService.ActiveCount).toBe(0);
  });

  it('keeps a menu anchored on a phone when PhonePresentation is "anchored"', () => {
    mockViewport('narrow');
    const { panel, pane } = openMenu('anchored');

    expect(panel).toBeTruthy();
    expect(pane?.classList.contains('mj-layer-pane-phone-sheet')).toBe(false);
    expect(pane?.getAttribute('role')).toBeNull();
    expect(document.body.querySelector('.cdk-overlay-backdrop')).toBeNull();
    expect(panel?.querySelector('.mj-layer-sheet-title')).toBeNull();
  });

  it('keeps a menu anchored off phones, and never marks the panel with a phone class', () => {
    mockViewport('desktop');
    const { panel, pane } = openMenu(undefined);

    expect(pane?.classList.contains('mj-layer-pane-phone-sheet')).toBe(false);
    expect(panel?.className).not.toContain('phone');
    expect(document.body.querySelector('.cdk-overlay-backdrop')).toBeNull();
  });

  it('treats a phone held sideways as a phone and marks the sheet short, so it stops spanning the full width', () => {
    mockViewport('short');
    const { panel, pane } = openMenu(undefined);

    expect(panel).toBeTruthy();
    expect(pane?.classList.contains('mj-layer-pane-phone-sheet')).toBe(true);
    expect(pane?.classList.contains('mj-layer-pane-phone-short')).toBe(true);
    expect(pane?.getAttribute('aria-modal')).toBe('true');
  });

  it('does not mark an upright phone sheet short', () => {
    mockViewport('narrow');
    const { pane } = openMenu(undefined);

    expect(pane?.classList.contains('mj-layer-pane-phone-sheet')).toBe(true);
    expect(pane?.classList.contains('mj-layer-pane-phone-short')).toBe(false);
  });

  it('fills an upright phone with a side sheet, so no strip of page shows beside it', () => {
    mockViewport('narrow');
    const fixture = TestBed.createComponent(LayerHostComponent);
    fixture.componentInstance.parentModalOpen.set(true);
    fixture.detectChanges();
    fixture.detectChanges();

    const pane = document.body.querySelector('.mj-layer-kind-sheet')?.closest('.cdk-overlay-pane');
    expect(pane?.classList.contains('mj-layer-pane-phone-full-screen')).toBe(true);
    expect(pane?.classList.contains('mj-layer-pane-phone-sheet')).toBe(false);
  });

  it('keeps a side sheet as a side panel on a phone held sideways, where it fits beside the page', () => {
    mockViewport('short');
    const fixture = TestBed.createComponent(LayerHostComponent);
    fixture.componentInstance.parentModalOpen.set(true);
    fixture.detectChanges();
    fixture.detectChanges();

    const pane = document.body.querySelector('.mj-layer-kind-sheet')?.closest('.cdk-overlay-pane');
    expect(pane).toBeTruthy();
    expect(pane?.className).not.toContain('mj-layer-pane-phone');
  });

  it('presents a dialog as a sheet on a phone with no generated title when the consumer gives one, and resolves full-screen when asked', () => {
    mockViewport('narrow');
    const fixture = TestBed.createComponent(LayerHostComponent);
    fixture.componentInstance.layerOpen.set(true);
    fixture.detectChanges();
    fixture.detectChanges();

    const dialog = document.body.querySelector<HTMLElement>(
      '.cdk-overlay-container [role="dialog"][aria-modal="true"]'
    );
    expect(dialog?.closest('.cdk-overlay-pane')?.classList.contains('mj-layer-pane-phone-sheet')).toBe(true);
    expect(dialog?.querySelector('.mj-layer-sheet-title')).toBeNull();
    fixture.componentInstance.layerOpen.set(false);
    fixture.detectChanges();

    const fullScreen = TestBed.inject(MJLayerService).ResolvePhoneMode('dialog', 'full-screen');
    expect(fullScreen).toBe('full-screen');
  });
});
