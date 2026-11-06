/**
 * Which databases the truth suite may write to: a private per-agent database (`MJ_PS_PR<n>_<agent>`) or CI's
 * ephemeral `test` database. truth:provision checks it before `mj migrate`, and the scoped CodeGen config checks it
 * again before CodeGen runs. Provisioning copies this file next to the config in .run/codegen.
 *
 * Twin: src/db/private-database.ts holds the same rule for the harness (TypeScript/ESM, compiled to dist/, so it
 * cannot share this CommonJS file). src/db/__tests__/private-database.test.ts fails if the two differ.
 */
const PRIVATE_TRUTH_DATABASE = /^MJ_PS_PR\d+_|^test$/;

/** True when `name` is a database the truth suite may provision, load or reconfigure. */
function IsPrivateTruthDatabase(name) {
  return typeof name === 'string' && PRIVATE_TRUTH_DATABASE.test(name);
}

const PRIVATE_TRUTH_DATABASE_DESCRIPTION = "MJ_PS_PR<n>_<agent> or the CI 'test' database";

module.exports = { PRIVATE_TRUTH_DATABASE, PRIVATE_TRUTH_DATABASE_DESCRIPTION, IsPrivateTruthDatabase };
