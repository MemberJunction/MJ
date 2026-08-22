import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { renderComponentFixture, query, capture, overlayQuery, overlayQueryAll, overlayText, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MJComboboxComponent } from './combobox.component';

/**
 * DOM coverage for <mj-combobox> — the editable/filtering select (used ~10×). Like mj-dropdown its
 * panel renders in a CDK connected-overlay (overlay-query helpers). Options select on `mousedown`
 * (so the click beats the input's blur), and typed custom values commit on blur (async, 150ms).
 * Covers: input/placeholder, focus opens + lists, typing filters, mousedown select → ValueChange +
 * input fill + close, clear → null, empty state, and the AllowCustom blur-commit path.
 */

const DATA = [
  { text: 'Apples', value: 'a' },
  { text: 'Bananas', value: 'b' },
  { text: 'Cherries', value: 'c' },
];

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MJComboboxComponent, {
    imports: [MJComboboxComponent],
    inputs: { Data: DATA, TextField: 'text', ValueField: 'value', ValuePrimitive: true, ...inputs },
  });

const input = (f: ReturnType<typeof render>) => query(f, '.mj-combobox-input') as HTMLInputElement;
const focusOpen = (f: ReturnType<typeof render>) => { input(f).dispatchEvent(new Event('focus')); f.detectChanges(); };
const mousedown = (el: Element) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

afterEach(() => clearOverlayContainers());

describe('MJComboboxComponent (DOM)', () => {
  it('renders the text input with the placeholder', () => {
    const f = render({ Placeholder: 'Pick a fruit' });
    expect(input(f).placeholder).toBe('Pick a fruit');
    expect(query(f, '.mj-combobox[role="combobox"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the panel and lists all options on focus', () => {
    const f = render();
    focusOpen(f);
    expect(query(f, '.mj-combobox')?.getAttribute('aria-expanded')).toBe('true');
    expect(overlayQueryAll('.mj-dropdown-option').map((o) => o.textContent?.trim())).toEqual(['Apples', 'Bananas', 'Cherries']);
  });

  it('filters the options as the user types', () => {
    const f = render();
    focusOpen(f);
    input(f).value = 'err';
    input(f).dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(overlayQueryAll('.mj-dropdown-option').map((o) => o.textContent?.trim())).toEqual(['Cherries']);
  });

  it('selects an option on mousedown — emits the value, fills the input, closes', () => {
    const f = render();
    const changes = capture(f.componentInstance.ValueChange);
    focusOpen(f);
    mousedown(overlayQueryAll('.mj-dropdown-option')[1]);
    f.detectChanges();
    expect(changes).toEqual(['b']);
    expect(input(f).value).toBe('Bananas');
    expect(query(f, '.mj-combobox')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows a clear button once there is input text and clears the value on click', () => {
    const f = render();
    focusOpen(f);
    mousedown(overlayQueryAll('.mj-dropdown-option')[0]);
    f.detectChanges();
    const clear = query(f, '.mj-combobox-clear') as HTMLElement;
    expect(clear).not.toBeNull();
    const changes = capture(f.componentInstance.ValueChange);
    mousedown(clear);
    f.detectChanges();
    expect(changes).toEqual([null]);
    expect(input(f).value).toBe('');
  });

  it('shows the empty state when no options match', () => {
    const f = render();
    focusOpen(f);
    input(f).value = 'zzz';
    input(f).dispatchEvent(new Event('input'));
    f.detectChanges();
    expect(overlayText('.mj-dropdown-no-data')).toBe('No data found');
  });

  it('commits a typed custom value on blur when AllowCustom is true', async () => {
    const f = render({ AllowCustom: true });
    const changes = capture(f.componentInstance.ValueChange);
    focusOpen(f);
    input(f).value = 'Dragonfruit';
    input(f).dispatchEvent(new Event('input'));
    input(f).dispatchEvent(new Event('blur'));
    await new Promise((r) => setTimeout(r, 200)); // OnInputBlur commits after a 150ms guard
    f.detectChanges();
    expect(changes.at(-1)).toBe('Dragonfruit');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disabled-state contract — the control is unusable exactly when the `Disabled` input OR the
 * reactive-forms disabled state says so, **at every point in time**, not only at the moment
 * Angular Forms registers the ControlValueAccessor.
 *
 * Needs a real `ngModel` host, unlike the specs above which render the component bare: the defect
 * this guards lives in the seam between the two. Angular calls `setDisabledState()` ONCE, at CVA
 * registration (`setUpControl`, default `CALL_SET_DISABLED_STATE: 'always'`), and `IsDisabled` —
 * the only gate on `Toggle()`/`Open()` — used to be assigned only there. So it froze whatever
 * `Disabled` happened to be at that instant and dropped every later change:
 *
 *   - `Disabled` true at registration → the control was dead FOREVER, even after it went false;
 *   - `Disabled` false at registration → the control could never be locked afterwards.
 *
 * The first direction shipped a real user-facing failure (a picker gated on "pick a company first"
 * never came back to life once the company was picked). All five MJ form controls carried the
 * identical defect; each now has an equivalent block.
 */
@Component({
  standalone: true,
  imports: [MJComboboxComponent, FormsModule],
  template: `
    <mj-combobox
      [Data]="Items" TextField="text" ValueField="value" [ValuePrimitive]="true"
      [Disabled]="Locked" [(ngModel)]="Value" />
  `,
})
class DisabledHostComponent {
  public Items = DATA;
  /** An @Input so specs flip it via `componentRef.setInput()` — the zoneless-correct way to mark
   *  the view dirty; a plain field assignment trips NG0100 on the verify pass. */
  @Input() Locked = false;
  public Value: string | null = null;
}

describe('MJComboboxComponent — disabled state (DOM, ngModel host)', () => {
  let fixture: ComponentFixture<DisabledHostComponent>;

  const control = (): MJComboboxComponent =>
    fixture.debugElement.children[0].componentInstance as MJComboboxComponent;
  const hostTrigger = (): HTMLElement =>
    fixture.nativeElement.querySelector('.mj-combobox') as HTMLElement;
  const lock = (value: boolean): void => {
    fixture.componentRef.setInput('Locked', value);
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [DisabledHostComponent] }).compileComponents();
    fixture = TestBed.createComponent(DisabledHostComponent);
  });

  it('RE-ENABLES when Disabled flips to false after registration', () => {
    lock(true);
    expect(control().IsDisabled).toBe(true);
    expect(hostTrigger().classList.contains('mj-combobox--disabled')).toBe(true);

    lock(false);
    expect(control().Disabled, 'the @Input itself is false').toBe(false);
    expect(control().IsDisabled, 'and the gate must have followed it').toBe(false);
    expect(hostTrigger().classList.contains('mj-combobox--disabled')).toBe(false);

    hostTrigger().click();
    fixture.detectChanges();
    expect(control().IsOpen, 're-enabled combobox must open').toBe(true);
  });

  it('LOCKS when Disabled flips to true after registration', () => {
    lock(false);
    hostTrigger().click();
    fixture.detectChanges();
    expect(control().IsOpen).toBe(true);

    lock(true);
    expect(control().IsDisabled).toBe(true);
    expect(control().IsOpen, 'locking an open combobox must close its panel').toBe(false);

    hostTrigger().click();
    fixture.detectChanges();
    expect(control().IsOpen).toBe(false);
  });

  it('stays disabled while the forms-driven state holds, regardless of @Input churn', () => {
    lock(false); // first CD pass — this is what registers the ControlValueAccessor

    // `setDisabledState` is how Angular Forms reports a programmatically disabled control. Render
    // it via a `lock()` (setInput) rather than a bare `detectChanges()`: a direct call mutates
    // state without marking the view dirty, and zoneless dev-mode check-no-changes then throws
    // NG0100 (guides/ANGULAR_TESTING_GUIDE.md). The @Input churn is the assertion anyway.
    control().setDisabledState(true);
    lock(true);
    lock(false);
    expect(control().IsDisabled, 'forms-driven disable survives @Input churn').toBe(true);

    control().setDisabledState(false);
    lock(true);
    lock(false);
    expect(control().IsDisabled, 'released by both sources ⇒ usable').toBe(false);
  });
});
