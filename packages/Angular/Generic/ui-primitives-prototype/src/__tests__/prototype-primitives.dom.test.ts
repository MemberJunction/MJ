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
      <div mjSurfaceBody role="listbox" aria-label="Items">
        <mj-row
          class="opt-1"
          [Interactive]="true"
          [ItemRole]="'option'"
          [Selected]="selectedIdx() === 0"
          [Tone]="tone()"
          (BeforeSelect)="onBeforeSelect($event)"
          (AfterSelect)="selectedIdx.set(0); afterSelectCount = afterSelectCount + 1"
        >
          <span mjRowLeading>L1</span>
          <span mjRowContent>First option</span>
        </mj-row>
        <mj-row
          class="opt-2"
          [Interactive]="true"
          [ItemRole]="'option'"
          [Selected]="selectedIdx() === 1"
          (AfterSelect)="selectedIdx.set(1); afterSelectCount = afterSelectCount + 1"
        >
          <span mjRowLeading>L2</span>
          <span mjRowContent>Second option</span>
        </mj-row>
      </div>
      <div mjSurfaceFooter>Footer</div>
    </mj-surface>

    <mj-row class="standalone-interactive-row" [Interactive]="true">
      <span mjRowContent>Standalone Button Row</span>
    </mj-row>

    <mj-row class="layout-only-row">
      <span mjRowContent><button type="button">Primary</button></span>
      <span mjRowTrailing><button type="button">Secondary</button></span>
    </mj-row>

    <mj-layer
      [Open]="layerOpen()"
      [Kind]="'dialog'"
      [Modal]="true"
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
  `,
})
class TestHostComponent {
  level = signal('elevated');
  tone = signal('plum');
  role = signal('callout');
  selectedIdx = signal(0);
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
    }
  }
}

describe('Wave 0 prototype primitives', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();
  });

  it('binds standard MJ PascalCase inputs ([Level], [Tone], [VisualRole]) and runtime open-axis CSS variables', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const surface = fixture.nativeElement.querySelector('mj-surface') as HTMLElement;
    expect(surface.classList.contains('mj-surface')).toBe(true);
    expect(surface.classList.contains('mj-surface-elevated')).toBe(true);
    expect(surface.getAttribute('data-tone')).toBe('plum');
    expect(surface.getAttribute('data-role')).toBe('callout');
    expect(surface.style.getPropertyValue('--_mj-tone-text')).toContain('--mj-tone-plum-text');
    expect(surface.style.getPropertyValue('--_mj-role-bg')).toContain('--mj-role-callout-bg');
  });

  it('defaults standalone interactive mj-row to role="button", keeps layout rows non-focusable, and navigates listbox options with roving tabindex + ArrowDown', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const standalone = fixture.nativeElement.querySelector('mj-row.standalone-interactive-row') as HTMLElement;
    expect(standalone.getAttribute('role')).toBe('button');
    expect(standalone.getAttribute('tabindex')).toBe('0');

    const layoutRow = fixture.nativeElement.querySelector('mj-row.layout-only-row') as HTMLElement;
    expect(layoutRow.getAttribute('role')).toBeNull();
    expect(layoutRow.getAttribute('tabindex')).toBeNull();

    const opt1 = fixture.nativeElement.querySelector('mj-row.opt-1') as HTMLElement;
    const opt2 = fixture.nativeElement.querySelector('mj-row.opt-2') as HTMLElement;
    expect(opt1.getAttribute('tabindex')).toBe('0');
    expect(opt2.getAttribute('tabindex')).toBe('-1');

    opt1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedIdx()).toBe(1);
    expect(opt1.getAttribute('tabindex')).toBe('-1');
    expect(opt2.getAttribute('tabindex')).toBe('0');

    fixture.componentInstance.cancelNextSelect = true;
    opt2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedIdx()).toBe(1);
  });

  it('opens mj-layer in CDK OverlayContainer and closes cleanly on Escape via MJLayerService', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    const layerService = TestBed.inject(MJLayerService);
    fixture.detectChanges();

    expect(layerService.ActiveCount).toBe(0);

    fixture.componentInstance.layerOpen.set(true);
    fixture.detectChanges();

    expect(layerService.ActiveCount).toBe(1);
    const dialog = document.body.querySelector('.cdk-overlay-container [role="dialog"][aria-modal="true"]');
    expect(dialog).toBeTruthy();

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.afterCloseCount).toBe(1);
    expect(fixture.componentInstance.layerOpen()).toBe(false);
    expect(layerService.ActiveCount).toBe(0);
    expect(document.body.querySelector('.cdk-overlay-container [role="dialog"]')).toBeNull();
  });

  it('honors cancelable BeforeClose on Escape without leaving zombie state', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
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
});
