# MemberJunction LTS Release Process

> **Status: PROPOSAL** — v1.1, 2026-07-25. Owner: Craig Adam (certification owner).
> v1.1 incorporates the PR #3241 exec thread (metadata-vs-DDL migration policy, the reserved minor band, hackathon-date flexibility) and the 2026-07-24 **MJ Platform Versioning & Open App Alignment** memo (§3.2, Appendix C).
> Under team review: comments requested from Robert Kihm, John, and Johanna Snider; scan requested from the wider group tagged on the PR. On merge, this document becomes canon.
> Decisions explicitly open: **starting cadence** (§9.1) and **reserved-band size** (§3.1).
> Follow-ups on this branch after blessing: punch-list items 1–3 (§15) and a root-level `VERSIONING.md` distillation for humans and agents.

---

## 1. Purpose & Background

MJ's pace of architectural innovation is a huge asset — and our biggest source of pain. Regressions in new builds hurt customers, and some core functionality was never fully locked down in the first place. Nothing we've shipped has been through a true "production ready" test.

The answer is a formal **LTS (Long Term Support)** process: heavily-tested releases certified as production-ready, produced on a predictable cycle, with the LTS designation **machine-readable and enforced by default** everywhere MJ gets installed or upgraded — the CLI, npm, and MJC. A policy that lives only in a document erodes; this one is enforced by tooling.

Two commitments live under the one label:

1. **A certified stable channel (now):** frequent, heavily-tested builds blessed for production.
2. **Genuine long-term support (later):** as cadence slows toward quarterly, support windows lengthen for *every* certified build — there is no second-class tier. The label converges on its industry meaning by schedule (§9), not by hope.

**Production policy:** SaaS systems (MJC, Izzy, Skip, Caliber, …) never go to production on a non-LTS build. No exceptions. §13 makes this structural rather than aspirational.

## 2. Definitions

| Term | Meaning |
|---|---|
| **Edge channel** | The fast lane — today's flow, unchanged: many minors per week from `next` → `main` → npm. Where all features land first. (Named *Edge* deliberately: the npm dist-tag `next` would collide confusingly with the repo's `next` *branch*, and "current" collides with "the current certified build." See §4.2.) |
| **Candidate** | An already-published Edge build declared as a certification candidate. Not a special artifact — a normal release put under the microscope. |
| **Certification** | The gate process (§6). Completes when the gates genuinely pass — however short or long that takes. The calendar schedules candidate *cuts*; it never forces certification *completion*. |
| **LTS build** | A specific build (e.g. `6.20.1`) that passed certification and carries the label. |
| **Line** | The version territory a certified build lives on: its base minor plus a **reserved minor band** (§3.1) — e.g. line **6.20 LTS** owns `6.20.x – 6.29.x`, maintained on branch `lts/6.20` after the cut. Patches are the norm; minor steps within the band occur only for migration-bearing fixes (§12). |
| **Era** | A major version (5.x, 6.x, …). **Majors are for eras, not cycles** — a major signals a genuine architectural epoch **and pins the infrastructure contract** (§3.2). Never a routine certification. |
| **Cycle** | One candidate-to-certification pass. Cycle #1 is the **LTS bootstrap cycle** (special, freeze-based, §14). Every cycle after it is a **regular cycle** (branch-based, no freeze). |
| **Metadata migration** | A migration file containing only data changes (inserts/updates to metadata & configuration tables) — no DDL, no CodeGen impact. Distinct from a **schema (DDL) migration**, which alters structure and triggers CodeGen. The line-fix rules differ sharply (§12). |
| **Platform manifest** | The per-era pin set for underlying infrastructure (Angular, Node, TypeScript, zone.js, …), published in `release-lines.json` (§3.2, §4.1). |
| **cert-blocker** | An issue that blocks certification: P0/P1 regressions, data loss/corruption, install or upgrade failure, or breakage of a core flow (navigation, search, views, forms, auth). Cosmetic and P3 issues are recorded on the scorecard but do not block. |

## 3. Versioning Strategy

### 3.1 Majors are for eras, not cycles — and lines own a reserved band

- **One era split now:** the bootstrap cycle certifies a 5.x build; 5.x becomes the first maintenance line; new development opens on **6.x** around the Utah hackathon (§14). The major-version pipeline work (new migration baseline, version-guard update, docker tags — §15 item 4) happens once, here. Because Edge leaves 5.x entirely, the 5.x line owns all remaining 5.x version space — no band needed for the bootstrap line.
- **Every later certification freezes a line, not a major:** a certified `6.20.1` defines line **6.20 LTS**. Edge keeps shipping at full speed. Future majors (7.x) happen only for genuine breaking/architectural epochs, on their own schedule.
- **Reserved minor band (adopted from Amith's PR-thread proposal — size open):** at the line cut, Edge doesn't just skip one minor — it jumps past a reserved band (**default 10 minors**, configurable per era). Cutting candidate `6.20.0` reserves `6.20 – 6.29` for the line; Edge's next release is `6.30.0`. Why: it lets a line take **minor** bumps for migration-bearing fixes (per the universal migration-⇒-minor rule, §12) without ever colliding with Edge, and it visibly separates LTS lines from the Edge minors between them. The mechanics: the line-cut script sets Edge's base version to the band ceiling so the next Edge minor lands past it (§15 item 5). Cost: skipped version numbers — which are free. **Open item: confirm band size** (10 is Amith's "or something"; it needs a decided value).
- **Semver promise, stated plainly (from the PR thread):** within an era, upgrades are backward-compatible — LTS 6.20 → LTS 6.55 should be safe. Crossing an era boundary (6.x → 7.x) is the signal to review carefully and expect work. That promise is exactly why the major must not be spent on routine certifications.

### 3.2 The major is the infrastructure contract (2026-07-24 memo, adopted)

Per the **MJ Platform Versioning & Open App Alignment** memo:

- **Each MJ era pins an exact infrastructure set** — Angular, Node, TypeScript, RxJS, zone.js. MJ 5.x pins Angular 21.1.3; MJ 6.x pins whatever its manifest says (initially the same pins, until the era genuinely moves — e.g. Angular 22). The pins live in the **platform manifest**, published per era in `release-lines.json` (§4.1) — one source of truth, not hand-copied lists that rot.
- **Every Open App's major must match the MJ major it runs on.** bizapps-common, -tasks, -accounting, -orders, and everything after them: 5.x apps on MJ 5.x, moving to 6.x in lockstep when MJ does. Minors and patches are each app's own business. Apps do **not** declare infrastructure versions — they declare the `mjVersionRange` they target, and tooling derives the npm `overrides` block from the era's platform manifest.
- **Apps give up the major for their own breaking changes — consciously.** An app-level breaking change is a minor within the era, and consumers express precise requirements through npm-style dependency ranges in `mj-app.json` (`"mj-bizapps-accounting": { "version": ">=5.3.0 <6.0.0" }`). App-level breaking changes should be rare within an era; where unavoidable they can usually wait for the next MJ major.
- **Violations fail fast:** `mj app install` / `mj app link` hard-error on app-major ≠ host-MJ-major (a clear message, not an ERESOLVE or a runtime DI crash); `mj doctor` validates major alignment across the installed app graph, duplicate `@angular/*` in the tree, and drift between the generated overrides block and the platform manifest. (§15 item 10.)
- **Why this belongs in the LTS doc:** the alignment policy is only livable *because* majors are era-scale. Under the abandoned major-per-cycle model, every Open App would have been dragged through a major bump monthly — impossible. Conversely, alignment strengthens the LTS story: "does app X work with LTS 6.20?" is answered by reading the major. One era split (5→6) does obligate every app to bump majors once (Appendix C) — that's the deliberate, occasional cost of the contract.
- The per-app remediation asks from the memo (version-scheme reconciliation, overrides blocks, the stale bizapps-common checkout) are tracked in **Appendix C** — app-repo work, out of scope for this repo but part of this rollout.

### 3.3 Breaking-change signal

Majors keep their traditional meaning, **and** every release entry in `release-lines.json` carries `upgradeImpact: none | config | breaking`. The CLI warns when an upgrade path crosses a `breaking` entry; release notes badge it. App-level compatibility rides `mj-app.json` dependency ranges (§3.2).

## 4. Release Channels & the LTS Label

### 4.1 One source of truth: `release-lines.json`

A repo-root file, Node.js-`schedule.json` style. Everything else — CLI, MJC, `mj app` tooling, docs, the website — derives from it.

```jsonc
{
  "edge": { "newest": "6.34.2" },
  "eras": {
    "5": {
      "platform": { "angular": "21.1.3", "node": ">=18.0.0", "typescript": "5.9.x", "zone.js": "0.16.x" }
    },
    "6": {
      "platform": { "angular": "21.1.3", "node": ">=18.0.0", "typescript": "5.9.x", "zone.js": "0.16.x" },
      "minorBandSize": 10
    }
  },
  "lines": {
    "6.20": {
      "status": "certified",            // candidate | certified | maintenance | eol | withdrawn
      "certifiedBuild": "6.20.1",
      "newest": "6.21.0",               // may step minors within the band (migration-bearing fixes)
      "bandCeiling": "6.29",            // reserved through here; Edge resumed at 6.30.0
      "candidateDate": "2026-09-28",
      "certifiedDate": "2026-10-06",    // support clock starts HERE (slip-tolerant)
      "supportEnds": "2027-02-06",      // extend-only
      "upgradeImpact": "none",
      "scorecard": "certifications/6.20.1.md"
    }
  }
}
```

- **Status transitions happen only via PR**, and the file is CODEOWNERS-gated to the certification owner (§8).
- Publish workflows may append *mechanical* fields (`newest`) via direct push; they never touch `status`/`certifiedBuild`/dates.
- Dates are **extend-only**: windows may lengthen, never shrink.
- The `eras.*.platform` block **is** the platform manifest (§3.2) — `mj app` tooling generates consuming repos' npm `overrides` from it.

### 4.2 npm dist-tags — and the `latest` flip

From the first certification onward, **every "default" surface resolves to certified bits**:

| Tag | Points at | Moved by |
|---|---|---|
| `latest` | Newest build of the newest **certified** line | Certification (atomic 233-package move via `ci/dist-tag-all.mjs`), and line publishes when their line is the newest certified |
| `edge` | Newest Edge release | `publish.yml` (routine publishes gain `--tag edge`) |
| `lts-6.20` | Newest build of that line | `publish-lts.yml` on every line release |

**Why `edge` and not `next`:** the repo's `next` branch is the trunk everyone PRs into, while what actually publishes is built from `main` after the release PR. An npm tag named `next` would imply "builds of the `next` branch" and confuse maintainers and collaborators. `current` was rejected because it collides with "the current certified build" in support language. `edge` is unambiguous, has ecosystem precedent, and reads correctly as "ahead of stable."

Rules:

- **No publish anywhere omits its explicit `--tag`** after the flip (routine = `edge`, line = `lts-x.y`). On npm ≤ 10, a bare publish of an older version silently drags `latest` backward across every package published — with 233 packages that is a catastrophic footgun. npm 11 fixed the default; we still never rely on it. Post-publish `dist-tag ls` assertions on a sample; one-time drill against a scratch scope before cycle #1's flip.
- The flip itself is a **one-time comms event** (Vue and Express both did exactly this, with dedicated posts — see Appendix A.3). Nothing changes until the first certification.
- Edge-case: a brand-new package's first publish under `--tag edge` needs explicit `latest` handling (npm gives a first publish only the tag passed). Pre-publish validation currently blocks first-time packages anyway; §15 item 3 covers it.
- **EOL:** `npm deprecate @memberjunction/*@">=6.20.0 <6.30.0" "…EOL — see upgrade guide"` (the line's full band), scripted across the set, plus `eol` status in `release-lines.json`.

### 4.3 GitHub Releases & Docker

- Routine Edge releases publish with `make_latest: false`; certification sets the certified build as the repo's **latest release**. Existing CLIs' "newest stable" auto-pick then lands on certified bits with zero CLI code changes — enforcement precedes the CLI work.
- Certified releases carry "(LTS)" in the title and link their scorecard.
- Docker: `:latest` follows certified (consistent with the flip); `:edge` for the fast channel; per-line tags (`:6.20`).

## 5. The Two Cycle Shapes

### 5.1 The LTS bootstrap cycle (cycle #1 — only)

The candidate is the tip of `next`; cert fixes merge to `next`; each patch build is a normal release (a cert fix carrying a migration advances the candidate a minor under the standing Edge rule — fine, the line freezes at whatever version certifies). This works because a **merge freeze** is in effect (already running). **The freeze does not recur.** Details and dates in §14.

### 5.2 Regular cycles (cycle #2 onward — `next` never stops)

1. **Candidacy = branch cut + band reservation.** `lts/6.20` is cut from the candidate's tag; the line-cut script reserves the minor band and moves Edge's base version past the ceiling (§3.1); Edge flows at full speed throughout.
2. **Fixes land on `next` first**, then reach the line by label: `backport lts/6.20` on the merged PR → [korthout/backport-action](https://github.com/korthout/backport-action) opens the cherry-pick PR automatically (conflicts become a draft PR a human finishes). The only exceptions to next-first: fixes for code that no longer exists on the dev line, and genuinely line-specific metadata corrections (certification-owner triage).
3. **Line releases** ship from a parameterized `publish-lts.yml`: `changeset publish --tag lts-6.20`, git tag `v6.20.N` (or `v6.21.0` on a band-minor step), GitHub Release (`make_latest` only if newest certified). Line publishes never merge back to `next`.
4. **Line guard** (CI on `lts/*` branches — the migration-⇒-minor rule stays universal; the guard controls *what kind* of change may ride it):
   - No `migrations/` diff → **patch only**.
   - `migrations/` diff scanned for DDL (CREATE/ALTER/DROP/…): **data-only** → requires the `metadata-migration` label, ships as a **minor within the band**; **contains DDL** → requires the `security-exception` label (§12), also a band minor.
   - Any bump that would cross `bandCeiling` fails the build (then the line is out of space — a signal to move users forward, not to widen the band retroactively).

The existing `next → main → publish → merge-back` pipeline is untouched for Edge, in every cycle, forever.

## 6. Certification Gates — the Checklist

> Certification is a **documented checklist, not a vibe**. Every gate produces evidence on the scorecard (`certifications/<version>.md`, committed; the GitHub Release links to it). The calendar never completes a certification — the gates do.

| # | Gate | Kind | Pass bar |
|---|---|---|---|
| 1 | **CI green** on the candidate: unit tests, build, UI token/button checks, dependency check, PG migration translation | Automated | All workflows green, zero waivers |
| 2 | **Deterministic integration tier** (`npm run test:integration`) against the live dev DB on the candidate build | Automated | Zero failures; sibling-parity check green |
| 3 | **Full UX Regression Suite** (AI-driven) against a fresh install of the candidate | AI-automated | Documented pass criteria met. Failure triage: defect → `cert-blocker`; suspected flake → max 2 reruns, must pass clean twice consecutively. Results packet attached to scorecard |
| 4 | **Fresh-install matrix**: `mj install` of the candidate on clean macOS + Windows; More Cheese and other sample environments stood up | Human + scripted | Install completes; smoke passes: login, Explorer loads, CodeGen runs, entity record created, view renders, agent run completes |
| 5 | **Upgrade matrix**: CDP stage, Skip stage, Izzy stage, MJC stage each upgraded to the candidate | Human | Each env owner reports pass/fail + issues within 2 business days of the request |
| 6 | **Human hammering**: structured exploratory sessions on core flows — navigation/breadcrumbs, search, views (create/edit/render/share), forms, dashboards, auth, performance spot-checks | Human | Minimum agreed person-hours logged; all findings triaged (blocker vs. recorded) |
| 7 | **Zero open `cert-blocker`s** | Process | Label query returns empty |
| 8 | **Certification sign-off** | Authority | Craig approves the `release-lines.json` PR — the only way the label applies |

**Mini-certification for line releases:** any post-certification line release — P0 hotfix patch or a `metadata-migration` band minor — re-runs the automated gates (1–3) before the new build inherits the LTS label. No human cert week — but never a silent inherit.

## 7. RACI

R = does the work · A = accountable/sole approver · C = consulted · I = informed.
**UNKNOWN entries are deliberate** — they must be named before the bootstrap candidate cut, and are the top of §17.

| Activity | R | A | C | I |
|---|---|---|---|---|
| Process doc & policy | Craig | Craig | Amith, Robert Kihm | All-team |
| Candidate cut & build mechanics | Build engineer — **UNKNOWN (name needed)** | Craig | Robert Kihm | Core team |
| Gate 1–2 (CI + integration) | CI / whole team | Craig | — | — |
| Gate 3 execution (AI UX suite) | Caeleb | Craig (accepts results *and* approach) | Robert Kihm | — |
| Gate 4 (fresh installs) | BC Labs crew — **names UNKNOWN** | Craig | — | — |
| Gate 5 (stage upgrades) | Env owners — **CDP: UNKNOWN · Skip: UNKNOWN · Izzy: UNKNOWN · MJC: UNKNOWN** | Craig | Env teams | — |
| Gate 6 (human hammering) | Craig + crew | Craig | Johanna Snider (baseline list) | — |
| Backport triage (weekly sweep + labels) | Craig (early cycles; then trained delegates) | Craig | Fix authors | — |
| Line releases (`publish-lts.yml`) | Build engineer — **UNKNOWN** | Craig | — | Core team |
| `release-lines.json` status changes | Craig | Craig | — | All (via PR) |
| Platform manifest per era + overrides generation (§3.2) | MJ core (tooling) | Craig | Open App owners | App teams |
| Open App major alignment (Appendix C) | App repo owners | App teams | Craig | — |
| Cycle comms (Appendix A) | Craig | Craig | Robert Kihm | Core team / All Companies |
| Cadence decision (§9.1) | Craig (proposal) | **Amith** | Robert Kihm, Johanna Snider | All-team |

## 8. Authority & Escalation

- **No build gets the LTS label without the certification owner's sign-off.** Full stop. Craig owns the gate as the process ramps; a successor would be named with the same written authority before anything else changes. Owning the gate ≠ doing all the work — mechanics are delegable, the decision is not.
- **Overruling a certification block is an explicit leadership escalation to Amith — recorded, never a quiet workaround.**
- **The authority is mechanical, not aspirational.** `release-lines.json` and `certifications/` are CODEOWNERS-gated to the certification owner.

**What CODEOWNERS actually guarantees (and doesn't):**

| Guarantees | Does NOT guarantee — and the mitigation |
|---|---|
| With branch protection "require review from Code Owners" enabled on the target branch, **no PR touching those paths can merge without Craig's approval** | **Direct pushes bypass PR review entirely.** Mitigation: branch protection restricts direct pushes on `next`/`main` to the release bot; the release workflows only ever append mechanical fields (`newest`), never status transitions |
| The gate is visible: every label change is a reviewable PR in history | **Repo admins can bypass protection.** By policy, that bypass *is* the recorded escalation — deliberately visible in git history, which is exactly the accountability we want |
| — | **Nothing stops a compromised/buggy workflow from writing the file.** Mitigation (§15 item 1): a CI check fails any push where `status`/`certifiedBuild`/date fields changed outside an approved-PR context |

## 9. Cadence & Support Windows

### 9.1 Starting cadence — ⚠️ OPEN, exec decision requested (Amith)

**Proposal: bimonthly** (Craig's position; Amith may overrule — the memo said "monthly for now, quarterly eventually").

The argument for bimonthly:

- A new "stable" release every month is hardly *stable* — notwithstanding that MJ currently ships 2–3× per week, so monthly is only relatively stable.
- **MJC overhead is real:** every new MJ version triggers its own testing/plumbing cycle inside MJC, including refreshing all existing MJ installation pools. Monthly certified releases put that tax on MJC customers twelve times a year.
- Bimonthly halves the certification tax while the process is raw, makes the sliding support window meaningful from day one (~4 months vs ~2), and reaches the memo's "quarterly eventually" a step sooner.

The argument for monthly: more practice cycles to harden the gates fast. If chosen, insert Aug/Sep/Oct/Nov cycles below and keep the same December review.

### 9.2 The schedule (bimonthly, pending §9.1)

| Cycle | Candidate cut | Shape | Effective support (current + grace) |
|---|---|---|---|
| #1 — 5.50 LTS (bootstrap) | ~Jul 27, 2026 | Freeze-based (the only one) | **Fixed 6 months** |
| #2 — first 6.x LTS | Late Sep 2026 | Regular (branch-based) | ~4 months |
| #3 | Late Nov 2026 | Regular | ~4–6 months (transition) |
| **Review** | Dec 2026 | Retro on cycles 1–3: cert cost, backport volume, gate reliability → confirm quarterly for 2027 | — |
| 2027 steady state | Quarterly (Mar / Jun / Sep / Dec) | Regular | ~6 months each; longer as maturity proves out (extend-only) |

### 9.3 Window model

- Each certified build gets **full maintenance** (significant bugs, security, perf regressions) while it is the newest certified build; then **critical + security only** for one further cycle (grace); then **EOL**.
- **Exception:** the first certified build (5.50 line) carries a **fixed 6-month window** — SaaS production lands there while the early 6.x era churns.
- **Slip-tolerant:** all dates measure from *actual certification*. A slipped certification shifts windows; it never disqualifies a candidate or shortens anyone's support. If certification is still running when the next cut would be due, the next cut waits (one certification in flight at a time); the December review reconciles the calendar.
- **Extend-only:** if capacity tightens we slow the cadence — we never shrink an announced window. There is no "anchor" tier; longer windows come from slowing cadence for everyone.

## 10. Worked Examples

Assume: line **6.20 LTS** is the newest certified (certified build `6.20.1`, band `6.20–6.29`, `latest` → its newest build), Edge is at `6.34.x`, and a regular cycle for candidate **6.40.0** is underway on branch `lts/6.40` (band `6.40–6.49`; Edge resumed at `6.50.0`).

1. **Routine feature merge during certification.** A contributor merges a feature to `next` as always. It ships on Edge (`6.50.0`, `--tag edge`). The 6.40 candidate is untouched (its branch was cut already). Nothing to do — this is the whole point of regular cycles: `next` never stops.
2. **Cert testing finds a bug in candidate 6.40.0.** Fix PR → `next` (lands in Edge first, per next-first). On merge, apply `backport lts/6.40` → the action opens a cherry-pick PR against `lts/6.40` → merge → `publish-lts.yml` ships **6.40.1** under `lts-6.40` → gates re-run on 6.40.1. Certification, when granted, names 6.40.1.
3. **P0 hotfix on certified 6.20 between cycles.** Fix → `next` → `backport lts/6.20` → **6.20.2** ships from the line. Mini-cert (gates 1–3) re-runs before 6.20.2 inherits the label; since 6.20 is the newest certified line, `latest` moves to 6.20.2.
4. **A normal bug fix on a certified line needs a metadata change.** The fix ships as a **metadata migration** (data-only — no DDL, no CodeGen). It lands on `next` first, is backported byte-identically (same Flyway version string + content), and carries the `metadata-migration` label — the line guard verifies the migration is DDL-free and the release ships as a **band minor: 6.21.0**. Mini-cert runs; label inherits; `latest` moves. This is expected, routine line maintenance (per the PR thread: metadata is a different beast from schema).
5. **A security fix on a certified line truly requires DDL.** Rarest of occasions — allowing schema+CodeGen churn on a stable line undermines the stability promise, so the bar is security-driven necessity. Additive-only (Publish-No-Break), next-first, byte-identical backport, `security-exception` label; ships as a band minor. DBs that applied it on the line and later upgrade to Edge skip it cleanly (same version string).
6. **Cherry-pick conflict.** The action opens a **draft PR** with the first conflict committed plus resolution instructions; a human finishes it. The original PR gets a comment either way — no silent failures.
7. **A contributor asks "do I need to do anything for LTS?"** Default: no. Backporting is opt-in by label; the certification owner also runs a weekly sweep to catch fixes that *should* have been labeled (`backport-declined` records the considered-and-rejected ones).
8. **Certification slips past the next cut date.** 6.40 isn't certified when the next cut comes due → the cut waits. 6.20's windows extend automatically (they're defined by supersession). Slipping is a schedule event; certifying weak is a credibility event.
9. **A candidate fails outright** (regression scale beyond patching). Status → `withdrawn` in `release-lines.json`; no label ever applied; the branch is retired (its band stays skipped — version numbers are free); the next cycle proceeds on schedule with a fresh candidate.
10. **An installation upgrades LTS → LTS** (5.50.x → 6.20.x, skipping Edge). `mj bump` to 6.20.x; migrations apply in order, including the 6.x baseline; if the old line had backported migrations, `mj migrate`'s upgrade mode handles the out-of-order case (§12, §15 item 8). The CLI warns if the path crosses an `upgradeImpact: breaking` entry.
11. **An Open App and a certified line.** An app at `5.7.0` declaring `mjVersionRange >=5.49.0 <6.0.0` runs on any certified 5.x line — compatibility is read from the major (§3.2). When the app targets MJ 6.x, the app bumps to `6.x` and inherits the 6-era platform pins; `mj app install` hard-errors if someone tries to mix a 5.x app into a 6.x host.
12. **A breaking change is needed on Edge.** Rare and deliberate: if era-scale (including any infrastructure-contract change like an Angular major), it's a new era (7.x) with its own platform manifest, baseline, and comms. Otherwise it ships in a minor with `upgradeImpact: breaking` on its release entry — badged in notes, warned on upgrade paths. It reaches LTS users only when a future line certifies past it, with the flag intact.
13. **Bootstrap-cycle special case.** During the freeze there is no line branch: cert fixes merge straight to `next` and the next release *is* the new candidate patch. A cert fix carrying a migration advances the candidate a minor (e.g. 5.50.0 → 5.51.0) under the standing Edge rule — fine, the line freezes at whatever version certifies, and the 5.x line inherits all remaining 5.x space after the era split.

## 11. Contributor Impact (what actually changes for the Core team)

- Day-to-day: **nothing changes.** PRs → `next`, changesets as usual, Edge ships as fast as ever (after the bootstrap freeze ends, permanently).
- New labels exist: `backport lts/<line>` (opt-in backporting), `cert-blocker` (jumps every queue during a cycle), `metadata-migration` (data-only line fix), `security-exception` (DDL on a line — rarest), `backport-declined`.
- During a regular cycle, the only team-wide effect is that `cert-blocker` fixes take priority. No freezes.
- Educating the team on this process is part of the process: the bootstrap cycle is announced with Appendix A.1, and Craig trains delegates on the human gates during cycles 2–3.

## 12. Migrations, Metadata & CodeGen Policy

Three tiers, per the PR-thread convergence:

| Change type | On a certified line? | Version effect | Label |
|---|---|---|---|
| **Code-only fix** | Yes — normal maintenance | Patch | — |
| **Metadata migration** (data-only: inserts/updates to metadata & config tables; includes AI model/vendor/pricing seeds) | Yes — permissible for normal bug fixes; "metadata is a different beast" | Band minor (migration ⇒ minor, universally) | `metadata-migration` (CI verifies the file is DDL-free) |
| **Schema (DDL) migration + CodeGen** | **Rarest of occasions — security-driven necessity only.** A schema+CodeGen step on a stable line undermines the stability promise | Band minor | `security-exception`; additive-only (Publish-No-Break), next-first, **byte-identical** (same Flyway version string + content) |

- **During candidacy:** migrations of both kinds are allowed; the standing guard advances the candidate's version. Certification freezes whatever version passed.
- **Byte-identical + next-first** applies to any backported migration (both tiers) so a line DB later upgrading to Edge skips it cleanly instead of running it twice. Genuinely line-specific metadata corrections (no `next` equivalent) are the triage-approved exception.
- **Punch list dependencies:** the line-guard DDL scanner; `mj migrate` out-of-order upgrade mode + an LTS→Edge upgrade test rig; the identical-version-string rule must hold across per-era migration folders after the 5→6 split.

## 13. Enforcement Surfaces

### 13.1 MJ CLI

- **Default = newest certified** via `release-lines.json` (+ the GH latest-release flag for older CLIs). The picker groups by channel with status + dates.
- **Edge is explicit opt-in:** `--channel edge` per command, or `releaseChannel: 'edge'` in `mj.config.cjs` — deliberately a committed, review-visible file, so a project's opt-out is a team decision, not a forgotten personal flag. Interactive non-LTS selections get one confirm prompt; non-interactive runs simply require the explicit flag.
- **Status awareness:** `mj versions` prints the support table; version-touching commands warn on maintenance (gentle) / EOL (loud) lines and on upgrade paths crossing `upgradeImpact: breaking`. Never blocking.
- **Open App guardrails (§3.2):** `mj app install` / `mj app link` hard-error on app-major ≠ host-MJ-major; the overrides block in consuming repos is *generated* from the era's platform manifest; `mj doctor` validates major alignment, duplicate `@angular/*`, and overrides drift.

### 13.2 MJC — LTS-only

- **MJC's catalog contains certified builds only.** Adding versions is a manual operator task today; the policy is simply that only certified builds enter the catalog. No non-LTS option means no sign-off flow needed — "never production on non-LTS" holds for MJC-hosted systems **by construction**.
- `release-lines.json` gives MJC a machine-readable feed for future automation: auto-ingesting each newly certified release and flagging maintenance/EOL lines in its UI.
- Custom-repo users control their own code and can move to any build outside MJC when genuinely needed, coordinated case-by-case. MJC doesn't model that.

## 14. Cycle #1 — the LTS Bootstrap Cycle

**The biggest immediate threat is the runway:** under two weeks, minus the days it takes to land this process itself. Two structural mitigations:

1. **The process-doc week is real work, planned as such** — this document, the exec review round, and punch items 1–3 are the week's primary deliverables alongside the team's freeze quality work.
2. **The hackathon date is not magic (Amith, on the PR): "let's do this fast but right."** Aug 3 remains the target for opening 6.x, but it is neither a certification deadline nor a hard split date. If gates aren't honestly green in time, we choose at that point — extend the freeze a few days into hackathon week (figuring out how to keep going on new things there), or split anyway and let certification complete on the 5.x line branch with remaining fixes backported. Either way, windows measure from actual certification, and slipping beats certifying weak.

| When | What |
|---|---|
| **Jul 20–26** | This process doc + exec review round (Robert Kihm, John, Johanna Snider + scan group) + cadence decision (§9.1) · team freeze work: core-functionality sweep (navigation, search, views, performance), known-defect backlog (Johanna Snider's list → GitHub issue, assigned Craig), integration-suite expansion · punch items 1–3 (§15) · gate-3 pass criteria + delegated-execution dry run (Caeleb) · **name the UNKNOWNs in §7** · comms A.1 goes out |
| **~Jul 27** | Candidate cut (5.50.x era) + gate-checklist tracking issue · comms A.2 |
| **Jul 27 – Aug 2** | Full gate run (§6) · patch loop on `next` (freeze model) |
| **When gates pass** (target ~Aug 2, flexible per Amith) | Certification sign-off → label, scorecard, `latest` flip, GH latest flag · comms A.3 to MJ Dev (All Companies) |
| **6.x era opens** (target Aug 3, hackathon) | Era-split tooling (baseline migration, version guard, docker tags) + 6-era platform manifest published (§3.2) · freeze ends permanently · 5.x line branch + backport machinery live · Open App 6.x alignment begins per Appendix C timing |
| **Freeze merge rules (bootstrap only)** | cert-blocker fixes and quality/test/docs PRs merge; feature and refactor PRs queue until 6.x opens |

Cycle #1 additionally carries the **baseline mandate**: certification testing catches things that worked and then broke; it won't catch things that never worked well. The sweep above means the first label reflects the baseline actually being held to the bar, not grandfathered past it.

## 15. Tooling Punch List & Delivery Plan

Ordered so that **items 1–3 are enough to label and enforce** the first LTS; they are genuinely small (a JSON file, a CODEOWNERS line, a workflow flag, one script — a focused PR).

| # | Item | When | Where |
|---|---|---|---|
| 1 | `release-lines.json` (incl. `eras.*.platform` manifests) + schema + CODEOWNERS entry + the status-fields CI check (§8) | Before Jul 27 | This branch |
| 2 | `publish.yml`: `make_latest: false` on routine releases; cert flow sets certified build as GH latest; `--tag edge` on routine npm publishes | Before Jul 27 | This branch |
| 3 | `ci/dist-tag-all.mjs` — atomic 233-package tag moves + post-move assertions (+ scratch-scope drill; new-package first-publish edge case) | Before the flip | This branch |
| 4 | Era-split tooling: expected-version guard, changesets major flow, v6 migration baseline (`/create-new-baseline-migration`), docker tags, stale-comment cleanup | 6.x era open | Follow-up PR |
| 5 | Line machinery: line-cut script (branch + **band reservation** — sets Edge's base version to the band ceiling) · `publish-lts.yml` · korthout/backport-action + labels · line guard incl. **DDL scanner** + band-ceiling check | Before cycle #2 (backport action + guard sooner if 5.x line needs a patch) | Follow-up PR |
| 6 | CLI channels: channel resolution, `mj versions`, maintenance/EOL/breaking warnings, `releaseChannel` config | Aug–Sep (GH-latest flag covers the default meanwhile) | Follow-up PR |
| 7 | MJC: LTS-only catalog policy (now, operational) · `release-lines.json` auto-ingest (later) | MJC team's schedule | **MJC repo — out of scope here** |
| 8 | `mj migrate` out-of-order upgrade mode + LTS→Edge upgrade test rig | Before cycle #2 | Follow-up PR |
| 9 | Root `VERSIONING.md` — the human/agent-facing distillation of this doc (incl. §3.2 platform policy) | After blessing | This branch |
| 10 | Open App alignment tooling (§3.2): overrides generation from the era platform manifest · `mj app install`/`link` major-mismatch hard error · `mj doctor` checks (alignment, duplicate `@angular/*`, overrides drift) · linking cache-clear scripting | Aug–Sep, with the app 6.x alignment | Follow-up PR(s) |

**Delivery mechanics:** this document rides the `lts-process` feature branch. After exec blessing, items 1–3 (+9) land on the same branch so the doc and its enforcement merge together; items 4–8 and 10 follow as small focused PRs on the dates above. Item 7 belongs to the MJC team and repo; the per-app version bumps are Appendix C (app repos).

## 16. Risks

1. **Process lands inside the runway** (top risk, now with Amith's explicit slack): mitigations are the §14 flexibility, punch-list ordering (1–3 suffice), and treating this doc as the week's primary deliverable.
2. **Label inflation:** one pressured certification and the label means nothing. Blocking authority is CODEOWNERS-mechanical; overrides are recorded escalations; cycle #1 sets the slip-beats-weak precedent.
3. **AI-suite reliability as a gate:** flaky gates either block spuriously or get ignored. The gate-3 pass criteria + rerun policy are load-bearing and land before cycle #1.
4. **Backport tax replaces the freeze tax from cycle #2:** cherry-pick volume hits the cert crew while `next` runs hot. Measured in cycles 2–3; primary input to the December review.
5. **Stage-env availability:** gate 5 has four UNKNOWN owners today. Unowned, the gate silently degrades. Naming them is a this-week deliverable.
6. **dist-tag drift:** always `--tag`, assertions, npm 11 runners, scratch-scope drill.
7. **Flip-day confusion:** `latest` moving to certified will surprise Edge users; comms A.3 and `@edge` documentation land the same day.
8. **Band-size guess:** 10 minors is a proposal, not a law. Too small and a long-lived line runs out of space for metadata fixes; too large and version numbers look gappy (harmless). Confirm the default (§17) and revisit at the December review.
9. **App-alignment rollout friction:** four app repos change versioning schemes at once (Appendix C), and bizapps-common needs its local checkout reconciled before anyone builds on it. Sequenced with the 6.x era open, owned by app teams.

## 17. Open Items

1. **Cadence** — §9.1, Amith's call. Everything else in §9.2 adjusts mechanically.
2. **Reserved-band size** — default 10 proposed (Amith's PR comment); Craig to confirm on-thread; stored per era in `release-lines.json`.
3. **Name the UNKNOWNs** (§7): build engineer; stage-env owners for CDP, Skip, Izzy, MJC; fresh-install crew. Due before the candidate cut.
4. **Review-round feedback** — Robert Kihm, John, Johanna Snider comments + the scan group (per Amith on the PR) may reshape sections; fold in before merge.
5. **Gate-6 minimum person-hours** — set after the bootstrap cycle calibrates what "enough hammering" costs.
6. **endoflife.date registration + public schedule page** — once cadence stabilizes (post-December review).

---

## Appendix A — Draft Communications

### A.1 To MJ Dev (Core) — process kickoff

> **Subject: LTS is happening — what changes for you (very little), and what happens next two weeks**
>
> Team — as discussed in the exec thread, MJ is introducing certified LTS releases. The short version for contributors:
>
> - **Now → 6.x era open:** the quality freeze is in effect. Cert-blocker fixes, quality, test, and docs PRs merge; feature/refactor PRs queue. Point your energy at the core-functionality sweep and the defect backlog.
> - **~Jul 27:** we cut the first LTS candidate from the current line and run the full certification: AI regression suite, fresh installs, stage upgrades (CDP/Skip/Izzy/MJC), and structured human testing. Issues found get the `cert-blocker` label and jump every queue.
> - **At the hackathon (target Aug 3):** 6.x opens for new development and the freeze ends — permanently. Future certifications run on branches; `next` never freezes again.
> - **After that, your day-to-day is unchanged.** PRs → `next`, changesets as usual. One new habit: if your merged fix should also reach a certified line, add the `backport lts/<line>` label (there's also a weekly sweep, so nothing falls through silently).
>
> The full process doc is in `plans/lts-process.md` (PR #3241). Craig owns certification sign-off; questions → Craig.

### A.2 Candidate-cut notice (template, per cycle)

> **Subject: LTS candidate <version> is cut — certification cycle open**
>
> Candidate **<version>** is now under certification (tracking issue #___, gate checklist inside). What this means: `cert-blocker` fixes take priority until certification completes; everything else proceeds as normal[, and `next` is unaffected — regular cycle]. Fresh-install and stage-upgrade owners: your gate requests are in the tracking issue with a 2-business-day turnaround ask. Findings → issues labeled `cert-blocker` (blocks) or noted on the scorecard (doesn't block).

### A.3 To MJ Dev (All Companies) — certification + flip day (send at first certification)

> **Subject: MemberJunction <version> is our first LTS release — and `latest` now means certified**
>
> Today we certified **MJ <version>** as our first LTS (Long Term Support) release. LTS builds have passed a documented certification: the full AI UX regression suite, fresh-install testing, upgrade testing against live stage environments, and structured human testing — with a published scorecard.
>
> **What changes for you:**
> - `npm install @memberjunction/*` (and Docker `:latest`, and `mj install`) now resolves to the **newest certified LTS build** — the stable thing, by default.
> - Want the fast lane? It's now the **Edge channel**: `@memberjunction/*@edge`, `mj install --channel edge`, Docker `:edge`. Same rapid releases as always — just explicitly chosen.
> - Production deployments of MJ-hosted SaaS run **only** on LTS builds from here on.
> - Support status for every line is machine-readable in `release-lines.json` (and `mj versions`).
>
> Certified line **<line>** is supported per the published schedule; windows only ever extend. Questions → Craig (certification owner).

## Appendix B — Label, Branch & Version Reference

| Thing | Convention |
|---|---|
| Line branch | `lts/6.20` (bootstrap era line: `lts/5.50`) |
| Line version territory | Base minor + reserved band (default 10): line 6.20 owns `6.20.x – 6.29.x`; Edge resumes at `6.30.0`. Bootstrap 5.x line owns all remaining 5.x |
| Backport request | Label `backport lts/6.20` on the merged `next` PR |
| Blocks certification | Label `cert-blocker` |
| Data-only line migration | Label `metadata-migration` (CI-verified DDL-free; ships as band minor) |
| DDL on a line — rarest, security-driven | Label `security-exception` (additive-only, next-first, byte-identical; band minor) |
| Considered, not backported | Label `backport-declined` |
| npm | `latest` = newest certified · `edge` = fast channel · `lts-6.20` = per-line |
| Docker | `:latest` = certified · `:edge` · `:6.20` |
| Scorecards | `certifications/<version>.md`, linked from the GitHub Release |

## Appendix C — Open App Alignment Asks (from the 2026-07-24 memo; app-repo work, tracked here)

Measured 2026-07-24: three versioning schemes coexist across the four apps (5.x, 1.x, 0.x); bizapps-common's manifest (1.0.0) disagrees with its packages (5.4.0) and its published line (5.32.0); overrides discipline is inconsistent (common has none).

| Owner | Action |
|---|---|
| bizapps-accounting | Bump 0.1.0 → 5.x (manifest + all package versions) |
| bizapps-orders | Bump 0.1.0 → 5.x (same) |
| bizapps-common | Reconcile manifest to packages; bump to 5.x; refresh local checkout to published 5.32.0 **before further development**; add the overrides block |
| bizapps-tasks | Bump 1.2.0 → 5.x |
| MJ core | Publish the per-era platform manifest (§4.1); generate overrides from it; add major-mismatch validation to `mj app install` / `app link` / `doctor` (§15 item 10) |

0.x and 1.x go away — there is no pre-1.0 signalling; the major belongs to the platform. When the 6.x era opens, apps follow to 6.x per §3.2 (one more coordinated bump — the deliberate, occasional cost of the infrastructure contract). The residual local-linking "diamond" case (symlinks bypassing npm dedupe → two physical copies of one version, fatal in the browser) is a resolution-path problem owned by the linking tool + `mj doctor`, covered in the local linking spec — not by this versioning policy.
