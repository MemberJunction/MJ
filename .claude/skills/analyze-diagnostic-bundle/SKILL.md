---
name: analyze-diagnostic-bundle
description: Inspect, verify, timeline, and diagnose MemberJunction .mjdiag diagnostic bundles using the mj diag CLI and @memberjunction/diagnostics.
---

# Analyze Diagnostic Bundle (`.mjdiag`)

Use this skill when a user provides a `.mjdiag` file (plain ZIP archive or encrypted `MJDB` v1 envelope) and wants root-cause analysis for performance bottlenecks, slow startup, redundant `RunView` waterfalls, slow SQL queries, or runtime errors.

## Workflow

1. **Inspect & Verify the Bundle**:
   ```bash
   npx mj diag inspect <path-to-bundle.mjdiag> --json
   ```
   - The JSON has `wasEncrypted`, `manifest` and `findings`.
   - Review these manifest fields: `bundleId`, `sessionId`, `createdAt`, `captureReason`, `scrubberProfile`, `redactionSummary` (`credentialsScrubbedCount`, `sqlLiteralsNormalizedCount`, `customPatternsAppliedCount`) and `files`.
   - `manifest.files` maps each archive entry (for example `server/sql.ndjson`) to its `sha256`, `sizeBytes` and, for list files, `entryCount`. Use `entryCount` for the number of logs, spans, SQL events, breadcrumbs and findings.
   - The environment (MJ version and more) is in the bundle's `environment.json`, not in the manifest. The text output (without `--json`) shows the MJ version.
   - If the bundle is an encrypted `MJDB` envelope from an intake server, give the base64 PKCS#8 private key with `--private-key-file <path>` or the `MJ_DIAG_PRIVATE_KEY` environment variable. `--private-key <base64>` also works, but other processes and the shell history can see the value. If more than one is given, `--private-key` wins, then `--private-key-file`, then `MJ_DIAG_PRIVATE_KEY`. The same options work on `slow`, `timeline`, `export` and `scrub`.

2. **Check Slow Operations**:
   ```bash
   npx mj diag slow <path-to-bundle.mjdiag> --threshold 250
   ```
   - Identify spans or SQL queries exceeding 250ms.
   - Check whether slow operations are sequential (`RunView` waterfall) or dominated by a single SQL query or cold engine load.

3. **Examine Chronological Timeline**:
   ```bash
   npx mj diag timeline <path-to-bundle.mjdiag> --limit 100
   ```
   - Correlate `client-span`, `server-span`, `sql` and `breadcrumb` events across time.

4. **Export for Visual Flamegraph (Optional)**:
   ```bash
   npx mj diag export <path-to-bundle.mjdiag> --perfetto -o trace.perfetto.json
   ```
   - The resulting JSON can be opened directly in `https://ui.perfetto.dev`.

5. **Synthesize Root Cause & Recommendations**:
   - Cite concrete span IDs, SQL fingerprints, and durations from the bundle.
   - Map each finding to the exact MemberJunction package, entity, engine, or resolver responsible.
