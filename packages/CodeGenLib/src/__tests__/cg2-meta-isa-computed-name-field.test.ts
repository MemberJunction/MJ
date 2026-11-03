/**
 * An IS-A child's mirror of a parent's computed column is an inherited field (#5899, field side).
 * The column (e.g. People.DisplayName AS (FirstName + ' ' + LastName) PERSISTED) reaches the child
 * through its view as a read-only virtual column (AllowUpdateAPI = 0), so the plain IS-A
 * discriminator (IsVirtual AND AllowUpdateAPI) misses it. isInheritedISAField recognizes it from
 * the parent chain, which makes it eligible as the child's name field.
 */
import { describe, it, expect, vi } from 'vitest';

const chain = vi.hoisted(() => ({ entities: [] as Array<Record<string, unknown>> }));

vi.mock('@memberjunction/core', async (importOriginal) => {
   const actual = await importOriginal<typeof import('@memberjunction/core')>();
   class FakeMetadata {
      get Entities() { return chain.entities; }
   }
   return { ...actual, Metadata: FakeMetadata };
});

import { ManageMetadataBase } from '../Database/manage-metadata';

class TestableISA extends ManageMetadataBase {
   public Inherited(field: Record<string, unknown>): boolean { return this.isInheritedISAField(field); }
   public Eligible(field: Record<string, unknown>): boolean { return this.isFieldEligibleForNameField(field); }
   public ComputedNames(entityID: string): Set<string> { return this.inheritedComputedFieldNames(entityID); }
}

const CHILD = 'child-applicants';
const parentField = (Name: string, over: Record<string, unknown> = {}) =>
   ({ Name, IsVirtual: false, IsComputed: false, IsPrimaryKey: false, ...over });

chain.entities = [
   {
      ID: CHILD.toUpperCase(),
      ParentChain: [
         { Fields: [
            parentField('ID', { IsPrimaryKey: true }),
            parentField('FirstName'),
            parentField('DisplayName', { IsVirtual: true, IsComputed: true }),
            parentField('Company', { IsVirtual: true, IsComputed: false }), // view-only FK name column
            parentField('__mj_Computed', { IsVirtual: true, IsComputed: true }),
         ] },
         { Fields: [parentField('FullAddress', { IsVirtual: true, IsComputed: true })] }, // grandparent
      ],
   },
   { ID: 'standalone', ParentChain: [] },
];

const mirror = (Name: string, over: Record<string, unknown> = {}) => ({
   EntityID: CHILD, Name, Type: 'nvarchar', Length: 200, IsVirtual: true, AllowUpdateAPI: false, IsPrimaryKey: false, ...over,
});

describe('inheritedComputedFieldNames', () => {
   const mm = new TestableISA();

   it('collects computed columns from every parent in the chain, matching the entity id in any case', () => {
      expect([...mm.ComputedNames(CHILD)].sort()).toEqual(['displayname', 'fulladdress']);
   });

   it('is empty for an entity with no parent or not in metadata', () => {
      expect(mm.ComputedNames('standalone').size).toBe(0);
      expect(mm.ComputedNames('unknown').size).toBe(0);
   });
});

describe('isInheritedISAField: inherited computed columns (#5899)', () => {
   const mm = new TestableISA();

   it('recognizes the read-only mirror of a parent computed column', () => {
      expect(mm.Inherited(mirror('DisplayName'))).toBe(true);
      expect(mm.Inherited(mirror('FullAddress'))).toBe(true);
   });

   it('does not recognize a read-only view column the parent does not compute', () => {
      expect(mm.Inherited(mirror('Company'))).toBe(false);
      expect(mm.Inherited(mirror('SomethingElse'))).toBe(false);
   });

   it('keeps the existing exclusions: non-virtual, PK, __mj_, and rows with no EntityID', () => {
      expect(mm.Inherited(mirror('DisplayName', { IsVirtual: false }))).toBe(false);
      expect(mm.Inherited(mirror('DisplayName', { IsPrimaryKey: true }))).toBe(false);
      expect(mm.Inherited(mirror('__mj_Computed'))).toBe(false);
      expect(mm.Inherited({ Name: 'DisplayName', IsVirtual: true, AllowUpdateAPI: false })).toBe(false);
   });

   it('makes the mirror eligible as the child name field', () => {
      expect(mm.Eligible(mirror('DisplayName'))).toBe(true);
      expect(mm.Eligible(mirror('Company'))).toBe(false);
   });
});
