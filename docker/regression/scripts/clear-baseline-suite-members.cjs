/**
 * Clear baseline-seeded members of the MJ Explorer Regression Suite BEFORE any
 * test/suite metadata push, so the metadata becomes authoritative.
 *
 * Why this exists — and what has since stopped being true.
 *
 *   Originally this guarded two failures caused by the baseline-seeded members:
 *   a UQ collision, because six of the consolidated tests reused a baseline
 *   TestID with a different member primaryKey; and an FK block, because the
 *   delete records that pruned the old T01-T25 could not apply while those
 *   members existed.
 *
 *   Both are gone. The six tests were given fresh keys, so no metadata member
 *   reuses a baseline (SuiteID, TestID) pair; and the prune moved out of metadata
 *   into migrations/v6/V202609181937__v6.2.x__Prune_Pre_Consolidation_ComputerUse_Tests.sql,
 *   which drops all 25 memberships during db-setup. On a database built fresh
 *   from migrations this script now finds nothing to clear.
 *
 *   It is kept for the reruns that do NOT start fresh: on a persistent volume the
 *   previous run's members are still there, and clearing them keeps the metadata
 *   push authoritative rather than layering onto whatever the last run left.
 *
 * Non-fatal: if the suite doesn't exist yet, or the DB is unreachable, we warn
 * and continue (the push itself will surface any real problem).
 */
const { connect } = require('./lib/db.cjs');

// Always the baseline-seeded suite, regardless of which suite is being RUN:
// `mj sync push --include=test-suites` pushes every suite in one transaction,
// so if this one still collides the whole push (including any sub-suite) rolls
// back. Sub-suites are metadata-only (their members carry primaryKeys that no
// baseline seeded), so they don't need clearing.
const SUITE_NAME = 'MJ Explorer Regression Suite';

(async () => {
  let pool;
  try {
    pool = await connect();
    const result = await pool
      .request()
      .input('name', SUITE_NAME)
      .query(`
        DELETE tst
        FROM __mj.TestSuiteTest tst
        INNER JOIN __mj.TestSuite s ON tst.SuiteID = s.ID
        WHERE s.Name = @name;
        SELECT @@ROWCOUNT AS deleted;`);
    const deleted = result.recordset?.[0]?.deleted ?? 0;
    console.log(`  Cleared ${deleted} baseline-seeded member(s) from "${SUITE_NAME}"`);
  } catch (err) {
    console.log(`  WARNING: clear-baseline-suite-members failed (non-fatal): ${err.message}`);
  } finally {
    if (pool) {
      try { await pool.close(); } catch { /* ignore */ }
    }
  }
})();
