## 2024-05-20 - Icon-only dialog controls missing accessible names
**Learning:** Icon-only buttons used for navigation and dialog controls (like close and back buttons) in Angular components often lack descriptive ARIA labels, making them inaccessible to screen readers.
**Action:** Always include `aria-label` or `[attr.aria-label]` on `<button>` elements that only contain an `<i>` tag with FontAwesome classes to ensure accessibility compliance.
