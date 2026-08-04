# MJ Explorer · Layout Template Assignments (historical)

> **Status:** Superseded as of 2026-05-15. This doc described the pre-shared-chrome IA work (Phase 2.3 planning, 2026-05-07).
>
> **What replaced it:** [`plans/explorer-chrome-conventions.md`](explorer-chrome-conventions.md) is the canonical rules doc. [`plans/explorer-ia-progress.md`](explorer-ia-progress.md) tracks per-page migration status. [`plans/explorer-sitemap.md`](explorer-sitemap.md) is the app inventory.

## Why this doc was retired

The "Template A (has sidebar) vs Template B (no sidebar)" framing made sense before `<mj-page-layout>` / `<mj-page-header>` / `<mj-page-body>` existed. Pages were classified by their bespoke header CSS structure; the planned consolidation was a CSS-class rename (`.dashboard-header` / `.header` / `.studio-toolbar` → canonical `.mj-dashboard-header`).

In practice, we skipped the CSS-class step and went straight to the Angular component (`<mj-page-header>`). The chrome rules now live in `chrome-conventions.md`, not in this template-classification framing. Pages are now categorized as **migrated** vs **documented exceptions**, not Template A vs Template B.

## Historical content

If you need the original analysis (per-app template assignments, the original "What's actually inconsistent today" punch list, the canonical examples Scheduling-for-A and MCP-for-B), check git history: `git log --follow plans/explorer-layout-templates.md` and read the commit that added it. The original framing has not been useful for the chrome migration since ~February 2026, when shared components started replacing the planned CSS classes.

## Where to look instead

- **The chrome rules** (slots, ordering, exceptions, gotchas): [chrome-conventions.md](explorer-chrome-conventions.md)
- **What's been migrated**: [ia-progress.md](explorer-ia-progress.md)
- **App + nav-item inventory**: [explorer-sitemap.md](explorer-sitemap.md)
- **The single-page exceptions** (Home / Component Studio / Data Explorer / Query Browser / AI Overview / AI Analytics body) and the shell-with-left-nav exceptions (explorer-settings, APIKeys): [chrome-conventions.md Section 9](explorer-chrome-conventions.md#9-documented-exceptions)
