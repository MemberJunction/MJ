---
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/a2aserver": minor
"@memberjunction/ai-mcp-server": minor
"@memberjunction/testing-cli": minor
---

Empty turbo's global hash, and make every in-repo `mj` invocation resolve.

`hashOfInternalDependencies` — a hash over every non-gitignored file in the root manifest's
workspace-dependency closure — is an input to *every* task hash in the repo. The root
`package.json` declared three `workspace:*` devDependencies (`cli`,
`integration-test-suite`, `server-bootstrap-lite`) whose combined closure was 154 of 310
packages, so editing any file in any of them invalidated all 310, builds and tests alike.
Task-level `inputs` cannot reach this; it is upstream of them. Removing the three drops a
one-file edit from 310/310 to 37/310 (`AI/Agents`) and 8/310 (Explorer dashboards).

Removing them also removes the workspace-root `node_modules/.bin/mj` that a number of things
quietly resolved through. Every consumer is repaired:

- The 15 root scripts, plus `check:ui-layers`, `check:standards` and `test:integration`, now
  call `node packages/MJCLI/bin/run.js` directly.
- `mj.config.cjs`'s `checkModules` used a bare specifier that only worked via the symlink the
  devDependency created. `check-module-loader.ts` *collects* load failures rather than
  throwing, so this would have silently degraded `mj test` to "Unknown integration check
  bundle". Now an absolute `__dirname`-based path, asserted by `sibling-parity.test.ts`.
- Seven `prebuild`/`postbuild` hooks across `ng-bootstrap`, `ng-bootstrap-lite`,
  `ng-explorer-core`, `server-bootstrap` and `server-bootstrap-lite` ran bare `mj codegen
  manifest` behind `|| echo 'Warning: …'`, so a lost CLI exits 0 and the build proceeds
  against a stale class-registration manifest — a new `@RegisterClass` class never reaches it
  and tree-shaking then drops it from bundled apps. Each now calls the workspace entry point
  by path. Deliberately not a `@memberjunction/cli` devDependency: `ng-explorer-core` has six
  dependents and `ng-bootstrap` two, so a devDep there would take a CLI edit from 6/310 to
  12/310 invalidated packages, and `cli` itself depends on `server-bootstrap-lite`, where it
  would be a build-graph cycle. A path call adds no graph edge.
- `a2aserver`, `ai-mcp-server` and `mj_codegen_api` ran bare `mj` in a fallback-less
  `prestart`, exiting 127 where no global CLI existed and silently resolving a version-skewed
  one where it did. Each now declares `@memberjunction/cli` — leaf packages only, so
  `hashOfInternalDependencies` stays `""`.
- `pg-migrations.yml` invoked `npx mj` at four sites. With no root bin `npx` falls through to
  the npm registry, where the package named `mj` is unrelated mongodb-js tooling — in a job
  holding database credentials, in a workflow that does not trigger on `package.json`, so it
  would have stayed silent until the next release-time PG run.

A new `check-mj-cli-resolution.mjs` gate in the `guards` job permits only the two forms that
actually resolve, so this cannot regress silently again.

`@memberjunction/testing-cli` carries a comment-only change to `check-module-loader.ts`
documenting why MJ's own root config cannot use a bare specifier while an adopter's can.

---

**On the level:** this is `minor` to satisfy `check:changeset`, not because anything touches
the database. The branch adds no migration and edits no declarative metadata. The only file
it changes under `metadata/` is `metadata/CLAUDE.md` — an instruction document, part of the
repo-wide `npx mj` → `pnpm mj` rewrite — and the gate's trigger is `/^metadata\/.+/`, which
matches any path under that directory including Markdown. The rule's own justification for
metadata-⇒-minor is that "metadata counts as a migration because it becomes one" via the
release-time `mj sync push`; a `CLAUDE.md` never becomes one. Under permanent pre mode a
stray `minor` moves no version, so the cost is meaning rather than digits — hence this note,
so the next reader does not take it as precedent. Narrowing that pattern to exclude
Markdown belongs in its own PR against the gate.
