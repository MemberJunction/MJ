# Regression Suite Examples

Reference scaffolds for the four target-modes of the agentic test runner.
Pick the one closest to your use case, copy it, edit, run.

## Inventory

| Directory | Mode | Use case |
|---|---|---|
| [`remote-mj/`](remote-mj/) | **B** — remote MJ Explorer | Drive the canonical 25 MJ Explorer regression tests against a staging/customer/production MJ deployment. Pure target-profile recipe — no app code, no tests of its own. |
| [`generic-web/`](generic-web/) | **C** — non-MJ web app | The canonical "we test a non-MJ app" scaffold. 3 tests against MDN Web Docs, a custom `IOracle` module, full README. Copy this if your app is already deployed somewhere reachable. |
| [`static-file-server/`](static-file-server/) | **D** — bring-your-own-app (minimal) | nginx:alpine + 2 HTML pages + 2 tests. The smallest possible Mode D — shows the overlay pattern without any language/framework dependencies. |
| [`bring-your-own-app/`](bring-your-own-app/) | **D** — bring-your-own-app (realistic) | An Angular + Express app with planted bugs, archive flow, and elaborate test JSONs. Use when authoring tests for a real app and you want to see how to catch UI defects. |
| [`github-actions/`](github-actions/) | n/a (CI) | Copy-paste GitHub Actions workflow that runs the agentic runner in CI against any of the above. |

## Quick decision tree

```
Are you testing the canonical MJ Explorer deployment? ────────► remote-mj
  ↓ no
Is your app already deployed somewhere reachable? ────────────► generic-web
  ↓ no — needs to be brought up alongside the runner
Is your app a simple static site / single Docker image? ──────► static-file-server
  ↓ no — multi-stage build, runtime DB, env vars
                                                        ────────► bring-your-own-app
```

## Two ways to use these examples

### A. Inside the MJ monorepo

Edit in place under `docker/regression/examples/<name>/` and run via:

```bash
mj test regression remote --target=docker/regression/examples/<name>/target.json
# Mode D adds --overlay=docker/regression/examples/<name>/docker-compose.app.yml
```

### B. External — scaffold into your own project

Once `memberjunction/agentic-test-runner` is published, copy one of these
directories into your project without cloning the monorepo:

```bash
mj test regression init <name>
# Or directly:
docker run --rm -v $(pwd):/out memberjunction/agentic-test-runner init <name>
```

This drops `./<name>/` into your cwd. Edit the target profile + tests to
match your app, then run the runner directly via `docker run`.

## Versioning

The example directory is baked into `memberjunction/agentic-test-runner:v<X>`
at image-build time, so the set you see when you run `init` is whatever
shipped with that image version. Pin your CI to a specific image tag and the
scaffolds stay stable across runs.
