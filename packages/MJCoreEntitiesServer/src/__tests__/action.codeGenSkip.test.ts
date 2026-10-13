import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    class MockMetadata {
        public get ProviderType() {
            return 'Database';
        }
    }
    return {
        ...actual,
        Metadata: MockMetadata,
    };
});

interface StubField {
    Name: string;
    Dirty: boolean;
}

vi.mock('@memberjunction/actions-base', () => {
    class MockActionEntityExtended {
        public ID = 'act-1';
        public Name = 'Test Action';
        public Type: 'Generated' | 'Custom' = 'Generated';
        public CodeLocked = false;
        public IsSaved = false;
        public Code: string | null = null;
        public CodeComments: string | null = null;
        public CodeApprovalStatus: string | null = null;
        public CodeApprovedAt: Date | null = null;
        public CodeApprovedByUserID: string | null = null;
        public ContextCurrentUser = null;
        public ProviderToUse = {
            BeginTransaction: vi.fn().mockResolvedValue(true),
            CommitTransaction: vi.fn().mockResolvedValue(true),
            RollbackTransaction: vi.fn().mockResolvedValue(true),
        };
        public RunViewProviderToUse = {
            RunView: vi.fn().mockResolvedValue({ Success: true, Results: [] }),
        };

        protected fields = new Map<string, StubField>([
            ['UserPrompt', { Name: 'UserPrompt', Dirty: false }],
        ]);

        public GetFieldByName(name: string): StubField | undefined {
            return this.fields.get(name);
        }

        public SetFieldDirty(name: string, dirty: boolean): void {
            this.fields.set(name, { Name: name, Dirty: dirty });
        }

        public async Save(): Promise<boolean> {
            return true;
        }

        public async PostSaveProcessLibraries(): Promise<void> {}
        public async PostSaveProcessParamsAndResults(): Promise<void> {}
    }

    return {
        MJActionEntityExtended: MockActionEntityExtended,
        ActionEngineBase: {
            Instance: {
                Config: vi.fn().mockResolvedValue(true),
            },
        },
    };
});

vi.mock('@memberjunction/doc-utils', () => ({
    DocumentationEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(true),
        },
    },
}));

import { MJActionEntityServer } from '../custom/MJActionEntityServer.server';
import { SaveTimeAISettings } from '@memberjunction/ai';

/**
 * The mocked base class's test-only surface: it records field dirtiness through SetFieldDirty and holds IsSaved as a
 * plain field. The server class's type declares neither (IsSaved is a read-only getter on the real BaseEntity).
 */
interface MockedBaseStub {
    SetFieldDirty(name: string, dirty: boolean): void;
    IsSaved: boolean;
}

/** Marks a field dirty (or clean) on the mocked base. */
function setFieldDirty(entity: MJActionEntityServer, name: string, dirty: boolean): void {
    (entity as unknown as MockedBaseStub).SetFieldDirty(name, dirty);
}

/** The mocked base's post-save helpers (protected on the real base class), stubbed so a save has no dependencies. */
interface PostSaveStub {
    PostSaveProcessLibraries(): Promise<void>;
    PostSaveProcessParamsAndResults(): Promise<void>;
}

/** Sets whether the mocked base counts as already saved (an update) or not (a create). */
function setSaved(entity: MJActionEntityServer, saved: boolean): void {
    (entity as unknown as MockedBaseStub).IsSaved = saved;
}


describe('MJActionEntityServer Code Generation Skip for Cloned / Pre-populated Actions', () => {
    let action: MJActionEntityServer;
    let generateCodeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        action = new MJActionEntityServer({} as never, null);
        action.Type = 'Generated';
        action.CodeLocked = false;
        action.ForceCodeGeneration = false;
        setFieldDirty(action, 'UserPrompt', false);

        // Spy on GenerateCode and provide stub return
        generateCodeSpy = vi.spyOn(action, 'GenerateCode').mockResolvedValue({
            Success: true,
            Code: 'generated code',
            Comments: 'generated comments',
            LibrariesUsed: [],
            Parameters: [],
            ResultCodes: [],
        });

        // Mock post-save helpers to avoid dependencies
        const postSave = action as unknown as PostSaveStub;
        vi.spyOn(postSave, 'PostSaveProcessLibraries').mockResolvedValue(undefined);
        vi.spyOn(postSave, 'PostSaveProcessParamsAndResults').mockResolvedValue(undefined);
    });

    it('skips GenerateCode when saving a new action that ALREADY HAS code (e.g. cloned action)', async () => {
        setSaved(action, false);
        action.Code = 'return { Success: true, Data: "cloned pre-existing code" };';

        const result = await action.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).not.toHaveBeenCalled();
        expect(action.Code).toBe('return { Success: true, Data: "cloned pre-existing code" };');
    });

    it('invokes GenerateCode when saving a new action with EMPTY / NULL code', async () => {
        setSaved(action, false);
        action.Code = null;

        const result = await action.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
        expect(action.Code).toBe('generated code');
    });

    it('invokes GenerateCode when saving an existing action whose UserPrompt is dirty', async () => {
        setSaved(action, true);
        action.Code = 'old code';
        setFieldDirty(action, 'UserPrompt', true);

        const result = await action.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
        expect(action.Code).toBe('generated code');
    });

    it('invokes GenerateCode when ForceCodeGeneration is true even if code is present', async () => {
        setSaved(action, false);
        action.Code = 'some existing code';
        action.ForceCodeGeneration = true;

        const result = await action.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
    });

    describe('host switch saveTimeAI.CodeGeneration = false', () => {
        afterEach(() => {
            SaveTimeAISettings.Instance.Config = {};
        });

        it('saves a new Generated action without calling GenerateCode, keeping its current code', async () => {
            SaveTimeAISettings.Instance.Config = { CodeGeneration: false };
            setSaved(action, false);
            action.Code = null;

            const result = await action.Save();

            expect(result).toBe(true);
            expect(generateCodeSpy).not.toHaveBeenCalled();
            expect(action.Code).toBeNull();
        });

        it('wins over ForceCodeGeneration and a dirty UserPrompt', async () => {
            SaveTimeAISettings.Instance.Config = { CodeGeneration: false };
            setSaved(action, true);
            action.Code = 'old code';
            action.ForceCodeGeneration = true;
            setFieldDirty(action, 'UserPrompt', true);

            expect(await action.Save()).toBe(true);
            expect(generateCodeSpy).not.toHaveBeenCalled();
            expect(action.Code).toBe('old code');
        });

        it('another kind switched off still generates', async () => {
            SaveTimeAISettings.Instance.Config = { QueryParameters: false, ViewSmartFilters: false };
            setSaved(action, false);
            action.Code = null;

            expect(await action.Save()).toBe(true);
            expect(generateCodeSpy).toHaveBeenCalledTimes(1);
        });
    });
});
