/**
 * Unit tests for the '/' skill picker's target-agent narrowing. `IntersectAcceptedSkills` is the REAL
 * rule the service applies (mention-autocomplete.service.ts `skillsForTarget` calls it); the "no target /
 * unknown agent → full runnable set" branches live in the service. The contract pinned here:
 *   1. INTERSECTION — only skills BOTH runnable by the user AND accepted by the agent; the agent's set
 *      can only remove, never add;
 *   2. an agent that accepts nothing yields an empty picker, not the full list;
 *   3. order follows the runnable set;
 *   4. UUID comparison is case-insensitive.
 */
import { describe, it, expect } from 'vitest';
import { IntersectAcceptedSkills } from '../lib/services/skill-picker-narrowing';

const A = { ID: 'AAAAAAAA-0000-0000-0000-000000000001', Name: 'Alpha' };
const B = { ID: 'BBBBBBBB-0000-0000-0000-000000000002', Name: 'Beta' };
const C = { ID: 'CCCCCCCC-0000-0000-0000-000000000003', Name: 'Gamma' };

describe('IntersectAcceptedSkills — the / picker narrowing rule', () => {
  it('offers only skills BOTH runnable by the user AND accepted by the agent', () => {
    // C is accepted by the agent but the user cannot run it — never offered.
    expect(IntersectAcceptedSkills([A, B], [B, C])).toEqual([B]);
  });

  it('an agent that accepts nothing yields an empty picker, not the full list', () => {
    expect(IntersectAcceptedSkills([A, B], [])).toEqual([]);
  });

  it('keeps the runnable order, whatever order the agent lists them in', () => {
    expect(IntersectAcceptedSkills([A, B, C], [C, A])).toEqual([A, C]);
  });

  it('compares ids case-insensitively', () => {
    expect(IntersectAcceptedSkills([A], [{ ID: A.ID.toLowerCase() }])).toEqual([A]);
  });

  it('returns the runnable objects themselves (icon/colour metadata survives)', () => {
    expect(IntersectAcceptedSkills([A], [A])[0]).toBe(A);
  });
});
