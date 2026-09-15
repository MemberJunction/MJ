/**
 * Clear baseline-seeded members of the MJ Explorer Regression Suite BEFORE any
 * test/suite metadata push, so the metadata becomes authoritative.
 *
 * Why this exists — two independent failures, both caused by the same stale rows:
 *
 *   1. UQ collision. A Flyway baseline migration (B*__Baseline.sql) seeds this
 *      suite with the 25 members captured when the baseline was cut. Six of
 *      those TestIDs are reused by tests in metadata-optional/regression-test,
 *      which carry their own member primaryKeys — different PKs for the same
 *      (SuiteID, TestID) pair. Pushing them violates UQ_TestSuiteTest_Suite_Test
 *      and rolls back the ENTIRE member transaction, leaving the DB stuck at the
 *      stale 25-member baseline while the metadata defines 155.
 *
 *   2. FK block. All 25 baseline members hold an FK to a Computer Use test that
 *      metadata/tests/regression/.deleted-computer-use-tests.json prunes, so the
 *      delete records cannot apply while those members exist.
 *
 *   Clearing the suite's members first fixes both: the deletes are unblocked and
 *   every metadata member inserts cleanly into an empty membership.
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
