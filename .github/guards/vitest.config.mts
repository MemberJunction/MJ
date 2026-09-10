import { defineConfig } from 'vitest/config';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Standalone config for the REPO-WIDE SOURCE SCANNERS in .github/guards.
//
// These suites assert about the whole `packages/` tree, not about one package. That makes
// them incompatible with turbo's cache, whose key for `<pkg>#test` covers only that
// package's own files (turbo.json `test.inputs`, resolved relative to the package dir).
// Living inside packages/MJGlobal, the UUID and multi-provider scanners hashed to a key
// that provably could not contain the code they scan: MJGlobal is the ROOT of the
// dependency graph, so no upstream task hash widens the key either. Nine real violations
// in MetadataSync sat behind a replayed `cache hit` on `next` for two days (issue #4369),
// and the affected-package PR filter (`--filter=...[base]`) never selects MJGlobal for a
// MetadataSync change, so neither CI lane could catch them.
//
// This directory is not an npm workspace, so it cannot join the per-package turbo test
// graph at all — which is exactly the property these scanners need. Run with:
//   npx vitest run --config .github/guards/vitest.config.mts
//
// A new scanner belongs HERE, never in a package's __tests__. check-scanner-placement.mjs
// enforces that.
export default defineConfig({
    test: {
        root: dirname(fileURLToPath(import.meta.url)),
        include: ['**/*.guard.test.ts'],
        testTimeout: 60000,
    },
});
