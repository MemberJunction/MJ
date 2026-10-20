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

vi.mock('@memberjunction/aiengine', () => ({
    AIEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(true),
        },
    },
}));

vi.mock('@memberjunction/doc-utils', () => ({
    DocumentationEngine: {
        Instance: {
            Config: vi.fn().mockResolvedValue(true),
        },
    },
}));

interface StubField {
    Name: string;
    Dirty: boolean;
}

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    class StubRemoteOperationEntity {
        public ID = 'ro-1';
        public Name = 'Test Op';
        public GenerationType: 'AI' | 'Standard' = 'AI';
        public CodeLocked = false;
        public IsSaved = false;
        public Code: string | null = null;
        public CodeComments: string | null = null;
        public CodeApprovalStatus: string | null = null;
        public LibrariesObject: unknown = null;
        public ContextCurrentUser = null;
        public ProviderToUse = {
            BeginTransaction: vi.fn().mockResolvedValue(true),
            CommitTransaction: vi.fn().mockResolvedValue(true),
            RollbackTransaction: vi.fn().mockResolvedValue(true),
        };

        protected fields = new Map<string, StubField>([
            ['Description', { Name: 'Description', Dirty: false }],
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
    }

    return {
        ...actual,
        MJRemoteOperationEntity: StubRemoteOperationEntity,
    };
});

import { MJRemoteOperationEntityServer } from '../custom/MJRemoteOperationEntityServer.server';

describe('MJRemoteOperationEntityServer Code Generation Skip for Cloned / Pre-populated Ops', () => {
    let op: MJRemoteOperationEntityServer;
    let generateCodeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        op = new MJRemoteOperationEntityServer({} as never, null);
        op.GenerationType = 'AI';
        op.CodeLocked = false;
        op.ForceCodeGeneration = false;
        (op as unknown as { SetFieldDirty: (n: string, d: boolean) => void }).SetFieldDirty('Description', false);

        generateCodeSpy = vi.spyOn(op as unknown as { GenerateCode: () => Promise<unknown> }, 'GenerateCode').mockResolvedValue({
            Success: true,
            Code: 'generated op code',
            Comments: 'generated op comments',
            Libraries: [],
        });
    });

    it('skips GenerateCode when saving a new AI op that ALREADY HAS code (e.g. cloned op)', async () => {
        op.IsSaved = false;
        op.Code = 'return { Success: true, Data: "cloned remote op" };';

        const result = await op.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).not.toHaveBeenCalled();
        expect(op.Code).toBe('return { Success: true, Data: "cloned remote op" };');
    });

    it('invokes GenerateCode when saving a new AI op with EMPTY / NULL code', async () => {
        op.IsSaved = false;
        op.Code = null;

        const result = await op.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
        expect(op.Code).toBe('generated op code');
    });

    it('invokes GenerateCode when saving an existing AI op whose Description is dirty', async () => {
        op.IsSaved = true;
        op.Code = 'old code';
        (op as unknown as { SetFieldDirty: (n: string, d: boolean) => void }).SetFieldDirty('Description', true);

        const result = await op.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
        expect(op.Code).toBe('generated op code');
    });

    it('invokes GenerateCode when ForceCodeGeneration is true even if code is present', async () => {
        op.IsSaved = false;
        op.Code = 'some existing code';
        op.ForceCodeGeneration = true;

        const result = await op.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
    });

    it('skips GenerateCode when GenerationType is not AI', async () => {
        op.GenerationType = 'Standard';
        op.IsSaved = false;
        op.Code = null;

        const result = await op.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).not.toHaveBeenCalled();
    });
});
