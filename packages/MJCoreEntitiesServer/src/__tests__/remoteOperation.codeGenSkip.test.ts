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
        public GenerationType: 'AI' | 'Manual' | 'Default' = 'AI';
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
function setFieldDirty(entity: MJRemoteOperationEntityServer, name: string, dirty: boolean): void {
    (entity as unknown as MockedBaseStub).SetFieldDirty(name, dirty);
}

/** Sets whether the mocked base counts as already saved (an update) or not (a create). */
function setSaved(entity: MJRemoteOperationEntityServer, saved: boolean): void {
    (entity as unknown as MockedBaseStub).IsSaved = saved;
}


describe('MJRemoteOperationEntityServer Code Generation Skip for Cloned / Pre-populated Ops', () => {
    let op: MJRemoteOperationEntityServer;
    let generateCodeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        op = new MJRemoteOperationEntityServer({} as never, null);
        op.GenerationType = 'AI';
        op.CodeLocked = false;
        op.ForceCodeGeneration = false;
        setFieldDirty(op, 'Description', false);

        generateCodeSpy = vi.spyOn(op, 'GenerateCode').mockResolvedValue({
            Success: true,
            Code: 'generated op code',
            Comments: 'generated op comments',
            Libraries: [],
        });
    });

    it('skips GenerateCode when saving a new AI op that ALREADY HAS code (e.g. cloned op)', async () => {
        setSaved(op, false);
        op.Code = 'return { Success: true, Data: "cloned remote op" };';

        const result = await op.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).not.toHaveBeenCalled();
        expect(op.Code).toBe('return { Success: true, Data: "cloned remote op" };');
    });

    it('invokes GenerateCode when saving a new AI op with EMPTY / NULL code', async () => {
        setSaved(op, false);
        op.Code = null;

        const result = await op.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
        expect(op.Code).toBe('generated op code');
    });

    it('invokes GenerateCode when saving an existing AI op whose Description is dirty', async () => {
        setSaved(op, true);
        op.Code = 'old code';
        setFieldDirty(op, 'Description', true);

        const result = await op.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
        expect(op.Code).toBe('generated op code');
    });

    it('invokes GenerateCode when ForceCodeGeneration is true even if code is present', async () => {
        setSaved(op, false);
        op.Code = 'some existing code';
        op.ForceCodeGeneration = true;

        const result = await op.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).toHaveBeenCalledTimes(1);
    });

    it('skips GenerateCode when GenerationType is not AI', async () => {
        op.GenerationType = 'Manual';
        setSaved(op, false);
        op.Code = null;

        const result = await op.Save();

        expect(result).toBe(true);
        expect(generateCodeSpy).not.toHaveBeenCalled();
    });

    describe('host switch saveTimeAI.CodeGeneration = false', () => {
        afterEach(() => {
            SaveTimeAISettings.Instance.Config = {};
        });

        it('saves a new AI op without calling GenerateCode, keeping its current code', async () => {
            SaveTimeAISettings.Instance.Config = { CodeGeneration: false };
            setSaved(op, false);
            op.Code = null;

            expect(await op.Save()).toBe(true);
            expect(generateCodeSpy).not.toHaveBeenCalled();
            expect(op.Code).toBeNull();
        });

        it('wins over ForceCodeGeneration', async () => {
            SaveTimeAISettings.Instance.Config = { CodeGeneration: false };
            setSaved(op, false);
            op.Code = 'existing';
            op.ForceCodeGeneration = true;

            expect(await op.Save()).toBe(true);
            expect(generateCodeSpy).not.toHaveBeenCalled();
        });
    });
});
