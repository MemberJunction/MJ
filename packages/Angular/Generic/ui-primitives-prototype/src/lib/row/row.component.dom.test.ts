import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExpectNoAxeViolations } from '@memberjunction/ng-test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { MJBeforeEvent } from '../types/events';
import {
  MJRowComponent,
  MJRowContentDirective,
  MJRowLeadingDirective,
  MJRowTrailingDirective,
} from './row.component';

@Component({
  standalone: true,
  imports: [
    MJRowComponent,
    MJRowLeadingDirective,
    MJRowContentDirective,
    MJRowTrailingDirective,
  ],
  template: `
    <div role="listbox" aria-label="Items">
      <mj-row
        class="opt-1"
        [Interactive]="true"
        [ItemRole]="'option'"
        [Selected]="selectedIdx() === 0"
        [Tone]="'plum'"
        [VisualRole]="'nav-item'"
        (BeforeSelect)="onBeforeSelect($event)"
        (AfterSelect)="selectedIdx.set(0)"
      >
        <span mjRowLeading>L1</span>
        <span mjRowContent>First option</span>
      </mj-row>
      <mj-row
        class="opt-2"
        [Interactive]="true"
        [ItemRole]="'option'"
        [Selected]="selectedIdx() === 1"
        (AfterSelect)="selectedIdx.set(1)"
      >
        <span mjRowLeading>L2</span>
        <span mjRowContent>Second option</span>
      </mj-row>
    </div>

    <mj-row class="standalone-interactive-row" [Interactive]="true">
      <span mjRowContent>Standalone Button Row</span>
    </mj-row>

    <mj-row class="toggle-interactive-row" [Interactive]="true" [Pressed]="toggled()" (AfterSelect)="toggled.set(!toggled())">
      <span mjRowContent>Toggle Row</span>
    </mj-row>

    <mj-row class="invalid-role-row" [Interactive]="true" [ItemRole]="'invalid-role'">
      <span mjRowContent>Fallback Role Row</span>
    </mj-row>

    <mj-row class="layout-only-row">
      <span mjRowContent><button type="button">Primary</button></span>
      <span mjRowTrailing><button type="button">Secondary</button></span>
    </mj-row>
  `,
})
class RowHostComponent {
  public readonly selectedIdx = signal(0);
  public readonly toggled = signal(false);
  public cancelNextSelect = false;

  public onBeforeSelect(ev: MJBeforeEvent<'user'>): void {
    if (this.cancelNextSelect) {
      ev.Cancel = true;
    }
  }
}

describe('MJRowComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RowHostComponent],
    }).compileComponents();
  });

  it('defaults standalone interactive row to role="button", applies .is-selected, maps --mj-visual-role-*, and navigates listbox options', async () => {
    const fixture = TestBed.createComponent(RowHostComponent);
    fixture.detectChanges();

    const standalone = fixture.nativeElement.querySelector(
      'mj-row.standalone-interactive-row'
    ) as HTMLElement;
    expect(standalone.getAttribute('role')).toBe('button');
    expect(standalone.getAttribute('tabindex')).toBe('0');
    expect(standalone.getAttribute('aria-pressed')).toBeNull();

    const toggleRow = fixture.nativeElement.querySelector(
      'mj-row.toggle-interactive-row'
    ) as HTMLElement;
    expect(toggleRow.getAttribute('role')).toBe('button');
    expect(toggleRow.getAttribute('aria-pressed')).toBe('false');
    expect(toggleRow.classList.contains('is-selected')).toBe(false);
    fixture.componentInstance.toggled.set(true);
    fixture.detectChanges();
    expect(toggleRow.getAttribute('aria-pressed')).toBe('true');
    expect(toggleRow.classList.contains('is-selected')).toBe(true);
    expect(toggleRow.hasAttribute('data-selected')).toBe(false);

    const invalidRoleRow = fixture.nativeElement.querySelector(
      'mj-row.invalid-role-row'
    ) as HTMLElement;
    expect(invalidRoleRow.getAttribute('role')).toBe('button');

    // Spacebar prevents scroll on keydown and activates on keyup (native <button> behavior)
    fixture.componentInstance.toggled.set(false);
    fixture.detectChanges();
    const spaceDown = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    toggleRow.dispatchEvent(spaceDown);
    expect(spaceDown.defaultPrevented).toBe(true);
    expect(fixture.componentInstance.toggled()).toBe(false);
    toggleRow.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.toggled()).toBe(true);

    const layoutRow = fixture.nativeElement.querySelector(
      'mj-row.layout-only-row'
    ) as HTMLElement;
    expect(layoutRow.getAttribute('role')).toBeNull();
    expect(layoutRow.getAttribute('tabindex')).toBeNull();

    const opt1 = fixture.nativeElement.querySelector('mj-row.opt-1') as HTMLElement;
    const opt2 = fixture.nativeElement.querySelector('mj-row.opt-2') as HTMLElement;
    expect(opt1.style.getPropertyValue('--_mj-visual-role-padding-inline')).toContain(
      '--mj-visual-role-nav-item-padding-inline'
    );
    // NAMING.md: tones do not define a -selected background token
    expect(opt1.style.getPropertyValue('--_mj-tone-bg-selected')).toBe('');
    expect(opt1.getAttribute('tabindex')).toBe('0');
    expect(opt2.getAttribute('tabindex')).toBe('-1');

    opt1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedIdx()).toBe(1);
    expect(opt1.getAttribute('tabindex')).toBe('-1');
    expect(opt2.getAttribute('tabindex')).toBe('0');
    expect(opt2.classList.contains('is-selected')).toBe(true);

    // Clearing selection dynamically restores fallback tabindex="0" on the first enabled option
    fixture.componentInstance.selectedIdx.set(-1);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    expect(opt1.getAttribute('tabindex')).toBe('0');
    expect(opt2.getAttribute('tabindex')).toBe('-1');

    fixture.componentInstance.selectedIdx.set(1);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    expect(opt1.getAttribute('tabindex')).toBe('-1');
    expect(opt2.getAttribute('tabindex')).toBe('0');

    fixture.componentInstance.cancelNextSelect = true;
    opt2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.selectedIdx()).toBe(1);

    await ExpectNoAxeViolations(fixture);
  });
});

@Component({
  standalone: true,
  imports: [MJRowComponent, MJRowContentDirective],
  template: `
    <div role="menu" aria-label="Actions" class="plain-menu">
      <mj-row class="m-1" [Interactive]="true" [ItemRole]="'menuitem'"><span mjRowContent>Rename</span></mj-row>
      <mj-row class="m-2" [Interactive]="true" [ItemRole]="'menuitem'"><span mjRowContent>Duplicate</span></mj-row>
      <mj-row class="m-3" [Interactive]="true" [ItemRole]="'menuitem'"><span mjRowContent>Delete</span></mj-row>
    </div>
    <div role="menubar" aria-label="Main" class="plain-menubar">
      <mj-row class="b-1" [Interactive]="true" [ItemRole]="'menuitem'"><span mjRowContent>File</span></mj-row>
      <mj-row class="b-2" [Interactive]="true" [ItemRole]="'menuitem'"><span mjRowContent>Edit</span></mj-row>
    </div>
  `,
})
class MenuRowHostComponent {}

describe('MJRowComponent menu items outside a layer', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MenuRowHostComponent],
    }).compileComponents();
  });

  function press(el: HTMLElement, key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    el.dispatchEvent(event);
    return event;
  }

  it('answers the arrow keys in a plain [role="menu"], since its roving tabindex takes items out of the Tab order', async () => {
    const fixture = TestBed.createComponent(MenuRowHostComponent);
    fixture.detectChanges();
    await Promise.resolve();
    fixture.detectChanges();
    const [m1, m2, m3] = ['m-1', 'm-2', 'm-3'].map(
      (c) => fixture.nativeElement.querySelector(`mj-row.${c}`) as HTMLElement
    );

    expect(m1.getAttribute('tabindex')).toBe('0');
    expect(m2.getAttribute('tabindex')).toBe('-1');

    m1.focus();
    expect(press(m1, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(m2);
    press(m2, 'End');
    expect(document.activeElement).toBe(m3);
    press(m3, 'ArrowDown');
    expect(document.activeElement).toBe(m1);
    press(m1, 'ArrowUp');
    expect(document.activeElement).toBe(m3);
    press(m3, 'Home');
    expect(document.activeElement).toBe(m1);
  });

  it('uses Left and Right in a menubar and leaves Up and Down alone', () => {
    const fixture = TestBed.createComponent(MenuRowHostComponent);
    fixture.detectChanges();
    const [b1, b2] = ['b-1', 'b-2'].map(
      (c) => fixture.nativeElement.querySelector(`mj-row.${c}`) as HTMLElement
    );

    b1.focus();
    expect(press(b1, 'ArrowDown').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(b1);
    press(b1, 'ArrowRight');
    expect(document.activeElement).toBe(b2);
    press(b2, 'ArrowLeft');
    expect(document.activeElement).toBe(b1);
  });
});
