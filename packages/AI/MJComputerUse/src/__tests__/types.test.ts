import { describe, it, expect } from 'vitest';
import {
    PromptEntityRef,
    ActionRef,
    MJRunComputerUseParams,
    MJDomainAuthBinding,
} from '../types/mj-params.js';

// ─── PromptEntityRef ──────────────────────────────────────────────
describe('PromptEntityRef', () => {
    it('should create an instance with no arguments', () => {
        const ref = new PromptEntityRef();
        expect(ref.PromptId).toBeUndefined();
        expect(ref.PromptName).toBeUndefined();
    });

    it('should allow setting PromptId', () => {
        const ref = new PromptEntityRef();
        ref.PromptId = 'abc-123';
        expect(ref.PromptId).toBe('abc-123');
    });

    it('should allow setting PromptName', () => {
        const ref = new PromptEntityRef();
        ref.PromptName = 'Computer Use: Controller';
        expect(ref.PromptName).toBe('Computer Use: Controller');
    });

    it('should allow setting both PromptId and PromptName', () => {
        const ref = new PromptEntityRef();
        ref.PromptId = 'id-1';
        ref.PromptName = 'name-1';
        expect(ref.PromptId).toBe('id-1');
        expect(ref.PromptName).toBe('name-1');
    });
});

// ─── ActionRef ────────────────────────────────────────────────────
describe('ActionRef', () => {
    it('should create an instance with no arguments', () => {
        const ref = new ActionRef();
        expect(ref.ActionId).toBeUndefined();
        expect(ref.ActionName).toBeUndefined();
    });

    it('should allow setting ActionId', () => {
        const ref = new ActionRef();
        ref.ActionId = 'action-123';
        expect(ref.ActionId).toBe('action-123');
    });

    it('should allow setting ActionName', () => {
        const ref = new ActionRef();
        ref.ActionName = 'Send Email';
        expect(ref.ActionName).toBe('Send Email');
    });
});

// ─── MJRunComputerUseParams ───────────────────────────────────────
describe('MJRunComputerUseParams', () => {
    it('should create an instance with all MJ-specific fields undefined by default', () => {
        const params = new MJRunComputerUseParams();
        expect(params.ControllerPromptRef).toBeUndefined();
        expect(params.JudgePromptRef).toBeUndefined();
        expect(params.Actions).toBeUndefined();
        expect(params.ContextUser).toBeUndefined();
        expect(params.AgentRunId).toBeUndefined();
    });

    it('should allow setting ControllerPromptRef', () => {
        const params = new MJRunComputerUseParams();
        const ref = new PromptEntityRef();
        ref.PromptName = 'Controller Prompt';
        params.ControllerPromptRef = ref;
        expect(params.ControllerPromptRef.PromptName).toBe('Controller Prompt');
    });

    it('should allow setting JudgePromptRef', () => {
        const params = new MJRunComputerUseParams();
        const ref = new PromptEntityRef();
        ref.PromptId = 'judge-prompt-id';
        params.JudgePromptRef = ref;
        expect(params.JudgePromptRef.PromptId).toBe('judge-prompt-id');
    });

    it('should allow setting Actions array', () => {
        const params = new MJRunComputerUseParams();
        const action1 = new ActionRef();
        action1.ActionName = 'Send Email';
        const action2 = new ActionRef();
        action2.ActionId = 'action-2';
        params.Actions = [action1, action2];
        expect(params.Actions).toHaveLength(2);
        expect(params.Actions[0].ActionName).toBe('Send Email');
        expect(params.Actions[1].ActionId).toBe('action-2');
    });

    it('should allow setting AgentRunId', () => {
        const params = new MJRunComputerUseParams();
        params.AgentRunId = 'run-xyz-789';
        expect(params.AgentRunId).toBe('run-xyz-789');
    });

    it('should extend RunComputerUseParams (inherits base fields)', () => {
        const params = new MJRunComputerUseParams();
        // Base class fields should exist — Goal is inherited from RunComputerUseParams
        expect('Goal' in params).toBe(true);
    });
});

// ─── MJDomainAuthBinding ──────────────────────────────────────────
describe('MJDomainAuthBinding', () => {
    it('should create an instance with Credential undefined', () => {
        const binding = new MJDomainAuthBinding();
        expect(binding.Credential).toBeUndefined();
    });

    it('should extend DomainAuthBinding (inherits base fields)', () => {
        const binding = new MJDomainAuthBinding();
        // Domains is from the base class
        expect('Domains' in binding).toBe(true);
    });
});
