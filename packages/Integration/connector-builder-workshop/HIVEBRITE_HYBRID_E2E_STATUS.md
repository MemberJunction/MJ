# Hivebrite hybrid-e2e — honest status & handoff (2026-06-15, ~03:00)

**No false success. The hybrid e2e is NOT fully green.** Here is exactly what is proven, where it's
blocked, and what's needed — so the remaining work is a clean decision, not a re-discovery.

## PROVEN (credential-free)
- **Connector**: `packages/Integration/connectors/src/HivebriteConnector.ts` (680 lines) — compiles,
  `@RegisterClass`-registered, **131/131 catalog accounted** (97 IOs + 34 skipped-with-reason),
  ladder **T0/T1/T2 green**. (T3 was a harness bug — fixed, see below.)
- **Full-matrix mock fixtures** authored: `packages/Integration/connectors/test/fixtures/hivebrite/fixtures/fixtures.json`
  — 4 Goldilocks objects, OAuth token route, custom undeclared fields (overflow capture), 1 DeltaPass
  (create 5003 / update 5001 / delete 5002), one watermark stream.
- **Framework fixes made this session** (all real, durable):
  1. Extractor **additive amendment** + emit-or-skip enumeration (`.claude/agents/ioiof-extractor.md`)
     + primitive dual-derive gap routing — fixed the under-enumeration + 69→6 amendment-collapse.
  2. **T3 seed harness bug** (`packages/MCP/mj-test-runner/dist/tiers/t3DocSelfCheck.js`): pass
     `connector` to `spawnChildRunner` so `MJ_TIER_METADATA_FILE` is set → cache seeded → Declared
     connectors stop false-failing T3. (Durable src fix belongs on `agentic/connector-builder`.)
  3. **hybrid-e2e bring-up arc gaps** (`primitives/hybrid-e2e.workflow.js`): added the missing
     **`mj sync push`** + **full `mj codegen`-before-launch** steps in canonical order
     (A baseline → B full codegen → C build → D sync push → E launch).

## ENV PROGRESS (this session got MJAPI to *nearly* boot)
Fresh `MJ_HIVEBRITE` (sql-gz:1447) baselined clean (344 base entities, 0 connector entities) →
**full `mj codegen` now runs clean** (after reverting broken in-flight bootstrap manifests +
`DB_TRUST_SERVER_CERTIFICATE=1` not `Y`) → build → MJAPI launch reached **344 entities loaded, RSU DDL
provider + in-process CodeGen runner initialized, CustomColumnPromoter hook registered, all engines up**
— then crashed in GraphQL schema assembly.

## THE WALL (honest): shared-tree concurrency / generated-file pollution — NOT a Hivebrite defect
MJAPI loads `packages/MJAPI/src/generated/generated.ts`. Observed: it was **20 lines (empty) right after
codegen**, then **884 lines with 94 connector refs after `turbo build`** — i.e. the build step
**re-pollutes** `generated.ts` from the in-flight working-tree state (the parallel SF/iMIS/etc. connector
builds continuously write broken/typeless entities into the shared generated files, e.g.
`NoExplicitType: 'CountryCode' of 'imisCountry_'`). MJServer `generated.ts` regenerated **clean** (0
broken connector classes), but MJAPI's own generated.ts is the polluted one. There is **no stable clean
state** for MJAPI to boot from while concurrent builds share this working tree, and each fix is undone.

Successive layers hit (each a real, now-fixed gap): propfuel-codegen → stale-flyway → reverted-bootstrap-
manifests → sync-push-missing → full-codegen-missing → **build-re-pollutes-generated.ts (current wall)**.

## WHAT'S NEEDED (an environment decision — yours)
1. **Dedicated worktree isolation** (clean, the right answer): a git worktree off the **committed tip**
   has consistent, un-polluted generated dirs (HEAD is codegen-at-deploy + manifests clean) and no
   concurrent builds touching it. Cost: its own `npm install`. Then: fresh DB → full codegen → build →
   sync push → MJAPI boots → connector-e2e. The hybrid-e2e primitive runs from the session cwd, so this
   needs running the bring-up FROM the worktree (or teaching the primitive a worktree path).
2. **OR pause the parallel SF/iMIS builds + clean the shared generated tree**, then run in-place.
3. Either way, the per-connector hybrid-e2e fundamentally needs **generated-tree isolation** from
   concurrent connector builds — this is the #1 agent-arc gap (see AGENT_FRAMEWORK_IMPROVEMENTS.md §4/§5).

## LIVE CREDS
Unreachable for Hivebrite: enterprise/sales-gated, no self-serve, no creds in the broker, no `hivebrite`
plan. The credential-free full-lifecycle mock hybrid is the deepest achievable proof — and it's blocked
only by the shared-tree wall above, not by anything Hivebrite-specific.

## FEATURE IDEA (operator)
`mj sync push` should optionally **batch-sync DATA rows** to entities (not just metadata) — a lifecycle
enhancement for seeding/e2e. Captured in AGENT_FRAMEWORK_IMPROVEMENTS.md.

## STATE LEFT
- 34 set-aside connector migrations **restored**; MJAPI processes **killed**; `MJ_HIVEBRITE` left
  baselined (reusable). Generated files are churned (codegen + reverts) but fully regenerable.
- DB password for sql-gz local container is in its docker env (dev container).
