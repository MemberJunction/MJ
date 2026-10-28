## 2024-05-16 - Comprehensive ARIA label application
**Learning:** When identifying a micro-UX opportunity like adding an ARIA label to a specific icon-only button class in a component (e.g., `at-schedule-dialog-close`), it's critical to perform a full file search to apply the fix to all identical instances within the same file, avoiding an incomplete fix and ensuring consistency.
**Action:** Always `grep` the modified file for other occurrences of the same component/class pattern when making micro-UX fixes, rather than fixing only the first one encountered.

## 2024-06-06 - Dynamic ARIA Labels in Angular Charts
**Learning:** When adding ARIA labels to toggle buttons that expand/collapse charts (e.g., in `ai-agent-run-analytics`), using Angular's property binding (`[attr.aria-label]="condition ? 'Collapse...' : 'Expand...'"`) is highly effective. It ensures screen readers always announce the correct current action state of the toggle, unlike static labels which would become inaccurate after the first click.
**Action:** Always prefer dynamic state-based `[attr.aria-label]` strings over static strings for elements that act as toggles, and accompany them with `aria-hidden="true"` on the underlying graphical icons (like FontAwesome).
## 2024-07-04 - Adding aria-labels to Zoom Controls
**Learning:** Icon-only buttons used for primary controls (like zoom controls) often lack proper aria-labels in custom Angular components. Additionally, the inner `<i>` tags should explicitly receive `aria-hidden="true"` so screen readers don't misinterpret or double-announce the decorative icon.
**Action:** Always check icon-only controls for both an overarching `aria-label` and `aria-hidden="true"` on the underlying graphical icon component.

## 2024-07-11 - Adding aria-hidden to decorative icons within accessible buttons
**Learning:** When making an icon-only button accessible by adding an `aria-label` to the `<button>` element itself, it's a critical accessibility best practice to also add `aria-hidden="true"` to the inner decorative icon tag (like `<i class="fa-solid fa-xmark"></i>`). This prevents screen readers from pointlessly announcing the icon class names or getting confused by the visual elements when the parent button already provides a clear, descriptive label.
**Action:** Always pair `aria-label="Action description"` on the wrapper button with `aria-hidden="true"` on the enclosed icon element for a clean screen reader experience.
