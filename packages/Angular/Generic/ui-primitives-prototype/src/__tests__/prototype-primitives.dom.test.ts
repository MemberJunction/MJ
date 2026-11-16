import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MJSurfaceComponent,
  MJSurfaceHeaderDirective,
  MJSurfaceBodyDirective,
  MJSurfaceFooterDirective,
} from '../lib/surface/surface.component';
import {
  MJRowComponent,
  MJRowLeadingDirective,
  MJRowContentDirective,
  MJRowTrailingDirective,
} from '../lib/row/row.component';
import {
  MJLayerComponent,
  MJLayerHeaderDirective,
  MJLayerTitleDirective,
  MJLayerBodyDirective,
  MJLayerFooterDirective,
} from '../lib/layer/layer.component';
import { MJLayerService } from '../lib/services/layer.service';
import { MJBeforeEvent } from '../lib/types/events';

@Component({
  standalone: true,
  imports: [
    MJSurfaceComponent,
    MJSurfaceHeaderDirective,
    MJSurfaceBodyDirective,
    MJSurfaceFooterDirective,
    MJRowComponent,
    MJRowLeadingDirective,
    MJRowContentDirective,
    MJRowTrailingDirective,
    MJLayerComponent,
    MJLayerHeaderDirective,
    MJLayerTitleDirective,
    MJLayerBodyDirective,
    MJLayerFooterDirective,
  ],
  template: `
    <mj-surface [Level]="level()" [Tone]="tone()" [VisualRole]="role()">
      <div mjSurfaceHeader>Header</div>
      <div mjSurfaceBody>Body</div>
      <div mjSurfaceFooter>Footer</div>
    </mj-surface>

    <mj-row
      [Interactive]="true"
      [Selected]="rowSelected()"
      [Tone]="tone()"
      (BeforeSelect)="onBeforeSelect($event)"
      (AfterSelect)="afterSelectCount = afterSelectCount + 1"
    >
      <span mjRowLeading>L</span>
      <span mjRowContent>Main content</span>
      <span mjRowTrailing>T</span>
    </mj-row>

    <mj-layer
      [Open]="layerOpen()"
      [Kind]="'dialog'"
      [Modal]="true"
      [Closeable]="true"
      (BeforeClose)="onBeforeClose($event)"
      (AfterClose)="onAfterClose()"
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
  `,
})
class TestHostComponent {
  level = signal('elevated');
  tone = signal('brand-custom');
  role = signal('callout');
  rowSelected = signal(false);
  layerOpen = signal(false);
  cancelNextSelect = false;
  cancelNextClose = false;
  afterSelectCount = 0;
  afterCloseCount = 0;

  onBeforeSelect(ev: MJBeforeEvent<'user'>): void {
    if (this.cancelNextSelect) {
      ev.Cancel = true;
    }
  }

  onBeforeClose(ev: MJBeforeEvent<'escape' | 'backdrop' | 'programmatic'>): void {
    if (this.cancelNextClose) {
      ev.Cancel = true;
      return;
    }
  }

  onAfterClose(): void {
    this.afterCloseCount++;
    this.layerOpen.set(false);
  }
}

describe('Wave 0 prototype primitives', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();
  });

  it('applies .mj-surface-<level> and open-axis attributes on mj-surface', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const surface = fixture.nativeElement.querySelector('mj-surface') as HTMLElement;
    expect(surface.classList.contains('mj-surface')).toBe(true);
    expect(surface.classList.contains('mj-surface-elevated')).toBe(true);
    expect(surface.getAttribute('data-tone')).toBe('brand-custom');
    expect(surface.getAttribute('data-role')).toBe('callout');
    expect(surface.querySelector('.mj-surface-header')).toBeTruthy();
    expect(surface.querySelector('.mj-surface-body')).toBeTruthy();
    expect(surface.querySelector('.mj-surface-footer')).toBeTruthy();
  });

  it('supports cancelable BeforeSelect and AfterSelect on mj-row', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const row = fixture.nativeElement.querySelector('mj-row') as HTMLElement;
    expect(row.classList.contains('mj-row')).toBe(true);
    expect(row.getAttribute('tabindex')).toBe('0');

    row.click();
    expect(fixture.componentInstance.afterSelectCount).toBe(1);

    fixture.componentInstance.cancelNextSelect = true;
    row.click();
    expect(fixture.componentInstance.afterSelectCount).toBe(1);
  });

  it('locks body scroll when mj-layer opens and releases on Escape via MJLayerService', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    const layerService = TestBed.inject(MJLayerService);
    fixture.detectChanges();

    expect(layerService.ActiveCount).toBe(0);

    fixture.componentInstance.layerOpen.set(true);
    fixture.detectChanges();

    expect(layerService.ActiveCount).toBe(1);
    expect(document.body.style.overflow).toBe('hidden');
    expect(fixture.nativeElement.querySelector('[role="dialog"][aria-modal="true"]')).toBeTruthy();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.afterCloseCount).toBe(1);
    expect(layerService.ActiveCount).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('honors cancelable BeforeClose on Escape', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    const layerService = TestBed.inject(MJLayerService);
    fixture.componentInstance.layerOpen.set(true);
    fixture.detectChanges();

    fixture.componentInstance.cancelNextClose = true;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.afterCloseCount).toBe(0);
    expect(layerService.ActiveCount).toBe(1);

    // Clean up
    fixture.componentInstance.cancelNextClose = false;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(layerService.ActiveCount).toBe(0);
  });
});
