/**
 * Tests for the SQL-log size-split defaults at the MetadataSync layer.
 *
 * The streaming rollover itself is tested in @memberjunction/generic-database-provider
 * (sql-logger.test.ts); what belongs HERE is the contract this package adds on top:
 * the 90 MiB default injected by the push/watch capture paths, chosen to stay safely
 * under GitHub's 100 MiB push-block.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_SQL_LOG_MAX_FILE_SIZE } from '../config';

describe('DEFAULT_SQL_LOG_MAX_FILE_SIZE', () => {
  it('is 90 MiB', () => {
    expect(DEFAULT_SQL_LOG_MAX_FILE_SIZE).toBe(90 * 1024 * 1024);
  });

  it('stays under the GitHub 100 MiB push-block with real headroom', () => {
    const GITHUB_PUSH_BLOCK = 100 * 1024 * 1024;
    // ≥5 MiB of headroom guards against footer slack, encoding differences, and a
    // future edit nudging the default up to the cliff edge.
    expect(DEFAULT_SQL_LOG_MAX_FILE_SIZE).toBeLessThanOrEqual(GITHUB_PUSH_BLOCK - 5 * 1024 * 1024);
  });

  it('respects the maxFileSize=0 opt-out convention (0 must mean "disabled", not "0 bytes")', () => {
    // The provider treats a non-positive maxFileSize as splitting-disabled; the default must
    // therefore be strictly positive or the push path would silently disable splitting.
    expect(DEFAULT_SQL_LOG_MAX_FILE_SIZE).toBeGreaterThan(0);
  });
});
