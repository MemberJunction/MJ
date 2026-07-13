/**
 * Thin oclif shim — the real logic lives in {@link SyncPullPlugin} in
 * `@memberjunction/metadata-sync/plugins` (plan §3). See sync/push.ts for the
 * shim rationale.
 */
export { SyncPullPlugin as default } from '@memberjunction/metadata-sync/plugins';
