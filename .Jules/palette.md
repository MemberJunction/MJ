## 2026-04-17 - Add ARIA Labels to Angular Search Components
**Learning:** Icon-only buttons used for custom pagination, expanding details, and clearing input within Angular structural directives (like `@if` and `@for`) need explicit `aria-label` attributes to ensure screen readers announce their function appropriately, as standard titles alone may be insufficient or completely ignored depending on screen reader configurations.
**Action:** Always add descriptive `aria-label` attributes to icon-only buttons, especially in custom structural templates.
