# Static File Server — Mode D Minimal Demo

The smallest possible **Mode D** (Bring-Your-Own-App) example. An `nginx:alpine`
container serving two HTML pages, brought up alongside the regression
test-runner via a docker-compose overlay. Two trivial Computer Use tests
verify the runner can reach the overlay-supplied service.

Use this as the starting point when you want to test your own app inside the
regression network without any framework assumptions. For a more realistic
Angular + Express app with planted bugs, see [`../bring-your-own-app/`](../bring-your-own-app/).

## Layout

```
static-file-server/
├── README.md                                  # this file
├── Dockerfile                                 # nginx:alpine + a custom server config
├── docker-compose.app.yml                     # Mode D overlay (adds static-server service)
├── target.json                                # target profile: kind=generic-web, baseUrl=http://static-server:3000
├── public/
│   ├── index.html                             # home page
│   └── about.html                             # about page
└── metadata/
    ├── .mj-sync.json
    ├── tests/
    │   ├── .mj-sync.json
    │   ├── .SS01-home-loads.json              # home-page smoke
    │   └── .SS02-navigate-about.json          # nav-flow test
    └── test-suites/
        ├── .mj-sync.json
        └── .static-server-suite.json
```

## Running it

From the MJ monorepo root:

```bash
mj test regression remote \
    --target=docker/regression/examples/static-file-server/target.json \
    --overlay=docker/regression/examples/static-file-server/docker-compose.app.yml
```

What happens:

1. **CLI loads the target** — exports `MJ_TEST_VAR_baseUrl=http://static-server:3000`,
   `MJ_TEST_VAR_allowedDomains=["static-server"]`, `TEST_SUITE_NAME="Static Server Mode D Suite"`,
   `EXTRA_METADATA_DIRS=/app/static-server-metadata`, and the remote-entrypoint dispatch.
2. **Compose merges the overlay** — `docker compose -f base.yml -f overlay.yml --profile full up`.
   The overlay adds the `static-server` service, makes it a test-runner dep
   (`condition: service_healthy`), and mounts the test/suite metadata.
3. **Stack boots in order** — SQL Server → migrations → MJAPI → MJExplorer → static-server →
   test-runner. The MJ stack is up so the runner has an ephemeral DB for `TestRun` /
   `TestRunOutput` rows; MJExplorer itself is unused in this run.
4. **Runner pushes the metadata** — `mj sync push --dir=/app/static-server-metadata` adds
   the two tests + suite to the DB.
5. **Suite runs** — `mj test suite --name "Static Server Mode D Suite" --parallel`.
   Each test navigates to `http://static-server:3000` (resolved via Docker's compose
   DNS) and runs Computer Use against the HTML.
6. **Reports** — markdown + HTML reports land in `docker/regression/test-results/run-{TIMESTAMP}/`.

## What the overlay does

[`docker-compose.app.yml`](docker-compose.app.yml) is a stack-extension overlay
that compose merges with the base regression compose. It:

- Defines a `static-server` service (build from this directory's `Dockerfile`).
- Joins the `full` compose profile so it boots alongside the test-runner.
- Adds a healthcheck so the runner waits for nginx to be ready.
- Adds `static-server` to the test-runner's `depends_on`.
- Mounts `metadata/` into the runner at `/app/static-server-metadata` (RW so
  mj-sync can write back primary-key + sync state).

Path note: compose resolves relative paths in overlays against the **first**
`-f` file's directory (the base compose at `docker/regression/`), not against
the overlay's own location. That's why the overlay references
`examples/static-file-server/...` instead of `./...`.

## Copying this example for your own app

1. Copy the directory to `docker/regression/examples/my-app/` (or anywhere; mount it).
2. Replace `Dockerfile` + `public/` (or whatever you serve) with your app's container.
3. Edit `docker-compose.app.yml` — rename the service, adjust the healthcheck, add any
   extra mounts/env-vars your app needs.
4. Edit `target.json` — point `baseUrl` at your service hostname, list the hostname in
   `allowedDomains`, rename the suite.
5. Replace the test JSONs in `metadata/tests/` with goals specific to your app.
6. Run with the same `mj test regression remote --target=... --overlay=...` command.
