import { describe, expect, it, vi } from 'vitest';
import { BaseImageGenerator, BaseVideoGenerator, GetAIAPIKeyGlobal } from '@memberjunction/ai';
import { AIEngine } from '@memberjunction/aiengine';
import { RunView } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import { MJGlobal } from '@memberjunction/global';
import { FileStorageBase, FileStorageEngine } from '@memberjunction/storage';
import {
    RegisterFakeAPIKeys,
    RegisterFakeImageGenerator,
    RegisterFakeVideoGenerator,
    SCRIPTED_API_KEY,
    UseMemoryStorage,
} from '../checks/video-studio-fakes';
import { FirstFailedOrRetryStep, type StepDiagnosticInput } from '../checks/video-studio-production.checks';

describe('video-studio-fakes', () => {
    it('RegisterFakeAPIKeys returns SCRIPTED_API_KEY while active and restores base AIAPIKeys on restore() even when no custom AIAPIKeys was registered before', () => {
        const beforeKey = GetAIAPIKeyGlobal('OpenAILLM');
        expect(beforeKey).not.toBe(SCRIPTED_API_KEY);

        const restore = RegisterFakeAPIKeys(['OpenAILLM']);
        try {
            expect(GetAIAPIKeyGlobal('OpenAILLM')).toBe(SCRIPTED_API_KEY);
            expect(GetAIAPIKeyGlobal('GoogleVeoVideoGenerator')).toBeUndefined();
        } finally {
            restore();
        }

        const afterKey = GetAIAPIKeyGlobal('OpenAILLM');
        expect(afterKey).not.toBe(SCRIPTED_API_KEY);
        expect(afterKey).toBe(beforeKey);
    });

    it('RegisterFakeImageGenerator registers a refusing image generator and increments SubmitCount on GenerateImage', async () => {
        const fake = RegisterFakeImageGenerator();
        try {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseImageGenerator>(
                BaseImageGenerator,
                'OpenAIImageGenerator',
                SCRIPTED_API_KEY,
            );
            expect(instance).toBe(fake.Driver);
            expect(fake.Driver.SubmitCount).toBe(0);
            await expect(instance!.GenerateImage({ prompt: 'test' })).rejects.toThrow(
                'The scripted image driver is not armed',
            );
            expect(fake.Driver.SubmitCount).toBe(1);
        } finally {
            fake.restore();
        }
    });

    it('RegisterFakeVideoGenerator increments SubmitCount and rejects when GenerateVideo is called while unarmed', async () => {
        const fake = RegisterFakeVideoGenerator();
        try {
            const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseVideoGenerator>(
                BaseVideoGenerator,
                'GoogleVeoVideoGenerator',
                SCRIPTED_API_KEY,
            );
            expect(instance).toBe(fake.Driver);
            expect(fake.Driver.SubmitCount).toBe(0);
            await expect(
                instance!.GenerateVideo({ Prompt: 'test clip', DurationSeconds: 4 }),
            ).rejects.toThrow('The scripted video driver is not armed');
            expect(fake.Driver.SubmitCount).toBe(1);
        } finally {
            fake.restore();
        }
    });

    it('UseMemoryStorage registers the memory driver only under its test key and restore() deletes the provider after the account', async () => {
        const s3Before = MJGlobal.Instance.ClassFactory.GetRegistration(
            FileStorageBase,
            'AWS S3 Storage',
        );
        const deleteOrder: string[] = [];

        const providerEntity = {
            ID: '00000000-0000-0000-0000-000000000101',
            Name: '',
            Description: '',
            ServerDriverKey: '',
            ClientDriverKey: '',
            Priority: 0,
            IsActive: false,
            SupportsSearch: false,
            RequiresOAuth: false,
            NewRecord: vi.fn(),
            Save: vi.fn(async () => true),
            Delete: vi.fn(async () => {
                deleteOrder.push('provider');
                return true;
            }),
        };

        const accountEntity = {
            ID: '00000000-0000-0000-0000-000000000202',
            Name: '',
            ProviderID: '',
            CredentialID: '',
            IncludeInGlobalSearch: false,
            NewRecord: vi.fn(),
            Save: vi.fn(async () => true),
            Delete: vi.fn(async () => {
                deleteOrder.push('account');
                return true;
            }),
        };

        const credentialEntity = {
            ID: '00000000-0000-0000-0000-000000000303',
            Name: '',
            CredentialTypeID: '',
            Values: '',
            NewRecord: vi.fn(),
            Save: vi.fn(async () => true),
            Delete: vi.fn(async () => {
                deleteOrder.push('credential');
                return true;
            }),
        };

        vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (params) => {
            if (params.EntityName === 'MJ: Credentials') {
                return { Success: true, Results: [] } as never;
            }
            if (params.EntityName === 'MJ: Credential Types') {
                return {
                    Success: true,
                    Results: [{ ID: '00000000-0000-0000-0000-000000000404' }],
                } as never;
            }
            return { Success: true, Results: [] } as never;
        });
        vi.spyOn(FileStorageEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(CredentialEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(AIEngine.Instance, 'Agents', 'get').mockReturnValue([
            { ID: '00000000-0000-0000-0000-000000000505', Name: 'Video Studio' } as never,
        ]);
        vi.spyOn(AIEngine.Instance, 'ResolveAgentStorageAccountID').mockReturnValue(accountEntity.ID);
        vi.spyOn(AIEngine.Instance, 'ResolveAgentStorageAccount').mockReturnValue({
            AccountID: accountEntity.ID,
            Source: 'Fallback',
            Ambiguous: false,
        });

        const ctx = {
            User: { ID: '00000000-0000-0000-0000-000000000999' },
            Provider: {
                GetEntityObject: vi.fn(async (entityName: string) => {
                    if (entityName === 'MJ: File Storage Providers') {
                        return providerEntity;
                    }
                    if (entityName === 'MJ: File Storage Accounts') {
                        return accountEntity;
                    }
                    if (entityName === 'MJ: Credentials') {
                        return credentialEntity;
                    }
                    throw new Error(`Unexpected entity '${entityName}'`);
                }),
            },
        } as never;

        try {
            const handle = await UseMemoryStorage(ctx);

            expect(providerEntity.IsActive).toBe(true);
            expect(providerEntity.Name).toContain('mj-integration-test — safe to delete');
            expect(providerEntity.Name.length).toBeLessThanOrEqual(50);
            expect(providerEntity.Description).toContain('mj-integration-test — safe to delete');
            expect(providerEntity.ServerDriverKey).toMatch(/^MJITMemoryStorage-/);
            expect(providerEntity.ClientDriverKey).toBe(providerEntity.ServerDriverKey);
            expect(accountEntity.ProviderID).toBe(providerEntity.ID);

            const resolvedDriver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
                FileStorageBase,
                handle.DriverKey,
            );
            expect(resolvedDriver).toBe(handle.Driver);

            const s3After = MJGlobal.Instance.ClassFactory.GetRegistration(
                FileStorageBase,
                'AWS S3 Storage',
            );
            expect(s3After).toBe(s3Before);

            handle.Fixture.Permissions.push({
                Delete: vi.fn(async () => {
                    deleteOrder.push('permission');
                    return true;
                }),
            } as never);

            await handle.restore();

            expect(deleteOrder).toEqual(['permission', 'account', 'credential', 'provider']);
        } finally {
            vi.restoreAllMocks();
        }
    });

    it('FirstFailedOrRetryStep given steps [ok, refused, failed] returns the refused step', () => {
        const ok: StepDiagnosticInput = {
            StepName: 'Prompt - Step 1',
            StepNumber: 1,
            StepType: 'Prompt',
            Status: 'Completed',
            ErrorMessage: null,
            InputData: JSON.stringify({ context: { agentHierarchy: ['Video Studio'] } }),
            OutputData: JSON.stringify({
                nextStep: { step: 'Sub-Agent', subAgent: { name: 'Video Studio - Director' } },
            }),
        };
        const refused: StepDiagnosticInput = {
            StepName: 'Prompt - Step 3',
            StepNumber: 3,
            StepType: 'Prompt',
            Status: 'Completed',
            ErrorMessage: null,
            InputData: JSON.stringify({ context: { agentHierarchy: ['Video Studio'] } }),
            OutputData: JSON.stringify({
                nextStep: {
                    step: 'Retry',
                    retryInstructions:
                        'Cannot advance to "Video Studio - Art Director": Mandatory Gate G1 (Brief Gate) FAILED',
                    errorMessage:
                        'Cannot advance to "Video Studio - Art Director": Mandatory Gate G1 (Brief Gate) FAILED',
                },
            }),
        };
        const failed: StepDiagnosticInput = {
            StepName: 'Prompt - Step 15',
            StepNumber: 15,
            StepType: 'Prompt',
            Status: 'Failed',
            ErrorMessage: 'video-studio-production: TestLLM script exhausted (13 step(s) configured)',
            InputData: JSON.stringify({ context: { agentHierarchy: ['Video Studio'] } }),
            OutputData: null,
        };

        const result = FirstFailedOrRetryStep({
            Agent: 'Video Studio',
            Steps: [ok, refused, failed],
        });

        expect(result).toEqual({
            stepName: 'Prompt - Step 3',
            agent: 'Video Studio',
            message:
                'Cannot advance to "Video Studio - Art Director": Mandatory Gate G1 (Brief Gate) FAILED',
        });
    });
});
