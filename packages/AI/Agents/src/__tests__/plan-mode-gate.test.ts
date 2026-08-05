/**
 * Unit tests for Plan Mode's gate logic (resolvePlanModeGate / the validateNextStep enforcement
 * pre-check in base-agent.ts).
 *
 * Mirrors the established pattern in action-changes.test.ts: standalone copies of the pure logic,
 * without instantiating the full BaseAgent class. Keep in sync with base-agent.ts if it changes.
 */
import { describe, it, expect } from 'vitest';

interface MockAgent {
    ID: string;
    SupportsPlanMode?: boolean;
    RequirePlanMode?: boolean;
}

interface MockParams {
    agent: MockAgent;
    planMode?: boolean;
    lastRunId?: string;
}

interface MockRequest {
    Status: string;
    OriginatingAgentRunStepID: string | null;
}

interface MockStep {
    StepType: string;
}

// Mirrors BaseAgent.resolvePlanModeGate's `active` resolution (the depth check is inlined here as
// a boolean since it doesn't depend on RunView). RequirePlanMode (v5.45) forces plan mode on
// every root run regardless of the per-request flag — SupportsPlanMode is irrelevant when set.
function isPlanModeActive(params: MockParams, depth: number): boolean {
    const requiredByAgent = params.agent.RequirePlanMode === true;
    const requestedByCaller = !!(params.agent.SupportsPlanMode && params.planMode === true);
    return depth === 0 && (requiredByAgent || requestedByCaller);
}

// Mirrors BaseAgent.resolvePlanModeGate's `approved` resolution once `active` is true, given the
// last request found for lastRunId (or undefined if none) and the step it originated from.
function isPlanModeApproved(request: MockRequest | undefined, originatingStep: MockStep | undefined): boolean {
    if (!request) return false;
    const resolved = request.Status === 'Approved' || request.Status === 'Responded';
    if (!resolved || !request.OriginatingAgentRunStepID) return false;
    return !!originatingStep && originatingStep.StepType === 'Plan';
}

// Mirrors the validateNextStep enforcement pre-check.
function planModeBlocksStep(planModeActive: boolean, planApproved: boolean, step: string): boolean {
    return planModeActive && !planApproved && (step === 'Actions' || step === 'Sub-Agent');
}

describe('resolvePlanModeGate — active resolution', () => {
    it('is inactive when the agent does not support plan mode', () => {
        expect(isPlanModeActive({ agent: { ID: 'a1', SupportsPlanMode: false }, planMode: true }, 0)).toBe(false);
    });

    it('is inactive when planMode was not requested for this call', () => {
        expect(isPlanModeActive({ agent: { ID: 'a1', SupportsPlanMode: true } }, 0)).toBe(false);
    });

    it('is inactive when planMode is explicitly false', () => {
        expect(isPlanModeActive({ agent: { ID: 'a1', SupportsPlanMode: true }, planMode: false }, 0)).toBe(false);
    });

    it('is inactive for a sub-agent (depth > 0) even if both flags are true', () => {
        expect(isPlanModeActive({ agent: { ID: 'a1', SupportsPlanMode: true }, planMode: true }, 1)).toBe(false);
    });

    it('is active for a root agent with SupportsPlanMode + planMode both true', () => {
        expect(isPlanModeActive({ agent: { ID: 'a1', SupportsPlanMode: true }, planMode: true }, 0)).toBe(true);
    });
});

describe('resolvePlanModeGate — RequirePlanMode (mandatory HITL, v5.45)', () => {
    it('forces plan mode active even when the caller did not request it', () => {
        expect(isPlanModeActive({ agent: { ID: 'a1', SupportsPlanMode: true, RequirePlanMode: true } }, 0)).toBe(true);
    });

    it('forces plan mode active even when the caller explicitly opted OUT', () => {
        expect(isPlanModeActive({ agent: { ID: 'a1', SupportsPlanMode: true, RequirePlanMode: true }, planMode: false }, 0)).toBe(true);
    });

    it('SupportsPlanMode is irrelevant when RequirePlanMode is set', () => {
        expect(isPlanModeActive({ agent: { ID: 'a1', SupportsPlanMode: false, RequirePlanMode: true } }, 0)).toBe(true);
    });

    it('does NOT apply to sub-agents (depth > 0) — plan mode remains root-only', () => {
        expect(isPlanModeActive({ agent: { ID: 'a1', RequirePlanMode: true } }, 1)).toBe(false);
    });

    it('RequirePlanMode=false (default) leaves the opt-in path unchanged', () => {
        expect(isPlanModeActive({ agent: { ID: 'a1', SupportsPlanMode: true, RequirePlanMode: false }, planMode: true }, 0)).toBe(true);
        expect(isPlanModeActive({ agent: { ID: 'a1', SupportsPlanMode: true, RequirePlanMode: false } }, 0)).toBe(false);
    });
});

describe('resolvePlanModeGate — approved resolution', () => {
    it('is not approved when there is no prior request (first turn / no lastRunId)', () => {
        expect(isPlanModeApproved(undefined, undefined)).toBe(false);
    });

    it('is not approved when the prior request is still Requested (awaiting response)', () => {
        const request = { Status: 'Requested', OriginatingAgentRunStepID: 'step1' };
        expect(isPlanModeApproved(request, { StepType: 'Plan' })).toBe(false);
    });

    it('is not approved when the prior request was Rejected', () => {
        const request = { Status: 'Rejected', OriginatingAgentRunStepID: 'step1' };
        expect(isPlanModeApproved(request, { StepType: 'Plan' })).toBe(false);
    });

    it('is approved when the prior request is Approved and originated from a Plan step', () => {
        const request = { Status: 'Approved', OriginatingAgentRunStepID: 'step1' };
        expect(isPlanModeApproved(request, { StepType: 'Plan' })).toBe(true);
    });

    it('is approved when the prior request is Responded (edited-and-submitted) from a Plan step', () => {
        const request = { Status: 'Responded', OriginatingAgentRunStepID: 'step1' };
        expect(isPlanModeApproved(request, { StepType: 'Plan' })).toBe(true);
    });

    it('is NOT approved when a resolved request originated from a Chat step, not Plan — ' +
        'prevents an unrelated clarifying question from accidentally satisfying the gate', () => {
        const request = { Status: 'Responded', OriginatingAgentRunStepID: 'step1' };
        expect(isPlanModeApproved(request, { StepType: 'Chat' })).toBe(false);
    });
});

describe('validateNextStep — Plan Mode enforcement pre-check', () => {
    it('blocks an Actions step when plan mode is active and unapproved', () => {
        expect(planModeBlocksStep(true, false, 'Actions')).toBe(true);
    });

    it('blocks a Sub-Agent step when plan mode is active and unapproved', () => {
        expect(planModeBlocksStep(true, false, 'Sub-Agent')).toBe(true);
    });

    it('does not block once plan mode is approved', () => {
        expect(planModeBlocksStep(true, true, 'Actions')).toBe(false);
    });

    it('does not block when plan mode is not active at all', () => {
        expect(planModeBlocksStep(false, false, 'Actions')).toBe(false);
    });

    it('never blocks Chat — the agent may still ask a clarifying question before planning', () => {
        expect(planModeBlocksStep(true, false, 'Chat')).toBe(false);
    });

    it('never blocks Skill activation — loading a skill is allowed before/instead of planning', () => {
        expect(planModeBlocksStep(true, false, 'Skill')).toBe(false);
    });

    it('never blocks Retry', () => {
        expect(planModeBlocksStep(true, false, 'Retry')).toBe(false);
    });
});
