import { describe, it, expect } from 'vitest';
import { ManageMetadataBase } from '../Database/manage-metadata';

/**
 * Relationship sync looks up the existing EntityRelationship rows for each FK entity pair. The rows
 * come from the database and the FK fields from vwEntityFields, so the two sides can spell a UUID in
 * different cases (SQL Server upper-case, PostgreSQL lower-case). The lookup must match in any case
 * and return a pair's rows in their original order, exactly as a filter over every row would.
 */
class TestableManageMetadata extends ManageMetadataBase {
   public static lookup<T extends { EntityID: string; RelatedEntityID: string }>(rows: T[]) {
      return ManageMetadataBase.relationshipsByEntityPair(rows);
   }
}

const ORDERS = 'aaaaaaaa-0000-0000-0000-000000000001';
const CUSTOMERS = 'bbbbbbbb-0000-0000-0000-000000000002';
const LINES = 'cccccccc-0000-0000-0000-000000000003';

const rows = [
   { ID: 'customer-orders-billing', EntityID: CUSTOMERS.toUpperCase(), RelatedEntityID: ORDERS.toUpperCase() },
   { ID: 'order-lines', EntityID: ORDERS, RelatedEntityID: LINES },
   { ID: 'customer-orders-shipping', EntityID: CUSTOMERS, RelatedEntityID: ORDERS },
   { ID: 'orders-customers', EntityID: ORDERS, RelatedEntityID: CUSTOMERS },
];

describe('ManageMetadataBase.relationshipsByEntityPair', () => {
   it('returns every row for a pair, in order, whatever case either ID is in', () => {
      const forPair = TestableManageMetadata.lookup(rows);
      expect(forPair(CUSTOMERS, ORDERS).map(r => r.ID)).toEqual(['customer-orders-billing', 'customer-orders-shipping']);
      expect(forPair(ORDERS.toUpperCase(), LINES.toUpperCase()).map(r => r.ID)).toEqual(['order-lines']);
   });

   it('treats the pair as ordered and returns an empty list for a pair with no rows', () => {
      const forPair = TestableManageMetadata.lookup(rows);
      expect(forPair(ORDERS, CUSTOMERS).map(r => r.ID)).toEqual(['orders-customers']);
      expect(forPair(LINES, ORDERS)).toEqual([]);
   });
});
