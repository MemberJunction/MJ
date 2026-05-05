import { describe, it, expect } from 'vitest';
import { EnumCandidateGate } from '../discovery/EnumCandidateGate.js';
import { ColumnDefinition, ColumnStatistics } from '../types/state.js';

/**
 * Helper to create a minimal column with statistics.
 */
function createColumn(overrides: Partial<ColumnDefinition> & { name: string; dataType: string }): ColumnDefinition {
  return {
    isNullable: false,
    isPrimaryKey: false,
    isForeignKey: false,
    descriptionIterations: [],
    ...overrides,
  };
}

function createStats(overrides: Partial<ColumnStatistics>): ColumnStatistics {
  return {
    totalRows: 10000,
    distinctCount: 5,
    uniquenessRatio: 0.0005,
    nullCount: 0,
    nullPercentage: 0,
    sampleValues: [],
    ...overrides,
  };
}

describe('EnumCandidateGate', () => {
  const gate = new EnumCandidateGate();

  describe('Data type gate', () => {
    it('should pass varchar columns', () => {
      const col = createColumn({
        name: 'Status',
        dataType: 'varchar(20)',
        statistics: createStats({
          distinctCount: 3,
          valueDistribution: [
            { value: 'Active', frequency: 5000 },
            { value: 'Inactive', frequency: 3000 },
            { value: 'Pending', frequency: 2000 },
          ],
        }),
      });
      const result = gate.evaluateColumn(col, 10000);
      expect(result).not.toBeNull();
      expect(result!.columnName).toBe('Status');
    });

    it('should pass nvarchar columns', () => {
      const col = createColumn({
        name: 'Type',
        dataType: 'nvarchar(30)',
        statistics: createStats({
          distinctCount: 4,
          valueDistribution: [
            { value: 'Individual', frequency: 3000 },
            { value: 'Corporate', frequency: 3000 },
            { value: 'Student', frequency: 2000 },
            { value: 'Guest', frequency: 2000 },
          ],
        }),
      });
      expect(gate.evaluateColumn(col, 10000)).not.toBeNull();
    });

    it('should reject integer columns', () => {
      const col = createColumn({
        name: 'StatusCode',
        dataType: 'int',
        statistics: createStats({ distinctCount: 3 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject date columns', () => {
      const col = createColumn({
        name: 'CreatedDate',
        dataType: 'datetime',
        statistics: createStats({ distinctCount: 3 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject uniqueidentifier columns', () => {
      const col = createColumn({
        name: 'ID',
        dataType: 'uniqueidentifier',
        statistics: createStats({ distinctCount: 3 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject bit/boolean columns', () => {
      const col = createColumn({
        name: 'IsActive',
        dataType: 'bit',
        statistics: createStats({ distinctCount: 2 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });
  });

  describe('Column length gate', () => {
    it('should reject varchar(max)', () => {
      const col = createColumn({
        name: 'LongField',
        dataType: 'varchar(max)',
        statistics: createStats({ distinctCount: 3 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject nvarchar(255) — exceeds 50 char limit', () => {
      const col = createColumn({
        name: 'LargeField',
        dataType: 'nvarchar(255)',
        statistics: createStats({
          distinctCount: 5,
          valueDistribution: [
            { value: 'A', frequency: 2000 },
            { value: 'B', frequency: 2000 },
            { value: 'C', frequency: 2000 },
            { value: 'D', frequency: 2000 },
            { value: 'E', frequency: 2000 },
          ],
        }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should pass varchar(50)', () => {
      const col = createColumn({
        name: 'Priority',
        dataType: 'varchar(50)',
        statistics: createStats({
          distinctCount: 3,
          valueDistribution: [
            { value: 'High', frequency: 3000 },
            { value: 'Medium', frequency: 4000 },
            { value: 'Low', frequency: 3000 },
          ],
        }),
      });
      expect(gate.evaluateColumn(col, 10000)).not.toBeNull();
    });

    it('should reject unbounded text', () => {
      const col = createColumn({
        name: 'Body',
        dataType: 'text',
        statistics: createStats({ distinctCount: 3 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });
  });

  describe('Name exclusion gate', () => {
    it('should reject columns matching Notes pattern', () => {
      const col = createColumn({
        name: 'UserNotes',
        dataType: 'varchar(50)',
        statistics: createStats({ distinctCount: 3 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject columns matching Description pattern', () => {
      const col = createColumn({
        name: 'ItemDescription',
        dataType: 'varchar(30)',
        statistics: createStats({ distinctCount: 5 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject columns matching Address pattern', () => {
      const col = createColumn({
        name: 'StreetAddress',
        dataType: 'varchar(40)',
        statistics: createStats({ distinctCount: 3 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject columns matching Comment pattern', () => {
      const col = createColumn({
        name: 'ReviewComment',
        dataType: 'varchar(20)',
        statistics: createStats({ distinctCount: 3 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });
  });

  describe('Key gate', () => {
    it('should reject primary key columns', () => {
      const col = createColumn({
        name: 'StatusCode',
        dataType: 'varchar(20)',
        isPrimaryKey: true,
        statistics: createStats({
          distinctCount: 5,
          valueDistribution: [
            { value: 'A', frequency: 2000 },
            { value: 'B', frequency: 2000 },
            { value: 'C', frequency: 2000 },
            { value: 'D', frequency: 2000 },
            { value: 'E', frequency: 2000 },
          ],
        }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject foreign key columns', () => {
      const col = createColumn({
        name: 'TypeID',
        dataType: 'varchar(20)',
        isForeignKey: true,
        statistics: createStats({ distinctCount: 3 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });
  });

  describe('Data pattern gate', () => {
    it('should reject sequential pattern', () => {
      const col = createColumn({
        name: 'Code',
        dataType: 'varchar(10)',
        statistics: createStats({ distinctCount: 5, dataPattern: 'sequential' }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject guid pattern', () => {
      const col = createColumn({
        name: 'Token',
        dataType: 'varchar(36)',
        statistics: createStats({ distinctCount: 5, dataPattern: 'guid' }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject composite pattern', () => {
      const col = createColumn({
        name: 'CompoundKey',
        dataType: 'varchar(20)',
        statistics: createStats({ distinctCount: 5, dataPattern: 'composite' }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should pass natural pattern', () => {
      const col = createColumn({
        name: 'Status',
        dataType: 'varchar(20)',
        statistics: createStats({
          distinctCount: 3,
          dataPattern: 'natural',
          valueDistribution: [
            { value: 'Active', frequency: 5000 },
            { value: 'Inactive', frequency: 3000 },
            { value: 'Pending', frequency: 2000 },
          ],
        }),
      });
      expect(gate.evaluateColumn(col, 10000)).not.toBeNull();
    });
  });

  describe('Distinct count gate', () => {
    it('should reject single-value columns', () => {
      const col = createColumn({
        name: 'Status',
        dataType: 'varchar(20)',
        statistics: createStats({
          distinctCount: 1,
          valueDistribution: [{ value: 'Active', frequency: 10000 }],
        }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should reject columns with > 50 distinct values', () => {
      const col = createColumn({
        name: 'Category',
        dataType: 'varchar(20)',
        statistics: createStats({ distinctCount: 51 }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should pass columns with 2 distinct values', () => {
      const col = createColumn({
        name: 'Gender',
        dataType: 'varchar(10)',
        statistics: createStats({
          distinctCount: 2,
          valueDistribution: [
            { value: 'Male', frequency: 5000 },
            { value: 'Female', frequency: 5000 },
          ],
        }),
      });
      expect(gate.evaluateColumn(col, 10000)).not.toBeNull();
    });

    it('should pass columns with 50 distinct values', () => {
      const values = Array.from({ length: 50 }, (_, i) => ({
        value: `Value${i}`, frequency: 200,
      }));
      const col = createColumn({
        name: 'State',
        dataType: 'varchar(20)',
        statistics: createStats({
          distinctCount: 50,
          valueDistribution: values,
        }),
      });
      expect(gate.evaluateColumn(col, 10000)).not.toBeNull();
    });
  });

  describe('Cardinality ratio gate', () => {
    it('should reject high-cardinality columns (> 5%)', () => {
      const col = createColumn({
        name: 'Name',
        dataType: 'varchar(20)',
        statistics: createStats({
          distinctCount: 600,  // 6% of 10000
          valueDistribution: [{ value: 'A', frequency: 1 }],  // insufficient values
        }),
      });
      // distinctCount > 50 also fails the distinct count gate
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should bypass cardinality gate for small tables (< 50 rows)', () => {
      const col = createColumn({
        name: 'Status',
        dataType: 'varchar(20)',
        statistics: createStats({
          totalRows: 30,
          distinctCount: 3,
          uniquenessRatio: 0.1,
          valueDistribution: [
            { value: 'Active', frequency: 15 },
            { value: 'Inactive', frequency: 10 },
            { value: 'Pending', frequency: 5 },
          ],
        }),
      });
      // 3/30 = 10% cardinality, but table has < 50 rows, so gate is bypassed
      expect(gate.evaluateColumn(col, 30)).not.toBeNull();
    });
  });

  describe('Value extraction', () => {
    it('should extract values from valueDistribution', () => {
      const col = createColumn({
        name: 'Priority',
        dataType: 'varchar(10)',
        statistics: createStats({
          distinctCount: 3,
          valueDistribution: [
            { value: 'High', frequency: 3000 },
            { value: 'Medium', frequency: 4000 },
            { value: 'Low', frequency: 3000 },
          ],
        }),
      });
      const result = gate.evaluateColumn(col, 10000);
      expect(result).not.toBeNull();
      expect(result!.values).toEqual(['High', 'Medium', 'Low']);
    });

    it('should fall back to sampleValues when no valueDistribution', () => {
      const col = createColumn({
        name: 'Status',
        dataType: 'varchar(20)',
        statistics: createStats({
          distinctCount: 2,
          sampleValues: ['Active', 'Inactive', 'Active', 'Active'],
        }),
      });
      const result = gate.evaluateColumn(col, 10000);
      expect(result).not.toBeNull();
      expect(result!.values).toEqual(['Active', 'Inactive']);
    });

    it('should trim whitespace from values', () => {
      const col = createColumn({
        name: 'Status',
        dataType: 'varchar(20)',
        statistics: createStats({
          distinctCount: 2,
          valueDistribution: [
            { value: 'Active ', frequency: 5000 },
            { value: ' Inactive', frequency: 5000 },
          ],
        }),
      });
      const result = gate.evaluateColumn(col, 10000);
      expect(result).not.toBeNull();
      expect(result!.values).toEqual(['Active', 'Inactive']);
    });

    it('should drop empty strings and null sentinels', () => {
      const col = createColumn({
        name: 'Category',
        dataType: 'varchar(20)',
        statistics: createStats({
          distinctCount: 5,
          valueDistribution: [
            { value: '', frequency: 100 },
            { value: 'NULL', frequency: 50 },
            { value: 'N/A', frequency: 50 },
            { value: 'TypeA', frequency: 4000 },
            { value: 'TypeB', frequency: 5800 },
          ],
        }),
      });
      const result = gate.evaluateColumn(col, 10000);
      expect(result).not.toBeNull();
      expect(result!.values).toEqual(['TypeA', 'TypeB']);
    });

    it('should reject when fewer than 2 values after normalization', () => {
      const col = createColumn({
        name: 'Singleton',
        dataType: 'varchar(10)',
        statistics: createStats({
          distinctCount: 3,
          valueDistribution: [
            { value: '', frequency: 100 },
            { value: 'NULL', frequency: 50 },
            { value: 'OnlyValue', frequency: 9850 },
          ],
        }),
      });
      expect(gate.evaluateColumn(col, 10000)).toBeNull();
    });
  });

  describe('evaluateTable', () => {
    it('should return only columns that pass all gates', () => {
      const columns: ColumnDefinition[] = [
        createColumn({
          name: 'ID',
          dataType: 'int',
          isPrimaryKey: true,
          statistics: createStats({ distinctCount: 10000 }),
        }),
        createColumn({
          name: 'Status',
          dataType: 'varchar(20)',
          statistics: createStats({
            distinctCount: 3,
            valueDistribution: [
              { value: 'Active', frequency: 5000 },
              { value: 'Inactive', frequency: 3000 },
              { value: 'Pending', frequency: 2000 },
            ],
          }),
        }),
        createColumn({
          name: 'Description',
          dataType: 'varchar(200)',
          statistics: createStats({ distinctCount: 8000 }),
        }),
        createColumn({
          name: 'Priority',
          dataType: 'varchar(10)',
          statistics: createStats({
            distinctCount: 3,
            valueDistribution: [
              { value: 'High', frequency: 3000 },
              { value: 'Medium', frequency: 4000 },
              { value: 'Low', frequency: 3000 },
            ],
          }),
        }),
      ];

      const results = gate.evaluateTable(columns, 10000);
      expect(results).toHaveLength(2);
      expect(results.map(r => r.columnName)).toEqual(['Status', 'Priority']);
    });

    it('should return empty array when no candidates pass', () => {
      const columns: ColumnDefinition[] = [
        createColumn({
          name: 'ID',
          dataType: 'int',
          isPrimaryKey: true,
          statistics: createStats({ distinctCount: 10000 }),
        }),
        createColumn({
          name: 'Notes',
          dataType: 'varchar(max)',
          statistics: createStats({ distinctCount: 5000 }),
        }),
      ];
      expect(gate.evaluateTable(columns, 10000)).toEqual([]);
    });
  });

  describe('Result shape', () => {
    it('should return correct cardinalityRatio and metadata', () => {
      const col = createColumn({
        name: 'Status',
        dataType: 'nvarchar(20)',
        statistics: createStats({
          distinctCount: 4,
          totalRows: 10000,
          valueDistribution: [
            { value: 'A', frequency: 2500 },
            { value: 'B', frequency: 2500 },
            { value: 'C', frequency: 2500 },
            { value: 'D', frequency: 2500 },
          ],
        }),
      });
      const result = gate.evaluateColumn(col, 10000);
      expect(result).not.toBeNull();
      expect(result!.distinctCount).toBe(4);
      expect(result!.totalRows).toBe(10000);
      expect(result!.cardinalityRatio).toBeCloseTo(0.0004);
      expect(result!.dataType).toBe('nvarchar(20)');
      expect(result!.maxLength).toBe(20);
    });
  });

  describe('Custom config', () => {
    it('should respect custom maxDistinctValues', () => {
      const strictGate = new EnumCandidateGate({ maxDistinctValues: 5 });
      const col = createColumn({
        name: 'Category',
        dataType: 'varchar(20)',
        statistics: createStats({
          distinctCount: 6,
          valueDistribution: Array.from({ length: 6 }, (_, i) => ({
            value: `Cat${i}`, frequency: 1666,
          })),
        }),
      });
      expect(strictGate.evaluateColumn(col, 10000)).toBeNull();
    });

    it('should respect custom excludeColumnNamePatterns', () => {
      const customGate = new EnumCandidateGate({
        excludeColumnNamePatterns: [/^Custom/i],
      });
      const col = createColumn({
        name: 'CustomField',
        dataType: 'varchar(20)',
        statistics: createStats({
          distinctCount: 3,
          valueDistribution: [
            { value: 'A', frequency: 3333 },
            { value: 'B', frequency: 3333 },
            { value: 'C', frequency: 3334 },
          ],
        }),
      });
      expect(customGate.evaluateColumn(col, 10000)).toBeNull();
    });
  });
});
