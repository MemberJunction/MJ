/**
 * Unit tests for the PURE invariant cores behind `MJAIAgentPairedAgentEntityServer.ValidateAsync`:
 * self-pairing defense, the Active+Realtime co-agent requirement, and the
 * at-most-one-default-per-co-agent rule.
 */
import { describe, it, expect } from 'vitest';
import { ValidationErrorType } from '@memberjunction/core';
import {
    BuildSelfPairingError,
    BuildCoAgentInvariantErrors,
    BuildDuplicateDefaultError,
} from '../custom/MJAIAgentPairedAgentEntityServer.server';

describe('BuildSelfPairingError', () => {
    it('rejects a co-agent paired to itself', () => {
        const error = BuildSelfPairingError('agent-1', 'agent-1');
        expect(error).not.toBeNull();
        expect(error!.Source).toBe('CoAgentID');
        expect(error!.Type).toBe(ValidationErrorType.Failure);
    });

    it('compares UUIDs case/whitespace-insensitively (SQL Server vs PostgreSQL)', () => {
        expect(BuildSelfPairingError('ABC-1', ' abc-1 ')).not.toBeNull();
    });

    it('allows distinct agents and tolerates missing ids (sync Validate owns required checks)', () => {
        expect(BuildSelfPairingError('agent-1', 'agent-2')).toBeNull();
        expect(BuildSelfPairingError(null, 'agent-2')).toBeNull();
        expect(BuildSelfPairingError('agent-1', null)).toBeNull();
    });
});

describe('BuildCoAgentInvariantErrors', () => {
    it('accepts an Active Realtime-type co-agent', () => {
        expect(BuildCoAgentInvariantErrors('co-1', 'Active', 'Realtime', 'Voice')).toEqual([]);
    });

    it('is case/whitespace-tolerant on status and type name', () => {
        expect(BuildCoAgentInvariantErrors('co-1', ' active ', ' realtime ')).toEqual([]);
    });

    it('rejects a dangling co-agent reference (agent not found)', () => {
        const errors = BuildCoAgentInvariantErrors('co-gone', null, null);
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toMatch(/no such agent/i);
        expect(errors[0].Type).toBe(ValidationErrorType.Failure);
    });

    it('rejects a non-Active co-agent (naming the current status)', () => {
        const errors = BuildCoAgentInvariantErrors('co-1', 'Disabled', 'Realtime', 'Voice');
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain('Disabled');
        expect(errors[0].Message).toContain("'Voice'");
    });

    it('rejects a co-agent of a non-Realtime type (naming the current type)', () => {
        const errors = BuildCoAgentInvariantErrors('co-1', 'Active', 'Loop');
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain("'Realtime'");
        expect(errors[0].Message).toContain('Loop');
    });

    it('rejects a co-agent with NO type at all', () => {
        const errors = BuildCoAgentInvariantErrors('co-1', 'Active', null);
        expect(errors).toHaveLength(1);
        expect(errors[0].Message).toContain('none');
    });

    it('reports BOTH violations for an inactive, mis-typed co-agent', () => {
        const errors = BuildCoAgentInvariantErrors('co-1', 'Pending', 'Flow');
        expect(errors).toHaveLength(2);
    });
});

describe('BuildDuplicateDefaultError', () => {
    it('allows the first default (no other default rows)', () => {
        expect(BuildDuplicateDefaultError('co-1', 0)).toBeNull();
        expect(BuildDuplicateDefaultError('co-1', -1)).toBeNull();
    });

    it('rejects a second default for the same co-agent', () => {
        const error = BuildDuplicateDefaultError('co-1', 1);
        expect(error).not.toBeNull();
        expect(error!.Source).toBe('IsDefault');
        expect(error!.Type).toBe(ValidationErrorType.Failure);
        expect(error!.Message).toMatch(/already has a default/i);
    });
});
