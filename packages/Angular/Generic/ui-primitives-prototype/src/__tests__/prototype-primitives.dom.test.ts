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
    <mj-surface [level]="level()" [tone]="tone()" [visual-role]="role()">
      <div mjSurfaceHeader>Header</div>
      <div mjSurfaceBody role="listbox" aria-label="Items">
        <mj-row
          [interactive]="true"
          [item-role]="'option'"
          [selected]="rowSelected()"
          [tone]="tone()"
          (BeforeSelect)="onBeforeSelect($event)"
          (AfterSelect)="afterSelectCount = afterSelectCount + 1"
        >
          <span mjRowLeading>L</span>
          <span mjRowContent>Main content</span>
          <span mjRowTrailing>T</span>
        </mj-row>
      </div>
      <div mjSurfaceFooter>Footer</div>
    </mj-surface>

    <mj-row class="layout-only-row">
      <span mjRowContent><button type="button">Primary</button></span>
      <span mjRowTrailing><button type="button">Secondary</button></span>
    </mj-row>

    <mj-layer
      [open]="layerOpen()"
      [kind]="'dialog'"
      [modal]="true"
      [closeable]="true"
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
    }
  }
}

describe('Wave 0 prototype primitives', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();
  });

  it('applies .mj-surface-<level>, PascalCase inputs via aliases, and runtime open-axis CSS variables', () => {
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

  it('enforces WCAG 4.1.2 roles on interactive mj-row and keeps layout-only rows non-focusable', () => {
    const fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();

    const interactiveRow = fixture.nativeElement.querySelector('[role="listbox"] mj-row') as HTMLElement;
    expect(interactiveRow.getAttribute('role')).toBe('option');
    expect(interactiveRow.getAttribute('aria-selected')).toBe('false');
    expect(interactiveRow.getAttribute('tabindex')).toBe('0');

    const layoutRow = fixture.nativeElement.querySelector('mj-row.layout-only-row') as HTMLElement;
    expect(layoutRow.getAttribute('role')).toBeNull();
    expect(layoutRow.getAttribute('tabindex')).toBeNull();

    interactiveRow.click();
    expect(fixture.componentInstance.afterSelectCount).toBe(1);

    fixture.componentInstance.cancelNextSelect = true;
    interactiveRow.click();
    expect(fixture.componentInstance.afterSelectCount).toBe(1);
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
