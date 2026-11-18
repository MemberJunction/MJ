import { describe, it, expect, vi } from 'vitest';
import { BaseEntity, ValidationErrorType, ValidationResult } from '@memberjunction/core';
import {
    BuildConfigurationPresetOwnershipError,
    MJAIAgentRelationshipEntityServer,
} from '../custom/MJAIAgentRelationshipEntityServer.server';

describe('MJAIAgentRelationshipEntityServer', () => {
    function createRelationshipMock(options: {
        subAgentID: string | null;
        configurationPresetID: string | null;
        isSaved?: boolean;
        presetDirty?: boolean;
        subAgentDirty?: boolean;
        loadPresetResult?: { loaded: boolean; agentID?: string; name?: string };
    }): {
        entity: MJAIAgentRelationshipEntityServer;
        getEntityObjectSpy: ReturnType<typeof vi.fn>;
    } {
        const entity = Object.create(MJAIAgentRelationshipEntityServer.prototype) as MJAIAgentRelationshipEntityServer;
        const getEntityObjectSpy = vi.fn().mockImplementation(async () => ({
            Load: vi.fn().mockImplementation(async function (this: Record<string, unknown>) {
                const res = options.loadPresetResult ?? { loaded: false };
                if (res.loaded) {
                    this.AgentID = res.agentID;
                    this.Name = res.name;
                }
                return res.loaded;
            }),
        }));

        Object.defineProperty(entity, 'SubAgentID', { value: options.subAgentID, configurable: true });
        Object.defineProperty(entity, 'ConfigurationPresetID', { value: options.configurationPresetID, configurable: true });
        Object.defineProperty(entity, 'IsSaved', { value: options.isSaved ?? false, configurable: true });
        Object.defineProperty(entity, 'ProviderToUse', {
            value: { GetEntityObject: getEntityObjectSpy },
            configurable: true,
        });
        Object.defineProperty(entity, 'ContextCurrentUser', { value: { ID: 'user-1' }, configurable: true });
        entity.GetFieldByName = vi.fn().mockImplementation((name: string) => {
            if (name === 'ConfigurationPresetID') return { Dirty: options.presetDirty ?? false };
            if (name === 'SubAgentID') return { Dirty: options.subAgentDirty ?? false };
            return { Dirty: false };
        }) as unknown as MJAIAgentRelationshipEntityServer['GetFieldByName'];

        const baseResult = new ValidationResult();
        baseResult.Success = true;
        vi.spyOn(BaseEntity.prototype, 'ValidateAsync').mockResolvedValue(baseResult);

        return { entity, getEntityObjectSpy };
    }

    it('passes when ConfigurationPresetID belongs to the sub-agent', async () => {
        const { entity, getEntityObjectSpy } = createRelationshipMock({
            subAgentID: 'sub-agent-1',
            configurationPresetID: 'preset-1',
            loadPresetResult: { loaded: true, agentID: 'SUB-AGENT-1', name: 'High' },
        });

        const result = await entity.ValidateAsync();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
        expect(getEntityObjectSpy).toHaveBeenCalledWith('MJ: AI Agent Configurations', { ID: 'user-1' });
    });

    it('fails when ConfigurationPresetID belongs to another agent', async () => {
        const { entity } = createRelationshipMock({
            subAgentID: 'sub-agent-1',
            configurationPresetID: 'preset-other',
            loadPresetResult: { loaded: true, agentID: 'other-agent-2', name: 'Draft' },
        });

        const result = await entity.ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('ConfigurationPresetID');
        expect(result.Errors[0].Type).toBe(ValidationErrorType.Failure);
        expect(result.Errors[0].Message).toContain('other-agent-2');
        expect(result.Errors[0].Message).toContain('sub-agent-1');
    });

    it('fails when ConfigurationPresetID does not exist', async () => {
        const { entity } = createRelationshipMock({
            subAgentID: 'sub-agent-1',
            configurationPresetID: 'preset-missing',
            loadPresetResult: { loaded: false },
        });

        const result = await entity.ValidateAsync();
        expect(result.Success).toBe(false);
        expect(result.Errors).toHaveLength(1);
        expect(result.Errors[0].Source).toBe('ConfigurationPresetID');
        expect(result.Errors[0].Message).toMatch(/no such AI Agent Configuration/i);
    });

    it('does no lookup when ConfigurationPresetID is null', async () => {
        const { entity, getEntityObjectSpy } = createRelationshipMock({
            subAgentID: 'sub-agent-1',
            configurationPresetID: null,
        });

        const result = await entity.ValidateAsync();
        expect(result.Success).toBe(true);
        expect(result.Errors).toHaveLength(0);
        expect(getEntityObjectSpy).not.toHaveBeenCalled();
    });

    it('pure helper BuildConfigurationPresetOwnershipError handles all cases', () => {
        expect(BuildConfigurationPresetOwnershipError(null, 'sub-1', null)).toBeNull();
        expect(BuildConfigurationPresetOwnershipError('p-1', 'sub-1', 'SUB-1', 'High')).toBeNull();
        expect(BuildConfigurationPresetOwnershipError('p-1', 'sub-1', null)?.Message).toContain('no such AI Agent Configuration');
        expect(BuildConfigurationPresetOwnershipError('p-1', 'sub-1', 'sub-2', 'High')?.Message).toContain("'High'");
    });
});
