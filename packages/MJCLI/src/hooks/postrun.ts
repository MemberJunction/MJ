/**
 * Cleanup hook that runs after any command completes.
 *
 * Only `mj app *` commands open an mssql connection pool (through
 * `ensureProviderInitialized` in utils/open-app-context.ts). The pool keeps
 * sockets alive, which pins the Node event loop open and makes the CLI appear
 * to hang after the command finishes printing its output — so for those
 * commands we close it here.
 *
 * The import of `open-app-context` is DEFERRED (dynamic) and gated on the
 * command id: that module statically pulls in the entire DB-provider stack
 * (@memberjunction/sqlserver-dataprovider, @memberjunction/metadata-sync,
 * @memberjunction/core), which costs ~2.7s warm and far more on a cold CI
 * runner. Loading it eagerly here charged that cost to EVERY command —
 * including light ones like `install:claude` — which is what made the
 * claude-pack subprocess tests exceed their spawn timeout. Non-`app` commands
 * never open a pool, so they have nothing to close and skip the import.
 *
 * Dynamic import is justified per CLAUDE.md rule #8 (#3 — genuine, measured
 * startup-cost deferral of a single heavy module).
 */
import { Hook } from '@oclif/core';

const hook: Hook<'postrun'> = async function (options) {
  const commandId = options.Command?.id ?? '';
  // Pools are opened exclusively by `app:*` commands; nothing else can leave one open.
  if (!commandId.startsWith('app:')) {
    return;
  }
  try {
    const { closeConnectionPool } = await import('../utils/open-app-context.js');
    await closeConnectionPool();
  } catch {
    /* best effort — pool may already be closed or never opened */
  }
};

export default hook;
