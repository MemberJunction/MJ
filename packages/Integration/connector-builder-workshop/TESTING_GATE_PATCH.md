# Testing-gate patch — fold into the active floor-check rewrite (3 coupled code edits)

These three edits make the credential-free path subscribe to the SAME empirical bar as live — the fix for
"testing is lazy because there aren't creds." They are handed off as a patch (not applied here) because
floor-check.workflow.js is under an active same-region rewrite ("harden testing arc"); the edits are
coupled to that enforcement and should land atomically with it. The new `test-connector` skill + the
docs in this commit are the standalone half. Source of the applied edits: the parallel local working tree.

## Edit 1 — floor-check.workflow.js: remove the `mode==='live'` anti-vacuous EXEMPTION
The fail-open guard (the "#H20" block that fails a run leaving idempotency/ordering/capture UNMEASURED)
must bind **mock and live identically**. The credential-free mock is a PROGRAMMABLE vendor (deterministic
replay against a fresh DB) — it can measure idempotency (2nd-pass zero-growth), ordering
(firstSyncComplete), capture (overflow column), and rows-landed exactly as live. Only a real WRITE
round-trip + true rate behavior are credential-only.

- In the empirical-assertion guard, DELETE the `if (hybridE2E.mode === 'live') { … }` wrapper so the
  `unmeasured` check runs in EVERY mode. Update the failure detail to: *"hybrid-e2e (mode='<mode>') left N
  outcome assertion(s) UNMEASURED — an empirical gate that could not determine the outcome must NOT pass
  open, credential or not; the mock is a programmable vendor that CAN measure these."*
- ADD an anti-vacuous rows gate (any mode):
  ```js
  if (a.syncLandedRows !== true) {
      failures.push({ rule: 'e2e-landed-zero-rows', detail: `hybrid-e2e (mode='${hybridE2E.mode}') did not assert syncLandedRows=true — a sync that landed zero rows is a vacuous green, credential or not. The mock fixtures carry data; 0 rows means the sync is broken, not that the source is empty.` });
  }
  ```

## Edit 2 — hybrid-e2e.workflow.js: the MOCK path must COMPUTE the anti-vacuous assertions
The mock-mode agent prompt currently asserts only `applyAllRan/forwardCompleteness/idempotentZeroWork`.
Extend it to compute from DIRECT SQL Server rowcounts (it runs against a real fresh DB): `syncLandedRows`
(TRUE only if rowsProcessed>0 AND every selected object's landed rowcount>0 — a 0-row run is a BROKEN
sync, not an empty source; a single-object ApplyAll / stale prior-run count / referenceMode=true is a
FAIL), `firstSyncComplete`, `secondSyncGrew`, `captureEngaged`, and `deltaApplied` (create AND update AND
delete-tombstone each DB-verified independently). Require RICH AUTO-GENERATED fixtures (FK-connected
multi-object, multi-page hub, custom/overflow fields, soft-deletes, value-type variety) — never a thin
hand-authored 2-object stub. `status='pass'` only if applyAllRan AND forwardCompleteness AND
syncLandedRows AND idempotentZeroWork AND firstSyncComplete!==false AND secondSyncGrew!==true AND
captureEngaged!==false.

## Edit 3 — build-connector/SKILL.md: wire `/test-connector` as the terminal gate
Add a "Terminal gate — /test-connector (ALWAYS, creds or not)" subsection before the floor-check-verdict
gate: build-connector ALWAYS invokes the test-connector skill as its terminal behavioral gate (the
hybrid-e2e + floor-check enforce it), and it is independently invokable —
`/test-connector <vendor> --mode live --ad-hoc` — to re-prove a built connector when a credential arrives
later (no rebuild) or as a regression check. (Already added in this commit's build-connector edit if that
file was non-contested; otherwise apply here.)

## Why coupled
Edit 1 is the gate; Edit 2 makes the gate satisfiable on the mock path; Edit 3 routes every build through
it. Applying Edit 1 without Edit 2 fails every current mock build (the assertions aren't produced yet) —
land them together.
