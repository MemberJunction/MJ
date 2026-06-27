/**
 * Cleanup hook that runs after any command completes.
 *
 * Commands under `mj app *` open an mssql connection pool through
 * `ensureProviderInitialized` in utils/open-app-context.ts. The pool keeps
 * sockets alive, which pins the Node event loop open and makes the CLI
 * appear to hang after the command finishes printing its output.
 *
 * `closeConnectionPool` is idempotent — if the pool was never opened (most
 * non-`app` commands), it no-ops.
 */
import { Hook } from '@oclif/core';
import { closeConnectionPool } from '../utils/open-app-context.js';

const hook: Hook<'postrun'> = async function () {
  try {
    await closeConnectionPool();
  } catch {
    /* best effort — pool may already be closed or never opened */
  }
};

export default hook;
