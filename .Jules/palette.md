## 2024-05-16 - Comprehensive ARIA label application
**Learning:** When identifying a micro-UX opportunity like adding an ARIA label to a specific icon-only button class in a component (e.g., `at-schedule-dialog-close`), it's critical to perform a full file search to apply the fix to all identical instances within the same file, avoiding an incomplete fix and ensuring consistency.
**Action:** Always `grep` the modified file for other occurrences of the same component/class pattern when making micro-UX fixes, rather than fixing only the first one encountered.
## 2026-05-23 - Adding ARIA labels to dynamically titled elements
**Learning:** When a button has a dynamic `[title]` attribute (e.g., using a ternary operator based on state), the corresponding `aria-label` must be dynamically bound using `[attr.aria-label]` rather than a static string, to ensure screen readers always convey the accurate state (like "Save to Collection" vs "Current version saved to X collections").
**Action:** When adding ARIA labels to buttons that change their title/purpose based on component state, always mirror that state logic in an `[attr.aria-label]` binding instead of applying a static string.
