# `@memberjunction/ng-bootstrap-lite` — 🚨 BROWSER manifest (lazy-aware). NO server-only dependencies. 🚨

This is the **lite, eagerly-loaded class-registration manifest** that MJExplorer's `app.module.ts` imports directly (`CLASS_REGISTRATIONS` from `@memberjunction/ng-bootstrap-lite`). It excludes lazy-loaded feature packages (so those register on demand) but is otherwise bundled straight into the browser. **Everything reachable from this package's dependencies ships to the browser.**

## The rule

**NEVER add a dependency here — directly OR transitively — that reaches a server-only package** (anything importing Node built-ins: `crypto`, `stream`, `console`, `fs`, `net`, …). They break the browser build with `Could not resolve "crypto"` / `"stream"` / `"console"`, and a cold `ng serve` for MJExplorer won't bind. Read the sibling [`packages/Angular/Bootstrap/CLAUDE.md`](../Bootstrap/CLAUDE.md) — the mechanism, the known-bad list, and the verification steps are identical and apply here too.

## How lite differs from full `ng-bootstrap`

Its generator (`mj:manifest:ng-bootstrap-lite`) already passes:
```
--exclude-packages @memberjunction/ng-dashboards
--exclude-packages @memberjunction/ng-explorer-settings
--scan-dist
```
That keeps the heavy *lazy* Angular feature packages out of the eager bundle — it is **not** a server-package guard. If a server-only package ever leaks into the transitive graph, the lite manifest will pull it in just like the full one. The fix is the same: **cut the offending dependency edge**, don't paper over it.

## The trap to avoid (June 2026 incident)

`@memberjunction/templates` *looks* like a harmless utility but depends on `@memberjunction/aiengine` + `@memberjunction/ai-provider-bundle` (every LLM SDK + Pinecone + storage). A transitive edge into `templates` (or any of those) floods this browser manifest with Node-only code. Also beware the generator's **reconciliation** step (`syncDependencies`): it auto-writes discovered packages into `package.json`, so a single bad transitive edge silently ratchets a whole server cluster into your deps.

## Before committing a dependency change here

1. Regenerate: `pnpm run mj:manifest:ng-bootstrap-lite` (from repo root).
2. Run `pnpm run check:browser-manifest` — it scans this manifest (and `ng-bootstrap`'s, and both packages' declared dependencies) for `aiengine`, `ai-provider-bundle`, `ai-vectors-pinecone`, `storage`, `templates`, `server`, `ai-agents`, `ai-prompts`, `communication-engine`, `content-autotagging` and every `ai-<provider>` in the bundle. Any hit means stop and trace the edge. CI runs the same command, so this is not an optional courtesy check.
3. Use browser-safe equivalents: `ai-engine-base` (not `aiengine`), `ai-vectors-memory` (not `ai-vectors-pinecone`), `*-base` packages generally.
4. Confirm a **cold** MJExplorer `ng serve` prints `Local: http://localhost:4201/` and binds.
