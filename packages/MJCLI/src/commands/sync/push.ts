/**
 * Thin oclif shim — the real logic lives in {@link SyncPushPlugin} in
 * `@memberjunction/metadata-sync/plugins` (plan §3, open-question #2 "shim"
 * approach). oclif discovers this default export and routes `mj sync push` to it;
 * the plugin inherits `--format`/`--verbose`/`--no-banner`, the runtime advisory,
 * and uniform result emission from BaseCLIPlugin.
 */
export { SyncPushPlugin as default } from '@memberjunction/metadata-sync/plugins';
