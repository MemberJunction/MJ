# EXECUTION KICKOFF — the exact resume checklist (PREPARED; NOT RUNNING)

**State: all documents ready; execution intentionally paused by user decision (2026-07-16).**
Everything below starts on a word. Nothing is committed to git yet — all work is staged in
the `MJ-worktrees/ps-component-framework` worktree.

## Document map (what exists, where)

| Document | Role |
|---|---|
| `PLAN.md` | The design of record (5 docs + 7 addenda; A7.6 = twin map) |
| `BUILD_ROADMAP.md` | The ordered do-list with the done/remaining ledger |
| `EXECUTION_KICKOFF.md` | This file — the resume checklist |
| `study/sheet-template.md` + 3 gold sheets | The U1 packet (awaiting freeze) |
| `study/fanout-plan.md` | The 16-batch roster + producer/reviewer briefs + U2/U3/U4 definitions |
| `phase0/realdata/memos/REALDATA_VERDICT.md` | Track-A evidence |
| `trackb/TRACKB_REPORT.md` | Track-B + reconciliation evidence |

## Already BUILT and green (don't redo)
Migration + codegen on `MJ_MCF_Fresh` · Core lockstep (tasks/port-types/composite-schema,
49/49) · catalog slice (23 port types, 10 components, 3 adapters; zero orphans) ·
`MLComponentEngine` (compiles, exported) · target-optional sidecar contract (TS+Pydantic,
both paths verified) · cascade-spike + reconciliation integration tests (green) ·
Engine 311/311.

## The gates in order (all user-owned)

1. **U1 — freeze the spec-sheet template** → unlocks the 16-family fan-out
   (`study/fanout-plan.md` runs as written).
2. **U2 / U3 / U4** — vocabulary → partition → placements (definitions in fanout-plan).
3. **Git hygiene decision** — when to commit the staged work (suggested: one commit for
   Doc-1 code+metadata+tests, one for the study docs; per repo rules commits happen only
   on your explicit ask).
4. **Handshake A** — send the team/Arie packet: `REALDATA_VERDICT.md` +
   `~/Downloads/PS-Phase0-Validation-Report.pdf`.
5. **Handshake B** — Sonar-collaborator work-split; the 4 frozen contracts are ready
   (sidecar train/predict incl. target-optional; port vocabulary ×23; Task union ×10;
   composite GraphSpec + validator).

## Resume sequences (copy-paste intent, no thinking needed)

**On "freeze it" (U1):**
- Study: run `study/fanout-plan.md` — 16 producer + 16 reviewer agent batches →
  reconciliation → U2 packet.
- Engineering (parallel): TestBench package scaffold (`scripts/scaffold-tests.mjs`),
  `MJMLComponentEntityServer.server.ts` (ValidateAsync → validateCompositeSpec;
  membership projection on Save), sidecar `/health` runnable-component reporting.

**On "commit":** stage per the two-commit split above; branch stays
`agentic/connector-builder-v2`?? — NO: cut `feat/ps-mcf-doc1` from the worktree HEAD
first (same-name remote tracking per repo rules).

**On "send the packet":** attach the two evidence files; the one-paragraph cover is the
last section of `REALDATA_VERDICT.md`.

## Standing constraints (unchanged)
Fresh-DB-only codegen · advancedGeneration off while keyless · no `any` types ·
metadata via mj-sync never SQL INSERTs · commits only on explicit ask · Track-A
throwaway code never graduates (twins are specs, ports are rewrites).
