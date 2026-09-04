# Release Engineering Runbook

Operator manual for MJ releases. Audience: whoever is running the release — the release
engineer for routine Edge releases, the certification owner for cuts, line builds, and flips.

- Policy (the *why* and the rules): [`plans/lts-process.md`](../plans/lts-process.md) — canon.
- Concepts for everyone else: [`VERSIONING.md`](../VERSIONING.md).
- Machine-readable release state: [`release-lines.json`](../release-lines.json).

There are four distinct operations. Know which one you're doing before you start:

| Operation | Frequency | Who | Automation today |
|---|---|---|---|
| 1. Routine Edge release | on demand | Release engineer | Reviewed PR: `release/*` prep branch → `main` |
| 2. LTS candidate cut | per cycle (~bimonthly) | Cert owner | Scripted-manual |
| 3. LTS line patch release | as fixes land on a line | Cert owner | **One button** (`Publish LTS line release` workflow) |
| 4. Certification flip | once per certification | Cert owner | Scripted-manual |

---

## 1. Routine Edge release

**A reviewed PR from a `release/*` prep branch into `main`.** There is no button, and that
is deliberate — see *Why there is no button* below.

1. Cut `release/vX.Y-prep` from the `next` commit you intend to release, and push it with
   same-named remote tracking.
2. Run [`DEPLOYMENT.md`](../DEPLOYMENT.md) Steps 0–8 **on that branch**. Every release has
   prep: the AI-model PR, a metadata-sync migration, PG counterparts, npm placeholders for
   new packages, the integration suite.
3. Open a PR `release/vX.Y-prep → main` and merge it once checks pass.

```
next ──●──────────────────────────●────────────►   keeps moving throughout
       │ cut here                  ▲
       └── release/vX.Y-prep ──────┼──► PR → main ──► publish.yml
                 (Steps 2–8)       └────────── back-merge main → next
```

**`next` is never frozen and nobody stops merging.** Prep runs for hours; because the branch
was cut at a known commit, whatever lands on `next` afterwards rides the *next* release.
**The branch is the pin** — there is no separate pinning mechanism to remember.

The push to `main` triggers `publish.yml`, which does everything else — this has always
been the automatic half: `changeset version` (pre mode → the next `X.Y.0-edge.N`), the
version-grammar guard, build, `changeset publish --tag edge`, the release commit +
`vX.Y.0-edge.N` tag, a GitHub prerelease (never latest), and the merge of `main` back
into `next` with a lockfile update.

Verify afterwards: `npm view @memberjunction/core dist-tags` — **`edge` moved,
`latest` did not**; the GitHub Release exists, marked prerelease, not latest.

**Then write the canonical release notes** — the one piece of a release no workflow
produces. Run `/notes` to generate [`releases/v<version>.md`](../releases/) and PR it into
`next` ([`DEPLOYMENT.md`](../DEPLOYMENT.md) Step 11). It goes *after* publish because the
filename carries the version `changeset version` just computed. Nothing fails if you skip
it; the release simply has no notes anyone reads. During the Edge era the file is committed
but does not render publicly — `docs.yml` builds `lts/5`, not `main` — so write it for the
record and expect it to appear when versioned docs land.

Guard behavior you may hit: `publish.yml` **hard-fails an unsuffixed 6.x version** on this
path. That is the era gate doing its job — a plain version (a candidate) must never ship
through the routine pipeline. Stop and find the cert owner; don't work around it.

Never run `changeset pre enter` or `changeset pre exit` in this operation. Pre-mode state
changes only during era opens and candidate cuts (operation 2).

### Why there is no button

There was one — `release-edge.yml`, built 2026-08-03, which merged `next → main` on a
guarded manual dispatch. It was deleted without ever having been dispatched, because the
workflow it encoded cannot be correct:

- **Every release needs prep.** There is no prep-free Edge release, so a button that ships
  the tip of `next` always ships something whose Steps 0–8 were never run. Its guards
  checked CI only, and CI going green says nothing about whether a metadata-sync migration
  was generated.
- **Prep must be reviewed.** A metadata-sync migration is permanent, append-only history.
  The PR into `main` is the review instrument for it; a button bypasses review entirely.

Pointing the button at a prep branch would fix the first problem and make the second worse.
Merging a reviewed PR is already a single click, and `publish.yml` does everything after
the push — so there was nothing left for a button to add.

The LTS line release (operation 3) remains a button and is unaffected: line patches ship
backported fixes that were already reviewed on `next`.

---

## 2. LTS candidate cut (the pre-exit dance)

Trigger: the cert owner declares the stream ready — "current `6.1.0-edge.N` is our candidate."
The cut happens at the **tip of `next`**. It takes minutes and freezes nothing.

Worked example — cutting line 6.1 while `next` streams `6.1.0-edge.12`:

1. **Announce** the cut moment (a courtesy, not a freeze; merges after it simply ride the
   next stream).
2. On up-to-date `next`: `npx changeset pre exit` → commit.
3. `npx changeset version` — accumulated changesets resolve; the repo versions to plain
   **`6.1.0`**. `pnpm install`, commit `pnpm-lock.yaml`.
4. Push to `next`; tag the version commit **`v6.1.0`** and push the tag.
5. **Branch `lts/6.1` from that tag** and push the branch. This is the candidate's home.
6. **Publish 6.1.0 from the line branch** (operation 3's mechanics) — npm tag **`lts-6.1`**,
   GitHub Release with `make_latest: false`. It must NOT go through `next → main`; the era
   gate will (correctly) refuse it there.
7. Back on `next`, immediately: `npx changeset pre enter edge` + commit, then seed the next
   stream with a minor changeset ("open the 6.2 stream"). The next routine release is
   `6.2.0-edge.0`.
8. Open the certification tracking issue; gates run against 6.1.0 **on `lts/6.1`**.
9. Cert fixes: land on `next` first → label `backport lts/6.1` → bot cherry-picks → line
   patch builds (6.1.1, 6.1.2, …). Certification names whichever build passes.

Pinning an *older* edge build instead of the tip is possible (branch at that exact commit,
run steps 2–3 on the branch) but leaves `next`'s stream tuple stale — it then needs its own
exit/version/re-enter dance. Avoid; cut the tip.

---

## 3. LTS line patch release

One button, but read the inputs before you press it: the workflow is **`publish.yml`**, and
you dispatch it **from `next`** — not from the line. Actions → **"Build and publish new
package versions"** → leave the branch selector on `next` → set `line_branch` to the line
(`lts/5`, `lts/6.1`, …) → type the same value into `confirm_branch` → Run workflow. The job
checks out the line branch itself.

There is no `publish-lts.yml`. It was retired because npm trusted publishing (OIDC) is scoped
per package to the workflow **filename** `publish.yml`; a second publishing file would mean a
second trusted publisher entered by hand on ~300 packages. The line is a **parameter rather
than the ref** for a second reason: the maintained copy of the workflow always runs, so a
release can never execute stale workflow code that was never backported to the line. Picking
an `lts/*` ref in the dialog cannot silently do the wrong thing either — that ref's
`publish.yml` has no `line_branch` input, so GitHub rejects the dispatch outright.

The workflow automates the verified manual sequence: `changeset version` (normal mode —
backported changesets resolve to a patch, or a minor pre-certification in the bootstrap
era) → lockfile refresh → build → `changeset publish --tag lts-<line>` (tag derived from
`line_branch`) → push the release commit + git tag to the line branch → GitHub Release
with `make_latest: false`. It refuses pre-mode leakage, empty changesets, and
prerelease-shaped versions, and asserts afterward that npm `latest` did not move.

**Manual fallback** (if Actions is unavailable — this sequence is dry-check-verified,
process doc §14.1): fresh checkout of the line branch → `npm ci` → `npx changeset version`
→ `npm install` + commit `package-lock.json` → build → `npx changeset publish --tag lts-5`
→ push the version commit and tags to the line branch. (That is `lts/5`'s sequence — the
last npm-era line. On 6.x-era lines the same steps run under pnpm: `pnpm install
--frozen-lockfile`, `pnpm install`, commit `pnpm-lock.yaml`. The workflow auto-detects
the package manager per branch; match it when working by hand.)

Hard rules, either path: line publishes never merge to `main` or back to `next`; `latest`
never moves here; GitHub Releases from a line stay `make_latest: false` until the line is
the newest certified. **Dispatch from `next` and name the line in `line_branch`; never
dispatch from the line ref itself.**

That rule reads the same as the old one but for a different reason, so it is worth stating
plainly: the 2026-08-01 dry-check found the *then-current* `publish.yml` unsafe to dispatch
from a line, because its publish step ran a bare `changeset publish` (no `--tag`, so a line
build would have landed on `latest`) and its `main`-gated steps silently skipped. The
dedicated `publish-lts` job and the dispatch guard fixed exactly that. What survives is the
ref discipline: dispatch the maintained copy, not whatever the line happens to carry.

DB-touching line changes need their §12 label (`metadata-migration`, `codegen-repair`, or
`security-exception`). The line guard that is supposed to enforce this on `lts/*` PRs is
**not built yet** (process doc §15 item 6), so today the label is a review convention and
the human reading the migration diff is the only control. Do not treat a green line PR as
evidence that the labels were checked.

**Release notes for a line release do go live** — this is the one operation where they do,
because the docs site builds the certified line. But they have to *reach* the line branch:
PR `releases/v<version>.md` into `next`, then apply the `backport lts/<line>` label. Notes
that stop at `next` publish nothing.

---

## 4. Certification flip

When the gates pass on a specific line build (say 6.1.2):

1. Update [`release-lines.json`](../release-lines.json): the line becomes `certified`,
   `certifiedBuild: "6.1.2"`; the superseded line moves to its grace state. This PR is the
   sign-off instrument — CODEOWNERS routes it to the cert owner.
2. From a checkout of the certified tag (`v6.1.2`), run `ci/dist-tag-all.mjs` to move npm's
   **`latest`** across all packages, with its post-move assertions.
3. Mark the GitHub Release for 6.1.2 as latest.
4. Commit the scorecard: `certifications/6.1.2.md`, linked from the release.
5. Comms: certification announcement (process doc, Appendix A.3 template).

---

## Safety rails (all operations)

- `latest` moves **only** in operation 4. No build ever publishes to it.
- Plain (unsuffixed) versions exist only at cuts and on lines. The era gate enforces this
  on the routine path; don't fight it.
- `changeset pre enter`/`exit` happen only in operation 2 (and era opens). Nowhere else.
- Lines never merge into `main` or `next`. Fixes flow `next` → line, never the reverse.
- The post-publish `main` → `next` back-merge **aborts rather than auto-resolving** a
  conflict outside `pnpm-lock.yaml`. An abort means the release succeeded and only the
  back-merge is outstanding — finish it by hand, don't re-run the release.
- A green `docs.yml` does **not** mean your docs change shipped. It checks out `lts/5` on
  every trigger but an explicit-`ref` dispatch, so a `main` push rebuilds the LTS site and
  reports success while ignoring the commit that triggered it.
- Every loop in this document is bounded by a human noticing. If a step's verification
  fails, stop — don't improvise past a red check.
