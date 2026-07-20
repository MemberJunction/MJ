/**
 * Clear baseline-seeded members of the MJ Explorer Regression Suite BEFORE the
 * metadata push (test-suites) re-seeds them from metadata/test-suites/.
 *
 * Why this exists:
 *   A Flyway baseline migration (B*__Baseline.sql) seeds the regression suite
 *   with the member set captured when the baseline was cut. The metadata push
 *   in test-runner-entrypoint.sh then pushes the CURRENT (authoritative) member
 *   set. Because the metadata suite members carry no primaryKey, mj-sync
 *   blind-INSERTs them — and the first member that overlaps a baseline-seeded
 *   row violates UQ_TestSuiteTest_Suite_Test, which rolls back the ENTIRE member
 *   transaction. Net effect: the DB stays stuck at the stale baseline membership
 *   (e.g. 25 members) while the metadata defines many more, so only the baseline
 *   subset ever runs.
 *
 *   Clearing the suite's members first makes the metadata push authoritative:
 *   every member inserts cleanly into an empty membership.
 *
 * Non-fatal: if the suite doesn't exist yet, or the DB is unreachable, we warn
 * and continue (the push itself will surface any real problem).
 */
const { connect } = require('./lib/db.cjs');

// Always the baseline-seeded suite, regardless of which suite is being RUN:
// `mj sync push --include=test-suites` pushes every suite in one transaction,
// so if this one still collides the whole push (including any sub-suite) rolls
// back. Sub-suites are metadata-only (their members carry primaryKeys), so they
// don't need clearing.
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
