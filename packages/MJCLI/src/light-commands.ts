/**
 * Commands that do NOT require @memberjunction/server-bootstrap-lite.
 * These commands use only lightweight dependencies (zod, cosmiconfig, @memberjunction/skyway-core,
 * fast-glob, fs-extra, etc.) and can start instantly without loading ~1,400 class
 * registrations.
 *
 * Any command NOT listed here will trigger dynamic loading of the MJ bootstrap
 * in the prerun hook before execution.
 *
 * When adding new commands:
 *  - If the command imports from @memberjunction/* packages that depend on
 *    server-bootstrap-lite, do NOT add it here.
 *  - If the command uses only standard npm packages or light @memberjunction
 *    packages (like @memberjunction/config), add its oclif command ID here.
 */
export const LIGHT_COMMANDS: ReadonlySet<string> = new Set([
  // Built-in oclif plugins
  'version',
  'help',

  // Bump - uses zod, fast-glob, fs only
  'bump',

  // Database commands - use @memberjunction/skyway-core + config only
  'clean',
  'migrate',

  // Install wizard - uses zod, recast, fs-extra only
  'install',

  // Topic index commands (just display help text, no heavy imports)
  'ai',
  'ai audit',
  'test',
  'dbdoc',

  // DBDoc commands - already use dynamic imports internally
  'dbdoc init',
  'dbdoc analyze',
  'dbdoc export',
  'dbdoc export-sample-queries',
  'dbdoc generate-queries',
  'dbdoc reset',
  'dbdoc status',
]);
