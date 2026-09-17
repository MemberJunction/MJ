import { isDevMode } from '@angular/core';

/**
 * Options for {@link warnIfUnnamed}.
 */
export type UnnamedControlGuardOptions = {
  /**
   * Whether a non-empty `placeholder` counts as this control's name.
   *
   * **False for every form control**, and deliberately so: a placeholder disappears the moment the
   * user types, and counting it would silence the guard for most of the controls it exists to catch
   * — nearly every `mj-combobox` and `mj-datepicker` call site in this repo already passes a
   * `Placeholder`, so a new one could still ship unnamed without a word of warning.
   *
   * True only for `mj-page-search`, a toolbar widget whose placeholder ("Search templates…") IS the
   * caller's statement of what the box searches, and whose default placeholder is never absent.
   */
  placeholderIsName?: boolean;
};

/**
 * Dev-mode guard: warn when one of this package's named controls renders with **no accessible name
 * at all**.
 *
 * This is the recorded answer to the prevention question raised in #3860 and resolved in #4116: an
 * unnamed control is silent, which is why the defect survived as long as it did. Without a feedback
 * loop, every dropdown or combobox added tomorrow ships unnamed and silent again. It follows the two
 * guards already shipping in this package — `mjButton`'s icon-only warning and `mjClickable`'s —
 * rather than inventing a third shape: dev-mode only, once per rendered control, never throwing, and
 * always logging the offending element so it is one click to find.
 *
 * **What counts as a name here** is what the accessible-name computation would actually resolve on
 * the element: an `aria-labelledby` whose ids resolve to real elements, `aria-label`, an associated
 * `<label for>`, `title`, and — only where {@link UnnamedControlGuardOptions.placeholderIsName} says
 * so — a `placeholder`. A dangling `aria-labelledby` does NOT count: an idref pointing at an element
 * that was renamed or is not rendered yet computes to an empty name, and that silent half-wiring is
 * exactly the failure this guard is for.
 *
 * It does not judge name *quality* beyond that, because a guard that fires on a merely-imperfect
 * name gets muted and then the empty ones go unnoticed too.
 *
 * Text content is **not** counted. None of these controls take their name from their contents: a
 * `div[role=combobox]`'s text is the selected value and a `role=switch`'s is its state, so counting
 * it would make the guard fall silent for exactly the controls it exists to catch.
 *
 * **Known limitation**, shared with the two existing guards: it runs once, after the view
 * initializes, so a name bound to data that arrives later (`[AriaLabel]="record?.Name"`), or one
 * pointing at a label that a later change detection renders, warns spuriously on that first pass.
 *
 * @param element the control's focusable element — the one the name has to land on
 * @param selector the control's tag, for the message prefix (`mj-combobox`)
 * @param options per-control naming rules; see {@link UnnamedControlGuardOptions}
 */
export function warnIfUnnamed(
  element: HTMLElement | null | undefined,
  selector: string,
  options: UnnamedControlGuardOptions = {}
): void {
  if (!isDevMode() || !element) {
    return;
  }
  try {
    if (hasAccessibleName(element, options)) {
      return;
    }
    console.warn(
      `[${selector}] has no accessible name — it announces as its role and state alone, which fails ` +
        'WCAG 2.1 4.1.2. Pass AriaLabelledBy="<id of a visible label>", or AriaLabel="…" when there ' +
        'is no visible label.',
      element
    );
  } catch {
    // Never let diagnostics break the control.
  }
}

/** True when the accessible-name computation would resolve any name for this element. */
function hasAccessibleName(element: HTMLElement, options: UnnamedControlGuardOptions): boolean {
  const attributes = options.placeholderIsName ? ['aria-label', 'title', 'placeholder'] : ['aria-label', 'title'];
  const named = attributes.some((attribute) => element.getAttribute(attribute)?.trim());
  return named || hasResolvedLabelledBy(element) || hasAssociatedLabel(element);
}

/**
 * True when at least one id in `aria-labelledby` resolves to an element in the document.
 *
 * The resolution check is the point: `aria-labelledby` pointing at nothing computes to an EMPTY
 * name, so treating the attribute's mere presence as proof of a name would wave through the
 * renamed-label case — markup that looks correct and leaves the control unnamed.
 */
function hasResolvedLabelledBy(element: HTMLElement): boolean {
  const ids = element.getAttribute('aria-labelledby')?.trim();
  if (!ids) {
    return false;
  }
  const doc = element.ownerDocument;
  return ids.split(/\s+/).some((id) => !!doc?.getElementById(id));
}

/**
 * True when a `<label for>` in the same document points at this element. Matched by reading each
 * label's `for` rather than by a `label[for="…"]` selector, so an id containing CSS-special
 * characters can't turn a diagnostic into a thrown selector error.
 */
function hasAssociatedLabel(element: HTMLElement): boolean {
  const id = element.getAttribute('id');
  if (!id) {
    return false;
  }
  const labels = element.ownerDocument?.querySelectorAll('label[for]') ?? [];
  return Array.from(labels).some((label) => label.getAttribute('for') === id);
}
