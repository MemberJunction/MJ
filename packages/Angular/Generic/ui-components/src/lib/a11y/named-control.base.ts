import { Directive, Input } from '@angular/core';

/**
 * The accessible-name inputs shared by every control in this package that a caller has to be able
 * to NAME: `mj-dropdown`, `mj-combobox`, `mj-switch`, `mj-numeric-input`, `mj-datepicker` and
 * `mj-page-search`.
 *
 * A control with no accessible name announces as its role and state alone — "combobox, collapsed",
 * "switch, on", "edit blank" — which fails WCAG 2.1 4.1.2 (Name, Role, Value). `mj-dropdown` got
 * these four inputs first (#3860); this base is what keeps each sibling from inventing its own
 * spelling of the same idea (#4116).
 *
 * **Absent beats empty.** Subclasses bind every one of these through `X || null`, never as a bare
 * binding. `aria-label=""` is worse than no attribute at all: an explicitly empty name OVERRIDES
 * every other naming source in the accessible-name computation.
 *
 * Subclasses apply the four to the element that actually **receives focus** — naming a
 * non-focusable wrapper announces nothing — and repeat the name on any popup they own, so both
 * halves announce the same thing.
 */
@Directive()
export abstract class MJNamedControlBase {
  /**
   * Accessible name for the control, for when no visible label exists. Prefer
   * {@link AriaLabelledBy} when one does — an `aria-label` duplicates that label's text and drifts
   * from it on rename. `aria-labelledby` beats `aria-label` where both are present.
   */
  @Input() AriaLabel = '';

  /**
   * The id of a VISIBLE label element that names this control — the preferred wiring whenever a
   * label already exists on screen. It is also the only path that can name a control's SECONDARY
   * pieces (a filter box, a toggle, a calendar) from that same label: see
   * {@link SecondaryLabelledBy}.
   */
  @Input() AriaLabelledBy = '';

  /**
   * `id` for the control's focusable element, so other markup can REFERENCE it — `aria-controls`,
   * hint text, test hooks.
   *
   * Whether it doubles as a `<label for>` target depends on the control, because `label[for]` only
   * names and focuses *labelable form elements*: on the input-backed controls (`mj-combobox`,
   * `mj-numeric-input`, `mj-datepicker`, `mj-page-search`) it lands on a real `<input>` and works;
   * on `mj-dropdown` it lands on a `div[role=combobox]` and does NOT — wiring `label[for]` there
   * produces markup that looks correct, passes review, and leaves the control unnamed. Each
   * control's own docs say which it is.
   */
  @Input() InputId = '';

  /** `aria-describedby` passthrough for hint and error text — the same shape of gap as the name. */
  @Input() AriaDescribedBy = '';

  /**
   * Counter behind every id a control generates for itself, matching the `static nextId` mechanism
   * `dialog`, `window` and `accordion` already use in this package. One counter across all named
   * controls: the ids only have to be unique in the document, not dense per component.
   */
  private static nextId = 0;

  /** This instance's id suffix, shared by every id the control generates. */
  readonly NamedControlId = MJNamedControlBase.nextId++;

  /**
   * Id of a hidden span holding one fixed WORD of a secondary control's name — "Filter", "Clear",
   * "Open calendar for". Composed with the host's visible label by {@link SecondaryLabelledBy}.
   */
  SecondaryWordId(slug: string): string {
    return `mj-a11y-${slug}-${this.NamedControlId}`;
  }

  /**
   * `aria-labelledby` for a secondary control when a VISIBLE label names the host: the hidden word
   * plus that label's own text, composed by the accessibility tree from an id LIST. Empty when
   * there is no such label, in which case {@link SecondaryLabel} supplies a string instead.
   *
   * An id list is the only mechanism that can work here — the component never sees the label's
   * text, only its id. Without it, every filterable dropdown on a form named this way announces an
   * identical "Filter options", and a form with six of them has six indistinguishable filter boxes.
   */
  SecondaryLabelledBy(slug: string): string {
    return this.AriaLabelledBy ? `${this.SecondaryWordId(slug)} ${this.AriaLabelledBy}` : '';
  }

  /**
   * `aria-label` for a secondary control in the no-visible-label case: `word` followed by the
   * host's own name, or `fallback` when the host has no name either.
   *
   * The already-starts-with-`word` guard is not cosmetic: this repo's house habit is
   * `AriaLabel="Filter roles"`, and an unconditional prefix announces that box as
   * "Filter Filter roles".
   *
   * The match ends on a WORD BOUNDARY, not on a space: `AriaLabel="Filter: roles"` already begins
   * with the word and must not be prefixed either, while `"Filters"` is a different word and must
   * be. A space-only test gets the punctuated case wrong in the doubling direction.
   */
  SecondaryLabel(word: string, fallback: string): string {
    const name = this.AriaLabel.trim();
    if (!name) {
      return fallback;
    }
    return this.beginsWithWord(name.toLowerCase(), word.toLowerCase()) ? name : `${word} ${name}`;
  }

  /** True when `name` starts with `word` and the next character (if any) ends that word. */
  private beginsWithWord(name: string, word: string): boolean {
    if (!name.startsWith(word)) {
      return false;
    }
    const next = name.charAt(word.length);
    return next === '' || !MJNamedControlBase.isWordCharacter(next);
  }

  /** `\w` as a regular expression means it: ASCII letters, digits and underscore. Input is lowercased. */
  private static isWordCharacter(character: string): boolean {
    return (character >= 'a' && character <= 'z') || (character >= '0' && character <= '9') || character === '_';
  }
}
