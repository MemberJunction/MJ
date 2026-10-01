import { describe, it, expect, vi, beforeEach } from 'vitest';

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

describe('MJActionEntityServer Code Generation Skip for Cloned / Pre-populated Actions', () => {
    let action: MJActionEntityServer;
    let generateCodeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        action = new MJActionEntityServer({} as never, null);
        action.Type = 'Generated';
        action.CodeLocked = false;
        action.ForceCodeGeneration = false;
        (action as unknown as { SetFieldDirty: (n: string, d: boolean) => void }).SetFieldDirty('UserPrompt', false);

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
        vi.spyOn(action, 'PostSaveProcessLibraries' as never).mockResolvedValue(undefined as never);
        vi.spyOn(action, 'PostSaveProcessParamsAndResults' as never).mockResolvedValue(undefined as never);
    });

    it('skips GenerateCode when saving a new action that ALREADY HAS code (e.g. cloned action)', async () => {
        action.IsSaved = false;
        action.Code = 'return { Success: true, Data: "cloned pre-existing code" };';

        const result = await action.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).not.toHaveBeenCalled();
        expect(action.Code).toBe('return { Success: true, Data: "cloned pre-existing code" };');
    });

    it('invokes GenerateCode when saving a new action with EMPTY / NULL code', async () => {
        action.IsSaved = false;
        action.Code = null;

        const result = await action.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
        expect(action.Code).toBe('generated code');
    });

    it('invokes GenerateCode when saving an existing action whose UserPrompt is dirty', async () => {
        action.IsSaved = true;
        action.Code = 'old code';
        (action as unknown as { SetFieldDirty: (n: string, d: boolean) => void }).SetFieldDirty('UserPrompt', true);

        const result = await action.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
        expect(action.Code).toBe('generated code');
    });

    it('invokes GenerateCode when ForceCodeGeneration is true even if code is present', async () => {
        action.IsSaved = false;
        action.Code = 'some existing code';
        action.ForceCodeGeneration = true;

        const result = await action.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
    });
});
