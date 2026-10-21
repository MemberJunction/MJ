/**
 * Scoped CodeGen config for the pstruth test schema (Predictive Studio truth suite). Copied to
 * .run/codegen/mj.config.cjs by scripts/provision.mjs --codegen; never run against a shared database.
 * includeSchemas is CodeGen's positive scope: __mj and every other schema are excluded. No additionalSchemaInfo.
 */
const path = require('node:path');
const MJ_ROOT = process.env.TRUTH_MJ_ROOT;
if (!MJ_ROOT) throw new Error('TRUTH_MJ_ROOT is not set (scripts/provision.mjs sets it)');
if (!/^MJ_PS_PR\d+_|^test$/.test(process.env.DB_DATABASE || '')) {
  throw new Error(`Refusing to run scoped CodeGen on '${process.env.DB_DATABASE}': only MJ_PS_PR<n>_<agent> or the CI 'test' database`);
}
const base = require(path.join(MJ_ROOT, 'mj.config.cjs'));
const scoped = {
  ...base,
  includeSchemas: ['pstruth'],
  excludeSchemas: ['sys', 'staging'],
  settings: [
    { name: 'mj_core_schema', value: '__mj' },
    { name: 'skip_database_generation', value: false },
    { name: 'recompile_mj_views', value: false },
    { name: 'auto_index_foreign_keys', value: true },
  ],
  newEntityDefaults: {
    ...base.newEntityDefaults,
    TrackRecordChanges: false,
    AddToApplicationWithSchemaName: false,
    NameRulesBySchema: [{ SchemaName: 'pstruth', EntityNamePrefix: 'PS Truth: ', EntityNameSuffix: '' }],
  },
  SQLOutput: {
    ...base.SQLOutput,
    convertCoreSchemaToFlywayMigrationFile: false,
  },
  customSQLScripts: [],
  output: [],
  commands: [],
  schemaOutput: [],
};
delete scoped.additionalSchemaInfo;
module.exports = scoped;
