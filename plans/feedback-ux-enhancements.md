# Feedback Dialog UX Enhancements

**Status:** 3 of 4 implemented
**Author:** Matt Chriest
**Date:** April 13, 2026
**Branch:** `bug-reporting`
**Source:** Manager feedback on PR #2380

## Enhancements

### 1. Move feedback button to user menu — DONE
Moved from standalone icon in top nav bar to user avatar dropdown menu. Added as a `primary` group item (order 25, between "Pin to Home" and developer tools). Shell handles the `'submit-feedback'` message to open the dialog.

**Files changed:**
- `packages/Angular/Explorer/explorer-core/src/lib/user-menu/base-user-menu.ts` — added menu item + handler
- `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts` — added message handler
- `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.html` — removed top nav button

### 2. Privacy / confidentiality warning — DONE
Added a warning banner below the dialog subtitle with an info icon:

> "Feedback is submitted as a public GitHub issue. Please do not include confidential or sensitive information."

Styled with `--mj-status-warning-*` design tokens (amber background, visible but not obnoxious).

**Files changed:**
- `packages/Angular/Generic/feedback/src/lib/components/feedback-form.component.ts` — added template + CSS

### 3. Screenshot capture — DONE
Auto-captures a screenshot of the current view when the feedback dialog opens (before the dialog overlays the content). Uses the same `CaptureActiveThumbnail()` method as Pin to Home (`html-to-image` library).

- Screenshot preview displayed in the form with a remove button
- Base64 image embedded directly in the GitHub issue body as `![Screenshot](data:image/jpeg;base64,...)`
- Screenshot is passed via `contextData.screenshot` and extracted in `formatScreenshotSection()`

**Files changed:**
- `packages/Angular/Explorer/explorer-core/src/lib/shell/shell.component.ts` — capture before opening dialog
- `packages/Angular/Generic/feedback/src/lib/components/feedback-form.component.ts` — preview UI + remove button
- `packages/MJServer/src/resolvers/FeedbackResolver.ts` — embed in issue body

### 4. LLM auto-categorization — NOT YET IMPLEMENTED
Use an LLM to automatically categorize feedback based on title and description content.

**Possible approaches:**
- Client-side: Call an AI endpoint after the user finishes typing the description (with debounce)
- Server-side: Run categorization in the FeedbackResolver before creating the issue, and apply the appropriate labels
- Could also auto-suggest severity, affected area, and additional labels based on content

**Considerations:**
- Should be a suggestion, not forced — user can override
- Latency: should not block submission
- Could use MJ's existing AI Prompt system for the categorization prompt
- Server-side is simpler (no additional client-side AI dependencies)
