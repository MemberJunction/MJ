# Generic Web Example — Mode C Reference

A working **Mode C** (non-MJ web app) scaffold that drives the MJ regression
runner against [MDN Web Docs](https://developer.mozilla.org). Three Computer
Use tests plus one **custom IOracle** plugged in via `--oracles-module`.

Use this directory as the starting point when authoring tests for your own web
app: copy it, edit `target.json` to point at your URL, replace the three test
JSONs, and tweak (or remove) the custom oracle.

## What's in here

```
generic-web/
├── README.md                                  # this file
├── target.json                                # Mode C target profile (kind: generic-web)
├── metadata/
│   ├── .mj-sync.json                          # directoryOrder = [tests, test-suites]
│   ├── tests/
│   │   ├── .mj-sync.json                      # entity = "MJ: Tests"
│   │   ├── .GW01-home-loads.json              # MDN home page smoke
│   │   ├── .GW02-search-array-map.json        # search-flow test
│   │   └── .GW03-navigate-references.json     # top-nav navigation test
│   └── test-suites/
│       ├── .mj-sync.json                      # entity = "MJ: Test Suites"
│       └── .generic-web-suite.json            # binds the 3 tests
└── oracles/
    └── mdn-oracles.cjs                        # custom IOracle exports
```

## The custom oracle module

[`oracles/mdn-oracles.cjs`](oracles/mdn-oracles.cjs) exports two oracles in two
different styles to show both supported patterns:

| Type | Export style | Purpose |
|---|---|---|
| `final-url-host` | `class FinalUrlHostOracle implements IOracle` | Verifies the test ended on a specific hostname (catches off-domain wanders). Used by GW02 + GW03. |
| `min-step-count` | object instance `{ type, evaluate }` | Fails when the agent finished too fast (likely a silent navigation error). Available to any test but not currently referenced — feel free to wire it in. |

The loader (`packages/TestingFramework/CLI/src/utils/oracle-module-loader.ts`)
duck-types each export: if it has `type: string` + async `evaluate()`, it
gets registered. Anything else is silently skipped.

## Running it

### Inside Docker (Mode C via `mj test regression remote`)

From the MJ monorepo root:

```bash
mj test regression remote --target=docker/regression/examples/generic-web/target.json
```

What happens:

1. The CLI loads [`target.json`](target.json), resolves any `env:` refs (none
   in this example), and exports `MJ_TEST_VAR_baseUrl=https://developer.mozilla.org`,
   `MJ_TEST_VAR_allowedDomains=["developer.mozilla.org","*.mozilla.org"]`,
   `TEST_SUITE_NAME="Generic Web Example Suite"`,
   `EXTRA_METADATA_DIRS=/app/docker/regression/examples/generic-web/metadata`,
   `ORACLES_MODULE=/app/docker/regression/examples/generic-web/oracles/mdn-oracles.cjs`,
   plus the entrypoint dispatch (`TEST_RUNNER_ENTRYPOINT=test-runner-remote-entrypoint.sh`).
2. Compose brings up the full profile so the test-runner has a local
   ephemeral DB for `TestRun` / `TestRunOutput` rows (the remote URL itself
   isn't MJ — the DB is just for results recording).
3. The remote entrypoint pushes the example's metadata to the DB, then
   invokes `mj test suite --name "Generic Web Example Suite"
   --oracles-module=/app/.../mdn-oracles.cjs --parallel --max-parallel 4`.
4. Reports land in `docker/regression/test-results/run-{TIMESTAMP}/`.

### Locally (against your dev DB) for fast iteration

If you're authoring tests and don't want the Docker round-trip every time,
push the metadata to your local MJ DB and run the suite directly:

```bash
# 1. Push the example's test + suite metadata
npx mj sync push --dir=docker/regression/examples/generic-web/metadata

# 2. Run the suite with the custom oracle module + variable substitutions
mj test suite \
    --name "Generic Web Example Suite" \
    --oracles-module=docker/regression/examples/generic-web/oracles/mdn-oracles.cjs \
    --var baseUrl=https://developer.mozilla.org \
    --var 'allowedDomains=["developer.mozilla.org","*.mozilla.org"]' \
    --parallel --max-parallel 3
```

The `--var` flags drive the `{{baseUrl}}` / `{{allowedDomains}}` substitution
inside the test JSONs. JSON-shaped values (the array) work because the
substitution layer auto-parses them.

## Copying this example for your own app

1. **Copy the directory** to `docker/regression/examples/my-app/` (or anywhere
   outside the monorepo, then mount it).
2. **Edit `target.json`**:
   - Set `baseUrl` to your app's URL.
   - Set `allowedDomains` to the hosts the agent is allowed to touch.
   - Add an `auth` block if your app requires login (see
     [`docker/regression/targets/staging-mj.example.target.json`](../../targets/staging-mj.example.target.json)
     for the auth shape).
   - Rename `suite` to match your suite, update `extraMetadataDirs` to your
     metadata path, point `oraclesModule` at your oracles file.
3. **Replace the tests** in `metadata/tests/` with goals specific to your app.
   Reference `{{baseUrl}}` (and any custom vars you add) inside `startUrl`,
   oracle `pattern` configs, etc.
4. **Edit the suite** in `metadata/test-suites/.generic-web-suite.json` to
   list your tests by name.
5. **Write your oracles** in `oracles/*.cjs`. The duck-type contract is:
   `{ type: string, async evaluate(input, config) → OracleResult }`.

See [`../bring-your-own-app/`](../bring-your-own-app/) for an example that
also boots its own app inside the regression network (Mode D).
