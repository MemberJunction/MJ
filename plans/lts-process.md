# MemberJunction LTS Release Process

> **Status: PROPOSAL** — v1.0, 2026-07-21. Owner: Craig Adam (certification owner).
> First audience: the exec team (visibility + Amith's blessing). On merge, this document becomes canon.
> One decision is explicitly left open for exec resolution: **starting cadence** (§9.1).
> Follow-ups on this branch after blessing: the tooling punch list (§15) and a root-level `VERSIONING.md` distillation for humans and agents.

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
| **LTS build** | A specific build (e.g. `6.4.1`) that passed certification and carries the label. |
| **Line** | The frozen minor a certified build lives on (e.g. **6.4 LTS** = `6.4.x`), maintained on branch `lts/6.4` after the era moves past it. |
| **Era** | A major version (5.x, 6.x, …). **Majors are for eras, not cycles** — a major bump signals a genuine architectural/breaking epoch, never a routine certification. |
| **Cycle** | One candidate-to-certification pass. Cycle #1 is the **LTS bootstrap cycle** (special, freeze-based, §14). Every cycle after it is a **regular cycle** (branch-based, no freeze). |
| **cert-blocker** | An issue that blocks certification: P0/P1 regressions, data loss/corruption, install or upgrade failure, or breakage of a core flow (navigation, search, views, forms, auth). Cosmetic and P3 issues are recorded on the scorecard but do not block. |

## 3. Versioning Strategy

**Majors are for eras, not cycles.**

- **One era split now:** the bootstrap cycle certifies a 5.x build; 5.x becomes the first maintenance line; new development opens on **6.x** at the Utah hackathon (Aug 3). The major-version pipeline work (new migration baseline, version-guard update, docker tags — §15 item 4) happens once, here.
- **Every later certification freezes a minor, not a major:** a certified `6.4.1` defines line **6.4 LTS**. Edge keeps shipping 6.5, 6.6, … at full speed. Future majors (7.x) happen only for genuine breaking/architectural epochs, on their own schedule.
- **Patch-space reservation:** the moment a line is cut, `next` takes an empty `minor` changeset so Edge moves past the line's minor immediately. The line owns its `x.y.z` patch space forever — version collisions are impossible by construction.
- **Breaking-change signal:** majors keep their traditional meaning, **and** every release entry in `release-lines.json` carries `upgradeImpact: none | config | breaking`. The CLI warns when an upgrade path crosses a `breaking` entry; release notes badge it. (Post-"teething," true breaking changes should be rare — but the signal exists and is machine-readable.)

## 4. Release Channels & the LTS Label

### 4.1 One source of truth: `release-lines.json`

A repo-root file, Node.js-`schedule.json` style. Everything else — CLI, MJC, docs, the website — derives from it.

```jsonc
{
  "edge": { "newest": "6.7.2" },
  "lines": {
    "5.50": {
      "status": "certified",            // candidate | certified | maintenance | eol | withdrawn
      "certifiedBuild": "5.50.1",
      "newest": "5.50.3",
      "candidateDate": "2026-07-27",
      "certifiedDate": "2026-08-02",    // support clock starts HERE (slip-tolerant)
      "supportEnds": "2027-02-02",      // extend-only
      "upgradeImpact": "none",
      "scorecard": "certifications/5.50.1.md"
    }
  }
}
```

- **Status transitions happen only via PR**, and the file is CODEOWNERS-gated to the certification owner (§8).
- Publish workflows may append *mechanical* fields (`newest`) via direct push; they never touch `status`/`certifiedBuild`/dates.
- Dates are **extend-only**: windows may lengthen, never shrink.

### 4.2 npm dist-tags — and the `latest` flip

From the first certification onward, **every "default" surface resolves to certified bits**:

| Tag | Points at | Moved by |
|---|---|---|
| `latest` | Newest patch of the newest **certified** line | Certification (atomic 233-package move via `ci/dist-tag-all.mjs`), and line publishes when their line is the newest certified |
| `edge` | Newest Edge release | `publish.yml` (routine publishes gain `--tag edge`) |
| `lts-6.4` | Newest patch of that line | `publish-lts.yml` on every line release |

**Why `edge` and not `next`:** the repo's `next` branch is the trunk everyone PRs into, while what actually publishes is built from `main` after the release PR. An npm tag named `next` would imply "builds of the `next` branch" and confuse maintainers and collaborators. `current` was rejected because it collides with "the current certified build" in support language. `edge` is unambiguous, has ecosystem precedent, and reads correctly as "ahead of stable."

Rules:

- **No publish anywhere omits its explicit `--tag`** after the flip (routine = `edge`, line = `lts-x.y`). On npm ≤ 10, a bare publish of an older version silently drags `latest` backward across every package published — with 233 packages that is a catastrophic footgun. npm 11 fixed the default; we still never rely on it. Post-publish `dist-tag ls` assertions on a sample; one-time drill against a scratch scope before cycle #1's flip.
- The flip itself is a **one-time comms event** (Vue and Express both did exactly this, with dedicated posts — see Appendix A.3). Nothing changes until the first certification.
- Edge-case: a brand-new package's first publish under `--tag edge` needs explicit `latest` handling (npm gives a first publish only the tag passed). Pre-publish validation currently blocks first-time packages anyway; §15 item 3 covers it.
- **EOL:** `npm deprecate @memberjunction/*@">=5.50.0 <5.51.0" "…EOL — see upgrade guide"`, scripted across the set, plus `eol` status in `release-lines.json`.

### 4.3 GitHub Releases & Docker

- Routine Edge releases publish with `make_latest: false`; certification sets the certified build as the repo's **latest release**. Existing CLIs' "newest stable" auto-pick then lands on certified bits with zero CLI code changes — enforcement precedes the CLI work.
- Certified releases carry "(LTS)" in the title and link their scorecard.
- Docker: `:latest` follows certified (consistent with the flip); `:edge` for the fast channel; per-line tags (`:6.4`).

## 5. The Two Cycle Shapes

### 5.1 The LTS bootstrap cycle (cycle #1 — only)

The candidate is the tip of `next`; cert fixes merge to `next`; each patch build is a normal release. This works because a **merge freeze** is in effect (already running, ends when 6.x opens Aug 3). **The freeze does not recur.** Details and dates in §14.

### 5.2 Regular cycles (cycle #2 onward — `next` never stops)

1. **Candidacy = branch cut.** `lts/6.4` is cut from the candidate's tag; `next` takes the empty-minor changeset (§3); Edge flows at full speed throughout.
2. **Fixes land on `next` first**, then reach the line by label: `backport lts/6.4` on the merged PR → [korthout/backport-action](https://github.com/korthout/backport-action) opens the cherry-pick PR automatically (conflicts become a draft PR a human finishes). The only exception to next-first: fixes for code that no longer exists on the dev line.
3. **Line releases** ship from a parameterized `publish-lts.yml`: `changeset publish --tag lts-6.4`, git tag `v6.4.N`, GitHub Release (`make_latest` only if newest certified). Line publishes never merge back to `next`.
4. **Line guard:** on `lts/*` branches CI enforces **patch-only** — any bump ≥ minor fails; any `migrations/` diff fails unless the PR carries the `security-exception` label (§12). Note: on lines, the Edge rule "migration ⇒ minor" is *replaced* by this guard — a security-exception migration ships as a **patch**, because the line's minor is frozen and Edge already owns the next minor.

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

**Hotfix mini-certification:** a P0 patch to a certified line re-runs the automated gates (1–3) before the patched build inherits the LTS label. No human cert week — but never a silent inherit.

## 7. RACI

R = does the work · A = accountable/sole approver · C = consulted · I = informed.
**UNKNOWN entries are deliberate** — they must be named before the bootstrap candidate cut (~Jul 27), and are the top of §17.

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
| Cycle comms (Appendix A) | Craig | Craig | Robert Kihm | Core team / All Companies |
| MJC catalog additions | MJC operators | MJC team | Craig | — |
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

Assume: line **6.4 LTS** is the newest certified (`latest` → 6.4.2), Edge is at 6.7.x, and a regular cycle for candidate **6.9.0** is underway on branch `lts/6.9`.

1. **Routine feature merge during certification.** A contributor merges a feature to `next` as always. It ships on Edge (6.8.0, `--tag edge`). The 6.9 candidate is untouched (its branch was cut already). Nothing to do — this is the whole point of regular cycles: `next` never stops.
2. **Cert testing finds a bug in candidate 6.9.0.** Fix PR → `next` (lands in Edge first, per next-first). On merge, apply `backport lts/6.9` → the action opens a cherry-pick PR against `lts/6.9` → merge → `publish-lts.yml` ships **6.9.1** under `lts-6.9` → gates re-run on 6.9.1. Certification, when granted, names 6.9.1.
3. **P0 hotfix on certified 6.4 between cycles.** Fix → `next` → `backport lts/6.4` → **6.4.3** ships from the line. Automated gates (1–3) re-run before 6.4.3 inherits the label; since 6.4 is the newest certified line, `latest` moves to 6.4.3.
4. **Security fix needing a schema change on a certified line.** Additive-only migration lands on `next` first (Edge takes it as a minor, per the standing rule). Backport is **byte-identical** — same Flyway version string and content — with the `security-exception` label, which is the only thing that lets the line guard pass a `migrations/` diff. On the line it ships as a **patch** (6.4.4): the line's minor is frozen and the guard replaces the migration-⇒-minor rule. DBs that applied it on the line and later upgrade to Edge skip it cleanly (same version string).
5. **Cherry-pick conflict.** The action opens a **draft PR** with the first conflict committed plus resolution instructions; a human finishes it. The original PR gets a comment either way — no silent failures.
6. **A contributor asks "do I need to do anything for LTS?"** Default: no. Backporting is opt-in by label; the certification owner also runs a weekly sweep to catch fixes that *should* have been labeled (`backport-declined` records the considered-and-rejected ones).
7. **Certification slips past the next cut date.** 6.9 isn't certified when the late-Nov cut comes due → the cut waits. 6.4's windows extend automatically (they're defined by supersession). Slipping is a schedule event; certifying weak is a credibility event.
8. **A candidate fails outright** (regression scale beyond patching). Status → `withdrawn` in `release-lines.json`; no label ever applied; the branch is retired; the next cycle proceeds on schedule with a fresh candidate. Cheap failure is a feature of candidate-is-a-normal-build.
9. **An installation upgrades LTS → LTS** (5.50.x → 6.4.x, skipping Edge). `mj bump` to 6.4.x; migrations apply in order, including the 6.x baseline; if the old line had a security-exception migration, `mj migrate`'s upgrade mode handles the out-of-order case (§12, §15 item 8). The CLI warns if the path crosses an `upgradeImpact: breaking` entry.
10. **A breaking change is needed on Edge.** Rare and deliberate: if era-scale, it's a major (7.x era, own baseline, own comms). Otherwise it ships in a minor with `upgradeImpact: breaking` on its release entry — badged in notes, warned on upgrade paths. It reaches LTS users only when a future line certifies past it, with the flag intact.
11. **Bootstrap-cycle special case.** During the freeze there is no line branch: cert fixes merge straight to `next` and the next release *is* the new candidate patch. A cert fix carrying a migration advances the candidate a minor (e.g. 5.50.0 → 5.51.0) under the standing Edge rule — fine, the line freezes at whatever version certifies.

## 11. Contributor Impact (what actually changes for the Core team)

- Day-to-day: **nothing changes.** PRs → `next`, changesets as usual, Edge ships as fast as ever (after the bootstrap freeze ends Aug 3, permanently).
- New labels exist: `backport lts/<line>` (opt-in backporting), `cert-blocker` (jumps every queue during a cycle), `security-exception`, `backport-declined`.
- During a regular cycle, the only team-wide effect is that `cert-blocker` fixes take priority. No freezes.
- Educating the team on this process is part of the process: the bootstrap cycle is announced with Appendix A.1, and Craig trains delegates on the human gates during cycles 2–3.

## 12. Migrations & CodeGen Policy

- **During candidacy:** migrations allowed; the standing guard advances the candidate's version. Certification freezes whatever version passed.
- **After certification:** **zero schema migrations** in line patches — that's what makes an LTS patch genuinely low-risk (no CodeGen churn, no DB touch). One exception: security fixes requiring schema change — additive-only (Publish-No-Break policy), next-first, byte-identical backport (same Flyway version string + content), `security-exception` label, ships as a line patch (worked example 4).
- **Metadata seeds** (AI models/vendors/pricing): additive metadata-only updates **are** patch-eligible — data, not schema.
- **Punch list dependencies:** `mj migrate` out-of-order upgrade mode + an LTS→Edge upgrade test rig in the integration suite; the identical-version-string rule must hold across per-era migration folders after the 5→6 split.

## 13. Enforcement Surfaces

### 13.1 MJ CLI

- **Default = newest certified** via `release-lines.json` (+ the GH latest-release flag for older CLIs). The picker groups by channel with status + dates.
- **Edge is explicit opt-in:** `--channel edge` per command, or `releaseChannel: 'edge'` in `mj.config.cjs` — deliberately a committed, review-visible file, so a project's opt-out is a team decision, not a forgotten personal flag. Interactive non-LTS selections get one confirm prompt; non-interactive runs simply require the explicit flag.
- **Status awareness:** `mj versions` prints the support table; version-touching commands warn on maintenance (gentle) / EOL (loud) lines and on upgrade paths crossing `upgradeImpact: breaking`. Never blocking.

### 13.2 MJC — LTS-only

- **MJC's catalog contains certified builds only.** Adding versions is a manual operator task today; the policy is simply that only certified builds enter the catalog. No non-LTS option means no sign-off flow needed — "never production on non-LTS" holds for MJC-hosted systems **by construction**.
- `release-lines.json` gives MJC a machine-readable feed for future automation: auto-ingesting each newly certified release and flagging maintenance/EOL lines in its UI.
- Custom-repo users control their own code and can move to any build outside MJC when genuinely needed, coordinated case-by-case. MJC doesn't model that.

## 14. Cycle #1 — the LTS Bootstrap Cycle

**The biggest immediate threat is the runway:** under two weeks, minus the days it takes to land this process itself. Two structural mitigations: the process-doc week is planned as real work (below), and **the hackathon is not a certification deadline** — Aug 3 is hard for *opening 6.x*. If gates aren't honestly green by Aug 2, the split happens anyway: 6.x opens, the freeze ends permanently, the 5.x line branch carries the candidate, and certification completes there days later with remaining fixes backported. Windows measure from actual certification.

| When | What |
|---|---|
| **Jul 20–24** | This process doc + exec blessing + cadence decision (§9.1) · team freeze work: core-functionality sweep (navigation, search, views, performance), known-defect backlog (Johanna Snider's list → GitHub issue, assigned Craig), integration-suite expansion · punch items 1–3 (§15) · gate-3 pass criteria + delegated-execution dry run (Caeleb) · **name the UNKNOWNs in §7** · comms A.1 goes out |
| **~Jul 27** | Candidate cut (5.50.x era) + gate-checklist tracking issue · comms A.2 |
| **Jul 27 – Aug 2** | Full gate run (§6) · patch loop on `next` (freeze model) |
| **Aug 2** (or when gates pass) | Certification sign-off → label, scorecard, `latest` flip, GH latest flag · comms A.3 to MJ Dev (All Companies) |
| **Aug 3 — hackathon** | 6.x opens regardless (split tooling) · freeze ends permanently · 5.x line branch + backport machinery live |

**Freeze merge rules (bootstrap only):** cert-blocker fixes and quality/test/docs PRs merge; feature and refactor PRs queue until 6.x opens. Cycle #1 additionally carries the **baseline mandate**: certification testing catches things that worked and then broke; it won't catch things that never worked well. The sweep above means the first label reflects the baseline actually being held to the bar, not grandfathered past it.

## 15. Tooling Punch List & Delivery Plan

Ordered so that **items 1–3 are enough to label and enforce** the first LTS; they are genuinely small (a JSON file, a CODEOWNERS line, a workflow flag, one script — a focused PR).

| # | Item | When | Where |
|---|---|---|---|
| 1 | `release-lines.json` + schema + CODEOWNERS entry + the status-fields CI check (§8) | Before Jul 27 | This branch |
| 2 | `publish.yml`: `make_latest: false` on routine releases; cert flow sets certified build as GH latest; `--tag edge` on routine npm publishes | Before Jul 27 | This branch |
| 3 | `ci/dist-tag-all.mjs` — atomic 233-package tag moves + post-move assertions (+ scratch-scope drill; new-package first-publish edge case) | Before Aug 2 (needed for the flip) | This branch |
| 4 | Era-split tooling: expected-version guard, changesets major flow, v6 migration baseline (`/create-new-baseline-migration`), docker tags, stale-comment cleanup | Aug 3 (hackathon) | Follow-up PR |
| 5 | `publish-lts.yml` + korthout/backport-action + labels + line patch-only guard | Aug 3+ (needed before first post-cert backport) | Follow-up PR |
| 6 | CLI: channel resolution, `mj versions`, maintenance/EOL/breaking warnings, `releaseChannel` config | Aug–Sep (GH-latest flag covers the default meanwhile) | Follow-up PR |
| 7 | MJC: LTS-only catalog policy (now, operational) · `release-lines.json` auto-ingest (later) | MJC team's schedule | **MJC repo — out of scope here** |
| 8 | `mj migrate` out-of-order upgrade mode + LTS→Edge upgrade test rig | Before cycle #2 | Follow-up PR |
| 9 | Root `VERSIONING.md` — the human/agent-facing distillation of this doc | After blessing | This branch |

**Delivery mechanics:** this document rides the `lts-process` feature branch. After exec blessing, items 1–3 (+9) land on the same branch so the doc and its enforcement merge together; items 4–8 follow as small focused PRs on the dates above. Item 7 belongs to the MJC team and repo.

## 16. Risks

1. **Process lands inside the runway** (top risk): mitigations are the relief valve (§14), punch-list ordering (1–3 suffice), and treating this doc as the week's primary deliverable.
2. **Label inflation:** one pressured certification and the label means nothing. Blocking authority is CODEOWNERS-mechanical; overrides are recorded escalations; cycle #1 sets the slip-beats-weak precedent.
3. **AI-suite reliability as a gate:** flaky gates either block spuriously or get ignored. The gate-3 pass criteria + rerun policy are load-bearing and land before cycle #1.
4. **Backport tax replaces the freeze tax from cycle #2:** cherry-pick volume hits the cert crew while `next` runs hot. Measured in cycles 2–3; primary input to the December review.
5. **Stage-env availability:** gate 5 has four UNKNOWN owners today. Unowned, the gate silently degrades. Naming them is a Jul-24 deliverable.
6. **dist-tag drift:** always `--tag`, assertions, npm 11 runners, scratch-scope drill.
7. **Flip-day confusion:** `latest` moving to certified will surprise Edge users; comms A.3 and `@edge` documentation land the same day.

## 17. Open Items

1. **Cadence** — §9.1, Amith's call. Everything else in §9.2 adjusts mechanically.
2. **Name the UNKNOWNs** (§7): build engineer; stage-env owners for CDP, Skip, Izzy, MJC; fresh-install crew. Due before Jul 27.
3. **Gate-6 minimum person-hours** — set after the bootstrap cycle calibrates what "enough hammering" costs.
4. **endoflife.date registration + public schedule page** — once cadence stabilizes (post-December review).

---

## Appendix A — Draft Communications

### A.1 To MJ Dev (Core) — process kickoff (send Jul 21–22)

> **Subject: LTS is happening — what changes for you (very little), and what happens next two weeks**
>
> Team — as discussed in the exec thread, MJ is introducing certified LTS releases. The short version for contributors:
>
> - **Now → Aug 3:** the quality freeze is in effect. Cert-blocker fixes, quality, test, and docs PRs merge; feature/refactor PRs queue. Point your energy at the core-functionality sweep and the defect backlog.
> - **~Jul 27:** we cut the first LTS candidate from the current line and run the full certification: AI regression suite, fresh installs, stage upgrades (CDP/Skip/Izzy/MJC), and structured human testing. Issues found get the `cert-blocker` label and jump every queue.
> - **Aug 3 (hackathon):** 6.x opens for new development and the freeze ends — permanently. Future certifications run on branches; `next` never freezes again.
> - **After that, your day-to-day is unchanged.** PRs → `next`, changesets as usual. One new habit: if your merged fix should also reach a certified line, add the `backport lts/<line>` label (there's also a weekly sweep, so nothing falls through silently).
>
> The full process doc is in `plans/lts-process.md` (PR #___). Craig owns certification sign-off; questions → Craig.

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

## Appendix B — Label & Branch Reference

| Thing | Convention |
|---|---|
| Line branch | `lts/6.4` (bootstrap era line: `lts/5.50`) |
| Backport request | Label `backport lts/6.4` on the merged `next` PR |
| Blocks certification | Label `cert-blocker` |
| Line-patch schema exception | Label `security-exception` (additive-only, next-first, byte-identical) |
| Considered, not backported | Label `backport-declined` |
| npm | `latest` = newest certified · `edge` = fast channel · `lts-6.4` = per-line |
| Docker | `:latest` = certified · `:edge` · `:6.4` |
| Scorecards | `certifications/<version>.md`, linked from the GitHub Release |
