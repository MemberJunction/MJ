# Conversations Phase 1 — Doc Map

> Last consolidated 2026-07-22. Everything not listed here lives in `archive/` and is history,
> not design of record.

## The design of record (start here)

1. **`hub-prototype/MJ Composed Shell - Functional Mockup.html`** — THE artifact. Fully
   functional, self-contained walkthrough of the composed shell (open in any browser; give it
   a few seconds to unpack). Target-state design: everything it shows is intended product
   (no FUTURE tags, per ⚖11). Carries its own changelog, reuse manifest, and placement
   accounts (state-map panel, bottom right). Reviewed + verified 2026-07-22.
   Editable source mirror: `hub-prototype/functional-mockup-src/`.
2. **`hub-prototype/CONTINUITY-LEDGER.md`** — the master completeness proof for the
   replacement: every shipped capability → one disposition (MOCKUP / MOUNT / CONTRACT /
   DELETE), the ⚖ open-decision list, and **§E** (design-of-record features awaiting backend
   backing). Implementation planning reads this first.
3. **`SHELL-DECISIONS.md`** — the shell decision log (D-S1..D-S9, P5 fold). Locked decisions
   reopen only on new evidence, as dated edits.
4. **`hub-prototype/FUNCTIONAL-MOCKUP-SCOPE.md`** — the ratified scope + fidelity rule
   (MOCKUP-SPEC vs MOUNT-POINT) + exit criteria the mockup was built and reviewed against.
5. **`IMPLEMENTATION-PLAN.md`** — the build plan: branch model, ADR-1 shell architecture,
   slice sequence S0–S8 with dependencies and decision gates, parallel schema track, risks.

## The parity instruments (what "no regressions" rests on)

- **`hub-prototype/BASELINE-INVENTORY.md`** — code-verified capability record of the shipped
  stack (§A/§B 2026-07-14; §C1–C5 the 2026-07-22 sweeps incl. the residual perimeter).
  Carries the drift-check maintenance rule.
- **`hub-prototype/PARITY-AUDIT.md`** — the analysis layer over the baseline.
- **`hub-prototype/CLAUDE-DESIGN-GAPLIST.md`** — the design worklist (see its 2026-07-22
  status sweep for what the mockup resolved).
- **`hub-prototype/DESIGN-NOTES.md`** — the 13 ratified positions (incl. reversed #13:
  user bubbles / agent rows) + the parity checklist.

## Process + orientation

- **`hub-prototype/COMPOSED-SHELL-GUIDE.md`** — reviewer's guide (A/B/C bridge table, frame
  taxonomy, reading rules). The v4 canvas (`hub-prototype/MJ Composed Shellv4.html`) is the
  FROZEN reference the guide describes; the functional mockup is the living artifact.
- **`hub-prototype/CLAUDE-DESIGN-HANDOFF.md`** — how to brief design sessions without
  undoing decisions.
- **`fresh-brief/BRIEF.md` / `SYSTEM-MODEL.md` / `FUNCTIONAL-CONTENTS.md`** — the design
  tenets (incl. THE PLACEMENT RULE), system model, and 84-item contents checklist.
- **`fresh-brief/PROMPT-functional-mockup-corrections.md`** — the most recent executed
  session contract.
- **`conversations-phase1-plan.md`** — the umbrella build plan mirrored on PR #2953
  (P1.1–P1.9, decision log D1–D20).
- **`EXECUTION.md` / `CONVERSATIONS-ATLAS.md`** — execution layer + app-wide functional
  inventory; partially predate the mockup era, read with this README as the corrective.

## Where things stand (2026-07-22)

Mockup built, correction-passed, dual-verified (code + browser), ACCEPTED. Next: post the
package to PR #2953, Amith agenda (⚖1 nesting, ⚖2 plan-mode re-lock, ⚖4 threads, D-S9 owner,
mega-migration prune), then Angular implementation per the ledger (§E gates what needs backend
first).
