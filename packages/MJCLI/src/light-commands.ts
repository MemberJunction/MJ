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
/**
 * NOTE on spelling: oclif command ids are **colon**-separated (`cache:clear`), whatever
 * `topicSeparator` is set to — that only affects how a user types it. The space forms below are
 * kept because they read the way the command is invoked, but each one is paired with its colon id,
 * which is what `Command.id` actually equals at runtime. Without the colon form the entry never
 * matches and the command silently pays the full bootstrap: `cache clear` measured 4.4-7.4 s
 * against 0.19-0.29 s. `light-commands.ids.test.ts` fails on a space-only entry.
 */
export const LIGHT_COMMANDS: ReadonlySet<string> = new Set([
  // Built-in oclif plugins
  'version',
  'help',

  // Progressive-disclosure usage (tier 1 + tier 2) — composes plugin static
  // metadata only; no bootstrap needed. Plugin entry points are light.
  'usage',
  'sync usage',
  'sync:usage',
  'codegen usage',
  'codegen:usage',
  'dev usage',
  'dev:usage',
  // Every remaining domain's tier-2 page. These compose oclif's own manifest plus the
  // light plugin entry points — the whole point of the surface is that an agent can
  // read it without paying for a runtime boot. Both id spellings are listed because
  // oclif reports space-separated ids under `topicSeparator: ' '` while some manifest
  // entries in this file use the colon form.
  'ai usage',
  'ai:usage',
  'ai:usage',
  'app usage',
  'app:usage',
  'app:usage',
  'artifacts usage',
  'artifacts:usage',
  'artifacts:usage',
  'baseline usage',
  'baseline:usage',
  'baseline:usage',
  'bump usage',
  'bump:usage',
  'bump:usage',
  'bundle usage',
  'bundle:usage',
  'bundle:usage',
  'clean usage',
  'clean:usage',
  'clean:usage',
  'dbdoc usage',
  'dbdoc:usage',
  'dbdoc:usage',
  'doctor usage',
  'doctor:usage',
  'doctor:usage',
  'install usage',
  'install:usage',
  'install:usage',
  'migrate usage',
  'migrate:usage',
  'migrate:usage',
  'plugin usage',
  'plugin:usage',
  'plugin:usage',
  'querygen usage',
  'querygen:usage',
  'querygen:usage',
  'sql-audit usage',
  'sql-audit:usage',
  'sql-audit:usage',
  'sql-convert usage',
  'sql-convert:usage',
  'sql-convert:usage',
  'standards usage',
  'standards:usage',
  'standards:usage',
  'test usage',
  'test:usage',
  'test:usage',
  'translate-sql usage',
  'translate-sql:usage',
  'translate-sql:usage',
  'update usage',
  'update:usage',
  'update:usage',

  // Plugin registry editing — just writes mj-cli-plugins.json
  'plugin add',
  'plugin:add',

  // Bump - uses zod, fast-glob, fs only
  'bump',

  // Shared cache - uses @memberjunction/redis-provider (ioredis + core) only
  'cache',
  'cache clear',
  'cache:clear',
  'cache usage',
  'cache:usage',
  'cache:usage',

  // Database commands - use @memberjunction/skyway-core + config only
  'clean',
  'migrate',
  'migrate convert',
  'migrate:convert',
  'migrate create',
  'migrate:create',

  // Install wizard - uses @memberjunction/installer engine (lightweight, no bootstrap)
  'install',

  // Doctor - uses @memberjunction/installer engine (lightweight, no bootstrap)
  'doctor',

  // Bundle - uses @memberjunction/installer distribution assembly (lightweight, no bootstrap)
  'bundle',

  // Topic index commands (just display help text, no heavy imports)
  'ai',
  'ai audit',
  'ai:audit',
  'test',
  'dbdoc',
  'dev',

  // Dev workspace generator - node stdlib + chalk only, no bootstrap
  'dev workspace',
  'dev:workspace',
  'dev workspace status',
  'dev:workspace:status',
  'dev workspace doctor',
  'dev:workspace:doctor',
  'dev workspace clean',
  'dev:workspace:clean',

  // SQL conversion commands - use @memberjunction/sql-converter + sqlglot-ts only
  'sql-convert',
  'sql-audit',

  // Claude pack commands - use only node stdlib + the lib/claude-pack/ helpers;
  // no MJ runtime / bootstrap needed.
  'install:claude',
  'update:claude',

  // CodeGen manifest - uses @memberjunction/codegen-lib for AST scanning only, no bootstrap needed.
  // Must be light to break the circular dependency: server-bootstrap-lite's prebuild calls
  // `mj codegen manifest`, but bootstrap-lite must be built before MJCLI's prerun can import it.
  'codegen manifest',
  'codegen:manifest',

  // DBDoc commands - already use dynamic imports internally
  'dbdoc init',
  'dbdoc:init',
  'dbdoc analyze',
  'dbdoc:analyze',
  'dbdoc export',
  'dbdoc:export',
  'dbdoc export-sample-queries',
  'dbdoc:export-sample-queries',
  'dbdoc generate-queries',
  'dbdoc:generate-queries',
  'dbdoc reset',
  'dbdoc:reset',
  'dbdoc status',
  'dbdoc:status',
]);
