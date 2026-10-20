/**
 * The decision stand-in's ClassFactory registration (`RegisterScriptedDecision`): it must win over the
 * real driver, hand the name back on restore, and still win when registered again after an earlier
 * restore. The suite runs every bundle in one process, so a restore that a later registration cannot
 * outrank would send a later bundle's "scripted" decisions to the real driver.
 */
import { describe, it, expect } from 'vitest';
import { BaseDecision } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { RegisterScriptedDecision, ScriptedDecision } from '../checks/decision-test-double';

/** A stand-in for a production decision driver. */
class ProductionDecision extends ScriptedDecision {}

/** A driver name no other test registers, so each test sees only its own registrations. */
function registerProduction(name: string): void {
    MJGlobal.Instance.ClassFactory.Register(BaseDecision, ProductionDecision, name);
}

function resolve(name: string): BaseDecision | null {
    return MJGlobal.Instance.ClassFactory.CreateInstance<BaseDecision>(BaseDecision, name, 'it-key');
}

describe('RegisterScriptedDecision', () => {
    it('hands back the shared stand-in, and restore() puts the production driver back', () => {
        registerProduction('ITProbeDecisionA');
        const stand = new ScriptedDecision();

        const restore = RegisterScriptedDecision(stand, ['ITProbeDecisionA']);
        expect(resolve('ITProbeDecisionA')).toBe(stand);

        restore();
        expect(resolve('ITProbeDecisionA')).toBeInstanceOf(ProductionDecision);
    });

    it('wins over the production driver an earlier restore() put back', () => {
        registerProduction('ITProbeDecisionB');
        RegisterScriptedDecision(new ScriptedDecision(), ['ITProbeDecisionB'])();
        const stand = new ScriptedDecision();

        const restore = RegisterScriptedDecision(stand, ['ITProbeDecisionB']);
        expect(resolve('ITProbeDecisionB')).toBe(stand);

        restore();
        expect(resolve('ITProbeDecisionB')).toBeInstanceOf(ProductionDecision);
    });
});
