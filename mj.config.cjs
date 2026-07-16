/**
 * MemberJunction Configuration - Monorepo Overrides
 */

/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {
  // [E2E-TEMP] Dynamic Open App connector packages loaded at MJAPI boot for hybrid-e2e of the REAL
  // Integrations-repo artifacts (built dist copied into node_modules/@memberjunction/connector-*).
  // Remove this block to restore baseline. See /tmp/mj.config.cjs.baseline.
  dynamicPackages: {
    server: [
      { PackageName: '@memberjunction/connector-blackbaud', StartupExport: 'registerConnector', AppName: 'connector-blackbaud', Enabled: true },
      { PackageName: '@memberjunction/connector-stripe', StartupExport: 'registerConnector', AppName: 'connector-stripe', Enabled: true },
      { PackageName: '@memberjunction/connector-eventbrite', StartupExport: 'registerConnector', AppName: 'connector-eventbrite', Enabled: true },
      { PackageName: '@memberjunction/connector-wild-apricot', StartupExport: 'registerConnector', AppName: 'connector-wild-apricot', Enabled: true },
      { PackageName: '@memberjunction/connector-magnetmail', StartupExport: 'registerConnector', AppName: 'connector-magnetmail', Enabled: true },
      { PackageName: '@memberjunction/connector-zendesk', StartupExport: 'registerConnector', AppName: 'connector-zendesk', Enabled: true },
    ],
    client: [],
  },
  // AFTER-command gate: the in-process RSU/ApplyAll codegen has its OWN compile + restart steps, so the
  // standalone codegen AFTER commands (npm run build ×N + `npm start` restarting MJAPI) are redundant AND
  // fatal in-process (they exit non-zero → RunCodeGen reports failure → ApplyAll fails → 0-row sync). When
  // MJ_CODEGEN_NO_AFTER=1 (set by the hybrid-e2e MJAPI launch) return [] so no AFTER commands run; otherwise
  // return undefined so CodeGenLib's default AFTER commands apply for normal dev `mj codegen`.
  commands: process.env.MJ_CODEGEN_NO_AFTER === '1' ? [] : undefined,
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 1433,
  dbDatabase: process.env.DB_DATABASE,
  dbUsername: process.env.DB_USERNAME,
  dbPassword: process.env.DB_PASSWORD,
  dbTrustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === '1' || process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
  // Add dbEncrypt setting - when DB_ENCRYPT=false, disable encryption
  dbEncrypt: process.env.DB_ENCRYPT === 'false' ? false : true,
  coreSchema: process.env.MJ_CORE_SCHEMA || '__mj',

  codeGenLogin: process.env.CODEGEN_DB_USERNAME,
  codeGenPassword: process.env.CODEGEN_DB_PASSWORD,

  magicLink: {
    enabled: false,
    restrictedRoleName: 'Magic Link Baseline',
    defaultExpiresInHours: 72,
    sessionTokenTtlHours: 8,
    audience: 'mj-magic-link',
    explorerUrl: 'http://localhost:4201',
  },

  excludeSchemas: ['sys', 'staging'],

  advancedGeneration: {
    enableAdvancedGeneration: false,
    batchSize: 15,
  },

  settings: [
    { name: 'mj_core_schema', value: '__mj' },
    { name: 'skip_database_generation', value: false },
    { name: 'recompile_mj_views', value: true },
    { name: 'auto_index_foreign_keys', value: true },
  ],

  customSQLScripts: [
  ],

  additionalSchemaInfo: './metadata/integrations/additionalSchemaInfo.json',

  output: [
    { type: 'SQL', directory: './SQL Scripts/generated', appendOutputCode: true },
    {
      type: 'Angular',
      directory: './packages/MJExplorer/src/app/generated',
      options: [{ name: 'maxComponentsPerModule', value: 20 }],
    },
    {
      type: 'Class',
      directory: './packages/MJCoreEntities/src/generated',
      baseClass: 'BaseEntity',
      metadata: true,
    },
  ],

  /**
   * Angular builder configuration for MJExplorer and related projects.
   * **NEVER set `aot: false` in production** — Always Ahead-of-Time compilation
   * is required for release builds.
   */
  angularBuilder: {
    sourcemaps: 'development',
    styles: ['packages/Angular/Generic/shared/src/lib/_tokens.scss'],
  },
};
