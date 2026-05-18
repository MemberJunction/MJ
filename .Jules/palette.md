## 2024-05-16 - Comprehensive ARIA label application
**Learning:** When identifying a micro-UX opportunity like adding an ARIA label to a specific icon-only button class in a component (e.g., `at-schedule-dialog-close`), it's critical to perform a full file search to apply the fix to all identical instances within the same file, avoiding an incomplete fix and ensuring consistency.
**Action:** Always `grep` the modified file for other occurrences of the same component/class pattern when making micro-UX fixes, rather than fixing only the first one encountered.
