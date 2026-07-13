# Predictive Studio e2e toolkit

Ad-hoc Playwright drivers for the **Predictive Studio** dashboard (Models in Production, the Operate
flow, the Training Pipelines builder). They complement the formal spec at
[`e2e/specs/predictive-studio.spec.ts`](../specs/predictive-studio.spec.ts) — these are quick,
runnable smoke/proof drivers, in the same spirit as [`e2e/overlay/`](../overlay/).

They share the signed-in persistent profile (`.playwright-cli/profile`) used by `e2e/fixtures.ts` and
the overlay drivers — prime it once with `node e2e/overlay/prime-auth.mjs`.

## Prereqs
- MJExplorer running (`:4201`) + MJAPI (`:4000`) + the Python sidecar reachable (the engine spawns it).
- A primed, signed-in profile.

## Files
| File | What it does |
|---|---|
| `operate-run.mjs` | Selects a published model → Operate → **Run now** → waits for the run → drills into the per-record predictions. Proves the full stack (browser → GraphQL → server → sidecar → run history) and asserts the predictions **vary** (the train/serve-skew guard — see below). |
| `nav-health.mjs` | Visits all 7 Predictive Studio nav items and asserts each panel loads with no non-cosmetic console errors. Fast "no broken surface" check. |

## Usage
```bash
# one-time (or when auth expires)
node e2e/overlay/prime-auth.mjs

# all 7 surfaces load clean?
node e2e/predictive-studio/nav-health.mjs

# real Operate "Run now" + per-record drill-in
node e2e/predictive-studio/operate-run.mjs
```

## Env
- `MJ_EXPLORER_URL` — base URL (default `http://localhost:4201`).
- `PW_HEADED=1` — run headed (default headless).
- `PW_PROFILE_DIR` — override the signed-in profile dir.

Screenshots land in `.playwright-cli/shots/` (gitignored).

## The skew guard
`operate-run.mjs` exists partly because it caught a real **train/serve skew**: a model scored every
record identically because a virtual/denormalized feature column was dropped at score time. The fix
(`FeatureAssemblyExecutor` re-reads absent feature columns from the entity view + hard-fails if still
missing) is covered by unit + integration tests; this driver is the UI-level confirmation that the
per-record predictions **vary**. Full write-up:
[`plans/predictive-studio-scoring-virtualfield-skew.md`](../../plans/predictive-studio-scoring-virtualfield-skew.md).
