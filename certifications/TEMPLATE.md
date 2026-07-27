# Certification Scorecard — MJ <version>

> Copy this file to `certifications/<version>.md` when a candidate is cut.
> Every gate produces evidence here. The `release-lines.json` PR that applies the
> LTS label links this scorecard, and the GitHub Release links it too.
> Process: plans/lts-process.md §6 (gates) and §8 (authority).

| Field | Value |
|---|---|
| Candidate | <version> (line <X.Y>) |
| Candidate cut | YYYY-MM-DD |
| Certified build | _(set at sign-off — may be a later patch than the candidate)_ |
| Certification owner | Craig Adam |
| Tracking issue | #___ |

## Gate results

| # | Gate | Owner | Result | Evidence |
|---|---|---|---|---|
| 1 | CI green (unit, build, UI checks, dependency check, peer-deps ≡ platform manifest, PG migration translation) | CI | ☐ pass / ☐ fail | link to runs |
| 2 | Deterministic integration tier (`npm run test:integration`) | CI / team | ☐ pass / ☐ fail | run output |
| 3 | AI Full UX Regression Suite | Caeleb (Craig accepts) | ☐ pass / ☐ fail | results packet |
| 4 | Fresh-install matrix (clean macOS + Windows; sample environments) | ___ | ☐ pass / ☐ fail | smoke checklist |
| 5 | Upgrade matrix (CDP / Skip / Izzy / MJC stage) | ___ / ___ / ___ / ___ | ☐ pass / ☐ fail | env owner reports |
| 6 | Human hammering (structured exploratory, core flows) | Craig + crew | ☐ pass / ☐ fail | session notes, hours logged |
| 7 | Zero open cert-blockers | process | ☐ pass / ☐ fail | label query link |
| 8 | Certification sign-off | Craig | ☐ signed | release-lines.json PR link |

## Findings

| Issue | Severity | Disposition |
|---|---|---|
| #___ | cert-blocker / recorded | fixed in <version> / recorded, does not block |

## Gate 3 rerun log

Flake policy: suspected flake → max 2 reruns, must pass clean twice consecutively.

| Run | Result | Notes |
|---|---|---|
| 1 | | |

## Sign-off

- [ ] All gates pass with evidence linked above
- [ ] `release-lines.json` PR opened (status → certified, certifiedBuild, certifiedDate, supportEnds, scorecard path)
- [ ] npm `latest` flip executed (`node ci/dist-tag-all.mjs --version <certified> --tag latest`) and verified
- [ ] GitHub Release for the certified build marked as latest (`gh release edit v<certified> --latest`)
- [ ] Comms sent (Appendix A.3 for the first certification; A.2-close otherwise)

Signed: ____________ Date: YYYY-MM-DD
