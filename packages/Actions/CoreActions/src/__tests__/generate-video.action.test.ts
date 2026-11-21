import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
    type VideoRunnerResult = {
        Success: boolean;
        ErrorMessage?: string;
        JobID?: string;
        Video?: {
            Data: Buffer;
            MimeType: string;
            DurationSeconds: number;
            Width: number;
            Height: number;
        };
        C2PA?: boolean;
        Cost?: number;
        PromptRunID?: string;
        ModelID?: string;
        ModelName?: string;
        ExecutionTimeMS: number;
    };

    type StoredFileFixture = {
        ID: string;
        Name: string;
        ContentType: string;
        ProviderID: string;
        ObjectKey: string;
        Bytes: Buffer;
        Readable?: boolean;
    };

    return {
        inferenceTypeId: 'VT-INFERENCE-PROVIDER',
        platformKeys: new Map<string, string>(),
        runnerCalls: [] as Array<Record<string, unknown>>,
        respond: ((): VideoRunnerResult => ({
            Success: true,
            ExecutionTimeMS: 120,
        })) as (params: Record<string, unknown>) => VideoRunnerResult,
        engineConfig: vi.fn(),
        models: [] as Array<Record<string, unknown>>,
        vendors: [] as Array<{ ID: string; Name: string }>,
        storedFiles: new Map<string, StoredFileFixture>(),
        uploadCalls: [] as Array<Record<string, unknown>>,
        uploadFileImpl: (async (): Promise<{ FileID: string }> => ({
            FileID: '44444444-4444-4444-8444-444444444444',
        })) as (args: Record<string, unknown>) => Promise<{ FileID: string }>,
        assertAccountAccessCalls: [] as Array<{ accountId: string; mode: string }>,
    };
});

vi.mock('@memberjunction/actions', () => ({
    BaseAction: class BaseAction {},
}));

vi.mock('@memberjunction/actions-base', () => ({}));

vi.mock('@memberjunction/core-entities', () => ({}));

vi.mock('@memberjunction/core', () => ({
    RunView: class RunView {
        public async RunView(params: { ExtraFilter?: string }) {
            const match = params.ExtraFilter?.match(/ID = '([^']+)'/);
            const id = match?.[1];
            const fixture = id ? h.storedFiles.get(id) : undefined;
            if (!fixture) {
                return { Success: true, Results: [] };
            }
            return {
                Success: true,
                Results: [
                    {
                        ID: fixture.ID,
                        Name: fixture.Name,
                        ContentType: fixture.ContentType,
                        ProviderID: fixture.ProviderID,
                    },
                ],
            };
        }
    },
}));

vi.mock('@memberjunction/storage', () => ({
    StorageAccountAccessDeniedError: class StorageAccountAccessDeniedError extends Error {
        constructor() {
            super('Storage account access denied');
        }
    },
    StorageAccessEvaluator: {
        Instance: {
            AssertAccountAccess: async (accountId: string, _user: unknown, mode: string) => {
                h.assertAccountAccessCalls.push({ accountId, mode });
            },
        },
    },
    FileStorageEngine: {
        Instance: {
            Config: vi.fn(async () => undefined),
            ResolveStorageAccount: () => ({ account: { ID: 'acct-default-1' } }),
            GetAccountByName: () => ({ ID: 'acct-named-1' }),
            ResolveFileObject: async (file: { ID: string }) => {
                const fixture = h.storedFiles.get(file.ID);
                if (!fixture || fixture.Readable === false) {
                    throw new Error(`Access denied for file ${file.ID}`);
                }
                return {
                    ObjectKey: fixture.ObjectKey,
                    Driver: {
                        GetObject: async () => fixture.Bytes,
                    },
                };
            },
            UploadFile: async (args: Record<string, unknown>) => {
                h.uploadCalls.push(args);
                return h.uploadFileImpl(args);
            },
        },
    },
}));

vi.mock('@memberjunction/ai', async () => {
    const actual = await vi.importActual<Record<string, unknown>>('@memberjunction/ai');
    return {
        ...actual,
        GetAIAPIKey: (driver: string): string => h.platformKeys.get(driver) ?? '',
    };
});

vi.mock('@memberjunction/ai-engine-base', () => ({
    AIEngineBase: {
        Instance: {
            Config: (...args: unknown[]) => h.engineConfig(...args),
            get Models() {
                return h.models;
            },
            get Vendors() {
                return h.vendors;
            },
            IsInferenceProvider: (mv: { TypeID?: string }) => mv.TypeID === h.inferenceTypeId,
        },
    },
}));

vi.mock('@memberjunction/ai-prompts', () => ({
    AIVideoRunner: class AIVideoRunner {
        public async RunGenerateVideo(params: Record<string, unknown>) {
            h.runnerCalls.push(params);
            return h.respond(params);
        }
    },
}));

import type { ActionResultSimple, RunActionParams, RuntimeAPIKeyResolver } from '@memberjunction/actions-base';
import type { UserInfo } from '@memberjunction/core';
import { GenerateVideoAction } from '../custom/ai/generate-video.action';

class TestableGenerateVideoAction extends GenerateVideoAction {
    public RunForTest(params: RunActionParams): Promise<ActionResultSimple> {
        return this.InternalRunAction(params);
    }
}

const BFL_VENDOR_ID = 'B1AC0F00-0000-4000-8000-00000000F1A5';
const ALT_VENDOR_ID = 'A1700000-0000-4000-8000-000000000001';
const FLUX_MODEL_ID = '6BC01B29-9A0A-490D-A61A-2B95BDCA1F33';
const ALT_MODEL_ID = '7CD02C30-AB1B-4A1E-B72B-3C06CEDB2044';
const PROMPT_RUN_ID = '99999999-9999-4999-8999-999999999999';
const STORED_FILE_ID = '44444444-4444-4444-8444-444444444444';
const REF_IMG_1_ID = '11111111-1111-4111-8111-111111111111';
const KEYFRAME_0_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_VID_ID = '33333333-3333-4333-8333-333333333333';
const UNREADABLE_ID = '55555555-5555-4555-8555-555555555555';

const contextUser = { ID: 'user-1', Name: 'Test User' } as UserInfo;
const clipBytes = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);

function inferenceRow(vendorId: string, driverClass: string, apiName: string, priority = 1): Record<string, unknown> {
    return {
        VendorID: vendorId,
        TypeID: h.inferenceTypeId,
        DriverClass: driverClass,
        APIName: apiName,
        Status: 'Active',
        Priority: priority,
    };
}

function seedModels(): void {
    h.vendors = [
        { ID: BFL_VENDOR_ID, Name: 'Black Forest Labs' },
        { ID: ALT_VENDOR_ID, Name: 'Alt Video Vendor' },
    ];
    h.models = [
        {
            ID: FLUX_MODEL_ID,
            Name: 'FLUX 3',
            APIName: 'flux-3',
            AIModelType: 'Video',
            IsActive: true,
            PowerRank: 15,
            ModelVendors: [inferenceRow(BFL_VENDOR_ID, 'FLUXVideoGenerator', 'flux-3', 1)],
        },
        {
            ID: ALT_MODEL_ID,
            Name: 'Alt Video 1',
            APIName: 'alt-video-1',
            AIModelType: 'Video',
            IsActive: true,
            PowerRank: 8,
            ModelVendors: [inferenceRow(ALT_VENDOR_ID, 'AltVideoGenerator', 'alt-video-1', 1)],
        },
    ];
}

function seedReadableFiles(): void {
    h.storedFiles.clear();
    h.storedFiles.set(REF_IMG_1_ID, {
        ID: REF_IMG_1_ID,
        Name: 'ref-1.png',
        ContentType: 'image/png',
        ProviderID: 'prov-1',
        ObjectKey: 'refs/ref-1.png',
        Bytes: Buffer.from('ref-image-1-bytes'),
        Readable: true,
    });
    h.storedFiles.set(KEYFRAME_0_ID, {
        ID: KEYFRAME_0_ID,
        Name: 'kf-0.jpeg',
        ContentType: 'image/jpeg',
        ProviderID: 'prov-1',
        ObjectKey: 'refs/kf-0.jpeg',
        Bytes: Buffer.from('keyframe-0-bytes'),
        Readable: true,
    });
    h.storedFiles.set(SOURCE_VID_ID, {
        ID: SOURCE_VID_ID,
        Name: 'source.mp4',
        ContentType: 'video/mp4',
        ProviderID: 'prov-1',
        ObjectKey: 'refs/source.mp4',
        Bytes: Buffer.from('source-video-bytes'),
        Readable: true,
    });
    h.storedFiles.set(UNREADABLE_ID, {
        ID: UNREADABLE_ID,
        Name: 'secret.png',
        ContentType: 'image/png',
        ProviderID: 'prov-1',
        ObjectKey: 'refs/secret.png',
        Bytes: Buffer.from('secret-bytes'),
        Readable: false,
    });
}

function successRunnerResult() {
    return {
        Success: true,
        ExecutionTimeMS: 1200,
        JobID: 'bfl-job-42',
        C2PA: true,
        Cost: 0.45,
        PromptRunID: PROMPT_RUN_ID,
        ModelID: FLUX_MODEL_ID,
        ModelName: 'FLUX 3',
        Video: {
            Data: clipBytes,
            MimeType: 'video/mp4',
            DurationSeconds: 6,
            Width: 1920,
            Height: 1080,
        },
    };
}

function paramsFor(
    inputs: Record<string, unknown>,
    resolver?: RuntimeAPIKeyResolver,
    context?: Record<string, unknown>
): RunActionParams {
    return {
        Params: Object.entries(inputs).map(([Name, Value]) => ({ Name, Type: 'Input', Value })),
        ContextUser: contextUser,
        RuntimeAPIKeyResolver: resolver,
        Context: context,
    } as RunActionParams;
}

function outputValue(params: RunActionParams, name: string): unknown {
    return params.Params.find(p => p.Name === name && p.Type === 'Output')?.Value;
}

describe('GenerateVideoAction', () => {
    let action: TestableGenerateVideoAction;

    beforeEach(() => {
        seedModels();
        seedReadableFiles();
        h.runnerCalls.length = 0;
        h.uploadCalls.length = 0;
        h.assertAccountAccessCalls.length = 0;
        h.platformKeys = new Map([
            ['FLUXVideoGenerator', 'platform-bfl-key'],
            ['AltVideoGenerator', 'platform-alt-key'],
        ]);
        h.respond = () => successRunnerResult();
        h.uploadFileImpl = async () => ({ FileID: STORED_FILE_ID });
        action = new TestableGenerateVideoAction();
    });

    it('1. stores generated clip in MJ Storage, sets VIDEO_GENERATED, FileID, Videos[0] with fileId (no data), and full Provenance', async () => {
        const params = paramsFor({
            Prompt: 'Aerial shot over misty pine forest at sunrise',
            DurationSeconds: 6,
            AspectRatio: '16:9',
            Quality: 'high',
        });

        const result = await action.RunForTest(params);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('VIDEO_GENERATED');
        expect(outputValue(params, 'FileID')).toBe(STORED_FILE_ID);
        expect(outputValue(params, 'DurationSeconds')).toBe(6);
        expect(outputValue(params, 'ModelUsed')).toBe('FLUX 3');
        expect(outputValue(params, 'PromptRunID')).toBe(PROMPT_RUN_ID);
        expect(outputValue(params, 'Cost')).toBe(0.45);

        const expectedProvenance = {
            Provenance: 'Generated',
            ModelID: FLUX_MODEL_ID,
            ModelName: 'FLUX 3',
            PromptRunID: PROMPT_RUN_ID,
            JobID: 'bfl-job-42',
            Prompt: 'Aerial shot over misty pine forest at sunrise',
            DurationSeconds: 6,
            C2PA: true,
            Cost: 0.45,
        };
        expect(outputValue(params, 'Provenance')).toEqual(expectedProvenance);

        expect(h.uploadCalls).toHaveLength(1);
        expect(h.uploadCalls[0]).toMatchObject({
            content: clipBytes,
            fileName: 'generated-video-bfl-job-42.mp4',
            mimeType: 'video/mp4',
            contextUser,
            storageAccountId: 'acct-default-1',
            description: `AI-generated video: FLUX 3, AI Prompt Run ${PROMPT_RUN_ID}`,
        });

        const videos = outputValue(params, 'Videos') as Array<Record<string, unknown>>;
        expect(videos).toHaveLength(1);
        expect(videos[0]).toEqual({
            modality: 'Video',
            mimeType: 'video/mp4',
            fileId: STORED_FILE_ID,
            width: 1920,
            height: 1080,
            durationSeconds: 6,
            label: 'generated-video-bfl-job-42.mp4',
            metadata: expectedProvenance,
        });
        expect(videos[0].data).toBeUndefined();
        expect(result.Message).not.toContain(clipBytes.toString('base64'));
    });

    it('2. falls back to VIDEO_GENERATED_INLINE with base64 clip in Videos[0].data and no FileID when storage throws', async () => {
        h.uploadFileImpl = async () => {
            throw new Error('No file storage accounts configured');
        };
        const params = paramsFor({ Prompt: 'Ocean waves crashing on basalt cliffs' });

        const result = await action.RunForTest(params);

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('VIDEO_GENERATED_INLINE');
        expect(outputValue(params, 'FileID')).toBeUndefined();

        const videos = outputValue(params, 'Videos') as Array<Record<string, unknown>>;
        expect(videos).toHaveLength(1);
        expect(videos[0].data).toBe(clipBytes.toString('base64'));
        expect(videos[0].fileId).toBeUndefined();
        expect(videos[0].modality).toBe('Video');
        expect(videos[0].mimeType).toBe('video/mp4');

        const parsedMsg = JSON.parse(result.Message ?? '{}');
        expect(parsedMsg.inline).toBe(true);
        expect(parsedMsg.storageError).toContain('No file storage accounts configured');
        expect(result.Message).not.toContain(clipBytes.toString('base64'));
    });

    it('3. rejects missing prompt, invalid Mode/Quality/DurationSeconds/AspectRatio, and malformed Keyframes before any runner call', async () => {
        const missingPrompt = await action.RunForTest(paramsFor({}));
        expect(missingPrompt.Success).toBe(false);
        expect(missingPrompt.ResultCode).toBe('MISSING_PROMPT');

        const badMode = await action.RunForTest(paramsFor({ Prompt: 'x', Mode: 'PanAndZoom' }));
        expect(badMode.ResultCode).toBe('INVALID_PARAMS');

        const badQuality = await action.RunForTest(paramsFor({ Prompt: 'x', Quality: 'ultra-hd' }));
        expect(badQuality.ResultCode).toBe('INVALID_PARAMS');

        const badDurationZero = await action.RunForTest(paramsFor({ Prompt: 'x', DurationSeconds: 0 }));
        expect(badDurationZero.ResultCode).toBe('INVALID_PARAMS');

        const badDurationNan = await action.RunForTest(paramsFor({ Prompt: 'x', DurationSeconds: 'five' }));
        expect(badDurationNan.ResultCode).toBe('INVALID_PARAMS');

        const badAspect = await action.RunForTest(paramsFor({ Prompt: 'x', AspectRatio: 'wide' }));
        expect(badAspect.ResultCode).toBe('INVALID_PARAMS');

        const malformedKeyframesJson = await action.RunForTest(
            paramsFor({ Prompt: 'x', Keyframes: '[{not valid json' })
        );
        expect(malformedKeyframesJson.ResultCode).toBe('INVALID_PARAMS');

        const badKeyframeShape = await action.RunForTest(
            paramsFor({ Prompt: 'x', Keyframes: JSON.stringify([{ Seconds: -1, FileID: KEYFRAME_0_ID }]) })
        );
        expect(badKeyframeShape.ResultCode).toBe('INVALID_PARAMS');

        expect(h.runnerCalls).toHaveLength(0);
    });

    it('4. returns REFERENCE_NOT_READABLE with no runner call when a reference cannot be read, and forwards readable references & keyframes as MediaInputs', async () => {
        const unreadableRef = await action.RunForTest(
            paramsFor({
                Prompt: 'Animate reference',
                Mode: 'ImageToVideo',
                ReferenceImageFileIDs: [UNREADABLE_ID],
            })
        );
        expect(unreadableRef.Success).toBe(false);
        expect(unreadableRef.ResultCode).toBe('REFERENCE_NOT_READABLE');
        expect(h.runnerCalls).toHaveLength(0);

        const unreadableKeyframe = await action.RunForTest(
            paramsFor({
                Prompt: 'Animate keyframe',
                Mode: 'ImageToVideo',
                Keyframes: JSON.stringify([{ Seconds: 0, FileID: UNREADABLE_ID }]),
            })
        );
        expect(unreadableKeyframe.ResultCode).toBe('REFERENCE_NOT_READABLE');
        expect(h.runnerCalls).toHaveLength(0);

        const readable = await action.RunForTest(
            paramsFor({
                Prompt: 'Continue clip toward the horizon',
                Mode: 'Continuation',
                ReferenceImageFileIDs: [REF_IMG_1_ID],
                Keyframes: JSON.stringify([{ Seconds: 2.5, FileID: KEYFRAME_0_ID }]),
                SourceVideoFileID: SOURCE_VID_ID,
            })
        );
        expect(readable.Success).toBe(true);
        expect(readable.ResultCode).toBe('VIDEO_GENERATED');
        expect(h.runnerCalls).toHaveLength(1);
        expect(h.runnerCalls[0].ReferenceImages).toEqual([
            { Data: Buffer.from('ref-image-1-bytes'), MimeType: 'image/png' },
        ]);
        expect(h.runnerCalls[0].Keyframes).toEqual([
            { Seconds: 2.5, Image: { Data: Buffer.from('keyframe-0-bytes'), MimeType: 'image/jpeg' } },
        ]);
        expect(h.runnerCalls[0].SourceVideo).toEqual({
            Data: Buffer.from('source-video-bytes'),
            MimeType: 'video/mp4',
        });
    });

    it('5. pins ModelID when Model is provided, rejects unknown Model as INVALID_PARAMS, and forwards CredentialScope, AgentID, and RuntimeOnly keys', async () => {
        const unknownModel = await action.RunForTest(
            paramsFor({ Prompt: 'x', Model: 'NonExistentVideoModel' })
        );
        expect(unknownModel.Success).toBe(false);
        expect(unknownModel.ResultCode).toBe('INVALID_PARAMS');
        expect(h.runnerCalls).toHaveLength(0);

        const resolver: RuntimeAPIKeyResolver = driverClass =>
            driverClass === 'FLUXVideoGenerator' ? 'runtime-bfl-key' : undefined;

        const pinnedRun = await action.RunForTest({
            ...paramsFor({ Prompt: 'x', Model: 'flux-3' }, resolver, { AgentID: 'agent-video-1' }),
            CredentialScope: 'RuntimeOnly',
        });

        expect(pinnedRun.Success).toBe(true);
        expect(h.runnerCalls).toHaveLength(1);
        expect(h.runnerCalls[0].ModelID).toBe(FLUX_MODEL_ID);
        expect(h.runnerCalls[0].AgentID).toBe('agent-video-1');
        expect(h.runnerCalls[0].CredentialScope).toBe('RuntimeOnly');
        expect(h.runnerCalls[0].APIKeys).toEqual([
            { driverClass: 'FLUXVideoGenerator', apiKey: 'runtime-bfl-key' },
        ]);

        // Unpinned under RuntimeOnly: only the driver class resolved by the runtime resolver is collected
        await action.RunForTest({
            ...paramsFor({ Prompt: 'x' }, resolver),
            CredentialScope: 'RuntimeOnly',
        });
        expect(h.runnerCalls[1].ModelID).toBeUndefined();
        expect(h.runnerCalls[1].APIKeys).toEqual([
            { driverClass: 'FLUXVideoGenerator', apiKey: 'runtime-bfl-key' },
        ]);
    });

    it('6. maps runner failure to GENERATION_FAILED with the runner message and never puts clip bytes in Message', async () => {
        h.respond = () => ({
            Success: false,
            ErrorMessage: 'FLUX 3 rejected request: unsupported aspect ratio 32:9',
            ExecutionTimeMS: 45,
        });

        const failed = await action.RunForTest(paramsFor({ Prompt: 'x' }));

        expect(failed).toEqual({
            Success: false,
            ResultCode: 'GENERATION_FAILED',
            Message: 'Video generation failed: FLUX 3 rejected request: unsupported aspect ratio 32:9',
        });
        expect(h.uploadCalls).toHaveLength(0);
    });
});
