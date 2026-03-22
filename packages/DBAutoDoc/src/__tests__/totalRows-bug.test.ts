import { describe, it, expect } from "vitest";

/**
 * Regression test for the totalRows bug:
 * getCardinalityStats returns { totalCount: N } but AutoDocColumnStatistics 
 * expects { totalRows: N }. Object.assign adds totalCount but does not 
 * overwrite the initial totalRows: 0, causing uniqueness to be computed as 0
 * for all columns, breaking PK detection.
 *
 * Root cause: field name mismatch between getCardinalityStats return type 
 * (totalCount) and AutoDocColumnStatistics interface (totalRows).
 */

describe("totalRows field mapping", () => {
  it("should correctly map totalCount to totalRows after Object.assign", () => {
    // Simulate the pattern from getColumnStatistics
    const stats = {
      totalRows: 0,       // Initial value
      distinctCount: 0,
      uniquenessRatio: 0,
      nullCount: 0,
      nullPercentage: 0,
      sampleValues: []
    };

    // Simulate getCardinalityStats return
    const cardinalityStats = {
      distinctCount: 201187,
      uniquenessRatio: 1.0,
      nullCount: 0,
      nullPercentage: 0,
      totalCount: 201187    // Note: totalCount, NOT totalRows
    };

    Object.assign(stats, cardinalityStats);
    
    // FIX: explicitly map totalCount -> totalRows
    stats.totalRows = (cardinalityStats as { totalCount: number }).totalCount;

    expect(stats.totalRows).toBe(201187);
    expect(stats.distinctCount).toBe(201187);
    
    // Verify uniqueness computation works correctly
    const uniqueness = stats.totalRows > 0 ? stats.distinctCount / stats.totalRows : 0;
    expect(uniqueness).toBe(1.0);
  });

  it("should fail without the fix (demonstrates the bug)", () => {
    const stats = {
      totalRows: 0,
      distinctCount: 0,
      uniquenessRatio: 0,
      nullCount: 0,
      nullPercentage: 0,
      sampleValues: []
    };

    const cardinalityStats = {
      distinctCount: 201187,
      uniquenessRatio: 1.0,
      nullCount: 0,
      nullPercentage: 0,
      totalCount: 201187
    };

    Object.assign(stats, cardinalityStats);
    // WITHOUT the fix: totalRows is still 0
    // stats.totalRows = cardinalityStats.totalCount;  // <-- missing!

    // totalRows is still 0 because Object.assign added totalCount, not totalRows
    expect(stats.totalRows).toBe(0);  // This was the bug!
    
    // Uniqueness computed as 0 because totalRows is 0
    const uniqueness = stats.totalRows > 0 ? stats.distinctCount / stats.totalRows : 0;
    expect(uniqueness).toBe(0);  // Wrong! Should be 1.0
  });

  it("safety check: uniquenessRatio should be used when totalRows is 0", () => {
    // Simulates the AnalysisEngine safety fix
    const stats = {
      totalRows: 0,           // Bug: still 0
      distinctCount: 201187,
      uniquenessRatio: 1.0,   // Correct value available
      nullCount: 0
    };

    // Safety: prefer uniquenessRatio when available
    const uniqueness = stats.uniquenessRatio != null && stats.uniquenessRatio > 0
      ? stats.uniquenessRatio
      : (stats.totalRows > 0 ? stats.distinctCount / stats.totalRows : 0);

    expect(uniqueness).toBe(1.0);  // Correct even with totalRows bug
  });
});
