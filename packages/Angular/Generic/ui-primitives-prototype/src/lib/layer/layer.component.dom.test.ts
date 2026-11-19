import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MJLayerService } from '../services/layer.service';
import { MJBeforeEvent } from '../types/events';
import {
  MJLayerBodyDirective,
  MJLayerComponent,
  MJLayerFooterDirective,
  MJLayerHeaderDirective,
  MJLayerTitleDirective,
} from './layer.component';

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
      (BeforeClose)="onBeforeClose($event)"
      (AfterClose)="layerOpen.set(false); afterCloseCount = afterCloseCount + 1"
    >
      <div mjLayerHeader>
        <h2 mjLayerTitle>Dialog Title</h2>
      </div>
      <div mjLayerBody>
        <button type="button" data-autofocus>Primary Action</button>
      </div>
      <div mjLayerFooter>
        <button type="button">Close</button>
      </div>
    </mj-layer>

    <mj-layer
      [Open]="popoverOpen()"
      [Kind]="'popover'"
      [Anchor]="'#popover-trigger'"
      [Label]="'Quick Popover'"
      (AfterClose)="popoverOpen.set(false)"
    >
      <div mjLayerBody>
        <button type="button">Popover Action</button>
      </div>
    </mj-layer>
  `,
})
class LayerHostComponent {
  public readonly parentModalOpen = signal(false);
  public readonly layerOpen = signal(false);
  public readonly popoverOpen = signal(false);
  public cancelNextClose = false;
  public afterCloseCount = 0;

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
