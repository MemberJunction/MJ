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
    // role="combobox" and aria-expanded live on the INPUT — the element that takes focus.
    expect(query(f, '.mj-combobox-input[role="combobox"]')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens the panel and lists all options on focus', () => {
    const f = render();
    focusOpen(f);
    expect(input(f).getAttribute('aria-expanded')).toBe('true');
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
    expect(input(f).getAttribute('aria-expanded')).toBe('false');
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
 * this guards lives in the seam between the two. `IsDisabled` — the only gate on `Toggle()`/`Open()`
 * — is derived state, and the only thing that ever assigned it was `setDisabledState()`. The
 * forms-driven half was always live (`setUpControl` also wires `registerOnDisabledChange`, so the
 * hook re-fires on every `control.disable()`/`enable()`); what had no recompute path at all was the
 * `Disabled` @Input, a plain field. So the gate froze whatever `Disabled` happened to be when the
 * hook last ran and dropped every later change to the input:
 *
 *   - `Disabled` true at that moment → the control was dead FOREVER, even after it went false;
 *   - `Disabled` false at that moment → the control could never be locked afterwards;
 *   - no forms binding at all → the hook never ran, so `[Disabled]` was completely inert.
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
  /**
   * Open the way a user actually can. Unlike mj-dropdown, whose `.mj-dropdown` wrapper carries
   * `(click)="Toggle()"`, the `.mj-combobox` wrapper is an inert `<div>` — this control opens on
   * `(focus)` of its inner input or `(mousedown)` on `.mj-combobox-toggle`. Dispatching the event
   * directly (rather than relying on the DOM suppressing it while `[disabled]` is set) is
   * deliberate: it puts the assertion on the component's own `IsDisabled` gate, which is the
   * thing under test.
   */
  const pressToggle = (): void => {
    (fixture.nativeElement.querySelector('.mj-combobox-toggle') as HTMLElement)
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
  };
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

    pressToggle();
    expect(control().IsOpen, 're-enabled combobox must open').toBe(true);
  });

  it('LOCKS when Disabled flips to true after registration', () => {
    lock(false);
    pressToggle();
    expect(control().IsOpen).toBe(true);

    lock(true);
    expect(control().IsDisabled).toBe(true);
    expect(control().IsOpen, 'locking an open combobox must close its panel').toBe(false);

    pressToggle();
    expect(control().IsOpen, 'and must stay shut on a further gesture').toBe(false);
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

// ─────────────────────────────────────────────────────────────────────────────

/**
 * The same defect in its broadest form — no Angular Forms anywhere. With no `ngModel` /
 * `formControl` on the element, `setDisabledState()` is never called at all, so the gate was left
 * at its initialiser and `[Disabled]` was completely inert: the control rendered fully enabled and
 * responded to gestures. `Disabled` only ever worked as a side effect of a forms binding happening
 * to compose it in, which is why this is the widest case and the cheapest one to regress.
 */
describe('MJComboboxComponent — Disabled with no Angular Forms binding (DOM)', () => {
  it('honours [Disabled] on its own, with no ngModel present', () => {
    const f = render({ Disabled: true });

    expect(f.componentInstance.IsDisabled, 'the gate must follow the input unaided').toBe(true);
    expect((query(f, '.mj-combobox') as HTMLElement).classList.contains('mj-combobox--disabled')).toBe(true);

    focusOpen(f);
    expect(f.componentInstance.IsOpen, 'a disabled combobox must not open').toBe(false);
  });

});

/** Id of the hidden span holding one composed word, found by the word itself. */
const srOnlyId = (f: ReturnType<typeof render>, word: string) =>
  Array.from(f.nativeElement.querySelectorAll('.mj-combobox-sr-only') as NodeListOf<HTMLElement>)
    .find((el) => el.textContent?.trim() === word)
    ?.getAttribute('id');

describe('MJComboboxComponent — accessible name (#4116)', () => {
  const toggle = (f: ReturnType<typeof render>) => query(f, '.mj-combobox-toggle') as HTMLElement;
  const keydown = (el: Element, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

  it('names the INPUT with AriaLabel — and the popup listbox with the same name', () => {
    // The name has to land on the input: that is the element that takes focus, so it is the one
    // a screen reader announces. Naming the wrapper names something nobody ever visits.
    const f = render({ AriaLabel: 'Interview persona' });
    expect(input(f).getAttribute('aria-label')).toBe('Interview persona');
    focusOpen(f);
    expect(overlayQuery('.mj-dropdown-panel')?.getAttribute('aria-label')).toBe('Interview persona');
  });

  it('names the input from a visible label via AriaLabelledBy — input AND popup listbox', () => {
    const f = render({ AriaLabelledBy: 'persona-label' });
    expect(input(f).getAttribute('aria-labelledby')).toBe('persona-label');
    focusOpen(f);
    expect(overlayQuery('.mj-dropdown-panel')?.getAttribute('aria-labelledby')).toBe('persona-label');
  });

  it('puts InputId on the real <input>, which IS a valid <label for> target', () => {
    // The divergence from mj-dropdown, whose trigger is a div that label[for] can neither name
    // nor focus. Here the id lands on a labelable form element, so label[for] works.
    const f = render({ InputId: 'persona-combo' });
    expect(input(f).getAttribute('id')).toBe('persona-combo');
    expect(input(f).tagName).toBe('INPUT');
  });

  it('passes AriaDescribedBy through for hint and error text', () => {
    const f = render({ AriaDescribedBy: 'persona-hint' });
    expect(input(f).getAttribute('aria-describedby')).toBe('persona-hint');
  });

  it('renders NO empty name attributes when nothing is configured — absent beats empty', () => {
    // aria-label="" is worse than no attribute: it overrides every other naming source with an
    // explicitly empty name.
    const f = render({});
    expect(input(f).hasAttribute('aria-label')).toBe(false);
    expect(input(f).hasAttribute('aria-labelledby')).toBe(false);
    expect(input(f).hasAttribute('id')).toBe(false);
    expect(input(f).hasAttribute('aria-describedby')).toBe(false);
  });

  it('names the toggle button from the combobox name — it had no name at all before', () => {
    const f = render({ AriaLabel: 'Interview persona' });
    expect(toggle(f).getAttribute('aria-label')).toBe('Show options for Interview persona');
  });

  it('names the toggle button from the VISIBLE label too, via an id list', () => {
    // A concatenated string cannot work here: the component never sees the label's text, only
    // its id. Without the id list every toggle on a form announces an identical "Show options".
    const f = render({ AriaLabelledBy: 'persona-label' });
    const wordId = srOnlyId(f, 'Show options for');
    expect(wordId).toBeTruthy();
    expect(toggle(f).getAttribute('aria-labelledby')).toBe(`${wordId} persona-label`);
    // aria-label must be ABSENT, not empty: it would otherwise win over aria-labelledby.
    expect(toggle(f).hasAttribute('aria-label')).toBe(false);
  });

  it('keeps the composed words out of the reading order with aria-hidden', () => {
    // A hidden node DIRECTLY referenced by aria-labelledby still counts toward the name
    // (accname §4.1), so the words compose without being read as stray text beside the field.
    const f = render({ AriaLabelledBy: 'persona-label' });
    const words = Array.from(f.nativeElement.querySelectorAll('.mj-combobox-sr-only') as NodeListOf<HTMLElement>);
    expect(words.length).toBe(2);
    expect(words.every((w) => w.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('falls back to a generic toggle name when the combobox itself is unnamed', () => {
    const f = render({});
    expect(toggle(f).getAttribute('aria-label')).toBe('Show options');
  });

  it('names the clear button from the combobox name instead of a bare "Clear"', () => {
    const f = render({ AriaLabel: 'Interview persona' });
    focusOpen(f);
    mousedown(overlayQueryAll('.mj-dropdown-option')[0]);
    f.detectChanges();
    expect((query(f, '.mj-combobox-clear') as HTMLElement).getAttribute('aria-label')).toBe('Clear Interview persona');
  });

  it('does not double a name that already begins with the composed word', () => {
    // The house habit `AriaLabel="Clear filters"` would otherwise announce "Clear Clear filters".
    const f = render({ AriaLabel: 'Clear filters' });
    focusOpen(f);
    mousedown(overlayQueryAll('.mj-dropdown-option')[0]);
    f.detectChanges();
    expect((query(f, '.mj-combobox-clear') as HTMLElement).getAttribute('aria-label')).toBe('Clear filters');
  });

  it('carries role=combobox and its state attributes on the INPUT, not the wrapper', () => {
    // aria-expanded on a non-focusable wrapper is announced to nobody.
    const f = render();
    expect(input(f).getAttribute('role')).toBe('combobox');
    expect(input(f).getAttribute('aria-haspopup')).toBe('listbox');
    expect(input(f).getAttribute('aria-autocomplete')).toBe('list');
    expect(query(f, '.mj-combobox')?.hasAttribute('role')).toBe(false);
    expect(query(f, '.mj-combobox')?.hasAttribute('aria-expanded')).toBe(false);
  });

  it('points the input at the listbox with aria-controls while open', () => {
    const f = render();
    expect(input(f).hasAttribute('aria-controls')).toBe(false);   // nothing to point at yet
    focusOpen(f);
    const listboxId = overlayQuery('.mj-dropdown-panel')?.getAttribute('id');
    expect(listboxId).toBeTruthy();
    expect(input(f).getAttribute('aria-controls')).toBe(listboxId);
  });

  it('follows the arrow-key highlight with aria-activedescendant', () => {
    // Focus never leaves the input, so without this the highlight is a CSS class and nothing
    // else — a screen-reader user arrowing through the list hears no change at all.
    const f = render();
    focusOpen(f);
    expect(input(f).hasAttribute('aria-activedescendant')).toBe(false);

    keydown(input(f), 'ArrowDown');
    f.detectChanges();

    const highlighted = overlayQueryAll('.mj-dropdown-option')[0];
    expect(highlighted.getAttribute('id')).toBeTruthy();
    expect(input(f).getAttribute('aria-activedescendant')).toBe(highlighted.getAttribute('id'));
  });
});
