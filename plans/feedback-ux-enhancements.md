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

## Screenshot Strategy Decision

### Current: Base64 embedded in issue body (for AI agents)
The screenshot is embedded as a base64 data URL inside a collapsible `<details>` block in the GitHub issue body. GitHub doesn't render base64 images in the web UI, but AI agents can read the data via the GitHub API and decode/analyze it with vision-capable models.

**Why this works for us:** Our triage workflow relies on AI agents, not humans manually reading every issue. The base64 data is self-contained — no extra infrastructure, no permissions, no broken image links, works across any repo.

| Base64 (current) | File upload (future option) |
|---|---|
| Works today, no extra permissions | Requires Contents:write on GitHub App |
| AI agents can read via API | Humans AND AI can see the image |
| Zero infrastructure | Creates files that accumulate in repo |
| Bloats issue body (~5-15KB per screenshot) | Clean issue body |
| Humans can't see it on GitHub web UI | Standard GitHub image rendering |

### Future option: File upload to repo
Code is already implemented in `FeedbackResolver.ts` — uploads to `.github/feedback-screenshots/` and updates the issue body with the rendered image URL. Currently blocked on GitHub App needing **Contents: Read & Write** permission (returns 403).

If both approaches are enabled, the issue gets: (1) a rendered image for humans, and (2) the base64 fallback for AI agents. The code already attempts the upload and falls back gracefully.

**To unblock file upload:**
1. Someone with org admin access goes to the GitHub App settings
2. Under **Repository permissions**, set **Contents** to **Read and write**
3. Save — the app installation may need to be re-approved by the org
4. No code changes needed — the upload will work once the permission is granted

## Remaining Work (Manager Feedback — Must Do Before Ship)

### 1. Screenshot opt-in (not opt-out)
Currently the screenshot is auto-captured and shown. Change to:
- Still capture the screenshot when dialog opens (have it ready)
- **Don't show it or include it by default**
- Add an "Include screenshot" button the user clicks to opt-in
- When opted in, show the preview AND a notice below it: "This screenshot will be included in the public GitHub issue"
- User can remove it after opting in

### 2. Submission certification checkbox
Before the Submit button, add a **required checkbox**:
> "I certify that I am authorized to submit this on behalf of my organization and that this submission does not contain confidential or sensitive information. This will be posted to a public GitHub repository."

Submit button stays disabled until this checkbox is checked (in addition to existing title/description requirements).

### 3. Org-level kill switch
Add an MJ configuration setting that allows organizations to disable the feedback feature entirely:
- Setting in `mj.config.cjs`: `feedbackSettings.enabled: true|false` (default: true)
- When disabled: feedback button doesn't appear in user menu, GraphQL mutations return graceful error
- This lets orgs that don't want public issue creation turn it off completely

**Why this matters:** End users could easily share screenshots of customer records, internal data, or other sensitive information in what becomes a public GitHub issue. The opt-in screenshot, certification checkbox, and org kill switch are safety nets against accidental data exposure.

### 4. Multi-repo feedback routing — SPECCED, NOT IMPLEMENTED
See `plans/multi-repo-feedback-routing.md` for the full spec. Allows each app to target a different GitHub repo for its feedback issues.
