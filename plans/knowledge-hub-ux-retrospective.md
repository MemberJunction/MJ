# Knowledge Hub — UX Retrospective & Improvement Proposals

**Date:** 2026-06-06
**Author:** Claude (Opus 4.8), at Amith's request
**Scope:** Every Knowledge Hub surface (new Classify redesign + pre-existing Tags / Visualize / Duplicates / Analytics / Vectors / Configuration), reviewed headless against `MJ_5_40_0_PRE` with a fresh (un-onboarded) dataset.
**Status of functionality:** ✅ All 7 top-nav surfaces + 8 Classify sub-tabs load with **0 console errors**, render content, and expose their controls. The two issues flagged in live testing (Visualize icon/layout, Run Pipeline feedback) are fixed and verified.

> **Testing-depth caveat (honest framing):** The clean sweep verifies *load + render + no-error + controls-present* for every surface, plus the specific flagged features (Run Pipeline kickoff, seed-taxonomy transport) were exercised directly. It does **not** verify full end-to-end content-processing outcomes, because the fresh DB has 1 source / 0 content items — there's nothing to classify yet. Deep outcome testing needs a seeded corpus; that's an environment gap, not a code defect. Everything below is a *forward-looking improvement proposal* for your consideration — not a list of bugs blocking the release.

---

## Part 1 — What's working well (keep it)

- **Consistent page-header identity** across surfaces (icon + title + subtitle) reads clean and professional.
- **Empty states exist everywhere** with sensible "do X to populate this" copy — far better than blank panels.
- **Classify Pipeline Monitor** is genuinely strong: KPI cards, recent-processing feed, source rail, trending tags, pipeline settings — a real operational cockpit.
- **Analytics Overview** is rich and well-composed (gauge, donuts, sparklines, date-range toggle, entity filter).
- **The guided "Add Source" wizard** + auto-skip-when-single-content-type is a nice onboarding touch.
- **Reactive engines + Refresh buttons** on every Classify sub-tab — good data-freshness story.

---

## Part 2 — Top improvement opportunities (prioritized)

### 🥇 P1 — Information architecture: Tags vs. Classify overlap is the biggest issue

The **Tags** top-nav surface and several **Classify** sub-tabs cover overlapping ground:

| Concept | Lives in "Tags" surface | Also lives in "Classify" |
|---|---|---|
| Taxonomy tree | Tags ▸ Taxonomy | Classify ▸ Taxonomy |
| Tag health | Tags ▸ Health | Classify ▸ Health |
| Suggestions/Inbox | Tags ▸ Suggestions | Classify ▸ Inbox |
| Tag library/overview | Tags ▸ Overview | Classify ▸ Tag Library |
| Tag cloud | (Tags ▸ Overview right rail) | Visualize ▸ Tag Cloud |

A user reasonably asks *"where do I manage my taxonomy — Tags or Classify?"* and there's no clear answer. This is the kind of redundancy that erodes confidence in an otherwise polished product.

**Proposal:** Pick **one** home for taxonomy/tag management and make the other a deep-link, not a duplicate. My recommendation: **Classify is the operator's workspace** (sources → pipeline → review → taxonomy), and the **Tags** top-nav item either (a) folds into Classify as its taxonomy tab, or (b) becomes a *read-only analytics lens* ("Tag insights") that links into Classify for any editing. Same logic for Tag Cloud — it should live in exactly one place (Visualize), with Tags' right-rail cloud linking there.

```
BEFORE (overlapping)                     AFTER (one home, clear roles)
┌────────────────────────────┐          ┌────────────────────────────┐
│ Classify  Tags  Visualize  │          │ Classify   Visualize        │
│  ├Taxonomy ├Taxonomy  ├Cloud│   ──▶    │  ├Taxonomy   ├Clusters      │
│  ├Health   ├Health         │          │  ├Health     └Tag Cloud◀─┐  │
│  ├Inbox    ├Suggestions    │          │  ├Inbox                  │  │
│  └TagLib   └Overview       │          │  └Tag Library            │  │
└────────────────────────────┘          │  (Tags surface → "Tag    │  │
   3 surfaces, ~5 dupes                  │   Insights" read-only,   │  │
                                         │   deep-links into above)─┘  │
                                         └────────────────────────────┘
```

---

### 🥈 P2 — A unified "first-run" onboarding funnel

On a fresh install, **Classify** greets you with 8 KPI cards all reading `0` and an empty processing feed. It reads as "broken/empty" before it reads as "ready to set up." The pieces to onboard exist (Add Source wizard, seed taxonomy, run pipeline) but they're scattered; nothing *sequences* them.

**Proposal:** When `ContentItemCount === 0`, replace the zeroed cockpit with a **3–4 step setup checklist** that walks the user through the happy path, then collapses to the normal cockpit once data flows.

```
┌─────────────────────────────────────────────────────────────────────┐
│  👋  Let's get your Knowledge Hub classifying                          │
│                                                                       │
│   ●─────────────●─────────────○─────────────○                         │
│   1 Add a       2 Seed your    3 Run the     4 Review                  │
│     source ✓      taxonomy       pipeline      results                 │
│                                                                       │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │ Step 2 of 4 — Seed your taxonomy                               │ │
│   │ Let the model propose a starter set of tags from your content. │ │
│   │                                                                │ │
│   │   [ Generate Starter Taxonomy ]   [ Skip — I'll add my own ]   │ │
│   └───────────────────────────────────────────────────────────────┘ │
│                                                  Dismiss setup guide → │
└─────────────────────────────────────────────────────────────────────┘
```

This turns "0, 0, 0, 0" anxiety into momentum, and it's the natural home for the seed-taxonomy feature we just hardened.

---

### 🥉 P3 — A persistent "Activity / Jobs" indicator

Run Pipeline (Classify), Run Detection (Duplicates), Run Tag Health (Tags), Sync (Vectors), Run Cluster Analysis (Visualize) are all **long-running jobs kicked off from different surfaces** — but once you navigate away, you lose all visibility into them. There's no global sense of "what's running right now."

**Proposal:** A small **Activity chip in the top bar** (next to notifications) that shows running-job count and opens a drawer with live status. Every "Run X" action registers here.

```
 top bar:   … 🔔  💬  [⚙ 2 running ▾]  👤
                          │
            ┌─────────────▼───────────────────────────┐
            │ Activity                          (2)    │
            │ ───────────────────────────────────────  │
            │ ⟳ Classify pipeline · Sidecar            │
            │   ▓▓▓▓▓▓░░░░ 60% · 18 of 30 items        │
            │ ⟳ Vector sync · MJ: Entities             │
            │   ▓▓░░░░░░░░ queued                       │
            │ ✓ Tag health check       2m ago  [view]  │
            └──────────────────────────────────────────┘
```

This is the single highest-leverage *cross-surface* upgrade — it makes the whole Hub feel like one coherent system rather than seven independent tools.

---

### P4 — Chrome consistency: header pattern varies surface-to-surface

The surfaces don't share one layout grammar:

| Surface | Left-nav rail? | Primary action | Notes |
|---|:--:|---|---|
| Classify | ✅ | Run Pipeline (top-right) | cockpit |
| Tags | ✅ | Run Tag Health | rail |
| Configuration | ✅ | — | rail |
| Analytics | ✅ | — (status pill) | rail |
| **Visualize** | ⚠️ partial | mode toggle | "Saved" rail only |
| **Duplicates** | ❌ | Run Detection | flat + slider band |
| **Vectors** | ❌ | (icon toggles) | KPI cards, no rail |

**Proposal:** Bring Duplicates and Vectors into the same `<mj-page-header-interior>` + optional left-nav grammar the others use (per the Explorer chrome conventions). Even where they don't need a rail, the header/action/toolbar slotting should match so the Hub feels uniform.

---

### P5 — KPI de-duplication on the Classify Pipeline Monitor

The two KPI rows repeat metrics:

```
Row 1:  [Active Sources] [Content Items] [Tags Generated] [Errors]
Row 2:  [Content Items]  [Total Tags]    [Avg Tags/Item]  [Distinct Tags]
              ▲▲▲▲              ▲▲▲▲
        "Content Items" twice;  "Tags Generated" ≈ "Total Tags"
```

**Proposal:** Collapse to one row of distinct KPIs: `Active Sources · Content Items · Distinct Tags · Avg Tags/Item · Errors`. Move "this run vs. all-time" into a small toggle rather than two near-identical cards.

---

### P6 — Native form controls break the design system

- **Duplicates** uses native `<select>` (entity), native `mm/dd/yyyy` date inputs (From/To), and native number inputs (Min/Max score).
- **Visualize** and **Vectors** use native `<select>` for the entity picker.

Per the MJ Angular conventions these should be `mj-dropdown` / `mj-datepicker` / `mj-numeric-input` so they pick up design tokens, dark-mode, and consistent styling. Today they look visibly "rawer" than the rest of the Hub.

---

### P7 — Smaller polish items

- **Vectors ▸ Vector DB Health: "Pinecone — Degraded"** shows a degraded badge with no "why" or "fix" affordance. Add a tooltip/link to the diagnostic. Also surface the *intentional* story that embeddings are `gte-small (Local)` while the index is Pinecone — right now it looks like a misconfiguration.
- **Visualize** rail header says "Saved Clusters" but the empty text says "No saved **visualizations** yet" — unify the noun (the surface is "Visualize," holding both Clusters and Tag Cloud, so "Saved visualizations" is the better umbrella).
- **Duplicate naming collision:** "Duplicates" top-nav (entity-record dupes) vs. "Content Duplicates" on Classify ▸ Sources (content-item dupes) vs. "Duplicates" tab in Classify ▸ Taxonomy (tag dupes). Three different things, one word. Label them by object: *Record Duplicates*, *Content Duplicates*, *Tag Duplicates*.
- **Skip-chat FAB** clips slightly at the bottom-right corner on several surfaces (cosmetic z-index/padding).

---

## Part 3 — Suggested sequencing

| Wave | Items | Rationale |
|---|---|---|
| **Quick wins** (low risk, high polish) | P5 (KPI dedup), P6 (native controls), P7 (polish) | Visible quality lift, contained blast radius |
| **Coherence** | P3 (Activity drawer), P4 (chrome consistency) | Makes the Hub feel like one product |
| **Strategic** | P1 (Tags/Classify IA), P2 (onboarding funnel) | Bigger design decisions — worth your product call first |

P1 and P2 are **design decisions for you**, not mechanical fixes — I'd want your direction before building either. Everything in "Quick wins" I can take on immediately if you want.
