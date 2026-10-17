import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    runAgentMock,
    processAgentArtifactsMock,
    agents,
    presets,
    archetypes,
    brandKits,
} = vi.hoisted(() => ({
    runAgentMock: vi.fn(),
    processAgentArtifactsMock: vi.fn(),
    agents: [] as Array<Record<string, unknown>>,
    presets: [] as Array<Record<string, unknown>>,
    archetypes: [] as Array<Record<string, unknown>>,
    brandKits: [] as Array<Record<string, unknown>>,
}));

vi.mock('@memberjunction/global', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/global')>()),
    RegisterClass: () => (target: unknown) => target,
    UUIDsEqual: (a: string, b: string) => a?.toLowerCase() === b?.toLowerCase(),
}));
vi.mock('@memberjunction/actions', () => ({ BaseAction: class BaseAction {} }));
vi.mock('@memberjunction/actions-base', () => ({
    ActionParam: class ActionParam {
        Name = '';
        Type = '';
        Value: unknown = null;
    },
}));
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
}));
vi.mock('@memberjunction/ai-agents', () => ({
    AgentRunner: class {
        RunAgent = (...args: unknown[]) => runAgentMock(...args);
        ProcessAgentArtifacts = (...args: unknown[]) => processAgentArtifactsMock(...args);
    },
    MatchAgentConfigurationPreset: (
        list: ReadonlyArray<{ Name?: string; DisplayName?: string | null; Status?: string | null }>,
        name: string | null | undefined,
    ) => {
        const target = name?.trim().toLowerCase();
        if (!target) return undefined;
        const active = list.filter((p) => p != null && (p.Status == null || p.Status === 'Active'));
        return (
            active.find((p) => p.Name?.trim().toLowerCase() === target) ??
            active.find((p) => p.DisplayName?.trim().toLowerCase() === target)
        );
    },
}));
vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Agents() {
                return agents;
            },
            GetAgentConfigurationPresets: vi.fn(() => presets),
        },
    },
}));
vi.mock('@memberjunction/core-entities', () => ({
    VideoStudioEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get Archetypes() {
                return archetypes;
            },
            GetArchetypesForCompany: vi.fn(() => archetypes),
            GetArchetypeByName: vi.fn((name: string) =>
                archetypes.find(
                    (a) => String(a.Name ?? '').trim().toLowerCase() === name.trim().toLowerCase(),
                ) ?? null,
            ),
        },
    },
    BrandKitEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(undefined),
            get BrandKits() {
                return brandKits;
            },
            GetKitsForCompany: vi.fn(() => brandKits),
            GetDefaultKit: vi.fn(() => brandKits.find((k) => k.IsDefault === true) ?? null),
        },
    },
}));

import { ProduceVideoAction } from '../produce-video.action.js';
import type { RunActionParams } from '@memberjunction/actions-base';

type Param = { Name: string; Type: string; Value: unknown };

function invokeAction(action: ProduceVideoAction, params: unknown) {
    return (
        action as unknown as {
            InternalRunAction(p: unknown): Promise<{
                Success: boolean;
                ResultCode: string;
                Message?: string;
                Params?: Param[];
            }>;
        }
    ).InternalRunAction(params);
}

describe('ProduceVideoAction', () => {
    beforeEach(() => {
        runAgentMock.mockReset();
        processAgentArtifactsMock.mockReset();
        agents.length = 0;
        presets.length = 0;
        archetypes.length = 0;
        brandKits.length = 0;

        agents.push({
            ID: 'ag-video-studio',
            Name: 'Video Studio',
            ParentID: null,
            ExposeAsAction: true,
        });
        presets.push(
            {
                ID: 'pr-draft',
                Name: 'Video Studio Draft',
                DisplayName: 'Draft',
                AIConfigurationID: 'cfg-draft',
                IsDefault: false,
                Status: 'Active',
            },
            {
                ID: 'pr-standard',
                Name: 'Video Studio Standard',
                DisplayName: 'Standard',
                AIConfigurationID: 'cfg-standard',
                IsDefault: true,
                Status: 'Active',
            },
        );
        archetypes.push({
            ID: 'arch-kpi',
            Name: 'KPI Briefing',
            Status: 'Active',
            CompanyID: null,
            DefaultFormats: '["16:9"]',
            DefaultDurationSeconds: 45,
        });
        brandKits.push({
            ID: 'kit-default',
            Name: 'Default Kit',
            Status: 'Active',
            CompanyID: null,
            IsDefault: true,
        });
    });

    it('forwards configuration, company, run scope, credential scope, and abort signal to RunAgent and sets all outputs on success', async () => {
        const abortController = new AbortController();
        const deliveredSpec = {
            SpecVersion: '1.0',
            Status: 'Delivered',
            Output: {
                Videos: {
                    '16:9': {
                        Format: '16:9',
                        FileID: 'file-mp4-16x9',
                        MimeType: 'video/mp4',
                        Width: 1920,
                        Height: 1080,
                        DurationSeconds: 45,
                        FileSizeBytes: 102400,
                    },
                    '9:16': {
                        Format: '9:16',
                        FileID: 'file-mp4-9x16',
                        MimeType: 'video/mp4',
                        Width: 1080,
                        Height: 1920,
                        DurationSeconds: 45,
                        FileSizeBytes: 98304,
                    },
                },
                PosterFileID: 'file-poster-1',
            },
            Review: {
                HumanReviewNotes: 'AI-generated assets (1): b-roll background.',
            },
        };

        runAgentMock.mockResolvedValue({
            success: true,
            payload: deliveredSpec,
            agentRun: {
                ID: 'run-vs-101',
                FinalStep: 'Success',
                Message: 'Delivered Q3 KPI Briefing.',
            },
        });
        processAgentArtifactsMock.mockResolvedValue({
            artifactId: 'art-500',
            versionId: 'ver-501',
            versionNumber: 1,
        });

        const contextUser = { ID: 'user-1' };
        const params: Partial<RunActionParams> & { Params: Param[] } = {
            Params: [
                { Name: 'Topic', Type: 'Input', Value: 'Summarize Q3 revenue growth' },
                { Name: 'Archetype', Type: 'Input', Value: 'KPI Briefing' },
                { Name: 'PowerLevel', Type: 'Input', Value: 'Draft' },
                { Name: 'CompanyID', Type: 'Input', Value: 'comp-1' },
                { Name: 'Formats', Type: 'Input', Value: '16:9,9:16' },
            ],
            ContextUser: contextUser as RunActionParams['ContextUser'],
            CredentialScope: 'RuntimeOnly' as RunActionParams['CredentialScope'],
            AbortSignal: abortController.signal,
            RunScope: {
                PrimaryScopeEntityName: 'Organizations',
                PrimaryScopeRecordID: 'org-99',
                SecondaryScopes: { Department: 'Finance' },
            },
        };

        const result = await invokeAction(new ProduceVideoAction(), params);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        expect(runAgentMock).toHaveBeenCalledTimes(1);

        const runAgentCall = runAgentMock.mock.calls[0][0] as Record<string, unknown>;
        expect(runAgentCall).toMatchObject({
            conversationMessages: [{ role: 'user', content: 'Summarize Q3 revenue growth' }],
            configurationId: 'cfg-draft',
            companyId: 'comp-1',
            contextUser,
            CredentialScope: 'RuntimeOnly',
            cancellationToken: abortController.signal,
            PrimaryScopeEntityName: 'Organizations',
            PrimaryScopeRecordID: 'org-99',
            SecondaryScopes: { Department: 'Finance' },
            payload: {
                Archetype: { ArchetypeID: 'arch-kpi', Name: 'KPI Briefing' },
                BrandKitID: 'kit-default',
                CompanyID: 'comp-1',
                Film: { Formats: ['16:9', '9:16'], DurationSeconds: 45 },
                Deliverables: { Formats: ['16:9', '9:16'] },
                Interaction: { Mode: 'Autonomous' },
            },
        });
        expect(runAgentCall).not.toHaveProperty('TrustReservedRunData');

        expect(processAgentArtifactsMock).toHaveBeenCalledTimes(1);
        expect(processAgentArtifactsMock).toHaveBeenCalledWith(
            expect.objectContaining({ success: true }),
            undefined,
            undefined,
            contextUser,
            undefined,
        );

        const getOut = (name: string) =>
            params.Params.find((p) => p.Name === name)?.Value;
        expect(getOut('AgentRunID')).toBe('run-vs-101');
        expect(getOut('ArtifactID')).toBe('art-500');
        expect(getOut('ArtifactVersionID')).toBe('ver-501');
        expect(getOut('Status')).toBe('Delivered');
        expect(getOut('VideoFileIDs')).toEqual({
            '16:9': 'file-mp4-16x9',
            '9:16': 'file-mp4-9x16',
        });
        expect(getOut('PosterFileID')).toBe('file-poster-1');
        expect(getOut('HumanReviewNotes')).toBe('AI-generated assets (1): b-roll background.');
    });

    it('returns NEEDS_INPUT with the agent question and creates no artifact when FinalStep is Chat', async () => {
        runAgentMock.mockResolvedValue({
            success: true,
            payload: { Status: 'Blocked' },
            agentRun: {
                ID: 'run-vs-chat',
                FinalStep: 'Chat',
                Message: 'Which fiscal quarter should the revenue comparison cover?',
            },
        });

        const params = {
            Params: [{ Name: 'Topic', Type: 'Input', Value: 'Compare quarterly revenue' }] as Param[],
            ContextUser: { ID: 'user-1' },
        };

        const result = await invokeAction(new ProduceVideoAction(), params);

        expect(result).toMatchObject({
            Success: false,
            ResultCode: 'NEEDS_INPUT',
            Message: 'Which fiscal quarter should the revenue comparison cover?',
        });
        expect(params.Params.find((p) => p.Name === 'AgentRunID')?.Value).toBe('run-vs-chat');
        expect(processAgentArtifactsMock).not.toHaveBeenCalled();
    });

    it('returns RUN_FAILED and creates no artifact when the agent run fails', async () => {
        runAgentMock.mockResolvedValue({
            success: false,
            payload: { Status: 'Failed' },
            agentRun: {
                ID: 'run-vs-fail',
                FinalStep: 'Failed',
                ErrorMessage: 'Render worker timed out after 300s.',
            },
        });

        const params = {
            Params: [{ Name: 'Topic', Type: 'Input', Value: 'Render timeout test' }] as Param[],
            ContextUser: { ID: 'user-1' },
        };

        const result = await invokeAction(new ProduceVideoAction(), params);

        expect(result).toMatchObject({
            Success: false,
            ResultCode: 'RUN_FAILED',
            Message: 'Render worker timed out after 300s.',
        });
        expect(params.Params.find((p) => p.Name === 'AgentRunID')?.Value).toBe('run-vs-fail');
        expect(processAgentArtifactsMock).not.toHaveBeenCalled();
    });
});
