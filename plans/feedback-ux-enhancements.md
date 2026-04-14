# Feedback Dialog UX Enhancements

**Status:** All 4 implemented
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

### 4. LLM auto-categorization — DONE
Added `ClassifyFeedback` GraphQL mutation that uses available LLM (prefers Groq for speed, falls back to OpenAI or any configured model). Classification happens after user types title + description (1 second debounce). Category, severity, and environment dropdowns are hidden — LLM fills them automatically. Bug/feature-specific fields appear once classification completes.

**Files changed:**
- `packages/MJServer/src/resolvers/FeedbackResolver.ts` — new ClassifyFeedback mutation
- `packages/Angular/Generic/feedback/src/lib/services/feedback.service.ts` — client-side Classify() method
- `packages/Angular/Generic/feedback/src/lib/components/feedback-form.component.ts` — debounced classification, hidden dropdowns, status indicator

## Remaining Work

### Screenshot upload to GitHub — CODE DONE, PERMISSION NEEDED
The upload code is implemented in `FeedbackResolver.ts` — after creating an issue, it uploads the screenshot to `.github/feedback-screenshots/{issueNumber}-{timestamp}.jpg` using `octokit.repos.createOrUpdateFileContents`, then updates the issue body with the raw GitHub URL.

**Blocker:** The GitHub App (App ID `3366722`) only has **Issues: Read & Write** permission. The upload requires **Contents: Read & Write** permission. Currently returns `403: Resource not accessible by integration`.

**To unblock:**
1. Someone with org admin access goes to the GitHub App settings
2. Under **Repository permissions**, set **Contents** to **Read and write**
3. Save — the app installation may need to be re-approved by the org
4. No code changes needed — the upload will work once the permission is granted

### Multi-repo feedback routing — SPECCED, NOT IMPLEMENTED
See `plans/multi-repo-feedback-routing.md` for the full spec. Allows each app to target a different GitHub repo for its feedback issues.
