# Multi-Repo Feedback Routing

**Status:** Spec / Not yet implemented
**Author:** Matt Chriest
**Date:** April 13, 2026
**Branch:** `bug-reporting`

## Problem

The in-app feedback system (bug reports, feature requests) currently sends all submissions to a single GitHub repo (`MemberJunction/MJ`). We have multiple products — MJ Explorer, Izzy, Skip, MJC, Cimatri, and Sidecar — each with their own GitHub repos. Teams need feedback routed to their own repo so they can triage independently.

## What's Already Built

The feedback system is fully functional today on the `bug-reporting` branch:

- **Frontend:** `mj-dialog`-based feedback form in the shell header, configured per-app via `FeedbackModule.forRoot()`
- **Backend:** `FeedbackResolver` GraphQL mutation that creates formatted GitHub issues with labels, severity, environment info, and browser details
- **Auth:** GitHub App authentication (App ID `3366722`, one `.pem` file) — installed at the org level, can access any repo in the org
- **Tested:** End-to-end verified with Playwright — submissions successfully create issues on GitHub

## Proposed Change

Add an optional `repoTarget` field so each app can specify which GitHub repo receives its feedback.

### Per-App Configuration (Angular)

```typescript
// MJ Explorer
FeedbackModule.forRoot({
  appName: 'MemberJunction Explorer',
  repoTarget: 'MemberJunction/MJ',
  // ...
})

// Izzy
FeedbackModule.forRoot({
  appName: 'Izzy',
  repoTarget: 'MemberJunction/izzy',
  // ...
})
```

### Non-Angular Apps (Cimatri, Sidecar)

Call the GraphQL mutation directly with `RepoTarget` in the input:

```graphql
mutation {
  SubmitFeedback(input: {
    Title: "Button alignment issue",
    Description: "The CTA button on the pricing page...",
    Category: "bug",
    AppName: "Cimatri Website",
    RepoTarget: "MemberJunction/cimatri-website"
  }) {
    Success
    IssueNumber
    IssueUrl
  }
}
```

### Server-Side Security

An **allowlist** in `mj.config.cjs` prevents users from targeting arbitrary repos:

```javascript
feedbackSettings: {
  allowedRepos: [
    'MemberJunction/MJ',
    'MemberJunction/izzy',
    'MemberJunction/sidecar-website',
    'MemberJunction/cimatri-website',
  ]
}
```

If a submission targets a repo not on the list, it silently falls back to the default repo (`MemberJunction/MJ`).

## Files to Modify

| File | Change |
|------|--------|
| `packages/Angular/Generic/feedback/src/lib/feedback.config.ts` | Add `repoTarget?: string` to config interface |
| `packages/Angular/Generic/feedback/src/lib/feedback.types.ts` | Add `repoTarget` to submission type |
| `packages/Angular/Generic/feedback/src/lib/services/feedback.service.ts` | Include `repoTarget` in GraphQL mutation input |
| `packages/MJServer/src/resolvers/FeedbackResolver.ts` | Add `RepoTarget` field, parse/validate against allowlist, route to correct repo |
| `packages/MJExplorer/src/app/app.module.ts` | Add `repoTarget: 'MemberJunction/MJ'` to existing config |

## What Doesn't Change

- **GitHub App credentials** — one app, one `.pem` file, one installation ID. Works across all repos in the org.
- **Issue formatting** — same markdown template with description, steps to reproduce, severity, browser info, etc.
- **UI** — same dialog, same button placement, same form fields
- **Auth flow** — Octokit instance is cached and reused; `createAppAuth` handles token refresh

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| No `repoTarget` specified | Uses default repo from config (`MemberJunction/MJ`) |
| `repoTarget` not on allowlist | Falls back to default, logs a warning |
| GitHub App not installed on target repo | Returns `Success: false` with error message |
| Repos in different GitHub orgs | Not supported — would need separate GitHub App installations (future enhancement) |

## Effort Estimate

Small change — ~5 files, mostly adding a field that flows through the existing pipeline. The routing logic is a string split + allowlist lookup. No new packages, no migrations, no UI changes.

## Prerequisites

- `bug-reporting` branch merged to `next`
- GitHub App `.pem` file deployed to server
- `GITHUB_APP_ID`, `GITHUB_APP_INSTALLATION_ID`, and `GITHUB_APP_PRIVATE_KEY_PATH` env vars set on server
- Target repos must have the GitHub App installed (org-level installation covers all repos)
