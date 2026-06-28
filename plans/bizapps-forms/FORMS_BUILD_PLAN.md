# MJ Forms (`bizapps-forms`) — Build Plan & Business Case

> **Status:** Plan / pre-build. This document lives in the **MJ repo** only as a portable
> seed. The actual product is built in a **separate repo `MemberJunction/bizapps-forms`**.
> A fresh session should pull this file byte-for-byte into that repo (e.g. as
> `plans/FORMS_BUILD_PLAN.md`) and treat it as the durable task state — read the Status
> Snapshot + Progress Log at the start of every session, pick up the first unfinished task
> in dependency order, and update task state here as you work (the Caliber plan convention).

---

## 0. What this is

**MJ Forms** is a free, open-source MemberJunction **Open App** for **forms, surveys, and
intake** that:

- works for **anonymous internet users** (no account, public links / embeds),
- is **gorgeous on mobile** (published as an Angular **custom element** widget, not the
  Explorer shell),
- is **super easy to set up** — by a human in a visual builder, or by an **AI agent** from a
  natural-language description,
- has **great reporting** built on native MJ tooling, and
- makes responses **first-class records in your MemberJunction database** — optionally
  projected into real, query-able, Skip-accessible entities.

The thesis: the **80–90% of form/survey usage is simple** (contact forms, RSVPs,
feedback/NPS, lead capture, applications, registrations, quizzes) and maps almost perfectly
onto things **MJ already does well**. Commercial tools (Typeform, SurveyMonkey, JotForm)
charge hundreds of dollars a month for capabilities that, on top of MJ, are largely **reuse,
not new build**. So we ship the simple 80% beautifully and free, and make the powerful 20%
*possible* by leaning on MJ infrastructure (Actions, Agents, Prompts, RSU) rather than a
bespoke workflow engine.

---

## 1. Business Case

### 1.1 Why build this (and why free)

This is **not** a customer-acquisition land-grab against Typeform. The goal is to **add
value to existing MemberJunction installs** and to give organizations **a concrete reason to
adopt MJ beyond the "AI data platform" story.** Everyone needs forms; few people go looking
for an agent framework. A first-class, beautiful, free forms app is a tangible, universally
understood capability that makes an MJ instance immediately more useful.

It is deliberately **free and open source (ISC, like bizapps-common)**, with a special focus
on the audiences MJ already serves well — **nonprofits and associations** — for whom
per-response metered survey tools (Typeform-style) are a real, recurring budget pain.

### 1.2 The differentiation (the moat incumbents cannot copy)

A standalone survey tool traps responses in a silo. MJ Forms inverts that:

1. **Responses are operational records, not survey exports.** A submission can *become* (or
   link to) a `bizapps-common` **Person / Organization / ContactMethod**, instantly
   actionable in the same system that runs the org's CRM/committees/tasks. No CSV round-trip,
   no Zapier tax.
2. **On-submit automation via MJ Actions & Agents — free.** Send an email, create a Task,
   upsert a Person, route to an agent, run an LLM-judge on a free-text answer. Incumbents
   charge the most for "integrations + logic + AI analysis"; MJ already has all three.
3. **Responses can be promoted to first-class entities (RSU).** A recurring instrument
   (e.g. "Annual Meeting Survey") can be projected into a real, evolving table that the whole
   MJ toolchain — viewing system, query builder, dashboards, **Skip** — treats natively. No
   form tool on the market does this.
4. **Optional conversational/voice upgrade via Caliber.** When text + uploads aren't enough,
   a question can hand off to a voice agent that transcribes, records, and rubric-scores —
   see §9.

### 1.3 Competitive landscape (summary — VERIFY PRICING before any customer-facing use)

> The numbers below are from model knowledge (~Jan 2026) and **must be re-verified** with
> live web research before publication. They are directionally correct as of writing.

| Tool | Position | Monetization pain (the gouge) |
|---|---|---|
| **Google / MS Forms** | Free, ubiquitous, bland | Shallow logic, weak reporting, ecosystem-locked. The "good enough & free" floor. |
| **Typeform** | Gorgeous, conversational one-question-at-a-time | Brutal **per-response caps**; free tier ~10 responses/mo; paid tiers meter on volume. |
| **SurveyMonkey** | Incumbent, deep survey features | **Per-seat pricing + upsell dark patterns.** |
| **JotForm** | Feature/widget-rich | Submission-capped tiers; can feel cluttered. |
| **Tally** | Free **unlimited** forms & responses; Notion-style | Proof that free-core + paid-polish wins; charges (~$29/mo class) for branding removal / advanced logic. |
| **Fillout** | Generous free, strong logic/integrations | — |
| **Formbricks** | OSS experience-mgmt, self-host + cloud | Cleanest OSS+SaaS model to study. |
| **LimeSurvey / SurveyJS / Tripetto** | OSS (powerful/dated · dev-embeddable lib · logic-first) | — |

**Where they gouge:** response/submission caps, branding removal, conditional logic,
integrations, extra seats — all cheap-to-build, priced as willingness-to-pay levers. **All
free or near-free on MJ.**

**Lesson:** beat the meter (Tally model — free, unlimited) and differentiate on *native data
integration*, not on out-feature-ing the long tail.

### 1.4 What we deliberately DON'T build

- No heavy visual **workflow/branching engine** (flow-graphs, calculated-field expression
  languages, complex quotas/panels). Basic conditional show/hide + skip-to-page only (§6).
- No payment processing in v1 (revisit later via an Action).
- No statistical analysis suite (significance testing, weighting). Reporting is solid, not
  SPSS.
- No multi-tenant SaaS billing. This is an installable open app; any hosted offering is a
  separate concern (and may live with Caliber commercially — out of scope here).

---

## 2. Product Principles / UX Quality Bar

1. **Mobile-first or it doesn't ship.** The respondent widget must feel premium on a phone:
   correct mobile keyboards per field type, large tap targets, smooth transitions, a clear
   progress signal, instant load, resilience on flaky networks.
2. **Two render modes:** classic scroll form **and** Typeform-style one-question-at-a-time
   (a per-form setting). Both from the same definition.
3. **Anonymous by default for public links;** identified when the respondent is known
   (prefill via signed token, or authenticated Explorer user).
4. **Setup in under 2 minutes** for the 80% case — template or AI-generated, then tweak.
5. **Every color a design token** (`--mj-*`); themeable via FormStyle (§5). No hardcoded
   colors (MJ CI gate).
6. **Accessibility:** WCAG AA, full keyboard nav, screen-reader labels, visible focus.

---

## 3. Architecture Overview

### 3.1 Repo skeleton (mirror of `bizapps-common`, verified against that repo)

```
bizapps-forms/
  mj-app.json            # OpenApp manifest (see §12)
  mj.config.cjs          # schema + entity prefix + CodeGen output paths
  package.json           # npm workspace (apps/* + packages/*), turbo
  turbo.json
  migrations/            # VYYYYMMDDHHMM__v*__*.sql  (skyway engine)
  metadata/              # mj-sync seed data (categories, styles, roles, perms)
  packages/
    Entities/            # @mj-biz-apps/forms-entities  (CodeGen entity subclasses)
    Actions/             # @mj-biz-apps/forms-actions    (CodeGen + hand-written actions)
    Server/              # @mj-biz-apps/forms-server     (bootstrap + resolvers + public submit endpoint)
    Angular/             # @mj-biz-apps/forms-ng         (Explorer builder/admin forms + widget)
  apps/
    MJAPI/               # GraphQL API server (port 4121)
    MJExplorer/          # Builder/admin UI (port 4321)
```

Evidence for the template: `bizapps-common/mj-app.json`, `bizapps-common/mj.config.cjs`
(`entityPackageName`, `output[]` for SQL/Angular/GraphQLServer/ActionSubclasses/EntitySubclasses),
`bizapps-common/package.json` (`mj:migrate --schema … --dir ./migrations`, `mj:codegen`,
turbo filters), and `bizapps-common/migrations/B…__Schema_and_Tables.sql`
(`IF NOT EXISTS … CREATE SCHEMA`, then plain `CREATE TABLE` with no `__mj_*` timestamp cols
and no FK indexes — CodeGen adds those).

### 3.2 The two surfaces

- **Respondent widget** — `@mj-biz-apps/forms-ng` builds an **Angular custom element**
  (`<mj-form id="…">`), published to a CDN. Tiny, no Explorer shell, embeddable via a
  `<script>` tag, iframe, popup/slider, full-page, or QR. This is the public-facing ticket.
- **Builder/Admin app** — runs in **MJExplorer**: visual form builder, response management,
  reporting dashboards. Internal staff only; full reuse of MJ dashboard/grid/query infra.

### 3.3 Reuse map — what MJ already gives us (the heart of this plan)

| Need | MJ capability to reuse | Evidence (MJ repo) |
|---|---|---|
| Anonymous internet users | **Anonymous magic-link sessions** — `IdentityMode='anonymous'`, shared Anonymous principal, scope enforced server-side from JWT `mj_scopes` claims (never DB roles → no privilege accretion) | `packages/MJServer/src/auth/magicLink/MagicLinkService.ts`, `types.ts` (`MagicLinkScopeEntry`, `MagicLinkJWTClaims.mj_scopes/mj_anon`), `magicLinkCore.ts` |
| Scoped programmatic access | **API-key scopes** (user ∩ app-ceiling ∩ key) | `packages/MJServer/src/auth/APIKeyScopeAuth.ts` |
| Known-respondent identity | **bizapps-common** Person/Organization/ContactMethod | `bizapps-common/migrations/B…__Schema_and_Tables.sql` |
| AI authoring of forms | Patterns from the **Form Builder agent** + deterministic `Create/Modify Interactive Form` actions | `packages/MJCoreEntities/src/engines/interactive-forms.ts` |
| Promote responses → first-class entity | **Runtime Schema Update (RSU)** pipeline: `SchemaEngine.generateDDL()` → migration → CodeGen → restart; `SchemaEvolution` adds columns over time | `packages/SchemaEngine/src/RuntimeSchemaManager.ts`, `SchemaEvolution.ts`, `MJServer/src/resolvers/RSUResolver.ts` |
| On-submit automation | **Actions / Agents / AI Prompts** | core framework |
| Reporting | RunView/RunViews, RunQuery, BaseDashboard + AG Grid | core framework |
| Conversational/voice upgrade | **bizapps-caliber** + MJ 5.44 realtime, bound via polymorphic subject + `IntakeSubmission` | Caliber `plans/CALIBER_BUILD_PLAN.md` §2.1, §5 |

> **NOTE — do NOT reuse MJ Interactive Forms as the survey schema.** Interactive Forms
> (`Type='Form'` Components + `Entity Form Overrides`) are **entity-bound** — they override
> the edit experience of an existing DB record. A survey is a free-standing instrument whose
> shape *is* the data. We build greenfield entities (§5) and only borrow the *patterns*
> (AI-authoring path, runtime resolver shape) from that subsystem.

---

## 4. Anonymous Access Design (the crux)

A public survey must accept submissions from people who have **no account and were never
individually invited**. The scary part — anonymous identity with server-side scope that
cannot be escalated — is **already solved by MJ**. The remaining gap is small and well-defined.

**Mechanism (existing):** MJ magic links support `IdentityMode='anonymous'`. An anonymous
redemption resolves to one **shared Anonymous principal** (seeded UUID
`273910DF-28F1-45C1-A8F8-6E9AD8E5F008`) that holds **no DB roles**; authorization is enforced
against the per-session JWT's `mj_scopes` union (Application + optional `resourceType/resourceId`).
Two anonymous visitors share the identity but hold **different scopes** — no accretion.
Invites carry **`maxUses`**, so a long-lived, high-`maxUses`, anonymous link scoped to one
form = effectively a **public form URL**.

**What we must add (small):**

1. **A `CanCreate` respondent scenario (metadata).** A restricted **"Form Respondent"**
   role with **CanCreate on `FormResponse` / `FormResponseAnswer` only** (and read on the
   published form definition it's scoped to) — nothing else. This is the one deliberate
   exception to the magic-link "read-only" convention. Authored as mj-sync metadata
   (roles + entity-permissions), exactly like the Magic Link recipe in
   `MJ/guides/MAGIC_LINK_GUIDE.md` §4.
2. **A public-write hardening layer (new server code).** Rate limiting, bot/abuse defense
   (**Cloudflare Turnstile** / honeypot, per-form toggle), response-quota enforcement,
   duplicate handling, IP-hash + UA capture. This is the main net-new server work.
3. **A `FormDistribution` object (entity, §5).** "Publish public URL" is a first-class
   record wrapping an anonymous, multi-use, scoped link — with its own quota, expiry,
   open/close window, and per-link analytics.

**Submission path:** anonymous multi-use magic link scoped to a `FormDistribution`
→ widget loads published `FormVersion` (read) → respondent answers → public submit endpoint
(Turnstile + rate-limit + quota check) → Save `FormResponse` + `FormResponseAnswer` rows
→ fire on-submit Actions/Agents.

**Open follow-up:** confirm the **minimum MJ version** that includes (a) anonymous
magic-link `mj_scopes` enforcement and (b) RSU — pin `mjVersionRange` accordingly (default
assumption: `>=5.44.0`).

---

## 5. Data Model

Schema **`__mj_BizAppsForms`**, entity prefix **`Forms:`** (decision DG-2 — note the
`Forms: Forms` stutter on the root table; alternative is to name the root table
`FormDefinition` → `Forms: Definitions`). No `__mj_*` timestamp cols, no FK indexes
(CodeGen adds them). `sp_addextendedproperty` on every business column.

### 5.1 Phase 1 entities (MVP)

- **FormCategory** — `Name, Description, ParentID (self-FK, hierarchy), IconClass,
  DisplayRank, IsActive`. Organizes forms in a tree.
- **FormStyle** — master list of reusable themes/CSS sets for departments/brands.
  `Name, Description, CSSVariables (JSON of --mj-* token overrides), CustomCSS (NVARCHAR MAX),
  LogoURL, IsActive, DisplayRank`. A Form links to one for styling.
- **Form** — `Name, Description, CategoryID (FK), StyleID (FK, nullable), Status
  (Draft|Published|Closed), OwnerUserID, RenderMode (Scroll|OneQuestion), Settings (JSON:
  anon-allowed, captcha-on, quota, open/close dates, confirmation message/redirect),
  FormGroupID (nullable, Phase 2 — see §5.2)`.
- **FormVersion** — immutable published snapshots. `FormID, VersionNumber, Status
  (Draft|Published|Retired), PublishedAt, DefinitionSnapshot (JSON — the full
  pages/questions/options/logic as-published)`. Responses pin a `FormVersionID` so a form can
  evolve without corrupting historical data (Caliber's immutable-`ResolvedConfig` pattern).
- **FormPage** — `FormID, Title, Description, DisplayOrder, ConditionalRule (JSON,
  show-if logic — §6)`.
- **FormQuestion** — `FormID, PageID, QuestionType (value-list — §5.3), Prompt, HelpText,
  IsRequired, DisplayOrder, ValidationRule (JSON), ConditionalRule (JSON),
  ScoringConfig (JSON, nullable — e.g. "LLM-judge with prompt X" or numeric weights),
  Settings (JSON, per-type)`.
- **FormQuestionOption** — `QuestionID, Label, Value, DisplayOrder, IsDefault`.
- **FormResponse** — `FormID, FormVersionID, Status (Partial|Complete), AnonymousSessionID
  (mj_sid), SubjectEntityName (nullable), SubjectID (nullable — polymorphic link to
  Person/anything, Caliber pattern), SubmittedAt, StartedAt, SourceMetadata (JSON: ip-hash,
  ua, distribution id, referrer)`.
- **FormResponseAnswer** — `ResponseID, QuestionID, TextValue, NumericValue, DateValue,
  BooleanValue, JSONValue (for multi/complex), FileID (→ MJ: Files), Score (nullable),
  ScoreRationale (nullable — LLM-judge output)`. The query-able EAV-ish store; typed columns
  + JSON fallback.
- **FormDistribution** — `FormID, Name, Slug, ChannelType (PublicLink|Embed|QR|Email),
  Status, OpenAt, CloseAt, MaxResponses, ResponseCount, MagicLinkInviteID (the anonymous
  multi-use scoped link), CaptchaRequired, IsActive`. One Form can have many distributions.

### 5.2 Phase 2 entities / extensions

- **FormGroup** — `Name, Description, MaterializedEntityID (nullable — the RSU bridge)`.
  `Form.FormGroupID` is a nullable FK. When a Form belongs to a FormGroup that has a
  `MaterializedEntityID`, responses for the whole group are projected into that single
  first-class entity (e.g. all yearly "Annual Meeting Survey" forms → one
  `AnnualMeetingSurvey` table, column-evolved across years via SchemaEvolution).
- **Materialization / RSU** (§8.2), advanced conditional logic & scoring beyond §6 basics,
  payment question type, partial-response resume, advanced quotas.

### 5.3 Question type taxonomy (value-list on FormQuestion.QuestionType)

**Table-stakes (Phase 1):** ShortText, LongText, Email, Phone, Number, SingleChoice
(radio), MultiChoice (checkbox), Dropdown, Rating (stars/scale), NPS, YesNo, Date, Time,
FileUpload, Statement (display-only/section header).
**Advanced (Phase 2):** Matrix/Grid, Ranking, Address (→ bizapps-common), Signature,
Payment, Calculated, Conversational (→ Caliber hand-off, §9).

### 5.4 Dual persistence (the design you locked)

- **Generic normalized tables are ALWAYS the source of truth** (`FormResponse` +
  `FormResponseAnswer` + the `FormVersion` snapshot). Every submission lands here, fast, no
  restart.
- **Reporting projection (two tiers, Phase 2):**
  1. **View-projection (default, lightweight):** a generated denormalized SQL **view** per
     form/group, registered as an MJ entity → Skip / query-builder / dashboards work, **no
     MJAPI restart**, live. Column set fixed at generation.
  2. **RSU-materialized table (heavyweight, opt-in):** for the "first-class evolving table
     users will extend themselves" case — full table via the RSU pipeline
     (`RuntimeSchemaManager`), columns evolved over time via `SchemaEvolution`.
- **CRITICAL operational constraint:** RSU **commits a migration, runs CodeGen, and restarts
  MJAPI** (gated by `ALLOW_RUNTIME_SCHEMA_UPDATE=1`, serialized by a mutex, blocks `__mj`).
  Therefore materialization is an **explicit, admin-triggered, batched "Publish to Entity"
  action — NEVER a per-submission hot path.** Default to view-projection; let users "promote"
  to a materialized table deliberately.

---

## 6. Conditional Logic (Phase 1 basics only)

Stored as **declarative JSON `ConditionalRule`** on FormPage and FormQuestion. Phase 1
supports show/hide and skip-to-page based on prior answers:

```jsonc
{ "show": { "all": [ { "questionId": "<q>", "op": "equals", "value": "Other" } ] } }
```

Operators: `equals, notEquals, in, notIn, isAnswered, greaterThan, lessThan, contains`.
Combinators: `all` / `any`. Evaluated client-side in the widget and re-validated server-side
on submit. **Out of scope for P1:** calculated fields, expression language, quotas, visual
flow-graph. Anything heavier is a Phase-2 candidate or an MJ Action.

---

## 7. AI Authoring ("super easy setup")

An **MJ AI Agent / Action** authors form metadata from a natural-language brief
("a 5-question event RSVP with dietary restrictions and a +1 count"). It writes the
`Form / FormPage / FormQuestion / FormQuestionOption` rows via entity `Save()` (or mj-sync),
reusing the deterministic-builder pattern proven by the **Form Builder agent**
(`packages/MJCoreEntities/src/engines/interactive-forms.ts`). Round-trip: agent drafts →
human tweaks in the builder → publish. This is the headline "easy setup" story; pair it with
a starter template gallery for the no-AI path.

---

## 8. Reporting

### 8.1 Core (Phase 1)
A BaseDashboard in the Explorer admin app: summary stats, per-question breakdowns (charts via
AG Grid / chart components), filtering/cross-tab, completion & drop-off funnel, individual
response view, CSV/Excel export. Built on RunView/RunViews + RunQuery — no new infra.

### 8.2 First-class projection (Phase 2)
View-projection (default) and RSU-materialization (opt-in) per §5.4, unlocking the full MJ
toolchain — viewing system, query builder, dashboards, and **Skip** — over survey data as
native entities. This is the reporting differentiator no incumbent has.

---

## 9. Caliber Integration Seam (Forms ← consumed by Caliber)

MJ Forms is the **text/structured/upload** input layer; **Caliber** is the
**conversational/voice** layer with rubric scoring. They **compose** (siblings), they are not
parent/child. The seam is **data-level, in-process, zero schema coupling**:

- A `FormResponse` is a **subject**: Caliber binds an `Engagement`/`AssessmentSession` via
  `SubjectEntityName='Forms: Responses' + SubjectID`.
- Form answers flow into Caliber as an **`IntakeSubmission`** (`MappedData` JSON), read by a
  `ContextProvider` to brief the voice agent.
- A `Conversational` question type (§5.3, P2) hands a respondent off to a Caliber voice agent
  via an **anonymous magic link** scoped to that agent; the transcript/recording/score
  return and attach to the originating `FormResponse`.
- Caliber's `Criterion.AppliesTo=Both` already allows one rubric to score **written +
  spoken** answers together.

> A companion PR is being opened in the **Caliber repo** proposing that MJ Forms become
> Caliber's **native intake mechanism** (text + uploads) rather than the current
> external-form (TypeForm) bolt-on — and that Caliber's intake design (Protocol
> `IntakeMode`, the `ExternalFormType` lookup) be updated to treat MJ Forms as a
> first-class, in-process intake source. It points at this plan.

---

## 10. Phases & Tasks

### Phase 0 — Repo bootstrap
- [ ] Create `bizapps-forms` repo from the bizapps-common skeleton (mj-app.json, mj.config.cjs,
      package.json workspace, turbo.json, packages/{Entities,Actions,Server,Angular},
      apps/{MJAPI,MJExplorer}).
- [ ] Set schema `__mj_BizAppsForms`, scope `@mj-biz-apps/forms-*`, prefix `Forms:`,
      ports 4121/4321, `mjVersionRange` (verify min — §4).
- [ ] Pull this plan into `plans/FORMS_BUILD_PLAN.md`.

### Phase 1 — MVP (the differentiating slice)
- [ ] Migration: schema + Phase-1 tables (§5.1). Run migrate + CodeGen.
- [ ] `Forms: …` entity subclasses generated; verify types.
- [ ] mj-sync seed: FormCategory starter tree, FormStyle defaults, **Form Respondent role +
      entity permissions** (CanCreate on responses only), Application + nav metadata.
- [ ] **Public submit endpoint** (forms-server): anonymous magic-link scope check +
      Turnstile + rate-limit + quota → Save response/answers → fire on-submit Actions.
- [ ] **Respondent widget** (forms-ng → Angular element): both render modes, mobile-first,
      themed via FormStyle, basic conditional logic (§6), file upload to MJ: Files, a11y.
- [ ] **Builder/admin app** (MJExplorer): visual form builder (pages/questions/options/logic),
      publish→FormVersion, FormDistribution management (public link/embed/QR).
- [ ] **AI authoring** action/agent (§7) + starter template gallery.
- [ ] **Reporting dashboard** (§8.1): summaries, breakdowns, funnel, response view, export.
- [ ] On-submit hooks: create/link bizapps-common Person; email confirmation; create Task.
- [ ] Tests (Vitest) for engine/server logic; CI gates (UI tokens, mj-btn).

### Phase 2 — Power
- [ ] FormGroup + MaterializedEntityID; **view-projection** (default) and **RSU
      materialization** (opt-in, admin-triggered, batched) — §5.4 / §8.2.
- [ ] Advanced question types (Matrix, Ranking, Address→bizapps-common, Signature, Payment).
- [ ] LLM-judge scoring pipeline on free-text answers (ScoringConfig).
- [ ] Caliber `Conversational` question type hand-off (§9).
- [ ] Partial-response resume, advanced quotas, richer conditional logic.

---

## 11. Decision Gates / Open Questions

- **DG-1 — Min MJ version.** Confirm earliest version with anonymous magic-link `mj_scopes`
  enforcement **and** RSU; pin `mjVersionRange`. (Default `>=5.44.0 <6.0.0`.)
- **DG-2 — Entity prefix/naming.** `Forms:` prefix (accept `Forms: Forms` stutter) vs. rename
  root table `FormDefinition`. (Default: `Forms:` prefix.)
- **DG-3 — Repo/scope name.** Repo `bizapps-forms`; product/display name **MJ Forms**; npm
  scope `@mj-biz-apps/forms-*` (consistent with `@mj-biz-apps/common-*`). (Locked by owner.)
- **DG-4 — Anti-abuse provider.** Cloudflare Turnstile (recommended, free, privacy-friendly)
  vs. hCaptcha vs. honeypot-only default. Per-form toggle either way.
- **DG-5 — Widget hosting/distribution.** CDN host for the Angular element; versioning &
  cache strategy; iframe vs. direct-element embed default.
- **DG-6 — Response store shape.** Confirm typed-columns + JSON-fallback on
  `FormResponseAnswer` (recommended) vs. pure-JSON. Affects query/projection ergonomics.

---

## 12. Repo Bootstrap Specifics (defaults for the build session)

`mj-app.json` (mirroring `bizapps-common/mj-app.json`):

```jsonc
{
  "$schema": "https://schema.memberjunction.org/mj-app/v1.json",
  "manifestVersion": 1,
  "name": "mj-bizapps-forms",
  "displayName": "MJ Forms",
  "description": "Forms, surveys & intake for MemberJunction — anonymous-friendly, mobile-first, responses as first-class records.",
  "version": "0.1.0",
  "license": "ISC",
  "icon": "fa-solid fa-list-check",
  "publisher": { "name": "MemberJunction", "url": "https://memberjunction.com" },
  "repository": "https://github.com/MemberJunction/bizapps-forms",
  "mjVersionRange": ">=5.44.0 <6.0.0",
  "schema": { "name": "__mj_BizAppsForms", "createIfNotExists": true },
  "migrations": { "directory": "migrations", "engine": "skyway" },
  "metadata": { "directory": "metadata" },
  "packages": {
    "server": [{ "name": "@mj-biz-apps/forms-server", "role": "bootstrap", "startupExport": "LoadBizAppsFormsServer" }],
    "client": [{ "name": "@mj-biz-apps/forms-ng", "role": "bootstrap", "startupExport": "LoadBizAppsFormsClient" }],
    "shared": [
      { "name": "@mj-biz-apps/forms-entities", "role": "library" },
      { "name": "@mj-biz-apps/forms-actions", "role": "library" }
    ]
  },
  "code": { "visibility": "public", "sourceDirectory": "packages" },
  "categories": ["Forms", "Surveys", "Productivity"],
  "tags": ["forms", "surveys", "intake", "feedback", "nps"]
}
```

- `mj.config.cjs`: `entityPackageName: '@mj-biz-apps/forms-entities'`, the same `output[]`
  block as bizapps-common (SQL / Angular / GraphQLServer / ActionSubclasses /
  EntitySubclasses / DBSchemaJSON), entity name prefix `Forms:`, post-codegen build commands.
- `package.json`: workspaces `apps/*` + `packages/*`; `mj:migrate --schema __mj_BizAppsForms
  --dir ./migrations`; `mj:codegen`; turbo build/start filters for `mj_api` / `mj_explorer`.
- Ports: MJAPI **4121**, MJExplorer **4321** (common=4101/4301, caliber=4111/4311).
- Branching: `next` (integration) → `main` (release), feature branches track same-named
  remote (bizapps convention).

---

## 13. Progress Log

- *(pre-build)* Plan authored in MJ repo as portable seed. Competitive pricing (§1.3) flagged
  for live re-verification. Next: pull into `bizapps-forms`, execute Phase 0.
