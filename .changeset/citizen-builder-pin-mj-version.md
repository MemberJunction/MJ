---
"@memberjunction/cli": patch
---

`mj agent init` now pins the workspace it creates to the CLI's own release, and the workspace's container no longer reports success when provisioning fails.

Previously the scaffolded `docker/Dockerfile` installed `@memberjunction/cli` unpinned — npm's `latest`, which can be a different major line — and the entrypoint ran `mj install --yes` with no tag, which takes the newest stable GitHub release. A workspace created by an edge CLI therefore ran a v5 CLI against a v6 install, and the entrypoint's `|| echo "Notice: … completed or skipped."` guards hid any failure that caused.

- `mj agent init` writes `MJ_VERSION` to `.env`: its own version, read from its package.json (not `this.config.version`, which is the version of whatever package root oclif resolved). `docker-compose.yml` requires it, the Dockerfile installs `@memberjunction/cli@$MJ_VERSION`, and the entrypoint passes `--tag v$MJ_VERSION` to `mj install`.
- The entrypoint no longer masks failures of `mj install`, `mj app install`, `mj sync push` (now `--ci`, so it cannot hang on an interactive prompt in a headless container) or `mj migrate`. Each provisioning step that must not run twice records its own completion on the workspace volume, so a failed step is retried on the next start without re-running the steps before it — previously a failure after `mj install` left `package.json` behind and every later start skipped the Open App install and metadata push entirely. Workspaces provisioned by the earlier script are treated as provisioned.
