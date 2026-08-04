import { describe, it, expect, beforeEach } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';
import type { SmartFieldIdentificationResult } from '../Misc/advanced_generation';

/**
 * END-TO-END pipeline test for the CodeGen search-tightening guardrails.
 *
 * The unit tests in `search-guardrails.test.ts` exercise each pure heuristic in
 * isolation. This suite instead drives the WIRED composition on `ManageMetadataBase`
 * — `normalizeSearchFlagsInPlace()` (field-level: eligibility → narrative block →
 * per-entity cap → predicate normalization) followed by `applyEntitySearchConfig()`
 * (entity-level: the default-off 0→1 enable gate) — with realistic entity + field
 * metadata, and asserts the three outcomes the PR promises:
 *
 *   - Member (primary)     → keeps a small, capped set of name/identifier fields
 *                            with BeginsWith/Exact predicates; entity search enabled.
 *   - Order Lines (detail) → entity-level search enable is REFUSED even with a
 *                            surviving field and high confidence (detail/line-item shape).
 *   - Countries (lookup)   → the guardrails PRESERVE a prompt-driven `false`, but —
 *                            documented explicitly — do NOT manufacture it: a lookup
 *                            table is turned off by the PROMPT (Phase 1), not the code
 *                            guardrails (Phase 2), because its name matches no
 *                            log/audit or detail/line-item shape.
 *
 * These paths only build SQL strings (no DB round-trip), so — like the sibling
 * guardrail suite — no db provider/config is needed to exercise them.
 */

type TestEntity = {
   ID: string;
   Name?: string;
   SchemaName?: string;
   FullTextSearchEnabled?: boolean;
   AllowUserSearchAPI?: boolean;
   AutoUpdateAllowUserSearchAPI?: boolean;
};

// Test seam: expose the two protected pipeline stages the LLM result flows through.
class TestableManageMetadata extends ManageMetadataBase {
   public normalizeSearch(entity: TestEntity, fields: Array<Record<string, unknown>>, result: SmartFieldIdentificationResult): void {
      this.normalizeSearchFlagsInPlace(entity, fields, result);
   }
   public entitySearchConfigSQL(entity: TestEntity, result: SmartFieldIdentificationResult): string[] {
      const sql: string[] = [];
      this.applyEntitySearchConfig(sql, entity, result);
      return sql;
   }
}

/** A SmartFieldIdentificationResult with the required keys defaulted, i.e. an LLM proposal. */
function proposal(overrides: Partial<SmartFieldIdentificationResult> = {}): SmartFieldIdentificationResult {
   return {
      nameFields: [],
      nameFieldsReason: '',
      defaultInView: [],
      defaultInViewReason: '',
      searchableFields: [],
      searchableFieldsReason: '',
      confidence: 'high',
      ...overrides,
   };
}

/** A field metadata row as `normalizeSearchFlagsInPlace` sees it. `Length: -1` is nvarchar(MAX). */
function field(name: string, type: string, length: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
   return {
      ID: `f-${name}`,
      Name: name,
      Type: type,
      Length: length,
      IsPrimaryKey: false,
      AutoUpdateIncludeInUserSearchAPI: true,
      AutoUpdateUserSearchPredicate: true,
      ...extra,
   };
}

const PK_ID = { ID: 'f-ID', Name: 'ID', Type: 'uniqueidentifier', Length: 16, IsPrimaryKey: true };

/** field name -> normalized predicate, for concise assertions. */
function predicateMap(result: SmartFieldIdentificationResult): Record<string, string> {
   return Object.fromEntries((result.searchPredicates ?? []).map(p => [p.field, p.predicate]));
}

describe('search tightening — end-to-end pipeline', () => {
   let mm: TestableManageMetadata;
   beforeEach(() => {
      mm = new TestableManageMetadata();
   });

   describe('Member (primary entity)', () => {
      const entity: TestEntity = {
         ID: 'e-member',
         Name: 'Members',
         FullTextSearchEnabled: false,
         AllowUserSearchAPI: false,
         AutoUpdateAllowUserSearchAPI: true,
      };
      const fields = [
         field('FirstName', 'nvarchar', 100),
         field('LastName', 'nvarchar', 100),
         field('Email', 'nvarchar', 255),
         field('City', 'nvarchar', 100),
         field('Comments', 'nvarchar', -1), // narrative + unbounded
         field('MembershipNumber', 'nvarchar', 50),
         PK_ID,
      ];

      it('narrows a wide proposal to a capped name/identifier set, drops narrative + filter fields', () => {
         const result = proposal({
            allowUserSearch: true,
            // A deliberately over-broad proposal: narrative (Comments), a filter target
            // (City), and more identifiers than the cap allows.
            searchableFields: ['FirstName', 'LastName', 'Email', 'City', 'Comments', 'MembershipNumber'],
            // The LLM asked for Contains on a non-FTS entity — must be rewritten.
            searchPredicates: [{ field: 'Email', predicate: 'Contains' }],
            fullTextSearchFields: [],
         });

         mm.normalizeSearch(entity, fields, result);

         // Capped to 3 (MAX_SEARCHABLE_FIELDS_PER_ENTITY), preferring name-like then identifier.
         expect(result.searchableFields).toEqual(['FirstName', 'LastName', 'Email']);
         expect(result.searchableFields).not.toContain('Comments'); // narrative dropped
         expect(result.searchableFields).not.toContain('City');     // filter target, capped out
         expect(result.allowUserSearch).toBe(true);

         // Predicates: name-like → BeginsWith, identifier → Exact, and the proposed
         // Contains on Email was rewritten (no Contains survives on a non-FTS entity).
         const preds = predicateMap(result);
         expect(preds['FirstName']).toBe('BeginsWith');
         expect(preds['LastName']).toBe('BeginsWith');
         expect(preds['Email']).toBe('Exact');
         expect((result.searchPredicates ?? []).some(p => p.predicate === 'Contains')).toBe(false);
      });

      it('accepts the entity-level 0→1 enable (high confidence, surviving fields, ordinary entity)', () => {
         const result = proposal({
            allowUserSearch: true,
            searchableFields: ['FirstName', 'LastName', 'Email'],
         });
         mm.normalizeSearch(entity, fields, result);
         const sql = mm.entitySearchConfigSQL(entity, result);

         // A statement is emitted only when the enable survives the gate.
         expect(sql).toHaveLength(1);
         expect(sql[0]).toContain('AllowUserSearchAPI');
         expect(sql[0]).toContain('e-member');
      });
   });

   describe('Order Lines (detail/line-item entity)', () => {
      const entity: TestEntity = {
         ID: 'e-orderlines',
         Name: 'Order Lines',
         FullTextSearchEnabled: false,
         AllowUserSearchAPI: false,
         AutoUpdateAllowUserSearchAPI: true,
      };
      const fields = [
         field('SKU', 'nvarchar', 50),
         field('LineDescription', 'nvarchar', 500), // narrative (Description suffix)
         field('Comments', 'nvarchar', -1),
         { ID: 'f-OrderID', Name: 'OrderID', Type: 'uniqueidentifier', Length: 16 }, // FK, non-text
         { ID: 'f-Qty', Name: 'Quantity', Type: 'int', Length: 4 },
         PK_ID,
      ];

      it('REFUSES the entity-level enable even with a surviving field and high confidence', () => {
         const result = proposal({
            allowUserSearch: true,
            searchableFields: ['LineDescription', 'SKU', 'Comments'],
            fullTextSearchFields: [],
         });

         mm.normalizeSearch(entity, fields, result);

         // Field-level: narrative fields are gone; SKU (an identifier) survives, so the
         // field stage alone would NOT have disabled the entity.
         expect(result.searchableFields).toEqual(['SKU']);
         expect(result.searchableFields).not.toContain('LineDescription');
         expect(result.allowUserSearch).toBe(true);

         // Entity-level: the detail/line-item shape blocks the 0→1 flip — no SQL emitted,
         // so Order Lines stays non-searchable. THIS is the distinctive Phase-2 guardrail.
         const sql = mm.entitySearchConfigSQL(entity, result);
         expect(sql).toHaveLength(0);
      });

      it('also collapses to allowUserSearch=false at the field stage when only narrative fields are proposed', () => {
         const result = proposal({
            allowUserSearch: true,
            searchableFields: ['LineDescription', 'Comments'],
         });
         mm.normalizeSearch(entity, fields, result);
         expect(result.searchableFields).toEqual([]);
         expect(result.allowUserSearch).toBe(false); // no field survived → enable can't stand
         expect(mm.entitySearchConfigSQL(entity, result)).toHaveLength(0);
      });
   });

   describe('Countries (lookup entity)', () => {
      const entity: TestEntity = {
         ID: 'e-countries',
         Name: 'Countries',
         FullTextSearchEnabled: false,
         AllowUserSearchAPI: false,
         AutoUpdateAllowUserSearchAPI: true,
      };
      const fields = [
         field('Name', 'nvarchar', 200),
         field('ISOCode', 'nvarchar', 3), // identifier (Code suffix)
         PK_ID,
      ];

      it('preserves a prompt-driven `false` — the guardrails never re-enable it', () => {
         const result = proposal({ allowUserSearch: false, searchableFields: [] });
         mm.normalizeSearch(entity, fields, result);
         expect(result.allowUserSearch).toBe(false);
         expect(result.searchableFields).toEqual([]);
         // false == current false → nothing to write.
         expect(mm.entitySearchConfigSQL(entity, result)).toHaveLength(0);
      });

      it('DOCUMENTS THE LAYER BOUNDARY: the code guardrails do NOT force a lookup to false', () => {
         // A lookup table like Countries is turned off by the tightened PROMPT (Phase 1,
         // template Example 5 → allowUserSearch=false), NOT by the code guardrails: its name
         // matches neither the log/audit nor the detail/line-item shape, and it has a valid
         // name-like field. So if the prompt ever regressed and proposed `true`, Phase 2
         // would let it through. This test pins that boundary so a future reader knows the
         // Countries=false guarantee lives in the prompt, and a regression there won't be
         // caught here.
         const result = proposal({ allowUserSearch: true, searchableFields: ['Name'] });
         mm.normalizeSearch(entity, fields, result);
         expect(result.searchableFields).toEqual(['Name']);
         expect(result.allowUserSearch).toBe(true);
         const sql = mm.entitySearchConfigSQL(entity, result);
         expect(sql).toHaveLength(1); // enable accepted — Phase 2 does not block an ordinary lookup
      });
   });
});
