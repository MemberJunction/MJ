/**
 * Thin oclif shim — the real logic lives in {@link CodeGenPlugin} in
 * `@memberjunction/codegen-lib/plugins` (plan §3). See sync/push.ts for the
 * shim rationale. Adds `--format=json` and the slow-command runtime advisory.
 */
export { CodeGenPlugin as default } from '@memberjunction/codegen-lib/plugins';
