import { describe, it, expect } from 'vitest';
import { ResolveSingleEntityResourceTarget } from '../util/ResourcePatternUtils';

/**
 * This predicate decides whether an API scope rule's `ResourcePattern` names exactly one entity, and
 * two materialization row-restriction gates — CodeGen's mint/drift gates and the runtime refresher's
 * Leak-1 gate — depend on it agreeing with itself. `null` is the fail-CLOSED answer ("this rule may
 * name any entity"), so a pattern that wrongly resolves to a name is a fail-OPEN hole: it would be
 * kept as a literal target, match no entity, and leave the entity it fences reading as unrestricted.
 */
describe('ResolveSingleEntityResourceTarget', () => {
    describe('resolvable — an exact entity name', () => {
        it('returns the name normalized for lookup (trimmed + lowercased)', () => {
            expect(ResolveSingleEntityResourceTarget('Salaries')).toBe('salaries');
            expect(ResolveSingleEntityResourceTarget('  Salaries  ')).toBe('salaries');
            expect(ResolveSingleEntityResourceTarget('SALARIES')).toBe('salaries');
        });

        it('accepts an MJ-prefixed name, spaces and colon included', () => {
            // Every v5+ core entity name has this shape, so rejecting it would fail closed on
            // literally every core entity and stop all materialization.
            expect(ResolveSingleEntityResourceTarget('MJ: AI Agent Runs')).toBe('mj: ai agent runs');
        });
    });

    describe('unresolvable — must be null (fail closed)', () => {
        it('rejects blank, whitespace-only, null and undefined', () => {
            expect(ResolveSingleEntityResourceTarget('')).toBeNull();
            expect(ResolveSingleEntityResourceTarget('   ')).toBeNull();
            expect(ResolveSingleEntityResourceTarget(null)).toBeNull();
            expect(ResolveSingleEntityResourceTarget(undefined)).toBeNull();
        });

        it('rejects every wildcard/list form the save-time validator rejects (* ? ,)', () => {
            // Mirrors IsExactResourceName in MJCoreEntitiesServer's rowFilterValidation.ts.
            for (const p of ['*', 'Sk*p', '*Skip', 'Skip*', 'Sk?p', 'A,B', 'Salaries, Orders']) {
                expect(ResolveSingleEntityResourceTarget(p)).toBeNull();
            }
        });

        it("rejects '?' specifically — the character whose omission fails OPEN", () => {
            // A `?` pattern kept as a literal target name matches no entity, so the entity it was
            // meant to fence reads as unrestricted. This is the regression this file exists to pin.
            expect(ResolveSingleEntityResourceTarget('Sk?p')).toBeNull();
        });

        it("also rejects the SQL wildcard '%', which the save-time validator does not police", () => {
            expect(ResolveSingleEntityResourceTarget('Sk%p')).toBeNull();
            expect(ResolveSingleEntityResourceTarget('%')).toBeNull();
        });

        it('rejects an unresolvable character anywhere in the pattern, including after trimming', () => {
            expect(ResolveSingleEntityResourceTarget('  Orders*  ')).toBeNull();
        });
    });
});
