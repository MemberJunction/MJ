# MemberJunction LTS Release Process

> **Status: PROPOSAL** — v1.3.1, 2026-07-27. Owner: Craig Adam (certification owner).
> v1.3.1 folds in three review-round items (from Marcelo's feedback): line-pinning guidance (§4.2), the `mjVersionRange`-agreement `mj doctor` check (§3.2, §13.1, §15 item 10), and the Appendix C release-note ask. It also lands the queued consumption-guidance edits: continuous Edge tracking via the dist-tag specifier + the publish-window skew caveat (§4.2, Appendix B), the per-release `dbImpact` ledger on the `edge` block (§4.1, with matching schema/validator support), and the true lockstep package count (294, was 233).
> v1.3 folds in the alignment items from the Open App local-dev program: mechanism-neutral consumption wording (§3.2), pnpm joins the platform manifest (§4.1), a peer-deps ≡ platform-manifest certification check (gate 1), the no-write-through rule (§13.1), and a local-dev tooling RACI row (§7).
> v1.2 replaced v1.1's reserved-minor-band design with the **Edge-prerelease version grammar** (§3.1): normal semver versions are certified/candidate builds only; Edge releases are semver prereleases of the next line. Introduced **all at once** at the 6.x era open — no staged transition. The band, and its open band-size question, are gone.
> Under team review: comments requested from Robert Kihm, John, and Johanna Snider; scan requested from the wider group tagged on the PR. On merge, this document becomes canon.
> Decisions explicitly open: **starting cadence** (§9.1). Gating prerequisite: the **changesets pre-mode dry run** (§15 item 5).
> Follow-ups on this branch after blessing: punch-list items 1–3 (§15) and a root-level `VERSIONING.md` distillation for humans and agents.

---

## 1. Purpose & Background

MJ's pace of architectural innovation is a huge asset — and our biggest source of pain. Regressions in new builds hurt customers, and some core functionality was never fully locked down in the first place. Nothing we've shipped has been through a true "production ready" test.

The answer is a formal **LTS (Long Term Support)** process: heavily-tested releases certified as production-ready, produced on a predictable cycle, with the LTS designation **machine-readable and enforced by default** everywhere MJ gets installed or upgraded — the CLI, npm, and MJC. A policy that lives only in a document erodes; this one is enforced by tooling — and under the v1.2 grammar, by the version string itself.

Two commitments live under the one label:

1. **A certified stable channel (now):** frequent, heavily-tested builds blessed for production.
2. **Genuine long-term support (later):** as cadence slows toward quarterly, support windows lengthen for *every* certified build — there is no second-class tier. The label converges on its industry meaning by schedule (§9), not by hope.

**Production policy:** SaaS systems (MJC, Izzy, Skip, Caliber, …) never go to production on a non-LTS build. No exceptions. §13 makes this structural rather than aspirational.

## 2. Definitions

| Term | Meaning |
|---|---|
| **Edge channel** | The fast lane — today's cadence, unchanged: many releases per week from `next` → `main` → npm. Where all features land first. From the 6.x era on, Edge versions are **semver prereleases of the next line**: `6.2.0-edge.0`, `6.2.0-edge.1`, … (§3.1). |
| **Line** | A certified minor: line **6.1** = `6.1.x`, all of it, forever — normal (unsuffixed) versions belong to lines and nothing else. Lines take **patches only**; maintained on branch `lts/6.1`. Under this grammar, lines land at **consecutive minors** (6.1 → 6.2 → 6.3 …). |
| **Candidate** | The build that opens a line: publishing the unsuffixed tuple the Edge stream was building toward (`6.2.0` after `6.2.0-edge.N`). Same commit as the tip of Edge — the suffix strip *is* the candidacy. |
| **Certification** | The gate process (§6). Completes when the gates genuinely pass — however long that takes. The calendar schedules candidate *cuts*; it never forces certification *completion*. |
| **LTS build** | A specific build (e.g. `6.1.1`) that passed certification and carries the label. |
| **Era** | A major version (5.x, 6.x, …). **Majors are for eras, not cycles** — a major signals a genuine architectural epoch **and pins the infrastructure contract** (§3.2). Never a routine certification. |
| **Cycle** | One candidate-to-certification pass. Cycle #1 is the **LTS bootstrap cycle** (special, freeze-based, 5.x-era grammar, §14). Every cycle after it is a **regular cycle**. |
| **Metadata migration** | A migration file containing only data changes (inserts/updates to metadata & configuration tables) — no DDL, no CodeGen impact. Distinct from a **schema (DDL) migration**. The line-fix rules differ sharply (§12). |
| **`dbImpact`** | Per-release metadata (`none | metadata | schema`) in `release-lines.json` + release notes: "does this update touch the DB, and how?" — surfaced by `mj versions` and at upgrade time. The honest replacement for smuggling that signal into version digits. |
| **Platform manifest** | The per-era pin set for underlying infrastructure (Angular, Node, TypeScript, zone.js, pnpm, …), published in `release-lines.json` (§3.2, §4.1). |
| **cert-blocker** | An issue that blocks certification: P0/P1 regressions, data loss/corruption, install or upgrade failure, or breakage of a core flow (navigation, search, views, forms, auth). Cosmetic and P3 issues are recorded on the scorecard but do not block. |

## 3. Versioning Strategy

### 3.1 The version grammar: normal versions are certified; Edge is the prerelease stream of the next line

**The rule, in one line: an unsuffixed semver version is a candidate or LTS build; everything else is `‑edge`.** Introduced whole at the 6.x era open — net-new, one grammar, no transition phases. The 5.x era (bootstrap line included) keeps classic versioning; its line follows the same patch-only behavior regardless.

| You see | It means |
|---|---|
| `6.1.1` | Line 6.1 — certified stream. Patch = line maintenance |
| `6.2.0-edge.14` | Edge — the 15th uncertified release on the way to what will become line 6.2 |
| `6.2.0` | The moment of candidacy: the suffix came off; certification testing begins |
| `7.0.0-edge.0` | A new era opened (new infrastructure contract) |

Mechanics:

- **Edge runs in changesets prerelease mode permanently** (from the era open). Between certifications, accumulated bumps target **the next line's tuple** — bumps don't compound, so every Edge release between line 6.1 and the next cut is `6.2.0-edge.N` with N incrementing per publish. The Edge stream is *literally* the prerelease series of the next LTS.
- **Candidate cut = `pre exit` → publish `6.2.0` → branch `lts/6.2` → `pre enter` (Edge resumes at `6.3.0-edge.0`).** One scripted dance (§15 item 5). A withdrawn candidate consumes its minor (harmless) and the next cycle targets the next one.
- **Lines are patch-only, forever.** `6.1.0 → 6.1.1 → 6.1.2 …`. Migrations on a line ride **labeled patches** (§12) — the migration-⇒-minor rule is **Edge-tuple grammar only** (a release containing migrations must carry a minor-or-higher tuple, which every `X.Y.0-edge.N` does by construction). There is no band, because there is nothing to reserve: Edge never occupies line minors, and lines never occupy Edge's — the suffix partitions the space.
- **Consequently, lines land at consecutive minors**: 6.1, 6.2, 6.3 … — the minor number reads as "the Nth certification of the era."

What the grammar buys, mechanically (verified against npm's `semver` package):

- **Precedence tells the truth:** `6.2.0-edge.5 < 6.2.0 < 6.2.1` — every uncertified build sorts below the certified build it was leading up to. Semver §9's definition of a prerelease ("unstable, might not satisfy the intended compatibility requirements") is *literally what Edge is*.
- **Ranges resolve only certified builds:** `^6.1.0` matches `6.1.2`, never `6.2.0-edge.N` (semver ranges exclude prereleases). Every range-shaped surface — user-authored ranges, **the Open App `mj-app.json` dependency ranges from §3.2** — binds to certified builds automatically. "LTS is the default everywhere" gets enforced by npm's own resolver, even for people who never read our docs. Tools that hide prereleases by default (Dependabot, Renovate, version pickers) hide exactly the right channel.
- **Glanceability is total:** no lookup table, no band arithmetic. Suffix = channel; minor = line; patch = maintenance.

**Precedent — this is the ecosystem-standard answer, not an invention:** TypeScript's `@next` channel ships `X.Y.0-dev.<date>` prereleases of the upcoming stable minor; Ember's release train graduates `X.Y.0-beta.N` to stable `X.Y.0` every cycle; React's canary channel is `X.Y.0-canary-<sha>`. In each case the dev channel is the tuple-anchored prerelease stream of the next stable release, and stable releases own the normal version space. No major project runs a *major-anchored* perpetual prerelease stream (e.g. everything hanging off `6.0.0-edge.*`) — that shape makes every Edge build sort below every certified build of the era forever, and was considered and rejected during this proposal's drafting (2026-07-25).

### 3.2 The major is the infrastructure contract (2026-07-24 memo, adopted)

Per the **MJ Platform Versioning & Open App Alignment** memo:

- **Each MJ era pins an exact infrastructure set** — Angular, Node, TypeScript, RxJS, zone.js, **and the pnpm version the workspace tooling assumes**. MJ 5.x pins Angular 21.1.3; MJ 6.x pins whatever its manifest says (initially the same pins, until the era genuinely moves — e.g. Angular 22). The pins live in the **platform manifest**, published per era in `release-lines.json` (§4.1) — one source of truth, not hand-copied lists that rot.
- **The policy is mechanism-neutral.** Apps consume MJ two ways: **registry installs** (the default — packages arrive from npm) and **linked-workspace dev mode** (working against local checkouts, per the local linking spec). The version grammar, major alignment, and manifest rules bind identically in both — the mechanism changes how the bits arrive, never which versions are legal. Where this document uses npm-registry phrasing (`install`, overrides, ranges), read it as applying equally to the linked mode via its own tooling.
- **Every Open App's major must match the MJ major it runs on.** bizapps-common, -tasks, -accounting, -orders, and everything after them: 5.x apps on MJ 5.x, moving to 6.x in lockstep when MJ does. Minors and patches are each app's own business. Apps do **not** declare infrastructure versions — they declare the `mjVersionRange` they target, and tooling derives the npm `overrides` block from the era's platform manifest.
- **Apps give up the major for their own breaking changes — consciously.** An app-level breaking change is a minor within the era, and consumers express precise requirements through npm-style dependency ranges in `mj-app.json` (`"mj-bizapps-accounting": { "version": ">=5.3.0 <6.0.0" }`). Under the §3.1 grammar those ranges match certified MJ builds only — exactly the right default; app development against Edge uses exact pins (which `mj bump` produces anyway).
- **Violations fail fast:** `mj app install` / `mj app link` hard-error on app-major ≠ host-MJ-major (a clear message, not an ERESOLVE or a runtime DI crash); `mj doctor` validates major alignment across the installed app graph, duplicate `@angular/*` in the tree, drift between the generated overrides block and the platform manifest, and agreement between each app package's declared MJ dependency ranges and the app's `mjVersionRange`. (§15 item 10.)
- **Why this belongs in the LTS doc:** the alignment policy is only livable *because* majors are era-scale. Under the abandoned major-per-cycle model, every Open App would have been dragged through a major bump monthly — impossible. Conversely, alignment strengthens the LTS story: "does app X work with LTS 6.1?" is answered by reading the major. One era split (5→6) does obligate every app to bump majors once (Appendix C) — the deliberate, occasional cost of the contract.
- The per-app remediation asks from the memo are tracked in **Appendix C** — app-repo work, out of scope for this repo but part of this rollout.

### 3.3 Breaking-change signal

Majors keep their traditional meaning, **and** every release entry in `release-lines.json` carries `upgradeImpact: none | config | breaking`. The CLI warns when an upgrade path crosses a `breaking` entry; release notes badge it. App-level compatibility rides `mj-app.json` dependency ranges (§3.2).

## 4. Release Channels & the LTS Label

### 4.1 One source of truth: `release-lines.json`

A repo-root file, Node.js-`schedule.json` style. Everything else — CLI, MJC, `mj app` tooling, docs, the website — derives from it.

```jsonc
{
  "edge": {
    "newest": "6.2.0-edge.14",
    "releases": {                      // the Edge stream's dbImpact ledger — pruned at each candidate cut
      "6.2.0-edge.13": { "dbImpact": "schema" },
      "6.2.0-edge.14": { "dbImpact": "none" }
    }
  },
  "eras": {
    "5": {
      "platform": { "angular": "21.1.3", "node": ">=18.0.0", "typescript": "5.9.x", "zone.js": "0.16.x", "pnpm": "10.x" }
    },
    "6": {
      "platform": { "angular": "21.1.3", "node": ">=18.0.0", "typescript": "5.9.x", "zone.js": "0.16.x", "pnpm": "10.x" }
    }
  },
  "lines": {
    "6.1": {
      "status": "certified",            // candidate | certified | maintenance | eol | withdrawn
      "certifiedBuild": "6.1.1",
      "newest": "6.1.3",
      "candidateDate": "2026-09-28",
      "certifiedDate": "2026-10-06",    // support clock starts HERE (slip-tolerant)
      "supportEnds": "2027-02-06",      // extend-only
      "upgradeImpact": "none",
      "releases": {
        "6.1.2": { "dbImpact": "none" },
        "6.1.3": { "dbImpact": "schema", "labels": ["security-exception"] }
      },
      "scorecard": "certifications/6.1.1.md"
    }
  }
}
```

- **Status transitions happen only via PR**, and the file is CODEOWNERS-gated to the certification owner (§8).
- Publish workflows may append *mechanical* fields (`newest` and per-release `releases` entries, on `edge` and on lines) via direct push; they never touch `status`/`certifiedBuild`/dates.
- **Edge carries the same per-release `dbImpact` ledger as lines** (`edge.releases`, appended mechanically per publish), so the fast lane's migration signal is machine-readable — `mj versions --channel edge` and upgrade-time warnings, not release-notes archaeology. Pruned at each candidate cut: the candidate is the same commit as the stream's tip, so the accumulated impact is the new line's starting point by construction, and Edge restarts clean at the next tuple.
- Dates are **extend-only**: windows may lengthen, never shrink.
- The `eras.*.platform` block **is** the platform manifest (§3.2) — `mj app` tooling generates consuming repos' npm `overrides` from it. It pins **pnpm** alongside the runtime stack because the linked-workspace dev mode runs on pnpm: the workspace tooling and the certification gates must agree on which package-manager behavior they're validating against.
- The manifest is also the reference for the **peer-dependency agreement check** (gate 1): every published package's declared peer ranges must accept the era's pins. npm's default install lets a drifted declaration ride silently; strict pnpm enforces declared peers at install time, so the same drift is an install failure in a consuming workspace — the gate catches it before a user does.

### 4.2 npm dist-tags

From the first certification onward, **every "default" surface resolves to certified bits**:

| Tag | Points at | Moved by |
|---|---|---|
| `latest` | Newest build of the newest **certified** line | Certification (atomic 294-package move via `ci/dist-tag-all.mjs`), and line publishes when their line is the newest certified |
| `edge` | Newest Edge prerelease | `publish.yml` (routine publishes carry `--tag edge`) |
| `lts-6.1` | Newest build of that line | `publish-lts.yml` on every line release |

Notes:

- **Tag and suffix now agree** (`@edge` installs `…-edge.N`) — self-describing on both axes. The tag remains necessary: a later Edge tuple outranks an older line's patches in raw precedence (`6.2.0-edge.0 > 6.1.3`), so bare installs are governed by `latest`, not by sort order. And `next` was rejected as a tag name because it would collide confusingly with the repo's `next` *branch* (published builds actually come from `main`).
- **Pinning to a line means tilde or exact, not caret.** `^6.1.0` also matches the next certified line's `6.2.0` on a fresh resolve — always certified bits (never Edge), but a migration-bearing line-crossing at a moment nobody chose. `~6.1.0`, or the exact pins `mj bump` writes, keeps an installation on its line until upgrading is a deliberate act.
- **Tracking Edge continuously = the dist-tag as the version specifier.** No semver range can durably follow a prerelease stream — ranges only match prereleases anchored to their exact tuple, which changes every cycle. The supported patterns: `"@memberjunction/core": "edge"` in `package.json` (npm resolves the tag at install time), Renovate `followTag: "edge"` for teams that want update PRs instead, or — the recommended path — `mj bump --channel edge`, which writes exact, mutually consistent pins. The bare tag specifier resolves per package, so an install landing mid-publish-window can mix `-edge.N` and `-edge.N+1` across the set; exact pins are the fix.
- **No publish anywhere omits its explicit `--tag`** (routine = `edge`, line = `lts-x.y`). On npm ≤ 10, a bare publish of an older version silently drags `latest` backward across every package published — with 294 packages that is a catastrophic footgun. npm 11 fixed the default; we still never rely on it. Post-publish `dist-tag ls` assertions on a sample; one-time drill against a scratch scope.
- The `latest` flip is a **one-time comms event** at first certification (Vue and Express precedent — Appendix A.3). Additionally, **anyone tracking Edge via semver ranges stops receiving updates at the era open** (ranges can't see prereleases) — that's intended behavior, but it must be in the era-open comms, not discovered.
- Edge-case: a brand-new package's first publish under `--tag edge` needs explicit `latest` handling (npm gives a first publish only the tag passed). Pre-publish validation currently blocks first-time packages anyway; §15 item 3 covers it.
- **EOL:** `npm deprecate @memberjunction/*@"6.1.x" "…EOL — see upgrade guide"`, scripted across the set, plus `eol` status in `release-lines.json`.

### 4.3 GitHub Releases & Docker

- Edge releases publish with `make_latest: false`; certification sets the certified build as the repo's **latest release**. Existing CLIs' "newest stable" auto-pick then lands on certified bits with zero CLI code changes — enforcement precedes the CLI work.
- Certified releases carry "(LTS)" in the title and link their scorecard.
- Docker: `:latest` follows certified; `:edge` for the fast channel; per-line tags (`:6.1`).

## 5. The Two Cycle Shapes

### 5.1 The LTS bootstrap cycle (cycle #1 — only)

Runs entirely in the 5.x era under classic versioning: the candidate is the tip of `next`; cert fixes merge to `next`; each patch build is a normal release (a cert fix carrying a migration advances the candidate a minor under the standing Edge rule — fine, the line freezes at whatever version certifies). This works because a **merge freeze** is in effect (already running). **The freeze does not recur.** The 5.x line owns all remaining 5.x space after the era split — patch-only from certification on, like every line. Details and dates in §14.

### 5.2 Regular cycles (cycle #2 onward — `next` never stops)

1. **Candidate cut = the pre-exit dance** (scripted): `changeset pre exit` → version → publish **`6.2.0`** (normal, `make_latest: false` until certified) → branch **`lts/6.2`** from the tag → `changeset pre enter edge` (Edge resumes at `6.3.0-edge.0`). `next` flows at full speed throughout.
2. **Fixes land on `next` first**, then reach the line by label: `backport lts/6.2` on the merged PR → [korthout/backport-action](https://github.com/korthout/backport-action) opens the cherry-pick PR automatically (conflicts become a draft PR a human finishes). The only exceptions to next-first: fixes for code that no longer exists on the dev line, and genuinely line-specific metadata corrections (certification-owner triage).
3. **Line releases** ship from a parameterized `publish-lts.yml`: `changeset publish --tag lts-6.2`, git tag `v6.2.N`, GitHub Release (`make_latest` only if newest certified). Line publishes never merge back to `next`.
4. **Line guard** (CI on `lts/*` branches): **patch-only, always.** A `migrations/` diff is scanned for DDL (CREATE/ALTER/DROP/…): **data-only** → requires the `metadata-migration` label; **contains DDL** → requires the `security-exception` label (§12). Either way the release remains a patch; `dbImpact` records the DB touch.

The existing `next → main → publish → merge-back` pipeline is untouched for Edge in every cycle — it just runs in prerelease mode.

## 6. Certification Gates — the Checklist

> Certification is a **documented checklist, not a vibe**. Every gate produces evidence on the scorecard (`certifications/<version>.md`, committed; the GitHub Release links to it). The calendar never completes a certification — the gates do.

| # | Gate | Kind | Pass bar |
|---|---|---|---|
| 1 | **CI green** on the candidate: unit tests, build, UI token/button checks, dependency check, **peer-deps ≡ platform manifest** (every package's declared peer ranges accept the era's pins, §4.1), PG migration translation | Automated | All workflows green, zero waivers |
| 2 | **Deterministic integration tier** (`npm run test:integration`) against the live dev DB on the candidate build | Automated | Zero failures; sibling-parity check green |
| 3 | **Full UX Regression Suite** (AI-driven) against a fresh install of the candidate | AI-automated | Documented pass criteria met. Failure triage: defect → `cert-blocker`; suspected flake → max 2 reruns, must pass clean twice consecutively. Results packet attached to scorecard |
| 4 | **Fresh-install matrix**: `mj install` of the candidate on clean macOS + Windows; More Cheese and other sample environments stood up | Human + scripted | Install completes; smoke passes: login, Explorer loads, CodeGen runs, entity record created, view renders, agent run completes |
| 5 | **Upgrade matrix**: CDP stage, Skip stage, Izzy stage, MJC stage each upgraded to the candidate | Human | Each env owner reports pass/fail + issues within 2 business days of the request |
| 6 | **Human hammering**: structured exploratory sessions on core flows — navigation/breadcrumbs, search, views (create/edit/render/share), forms, dashboards, auth, performance spot-checks | Human | Minimum agreed person-hours logged; all findings triaged (blocker vs. recorded) |
| 7 | **Zero open `cert-blocker`s** | Process | Label query returns empty |
| 8 | **Certification sign-off** | Authority | Craig approves the `release-lines.json` PR — the only way the label applies |

**Mini-certification for line releases:** every post-certification line patch — code-only, `metadata-migration`, or `security-exception` — re-runs the automated gates (1–3) before the new build inherits the LTS label. No human cert week — but never a silent inherit.

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
| Local-dev / linked-workspace tooling (link mode, no-write-through guard, `mj doctor` link checks) | Craig (Open App local-dev program) | Craig | Open App owners | App teams |
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
| With branch protection "require review from Code Owners" enabled on the target branch, **no PR touching those paths can merge without Craig's approval** | **Direct pushes bypass PR review entirely.** Mitigation: branch protection restricts direct pushes on `next`/`main` to the release bot; the release workflows only ever append mechanical fields (`newest`, `releases`), never status transitions |
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
| #1 — 5.50 LTS (bootstrap) | ~Jul 27, 2026 | Freeze-based (the only one); 5.x-era classic grammar | **Fixed 6 months** |
| #2 — line 6.1 (first of the era) | Late Sep 2026 | Regular (pre-exit dance debuts) | ~4 months |
| #3 — line 6.2 | Late Nov 2026 | Regular | ~4–6 months (transition) |
| **Review** | Dec 2026 | Retro on cycles 1–3: cert cost, backport volume, gate reliability, pre-mode behavior → confirm quarterly for 2027 | — |
| 2027 steady state | Quarterly (Mar / Jun / Sep / Dec) | Regular | ~6 months each; longer as maturity proves out (extend-only) |

*(Line numbers illustrative: the first 6-era certification defines line 6.1, the second 6.2, and so on — consecutive by construction, §3.1.)*

### 9.3 Window model

- Each certified build gets **full maintenance** (significant bugs, security, perf regressions) while it is the newest certified build; then **critical + security only** for one further cycle (grace); then **EOL**.
- **Exception:** the first certified build (5.50 line) carries a **fixed 6-month window** — SaaS production lands there while the early 6.x era churns.
- **Slip-tolerant:** all dates measure from *actual certification*. A slipped certification shifts windows; it never disqualifies a candidate or shortens anyone's support. If certification is still running when the next cut would be due, the next cut waits (one certification in flight at a time); the December review reconciles the calendar.
- **Extend-only:** if capacity tightens we slow the cadence — we never shrink an announced window. There is no "anchor" tier; longer windows come from slowing cadence for everyone.

## 10. Worked Examples

The core walkthrough (this is the scenario from the PR discussion, and the grammar it settled on). Assume line **6.1** is the newest certified line (certified build `6.1.1`) and Edge is streaming toward line 6.2.

| # | Event | Version | Mechanics |
|---|---|---|---|
| 1 | First 6-era certification | **6.1.1** | Candidate 6.1.0 was cut (pre-exit dance); cert fixes produced 6.1.1; gates passed on it. `latest` → 6.1.1; line branch `lts/6.1` live |
| 2 | Dev ships a feature with a migration | **6.2.0-edge.0** | Edge (pre-mode) targets the next line's tuple; migration satisfies the minor-tuple rule by construction |
| 3 | Non-migration bug found in 6.1.1 | **6.1.2** | Fix on `next` first → `backport lts/6.1` → line patch; mini-cert (gates 1–3); label inherits; `latest` → 6.1.2. `dbImpact: none` |
| 4 | More Edge work, then a bug fix to it | **6.2.0-edge.1**, **6.2.0-edge.2** | Counter increments per publish; tuple holds at 6.2.0 |
| 5 | **Security hole requiring a migration on the LTS line** | **6.1.3** + twin on Edge (**6.2.0-edge.3**) | Fix + migration land on `next` first (rides the Edge stream); backported **byte-identical** (same Flyway version string + content) with `security-exception` → ships as a **patch** carrying a migration. `dbImpact: schema`; mini-cert; `latest` → 6.1.3. A 6.1.3 DB later upgrading to line 6.2+ skips the migration (same Flyway version) |
| 6 | Cycle #2 candidate cut | **6.2.0** | Pre-exit dance: suffix comes off the stream's tuple; branch `lts/6.2`; Edge resumes at **6.3.0-edge.0** |
| 7 | Cert testing finds a bug in 6.2.0 | **6.2.1** | Same next-first + backport flow as any line fix; certification, when granted, names 6.2.1 |
| 8 | Certification of line 6.2 | — | `latest` → 6.2.1; line 6.1 enters grace (critical + security only) |

Edge cases:

9. **A contributor asks "do I need to do anything for LTS?"** Default: no. Backporting is opt-in by label; the certification owner runs a weekly sweep to catch fixes that *should* have been labeled (`backport-declined` records the considered-and-rejected ones).
10. **Cherry-pick conflict.** The action opens a **draft PR** with the first conflict committed plus resolution instructions; a human finishes it. The original PR gets a comment either way — no silent failures.
11. **Certification slips past the next cut date.** The cut waits; the previous line's windows extend automatically (defined by supersession). Slipping is a schedule event; certifying weak is a credibility event.
12. **A candidate fails outright.** Status → `withdrawn`; no label; branch retired; its minor is consumed (version numbers are free); next cycle targets the next tuple.
13. **An installation upgrades LTS → LTS** (5.50.x → 6.2.x, skipping Edge). `mj bump` to 6.2.x; migrations apply in order, including the 6-era baseline; backported migrations already applied are skipped (same Flyway version); `mj migrate`'s upgrade mode handles the out-of-order case (§12, §15 item 9). The CLI warns if the path crosses an `upgradeImpact: breaking` entry.
14. **An Open App and a certified line.** An app at `6.4.0` declaring `mjVersionRange >=6.1.0 <7.0.0` runs on any certified 6.x line — and that range *cannot* accidentally resolve an Edge build (prerelease exclusion). App development against Edge pins exact (`6.3.0-edge.7`), which is what `mj bump` produces.
15. **A breaking change is needed on Edge.** Rare and deliberate: if era-scale (including any infrastructure-contract change like an Angular major), it's a new era (`7.0.0-edge.0`) with its own platform manifest, baseline, and comms. Otherwise it ships in the Edge stream with `upgradeImpact: breaking` on its release entry — badged in notes, warned on upgrade paths. It reaches LTS users only when a future line certifies past it, with the flag intact.

## 11. Contributor Impact (what actually changes for the Core team)

- Day-to-day: **nothing changes.** PRs → `next`, changesets as usual, Edge ships as fast as ever (after the bootstrap freeze ends, permanently). Version strings on Edge grow an `-edge.N` suffix at the 6.x era open — that's the visible difference.
- New labels exist: `backport lts/<line>` (opt-in backporting), `cert-blocker` (jumps every queue during a cycle), `metadata-migration` (data-only line fix), `security-exception` (DDL on a line — rarest), `backport-declined`.
- During a regular cycle, the only team-wide effect is that `cert-blocker` fixes take priority. No freezes.
- Educating the team on this process is part of the process: the bootstrap cycle is announced with Appendix A.1, the era-open grammar change with A.3, and Craig trains delegates on the human gates during cycles 2–3.

## 12. Migrations, Metadata & CodeGen Policy

Three tiers, per the PR-thread convergence. **On a line, everything is a patch** — the tiers differ in what's allowed and how it's labeled, with `dbImpact` carrying the operational signal:

| Change type | On a certified line? | Version effect | Label / `dbImpact` |
|---|---|---|---|
| **Code-only fix** | Yes — normal maintenance | Patch | — / `none` |
| **Metadata migration** (data-only: inserts/updates to metadata & config tables; includes AI model/vendor/pricing seeds) | Yes — permissible for normal bug fixes; "metadata is a different beast" | Patch | `metadata-migration` (CI verifies the file is DDL-free) / `metadata` |
| **Schema (DDL) migration + CodeGen** | **Rarest of occasions — security-driven necessity only.** A schema+CodeGen step on a stable line undermines the stability promise | Patch | `security-exception`; additive-only (Publish-No-Break), next-first, **byte-identical** (same Flyway version string + content) / `schema` |

- **On Edge**, the migration-⇒-minor rule holds at tuple level: migrations only ever ship in minor-or-higher-tupled releases — which every `X.Y.0-edge.N` is by construction (§3.1).
- **During candidacy** (post-cut, pre-certification), the line rules above already apply — the candidate's fixes are line patches.
- **Byte-identical + next-first** applies to any backported migration (both tiers) so a line DB later upgrading past it skips it cleanly instead of running it twice. Genuinely line-specific metadata corrections (no `next` equivalent) are the triage-approved exception.
- **Punch list dependencies:** the line-guard DDL scanner; `mj migrate` out-of-order upgrade mode + an LTS→Edge upgrade test rig; the identical-version-string rule must hold across per-era migration folders after the 5→6 split.

## 13. Enforcement Surfaces

### 13.1 MJ CLI

- **Default = newest certified** via `release-lines.json` (+ the GH latest-release flag for older CLIs). The picker groups by channel with status + dates.
- **Edge is explicit opt-in:** `--channel edge` per command, or `releaseChannel: 'edge'` in `mj.config.cjs` — deliberately a committed, review-visible file, so a project's opt-out is a team decision, not a forgotten personal flag. Interactive non-LTS selections get one confirm prompt; non-interactive runs simply require the explicit flag.
- **Status awareness:** `mj versions` prints the support table incl. per-release `dbImpact`; version-touching commands warn on maintenance (gentle) / EOL (loud) lines, on upgrade paths crossing `upgradeImpact: breaking`, and note DB-touching patches ("6.1.3 includes a schema migration — `mj migrate` will apply it"). Never blocking.
- **Open App guardrails (§3.2):** `mj app install` / `mj app link` hard-error on app-major ≠ host-MJ-major; the overrides block in consuming repos is *generated* from the era's platform manifest; `mj doctor` validates major alignment, duplicate `@angular/*`, overrides drift, and app-package range agreement with the declared `mjVersionRange`.
- **No-write-through rule (linked mode):** no MJ tooling ever writes through `node_modules` into a linked repo. A symlinked package is someone's working tree — installers, CodeGen, and fixers treat anything reached through a link as **read-only**, and either resolve the write to the true source repo explicitly or refuse loudly. Silent writes through a symlink corrupt a repo the tool doesn't own; this rule is a hard guardrail on every tool that touches the dependency tree, enforced in the link tooling and checked by `mj doctor`.

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
| **~Jul 27** | Candidate cut (5.50.x era, classic grammar) + gate-checklist tracking issue · comms A.2 |
| **Jul 27 – Aug 2** | Full gate run (§6) · patch loop on `next` (freeze model) |
| **When gates pass** (target ~Aug 2, flexible per Amith) | Certification sign-off → label, scorecard, `latest` flip, GH latest flag · comms A.3 to MJ Dev (All Companies) |
| **6.x era opens** (target Aug 3, hackathon) | Era-split tooling (baseline migration, version guard, docker tags) + 6-era platform manifest published (§3.2) + **Edge prerelease grammar begins** (`changeset pre enter edge`; first Edge release `6.1.0-edge.0`) · freeze ends permanently · 5.x line branch + backport machinery live · Open App 6.x alignment begins per Appendix C timing |
| **Freeze merge rules (bootstrap only)** | cert-blocker fixes and quality/test/docs PRs merge; feature and refactor PRs queue until 6.x opens |

Cycle #1 additionally carries the **baseline mandate**: certification testing catches things that worked and then broke; it won't catch things that never worked well. The sweep above means the first label reflects the baseline actually being held to the bar, not grandfathered past it.

## 15. Tooling Punch List & Delivery Plan

Ordered so that **items 1–3 are enough to label and enforce** the first LTS; they are genuinely small (a JSON file, a CODEOWNERS line, a workflow flag, one script — a focused PR).

| # | Item | When | Where |
|---|---|---|---|
| 1 | `release-lines.json` (incl. `eras.*.platform` manifests, per-release `dbImpact`) + schema + CODEOWNERS entry + the status-fields CI check (§8) | Before Jul 27 | This branch |
| 2 | `publish.yml`: `make_latest: false` on routine releases; cert flow sets certified build as GH latest; `--tag edge` on routine npm publishes | Before Jul 27 | This branch |
| 3 | `ci/dist-tag-all.mjs` — atomic 294-package tag moves + post-move assertions (+ scratch-scope drill; new-package first-publish edge case) | Before the flip | This branch |
| 4 | Era-split tooling: expected-version guard (incl. prerelease grammar), changesets major flow, v6 migration baseline (`/create-new-baseline-migration`), docker tags, stale-comment cleanup | 6.x era open | Follow-up PR |
| 5 | **Edge prerelease versioning** (the biggest tooling bet — **mandatory scratch-scope dry run before era open**): permanent changesets pre-mode wiring at 294-package lockstep scale; the scripted pre-exit/enter candidate-cut dance; `mj bump` + installer + version-compare prerelease awareness; verify pre-mode tuple math matches §3.1 intent (non-compounding bumps → next-line tuple) | Before 6.x era open | Follow-up PR |
| 6 | Line machinery: `publish-lts.yml` · korthout/backport-action + labels · line guard (patch-only + DDL scanner) | Before first post-cert 5.x backport | Follow-up PR |
| 7 | CLI channels: channel resolution, `mj versions` (+`dbImpact`), maintenance/EOL/breaking warnings, `releaseChannel` config | Aug–Sep (GH-latest flag covers the default meanwhile) | Follow-up PR |
| 8 | MJC: LTS-only catalog policy (now, operational) · `release-lines.json` auto-ingest (later) | MJC team's schedule | **MJC repo — out of scope here** |
| 9 | `mj migrate` out-of-order upgrade mode + LTS→Edge upgrade test rig | Before cycle #2 | Follow-up PR |
| 10 | Open App alignment tooling (§3.2): overrides generation from the era platform manifest · `mj app install`/`link` major-mismatch hard error · `mj doctor` checks (alignment, duplicate `@angular/*`, overrides drift, `mjVersionRange` agreement, no-write-through §13.1) · peer-deps ≡ platform-manifest CI check wired into gate 1 (§4.1) · linking cache-clear scripting | Aug–Sep, with the app 6.x alignment | Follow-up PR(s) |
| 11 | Root `VERSIONING.md` — the human/agent-facing distillation of this doc (incl. the §3.1 grammar and §3.2 platform policy) | After blessing | This branch |

**Delivery mechanics:** this document rides the `lts-process` feature branch. After exec blessing, items 1–3 (+11) land on the same branch so the doc and its enforcement merge together; items 4–7 and 9–10 follow as small focused PRs on the dates above. Item 8 belongs to the MJC team and repo; the per-app version bumps are Appendix C (app repos).

## 16. Risks

1. **Process lands inside the runway** (top risk, with Amith's explicit slack): mitigations are the §14 flexibility, punch-list ordering (1–3 suffice), and treating this doc as the week's primary deliverable.
2. **The pre-mode bet (new in v1.2):** permanent changesets prerelease mode at 294-package lockstep scale is the design's biggest tooling assumption — changesets' own docs call pre-mode sharp-edged, and the §3.1 tuple math (non-compounding bumps) must be verified, not assumed. Mitigation: item 5's **mandatory scratch-scope dry run before the era open**, with a thin custom version-calc wrapper as the fallback if pre-mode misbehaves. The grammar is the design; changesets is merely the first-choice implementation.
3. **Label inflation:** one pressured certification and the label means nothing. Blocking authority is CODEOWNERS-mechanical; overrides are recorded escalations; cycle #1 sets the slip-beats-weak precedent.
4. **AI-suite reliability as a gate:** flaky gates either block spuriously or get ignored. The gate-3 pass criteria + rerun policy are load-bearing and land before cycle #1.
5. **Backport tax replaces the freeze tax from cycle #2:** cherry-pick volume hits the cert crew while `next` runs hot. Measured in cycles 2–3; primary input to the December review.
6. **Stage-env availability:** gate 5 has four UNKNOWN owners today. Unowned, the gate silently degrades. Naming them is a this-week deliverable.
7. **dist-tag drift:** always `--tag`, assertions, npm 11 runners, scratch-scope drill.
8. **Era-open comms burden:** two simultaneous surprises for Edge users — `latest` now means certified, and Edge versions grew a suffix that semver ranges can't see (range-trackers silently stop updating). Comms A.3 + `@edge` documentation must land the same day, and the era open is the one-time moment to absorb both.
9. **App-alignment rollout friction:** four app repos change versioning schemes at once (Appendix C), and bizapps-common needs its local checkout reconciled before anyone builds on it. Sequenced with the 6.x era open, owned by app teams.

## 17. Open Items

1. **Cadence** — §9.1, Amith's call. Everything else in §9.2 adjusts mechanically.
2. **Name the UNKNOWNs** (§7): build engineer; stage-env owners for CDP, Skip, Izzy, MJC; fresh-install crew. Due before the candidate cut.
3. **Pre-mode dry run** (§15 item 5) — must pass before the 6.x era opens; fallback is a thin custom version-calc step.
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
> - **At the hackathon (target Aug 3):** 6.x opens for new development and the freeze ends — permanently. From 6.x on, Edge releases are versioned as prereleases of the next LTS (`6.1.0-edge.0`, `-edge.1`, …) and certified builds own the normal version numbers. Future certifications run on branches; `next` never freezes again.
> - **After that, your day-to-day is unchanged.** PRs → `next`, changesets as usual. One new habit: if your merged fix should also reach a certified line, add the `backport lts/<line>` label (there's also a weekly sweep, so nothing falls through silently).
>
> The full process doc is in `plans/lts-process.md` (PR #3241). Craig owns certification sign-off; questions → Craig.

### A.2 Candidate-cut notice (template, per cycle)

> **Subject: LTS candidate <version> is cut — certification cycle open**
>
> Candidate **<version>** is now under certification (tracking issue #___, gate checklist inside). What this means: `cert-blocker` fixes take priority until certification completes; everything else proceeds as normal[, and `next` is unaffected — regular cycle]. Fresh-install and stage-upgrade owners: your gate requests are in the tracking issue with a 2-business-day turnaround ask. Findings → issues labeled `cert-blocker` (blocks) or noted on the scorecard (doesn't block).

### A.3 To MJ Dev (All Companies) — certification + the new version grammar (send at first certification / era open)

> **Subject: MemberJunction <version> is our first LTS release — and version numbers now tell you the channel**
>
> Today we certified **MJ <version>** as our first LTS (Long Term Support) release. LTS builds have passed a documented certification: the full AI UX regression suite, fresh-install testing, upgrade testing against live stage environments, and structured human testing — with a published scorecard.
>
> **What changes for you:**
> - `npm install @memberjunction/*` (and Docker `:latest`, and `mj install`) now resolves to the **newest certified LTS build** — the stable thing, by default.
> - **Version numbers now carry the channel.** Certified builds are plain semver (`6.1.1`). Fast-lane builds are prereleases of the next LTS: `6.2.0-edge.3`. Same rapid releases as always — explicitly marked. If you tracked the fast lane with a semver range, switch to the **Edge channel** explicitly: `@memberjunction/*@edge`, `mj install --channel edge`, Docker `:edge` (ranges intentionally don't match prerelease versions).
> - Production deployments of MJ-hosted SaaS run **only** on LTS builds from here on.
> - Support status for every line is machine-readable in `release-lines.json` (and `mj versions`, including whether a given patch touches the database).
>
> Certified line **<line>** is supported per the published schedule; windows only ever extend. Questions → Craig (certification owner).

## Appendix B — Label, Branch & Version Reference

| Thing | Convention |
|---|---|
| Version grammar | Normal semver (`6.1.1`) = candidate/LTS only · `6.2.0-edge.N` = Edge (prerelease of the next line) · era 5 keeps classic grammar |
| Line | Consecutive minors per era: 6.1, 6.2, … Line = its minor, patches only, forever. Bootstrap 5.x line owns all remaining 5.x |
| Line branch | `lts/6.1` (bootstrap era line: `lts/5.50`) |
| Backport request | Label `backport lts/6.1` on the merged `next` PR |
| Blocks certification | Label `cert-blocker` |
| Data-only line migration | Label `metadata-migration` (CI-verified DDL-free; ships as a patch, `dbImpact: metadata`) |
| DDL on a line — rarest, security-driven | Label `security-exception` (additive-only, next-first, byte-identical; ships as a patch, `dbImpact: schema`) |
| Considered, not backported | Label `backport-declined` |
| npm | `latest` = newest certified · `edge` = fast channel · `lts-6.1` = per-line · continuous Edge tracking = the `edge` tag as version specifier or `mj bump --channel edge` exact pins, never a semver range |
| Docker | `:latest` = certified · `:edge` · `:6.1` |
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

0.x and 1.x go away — there is no pre-1.0 signalling; the major belongs to the platform. Each alignment bump ships with a release-note line explaining the jump (platform alignment, not a feature epoch), so external consumers read the change instead of guessing at it. When the 6.x era opens, apps follow to 6.x per §3.2 (one more coordinated bump — the deliberate, occasional cost of the infrastructure contract). The residual local-linking "diamond" case (symlinks bypassing npm dedupe → two physical copies of one version, fatal in the browser) is a resolution-path problem owned by the linking tool + `mj doctor`, covered in the local linking spec — not by this versioning policy. The linking spec also carries the operational side of the **no-write-through rule** (§13.1); this document owns the policy statement.
