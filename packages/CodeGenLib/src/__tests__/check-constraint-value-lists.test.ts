import { describe, it, expect } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';

/**
 * Tests for CHECK-constraint value-list parsing (#3978).
 *
 * A numeric or `bit` `IN (...)` CHECK produced no EntityFieldValue rows and no `ValueListType='List'`,
 * because SQL Server renders those constraints with UNQUOTED literals — `([Level]=(3) OR [Level]=(1))` —
 * and the parser only matched the quoted form used for strings, dates and GUIDs. The field therefore lost
 * both its validation and its dropdown in Explorer (PossibleValues reads the same rows).
 *
 * EVERY `definition` string below was captured from a real SQL Server 2022 instance: a temp table with one
 * `IN`-list CHECK per data type, read back out of `tempdb.sys.check_constraints`. They are what the engine
 * actually stores, not what the DDL was typed as — which is the whole point, since the DDL says
 * `IN (1,2,3)` and the catalog says `([L]=(3) OR [L]=(2) OR [L]=(1))`.
 */

// Test seam: parseCheckConstraintValues and the two statics beside it are protected. Exposing them builds
// no SQL and touches no connection, so no db provider or config is needed to exercise them.
class TestableManageMetadata extends ManageMetadataBase {
   public parse(definition: string, fieldName: string): string[] | null {
      return this.parseCheckConstraintValues(definition, fieldName, 'Test Entity');
   }
   public static eligible(field: { Type?: string; IsPrimaryKey?: boolean; } | undefined): boolean {
      return ManageMetadataBase.isValueListEligibleField(field);
   }
   public static sort(values: string[]): string[] {
      return ManageMetadataBase.sortCheckConstraintValues(values);
   }
}

const mm = new TestableManageMetadata();

describe('parseCheckConstraintValues — quoted literals (strings, dates, GUIDs)', () => {
   it('parses a multi-value string list', () => {
      expect(mm.parse(`([S]='Inactive' OR [S]='Active')`, 'S')).toEqual(['Inactive', 'Active']);
   });

   it('parses a multi-value nchar list', () => {
      expect(mm.parse(`([C]='Output' OR [C]='Input')`, 'C')).toEqual(['Output', 'Input']);
   });

   it('parses a multi-value date list', () => {
      expect(mm.parse(`([D]='2026-07-01' OR [D]='2026-01-01')`, 'D')).toEqual(['2026-07-01', '2026-01-01']);
   });

   it('parses a string list with a trailing IS NULL', () => {
      expect(mm.parse(`([Nul]='B' OR [Nul]='A' OR [Nul] IS NULL)`, 'Nul')).toEqual(['B', 'A']);
   });

   it('parses the nested IS NULL form of a string list', () => {
      expect(mm.parse(`([NullStr] IS NULL OR ([NullStr]='B' OR [NullStr]='A'))`, 'NullStr')).toEqual(['B', 'A']);
   });

   it('normalizes an N-prefixed literal', () => {
      expect(mm.parse(`([S]=N'Inactive' OR [S]=N'Active')`, 'S')).toEqual(['Inactive', 'Active']);
   });

   it('parses the PostgreSQL = ANY (ARRAY[...]) rendering', () => {
      const pg = `CHECK ((("Status")::text = ANY ((ARRAY['Confirmed'::character varying, 'Cancelled'::character varying])::text[])))`;
      expect(mm.parse(pg, 'Status')).toEqual(['Confirmed', 'Cancelled']);
   });
});

describe('parseCheckConstraintValues — unquoted numeric literals (#3978)', () => {
   it('parses an int list', () => {
      expect(mm.parse(`([L]=(3) OR [L]=(2) OR [L]=(1))`, 'L')).toEqual(['3', '2', '1']);
   });

   it('parses a tinyint list', () => {
      expect(mm.parse(`([Ti]=(2) OR [Ti]=(1))`, 'Ti')).toEqual(['2', '1']);
   });

   it('parses a list containing zero and a negative value', () => {
      expect(mm.parse(`([Lneg]=(1) OR [Lneg]=(0) OR [Lneg]=(-1))`, 'Lneg')).toEqual(['1', '0', '-1']);
   });

   it('parses a money list, keeping the literal scale SQL Server stored', () => {
      expect(mm.parse(`([M]=(1.00) OR [M]=(0.50))`, 'M')).toEqual(['1.00', '0.50']);
   });

   it('parses a negative decimal list', () => {
      expect(mm.parse(`([NegDec]=(2.25) OR [NegDec]=(-1.50))`, 'NegDec')).toEqual(['2.25', '-1.50']);
   });

   it('parses a float list stored in exponential form', () => {
      expect(mm.parse(`([F1]=(2.0000000000000002e-005) OR [F1]=(1.0000000000000000e+030))`, 'F1'))
         .toEqual(['2.0000000000000002e-005', '1.0000000000000000e+030']);
   });

   it('strips the trailing point SQL Server adds to a large integral literal', () => {
      expect(mm.parse(`([Big]=(2) OR [Big]=(100000000000.))`, 'Big')).toEqual(['2', '100000000000']);
   });

   it('parses a numeric list with a trailing IS NULL', () => {
      expect(mm.parse(`([NumNull]=(2) OR [NumNull]=(1) OR [NumNull] IS NULL)`, 'NumNull')).toEqual(['2', '1']);
   });

   it('parses the nested IS NULL form of a numeric list', () => {
      expect(mm.parse(`([NullNum] IS NULL OR ([NullNum]=(2) OR [NullNum]=(1)))`, 'NullNum')).toEqual(['2', '1']);
   });
});

describe('parseCheckConstraintValues — single-value lists (#3978)', () => {
   // SQL Server renders `IN ('X')` and `= 'X'` identically, and both permit exactly one value.
   it('parses a single quoted value', () => {
      expect(mm.parse(`([S1]='OnlyOne')`, 'S1')).toEqual(['OnlyOne']);
   });

   it('parses a single datetime2 value', () => {
      expect(mm.parse(`([T]='2026-01-01T00:00:00')`, 'T')).toEqual(['2026-01-01T00:00:00']);
   });

   it('parses a single GUID value', () => {
      expect(mm.parse(`([G]='11111111-1111-1111-1111-111111111111')`, 'G'))
         .toEqual(['11111111-1111-1111-1111-111111111111']);
   });

   it('parses a single numeric value', () => {
      expect(mm.parse(`([L1]=(7))`, 'L1')).toEqual(['7']);
   });

   it('parses a single numeric zero', () => {
      expect(mm.parse(`([Num0]=(0))`, 'Num0')).toEqual(['0']);
   });
});

describe('parseCheckConstraintValues — constraints that are NOT value lists', () => {
   it('rejects a two-sided range', () => {
      expect(mm.parse(`([Rng]>(0) AND [Rng]<(100))`, 'Rng')).toBeNull();
   });

   it('rejects a one-sided range', () => {
      expect(mm.parse(`([Rng2]>=(0))`, 'Rng2')).toBeNull();
   });

   it('rejects a nullable one-sided range', () => {
      expect(mm.parse(`([MaxMessages] IS NULL OR [MaxMessages]>(0))`, 'MaxMessages')).toBeNull();
   });

   it('rejects a LEN() predicate', () => {
      expect(mm.parse(`(len([Len])>(3))`, 'Len')).toBeNull();
   });

   it('rejects a composite predicate that only looks like an equality', () => {
      expect(mm.parse(`(len([Currency])=(3) AND [Currency]=upper([Currency]))`, 'Currency')).toBeNull();
   });

   it('rejects a list OR-ed with a range — it permits more than the list', () => {
      expect(mm.parse(`([Mixed]=(2) OR [Mixed]=(1) OR [Mixed]>(100))`, 'Mixed')).toBeNull();
   });

   it('rejects a comparison against another column', () => {
      expect(mm.parse(`([EndDate]>[StartDate])`, 'EndDate')).toBeNull();
   });
});

describe('isValueListEligibleField — which fields get a value list at all', () => {
   it('excludes a bit field: IN (0,1) is vacuous and = 1 is a validator, not a dropdown', () => {
      expect(TestableManageMetadata.eligible({ Type: 'bit', IsPrimaryKey: false })).toBe(false);
      expect(TestableManageMetadata.eligible({ Type: 'BIT ', IsPrimaryKey: false })).toBe(false);
   });

   it('excludes a primary key: CHECK (ID=1) is a single-row-table guard, not a domain list', () => {
      expect(TestableManageMetadata.eligible({ Type: 'int', IsPrimaryKey: true })).toBe(false);
   });

   it('includes an ordinary numeric or string field', () => {
      expect(TestableManageMetadata.eligible({ Type: 'int', IsPrimaryKey: false })).toBe(true);
      expect(TestableManageMetadata.eligible({ Type: 'nvarchar', IsPrimaryKey: false })).toBe(true);
   });

   it('includes a field whose metadata row was not found, rather than silently dropping it', () => {
      expect(TestableManageMetadata.eligible(undefined)).toBe(true);
   });
});

describe('sortCheckConstraintValues — the sequence a value gets', () => {
   it('sorts an all-numeric list numerically, not lexically', () => {
      expect(TestableManageMetadata.sort(['10', '2', '1'])).toEqual(['1', '2', '10']);
      expect(TestableManageMetadata.sort(['1.50', '-2', '0'])).toEqual(['-2', '0', '1.50']);
   });

   it('sorts anything else lexically, as before', () => {
      expect(TestableManageMetadata.sort(['Pending', 'Active', 'Disabled'])).toEqual(['Active', 'Disabled', 'Pending']);
   });

   it('is stable regardless of the order SQL Server returned the values in', () => {
      expect(TestableManageMetadata.sort(['3', '1', '2'])).toEqual(TestableManageMetadata.sort(['2', '3', '1']));
   });
});
