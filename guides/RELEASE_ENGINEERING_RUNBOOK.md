# Release Engineering Runbook

Operator manual for MJ releases. Audience: whoever is pushing the buttons — the release
engineer for routine Edge releases, the certification owner for cuts, line builds, and flips.

- Policy (the *why* and the rules): [`plans/lts-process.md`](../plans/lts-process.md) — canon.
- Concepts for everyone else: [`VERSIONING.md`](../VERSIONING.md).
- Machine-readable release state: [`release-lines.json`](../release-lines.json).

There are four distinct operations. Know which one you're doing before you start:

| Operation | Frequency | Who | Automation today |
|---|---|---|---|
| 1. Routine Edge release | ~weekly / on demand | Release engineer | Semi-automatic (publish is; versioning isn't) |
| 2. LTS candidate cut | per cycle (~bimonthly) | Cert owner | Scripted-manual |
| 3. LTS line patch release | as fixes land on a line | Cert owner | Manual (workflow planned) |
| 4. Certification flip | once per certification | Cert owner | Scripted-manual |

---

## 1. Routine Edge release

The pipeline is unchanged from the pre-LTS era; prerelease mode does the version arithmetic.

1. Confirm there are pending changesets on `next` (`ls .changeset/*.md` beyond README/config).
2. On up-to-date `next`: run `npx changeset version`. In pre mode this produces the next
   `-edge.N` version (config auto-commits the result).
3. Run `npm install` and commit `package-lock.json` — `changeset version` leaves it stale.
4. Push (or PR) the version commit to `next`, then open and merge the release PR
   `next → main`. The push to `main` triggers `publish.yml`, which builds and publishes.
5. Verify: `npm view @memberjunction/core dist-tags` — the **`edge`** tag moved to the new
   version and **`latest` did not move**. The GitHub Release exists and is not marked latest.

Guard behavior you may hit: `publish.yml` **hard-fails an unsuffixed 6.x version** on this
path. That is the era gate doing its job — a plain version (a candidate) must never ship
through the routine pipeline. Stop and find the cert owner; don't work around it.

Never run `changeset pre enter` or `changeset pre exit` in this operation. Pre-mode state
changes only during era opens and candidate cuts (operation 2).

### Proposed: scheduled + on-demand automation (not yet built)

Target state: Edge releases stop being a person's chore. A workflow that (a) runs on a weekly
schedule, and (b) can be dispatched on demand, doing: if pending changesets exist →
`changeset version` + lockfile refresh on `next` → open (or auto-merge) the `next → main`
release PR. Nothing else changes — publish stays exactly as it is. Options to decide:
weekly-plus-ad-hoc vs. nightly; auto-merge vs. human-merges-the-PR. Status: **proposal**,
needs an owner and a decision. Until then, the manual steps above are the procedure.

---

## 2. LTS candidate cut (the pre-exit dance)

Trigger: the cert owner declares the stream ready — "current `6.1.0-edge.N` is our candidate."
The cut happens at the **tip of `next`**. It takes minutes and freezes nothing.

Worked example — cutting line 6.1 while `next` streams `6.1.0-edge.12`:

1. **Announce** the cut moment (a courtesy, not a freeze; merges after it simply ride the
   next stream).
2. On up-to-date `next`: `npx changeset pre exit` → commit.
3. `npx changeset version` — accumulated changesets resolve; the repo versions to plain
   **`6.1.0`**. `npm install`, commit lockfile.
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

Until the parameterized `publish-lts.yml` exists (punch list), line builds are **manual, from
a clean checkout of the line branch** (`lts/5` today, `lts/6.1` later). Verified sequence
(process doc §14.1):

1. Fresh clone/worktree of the line branch; `npm ci`.
2. `npx changeset version` — backported changesets resolve to a patch (or, pre-certification
   in the bootstrap era only, a minor). Auto-commits.
3. `npm install`; commit `package-lock.json`.
4. Build.
5. `npx changeset publish --tag lts-5` (the line's npm tag — never `latest`).
6. Push the version commit and the git tags to the line branch.

Hard rules, either era: line publishes never merge to `main` or back to `next`; `latest`
never moves here; GitHub Releases from a line stay `make_latest: false` until the line is
the newest certified. **Do not `workflow_dispatch` the routine `publish.yml` from a line
branch** — dispatching was verified unsafe (dry-check 2026-08-01): its publish step would
land on `latest` and its main-gated steps silently skip.

DB-touching line changes need their §12 label (`metadata-migration`, `codegen-repair`, or
`security-exception`) — the line guard enforces this on `lts/*` PRs.

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
- Every loop in this document is bounded by a human noticing. If a step's verification
  fails, stop — don't improvise past a red check.
