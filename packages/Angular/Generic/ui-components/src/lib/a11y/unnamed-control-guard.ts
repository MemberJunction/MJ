import { isDevMode } from '@angular/core';

/**
 * Dev-mode guard: warn when one of this package's named controls renders with **no accessible name
 * at all**.
 *
 * This is the recorded answer to the prevention question raised in #3860 and resolved in #4116: an
 * unnamed control is silent, which is why the defect survived as long as it did. Without a feedback
 * loop, every dropdown or combobox added tomorrow ships unnamed and silent again. It
 * follows the two guards already shipping in this package — `mjButton`'s icon-only warning and
 * `mjClickable`'s — rather than inventing a third shape: dev-mode only, once per rendered control,
 * never throwing, and always logging the offending element so it is one click to find.
 *
 * **What counts as a name here** is exactly what the accessible-name computation would find on the
 * element: `aria-labelledby`, `aria-label`, an associated `<label for>`, `title`, or — on a text
 * input, where it is the documented fallback — a `placeholder`. The guard fires only when the name
 * would be genuinely EMPTY. It deliberately does not judge name *quality* (a placeholder-only name
 * disappears the moment the user types, and a switch's On/Off text names it after its own state),
 * because a guard that fires on a merely-imperfect name gets muted and then the empty ones go
 * unnoticed too.
 *
 * Text content is **not** counted. None of these controls take their name from their contents: a
 * `div[role=combobox]`'s text is the selected value and a `role=switch`'s is its state, so counting
 * it would make the guard fall silent for exactly the controls it exists to catch.
 *
 * **Known limitation**, shared with the two existing guards: it runs once, after the view
 * initializes, so a name bound to data that arrives later (`[AriaLabel]="record?.Name"`) warns
 * spuriously on that first pass.
 *
 * @param element the control's focusable element — the one the name has to land on
 * @param selector the control's tag, for the message prefix (`mj-combobox`)
 */
export function warnIfUnnamed(element: HTMLElement | null | undefined, selector: string): void {
  if (!isDevMode() || !element) {
    return;
  }
  try {
    if (hasAccessibleName(element)) {
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

/** True when the accessible-name computation would find any name for this element. */
function hasAccessibleName(element: HTMLElement): boolean {
  const named = ['aria-labelledby', 'aria-label', 'title', 'placeholder'].some((attribute) =>
    element.getAttribute(attribute)?.trim()
  );
  return named || hasAssociatedLabel(element);
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
