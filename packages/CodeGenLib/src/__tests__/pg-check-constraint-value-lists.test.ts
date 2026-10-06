import { describe, it, expect } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';

/**
 * PostgreSQL CHECK-constraint value lists (#4713) — the other dialect of #3978.
 *
 * #3978 taught CodeGen to read SQL Server's unquoted numeric `IN (...)` renderings. PostgreSQL
 * writes the same constraints differently, and none of those forms were read: a numeric list came
 * back empty, and a single-value list came back empty for every type. Two shapes were worse than
 * empty — `ARRAY['100000000000'::bigint, (2)::bigint]` yielded only the quoted element, producing a
 * value list that REFUSES a value the database accepts.
 *
 * EVERY `definition` below was captured from a live PostgreSQL 16 via `pg_get_constraintdef()`.
 * They are what the catalog stores, not what the DDL was typed as.
 */

// Test seam: the parser is protected. Exercising it builds no SQL and opens no connection.
class TestableManageMetadata extends ManageMetadataBase {
   public parse(definition: string, fieldName: string): string[] | null {
      return this.parseCheckConstraintValues(definition, fieldName, 'Test Entity');
   }
}
const mm = new TestableManageMetadata();

describe('PostgreSQL value lists — numeric (#4713)', () => {
   it('parses an int list', () => {
      expect(mm.parse(`CHECK ((i_multi = ANY (ARRAY[1, 2, 3])))`, 'i_multi')).toEqual(['1', '2', '3']);
   });

   it('parses a smallint list', () => {
      expect(mm.parse(`CHECK ((si = ANY (ARRAY[10, 20])))`, 'si')).toEqual(['10', '20']);
   });

   it('parses a numeric list, keeping the scale the catalog stored', () => {
      expect(mm.parse(`CHECK ((num = ANY (ARRAY[0.50, 1.00])))`, 'num')).toEqual(['0.50', '1.00']);
   });

   it('REPRO: reads BOTH elements when PG quotes one and parenthesizes the other', () => {
      // The shipped parser returned ['100000000000'] — a list that refuses the legal value 2.
      expect(mm.parse(`CHECK ((bi = ANY (ARRAY['100000000000'::bigint, (2)::bigint])))`, 'bi'))
         .toEqual(['100000000000', '2']);
   });

   it('REPRO: reads both elements of a negative numeric list', () => {
      expect(mm.parse(`CHECK ((neg = ANY (ARRAY['-1.50'::numeric, 2.25])))`, 'neg'))
         .toEqual(['-1.50', '2.25']);
   });

   it('unwraps a nested cast on a double precision element', () => {
      expect(mm.parse(`CHECK ((dp = ANY (ARRAY[('1000000000000000000000000000000'::numeric)::double precision, (2.5)::double precision])))`, 'dp'))
         .toEqual(['1000000000000000000000000000000', '2.5']);
   });

   it('parses the nullable form', () => {
      expect(mm.parse(`CHECK (((i_null IS NULL) OR (i_null = ANY (ARRAY[1, 2]))))`, 'i_null')).toEqual(['1', '2']);
   });
});

describe('PostgreSQL value lists — single value (#4713)', () => {
   it('parses a single int', () => {
      expect(mm.parse(`CHECK ((i_single = 7))`, 'i_single')).toEqual(['7']);
   });

   it('parses a single zero', () => {
      expect(mm.parse(`CHECK ((i_zero = 0))`, 'i_zero')).toEqual(['0']);
   });

   it('parses a single varchar, which PG casts on both sides', () => {
      expect(mm.parse(`CHECK (((s_single)::text = 'OnlyOne'::text))`, 's_single')).toEqual(['OnlyOne']);
   });

   it('parses a single text value', () => {
      expect(mm.parse(`CHECK ((t_single = 'Solo'::text))`, 't_single')).toEqual(['Solo']);
   });

   it('parses a single uuid', () => {
      expect(mm.parse(`CHECK ((g = '11111111-1111-1111-1111-111111111111'::uuid))`, 'g'))
         .toEqual(['11111111-1111-1111-1111-111111111111']);
   });
});

describe('PostgreSQL value lists — string and date lists still work', () => {
   it('parses the varchar ANY(ARRAY) form', () => {
      const def = `CHECK (((s_multi)::text = ANY ((ARRAY['Active'::character varying, 'Inactive'::character varying])::text[])))`;
      expect(mm.parse(def, 's_multi')).toEqual(['Active', 'Inactive']);
   });

   it('parses a bpchar list', () => {
      expect(mm.parse(`CHECK ((ch = ANY (ARRAY['US'::bpchar, 'CA'::bpchar])))`, 'ch')).toEqual(['US', 'CA']);
   });

   it('parses a date list', () => {
      expect(mm.parse(`CHECK ((d = ANY (ARRAY['2026-01-01'::date, '2026-07-01'::date])))`, 'd'))
         .toEqual(['2026-01-01', '2026-07-01']);
   });
});

describe('PostgreSQL constraints that are NOT value lists', () => {
   // These are the reason the parse is anchored. Each contains an ARRAY whose elements are NOT the
   // field's legal values, so reading numeric elements without anchoring would invert or narrow them.
   it('REFUSES NOT IN — its ARRAY lists what is FORBIDDEN', () => {
      expect(mm.parse(`CHECK ((notin <> ALL (ARRAY[1, 2])))`, 'notin')).toBeNull();
   });

   it('REFUSES a list OR-ed with a range — it permits more than the list', () => {
      expect(mm.parse(`CHECK (((mixed = ANY (ARRAY[1, 2])) OR (mixed > 100)))`, 'mixed')).toBeNull();
   });

   it('refuses a one-sided range', () => {
      expect(mm.parse(`CHECK ((rng > 0))`, 'rng')).toBeNull();
   });

   it('refuses a two-sided range', () => {
      expect(mm.parse(`CHECK (((rng2 >= 0) AND (rng2 <= 100)))`, 'rng2')).toBeNull();
   });

   it('refuses a boolean list — PG booleans are the analogue of SQL Server bit', () => {
      expect(mm.parse(`CHECK ((b_multi = ANY (ARRAY[true, false])))`, 'b_multi')).toBeNull();
      expect(mm.parse(`CHECK ((b_single = true))`, 'b_single')).toBeNull();
   });

   it('refuses a constraint on a DIFFERENT column', () => {
      expect(mm.parse(`CHECK ((other = ANY (ARRAY[1, 2])))`, 'mine')).toBeNull();
   });
});
