import { describe, it, expect } from 'vitest';
import { ImmutableFieldDeclarations, TRUTH_IMMUTABLE_FIELDS } from '../immutable-fields';

const decl = (BaseTable: string) => ({ BaseTable, Fields: ['X'] });

describe('ImmutableFieldDeclarations.AppliesTo', () => {
  it('applies a world table declaration (no dataset prefix) to the bare table and to every W<n>_ table', () => {
    for (const table of ['MembershipYear', 'W1_MembershipYear', 'W4_MembershipYear', 'W12_MembershipYear']) {
      expect(ImmutableFieldDeclarations.AppliesTo(decl('MembershipYear'), table)).toBe(true);
    }
    expect(ImmutableFieldDeclarations.AppliesTo(decl('Person'), 'W5_Person')).toBe(true);
  });

  it('does not apply a world table declaration to another dataset or a longer name', () => {
    for (const table of ['C1MembershipYear', 'Scn_R3_MembershipYear', 'XW1_MembershipYear', 'W1_MembershipYearX', 'W_MembershipYear', 'W1_C1Person']) {
      expect(ImmutableFieldDeclarations.AppliesTo(decl('MembershipYear'), table)).toBe(false);
    }
    expect(ImmutableFieldDeclarations.AppliesTo(decl('Person'), 'C1Person')).toBe(false);
  });

  it('applies a prefixed declaration to its exact table only', () => {
    expect(ImmutableFieldDeclarations.AppliesTo(decl('C1Person'), 'C1Person')).toBe(true);
    expect(ImmutableFieldDeclarations.AppliesTo(decl('C1Person'), 'W1_C1Person')).toBe(false);
    expect(ImmutableFieldDeclarations.AppliesTo(decl('W4_Person'), 'W4_Person')).toBe(true);
    expect(ImmutableFieldDeclarations.AppliesTo(decl('W4_Person'), 'W5_Person')).toBe(false);
  });

  it('covers the W4 membership year table with the declared MembershipYear fields', () => {
    const covering = TRUTH_IMMUTABLE_FIELDS.filter((d) => ImmutableFieldDeclarations.AppliesTo(d, 'W4_MembershipYear'));
    expect(covering).toHaveLength(1);
    expect(covering[0].Fields).toContain('EventsAttended');
    expect(covering[0].Fields).not.toContain('PersonStatusNow');
  });
});
