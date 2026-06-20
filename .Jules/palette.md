## 2024-05-16 - Comprehensive ARIA label application
**Learning:** When identifying a micro-UX opportunity like adding an ARIA label to a specific icon-only button class in a component (e.g., `at-schedule-dialog-close`), it's critical to perform a full file search to apply the fix to all identical instances within the same file, avoiding an incomplete fix and ensuring consistency.
**Action:** Always `grep` the modified file for other occurrences of the same component/class pattern when making micro-UX fixes, rather than fixing only the first one encountered.

## 2024-06-06 - Dynamic ARIA Labels in Angular Charts
**Learning:** When adding ARIA labels to toggle buttons that expand/collapse charts (e.g., in `ai-agent-run-analytics`), using Angular's property binding (`[attr.aria-label]="condition ? 'Collapse...' : 'Expand...'"`) is highly effective. It ensures screen readers always announce the correct current action state of the toggle, unlike static labels which would become inaccurate after the first click.
**Action:** Always prefer dynamic state-based `[attr.aria-label]` strings over static strings for elements that act as toggles, and accompany them with `aria-hidden="true"` on the underlying graphical icons (like FontAwesome).

## 2024-11-20 - Adding ARIA hidden to icons in buttons
**Learning:** For accessibility in UI templates, when adding `aria-label` to an icon-only button, also add `aria-hidden="true"` to the inner icon element (e.g., `<i class="fa-solid...">`) to prevent screen readers from redundantly trying to process the visual icon.
**Action:** Always add `aria-hidden="true"` to visual icons inside buttons that have an `aria-label`.
