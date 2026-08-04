# Remote MJ — Mode B Reference

Target profile for driving the **canonical MJ Explorer Regression Suite** (the
25 tests baked into the MJ monorepo) against a **remote MJ Explorer
deployment** — staging, customer, production. No app code lives here; this
example is purely a target-profile + archive-config recipe.

## When to use this

You have a deployed MJ Explorer instance (not the local docker stack) and want
to run the same regression coverage against it that the MJ team runs against
`next`. Use cases:

- Nightly health-check of a staging deployment.
- Pre-release smoke test of a customer instance.
- Validating a behavioral fix landed on production after a hotfix.

If you need to test a **non-MJ app**, see [`../generic-web/`](../generic-web/)
or [`../bring-your-own-app/`](../bring-your-own-app/) instead.

## Layout

```
remote-mj/
├── README.md                       # this file
└── target.json                     # target profile (kind: mj-explorer)
```

No tests/, no oracles/, no metadata/ — this example reuses the canonical MJ
suite that ships in `metadata/test-suites/.regression-suite.json` and the 25
test JSONs in `metadata/tests/regression/`.

## Running it (inside the MJ monorepo)

```bash
# 1. Copy + edit the target profile
cp docker/regression/examples/remote-mj/target.json docker/regression/targets/staging.target.json
# Edit URL, allowedDomains, env: refs to match your deployment

# 2. Export the credentials referenced via env:
export REMOTE_MJ_TEST_USER=qa@example.com
export REMOTE_MJ_TEST_PASSWORD=...

# 3. Run
mj test regression remote --target=staging
```

Behind the scenes:

1. The CLI loads `staging.target.json`, resolves `env:` refs, and exports
   `MJ_TEST_VAR_baseUrl`, `MJ_TEST_VAR_allowedDomains`, `MJ_TEST_VAR_authUsername`,
   `MJ_TEST_VAR_authPassword`, etc.
2. Compose brings up the **full** profile so the runner has the local
   ephemeral DB for result recording (MJExplorer + MJAPI also boot but are
   unused — the runner targets the remote URL instead).
3. The runner pushes test metadata to the ephemeral DB, then invokes
   `mj test suite --name "MJ Explorer Regression Suite"`.
4. Reports land in `docker/regression/test-results/run-{TIMESTAMP}/`.
5. If the `ARCHIVE_DB_*` env vars are set, the suite run + children are
   pulled to a JSON folder and pushed to the destination MJ via `mj sync`.

## ⚠️ Prerequisite — variable substitution

For Mode B to actually retarget the canonical MJ suite, the 25 test JSONs in
`metadata/tests/regression/` need to use `{{baseUrl}}` / `{{authUsername}}` /
`{{authPassword}}` / `{{allowedDomains}}` placeholders instead of hardcoded
`http://localhost:4200`. This was Phase 1A's deliverable; the substitution
**code** ships and is fully tested, but the **JSON conversion** is a follow-up
(tracked in [`docker/regression/LIMITATIONS.md`](../../LIMITATIONS.md)).

Until the conversion lands, this example sets up the plumbing correctly but
the runner will still attempt `http://localhost:4200` — useful for archive
flow + auth-flow testing, not yet for actual remote regression coverage.

## Running it externally (outside the monorepo, via the published image)

Once `memberjunction/agentic-test-runner:vX` is published:

```bash
# Scaffold the directory
docker run --rm -v $(pwd):/out memberjunction/agentic-test-runner init remote-mj

# Edit ./remote-mj/target.json, then run
export REMOTE_MJ_TEST_USER=qa@example.com
export REMOTE_MJ_TEST_PASSWORD=...

docker run --rm \
    -v $(pwd)/test-results:/app/test-results \
    -e MJ_TEST_VAR_baseUrl="https://mj.example.com" \
    -e MJ_TEST_VAR_allowedDomains='["mj.example.com","*.auth0.com"]' \
    -e MJ_TEST_VAR_authUsername="$REMOTE_MJ_TEST_USER" \
    -e MJ_TEST_VAR_authPassword="$REMOTE_MJ_TEST_PASSWORD" \
    -e TEST_SUITE_NAME="MJ Explorer Regression Suite" \
    memberjunction/agentic-test-runner
```
